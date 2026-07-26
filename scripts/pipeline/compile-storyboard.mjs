#!/usr/bin/env node
/**
 * compile-storyboard.mjs — S6 콘티→EditorProject 컴파일러 (Danbi 파이프라인, 4대 결손 ①)
 *
 * 입력: DanbiVault 02-storyboard.md + 03-assets.md (+01-script.md 참고) + 미디어 반입 매핑
 * 출력: project-schema 검증을 통과한 EditorProject JSON → /api/editor/projects 저장 → preflight
 *
 * 계약: docs/workflows/stages/06_EDITING_WORKFLOW_KR.md §2 (입출력·트랙 배치·§2.1a 어휘)
 * 의존: API/스키마 계약 수준만 (src 수정 없음 — project-schema.ts를 esbuild로 번들해 검증기로 사용)
 *
 * 사용:
 *   node scripts/pipeline/compile-storyboard.mjs \
 *     --storyboard <02-storyboard.md> --assets <03-assets.md> --script <01-script.md> \
 *     [--workdir <dir>] [--api http://localhost:3000] [--steps import,compile,save,preflight]
 *
 * 배치 규칙 (S6 §4.1):
 *  - 컷 duration: TTS 실측이 시간을 지배 — 장면별 (실측+휴지)/계획 비율로 duration_plan 스케일.
 *    장면 간 0.3s 휴지, 최종 컷 뒤 1.0s 엔딩 마진(S2 전체 여백).
 *  - V1: 컷 20개 순서 배치. I2V 컷은 [채택 정지 이미지 → I2V 클립(0.5× 슬로우, 최대 ~10.12s)]로
 *    분할 — I2V 첫 프레임 = 입력 정지 이미지이므로 정지→I2V 접합점이 프레임 매치(자연 분할점).
 *  - V2(text): 콘티 subtitle 중 타이틀 카드(CUT-02)만 Title style 텍스트 클립.
 *    나머지 자막은 captions[](캡션 체계, 세그먼트 수준 타이밍 — word-level 후속).
 *  - A1: TTS 세그먼트 순서·장면 경계대로 연속 배치(장면 내 연속, 장면 간 0.3s 휴지).
 *  - A2: BGM을 챕터 구간 오프셋에 배치, CUT-13 구간 공백. 트랙 volumeDb -14dB.
 *  - 전환: §2.1a 사전 → 스키마 타입 매핑(dissolve→crossfade). ai-morph는 이번 사이클
 *    crossfade 폴백(+todo 마커).
 *  - 마커: 챕터 5개 kind:chapter(제목 포함 — 유튜브 챕터 직결) + 검수 포인트 kind:todo.
 */

