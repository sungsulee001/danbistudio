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
 * 사이클 모드 (--cycle, 기본 v3):
 *  - v3 (현행, 콘티 v3 59컷 / LTX-2.3): 전 컷이 24fps 실모션 클립. 슬로우 배속·Ken Burns 없음.
 *  - v2 (레거시, 콘티 v2 45컷 / WAN 16fps): 정지 이미지 + I2V 0.5× 슬로우 + Ken Burns.
 *    구 산출물 재컴파일용으로만 보존 — 신규 작업에 쓰지 말 것.
 *
 * 배치 규칙 (S6 §4.1, v3 기준):
 *  - 컷 duration: TTS 실측이 시간을 지배 — 장면별 (실측+휴지)/계획 비율로 duration_plan 스케일.
 *    장면 간 0.3s 휴지, 최종 컷 뒤 1.0s 엔딩 마진(S2 전체 여백).
 *    실측은 문서 표가 아니라 **파일 ffprobe**가 원천(03-assets 표는 채택 테이크 교체 후 stale 가능).
 *    A2V 컷은 클립 내장 보이스 길이가 하한 — 장면 내 다른 컷에서 흡수, 부족분은 장면 스팬 연장.
 *  - V1: 콘티 컷 순서로 **컷당 클립 1개**(LTX-2.3 24fps 실모션). Ken Burns 자동 부여 없음
 *    (클립 자체에 모션 — 이중 모션 금지). 클립이 없는 컷만 정지 이미지 폴백(--prefer still로 전면 강제).
 *  - V2(text): 콘티 subtitle 중 "(타이틀 카드)" 마커가 있는 컷만 Title style 텍스트 클립.
 *    나머지 subtitle 컷은 상단 오버레이 카드, 전체 나레이션 자막은 captions[](세그먼트 수준 — word-level 후속).
 *  - A1: TTS 세그먼트 순서·장면 경계대로 연속 배치. **A2V 컷의 세그먼트는 A1에 배치하지 않는다**
 *    (클립 내장 보이스와 이중 재생 방지 — §A2V 오디오 단일화). 자막(captions)은 그대로 유지.
 *  - A2: BGM 구간은 콘티 bgm_cue 시퀀스(start/change=구간 시작, stop=침묵)가 결정 —
 *    k번째 구간 ← k번째 bgm 행(assetId 순). 트랙 volumeDb -14dB.
 *  - 전환: §2.1a 사전 → 스키마 타입 매핑(dissolve→crossfade). ai-morph는 이번 사이클
 *    crossfade 폴백(+todo 마커).
 *  - 마커: 챕터 5개 kind:chapter(제목 포함 — 유튜브 챕터 직결) + 검수 포인트 kind:todo.
 *  - S6 편집 이관 플래그(크롭·트림)는 S6_CUT_ADJUSTMENTS 선언 표 → clip.sourceIn/duration +
 *    mask(crop) 이펙트로 반영. 수치 없는 권고는 todo 마커 + 경고 로그로만 남긴다.
 */

import { readFile, writeFile, mkdir, copyFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const SCHEMA_ENTRY = path.join(REPO_ROOT, 'src', 'electron', 'shared', 'project-schema.ts');

// 장면 간 휴지·엔딩 여백은 러닝타임 게이트(01-script §길이 게이트) 조정 레버다.
// main()에서 --scene-pause / --ending-margin 으로 덮어쓸 수 있다(기본값은 종전 동작 보존).
let SCENE_PAUSE_SECONDS = 0.3;
let ENDING_MARGIN_SECONDS = 1.0;
const ENDING_FADE_SECONDS = 1.0;  // 엔딩 페이드 길이 — 여백을 늘려도 페이드는 1초 고정
const I2V_SPEED = 0.5;               // [v2 레거시 전용] WAN 16fps 소스 슬로우 (5.06s → 10.12s)
                                     // v3(LTX-2.3 24fps 실모션)에서는 사용하지 않는다 — 배속 1.0 고정.
const BGM_TRACK_GAIN_DB = -14;       // 나레이션 대비 BGM 게인 (트랙 volumeDb 지원 확인됨)
const PROJECT_FPS_BY_CYCLE = { v2: 30, v3: 24 }; // v3: LTX-2.3 클립이 24fps — 리샘플 없이 정합
let PROJECT_FPS = PROJECT_FPS_BY_CYCLE.v3;       // main()에서 --cycle에 따라 확정
const PROJECT_WIDTH = 1920;
const PROJECT_HEIGHT = 1080;
const ROUND = 3;                     // 초 단위 소수 자릿수

// ---------------------------------------------------------------------------
// 경로 리터럴 (구 -v2 하드코딩 제거 — 사이클별 상수 + CLI 인자로 정리)
// ---------------------------------------------------------------------------

const COMFY_OUTPUT_ROOT = 'E:\\ai_tool\\ComfyUI\\output\\danbi';
const TTS_OUTPUT_ROOT = 'E:\\ai_tool\\tts_make\\outputs\\danbi';

const CYCLE_PATHS = {
  v2: { cuts: 'cuts', clips: 'i2v', clipsUpscaled: null, tts: 'tts-x11', assetSuffix: '-v2' },
  v3: {
    cuts: 'cuts-v3',
    clips: 'clips-v3',
    // 업스케일 산출 폴더. 03-assets §업스케일 섹션에 매핑 표가 append되면 그 표가 우선하고,
    // 없으면 `clips-v3-1080p\CUT-NN.mp4` 규칙을 가정한다(--upscaled 사용 시).
    clipsUpscaled: 'clips-v3-1080p',
    tts: 'tts-v21',
    assetSuffix: '-v3',
  },
};

// ---------------------------------------------------------------------------
// S6 편집 이관 플래그 (03-assets 기록의 선언적 표현)
// ---------------------------------------------------------------------------
// 출처: 03-assets.md §잔여 작업 인계 4 / §채택 54컷 비고 / §A2V 립싱크 5컷 비고 /
//       §CUT-16 관모 소품 제거 재작업 / §I2V 보정 패스 f.
// - trimIn/trimOut(초, 소스 클립 기준): 지정 시 clip.sourceIn = trimIn, 유효 소스 길이 = trimOut-trimIn.
//   컷 duration이 유효 소스 길이보다 길면 그 초과분은 채울 수 없으므로 경고 + todo 마커로 남긴다
//   (인간이 편집기에서 앞뒤 컷 재배분/홀드 처리 — 자동 배속 보정은 하지 않는다: 이중 모션·저더 금지).
// - crop: mask 이펙트(left/right/top/bottom 비율 0~1) — 렌더러 지원 확인(crop-mask.ts / ffmpeg-renderer).
// - advisory: 수치 없는 권고 — 경고 로그 + todo 마커만. 자동 적용 없음.
const S6_CUT_ADJUSTMENTS = {
  'CUT-04': {
    advisory: '앞구간 사용 검토 — static 지시 위반 푸시인 + 인물 프레임 진입(3테이크 공통, 재생성 2회 소진)',
  },
  'CUT-07': {
    crop: { bottom: 0.18 },
    advisory: '앞 2/3 구간 사용 권고(말미 물레 구조 붕괴). 하단 크롭은 얼굴 미노출 원칙상 필수 — 비율은 편집기에서 육안 조정',
    note: '얼굴 미노출 원칙(콘티 §시각 문법 3) — 소년 얼굴 하단 크롭 필수',
  },
  'CUT-11': {
    trimOut: 12.6,
    note: 'A2V — 발화 종료 12.6s(리드 패딩 0.30s + 보이스 12.30s) 직후 컷 권장(03-assets §CUT-11 A2V 재생성 r2)',
  },
  'CUT-13': {
    trimOut: 6.4,
    note: 'A2V 말미 조도 페이드 격리 — 03-assets §A2V "S6 6.4s 이전 컷 필수"(발화 6.06s + 리드 패딩)',
  },
  'CUT-16': {
    advisory: '앞 ~4초(f0~96) 사용 권고 — i3m1 말미 카메라 푸시인 드리프트(3라운드 소진, 클립 내 해소 실패)',
  },
  'CUT-28': {
    advisory: '★whip pan — 블러 구간 내 컷 전환 필수(종착부 현대풍 도로/차선 유사). 전환 지점은 편집기에서 프레임 지정',
  },
  'CUT-32': {
    crop: { bottom: 0.18 },
    note: '얼굴 미노출 원칙 — 장영실 얼굴(하향 시선) 하단 크롭 필수',
  },
  'CUT-35': {
    crop: { top: 0.10 },
    note: '관모 상단 프레임아웃 미달 — S6 상단 크롭 이관(03-assets §A2V 비고)',
  },
  'CUT-37': {
    advisory: '좌측 전신주형 기둥·원경 차형 실루엣 — 크롭/리터치 이관(수치 미정)',
  },
  'CUT-38': {
    advisory: '우측 지면 본문 중복 + 글리프 변형 — 좌측 지면 크롭 또는 나노바나나 스틸 대체 검토',
  },
  'CUT-48': {
    advisory: '말미 암전 반복(3테이크 공통) — 앞 2/3 사용 또는 wipe 전 페이드 수용 판단',
  },
  'CUT-51': {
    advisory: '대안 테이크(r1 — 페인터리 최상이나 준정지) 인간 선택 여지',
  },
};

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

// 크롭 = mask 이펙트(left/right/top/bottom 비율). src/lib/editor/crop-mask.ts CROP_MASK_EFFECT_LABEL 정합.
const CROP_EFFECT_LABEL = 'Crop';

const BOOLEAN_FLAGS = new Set(['upscaled', 'kenburns', 'offline', 'no-insert-cuts']);

function parseArgs(argv) {
  const args = {
    api: 'http://localhost:3000',
    steps: 'import,compile,save,preflight',
    cycle: 'v3',
    prefer: 'clip', // clip | still — v3 기본은 클립 우선(정지 이미지는 폴백 경로로만 유지)
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      args[name] = true;
      continue;
    }
    args[name] = argv[i + 1];
    i += 1;
  }
  for (const required of ['storyboard', 'assets', 'script']) {
    if (!args[required]) {
      throw new Error(`--${required} <path> is required`);
    }
  }
  if (!CYCLE_PATHS[args.cycle]) {
    throw new Error(`--cycle must be one of ${Object.keys(CYCLE_PATHS).join('|')} (got ${args.cycle})`);
  }
  if (!['clip', 'still'].includes(args.prefer)) {
    throw new Error(`--prefer must be clip|still (got ${args.prefer})`);
  }
  return args;
}

