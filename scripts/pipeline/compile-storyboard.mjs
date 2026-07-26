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
 *  - V1: 콘티 컷 순서 배치(v2: 컷 수 가변 — 45컷). 이미지/I2V 에셋은 콘티의
 *    "v1→v2 재사용 매핑 표"가 결정(명시 asset_id 또는 '신규'→03-assets cut_id+-v2 채택 행).
 *    I2V 컷은 [채택 정지 이미지 → I2V 클립(0.5× 슬로우, 최대 ~10.12s)]로
 *    분할 — I2V 첫 프레임 = 입력 정지 이미지이므로 정지→I2V 접합점이 프레임 매치(자연 분할점).
 *  - V2(text): 콘티 subtitle 중 "(타이틀 카드)" 마커가 있는 컷만 Title style 텍스트 클립.
 *    나머지 subtitle 컷은 상단 오버레이 카드, 전체 나레이션 자막은 captions[](세그먼트 수준 — word-level 후속).
 *  - A1: TTS 세그먼트 순서·장면 경계대로 연속 배치(장면 내 연속, 장면 간 0.3s 휴지).
 *  - A2: BGM 구간은 콘티 bgm_cue 시퀀스(start/change=구간 시작, stop=침묵)가 결정 —
 *    k번째 구간 ← k번째 bgm 행(assetId 순). 트랙 volumeDb -14dB.
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

  const imagesById = new Map(); // 채택 이미지: asset_id -> { assetId, cutId, path }
  const tts = [];
  const bgm = [];
  const i2vById = new Map(); // asset_id -> { assetId, path, duration }

  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    // | asset_id | type | cut_id | path | duration_sec | slot | seed | job | 결과 | 채택 |
    if (cells.length < 11) continue;
    const [, assetId, type, cutId, filePath, durationSec, , , , , adopted] = cells;
    if (!['image', 'tts', 'bgm', 'i2v'].includes(type)) continue;

    if (type === 'image') {
      if (!assetId.startsWith('CUT-') || !adopted.includes('채택')) continue;
      // v2: 컷별 채택은 콘티의 재사용 매핑 표가 결정 — 여기서는 채택 행을 id로 색인만 한다.
      imagesById.set(assetId, { assetId, cutId, path: filePath });
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
      bgm.push({ assetId, path: filePath, duration: Number(durationSec), cutRange: cutId });
    } else if (type === 'i2v') {
      i2vById.set(assetId, { assetId, path: filePath, duration: Number(durationSec) });
    }
  }

  tts.sort((a, b) => (a.scene - b.scene) || (a.order - b.order));
  bgm.sort((a, b) => a.assetId.localeCompare(b.assetId));
  return { productionId, imagesById, tts, bgm, i2vById };
}

// v2 콘티의 "## v1→v2 재사용 매핑 표" 파싱 — 컷별 이미지/i2v 에셋 해석의 권위 원천.
// | v2 컷 | 소스 | 이미지 asset_id | i2v asset_id |
function parseCutSourceMap(markdown) {
  const section = markdown.match(/^## v1→v2 재사용 매핑 표\s*$([\s\S]*?)(?=^## )/m);
  if (!section) throw new Error('02-storyboard.md: v1→v2 재사용 매핑 표 section not found (v2 콘티 필요)');
  const map = new Map();
  for (const line of section[1].split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 5 || !/^CUT-\d{2}$/.test(cells[1])) continue;
    map.set(cells[1], {
      source: cells[2],
      imageAssetId: cells[3],
      i2vAssetId: cells[4] && cells[4] !== '—' ? cells[4] : undefined,
    });
  }
  if (map.size === 0) throw new Error('02-storyboard.md: 재사용 매핑 표 rows not parsed');
  return map;
}