import { readFile, writeFile, mkdir, copyFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const SCHEMA_ENTRY = path.join(REPO_ROOT, 'src', 'electron', 'shared', 'project-schema.ts');

const SCENE_PAUSE_SECONDS = 0.3;
const ENDING_MARGIN_SECONDS = 1.0;
const I2V_SPEED = 0.5;               // 16fps 소스 슬로우 (5.06s → 10.12s 타임라인)
const BGM_TRACK_GAIN_DB = -14;       // 나레이션 대비 BGM 게인 (트랙 volumeDb 지원 확인됨)
const PROJECT_FPS = 30;
const PROJECT_WIDTH = 1920;
const PROJECT_HEIGHT = 1080;
const ROUND = 3;                     // 초 단위 소수 자릿수

// §2.1a 전환 어휘 → 스키마 TimelineTransition.type 매핑
const TRANSITION_MAP = {
  cut: null, // 전환 없음
  dissolve: { type: 'crossfade', duration: 0.6 },
  dip: { type: 'dip', duration: 0.5 },
  push: { type: 'push', duration: 0.6 },
  wipe: { type: 'wipe', duration: 0.6 },
  'ai-morph': { type: 'crossfade', duration: 0.8, fallback: true }, // 이번 사이클 폴백
};

const CAPTION_STYLES = {
  'caption-default': {
    fontSize: 48, fontColor: '#ffffff',
    boxEnabled: true, boxColor: '#000000', boxOpacity: 0.55,
    shadowEnabled: true, shadowColor: '#000000', shadowOpacity: 0.65, shadowOffset: 2,
    position: 'bottom', align: 'center',
  },
  'caption-emphasis': {
    fontSize: 64, fontColor: '#f5e9c8',
    boxEnabled: true, boxColor: '#000000', boxOpacity: 0.45,
    shadowEnabled: true, shadowColor: '#000000', shadowOpacity: 0.7, shadowOffset: 3,
    position: 'bottom', align: 'center',
  },
};

const TITLE_CARD_STYLE = {
  fontSize: 84, fontColor: '#f5e9c8',
  boxEnabled: false, boxColor: '#000000', boxOpacity: 0,
  shadowEnabled: true, shadowColor: '#000000', shadowOpacity: 0.8, shadowOffset: 3,
  position: 'middle', align: 'center',
};

const CHAPTER_COLORS = ['#22c55e', '#38bdf8', '#a78bfa', '#f59e0b', '#f43f5e'];

function parseArgs(argv) {
  const args = { api: 'http://localhost:3000', steps: 'import,compile,save,preflight' };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith('--')) {
      args[key.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  for (const required of ['storyboard', 'assets', 'script']) {
    if (!args[required]) {
      throw new Error(`--${required} <path> is required`);
    }
  }
  return args;
}

const round = (value) => Number(value.toFixed(ROUND));

// ---------------------------------------------------------------------------
// 1. 입력 파싱
// ---------------------------------------------------------------------------

function parseAssetsDoc(markdown) {
  const productionId = markdown.match(/^production_id:\s*(\S+)/m)?.[1];
  if (!productionId) throw new Error('03-assets.md: production_id not found');

  const images = new Map(); // cutNo -> { assetId, path }
  const tts = [];
  const bgm = [];
  const i2v = new Map(); // cutNo -> { assetId, path, duration }

  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    // | asset_id | type | cut_id | path | duration_sec | slot | seed | job | 결과 | 채택 |
    if (cells.length < 11) continue;
    const [, assetId, type, cutId, filePath, durationSec, , , , , adopted] = cells;
    if (!['image', 'tts', 'bgm', 'i2v'].includes(type)) continue;

    if (type === 'image') {
      if (!assetId.startsWith('CUT-') || !adopted.includes('채택')) continue;
      const cutNo = Number(assetId.match(/^CUT-(\d+)/)[1]);
      if (images.has(cutNo)) {
        throw new Error(`03-assets.md: cut ${cutNo} has multiple adopted images (${images.get(cutNo).assetId}, ${assetId})`);
      }
      images.set(cutNo, { assetId, path: filePath });
    } else if (type === 'tts') {
      const match = assetId.match(/^N(\d{2})-(\d{2})-(.+)$/);
      if (!match) throw new Error(`03-assets.md: unexpected tts asset_id ${assetId}`);
      tts.push({
        assetId,
        scene: Number(match[1]),
        order: Number(match[2]),
        speaker: match[3],
        path: filePath,
        duration: Number(durationSec),
      });
    } else if (type === 'bgm') {
      const range = cutId.match(/^CUT-(\d+)(?:~(\d+))?$/);
      if (!range) throw new Error(`03-assets.md: unexpected bgm cut range ${cutId}`);
      bgm.push({
        assetId,
        path: filePath,
        duration: Number(durationSec),
        cutStart: Number(range[1]),
        cutEnd: Number(range[2] ?? range[1]),
      });
    } else if (type === 'i2v') {
      const cutNo = Number(cutId.match(/^CUT-(\d+)/)[1]);
      i2v.set(cutNo, { assetId, path: filePath, duration: Number(durationSec) });
    }
  }

  tts.sort((a, b) => (a.scene - b.scene) || (a.order - b.order));
  return { productionId, images, tts, bgm, i2v };
}

function parseStoryboard(markdown) {
  const cuts = [];
  const sections = markdown.split(/^### (CUT-\d{2})\s*$/m);
  for (let i = 1; i < sections.length; i += 2) {
    const id = sections[i];
    const body = sections[i + 1];
    const no = Number(id.slice(4));
    const field = (name) => body.match(new RegExp(`^- \\*\\*${name}\\*\\*:\\s*(.+)$`, 'm'))?.[1]?.trim();

    const durationPlan = Number(field('duration_seconds')?.match(/^([\d.]+)/)?.[1]);
    const scene = Number(field('narration_ref')?.match(/^N(\d{2})/)?.[1]);
    const transitionRaw = field('transition')?.match(/^([a-z-]+)/)?.[1];
    const chapterRaw = field('chapter');
    const chapter = chapterRaw && chapterRaw !== '—' ? chapterRaw : undefined;
    const motion = field('motion') ?? '';
    const subtitleRaw = field('subtitle') ?? '—';
    let subtitle;
    if (subtitleRaw !== '—') {
      const match = subtitleRaw.match(/^(caption-default|caption-emphasis)\s*—\s*"([^"]+)"/);
      if (!match) throw new Error(`${id}: subtitle field outside §2.1a vocabulary: ${subtitleRaw}`);
      subtitle = { style: match[1], text: match[2] };
    }

    if (!Number.isFinite(durationPlan) || !Number.isFinite(scene)) {
      throw new Error(`${id}: duration_seconds/narration_ref parse failure`);
    }
    if (!(transitionRaw in TRANSITION_MAP)) {
      throw new Error(`${id}: transition "${transitionRaw}" outside §2.1a vocabulary — blocked`);
    }

    cuts.push({
      id, no, durationPlan, scene, transition: transitionRaw, chapter, subtitle,
      isI2V: /^I2V/i.test(motion),
      zoomOut: /(zoom-out|pull-back)/i.test(motion),
    });
  }
  cuts.sort((a, b) => a.no - b.no);
  if (cuts.length === 0) throw new Error('02-storyboard.md: no cut sections found');
  return cuts;
}

// ---------------------------------------------------------------------------
// 2. 미디어 반입 (POST /api/editor/media) — 멱등: 기존 매핑 항목은 재반입 생략
// ---------------------------------------------------------------------------

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
};