// ffprobe 실측 (문서 표보다 파일이 원천 — 채택 테이크 교체로 표가 stale일 수 있다)
let ffprobeAvailable = true;
async function probeDuration(filePath) {
  if (!ffprobeAvailable || !existsSync(filePath)) return undefined;
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath,
    ]);
    const value = Number(String(stdout).trim());
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch (error) {
    if (String(error?.code) === 'ENOENT') {
      ffprobeAvailable = false;
      console.warn('  warn: ffprobe not found — 문서 표의 실측값으로 폴백합니다');
    }
    return undefined;
  }
}

async function probeHasAudioStream(filePath) {
  if (!ffprobeAvailable || !existsSync(filePath)) return undefined;
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', filePath,
    ]);
    return String(stdout).trim().length > 0;
  } catch {
    return undefined;
  }
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

// ---------------------------------------------------------------------------
// 1-b. v3 입력 파싱 (콘티 v3 / LTX-2.3 사이클)
//   03-assets의 v3 기록은 레거시 11열 "에셋 레코드" 표가 아니라 섹션별 append 표에 있다.
//   - §채택 59컷            → 컷 정지 이미지 (cuts-v3\)
//   - §채택 54컷            → I2V 클립       (clips-v3\)
//   - §A2V 립싱크 5컷        → A2V 클립 + 내장 보이스 wav
//   - §세그먼트 실측표(32)   → TTS 세그먼트   (tts-v21\) + §채택 확정 오버라이드
//   - 보정/교정/재작업 섹션  → 채택본 교체(문서 순서대로 last-wins)
//   - BGM은 레거시 대장 표(type=bgm)를 그대로 승계 — v3 신규 생성 없음
// ---------------------------------------------------------------------------

const CUT_FILE_RE = /CUT-\d{2}[A-Za-z0-9._-]*\.(?:mp4|png)/g;
const TTS_FILE_RE = /N\d{2}-\d{2}[A-Za-z0-9._-]*\.wav/g;
const REJECT_MARKERS = /불합격|미채택|비채택|기각|stale|보존 —/;

const stripStrike = (text) => text.replace(/~~[^~]*~~/g, ' ');
const lastMatch = (text, regex) => {
  const found = String(text).match(regex);
  return found ? found[found.length - 1] : undefined;
};
const cellsOf = (line) => line.split('|').map((cell) => cell.trim());
const isTableRow = (line) => line.trimStart().startsWith('|') && !/^\s*\|[\s:|-]+\|\s*$/.test(line);

// 헤딩 술어에 맞는 첫 섹션 본문(다음 동급/상위 헤딩 전까지)
function sectionBody(markdown, predicate) {
  const lines = markdown.split('\n');
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (!heading) continue;
    if (start === -1) {
      if (predicate(heading[2])) {
        start = i + 1;
        level = heading[1].length;
      }
    } else if (heading[1].length <= level) {
      return lines.slice(start, i).join('\n');
    }
  }
  return start === -1 ? null : lines.slice(start).join('\n');
}