// 컷별 에셋 해석: 매핑 표의 명시 id 또는 '신규'(03-assets에서 cut_id 일치 + '-v2' 채택 행)
function resolveCutAssets(cuts, sourceMap, assetsDoc) {
  for (const cut of cuts) {
    const entry = sourceMap.get(cut.id);
    if (!entry) throw new Error(`${cut.id}: missing row in v1→v2 재사용 매핑 표`);
    cut.source = entry.source;
    let image;
    if (entry.imageAssetId === '신규') {
      const candidates = [...assetsDoc.imagesById.values()]
        .filter((row) => row.cutId === cut.id && row.assetId.includes('-v2'));
      if (candidates.length !== 1) {
        throw new Error(`${cut.id}: expected exactly 1 adopted -v2 image in 03-assets, found ${candidates.length}`);
      }
      image = candidates[0];
    } else {
      image = assetsDoc.imagesById.get(entry.imageAssetId);
      if (!image) throw new Error(`${cut.id}: adopted image ${entry.imageAssetId} not found in 03-assets`);
    }
    cut.imageAsset = image;
    if (cut.isI2V) {
      if (!entry.i2vAssetId) throw new Error(`${cut.id}: motion=I2V but no i2v asset in 매핑 표`);
      const clip = assetsDoc.i2vById.get(entry.i2vAssetId);
      if (!clip) throw new Error(`${cut.id}: i2v asset ${entry.i2vAssetId} not found in 03-assets`);
      cut.i2vAsset = clip;
    }
  }
}