async function importMedia(apiBase, assetsDoc, mappingPath) {
  const mapping = existsSync(mappingPath)
    ? JSON.parse(await readFile(mappingPath, 'utf8'))
    : {};

  const jobs = [];
  for (const [cutNo, image] of assetsDoc.images) {
    jobs.push({ key: image.assetId, path: image.path, note: `image cut ${cutNo}` });
  }
  for (const seg of assetsDoc.tts) jobs.push({ key: seg.assetId, path: seg.path, note: 'tts' });
  for (const track of assetsDoc.bgm) jobs.push({ key: track.assetId, path: track.path, note: 'bgm' });
  for (const clip of assetsDoc.i2v.values()) jobs.push({ key: clip.assetId, path: clip.path, note: 'i2v' });

  // Next.js request.formData()는 대용량 본문 파싱에 실패(관측: ≥14MB → "Failed to parse
  // body as FormData."). 대용량은 서버가 하는 일과 동일하게 imports 디렉터리로 복사한 뒤
  // /api/editor/media-cache(filePath 기반 — ffprobe 분석 + 캐시 잡)로 등록하는 폴백을 쓴다.
  const LARGE_UPLOAD_BYTES = 8 * 1024 * 1024;
  const importDir = path.join(REPO_ROOT, '.danbi', 'imports');

  let imported = 0;
  for (const job of jobs) {
    if (mapping[job.key]?.renderPath) continue; // 멱등
    if (!existsSync(job.path)) throw new Error(`media file missing: ${job.path} (${job.key})`);

    const filename = path.basename(job.path);
    const mimeType = MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
    const { size } = await stat(job.path);

    let entry;
    if (size <= LARGE_UPLOAD_BYTES) {
      const bytes = await readFile(job.path);
      const form = new FormData();
      form.append('files', new Blob([bytes], { type: mimeType }), filename);

      const response = await fetch(`${apiBase}/api/editor/media`, { method: 'POST', body: form });
      if (!response.ok) {
        throw new Error(`media import failed for ${job.key}: HTTP ${response.status} ${await response.text()}`);
      }
      const file = (await response.json()).files?.[0];
      if (!file?.renderPath) throw new Error(`media import for ${job.key}: no renderPath in response`);
      entry = {
        originalPath: job.path,
        originalName: file.originalName,
        importedName: file.name,
        source: file.source,
        renderPath: file.renderPath,
        duration: file.duration,
        width: file.width,
        height: file.height,
        fps: file.fps,
        mimeType: file.mimeType,
        via: 'upload',
      };
    } else {
      entry = await importLargeFileByPath(apiBase, importDir, job, filename, mimeType);
    }

    mapping[job.key] = entry;
    imported += 1;
    console.log(`  imported ${job.key} (${entry.via}) → ${entry.renderPath}`);
    await writeFile(mappingPath, JSON.stringify(mapping, null, 2)); // 진행 중 저장(재실행 안전)
  }

  console.log(`media import: ${imported} new / ${jobs.length - imported} reused (mapping: ${mappingPath})`);
  return mapping;
}

async function importLargeFileByPath(apiBase, importDir, job, filename, mimeType) {
  await mkdir(importDir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const importedName = `${Date.now()}-0-${safeName}`;
  const importedPath = path.join(importDir, importedName);
  await copyFile(job.path, importedPath);
  const source = `/imports/${importedName}`;

  const response = await fetch(`${apiBase}/api/editor/media-cache`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filePath: importedPath, source, mimeType, originalName: filename }),
  });
  if (!response.ok) {
    throw new Error(`media-cache import failed for ${job.key}: HTTP ${response.status} ${await response.text()}`);
  }
  const cacheJob = (await response.json()).job;
  const analysis = cacheJob?.input?.analysis ?? {};

  return {
    originalPath: job.path,
    originalName: filename,
    importedName,
    source,
    renderPath: importedPath,
    duration: analysis.duration,
    width: analysis.width,
    height: analysis.height,
    fps: analysis.fps,
    mimeType,
    via: 'copy+media-cache',
  };
}

// ---------------------------------------------------------------------------
// 3. 컴파일
// ---------------------------------------------------------------------------