// 헤딩 술어에 맞는 모든 섹션을 문서 순서대로 반환
function sectionsBodies(markdown, predicate, { after } = {}) {
  const lines = markdown.split('\n');
  const startIndex = after
    ? lines.findIndex((line) => /^#{1,6}\s/.test(line) && after(line.replace(/^#{1,6}\s+/, '')))
    : 0;
  const bodies = [];
  let start = -1;
  let level = 0;
  for (let i = Math.max(startIndex, 0); i < lines.length; i += 1) {
    const heading = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (!heading) continue;
    if (start !== -1 && heading[1].length <= level) {
      bodies.push(lines.slice(start, i).join('\n'));
      start = -1;
    }
    if (start === -1 && predicate(heading[2])) {
      start = i + 1;
      level = heading[1].length;
    }
  }
  if (start !== -1) bodies.push(lines.slice(start).join('\n'));
  return bodies;
}

function parseAdoptedCutFileTable(body, extension) {
  const map = new Map();
  if (!body) return map;
  for (const line of body.split('\n')) {
    if (!isTableRow(line)) continue;
    const cells = cellsOf(line);
    if (!/^CUT-\d{2}$/.test(cells[1] ?? '')) continue;
    const file = lastMatch(stripStrike(cells[2] ?? ''), CUT_FILE_RE);
    if (!file || !file.endsWith(extension)) continue;
    map.set(cells[1], { file, row: cells });
  }
  return map;
}

// 보정/교정/재작업 섹션의 채택 행 → 컷별 파일 교체(문서 순서 last-wins)
function parseCutFileOverrides(markdown, extension) {
  const overrides = new Map();
  const bodies = sectionsBodies(
    markdown,
    (heading) => /보정 패스|교정 패스|재작업|재생성/.test(heading),
    { after: (heading) => /콘티 v3 컷 렌더/.test(heading) },
  );
  for (const body of bodies) {
    for (const line of body.split('\n')) {
      if (!isTableRow(line)) continue;
      if (REJECT_MARKERS.test(line)) continue;
      if (!/채택/.test(line)) continue;
      const cut = line.match(/CUT-\d{2}/)?.[0];
      if (!cut) continue;
      const file = lastMatch(stripStrike(line), CUT_FILE_RE);
      if (!file || !file.endsWith(extension)) continue;
      overrides.set(cut, file);
    }
  }
  return overrides;
}

function parseTtsAdoptionOverrides(markdown) {
  const overrides = new Map(); // 'N04-02' -> filename
  for (const body of sectionsBodies(markdown, (heading) => /채택 확정/.test(heading))) {
    for (const rawLine of body.split('\n')) {
      const line = stripStrike(rawLine);
      if (isTableRow(line)) {
        const cells = cellsOf(line);
        if (!/^N\d{2}-\d{2}$/.test(cells[1] ?? '')) continue;
        const file = lastMatch(line, TTS_FILE_RE);
        if (file) overrides.set(cells[1], file);
        continue;
      }
      const bullet = line.match(/\*\*(N\d{2}-\d{2}) 채택 = `([^`]+\.wav)`/);
      if (bullet) overrides.set(bullet[1], bullet[2]);
    }
  }
  return overrides;
}

function parseTtsSegmentsV3(markdown) {
  const body = sectionBody(markdown, (heading) => /세그먼트 실측표/.test(heading));
  if (!body) throw new Error('03-assets.md: §세그먼트 실측표 section not found (v3 TTS 필요)');

  const segments = [];
  for (const line of body.split('\n')) {
    if (!isTableRow(line)) continue;
    const cells = cellsOf(line);
    const assetId = cells[1];
    const match = assetId?.match(/^N(\d{2})-(\d{2})-(.+)$/);
    if (!match) continue;
    const duration = Number(cells[3]);
    if (!Number.isFinite(duration)) throw new Error(`03-assets.md: bad tts duration for ${assetId}`);
    // 비고 칸의 "인간 채택 확정 = `X.wav`" 도 오버라이드 원천
    const inlineAdopted = cells[6]?.match(/채택 확정 = `([^`]+\.wav)`/)?.[1];
    segments.push({
      assetId,
      segmentKey: `N${match[1]}-${match[2]}`,
      scene: Number(match[1]),
      order: Number(match[2]),
      speaker: match[3],
      file: inlineAdopted ?? `${assetId}.wav`,
      docDuration: duration,
    });
  }
  if (segments.length === 0) throw new Error('03-assets.md: §세그먼트 실측표 rows not parsed');

  const overrides = parseTtsAdoptionOverrides(markdown);
  for (const segment of segments) {
    const adopted = overrides.get(segment.segmentKey);
    if (adopted) segment.file = adopted;
  }
  segments.sort((a, b) => (a.scene - b.scene) || (a.order - b.order));
  return segments;
}

function parseA2vTable(markdown) {
  const body = sectionBody(markdown, (heading) => /A2V 립싱크/.test(heading));
  if (!body) return new Map();
  const map = new Map();
  for (const line of body.split('\n')) {
    if (!isTableRow(line)) continue;
    const cells = cellsOf(line);
    if (!/^CUT-\d{2}$/.test(cells[1] ?? '')) continue;
    const file = lastMatch(stripStrike(cells[2] ?? ''), CUT_FILE_RE);
    const audioFile = lastMatch(stripStrike(cells[3] ?? ''), TTS_FILE_RE);
    const docDuration = Number(lastMatch(cells[5] ?? '', /([\d.]+)s/g)?.replace('s', ''));
    map.set(cells[1], { file, audioFile, docDuration });
  }
  return map;
}

function parseBgmLedger(markdown) {
  const bgm = [];
  for (const line of markdown.split('\n')) {
    if (!isTableRow(line)) continue;
    const cells = cellsOf(line);
    if (cells.length < 11 || cells[2] !== 'bgm') continue;
    bgm.push({ assetId: cells[1], path: cells[4], duration: Number(cells[5]), cutRange: cells[3] });
  }
  bgm.sort((a, b) => a.assetId.localeCompare(b.assetId));
  return bgm;
}

// 업스케일 산출 매핑: 03-assets §업스케일 섹션(다른 에이전트 append 예정)의 표가 있으면 그것이 권위,
// 없으면 `clips-v3-1080p\CUT-NN.mp4` 규칙을 가정한다(가정임을 로그로 명시).
function parseUpscaleMap(markdown) {
  const body = sectionBody(markdown, (heading) => /업스케일/.test(heading) && !/체인/.test(heading));
  if (!body) return null;
  const map = parseAdoptedCutFileTable(body, '.mp4');
  return map.size > 0 ? new Map([...map].map(([cut, entry]) => [cut, entry.file])) : null;
}

// 03-assets §S6 삽입 컷 — 콘티 본문(02-storyboard)에 없는, S6가 타임라인에만 편입하는 보조 컷.
// 콘티 컷 번호 체계 편입은 인간 소관이므로 02-storyboard는 건드리지 않고 이 세로형 표만 소비한다.
// 표 형식: | 항목 | 값 |  (컷 ID / 미디어 키 / 1080p 파일 / 소스 이미지 / 담당 나레이션 /
//                          배치 / shot_type / camera / transition / bgm_cue / 취지)
function parseS6InsertCuts(markdown) {
  const inserts = [];
  for (const body of sectionsBodies(markdown, (heading) => /S6 삽입 컷/.test(heading))) {
    const row = new Map();
    for (const line of body.split('\n')) {
      if (!isTableRow(line)) continue;
      const cells = cellsOf(line);
      if (cells.length < 4) continue;
      row.set(cells[1], cells[2]);
    }
    if (row.size === 0) continue;

    const idCell = row.get('컷 ID') ?? '';
    const cutId = idCell.match(/CUT-\d{2}[A-Z]/)?.[0];
    if (!cutId) throw new Error('03-assets §S6 삽입 컷: 컷 ID를 읽지 못했습니다');
    const afterCut = idCell.match(/기존\s+(CUT-\d{2})\s*\*\*직후\*\*/)?.[1];
    if (!afterCut) throw new Error(`${cutId}: 삽입 위치("기존 CUT-NN **직후**")를 읽지 못했습니다`);

    const mediaKey = row.get('미디어 키')?.match(/CUT-\d{2}[A-Z]-[a-z0-9]+/)?.[0];
    const clipFile = row.get('1080p 파일')?.match(/([A-Za-z0-9_.-]+\.mp4)/)?.[1];
    const imageFile = row.get('소스 이미지')?.match(/([A-Za-z0-9_.-]+\.png)/)?.[1];
    const scene = Number(row.get('담당 나레이션')?.match(/N(\d{2})/)?.[1]);
    const placement = row.get('배치') ?? '';
    const docDuration = Number(placement.match(/duration\s+\*{0,2}([\d.]+)\s*\*{0,2}s/)?.[1]);
    const speed = Number(placement.match(/speed\s+\*{0,2}([\d.]+)/)?.[1] ?? '1');
    const transition = row.get('transition')?.match(/out:\s*([a-z-]+)/)?.[1] ?? 'cut';
    const bgmCue = row.get('bgm_cue')?.match(/^(start|change|continue|stop)/)?.[1] ?? 'continue';

    if (!mediaKey || !clipFile || !imageFile || !Number.isFinite(scene) || !Number.isFinite(docDuration)) {
      throw new Error(
        `${cutId}: §S6 삽입 컷 표 필수 항목 누락 — `
        + `미디어 키=${mediaKey} 클립=${clipFile} 이미지=${imageFile} 장면=${scene} duration=${docDuration}`,
      );
    }
    if (!(transition in TRANSITION_MAP)) {
      throw new Error(`${cutId}: transition "${transition}"이 §2.1a 어휘 밖입니다`);
    }
    if (Math.abs(speed - 1) > 0.001) {
      throw new Error(`${cutId}: 삽입 컷은 speed 1.0만 지원합니다(표 값 ${speed})`);
    }

    // 정렬 키: CUT-36B → 36.02 (기존 36 뒤, 37 앞). 알파벳 접미가 순서를 결정한다.
    const base = Number(cutId.slice(4, 6));
    const suffixRank = cutId.charCodeAt(6) - 64; // A=1, B=2 ...
    if (base !== Number(afterCut.slice(4))) {
      throw new Error(`${cutId}: 삽입 위치 ${afterCut}와 컷 번호가 어긋납니다`);
    }

    inserts.push({
      id: cutId, no: base + suffixRank / 100, afterCut, mediaKey, clipFile, imageFile,
      scene, docDuration, transition, bgmCue,
    });
  }
  return inserts;
}

// 삽입 컷을 콘티 컷 배열과 에셋 맵에 편입한다(02-storyboard 무수정).
// 길이는 문서 값이 아니라 파일 ffprobe가 원천 — fixedDuration으로 고정 배치한다.
async function applyS6InsertCuts(cuts, assetsDoc, inserts, args, warnings) {
  if (inserts.length === 0) return [];
  const applied = [];
  const useUpscaled = Boolean(args.upscaled);
  const upscaledDir = args['clips-dir'] ?? assetsDoc.paths.clipsUpscaled;
  const clipDir = useUpscaled ? upscaledDir : assetsDoc.paths.clips;

  for (const insert of inserts) {
    if (cuts.some((cut) => cut.id === insert.id)) {
      warnings.push(`${insert.id}: 콘티 본문에 이미 존재해 삽입을 건너뜁니다`);
      continue;
    }
    const anchor = cuts.find((cut) => cut.id === insert.afterCut);
    if (!anchor) throw new Error(`${insert.id}: 삽입 기준 컷 ${insert.afterCut}이 콘티에 없습니다`);

    const clipPath = path.join(assetsDoc.mediaRoot, clipDir, insert.clipFile);
    if (!existsSync(clipPath)) throw new Error(`${insert.id}: 클립 파일 없음 — ${clipPath}`);
    const probed = await probeDuration(clipPath);
    const duration = round(probed ?? insert.docDuration);
    if (probed !== undefined && Math.abs(probed - insert.docDuration) > 0.05) {
      warnings.push(`${insert.id}: 03-assets 표 ${insert.docDuration}s ≠ 파일 실측 ${duration}s — 파일 실측을 채택`);
    }

    assetsDoc.images.set(insert.id, {
      assetId: `${insert.id}${assetsDoc.paths.assetSuffix}`,
      cutId: insert.id,
      file: insert.imageFile,
      path: path.join(assetsDoc.mediaRoot, assetsDoc.paths.cuts, insert.imageFile),
    });
    assetsDoc.clips.set(insert.id, {
      assetId: insert.mediaKey, cutId: insert.id, file: insert.clipFile, kind: 'i2v',
      path: clipPath, duration, hasAudio: await probeHasAudioStream(clipPath),
    });

    cuts.push({
      id: insert.id,
      no: insert.no,
      durationPlan: duration,
      fixedDuration: duration,     // 슬롯을 비율 분배가 아니라 실측 길이로 고정(배속 1.0 보장)
      scene: insert.scene,
      transition: insert.transition,
      chapter: undefined,
      subtitle: undefined,
      isTitleCard: false,
      bgmCue: insert.bgmCue,
      isI2V: true,
      isA2V: false,
      a2vSegmentKey: undefined,
      zoomOut: false,
      s6Insert: true,
    });
    applied.push({ ...insert, duration });
  }
  cuts.sort((a, b) => a.no - b.no);
  return applied;
}

function parseAssetsDocV3(markdown, { cycle }) {
  const productionId = markdown.match(/^production_id:\s*(\S+)/m)?.[1];
  if (!productionId) throw new Error('03-assets.md: production_id not found');

  const paths = CYCLE_PATHS[cycle];
  const mediaRoot = path.join(COMFY_OUTPUT_ROOT, productionId);
  const ttsRoot = path.join(TTS_OUTPUT_ROOT, productionId, paths.tts);

  const imageTable = parseAdoptedCutFileTable(
    sectionBody(markdown, (heading) => /채택 \d+컷 \(Z-Image/.test(heading)),
    '.png',
  );
  const clipTable = parseAdoptedCutFileTable(
    sectionBody(markdown, (heading) => /채택 \d+컷 \(I2V/.test(heading)),
    '.mp4',
  );
  const a2vTable = parseA2vTable(markdown);
  const imageOverrides = parseCutFileOverrides(markdown, '.png');
  const clipOverrides = parseCutFileOverrides(markdown, '.mp4');

  const images = new Map();
  for (const [cut, entry] of imageTable) {
    images.set(cut, { assetId: `${cut}${paths.assetSuffix}`, cutId: cut, file: entry.file });
  }
  for (const [cut, file] of imageOverrides) {
    if (!images.has(cut)) continue;
    images.get(cut).file = file;
  }
  for (const image of images.values()) {
    image.path = path.join(mediaRoot, paths.cuts, image.file);
  }

  const clips = new Map();
  for (const [cut, entry] of clipTable) {
    clips.set(cut, { assetId: `${cut}-i2v`, cutId: cut, file: entry.file, kind: 'i2v' });
  }
  for (const [cut, entry] of a2vTable) {
    if (!entry.file) continue;
    clips.set(cut, { assetId: `${cut}-a2v`, cutId: cut, file: entry.file, kind: 'a2v', audioFile: entry.audioFile });
  }
  for (const [cut, file] of clipOverrides) {
    if (!clips.has(cut)) continue;
    clips.get(cut).file = file;
  }
  for (const clip of clips.values()) {
    clip.path = path.join(mediaRoot, paths.clips, clip.file);
  }

  const tts = parseTtsSegmentsV3(markdown).map((segment) => ({
    ...segment,
    path: path.join(ttsRoot, segment.file),
    duration: segment.docDuration,
    // 채택 테이크 교체 시 파일명이 표 실측과 다를 수 있으므로 mappingKey를 파일 기준으로 분리
    mappingKey: segment.file.replace(/\.wav$/i, ''),
  }));

  const bgm = parseBgmLedger(markdown);
  const upscaleMap = parseUpscaleMap(markdown);

  return { productionId, mediaRoot, ttsRoot, paths, images, clips, tts, bgm, a2vTable, upscaleMap };
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

// ---------------------------------------------------------------------------
// v3 컷별 에셋 해석 + 실측(ffprobe)
// ---------------------------------------------------------------------------

const A2V_LEAD_PAD_SECONDS = 0.3;  // 03-assets §오디오 패딩(앞 0.2~0.35s, CUT-11 확정 0.30s)
const MIN_FIT_SPEED = 0.85;        // 소스가 컷보다 짧을 때 허용하는 최소 배속(≈15% 스트레치)

async function resolveCutAssetsV3(cuts, assetsDoc, args, sourceMap, warnings) {
  const paths = assetsDoc.paths;
  const useUpscaled = Boolean(args.upscaled);
  const upscaledDir = args['clips-dir'] ?? paths.clipsUpscaled;

  if (useUpscaled && !assetsDoc.upscaleMap) {
    warnings.push(
      `업스케일 경로: 03-assets에 §업스케일 매핑 표가 아직 없어 규칙 가정(${upscaledDir}\\CUT-NN.mp4)으로 해석합니다 — `
      + '표가 append되면 자동으로 그 표가 우선합니다',
    );
  }

  for (const cut of cuts) {
    const image = assetsDoc.images.get(cut.id);
    if (!image) throw new Error(`${cut.id}: 03-assets §채택 59컷에 채택 이미지 행이 없습니다`);
    cut.imageAsset = image;

    const clip = assetsDoc.clips.get(cut.id);
    if (clip) {
      if (useUpscaled) {
        const mapped = assetsDoc.upscaleMap?.get(cut.id) ?? `${cut.id}.mp4`;
        clip.originalPath = clip.path;
        clip.path = path.join(assetsDoc.mediaRoot, upscaledDir, mapped);
        clip.file = mapped;
      }
      cut.clipAsset = clip;
    }

    // A2V 자동 판별 교차 검증: 콘티 a2v 필드 ↔ 03-assets §A2V 5컷 표
    const inA2vTable = assetsDoc.a2vTable.has(cut.id);
    if (cut.isA2V !== inA2vTable) {
      throw new Error(
        `${cut.id}: A2V 판별 불일치 — 콘티 a2v=${cut.isA2V ? '예' : '아니오'} / 03-assets §A2V 표 ${inA2vTable ? '존재' : '없음'}`,
      );
    }
    if (cut.isA2V) {
      const row = assetsDoc.a2vTable.get(cut.id);
      const boundKey = row.audioFile?.match(/^N\d{2}-\d{2}/)?.[0];
      if (cut.a2vSegmentKey && boundKey && cut.a2vSegmentKey !== boundKey) {
        throw new Error(`${cut.id}: A2V 세그먼트 불일치 — 콘티 ${cut.a2vSegmentKey} / 03-assets ${boundKey}`);
      }
      cut.a2vSegmentKey = cut.a2vSegmentKey ?? boundKey;
      if (!cut.a2vSegmentKey) throw new Error(`${cut.id}: A2V 컷이지만 바인딩된 TTS 세그먼트를 찾지 못했습니다`);
    }

    // 매핑 표 교차 검증(콘티 계약 헤딩 — v3 내용). 어긋나면 경고만(에셋 해석은 03-assets가 원천).
    const mapEntry = sourceMap?.get(cut.id);
    if (mapEntry?.i2vAssetId) {
      const expectA2V = /-a2v$/i.test(mapEntry.i2vAssetId);
      if (expectA2V !== cut.isA2V) {
        warnings.push(`${cut.id}: 콘티 매핑 표 i2v id(${mapEntry.i2vAssetId})와 a2v 필드가 어긋납니다`);
      }
    }
  }

  // 실측: 문서 표가 아니라 파일이 원천
  const missing = [];
  for (const cut of cuts) {
    if (!existsSync(cut.imageAsset.path)) missing.push(`${cut.id} image: ${cut.imageAsset.path}`);
    if (cut.clipAsset) {
      if (!existsSync(cut.clipAsset.path)) {
        missing.push(`${cut.id} clip: ${cut.clipAsset.path}`);
      } else if (cut.clipAsset.duration === undefined) {
        cut.clipAsset.duration = await probeDuration(cut.clipAsset.path);
        cut.clipAsset.hasAudio = await probeHasAudioStream(cut.clipAsset.path);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`미디어 파일 누락 ${missing.length}건:\n  - ${missing.join('\n  - ')}`);
  }

  // A2V 클립인데 오디오 스트림이 없으면 이중화 규칙(클립 내장 채택)이 성립하지 않는다.
  for (const cut of cuts) {
    if (cut.isA2V && cut.clipAsset?.hasAudio === false) {
      throw new Error(`${cut.id}: A2V 클립에 오디오 스트림이 없습니다 — 오디오 단일화 규칙 재검토 필요(${cut.clipAsset.path})`);
    }
    if (!cut.isA2V && cut.clipAsset?.hasAudio === true) {
      warnings.push(`${cut.id}: I2V 클립에 오디오 스트림이 있습니다 — muted=true로 배치합니다(LTX 생성 오디오 혼입 방지)`);
    }
  }
}

// 컷별 유효 소스 길이 = min(클립 실측, S6 trimOut).
// 주의: ffmpeg 렌더러는 clip.sourceIn을 영상 트림에 반영하지 않는다(항상 소스 0부터 trim).
//       따라서 "앞부분만 사용" 계열 보정은 duration 단축으로만 표현 가능하다.
function effectiveSourceLength(cut) {
  const clipDuration = cut.clipAsset?.duration;
  if (!Number.isFinite(clipDuration)) return undefined;
  const adjustment = S6_CUT_ADJUSTMENTS[cut.id];
  const trimOut = Number.isFinite(adjustment?.trimOut) ? adjustment.trimOut : undefined;
  return trimOut === undefined ? clipDuration : Math.min(clipDuration, trimOut);
}

// 01-script.md 장면 블록의 나레이션/대사 라인 추출 — TTS 세그먼트와 순서 1:1 매핑
function parseScriptDialogues(markdown) {
  const dialogues = new Map(); // scene number -> [{ speaker, text }]
  // v2.1 대본은 헤딩에 부제가 붙는다: "## 장면 04 (N04) — 조정의 논쟁 [사실 대사]"
  const blocks = markdown.split(/^## 장면 \d+ \(N(\d{2})\).*$/m);
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

    // A2V(립싱크) 컷 — 클립에 보이스가 내장돼 있다. "예 — N04-02(세종) 립싱크" 형식에서
    // 바인딩된 TTS 세그먼트 키까지 함께 읽어 A1 트랙 이중 배치를 막는다(오디오 단일화 규칙).
    const a2vRaw = field('a2v') ?? '아니오';
    const isA2V = /^예/.test(a2vRaw);
    const a2vSegmentKey = isA2V ? a2vRaw.match(/N\d{2}-\d{2}/)?.[0] : undefined;

    if (!Number.isFinite(durationPlan) || !Number.isFinite(scene)) {
      throw new Error(`${id}: duration_seconds/narration_ref parse failure`);
    }
    if (!(transitionRaw in TRANSITION_MAP)) {
      throw new Error(`${id}: transition "${transitionRaw}" outside §2.1a vocabulary — blocked`);
    }

    cuts.push({
      id, no, durationPlan, scene, transition: transitionRaw, chapter, subtitle, isTitleCard, bgmCue,
      isI2V: /^I2V/i.test(motion),
      isA2V, a2vSegmentKey,
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

async function importMedia(apiBase, cuts, assetsDoc, mappingPath, { cycle = 'v2', preferStill = false, embeddedSegmentKeys = new Set() } = {}) {
  const mapping = existsSync(mappingPath)
    ? JSON.parse(await readFile(mappingPath, 'utf8'))
    : {};

  const jobs = [];
  const seen = new Set();
  const addJob = (key, filePath, note) => {
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push({ key, path: filePath, note });
  };
  for (const cut of cuts) {
    if (cycle === 'v3') {
      // v3는 클립 우선 — 정지 이미지는 폴백으로 쓰이는 컷만 반입한다(불필요한 대용량 반입 방지).
      const useStill = preferStill || !cut.clipAsset;
      if (useStill) addJob(cut.imageAsset.assetId, cut.imageAsset.path, `still ${cut.id}`);
      else addJob(cut.clipAsset.assetId, cut.clipAsset.path, `${cut.clipAsset.kind} ${cut.id}`);
      continue;
    }
    addJob(cut.imageAsset.assetId, cut.imageAsset.path, `image ${cut.id}`);
    if (cut.i2vAsset) addJob(cut.i2vAsset.assetId, cut.i2vAsset.path, 'i2v');
  }
  for (const seg of assetsDoc.tts) {
    if (cycle === 'v3' && embeddedSegmentKeys.has(seg.assetId)) continue; // A2V 내장 — A1 미배치
    addJob(seg.mappingKey ?? seg.assetId, seg.path, 'tts');
  }
  for (const track of assetsDoc.bgm) addJob(track.assetId, track.path, 'bgm');

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

// 오프라인 반입(--offline): API 서버 없이 로컬 절대 경로를 그대로 renderPath로 사용한다.
// 드라이런 컴파일·경로 스위치 검증용 — 렌더러는 renderPath를 직접 읽으므로 렌더도 가능하다.
async function importMediaOffline(cuts, assetsDoc, mappingPath, { cycle, preferStill, embeddedSegmentKeys }) {
  const mapping = existsSync(mappingPath) ? JSON.parse(await readFile(mappingPath, 'utf8')) : {};
  const jobs = [];
  const seen = new Set();
  const addJob = (key, filePath) => {
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push({ key, path: filePath });
  };
  for (const cut of cuts) {
    if (cycle === 'v3') {
      const useStill = preferStill || !cut.clipAsset;
      if (useStill) addJob(cut.imageAsset.assetId, cut.imageAsset.path);
      else addJob(cut.clipAsset.assetId, cut.clipAsset.path);
      continue;
    }
    addJob(cut.imageAsset.assetId, cut.imageAsset.path);
    if (cut.i2vAsset) addJob(cut.i2vAsset.assetId, cut.i2vAsset.path);
  }
  for (const seg of assetsDoc.tts) {
    if (cycle === 'v3' && embeddedSegmentKeys.has(seg.assetId)) continue;
    addJob(seg.mappingKey ?? seg.assetId, seg.path);
  }
  for (const track of assetsDoc.bgm) addJob(track.assetId, track.path);

  for (const job of jobs) {
    if (!existsSync(job.path)) throw new Error(`media file missing: ${job.path} (${job.key})`);
    const filename = path.basename(job.path);
    const mimeType = MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
    const probe = await probeStreamInfo(job.path);
    mapping[job.key] = {
      originalPath: job.path,
      originalName: filename,
      importedName: filename,
      source: job.path,
      renderPath: job.path,
      duration: probe.duration,
      ...(probe.width ? { width: probe.width } : {}),
      ...(probe.height ? { height: probe.height } : {}),
      ...(probe.fps ? { fps: probe.fps } : {}),
      mimeType,
      via: 'offline',
    };
  }
  await writeFile(mappingPath, JSON.stringify(mapping, null, 2));
  console.log(`media import (offline): ${jobs.length} entries (mapping: ${mappingPath})`);
  return mapping;
}

async function probeStreamInfo(filePath) {
  const duration = await probeDuration(filePath);
  let width;
  let height;
  let fps;
  if (ffprobeAvailable) {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', filePath,
      ]);
      const [w, h, rate] = String(stdout).trim().split(',');
      width = Number(w) || undefined;
      height = Number(h) || undefined;
      if (rate?.includes('/')) {
        const [num, den] = rate.split('/').map(Number);
        fps = den ? Number((num / den).toFixed(3)) : undefined;
      }
    } catch { /* 이미지/오디오는 무시 */ }
  }
  return { duration, width, height, fps };
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

// v3 타임라인: 실측(TTS ffprobe + 클립 ffprobe)이 시간을 지배.
//  1) 장면 스팬 = 장면 TTS 실측 합 + 꼬리(마지막 장면 엔딩 마진 / 그 외 장면 휴지)
//  2) A2V 컷은 클립 유효 길이에 고정(내장 보이스가 잘리면 안 됨) — 나머지 컷이 잔여 스팬을 계획 비율로 분배
//  3) 잔여가 부족하면 장면 스팬을 연장(그만큼 전체 길이 증가) — 계획이 아니라 실측이 이긴다
const cutUsesClip = (cut, preferStill) => !preferStill && Boolean(cut.clipAsset);

function computeTimelineV3(cuts, ttsSegments, warnings, preferStill = false) {
  const sceneAudio = new Map();
  for (const seg of ttsSegments) {
    sceneAudio.set(seg.scene, (sceneAudio.get(seg.scene) ?? 0) + seg.duration);
  }
  const scenes = [...sceneAudio.keys()].sort((a, b) => a - b);
  const lastScene = scenes[scenes.length - 1];

  const placedCuts = [];
  const sceneStart = new Map();
  const sceneSpan = new Map();
  let cursor = 0;

  const MIN_FREE_CUT = 1.5;

  for (const scene of scenes) {
    const tail = scene === lastScene ? ENDING_MARGIN_SECONDS : SCENE_PAUSE_SECONDS;
    const sceneCuts = cuts.filter((cut) => cut.scene === scene);
    const sceneSegs = ttsSegments.filter((seg) => seg.scene === scene);
    const sceneAt = cursor;
    sceneStart.set(scene, round(sceneAt));

    // (1) 오디오 우선 가배치 — 세그먼트별 잠정 시작 시각
    const provisionalSegStart = new Map();
    let audioAt = sceneAt;
    for (const seg of sceneSegs) {
      provisionalSegStart.set(seg.segmentKey, audioAt);
      audioAt += seg.duration;
    }

    // (2) A2V 앵커: 컷 시작 = 바인딩 세그먼트 시작 − 리드 패딩, 길이 = 클립 유효 길이(고정)
    const anchors = [];
    sceneCuts.forEach((cut, index) => {
      // 정지 이미지 폴백이면 클립 보이스를 쓰지 못하므로 고정하지 않는다(A1로 되돌린다).
      if (!cut.isA2V || !cutUsesClip(cut, preferStill)) return;
      const duration = effectiveSourceLength(cut);
      if (!Number.isFinite(duration)) throw new Error(`${cut.id}: A2V 컷의 클립 실측을 얻지 못했습니다`);
      const segStart = provisionalSegStart.get(cut.a2vSegmentKey);
      if (segStart === undefined) throw new Error(`${cut.id}: A2V 세그먼트 ${cut.a2vSegmentKey}를 장면 ${scene}에서 찾지 못했습니다`);
      anchors.push({ index, cutId: cut.id, start: segStart - A2V_LEAD_PAD_SECONDS, duration });
    });

    // (3) 블록 분할 후 전진 배치 — 앵커 사이의 자유 컷은 계획 비율로 분배
    const blocks = [];
    let sliceFrom = 0;
    for (const anchor of anchors) {
      blocks.push({ cuts: sceneCuts.slice(sliceFrom, anchor.index), anchor });
      sliceFrom = anchor.index + 1;
    }
    blocks.push({ cuts: sceneCuts.slice(sliceFrom), anchor: null });

    const plannedSceneEnd = sceneAt + sceneAudio.get(scene) + tail;
    let at = sceneAt;
    for (const block of blocks) {
      const floor = at + (block.cuts.length * MIN_FREE_CUT);
      const target = block.anchor ? Math.max(block.anchor.start, floor) : Math.max(plannedSceneEnd, floor);
      const blockSpan = Math.max(target - at, 0);
      if (block.anchor && block.anchor.start < target - 0.001) {
        warnings.push(
          `${block.anchor.cutId}: A2V 앵커가 ${round(target - block.anchor.start)}s 밀렸습니다 `
          + '(앞 컷 최소 길이 확보) — 내장 보이스와 자막이 그만큼 뒤로 이동합니다',
        );
      }
      // S6 삽입 컷은 실측 길이로 고정 배치한다(비율 분배 대상에서 제외 — 배속 1.0 보장).
      // 남은 스팬만 자유 컷이 계획 비율로 나눠 갖는다.
      const isFixed = (cut) => Number.isFinite(cut.fixedDuration);
      const freeCuts = block.cuts.filter((cut) => !isFixed(cut));
      const fixedSum = block.cuts.reduce((sum, cut) => sum + (isFixed(cut) ? cut.fixedDuration : 0), 0);
      const freeSpan = Math.max(blockSpan - fixedSum, 0);
      if (fixedSum > blockSpan + 0.001) {
        warnings.push(
          `${block.cuts.filter(isFixed).map((cut) => cut.id).join('·')}: 고정 길이 합 ${round(fixedSum)}s가 `
          + `블록 스팬 ${round(blockSpan)}s를 초과합니다 — 앞 컷이 압축됩니다`,
        );
      }
      const planSum = freeCuts.reduce((sum, cut) => sum + cut.durationPlan, 0);
      for (const cut of block.cuts) {
        const duration = isFixed(cut)
          ? cut.fixedDuration
          : (planSum > 0
            ? (freeSpan * cut.durationPlan) / planSum
            : freeSpan / Math.max(freeCuts.length, 1));
        const start = round(at);
        const end = round(at + duration);
        placedCuts.push({ ...cut, start, duration: round(end - start), end, pinned: false });
        at += duration;
      }
      at = block.anchor ? target : at;
      if (block.anchor) {
        const cut = sceneCuts[block.anchor.index];
        const start = round(at);
        const end = round(at + block.anchor.duration);
        placedCuts.push({ ...cut, start, duration: round(end - start), end, pinned: true });
        at += block.anchor.duration;
      }
    }

    // (3-b) 앵커가 밀리면 오디오 커서도 함께 밀린다 — 최종 오디오 끝을 다시 구해 장면 스팬을 보정
    //       (보정하지 않으면 다음 장면 첫 세그먼트와 겹친다).
    const anchorStartById = new Map(
      placedCuts.filter((cut) => cut.scene === scene && cut.pinned).map((cut) => [cut.a2vSegmentKey, cut.start]),
    );
    let audioAtFinal = sceneAt;
    for (const seg of sceneSegs) {
      const anchoredStart = anchorStartById.get(seg.segmentKey);
      if (anchoredStart !== undefined) audioAtFinal = Math.max(audioAtFinal, anchoredStart + A2V_LEAD_PAD_SECONDS);
      audioAtFinal += seg.duration;
    }
    const requiredEnd = audioAtFinal + tail;
    if (requiredEnd > at + 0.001) {
      // 고정 길이(S6 삽입) 컷은 늘리지 않는다 — 늘리면 배속 1.0 계약이 깨진다.
      // 장면 안에서 늘릴 수 있는 마지막 컷을 늘리고, 그 뒤 컷들은 같은 양만큼 뒤로 민다(갭·중첩 0 유지).
      const sceneIndices = placedCuts
        .map((cut, index) => (cut.scene === scene ? index : -1))
        .filter((index) => index >= 0);
      const growIndex = [...sceneIndices].reverse()
        .find((index) => !Number.isFinite(placedCuts[index].fixedDuration))
        ?? sceneIndices[sceneIndices.length - 1];
      const extra = requiredEnd - at;
      const grow = placedCuts[growIndex];
      grow.duration = round(grow.duration + extra);
      grow.end = round(grow.start + grow.duration);
      let shiftAt = grow.end;
      for (const index of sceneIndices) {
        if (index <= growIndex) continue;
        placedCuts[index].start = round(shiftAt);
        placedCuts[index].end = round(shiftAt + placedCuts[index].duration);
        shiftAt = placedCuts[index].end;
      }
      at = requiredEnd;
    }

    if (at > plannedSceneEnd + 0.001) {
      warnings.push(
        `N${String(scene).padStart(2, '0')}: A2V 고정 길이 때문에 장면 스팬이 `
        + `${round(plannedSceneEnd - sceneAt)}s → ${round(at - sceneAt)}s로 연장되었습니다(실측 우선)`,
      );
    }
    sceneSpan.set(scene, at - sceneAt);
    cursor = at;
  }
  const totalDuration = round(cursor);

  // (4) A1 최종 배치: 장면 시작에서 연속. A2V 세그먼트는 실제 컷 위치(+리드 패딩)에 맞춘다
  //     — 자막이 클립 내장 보이스와 어긋나지 않게 하는 기준.
  const cutBySegmentKey = new Map();
  for (const cut of placedCuts) {
    if (cut.isA2V && cut.pinned) cutBySegmentKey.set(cut.a2vSegmentKey, cut);
  }
  if (preferStill) {
    warnings.push('--prefer still: A2V 클립을 쓰지 않으므로 해당 세그먼트를 A1 TTS 트랙으로 되돌립니다(오디오 유실 방지)');
  }
  const placedTts = [];
  for (const scene of scenes) {
    let at = sceneStart.get(scene);
    for (const seg of ttsSegments.filter((item) => item.scene === scene)) {
      const a2vCut = cutBySegmentKey.get(seg.segmentKey);
      if (a2vCut) {
        const anchored = a2vCut.start + A2V_LEAD_PAD_SECONDS;
        if (anchored < at - 0.001) {
          warnings.push(`${a2vCut.id}: 내장 보이스 시작(${round(anchored)}s)이 직전 나레이션 끝(${round(at)}s)보다 이릅니다 — 겹침 확인 필요`);
        }
        at = Math.max(at, anchored);
        if (at > anchored + 0.15) {
          warnings.push(`${a2vCut.id}: 자막이 내장 보이스보다 ${round(at - anchored)}s 늦습니다 — 편집기에서 미세 조정 권장`);
        }
        placedTts.push({ ...seg, start: round(at), embeddedInClip: true, a2vCutId: a2vCut.id });
      } else {
        placedTts.push({ ...seg, start: round(at), embeddedInClip: false });
      }
      at += seg.duration;
    }
  }

  return { placedCuts, placedTts, sceneStart, sceneSpan, sceneAudio, totalDuration, scenes };
}

function buildProject({
  productionId, projectName, cuts, timeline, assetsDoc, mapping, scriptDialogues,
  cycle = 'v2', warnings = [], preferStill = false, kenBurns = cycle === 'v2',
}) {
  const { placedCuts, placedTts, totalDuration } = timeline;
  const nowIso = new Date().toISOString();
  const decisions = [];
  const isV3 = cycle === 'v3';
  const embeddedSegmentKeys = new Set(
    placedTts.filter((seg) => seg.embeddedInClip).map((seg) => seg.assetId),
  );

  const assets = [];
  const assetIdOf = new Map(); // mapping key -> editor asset id
  const pushMediaAsset = (key, kind, name, fallbackDuration, extraMetadata = {}) => {
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
      metadata: { productionId, vaultAssetId: key, mimeType: entry.mimeType ?? '', ...extraMetadata },
    });
    assetIdOf.set(key, id);
    return id;
  };

  for (const cut of cuts) {
    if (isV3) {
      // v3: 클립 우선. 정지 이미지는 클립이 없거나 --prefer still일 때만 에셋으로 올린다.
      const useStill = preferStill || !cut.clipAsset;
      if (useStill && !assetIdOf.has(cut.imageAsset.assetId)) {
        pushMediaAsset(cut.imageAsset.assetId, 'image', `${cut.id} still (${cut.imageAsset.assetId})`, 0);
      }
      if (!useStill && !assetIdOf.has(cut.clipAsset.assetId)) {
        // metadata.hasAudio가 true여야 렌더러가 클립 내장 오디오를 타임라인에 올린다
        // (ffmpeg-renderer hasRenderableEmbeddedAudio). A2V 컷만 true — 나머지는 무음 클립.
        pushMediaAsset(
          cut.clipAsset.assetId, 'video', `${cut.id} ${cut.clipAsset.kind.toUpperCase()}`, cut.clipAsset.duration,
          { hasAudio: cut.isA2V && cut.clipAsset.hasAudio !== false },
        );
      }
      continue;
    }
    if (!assetIdOf.has(cut.imageAsset.assetId)) {
      pushMediaAsset(cut.imageAsset.assetId, 'image', `${cut.id} still (${cut.imageAsset.assetId})`, 0);
    }
    if (cut.i2vAsset && !assetIdOf.has(cut.i2vAsset.assetId)) {
      pushMediaAsset(cut.i2vAsset.assetId, 'video', cut.i2vAsset.assetId, cut.i2vAsset.duration);
    }
  }
  for (const seg of assetsDoc.tts) {
    // A2V 컷의 세그먼트는 클립에 내장돼 A1에 배치하지 않는다 → 에셋도 올리지 않는다(미사용 에셋 방지).
    if (isV3 && embeddedSegmentKeys.has(seg.assetId)) continue;
    pushMediaAsset(seg.mappingKey ?? seg.assetId, 'audio', seg.assetId, seg.duration);
  }
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

    // ---- v3: 컷당 클립 1개(LTX-2.3 24fps 실모션). Ken Burns 자동 부여 없음 ----
    if (isV3) {
      const useStill = preferStill || !cut.clipAsset;
      if (useStill) {
        v1Clips.push(makeClip({
          id: `clip-${cut.id.toLowerCase()}-still`,
          assetId: imageAssetId,
          name: `${cut.id} 정지(폴백)`,
          kind: 'image',
          start: cut.start,
          duration: cut.duration,
          color: '#64748b',
          transitionOut,
          keyframes: kenBurns ? kenBurnsKeyframes(cut) : [],
        }));
        decisions.push(
          `${cut.id}: 정지 이미지 폴백(${cut.imageAsset.file ?? cut.imageAsset.assetId})`
          + `${kenBurns ? ' + Ken Burns' : ' — Ken Burns 없음'}`,
        );
        if (!preferStill) warnings.push(`${cut.id}: LTX 클립이 없어 정지 이미지로 폴백했습니다`);
        continue;
      }

      const adjustment = S6_CUT_ADJUSTMENTS[cut.id];
      const sourceLength = effectiveSourceLength(cut);
      let speed = 1;
      if (Number.isFinite(sourceLength) && sourceLength + 0.001 < cut.duration) {
        speed = round(sourceLength / cut.duration);
        const message = `${cut.id}: 소스 ${round(sourceLength)}s < 컷 ${cut.duration}s — 배속 ${speed}로 맞춤(공백 방지)`;
        if (speed < MIN_FIT_SPEED) {
          const note = `클립 ${round(sourceLength)}s로는 이 컷이 덮어야 할 나레이션 ${cut.duration}s를 채우지 못합니다 `
            + `(배속 ${speed} = ${Math.round(PROJECT_FPS * speed)}fps 상당). 선택지: ①클립 재생성(길이 연장) `
            + '②컷 분할/나레이션 재배분 ③현행 슬로우 수용 — 인간 판단';
          warnings.push(`${message} ⚠ 허용 하한 ${MIN_FIT_SPEED} 미만 — ${note}`);
          todoMarkers.push({ time: cut.start, label: `${cut.id} 소스 길이 부족`, note });
        }
        decisions.push(message);
      } else if (Number.isFinite(sourceLength) && sourceLength > cut.duration + 0.001) {
        decisions.push(`${cut.id}: 소스 ${round(sourceLength)}s → ${cut.duration}s 트림(앞부분 사용, sourceIn 0)`);
      }

      const effects = [];
      if (adjustment?.crop) {
        effects.push({
          id: `effect-${cut.id.toLowerCase()}-crop`,
          type: 'mask',
          label: CROP_EFFECT_LABEL,
          enabled: true,
          parameters: {
            left: adjustment.crop.left ?? 0,
            right: adjustment.crop.right ?? 0,
            top: adjustment.crop.top ?? 0,
            bottom: adjustment.crop.bottom ?? 0,
          },
        });
        decisions.push(`${cut.id}: 크롭 적용 ${JSON.stringify(adjustment.crop)} — ${adjustment.note ?? 'S6 이관 플래그'}`);
      }
      if (adjustment?.trimOut !== undefined) {
        decisions.push(`${cut.id}: trim_out ${adjustment.trimOut}s — ${adjustment.note ?? 'S6 이관 플래그'}`);
      }
      if (adjustment?.trimIn !== undefined) {
        warnings.push(`${cut.id}: trim_in은 ffmpeg 렌더러가 반영하지 않습니다(항상 소스 0부터) — 편집기에서 수동 처리 필요`);
      }
      if (adjustment?.advisory) {
        warnings.push(`${cut.id}: [편집 이관] ${adjustment.advisory}`);
        todoMarkers.push({ time: cut.start, label: `${cut.id} 편집 이관`, note: adjustment.advisory });
      }

      const isA2V = cut.isA2V;
      v1Clips.push(makeClip({
        id: `clip-${cut.id.toLowerCase()}`,
        assetId: assetIdOf.get(cut.clipAsset.assetId),
        name: `${cut.id} ${isA2V ? 'A2V(보이스 내장)' : 'I2V'}`,
        kind: 'video',
        start: cut.start,
        duration: cut.duration,
        speed,
        sourceIn: 0,
        // muted:true는 렌더러가 클립 자체를 배제한다(ffmpeg-renderer inputClips 필터) — 영상까지 사라진다.
        // 무음화는 volume 0 + asset.metadata.hasAudio=false로 표현한다.
        volume: isA2V ? 1 : 0,
        muted: false,
        color: isA2V ? '#f472b6' : '#38bdf8',
        transitionOut,
        effects,
        keyframes: [], // 클립 자체에 모션 — Ken Burns 이중 모션 금지
      }));
      continue;
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
    { id: `kf-${lastClip.id}-fade-a`, property: 'opacity', time: round(Math.max(0, lastClip.duration - ENDING_FADE_SECONDS)), value: 1, easing: 'linear' },
    { id: `kf-${lastClip.id}-fade-b`, property: 'opacity', time: lastClip.duration, value: 0, easing: 'linear' },
  ];
  decisions.push(`${placedCuts[placedCuts.length - 1].id}: 엔딩 마진 ${ENDING_MARGIN_SECONDS}s + 마지막 ${ENDING_FADE_SECONDS}s 페이드아웃(opacity 키프레임)`);

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
  const droppedCards = [];
  const trimmedCards = [];
  const narrationCaptions = captions.slice();
  for (const cut of placedCuts) {
    if (!cut.subtitle || cut.isTitleCard) continue;
    // 상단 카드는 고유명사·한자 병기·출처 전용. 하단 나레이션 자막과 같은 문장을
    // 위아래로 두 번 띄우는 구간은 제거하거나(전면 중복) 중복 절만 잘라낸다(부분 중복).
    const resolved = resolveOverlayCardText(cut, narrationCaptions);
    if (!resolved.text) {
      droppedCards.push(cut.id);
      continue;
    }
    if (resolved.trimmed) trimmedCards.push(`${cut.id}`);
    overlayCards.push(cut.id);
    captions.push({
      id: `caption-card-${cut.id.toLowerCase()}`,
      start: cut.start,
      end: cut.end,
      text: resolved.text,
      style: { ...CAPTION_STYLES[cut.subtitle.style], position: 'top' },
    });
  }
  decisions.push(`오버레이 카드 ${overlayCards.length}건(${overlayCards.join('·')} — 한자 병기·출처) 상단 유지`);
  if (droppedCards.length > 0) {
    decisions.push(`오버레이 카드 ${droppedCards.length}건 제거(${droppedCards.join('·')}) — 하단 나레이션 자막과 문구 전면 중복`);
  }
  if (trimmedCards.length > 0) {
    decisions.push(`오버레이 카드 ${trimmedCards.length}건 문구 차별화(${trimmedCards.join('·')}) — 나레이션과 겹치는 국역 절 제거, 한자 원문만 유지`);
  }

  // ---- A1 나레이션 ---------------------------------------------------------
  // A2V 컷의 세그먼트는 클립에 보이스가 내장돼 있으므로 A1에 두 번 놓지 않는다(이중 재생 방지).
  const a1Clips = placedTts
    .filter((seg) => !seg.embeddedInClip)
    .map((seg) => makeClip({
      id: `clip-${seg.assetId.toLowerCase()}`,
      assetId: assetIdOf.get(seg.mappingKey ?? seg.assetId),
      trackId: 'track-a1',
      name: seg.assetId,
      kind: 'audio',
      start: seg.start,
      duration: round(seg.duration),
      color: '#a3e635',
    }));
  const embeddedSegments = placedTts.filter((seg) => seg.embeddedInClip);
  if (embeddedSegments.length > 0) {
    decisions.push(
      `A2V 오디오 단일화: ${embeddedSegments.length}세그먼트를 A1에서 제외(클립 내장 보이스 채택) — `
      + embeddedSegments.map((seg) => `${seg.a2vCutId}←${seg.assetId}`).join(' · '),
    );
    decisions.push('A2V 클립: volume 1 + asset.metadata.hasAudio=true(렌더러가 내장 보이스를 타임라인에 올림). 그 외 V1 클립은 volume 0 + hasAudio=false');
  }

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
  const BGM_MIN_REPEAT_TAIL = 4;   // 이보다 짧은 자투리는 반복하지 않는다(짧은 조각 재진입 = 부자연)
  assetsDoc.bgm.forEach((track, index) => {
    const segment = segments[index];
    const span = round(segment.end - segment.start);
    // 트랙이 구간보다 짧으면 반복 배치로 채운다(BGM 재생성 금지 계약 — 기존 6트랙 승계).
    // 마지막 반복만 구간 끝에 맞춰 트리밍하고 페이드한다.
    const placements = [];
    let at = segment.start;
    while (at < segment.end - 0.001) {
      const remaining = round(segment.end - at);
      if (placements.length > 0 && remaining < BGM_MIN_REPEAT_TAIL) break;
      placements.push({ start: round(at), duration: round(Math.min(remaining, track.duration)) });
      at += track.duration;
    }

    placements.forEach((placement, repeatIndex) => {
      const suffix = repeatIndex === 0 ? '' : `-r${repeatIndex + 1}`;
      const clip = makeClip({
        id: `clip-${track.assetId.toLowerCase()}${suffix}`,
        assetId: assetIdOf.get(track.assetId),
        trackId: 'track-a2',
        name: `${track.assetId}${suffix ? ` 반복${repeatIndex + 1}` : ''} (${segment.startCutId}~)`,
        kind: 'audio',
        start: placement.start,
        duration: placement.duration,
        color: '#818cf8',
      });
      // 마지막 조각만 끝 2초 페이드(구간 경계 클릭 방지). 중간 반복은 이어 붙어야 하므로 페이드 없음.
      if (repeatIndex === placements.length - 1) {
        clip.keyframes = [
          { id: `kf-${clip.id}-fade-a`, property: 'volume', time: round(Math.max(0, placement.duration - 2)), value: 1, easing: 'linear' },
          { id: `kf-${clip.id}-fade-b`, property: 'volume', time: placement.duration, value: 0, easing: 'linear' },
        ];
      }
      a2Clips.push(clip);
    });

    const covered = round(placements.reduce((sum, item) => sum + item.duration, 0));
    if (placements.length > 1) {
      decisions.push(
        `${track.assetId}: 실측 ${track.duration}s < 구간 스팬 ${span}s — ${placements.length}회 반복 배치로 ${covered}s 커버`
        + `(재생성 금지 계약 — 기존 트랙 반복, 마지막 조각만 끝 2s 페이드)`,
      );
    } else if (covered < track.duration) {
      decisions.push(`${track.assetId}: ${track.duration}s → ${covered}s 트리밍(구간 스팬 ${span}s) + 끝 2s 페이드`);
    }
    if (covered + 0.01 < span) {
      decisions.push(`${track.assetId}: 구간 말미 ${round(span - covered)}s BGM 공백(자투리 ${BGM_MIN_REPEAT_TAIL}s 미만 — 반복 미배치)`);
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

  // 프로젝트 조립(두 사이클 공통) — 마커 확정 후 호출
  const finalizeProject = () => {
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
      exportProfiles: buildExportProfiles(),
    };
    for (const clip of v1Clips) clip.trackId = 'track-v1';
    return { project, decisions };
  };

  const reviewTodos = [
    { time: 0, label: '자막 word-level 후속', note: '캡션 타이밍은 세그먼트 수준 — SenseVoice word-level 정렬은 후속 사이클' },
  ];

  if (isV3) {
    reviewTodos.push({
      time: 0,
      label: '콘티 v3 인간 재승인 대기',
      note: '59컷 이미지·모션·A2V 채택은 EXTERNAL_PENDING — 인간 검수 후 확정',
    });
    for (const cut of placedCuts) {
      if (!cut.isA2V) continue;
      reviewTodos.push({
        time: cut.start,
        label: `${cut.id} A2V 오디오 단일화`,
        note: `클립 내장 보이스 사용(${cut.a2vSegmentKey}) — A1 TTS 트랙에는 배치하지 않음. 립싱크 동기율 인간 확인`,
      });
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
    return finalizeProject();
  }

  // ---- 이하 v2 레거시 검수 포인트 -------------------------------------------
  reviewTodos.push({ time: 0, label: 'v2 콘티 재승인 대기', note: '컷 밀도 개정(45컷)·신규/교체 이미지 채택은 잠정 — 인간 재승인 필요(EXTERNAL_PENDING)' });
  // v1 유래 검수 포인트는 소스 매핑으로 v2 컷 위치를 찾고, 채택 이미지가 해당 결함본일 때만 표시
  const v2Of = (v1CutId) => placedCuts.find((cut) => cut.source === `v1 ${v1CutId}`);
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

  return finalizeProject();
}

/**
 * 상단 오버레이 카드 vs 하단 나레이션 자막 중복 정리.
 *
 * 카드는 고유명사·한자 병기·출처 전용이므로, 같은 시간대에 하단 자막이 같은 문장을
 * 이미 보여주면 카드는 화면만 덮는다.
 *  - 전면 중복(카드 문구가 겹치는 나레이션 안에 그대로 들어있음) → 카드 제거(null 반환)
 *  - 부분 중복(구분자 뒤 국역 절만 중복) → 앞 절(한자 원문)만 남김
 */
function resolveOverlayCardText(cut, narrationCaptions) {
  const raw = cut.subtitle.text;
  const overlapping = narrationCaptions.filter((cap) => cap.start < cut.end && cap.end > cut.start);
  const narrationBlob = normalizeForDuplicateCheck(overlapping.map((cap) => cap.text).join(' '));
  if (!narrationBlob) return { text: raw, trimmed: false };

  const whole = normalizeForDuplicateCheck(raw);
  if (whole && narrationBlob.includes(whole)) {
    return { text: null, trimmed: false };
  }

  // 구분자(— / – / -)로 "원문 — 국역" 구조를 이룰 때, 국역 절이 나레이션과 겹치면 잘라낸다.
  const separatorMatch = raw.match(/^(.*?)\s+[—–-]\s+(.*)$/);
  if (separatorMatch) {
    const [, head, tail] = separatorMatch;
    const tailNormalized = normalizeForDuplicateCheck(tail);
    const headNormalized = normalizeForDuplicateCheck(head);
    if (tailNormalized && narrationBlob.includes(tailNormalized) && headNormalized && !narrationBlob.includes(headNormalized)) {
      return { text: head.trim(), trimmed: true };
    }
  }

  return { text: raw, trimmed: false };
}

function normalizeForDuplicateCheck(text) {
  return String(text ?? '')
    .replace(/[\s.,!?·…"'“”‘’()[\]{}]/g, '')
    .trim();
}

function buildExportProfiles() {
  return [
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
      // 업로드 마스터: 인간 검수 통과분의 최종 인코딩.
      // CRF 16 + 고 maxrate(사실상 무제한) / yuv420p / High / keyint 48(2s) / faststart
      // 오디오는 유튜브 권장 규격(48kHz stereo AAC 192k) — BGM 44.1k 스테레오와
      // A2V 48k 스테레오 대사가 24kHz 모노로 접히던 손실을 제거한다.
      id: 'master-hd',
      label: 'YouTube 마스터 1080p (S6 업로드용)',
      purpose: 'master',
      container: 'mp4',
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: PROJECT_FPS,
      videoBitrateMbps: 40,
      audioBitrateKbps: 192,
      ffmpegPreset: 'slow',
      crf: 16,
      h264Profile: 'high',
      gopSize: 48,
      audioSampleRate: 48000,
      audioChannels: 2,
      faststart: true,
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
  ];
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
    muted: clip.muted ?? false,
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

  const cycle = args.cycle;
  const isV3 = cycle === 'v3';
  PROJECT_FPS = PROJECT_FPS_BY_CYCLE[cycle];
  const warnings = [];

  // 러닝타임 게이트 레버 (01-script §길이 게이트 480~510초) — 미지정 시 종전 기본값
  for (const [flag, name] of [['scene-pause', 'SCENE_PAUSE'], ['ending-margin', 'ENDING_MARGIN']]) {
    if (args[flag] === undefined) continue;
    const value = Number(args[flag]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${flag} must be a non-negative number`);
    if (name === 'SCENE_PAUSE') SCENE_PAUSE_SECONDS = value;
    else ENDING_MARGIN_SECONDS = value;
  }

  const assetsDoc = isV3 ? parseAssetsDocV3(assetsMd, { cycle }) : parseAssetsDoc(assetsMd);
  const cuts = parseStoryboard(storyboardMd);
  const sourceMap = parseCutSourceMap(storyboardMd);
  const scriptDialogues = parseScriptDialogues(scriptMd);

  // 03-assets §S6 삽입 컷 편입 (02-storyboard 무수정) — v3 전용
  let s6Inserts = [];
  if (isV3 && !args['no-insert-cuts']) {
    s6Inserts = await applyS6InsertCuts(cuts, assetsDoc, parseS6InsertCuts(assetsMd), args, warnings);
    for (const insert of s6Inserts) {
      console.log(`S6 삽입 컷: ${insert.id} ← ${insert.afterCut} 직후 / ${insert.duration}s 고정 / 미디어 키 ${insert.mediaKey} / N${String(insert.scene).padStart(2, '0')}`);
    }
  }

  console.log(`cycle: ${cycle} (project fps ${PROJECT_FPS}, prefer ${args.prefer}${args.upscaled ? ', upscaled clips' : ''}, scene-pause ${SCENE_PAUSE_SECONDS}s, ending-margin ${ENDING_MARGIN_SECONDS}s)`);

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

  // 입력 검증 + 컷별 에셋 해석
  const preferStill = args.prefer === 'still';
  if (isV3) {
    await resolveCutAssetsV3(cuts, assetsDoc, args, sourceMap, warnings);
    // TTS 실측을 파일에서 재측정 — 03-assets 표는 채택 테이크 교체 후 stale일 수 있다.
    for (const seg of assetsDoc.tts) {
      const measured = await probeDuration(seg.path);
      if (measured === undefined) {
        if (!existsSync(seg.path)) throw new Error(`TTS 파일 누락: ${seg.path} (${seg.assetId})`);
        warnings.push(`${seg.assetId}: ffprobe 실패 — 문서 표 실측(${seg.docDuration}s) 사용`);
        continue;
      }
      if (Math.abs(measured - seg.docDuration) > 0.05) {
        warnings.push(
          `${seg.assetId}: 03-assets 표 ${seg.docDuration}s ≠ 파일 실측 ${round(measured)}s (${seg.file}) — 파일 실측을 채택`,
        );
      }
      seg.duration = round(measured);
    }
  } else {
    resolveCutAssets(cuts, sourceMap, assetsDoc);
  }

  const uniqueImages = new Set(cuts.map((cut) => cut.imageAsset.assetId));
  const uniqueClips = isV3
    ? new Set(cuts.filter((cut) => cut.clipAsset).map((cut) => cut.clipAsset.assetId))
    : new Set(cuts.filter((cut) => cut.i2vAsset).map((cut) => cut.i2vAsset.assetId));
  const a2vCuts = cuts.filter((cut) => cut.isA2V);
  console.log(`production: ${assetsDoc.productionId}`);
  console.log(`cuts: ${cuts.length} / images: ${uniqueImages.size} / tts: ${assetsDoc.tts.length} / bgm: ${assetsDoc.bgm.length} / clips: ${uniqueClips.size} (A2V ${a2vCuts.length})`);

  const embeddedSegmentKeys = new Set(
    isV3
      ? a2vCuts
        .filter((cut) => cutUsesClip(cut, preferStill))
        .map((cut) => assetsDoc.tts.find((seg) => seg.segmentKey === cut.a2vSegmentKey)?.assetId)
        .filter(Boolean)
      : [],
  );

  let mapping = existsSync(mappingPath) ? JSON.parse(await readFile(mappingPath, 'utf8')) : {};
  if (steps.includes('import')) {
    mapping = args.offline
      ? await importMediaOffline(cuts, assetsDoc, mappingPath, { cycle, preferStill, embeddedSegmentKeys })
      : await importMedia(args.api, cuts, assetsDoc, mappingPath, { cycle, preferStill, embeddedSegmentKeys });
  }

  if (!steps.includes('compile')) return;

  const timeline = isV3
    ? computeTimelineV3(cuts, assetsDoc.tts, warnings, preferStill)
    : computeTimeline(cuts, assetsDoc.tts);
  const projectName = args.name ?? `${assetsDoc.productionId} (S6 compile ${cycle})`;
  const { project, decisions } = buildProject({
    productionId: assetsDoc.productionId,
    projectName,
    cuts,
    timeline,
    assetsDoc,
    mapping,
    scriptDialogues,
    cycle,
    warnings,
    preferStill,
    kenBurns: isV3 ? Boolean(args.kenburns) : true,
  });

  // 자체 검증 출력: 총 길이 정합
  const ttsTotal = round(assetsDoc.tts.reduce((sum, seg) => sum + seg.duration, 0));
  const expected = round(ttsTotal + (timeline.scenes.length - 1) * SCENE_PAUSE_SECONDS + ENDING_MARGIN_SECONDS);
  console.log('\n--- duration self-check ---');
  console.log(`TTS 실측 합계: ${ttsTotal}s`);
  console.log(`기대 총 길이 = 실측 + 장면 휴지 ${(timeline.scenes.length - 1)}×${SCENE_PAUSE_SECONDS}s + 엔딩 마진 ${ENDING_MARGIN_SECONDS}s = ${expected}s`);
  console.log(`타임라인 총 길이: ${project.duration}s → ${Math.abs(project.duration - expected) < 0.01 ? 'OK' : `+${round(project.duration - expected)}s (A2V 고정 길이 흡수분)`}`);
  for (const scene of timeline.scenes) {
    console.log(`  N${String(scene).padStart(2, '0')}: start ${timeline.sceneStart.get(scene)}s / span ${round(timeline.sceneSpan.get(scene))}s (audio ${round(timeline.sceneAudio.get(scene))}s)`);
  }
  // v3는 A2V 고정 길이 때문에 장면 스팬이 연장될 수 있다 — 초과분만 허용, 미달은 결함.
  if (project.duration + 0.01 < expected || (!isV3 && Math.abs(project.duration - expected) >= 0.01)) {
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

  if (warnings.length > 0) {
    console.log(`\n--- compile warnings (${warnings.length}) — 인간 판단/편집기 처리 대상 ---`);
    for (const warning of warnings) console.log(`  ! ${warning}`);
  }

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