// 01-script.md 장면 블록의 나레이션/대사 라인 추출 — TTS 세그먼트와 순서 1:1 매핑
function parseScriptDialogues(markdown) {
  const dialogues = new Map(); // scene number -> [{ speaker, text }]
  const blocks = markdown.split(/^## 장면 \d+ \(N(\d{2})\)\s*$/m);
  for (let i = 1; i < blocks.length; i += 2) {
    const scene = Number(blocks[i]);
    const body = blocks[i + 1];
    const sectionMatch = body.match(/- \*\*나레이션\/대사\*\*:\n([\s\S]*?)(?=^- \*\*)/m);
    if (!sectionMatch) throw new Error(`01-script.md: scene N${blocks[i]} has no 나레이션/대사 block`);
    const lines = [];
    for (const raw of sectionMatch[1].split('\n')) {
      const line = raw.match(/^\s+-\s+([^:]+):\s*(.+)$/);
      if (line) lines.push({ speaker: line[1].trim(), text: line[2].trim() });
    }
    if (lines.length === 0) throw new Error(`01-script.md: scene N${blocks[i]} has no dialogue lines`);
    dialogues.set(scene, lines);
  }
  return dialogues;
}

// 문장 단위 분할 → 줄바꿈(줄당 ~30자) → 최대 2줄 캡션 단위로 묶기
const CAPTION_LINE_MAX = 30;

function splitSentences(text) {
  return text.split(/(?<=[.?!])\s+/u).map((sentence) => sentence.trim()).filter(Boolean);
}

function wrapLines(sentence, maxChars) {
  const words = sentence.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function sentenceToCaptionTexts(sentence) {
  // 캡션 1건 = 1줄(~30자). 렌더러 drawtext 번인이 텍스트 내 개행을 지원하지 않아
  // ('\n'이 리터럴 n으로 렌더되는 것을 실측 확인) 2줄 묶음 대신 줄 단위 캡션을 쓴다.
  return wrapLines(sentence, CAPTION_LINE_MAX);
}

function captionWeight(text) {
  return Math.max(1, text.replace(/\s/g, '').length);
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
    let isTitleCard = false;
    if (subtitleRaw !== '—') {
      const match = subtitleRaw.match(/^(caption-default|caption-emphasis)\s*—\s*"([^"]+)"/);
      if (!match) throw new Error(`${id}: subtitle field outside §2.1a vocabulary: ${subtitleRaw}`);
      subtitle = { style: match[1], text: match[2] };
      isTitleCard = subtitleRaw.includes('타이틀 카드');
    }
    const bgmCue = field('bgm_cue')?.match(/^(start|change|continue|stop)/)?.[1] ?? 'continue';

    if (!Number.isFinite(durationPlan) || !Number.isFinite(scene)) {
      throw new Error(`${id}: duration_seconds/narration_ref parse failure`);
    }
    if (!(transitionRaw in TRANSITION_MAP)) {
      throw new Error(`${id}: transition "${transitionRaw}" outside §2.1a vocabulary — blocked`);
    }

    cuts.push({
      id, no, durationPlan, scene, transition: transitionRaw, chapter, subtitle, isTitleCard, bgmCue,
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

async function importMedia(apiBase, cuts, assetsDoc, mappingPath) {
  const mapping = existsSync(mappingPath)
    ? JSON.parse(await readFile(mappingPath, 'utf8'))
    : {};

  const jobs = [];
  const seen = new Set();
  for (const cut of cuts) {
    if (!seen.has(cut.imageAsset.assetId)) {
      seen.add(cut.imageAsset.assetId);
      jobs.push({ key: cut.imageAsset.assetId, path: cut.imageAsset.path, note: `image ${cut.id}` });
    }
    if (cut.i2vAsset && !seen.has(cut.i2vAsset.assetId)) {
      seen.add(cut.i2vAsset.assetId);
      jobs.push({ key: cut.i2vAsset.assetId, path: cut.i2vAsset.path, note: 'i2v' });
    }
  }
  for (const seg of assetsDoc.tts) jobs.push({ key: seg.mappingKey ?? seg.assetId, path: seg.path, note: 'tts' });
  for (const track of assetsDoc.bgm) jobs.push({ key: track.assetId, path: track.path, note: 'bgm' });

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

function buildProject({ productionId, projectName, cuts, timeline, assetsDoc, mapping, scriptDialogues }) {
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

  for (const cut of cuts) {
    if (!assetIdOf.has(cut.imageAsset.assetId)) {
      pushMediaAsset(cut.imageAsset.assetId, 'image', `${cut.id} still (${cut.imageAsset.assetId})`, 0);
    }
    if (cut.i2vAsset && !assetIdOf.has(cut.i2vAsset.assetId)) {
      pushMediaAsset(cut.i2vAsset.assetId, 'video', cut.i2vAsset.assetId, cut.i2vAsset.duration);
    }
  }
  for (const seg of assetsDoc.tts) pushMediaAsset(seg.mappingKey ?? seg.assetId, 'audio', seg.assetId, seg.duration);
  for (const track of assetsDoc.bgm) pushMediaAsset(track.assetId, 'audio', track.assetId, track.duration);

  // ---- V1 메인 트랙 -------------------------------------------------------
  const v1Clips = [];
  const todoMarkers = [];
  for (const cut of placedCuts) {
    const image = cut.imageAsset;
    if (!image) throw new Error(`${cut.id}: no resolved image asset`);
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

    const i2vSource = cut.isI2V ? cut.i2vAsset : undefined;
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
  decisions.push(`${placedCuts[placedCuts.length - 1].id}: 엔딩 마진 ${ENDING_MARGIN_SECONDS}s + 마지막 ${ENDING_MARGIN_SECONDS}s 페이드아웃(opacity 키프레임)`);

  // ---- V2 텍스트 트랙 (타이틀 카드) — subtitle 필드의 "(타이틀 카드)" 마커로 식별
  const titleCut = placedCuts.find((cut) => cut.isTitleCard);
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
    decisions.push(`${titleCut.id}: 타이틀 카드는 V2 텍스트 클립(Title style) — 나머지 자막은 captions[]`);
  }

  // ---- 캡션: 전체 나레이션 자막 (채널 §2 전체 번인 규격) ---------------------
  // 대본 문장 단위 분할, 세그먼트 실측 duration 안에서 음절수 비례 배분(word-level 후속).
  // speaker 필드는 넣지 않는다 — 렌더러가 "speaker: " 로마자 접두사를 번인하기 때문.
  const captions = [];
  for (const seg of placedTts) {
    const lines = scriptDialogues.get(seg.scene);
    const segIndex = placedTts.filter((item) => item.scene === seg.scene).indexOf(seg);
    const dialogue = lines[segIndex];
    if (!dialogue) throw new Error(`no script dialogue for ${seg.assetId}`);

    const units = splitSentences(dialogue.text).flatMap(sentenceToCaptionTexts);
    const totalWeight = units.reduce((sum, text) => sum + captionWeight(text), 0);
    let at = seg.start;
    units.forEach((text, unitIndex) => {
      const isLast = unitIndex === units.length - 1;
      const end = isLast
        ? round(seg.start + seg.duration)
        : round(at + (seg.duration * captionWeight(text)) / totalWeight);
      captions.push({
        id: `caption-${seg.assetId.toLowerCase()}-${unitIndex + 1}`,
        start: round(at),
        end,
        text,
        style: { ...CAPTION_STYLES['caption-default'] },
      });
      at = end;
    });
  }
  decisions.push(`전체 나레이션 자막 ${captions.length}건 — 대본 문장 분할, 세그먼트 내 음절수 비례 타이밍(word-level 후속), 줄당 ~${CAPTION_LINE_MAX}자·최대 2줄`);

  // 콘티 subtitle 중 타이틀 카드를 제외한 나머지 = 오버레이 카드(한자 병기·출처).
  // 하단 전체 자막과 충돌하지 않게 position: top. (순수 인용 자막은 v2 콘티에서 이미
  // 전체 자막에 흡수되어 subtitle 필드가 없음.)
  const overlayCards = [];
  for (const cut of placedCuts) {
    if (!cut.subtitle || cut.isTitleCard) continue;
    overlayCards.push(cut.id);
    captions.push({
      id: `caption-card-${cut.id.toLowerCase()}`,
      start: cut.start,
      end: cut.end,
      text: cut.subtitle.text,
      style: { ...CAPTION_STYLES[cut.subtitle.style], position: 'top' },
    });
  }
  decisions.push(`오버레이 카드 ${overlayCards.length}건(${overlayCards.join('·')} — 한자 병기·출처) 상단 유지`);

  // ---- A1 나레이션 ---------------------------------------------------------
  const a1Clips = placedTts.map((seg) => makeClip({
    id: `clip-${seg.assetId.toLowerCase()}`,
    assetId: assetIdOf.get(seg.mappingKey ?? seg.assetId),
    trackId: 'track-a1',
    name: seg.assetId,
    kind: 'audio',
    start: seg.start,
    duration: round(seg.duration),
    color: '#a3e635',
  }));

  // ---- A2 BGM — 콘티 bgm_cue 시퀀스가 구간을 결정 (v2: 컷 번호 하드코딩 제거) ----
  // start/change 컷 = 새 구간 시작, stop 컷 = 침묵 시작. k번째 구간 ← k번째 bgm 행(assetId 순).
  const cutByNo = new Map(placedCuts.map((cut) => [cut.no, cut]));
  const segments = [];
  for (const cut of placedCuts) {
    if (cut.bgmCue === 'start' || cut.bgmCue === 'change') {
      if (segments.length > 0 && segments[segments.length - 1].end === undefined) {
        segments[segments.length - 1].end = cut.start;
      }
      segments.push({ start: cut.start, startCutId: cut.id, end: undefined });
    } else if (cut.bgmCue === 'stop') {
      if (segments.length > 0 && segments[segments.length - 1].end === undefined) {
        segments[segments.length - 1].end = cut.start;
      }
      decisions.push(`${cut.id}: bgm stop — 구간 침묵 유지`);
    }
  }
  if (segments.length > 0 && segments[segments.length - 1].end === undefined) {
    segments[segments.length - 1].end = totalDuration;
  }
  if (segments.length !== assetsDoc.bgm.length) {
    throw new Error(`bgm cue segments (${segments.length}) != bgm tracks (${assetsDoc.bgm.length})`);
  }
  const a2Clips = [];
  assetsDoc.bgm.forEach((track, index) => {
    const segment = segments[index];
    const span = round(segment.end - segment.start);
    const duration = round(Math.min(span, track.duration));
    const clip = makeClip({
      id: `clip-${track.assetId.toLowerCase()}`,
      assetId: assetIdOf.get(track.assetId),
      trackId: 'track-a2',
      name: `${track.assetId} (${segment.startCutId}~)`,
      kind: 'audio',
      start: segment.start,
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
      decisions.push(`${track.assetId}: ${track.duration}s → ${duration}s 트리밍(구간 스팬 ${span}s) + 끝 2s 페이드`);
    } else if (track.duration < span) {
      decisions.push(`${track.assetId}: 실측 ${track.duration}s < 구간 스팬 ${span}s — ${round(span - track.duration)}s 조기 종료(재생성 금지 계약, 끝 2s 페이드로 자연 소멸)`);
    }
  });
  decisions.push(`A2 BGM 트랙 게인 ${BGM_TRACK_GAIN_DB}dB(track.volumeDb — 스키마 지원 확인), stop 컷 구간 BGM 공백 유지`);

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

  // v1 유래 검수 포인트는 소스 매핑으로 v2 컷 위치를 찾고, 채택 이미지가 해당 결함본일 때만 표시
  const v2Of = (v1CutId) => placedCuts.find((cut) => cut.source === `v1 ${v1CutId}`);
  const reviewTodos = [
    { time: 0, label: '자막 word-level 후속', note: '캡션 타이밍은 세그먼트 수준 — SenseVoice word-level 정렬은 후속 사이클' },
    { time: 0, label: 'v2 콘티 재승인 대기', note: '컷 밀도 개정(45컷)·신규/교체 이미지 채택은 잠정 — 인간 재승인 필요(EXTERNAL_PENDING)' },
  ];
  const cropCut02 = v2Of('CUT-02');
  if (cropCut02?.imageAsset.assetId === 'CUT-02-r3') {
    reviewTodos.push({ time: cropCut02.start, label: `${cropCut02.id} 우측 크롭 전제(구 CUT-02)`, note: '채택 조건: 우측 ~18% 크롭(인물 잔존) — UI에서 리프레임 확인' });
  }
  const cropCut07 = v2Of('CUT-07');
  if (cropCut07?.imageAsset.assetId === 'CUT-07-r3') {
    reviewTodos.push({ time: cropCut07.start, label: `${cropCut07.id} 크롭·화질 확인(구 CUT-07)`, note: '우측 ~35% 크롭 전제 + I2V가 832×468 크롭 업스케일이라 연질 가능 — 미달 시 kenburns 폴백' });
  }
  const frameCut08 = v2Of('CUT-08');
  if (frameCut08?.imageAsset.assetId === 'CUT-08-r2') {
    reviewTodos.push({ time: frameCut08.start, label: `${frameCut08.id} 하단 프레이밍(구 CUT-08)`, note: '하단 가장자리 점경 인물 극소수 — 프레이밍/크롭으로 배제 확인' });
  }
  const sfxCut = v2Of('CUT-13');
  if (sfxCut) {
    reviewTodos.push({ time: sfxCut.start, label: `${sfxCut.id} 파열음 SFX(구 CUT-13)`, note: '화면 침묵 컷 — BGM 공백 유지, 파열음 SFX 별도 삽입 필요(S6 소관)' });
  }
  const i2vCuts = placedCuts.filter((cut) => cut.isI2V);
  if (i2vCuts.length > 0) {
    reviewTodos.push({ time: i2vCuts[0].start, label: 'I2V 슬로우 저더 확인', note: `I2V ${i2vCuts.length}컷 ${I2V_SPEED}x 슬로우(16fps 소스 → 실효 8fps) — 저더 확인, 필요시 보간/루프 대체` });
  }
  reviewTodos.push(...todoMarkers);
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
      {
        id: 'draft-480p',
        label: '검수용 드래프트 480p (자막 번인)',
        purpose: 'proxy',
        container: 'mp4',
        codec: 'h264',
        width: 854,
        height: 480,
        fps: PROJECT_FPS,
        videoBitrateMbps: 2.5,
        audioBitrateKbps: 128,
        ffmpegPreset: 'fast',
        crf: 23,
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
  // 콘티 motion: kenburns — 체감형 스케일(100↔108%) + 컷별 교차 방향 팬.
  // 렌더러는 scale/positionX/Y 키프레임을 transformed 경로(eval=frame)로 지원함(진단 확인).
  // 검수 피드백 반영: 기존 6% 진폭은 인지 불가 → 8% + 팬 병행.
  // 최소 스케일 1.04: 여백(0.04×1920/2=38px@1080p)이 팬 진폭(26px)보다 커야 검은 가장자리 없음
  const key = cut.id.toLowerCase();
  const [fromScale, toScale] = cut.zoomOut ? [1.12, 1.04] : [1.04, 1.12];
  const keyframes = [
    { id: `kf-${key}-scale-a`, property: 'scale', time: 0, value: fromScale, easing: 'smooth' },
    { id: `kf-${key}-scale-b`, property: 'scale', time: cut.duration, value: toScale, easing: 'smooth' },
  ];
  // 팬 방향 교차(1080p 기준 px — 렌더 페이로드에서 프로파일 비례 스케일):
  // 0: 우→좌, 1: 좌→우, 2: 하→상, 3: 상→하
  const PAN = 26;
  const direction = cut.no % 4;
  const property = direction < 2 ? 'positionX' : 'positionY';
  const magnitude = direction < 2 ? PAN : Math.round(PAN * 0.7);
  const from = direction % 2 === 0 ? magnitude : -magnitude;
  keyframes.push(
    { id: `kf-${key}-pan-a`, property, time: 0, value: from, easing: 'smooth' },
    { id: `kf-${key}-pan-b`, property, time: cut.duration, value: -from, easing: 'smooth' },
  );
  return keyframes;
}

function cutLabel(cutNo) {
  return `CUT-${String(cutNo).padStart(2, '0')}`;
}

function scaleCaptionFontsForProfile(project, profile, referenceHeight) {
  const scale = profile.height / referenceHeight;
  if (Math.abs(scale - 1) < 0.001) return project;

  const scaleFontSize = (value) => Math.min(180, Math.max(12, Math.round(value * scale)));
  const scaleShadow = (value) => Math.min(32, Math.max(0, Math.round(value * scale)));
  const scaleStyle = (style) => ({
    ...style,
    ...(typeof style.fontSize === 'number' ? { fontSize: scaleFontSize(style.fontSize) } : {}),
    ...(typeof style.shadowOffset === 'number' ? { shadowOffset: scaleShadow(style.shadowOffset) } : {}),
  });

  return {
    ...project,
    captions: project.captions.map((caption) => (
      caption.style ? { ...caption, style: scaleStyle(caption.style) } : caption
    )),
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({
        ...clip,
        effects: clip.effects.map((effect) => (
          effect.type === 'caption' && effect.parameters?.titleStyle === true
            ? { ...effect, parameters: scaleStyle(effect.parameters) }
            : effect
        )),
        // Ken Burns 팬(px)도 출력 해상도 비례 스케일
        keyframes: clip.keyframes.map((keyframe) => (
          (keyframe.property === 'positionX' || keyframe.property === 'positionY') && typeof keyframe.value === 'number'
            ? { ...keyframe, value: Math.round(keyframe.value * scale * 10) / 10 }
            : keyframe
        )),
      })),
    })),
  };
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
  const scriptMd = await readFile(args.script, 'utf8'); // 전체 자막 원문(문장 분할 소스)

  const assetsDoc = parseAssetsDoc(assetsMd);
  const cuts = parseStoryboard(storyboardMd);
  const sourceMap = parseCutSourceMap(storyboardMd);
  const scriptDialogues = parseScriptDialogues(scriptMd);

  // TTS 후처리본 오버라이드 (예: atempo 1.1x — 경로·실측 duration 교체, 반입 키 분리)
  if (args['tts-override']) {
    const override = JSON.parse(await readFile(args['tts-override'], 'utf8'));
    for (const seg of assetsDoc.tts) {
      const entry = override[seg.assetId];
      if (!entry) throw new Error(`tts-override missing entry for ${seg.assetId}`);
      seg.path = entry.path;
      seg.duration = entry.duration;
      seg.mappingKey = `${seg.assetId}-x11`;
    }
    console.log(`tts override applied: ${args['tts-override']}`);
  }

  // 세그먼트 ↔ 대본 대사 라인 1:1 검증
  for (const [scene, lines] of scriptDialogues) {
    const segs = assetsDoc.tts.filter((seg) => seg.scene === scene);
    if (segs.length !== lines.length) {
      throw new Error(`scene N${scene}: tts segments ${segs.length} != script dialogue lines ${lines.length}`);
    }
  }
  const workdir = args.workdir ?? path.join(SCRIPT_DIR, 'out', assetsDoc.productionId);
  await mkdir(workdir, { recursive: true });
  const mappingPath = path.join(workdir, 'media-import-mapping.json');
  const projectPath = path.join(workdir, 'editor-project.json');

  // 입력 검증 + 컷별 에셋 해석 (v2 매핑 표 기반 — 전수 대조는 resolveCutAssets가 throw)
  resolveCutAssets(cuts, sourceMap, assetsDoc);
  const uniqueImages = new Set(cuts.map((cut) => cut.imageAsset.assetId));
  const uniqueI2v = new Set(cuts.filter((cut) => cut.i2vAsset).map((cut) => cut.i2vAsset.assetId));
  console.log(`production: ${assetsDoc.productionId}`);
  console.log(`cuts: ${cuts.length} / images: ${uniqueImages.size} / tts: ${assetsDoc.tts.length} / bgm: ${assetsDoc.bgm.length} / i2v: ${uniqueI2v.size}`);

  let mapping = existsSync(mappingPath) ? JSON.parse(await readFile(mappingPath, 'utf8')) : {};
  if (steps.includes('import')) {
    mapping = await importMedia(args.api, cuts, assetsDoc, mappingPath);
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
    scriptDialogues,
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

  if (steps.includes('render')) {
    // 자막 번인: 렌더러는 project.captions가 비어 있지 않으면 항상 번인한다
    // (ffmpeg-renderer buildCaptionBurnInFilters — 별도 옵션 없음).
    const profileId = args.profile ?? project.exportProfiles[0].id;
    const renderProfile = project.exportProfiles.find((profile) => profile.id === profileId);
    if (!renderProfile) {
      throw new Error(`render: unknown export profile ${profileId}`);
    }

    // 캡션/타이틀 fontSize는 렌더러에서 절대 px(출력 해상도 비례 스케일 없음 —
    // normalizeCaptionRenderStyle은 미지정 시에만 height 비례 기본값). 프로젝트의
    // 스타일 값은 1080p 기준이므로, 렌더 페이로드에서만 출력높이×(기준값/1080)로
    // 스케일한다(저장 프로젝트는 1080p 기준값 유지 — 본 렌더에서 그대로 적정).
    const renderProject = scaleCaptionFontsForProfile(project, renderProfile, PROJECT_HEIGHT);
    const jobStatePath = path.join(workdir, `render-job-${profileId}.json`);

    let jobId = args.job;
    if (!jobId && existsSync(jobStatePath)) {
      const saved = JSON.parse(await readFile(jobStatePath, 'utf8'));
      if (saved.jobId && !['completed', 'failed', 'cancelled'].includes(saved.lastStatus ?? '')) {
        jobId = saved.jobId;
        console.log(`\nresuming render job ${jobId} (${profileId})`);
      }
    }

    if (!jobId) {
      const queueResponse = await fetch(`${args.api}/api/editor/render-jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: renderProject, profileId, encoderPreference: args.encoder ?? 'auto' }),
      });
      const queued = await queueResponse.json();
      if (!queueResponse.ok) {
        console.error('RENDER QUEUE FAILED:', JSON.stringify(queued, null, 2));
        process.exitCode = 1;
        return;
      }
      jobId = queued.job.id;
      await writeFile(jobStatePath, JSON.stringify({ jobId, profileId, queuedAt: new Date().toISOString() }, null, 2));
      console.log(`\nrender job queued: ${jobId} (profile ${profileId}) → ${queued.job.outputPath}`);
    }

    let lastLogged = -1;
    for (;;) {
      const jobResponse = await fetch(`${args.api}/api/editor/render-jobs/${jobId}`);
      if (!jobResponse.ok) throw new Error(`render job poll failed: HTTP ${jobResponse.status}`);
      const { job: snapshotJob } = await jobResponse.json();
      const progress = Math.floor(snapshotJob.progress ?? 0);
      if (progress !== lastLogged) {
        console.log(`  render ${snapshotJob.status} ${progress}%`);
        lastLogged = progress;
      }
      await writeFile(jobStatePath, JSON.stringify({ jobId, profileId, lastStatus: snapshotJob.status, progress, outputPath: snapshotJob.outputPath }, null, 2));
      if (snapshotJob.status === 'completed') {
        console.log(`render DONE: ${snapshotJob.outputPath}`);
        break;
      }
      if (snapshotJob.status === 'failed' || snapshotJob.status === 'cancelled') {
        console.error(`render ${snapshotJob.status}: ${snapshotJob.error ?? 'no error message'}`);
        process.exitCode = 1;
        return;
      }
      await new Promise((resolvePause) => setTimeout(resolvePause, 5000));
    }
  }
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