function computeTimeline(cuts, ttsSegments) {
  // 장면별 TTS 실측 합계
  const sceneAudio = new Map();
  for (const seg of ttsSegments) {
    sceneAudio.set(seg.scene, (sceneAudio.get(seg.scene) ?? 0) + seg.duration);
  }
  const scenes = [...sceneAudio.keys()].sort((a, b) => a - b);
  const lastScene = scenes[scenes.length - 1];

  // 장면별 계획 합계
  const scenePlan = new Map();
  for (const cut of cuts) {
    scenePlan.set(cut.scene, (scenePlan.get(cut.scene) ?? 0) + cut.durationPlan);
  }

  // 장면 비디오 스팬 = TTS 실측 + (마지막 장면: 엔딩 마진 / 그 외: 장면 간 휴지)
  const sceneSpan = new Map();
  for (const scene of scenes) {
    const tail = scene === lastScene ? ENDING_MARGIN_SECONDS : SCENE_PAUSE_SECONDS;
    sceneSpan.set(scene, sceneAudio.get(scene) + tail);
  }

  // 장면 시작 시각 (누적)
  const sceneStart = new Map();
  let cursor = 0;
  for (const scene of scenes) {
    sceneStart.set(scene, round(cursor));
    cursor += sceneSpan.get(scene);
  }
  const totalDuration = round(cursor);

  // 컷 경계: 장면 내 누적 계획 비율로 산출(드리프트 방지 — 마지막 컷이 장면 끝에 정확히 닿음)
  const placedCuts = [];
  for (const scene of scenes) {
    const sceneCuts = cuts.filter((cut) => cut.scene === scene);
    const planSum = scenePlan.get(scene);
    const start = sceneStart.get(scene);
    const span = sceneSpan.get(scene);
    let cumPlan = 0;
    let prevBoundary = start;
    for (const cut of sceneCuts) {
      cumPlan += cut.durationPlan;
      const boundary = round(start + (span * cumPlan) / planSum);
      placedCuts.push({ ...cut, start: prevBoundary, duration: round(boundary - prevBoundary), end: boundary });
      prevBoundary = boundary;
    }
  }

  // A1 세그먼트 배치: 장면 시작에서 연속
  const placedTts = [];
  for (const scene of scenes) {
    let at = sceneStart.get(scene);
    for (const seg of ttsSegments.filter((item) => item.scene === scene)) {
      placedTts.push({ ...seg, start: round(at) });
      at += seg.duration;
    }
  }

  return { placedCuts, placedTts, sceneStart, sceneSpan, sceneAudio, totalDuration, scenes };
}

function buildProject({ productionId, projectName, cuts, timeline, assetsDoc, mapping }) {
  const { placedCuts, placedTts, totalDuration } = timeline;
  const nowIso = new Date().toISOString();
  const decisions = [];

  const assets = [];
  const assetIdOf = new Map(); // mapping key -> editor asset id
  const pushMediaAsset = (key, kind, name, fallbackDuration) => {
    const entry = mapping[key];
    if (!entry) throw new Error(`import mapping missing for ${key} — run --steps import first`);
    const id = `asset-${key.toLowerCase()}`;
    assets.push({
      id,
      name,
      kind,
      source: entry.source,
      renderPath: entry.renderPath,
      duration: round(Number.isFinite(entry.duration) && entry.duration > 0 ? entry.duration : fallbackDuration ?? 0),
      ...(entry.width ? { width: entry.width } : {}),
      ...(entry.height ? { height: entry.height } : {}),
      ...(entry.fps ? { fps: entry.fps } : {}),
      metadata: { productionId, vaultAssetId: key, mimeType: entry.mimeType ?? '' },
    });
    assetIdOf.set(key, id);
    return id;
  };

  for (const [cutNo, image] of assetsDoc.images) {
    pushMediaAsset(image.assetId, 'image', `${cutLabel(cutNo)} still`, 0);
  }
  for (const seg of assetsDoc.tts) pushMediaAsset(seg.assetId, 'audio', seg.assetId, seg.duration);
  for (const track of assetsDoc.bgm) pushMediaAsset(track.assetId, 'audio', track.assetId, track.duration);
  for (const clip of assetsDoc.i2v.values()) pushMediaAsset(clip.assetId, 'video', clip.assetId, clip.duration);

  // ---- V1 메인 트랙 -------------------------------------------------------
  const v1Clips = [];
  const todoMarkers = [];
  for (const cut of placedCuts) {
    const image = assetsDoc.images.get(cut.no);
    if (!image) throw new Error(`${cut.id}: no adopted image in 03-assets.md`);
    const imageAssetId = assetIdOf.get(image.assetId);
    const transitionSpec = TRANSITION_MAP[cut.transition];
    const transitionOut = transitionSpec
      ? {
          id: `transition-${cut.id.toLowerCase()}-out`,
          type: transitionSpec.type,
          duration: transitionSpec.duration,
          easing: 'easeInOut',
          parameters: { storyboardTransition: cut.transition },
        }
      : undefined;
    if (transitionSpec?.fallback) {
      decisions.push(`${cut.id}: ai-morph → crossfade 폴백(이번 사이클), ComfyUI transition-morph 후속`);
      todoMarkers.push({
        time: cut.end, label: `${cut.id} ai-morph 폴백`,
        note: 'ai-morph는 crossfade로 폴백됨 — transition-morph 프리셋 잡은 후속 사이클',
      });
    }

    const i2vSource = cut.isI2V ? assetsDoc.i2v.get(cut.no) : undefined;
    if (i2vSource) {
      const i2vTimelineDuration = round(Math.min(cut.duration, i2vSource.duration / I2V_SPEED));
      const stillDuration = round(cut.duration - i2vTimelineDuration);
      if (stillDuration > 0.05) {
        v1Clips.push(makeClip({
          id: `clip-${cut.id.toLowerCase()}-still`,
          assetId: imageAssetId,
          name: `${cut.id} 정지(홀드)`,
          kind: 'image',
          start: cut.start,
          duration: stillDuration,
          color: '#64748b',
        }));
      }
      v1Clips.push(makeClip({
        id: `clip-${cut.id.toLowerCase()}-i2v`,
        assetId: assetIdOf.get(i2vSource.assetId),
        name: `${cut.id} I2V (${I2V_SPEED}x slow)`,
        kind: 'video',
        start: round(cut.start + Math.max(stillDuration, 0)),
        duration: i2vTimelineDuration,
        speed: I2V_SPEED,
        color: '#f59e0b',
        transitionOut,
      }));
      decisions.push(
        `${cut.id}: 정지 ${stillDuration}s → I2V ${i2vTimelineDuration}s(${I2V_SPEED}x 슬로우, 소스 ${i2vSource.duration}s) — `
        + 'I2V 입력 프레임이 채택 정지 이미지라 접합점 프레임 매치',
      );
    } else {
      v1Clips.push(makeClip({
        id: `clip-${cut.id.toLowerCase()}`,
        assetId: imageAssetId,
        name: cut.id,
        kind: 'image',
        start: cut.start,
        duration: cut.duration,
        color: '#38bdf8',
        transitionOut,
        keyframes: kenBurnsKeyframes(cut),
      }));
    }
  }

  // 엔딩 페이드아웃(S6 기본 처리): 마지막 컷 이미지 클립 마지막 1초 opacity 1→0
  const lastClip = v1Clips[v1Clips.length - 1];
  lastClip.keyframes = [
    ...lastClip.keyframes,
    { id: `kf-${lastClip.id}-fade-a`, property: 'opacity', time: round(lastClip.duration - ENDING_MARGIN_SECONDS), value: 1, easing: 'linear' },
    { id: `kf-${lastClip.id}-fade-b`, property: 'opacity', time: lastClip.duration, value: 0, easing: 'linear' },
  ];
  decisions.push('CUT-20: 엔딩 마진 1.0s + 마지막 1.0s 페이드아웃(opacity 키프레임)');

  // ---- V2 텍스트 트랙 (타이틀 카드) ----------------------------------------
  const titleCut = placedCuts.find((cut) => cut.no === 2);
  const textClips = [];
  if (titleCut?.subtitle) {
    assets.push({
      id: 'asset-title-card',
      name: '타이틀 카드',
      kind: 'text',
      source: titleCut.subtitle.text,
      duration: titleCut.duration,
      metadata: { productionId },
    });
    textClips.push(makeClip({
      id: 'clip-title-card',
      assetId: 'asset-title-card',
      trackId: 'track-t1',
      name: '타이틀 카드',
      kind: 'text',
      start: round(titleCut.start + 0.4),
      duration: round(titleCut.duration - 0.8),
      color: '#eab308',
      effects: [{
        id: 'effect-title-card-style',
        type: 'caption',
        label: 'Title style',
        enabled: true,
        parameters: { ...TITLE_CARD_STYLE, titleStyle: true },
      }],
    }));
    decisions.push('CUT-02: 타이틀 카드는 V2 텍스트 클립(Title style) — 나머지 자막은 captions[]');
  }

  // ---- 캡션 (세그먼트 수준 타이밍) -----------------------------------------
  // 전용 TTS 세그먼트가 있는 인용은 세그먼트 범위, 그 외는 컷 스팬(word-level 후속)
  const captionSegmentByCut = { 5: 'N02-07-sejong', 15: 'N05-02-josunsaeng' };
  const captions = [];
  for (const cut of placedCuts) {
    if (!cut.subtitle || cut.no === 2) continue; // CUT-02는 타이틀 카드로 처리
    const segId = captionSegmentByCut[cut.no];
    const seg = segId ? placedTts.find((item) => item.assetId === segId) : undefined;
    const start = seg ? seg.start : cut.start;
    const end = seg ? round(seg.start + seg.duration) : cut.end;
    captions.push({
      id: `caption-${cut.id.toLowerCase()}`,
      start,
      end,
      text: cut.subtitle.text,
      ...(seg ? { speaker: seg.speaker } : {}),
      style: { ...CAPTION_STYLES[cut.subtitle.style] },
    });
    if (!seg) {
      decisions.push(`${cut.id}: 자막 타이밍 = 컷 스팬 근사(세그먼트 수준) — word-level 후속`);
    } else {
      decisions.push(`${cut.id}: 자막 타이밍 = TTS 세그먼트 ${segId} 실측 범위`);
    }
  }

  // ---- A1 나레이션 ---------------------------------------------------------
  const a1Clips = placedTts.map((seg) => makeClip({
    id: `clip-${seg.assetId.toLowerCase()}`,
    assetId: assetIdOf.get(seg.assetId),
    trackId: 'track-a1',
    name: seg.assetId,
    kind: 'audio',
    start: seg.start,
    duration: round(seg.duration),
    color: '#a3e635',
  }));

  // ---- A2 BGM --------------------------------------------------------------
  const cutByNo = new Map(placedCuts.map((cut) => [cut.no, cut]));
  const a2Clips = [];
  for (const track of assetsDoc.bgm) {
    const from = cutByNo.get(track.cutStart);
    const to = cutByNo.get(track.cutEnd);
    if (!from || !to) throw new Error(`${track.assetId}: bgm cut range CUT-${track.cutStart}~${track.cutEnd} not on timeline`);
    const span = round(to.end - from.start);
    const duration = round(Math.min(span, track.duration));
    const clip = makeClip({
      id: `clip-${track.assetId.toLowerCase()}`,
      assetId: assetIdOf.get(track.assetId),
      trackId: 'track-a2',
      name: `${track.assetId} (CUT-${String(track.cutStart).padStart(2, '0')}~${String(track.cutEnd).padStart(2, '0')})`,
      kind: 'audio',
      start: from.start,
      duration,
      color: '#818cf8',
    });
    // 트리밍된 트랙 끝 2초 볼륨 페이드 (구간 경계 클릭 방지)
    clip.keyframes = [
      { id: `kf-${clip.id}-fade-a`, property: 'volume', time: round(Math.max(0, duration - 2)), value: 1, easing: 'linear' },
      { id: `kf-${clip.id}-fade-b`, property: 'volume', time: duration, value: 0, easing: 'linear' },
    ];
    a2Clips.push(clip);
    if (duration < track.duration) {
      decisions.push(`${track.assetId}: ${track.duration}s → ${duration}s 트리밍(구간 스팬) + 끝 2s 페이드`);
    }
  }
  decisions.push(`A2 BGM 트랙 게인 ${BGM_TRACK_GAIN_DB}dB(track.volumeDb — 스키마 지원 확인), CUT-13 구간 BGM 공백 유지`);

  // ---- 마커 ---------------------------------------------------------------
  const markers = [];
  let chapterIndex = 0;
  for (const cut of placedCuts) {
    if (!cut.chapter) continue;
    markers.push({
      id: `marker-chapter-${chapterIndex + 1}`,
      time: cut.start,
      label: cut.chapter,
      color: CHAPTER_COLORS[chapterIndex % CHAPTER_COLORS.length],
      kind: 'chapter',
      note: `${cut.id} 시작 — 유튜브 챕터`,
    });
    chapterIndex += 1;
  }

  const reviewTodos = [
    { time: 0, label: '자막 word-level 후속', note: '캡션 타이밍은 세그먼트 수준 — SenseVoice word-level 정렬은 후속 사이클' },
    { time: cutByNo.get(2)?.start ?? 0, label: 'CUT-02 우측 크롭 전제', note: '채택 조건: 우측 ~18% 크롭(인물 잔존) — UI에서 리프레임 확인' },
    { time: cutByNo.get(7)?.start ?? 0, label: 'CUT-07 크롭·화질 확인', note: '우측 ~35% 크롭 전제 + I2V가 832×468 크롭 업스케일이라 연질 가능 — 미달 시 kenburns 폴백' },
    { time: cutByNo.get(8)?.start ?? 0, label: 'CUT-08 하단 프레이밍', note: '하단 가장자리 점경 인물 극소수 — 프레이밍/크롭으로 배제 확인' },
    { time: cutByNo.get(13)?.start ?? 0, label: 'CUT-13 파열음 SFX', note: '화면 침묵 컷 — BGM 공백 유지, 파열음 SFX 별도 삽입 필요(S6 소관)' },
    { time: cutByNo.get(7)?.start ?? 0, label: 'I2V 슬로우 저더 확인', note: `I2V 4컷 ${I2V_SPEED}x 슬로우(16fps 소스 → 실효 8fps) — 저더 확인, 필요시 보간/루프 대체` },
    ...todoMarkers,
  ];
  reviewTodos.forEach((todo, index) => {
    markers.push({
      id: `marker-todo-${index + 1}`,
      time: round(todo.time),
      label: todo.label,
      color: '#f97316',
      kind: 'todo',
      note: todo.note,
    });
  });

  const project = {
    id: `danbi-${productionId}-edit`,
    schemaVersion: 2,
    name: projectName,
    fps: PROJECT_FPS,
    width: PROJECT_WIDTH,
    height: PROJECT_HEIGHT,
    duration: totalDuration,
    updatedAt: nowIso,
    assets,
    tracks: [
      makeTrack('track-v1', 'V1 메인', 'video', v1Clips),
      makeTrack('track-t1', 'V2 자막·타이틀', 'text', textClips),
      makeTrack('track-a1', 'A1 나레이션', 'audio', a1Clips),
      { ...makeTrack('track-a2', 'A2 BGM', 'audio', a2Clips), volumeDb: BGM_TRACK_GAIN_DB },
    ],
    markers,
    captions,
    automation: [],
    plugins: [],
    exportProfiles: [
      {
        id: 'landscape-hd',
        label: 'YouTube 1080p (S6 표준)',
        purpose: 'master',
        container: 'mp4',
        codec: 'h264',
        width: 1920,
        height: 1080,
        fps: PROJECT_FPS,
        videoBitrateMbps: 12,
        audioBitrateKbps: 192,
      },
    ],
  };

  // trackId 채우기 (V1 클립은 위에서 기본 생성)
  for (const clip of v1Clips) clip.trackId = 'track-v1';

  return { project, decisions };
}

function makeClip(clip) {
  return {
    id: clip.id,
    assetId: clip.assetId,
    trackId: clip.trackId ?? 'track-v1',
    name: clip.name,
    kind: clip.kind,
    start: clip.start,
    duration: clip.duration,
    sourceIn: clip.sourceIn ?? 0,
    color: clip.color,
    speed: clip.speed ?? 1,
    volume: clip.volume ?? 1,
    opacity: 1,
    blendMode: 'normal',
    muted: false,
    locked: false,
    automationTags: clip.automationTags ?? [],
    effects: clip.effects ?? [],
    keyframes: clip.keyframes ?? [],
    ...(clip.transitionIn ? { transitionIn: clip.transitionIn } : {}),
    ...(clip.transitionOut ? { transitionOut: clip.transitionOut } : {}),
  };
}

function makeTrack(id, name, kind, clips) {
  return {
    id, name, kind,
    muted: false, solo: false, syncLocked: false,
    volumeDb: 0, pan: 0, locked: false,
    clips,
  };
}

function kenBurnsKeyframes(cut) {
  // 콘티 motion: kenburns — 정지 이미지에 초저속 스케일 (zoom-out 지시 컷은 역방향)
  const [fromScale, toScale] = cut.zoomOut ? [1.06, 1.0] : [1.0, 1.06];
  return [
    { id: `kf-${cut.id.toLowerCase()}-scale-a`, property: 'scale', time: 0, value: fromScale, easing: 'smooth' },
    { id: `kf-${cut.id.toLowerCase()}-scale-b`, property: 'scale', time: cut.duration, value: toScale, easing: 'smooth' },
  ];
}

function cutLabel(cutNo) {
  return `CUT-${String(cutNo).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 4. 스키마 검증 (project-schema.ts를 esbuild로 번들 — src 무수정, 읽기 전용 사용)
// ---------------------------------------------------------------------------

async function loadValidator(workdir) {
  const { build } = await import('esbuild');
  const outfile = path.join(workdir, 'project-schema.bundle.mjs');
  await build({
    entryPoints: [SCHEMA_ENTRY],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    outfile,
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const steps = args.steps.split(',').map((step) => step.trim());

  const storyboardMd = await readFile(args.storyboard, 'utf8');
  const assetsMd = await readFile(args.assets, 'utf8');
  await readFile(args.script, 'utf8'); // 존재 검증(자막 원문 대조용 — 자막 텍스트 자체는 콘티가 소유)

  const assetsDoc = parseAssetsDoc(assetsMd);
  const cuts = parseStoryboard(storyboardMd);
  const workdir = args.workdir ?? path.join(SCRIPT_DIR, 'out', assetsDoc.productionId);
  await mkdir(workdir, { recursive: true });
  const mappingPath = path.join(workdir, 'media-import-mapping.json');
  const projectPath = path.join(workdir, 'editor-project.json');

  console.log(`production: ${assetsDoc.productionId}`);
  console.log(`cuts: ${cuts.length} / images: ${assetsDoc.images.size} / tts: ${assetsDoc.tts.length} / bgm: ${assetsDoc.bgm.length} / i2v: ${assetsDoc.i2v.size}`);

  // 입력 검증: 컷 ↔ 채택 이미지 전수 대조
  for (const cut of cuts) {
    if (!assetsDoc.images.has(cut.no)) throw new Error(`input check failed: ${cut.id} has no adopted image`);
    if (cut.isI2V && !assetsDoc.i2v.has(cut.no)) throw new Error(`input check failed: ${cut.id} motion=I2V but no i2v asset`);
  }

  let mapping = existsSync(mappingPath) ? JSON.parse(await readFile(mappingPath, 'utf8')) : {};
  if (steps.includes('import')) {
    mapping = await importMedia(args.api, assetsDoc, mappingPath);
  }

  if (!steps.includes('compile')) return;

  const timeline = computeTimeline(cuts, assetsDoc.tts);
  const projectName = args.name ?? `${assetsDoc.productionId} (S6 compile)`;
  const { project, decisions } = buildProject({
    productionId: assetsDoc.productionId,
    projectName,
    cuts,
    timeline,
    assetsDoc,
    mapping,
  });

  // 자체 검증 출력: 총 길이 정합
  const ttsTotal = round(assetsDoc.tts.reduce((sum, seg) => sum + seg.duration, 0));
  const expected = round(ttsTotal + (timeline.scenes.length - 1) * SCENE_PAUSE_SECONDS + ENDING_MARGIN_SECONDS);
  console.log('\n--- duration self-check ---');
  console.log(`TTS 실측 합계: ${ttsTotal}s`);
  console.log(`기대 총 길이 = 실측 + 장면 휴지 ${(timeline.scenes.length - 1)}×${SCENE_PAUSE_SECONDS}s + 엔딩 마진 ${ENDING_MARGIN_SECONDS}s = ${expected}s`);
  console.log(`타임라인 총 길이: ${project.duration}s → ${Math.abs(project.duration - expected) < 0.01 ? 'OK' : 'MISMATCH'}`);
  for (const scene of timeline.scenes) {
    console.log(`  N${String(scene).padStart(2, '0')}: start ${timeline.sceneStart.get(scene)}s / span ${round(timeline.sceneSpan.get(scene))}s (audio ${round(timeline.sceneAudio.get(scene))}s)`);
  }
  if (Math.abs(project.duration - expected) >= 0.01) {
    throw new Error('duration self-check failed');
  }

  // 스키마 검증 (수용 테스트 게이트)
  const validator = await loadValidator(workdir);
  const validation = validator.validateProjectJson(project);
  if (!validation.ok) {
    console.error('\nSCHEMA VALIDATION FAILED:');
    for (const error of validation.errors) console.error(`  ERROR ${error}`);
    process.exitCode = 1;
    await writeFile(projectPath, JSON.stringify(project, null, 2));
    return;
  }
  for (const warning of validation.warnings) console.log(`  schema warning: ${warning}`);
  console.log('\nschema validation: OK');

  await writeFile(projectPath, JSON.stringify(project, null, 2));
  console.log(`project JSON: ${projectPath}`);
  console.log('\n--- compile decisions ---');
  for (const decision of decisions) console.log(`  - ${decision}`);

  const clipCount = project.tracks.map((track) => `${track.name}: ${track.clips.length}`).join(' / ');
  console.log(`\ntracks: ${clipCount} / markers: ${project.markers.length} (chapter ${project.markers.filter((m) => m.kind === 'chapter').length}) / captions: ${project.captions.length}`);

  if (steps.includes('save')) {
    const response = await fetch(`${args.api}/api/editor/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project }),
    });
    const payload = await response.json();
    if (!response.ok) {
      console.error('SAVE FAILED:', JSON.stringify(payload, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`\nsaved project id: ${payload.project.id} (name: ${payload.project.name})`);
  }

  if (steps.includes('preflight')) {
    const preflightResponse = await fetch(`${args.api}/api/editor/render-preflight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project, profileId: project.exportProfiles[0].id }),
    });
    const report = await preflightResponse.json();
    if (!preflightResponse.ok) {
      console.error('PREFLIGHT FAILED:', JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`\npreflight status: ${report.status} (blocked ${report.blockedCount ?? 0} / warning ${report.warningCount ?? (report.issues?.length ?? 0)})`);
    for (const issue of report.issues ?? []) {
      console.log(`  [${issue.severity}] ${issue.id ?? ''} ${issue.message ?? JSON.stringify(issue)}`);
    }

    const planResponse = await fetch(`${args.api}/api/editor/render-plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project, profileId: project.exportProfiles[0].id }),
    });
    if (!planResponse.ok) {
      console.error('RENDER-PLAN (dry-run) FAILED:', await planResponse.text());
      process.exitCode = 1;
      return;
    }
    const plan = await planResponse.json();
    console.log(`render-plan (dry-run): OK — command length ${plan.command?.length ?? 'n/a'}, issues: ${(plan.issues ?? []).length}`);
    for (const issue of plan.issues ?? []) console.log(`  plan issue: ${JSON.stringify(issue)}`);
  }
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
