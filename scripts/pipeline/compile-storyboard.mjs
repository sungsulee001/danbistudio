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
 * 러닝타임 레버 (01-script §길이 게이트):
 *   --scene-pause <s>        장면 간 휴지 (기본 0.3)
 *   --ending-margin <s>      최종 컷 뒤 여백 (기본 1.0)
 *   --speaker-turn-gap <s>   장면 내 화자 교대 지점의 숨 (기본 0 = 종전 동작). ep2 권장 0.20
 *   --target-duration <s>    목표 총 길이. 화자 교대 간격을 이분법으로 자동 해 (대본·TTS·배속 무수정)
 *   --duration-gate <a-b>    게이트 판정 구간 (기본 480-510)
 *
 * 미디어 경로 (사이클 기본값 → 후보 존재 검사 → 인자 override):
 *   --cuts-dir / --clips-source-dir / --clips-upscaled-dir / --tts-dir / --sfx-dir
 *   --clips-dir              (구 인자) 업스케일 폴더 override — --clips-upscaled-dir과 동일
 *
 * A3 SFX:
 *   --sfx-duck-db <db>       대사 구간 SFX 덕킹 (음수, 기본 0 = 덕킹 없음). 03-assets 권고 -3~-6
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
 *  - A3: SFX(생성형 효과음)를 컷 1:1로 배치. 03-assets §A3 게인 표의 **컷별 volumeDb**를 그대로 쓴다
 *    (기준 피크 -18dBFS로 정규화된 값 — 트랙 게인은 0dB). bgm stop 구간(의도된 침묵)에는 배치 금지.
 *    트랙은 채택 SFX가 있을 때만 방출한다(없는 프로덕션의 프로젝트 형상 불변).
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
// 화자 교대 간격(초) — 같은 장면 안에서 화자가 바뀌는 지점에 삽입하는 숨. 러닝타임 게이트의 세 번째 레버다.
// 기본 0 = 종전 동작(간격 없음). --speaker-turn-gap 또는 --target-duration(자동 해)으로 지정한다.
let SPEAKER_TURN_GAP_SECONDS = 0;
const ENDING_FADE_SECONDS = 1.0;  // 엔딩 페이드 길이 — 여백을 늘려도 페이드는 1초 고정
const I2V_SPEED = 0.5;               // [v2 레거시 전용] WAN 16fps 소스 슬로우 (5.06s → 10.12s)
                                     // v3(LTX-2.3 24fps 실모션)에서는 사용하지 않는다 — 배속 1.0 고정.
// 나레이션 대비 BGM 트랙 게인(트랙 volumeDb 지원 확인됨).
// **프로덕션별 상수다** — 절대값이 아니라 "BGM 실효 LUFS − 나레이션 LUFS" 비(ep1 검증치 −7.31 LU)가
// 유지해야 할 계약이고, BGM 소스의 정합 지점과 나레이션 레벨은 에피소드마다 다르다.
//   ep1: 소스 평균 −15.09 LUFS · 나레이션 −21.78 LUFS → 게인 −14 (인간 검수 통과분, 그대로 보존)
//   ep2: 소스 정합 −22.30 LUFS · 나레이션 −23.39 LUFS → 게인 −8.4
//        (= 목표 실효 −30.70 − 소스 −22.30. 03-assets §BGM §러드니스 정합 + 게인 권고의 유도)
// ep1에 −8.4를 쓰면 BGM이 5.6 LU 과대, ep2에 −14를 쓰면 5.6 LU 과소가 된다 —
// 그래서 단일 상수를 두지 않고 production_id로 색인한다(미등재 프로덕션은 DEFAULT).
const BGM_TRACK_GAIN_DB_DEFAULT = -14;
const BGM_TRACK_GAIN_DB_BY_PRODUCTION = {
  '2026-07-13-jangyeongsil-silence': -14,
  '2026-07-29-jagyeongnu-night': -8.4,
};
let BGM_TRACK_GAIN_DB = BGM_TRACK_GAIN_DB_DEFAULT;
// A3 SFX: 절대 레벨은 03-assets §A3 게인 표의 **컷별** volumeDb가 담당하므로 트랙 게인은 0dB이다.
// (컷별 편차가 30dB에 달해 BGM식 트랙 일괄 게인으로는 표현할 수 없다 — 03-assets §S6 통합 설계)
const SFX_TRACK_GAIN_DB = 0;
const SFX_REFERENCE_PEAK_DBFS = -18; // 게인 표의 기준 피크(대사 피크 -4~-11dBFS 아래 7~14dB)

// ---------------------------------------------------------------------------
// 마스터 라우드니스 단 — **프로덕션별 옵트인**
// ---------------------------------------------------------------------------
// 렌더러의 마스터 체인(`loudnorm` → `alimiter`)은 프로젝트의 `before-export` 로컬 자동화 규칙
// (`rule-before-export`)에서 파라미터를 읽는다. 컴파일러가 `automation: []`을 방출하면
// `project-store.normalizeAutomation()`이 **로드 시 기본 규칙을 병합**해(`src/lib/editor/project.ts`)
// 모든 프로덕션에 I=-14/TP=-1.5가 강제로 붙는다. ep1 v7(2026-07-28)은 이 기본 규칙 도입 전 산출이라
// 마스터 단이 없었고 −22.27 LUFS로 납품됐다 — 지금 코드로 재렌더하면 산출이 달라진다(회귀).
// 그래서 컴파일러가 **같은 id의 규칙을 명시적으로 방출**한다(mergeMissingById는 id가 있으면 덮지 않는다):
//   - 등재 프로덕션 → 라우드니스 파라미터 포함(마스터 단 적용)
//   - 미등재 프로덕션(ep1 포함) → 파라미터 없음 = 마스터 단 미적용 = 규칙 도입 전 동작 재현
// ep2 TP는 −1.5가 아니라 **−2.0**이다. loudnorm 단일 패스(dynamic)는 TP 보증이 느슨해 리미터가
// 실질 천장인데, 리미터는 샘플 피크만 잡으므로 48kHz 재구성 시 인터샘플 피크가 그 위로 올라간다.
// 샘플 천장을 −2.0 dBFS로 두면 트루피크가 −1.0 dBTP 이하로 들어온다(유튜브 납품 기준).
const MASTER_AUDIO_BY_PRODUCTION = {
  '2026-07-29-jagyeongnu-night': { loudnessLufs: -14, truePeakDb: -2 },
};
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

// 폴더명은 사이클 속성이 아니라 **프로덕션 관례**다(ep1은 콘티 개정 접미 `-v3`, ep2 이후는 평명).
// 따라서 사이클 기본값 + 후보 목록(존재하는 첫 폴더 채택) + CLI 인자 override 3단으로 해석한다.
// 하드코딩된 리터럴을 남기지 않기 위해 모든 항목이 인자로 덮어쓸 수 있다.
const CYCLE_PATHS = {
  v2: {
    cuts: 'cuts', clips: 'i2v', clipsUpscaled: null, tts: 'tts-x11', sfx: null,
    assetSuffix: '-v2',
  },
  v3: {
    cuts: 'cuts',
    cutsCandidates: ['cuts-v3', 'cuts'],
    clips: 'clips',
    clipsCandidates: ['clips-v3', 'clips'],
    // 업스케일 산출 폴더. 03-assets §업스케일 섹션에 매핑 표가 append되면 그 표가 우선하고,
    // 없으면 `<clipsUpscaled>\CUT-NN.mp4` 규칙을 가정한다(--upscaled 사용 시).
    clipsUpscaled: 'clips-1080p',
    clipsUpscaledCandidates: ['clips-v3-1080p', 'clips-1080p'],
    tts: 'tts',
    ttsCandidates: ['tts-v21', 'tts'],
    // 채택 SFX(A3 트랙 소스). 없는 프로덕션에서는 A3 트랙을 방출하지 않는다.
    sfx: 'sfx\\adopted',
    sfxCandidates: ['sfx\\adopted', 'sfx'],
    assetSuffix: '-v3',
  },
};

// 경로 항목 → CLI 인자명. `--clips-dir`은 구 인자(업스케일 폴더 override)로 계속 받는다.
const PATH_ARG_BY_KEY = {
  cuts: 'cuts-dir',
  clips: 'clips-source-dir',
  clipsUpscaled: 'clips-upscaled-dir',
  tts: 'tts-dir',
  sfx: 'sfx-dir',
};

// 사이클 기본값 → 후보 존재 검사 → CLI override 순으로 폴더명을 확정한다.
// 기본값이 실재하지 않고 후보 중 하나가 실재하면 그 후보를 쓰되 로그로 명시한다(암묵 폴백 금지).
function resolveCyclePaths(cycle, { mediaRoot, ttsProductionRoot, args, log }) {
  const base = CYCLE_PATHS[cycle];
  const resolved = { ...base };
  for (const [key, flag] of Object.entries(PATH_ARG_BY_KEY)) {
    const legacyOverride = key === 'clipsUpscaled' ? args['clips-dir'] : undefined;
    const override = args[flag] ?? legacyOverride;
    if (override) {
      resolved[key] = override;
      log.push(`path ${key}: --${args[flag] ? flag : 'clips-dir'} → ${override}`);
      continue;
    }
    if (!base[key]) continue;
    const root = key === 'tts' ? ttsProductionRoot : mediaRoot;
    const candidates = base[`${key}Candidates`] ?? [base[key]];
    const found = candidates.find((dir) => existsSync(path.join(root, dir)));
    if (found === undefined) {
      log.push(`path ${key}: 후보 ${candidates.join(' | ')} 모두 실재하지 않음 — 기본값 ${base[key]} 유지(--${flag}로 지정 가능)`);
      continue;
    }
    resolved[key] = found;
    if (found !== base[key]) log.push(`path ${key}: ${base[key]} 없음 → ${found} 채택(실재 확인)`);
  }
  return resolved;
}

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
// ⚠ 컷 번호는 **프로덕션 고유**다. 에피소드별로 분리하지 않으면 ep1의 CUT-11 트림이 ep2의 CUT-11에
// 그대로 적용된다(실측 확인된 오적용). 따라서 production_id로 색인하고, 미등재 프로덕션은 빈 표를 쓴다.
// 외부에서 주려면 --cut-adjustments <json>(같은 형식) — 신규 에피소드는 이 인자를 쓰는 것을 권장한다.
const S6_CUT_ADJUSTMENTS_BY_PRODUCTION = {
  '2026-07-13-jangyeongsil-silence': {
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
  },

  // ── ep2 「자격루의 밤」 ─────────────────────────────────────────────────────
  // 출처: 03-assets.md §I2V 1차 §S6 이관 플래그 / §I2V 2차 채택 12컷 비고 /
  //       §컷 렌더 §S6 크롭 이관 목록 / §A2V §미해소 플래그 / §A2V §길이 처리와 S6 인계.
  // 원칙: **수치가 문서에 있는 것만 자동 적용**한다(trimOut). 크롭 비율·트림 지점이 명시되지 않은
  //       권고는 advisory로만 두어 경고 + todo 마커로 인간에게 넘긴다(임의 수치 발명 금지).
  '2026-07-29-jagyeongnu-night': {
    'CUT-04': {
      advisory: '원경 현대풍 등주·점경 발광체 잔존(S4 승계) — 크롭 또는 비네팅 이관. 수치 미정',
    },
    'CUT-13': {
      advisory: '좌측 모래시계(서양 사시계 = 시대착오) 3/3 잔존(S4 승계) — 좌측 크롭 필수. 비율 미정 — 편집기 육안 지정',
    },
    'CUT-14': {
      advisory: '지면 글리프 변형 + 푸시인(나노바나나 스틸의 I2V 취약성, ep1 CUT-38 재현) — 정지컷 대체 검토',
    },
    'CUT-16': {
      // A2V. 클립 9.042s가 콘티 9.0s를 덮으므로 길이 처리는 불요(§길이 처리 표). 푸시인만 이관.
      advisory: 'A2V 푸시인 +4.2% · 말미 노출비 0.892(프레임 락·시드 3회 소진) — 앞구간 사용 또는 재생성 재개. 사용 구간 미정',
    },
    'CUT-18': {
      trimOut: 7.95,
      note: 'A2V 발화 종료 직후 컷 — 리드 패딩 0.300s + 보이스 7.649s = 7.949s (§길이 처리 "발화 후 정지 프레임 또는 조기 컷", CUT-21 명시값과 동일 규약)',
    },
    'CUT-20': {
      advisory: '말미 회전으로 노년 인물 배면 노출 — 대사 컷 앞구간 사용 권장. 전환 지점 미정',
    },
    'CUT-21': {
      trimOut: 3.50,
      note: 'A2V 조기 컷 — 03-assets §길이 처리 명시값 "발화 종료 3.50초 지점"(발화 0.300~3.496s / 클립 말미 정지 2.880s 절단)',
    },
    'CUT-25': {
      trimOut: 3.02,
      note: 'A2V 발화 종료 직후 컷 — 리드 패딩 0.300s + 보이스 2.716s = 3.016s (§길이 처리)',
    },
    'CUT-27': {
      advisory: '우상단 손 침입 3/3 잔존(S4 승계) — 상단 크롭 이관. 비율 미정',
    },
    'CUT-33': {
      trimOut: 4.54,
      note: 'A2V 발화 종료 직후 컷 — 리드 패딩 0.300s + 보이스 4.234s = 4.534s (§길이 처리)',
    },
    'CUT-39': {
      advisory: '분할 프레임 변형·좌패널 내용 변화(나노바나나 스틸 취약성) — 정지컷 대체 검토',
    },
    'CUT-41': {
      advisory: '★whip pan — 블러 구간에 스케치/낙서 아티팩트. 블러 구간 내 컷 전환 필수(ep1 CUT-28 동일 처리). 전환 프레임은 편집기에서 지정',
    },
    'CUT-51': {
      advisory: '말미 심도 뒤 인물 정면화 — 장영실 얼굴 미노출 계약 위험. 말미 트림 또는 인간 확인 필요(트림 지점 미정). 전경 흑색 봉(가마채 오독) 하단 크롭도 S4 승계 이관',
    },
    'CUT-58': {
      advisory: '손 침입 3/3 · 먹 획 글자형(no-text 경미 위반, S4 승계) — 상단 크롭 이관. 비율 미정',
    },
    'CUT-59': {
      advisory: '말미 처마 아래 흐릿한 인영(무인 컷 침입) — 말미 트림 권장. 트림 지점 미정',
    },
    'CUT-60': {
      advisory: '말미 한자 글리프 변형(지면 인서트 취약성) — 앞구간 사용 권장. 사용 구간 미정 (★dolly zoom은 실현 성공)',
    },
    'CUT-64': {
      advisory: '가장자리 암전이 원형 아이리스로 과대 해석(3테이크 공통) — 말미 트림 권장. 트림 지점 미정',
    },
    'CUT-67': {
      advisory: '좌측 천막형 물체 환각 3/3 + 우측 흰 파선(S4 승계) — 좌·우 크롭 이관. 비율 미정 — 편집기 육안 지정',
    },
  },
};

// main()에서 production_id(+--cut-adjustments)로 확정한다. 기본은 빈 표 = 자동 보정 없음.
let S6_CUT_ADJUSTMENTS = {};

// SFX 컷별 배치 보정 (03-assets §S6 통합 설계 §컷 경계 정렬의 선언적 표현).
// - onsetSeconds: 파일 내 첫 사건(어택)의 위치. leadSeconds와 합쳐 "사건이 컷 시작보다 먼저 오게" 앞당긴다.
// - leadSeconds: 사건이 컷 시작보다 앞서야 하는 양. 지정 시 클립 시작 = 컷 시작 − (onset + lead).
// - gainOffsetDb: 게인 표 값에 더하는 보정(예: 소리가 주인공인 컷 상향 검토분). 기본 0 — 인간 판단 사항은 경고로만 남긴다.
const SFX_CUT_ADJUSTMENTS_BY_PRODUCTION = {
  '2026-07-29-jagyeongnu-night': {
    'CUT-50': {
      onsetSeconds: 4.94,
      leadSeconds: 0.30,
      note: '콘티 §팟캐스트 겸용 2 — "첫 타종음이 화면보다 먼저 온다". r2 타종 온셋 4.94s를 컷 시작 0.30s 앞으로 당긴다',
    },
    'CUT-52': {
      advisory: '콘티 "릴레이는 소리가 주인공" — 기준 -18dBFS보다 +3~4dB 상향 검토(인간 청취 판단, 자동 적용 없음)',
    },
    'CUT-53': {
      // 03-assets §BGM §S6 인계 플래그 5 — bgm-05-climax의 종소리 여유가 최소(+5.24dB)여서
      // BGM을 깎는 대신 SFX 클립 게인을 올리는 쪽을 BGM 에이전트가 대안으로 제시했다(§A3는 클립별 게인 지원).
      // 콘티 "릴레이는 소리가 주인공" 상향 검토(+3~4dB)와도 방향이 일치한다. 원 게인 −8.3 → −5.3.
      gainOffsetDb: 3,
      note: 'BGM §S6 인계 플래그 5 대안 적용 — 종소리 여유 최소(+5.24dB) 대응 + 콘티 "릴레이는 소리가 주인공"(원 게인 −8.3 → −5.3)',
    },
  },
};

let SFX_CUT_ADJUSTMENTS = {};

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

const BOOLEAN_FLAGS = new Set([
  'upscaled', 'kenburns', 'offline', 'no-insert-cuts',
  // 스테이징 컴파일용(에셋 미생성 단계) — 기본 off. 켜면 반드시 경고로 남는다.
  'allow-pending-a2v', 'allow-pending-bgm',
]);

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

// ---------------------------------------------------------------------------
// 발화 구간 실측 — 자막 동기·컷 전환 위치의 유일한 원천
// ---------------------------------------------------------------------------
// TTS wav에는 앞뒤로 무음 패딩이 붙어 있다(ep2 109파일 실측: 선단 합 15.17s · 말단 합 49.27s,
// 최대 선단 0.757s · 최대 말단 1.193s). 클립 경계를 그대로 자막 창으로 쓰면 자막이 최대 0.76초
// **먼저 뜨고** 1.19초 **더 남는다** — 인간 검수 지적 「자막 안 맞음」·「대사 안 나옴」의 실체다.
// 그래서 파일마다 무음 구간을 실측해 ①자막을 발화에 붙이고 ②컷 전환을 조용한 지점으로 옮긴다.
const SILENCE_NOISE_DB = -45;      // 무음 판정 임계(TTS 노이즈 플로어보다 충분히 위)
const SILENCE_MIN_SECONDS = 0.1;   // 이보다 짧은 무음은 발화의 일부(파열음 앞 폐쇄)로 본다

let ffmpegAvailable = true;
async function probeSilence(filePath, duration) {
  if (!ffmpegAvailable || !Number.isFinite(duration) || !existsSync(filePath)) return undefined;
  let stderr;
  try {
    ({ stderr } = await execFileAsync('ffmpeg', [
      '-hide_banner', '-nostats', '-i', filePath,
      '-af', `silencedetect=n=${SILENCE_NOISE_DB}dB:d=${SILENCE_MIN_SECONDS}`,
      '-f', 'null', '-',
    ], { maxBuffer: 16 * 1024 * 1024 }));
  } catch (error) {
    if (String(error?.code) === 'ENOENT') {
      ffmpegAvailable = false;
      console.warn('  warn: ffmpeg not found — 발화 구간 실측을 건너뜁니다(자막은 클립 경계 기준)');
    }
    return undefined;
  }
  const starts = [...String(stderr).matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...String(stderr).matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const silences = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = Math.max(0, starts[i]);
    const end = Math.min(duration, ends[i] ?? duration);
    if (end > start + 0.001) silences.push([round(start), round(end)]);
  }
  const lead = silences.length > 0 && silences[0][0] < 0.001 ? silences[0][1] : 0;
  const trail = silences.length > 0 && silences[silences.length - 1][1] > duration - 0.001
    ? round(duration - silences[silences.length - 1][0])
    : 0;
  // 발화 런 = 무음의 여집합
  const speech = [];
  let at = 0;
  for (const [start, end] of silences) {
    if (start > at + 0.001) speech.push([round(at), round(start)]);
    at = Math.max(at, end);
  }
  if (duration > at + 0.001) speech.push([round(at), round(duration)]);
  return { lead: round(lead), trail, silences, speech };
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
// 0. 개행 정규화 — **모든 vault 마크다운 파서 진입점의 유일한 통로**
// ---------------------------------------------------------------------------
// 이 컴파일러의 라인 단위 정규식 상당수는 `$` 앵커를 쓰면서 `m` 플래그가 없다. 대표적으로
// sectionBody/sectionsBodies의 `/^(#{1,6})\s+(.*)$/`는 `split('\n')` 결과의 각 줄에 적용되므로
// CRLF 파일에서는 줄 끝에 `\r`이 남는다. `.`는 `\r`을 매치하지 못하고 `m` 없는 `$`는 문자열 끝만
// 인정하므로 **모든 헤딩이 미매치**되고(→ 섹션 파싱 전면 붕괴), parseScriptDialogues의
// `:\n` 리터럴과 `(.+)$` 도 같은 방식으로 무너진다(→ "나레이션/대사 블록 없음" 오진).
// DanbiVault는 `core.autocrlf=true`라 **체크아웃만으로 CRLF가 되어 재발**하므로,
// 파일을 읽은 직후 한 곳에서 LF로 정규화한다(정규식 개별 수정은 재발을 막지 못한다).
// .gitattributes(`*.md text eol=lf`)는 2차 방어선이다 — 이 정규화가 본질이다.
const normalizeNewlines = (text) => String(text).replace(/\r\n?/g, '\n');

async function readMarkdown(filePath) {
  return normalizeNewlines(await readFile(filePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. 입력 파싱
// ---------------------------------------------------------------------------

function parseAssetsDoc(markdown) {
  const productionId = markdown.match(/^production_id:\s*(\S+)/m)?.[1];
  if (!productionId) throw new Error('03-assets.md: production_id not found');

  const imagesById = new Map(); // 채택 이미지: asset_id -> { assetId, cutId, path }
  const tts = [];
  const bgm = [];
  const sfx = new Map(); // cut_id -> { cutId, assetId, path, duration }
  const i2vById = new Map(); // asset_id -> { assetId, path, duration }

  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    // | asset_id | type | cut_id | path | duration_sec | slot | seed | job | 결과 | 채택 |
    if (cells.length < 11) continue;
    const [, assetId, type, cutId, filePath, durationSec, , , , , adopted] = cells;
    // 'sfx'를 거르지 않는다 — A3 트랙 소스(03-assets §S6 통합 설계 필요 변경 ①).
    if (!['image', 'tts', 'bgm', 'i2v', 'sfx'].includes(type)) continue;

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
    } else if (type === 'sfx') {
      const cut = cutId.match(/CUT-\d{2}/)?.[0];
      if (!cut) throw new Error(`03-assets.md: sfx row ${assetId} has no cut_id`);
      const gainCell = line.match(/A3 게인\s*([+-−]?[\d.]+)/)?.[1];
      sfx.set(cut, {
        cutId: cut,
        assetId,
        path: filePath,
        file: path.basename(filePath),
        duration: Number(durationSec),
        gainDb: gainCell === undefined ? 0 : numberCell(gainCell),
      });
    } else if (type === 'i2v') {
      i2vById.set(assetId, { assetId, path: filePath, duration: Number(durationSec) });
    }
  }

  tts.sort((a, b) => (a.scene - b.scene) || (a.order - b.order));
  bgm.sort((a, b) => a.assetId.localeCompare(b.assetId));
  return { productionId, imagesById, tts, bgm, sfx, i2vById };
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

// 헤딩 정규식. `(.*?)\s*$`는 CRLF 잔여 `\r`을 흡수하는 형태다 —
// readMarkdown()이 이미 정규화하지만, 문자열이 다른 경로로 들어와도 헤딩 인식이 무너지지 않게 한다(§0).
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;

// 헤딩 술어에 맞는 첫 섹션 본문(다음 동급/상위 헤딩 전까지)
function sectionBody(markdown, predicate) {
  const lines = markdown.split('\n');
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(HEADING_RE);
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
    const heading = lines[i].match(HEADING_RE);
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

/**
 * 컷별 채택 파일 표 파싱. 파일 열의 **위치는 프로덕션마다 다르다**
 * (ep1 §채택 54컷: 2열 "채택 파일" / ep2 §채택 12컷: 3열 "채택 클립" — 2열은 입력 이미지).
 * 따라서 헤더 이름으로 열을 찾고, 헤더 행이 없는 표만 종전처럼 2열로 폴백한다.
 */
function parseAdoptedCutFileTable(body, extension, headerPattern) {
  const map = new Map();
  if (!body) return map;

  let fileColumn;
  let headerSeen = false;
  if (headerPattern) {
    for (const line of body.split('\n')) {
      if (!isTableRow(line)) continue;
      const cells = cellsOf(line);
      if (!/^컷/.test(cells[1] ?? '')) continue;
      headerSeen = true;
      const found = cells.findIndex((cell, position) => position > 1 && headerPattern.test(cell));
      if (found > 1) fileColumn = found;
      break;
    }
    // 헤더 행이 있는데 해당 열이 없으면 이 표는 대상이 아니다(무관한 표를 긁지 않는다).
    if (headerSeen && fileColumn === undefined) return map;
  }

  for (const line of body.split('\n')) {
    if (!isTableRow(line)) continue;
    const cells = cellsOf(line);
    if (!/^CUT-\d{2}$/.test(cells[1] ?? '')) continue;
    const file = lastMatch(stripStrike(cells[fileColumn ?? 2] ?? ''), CUT_FILE_RE);
    if (!file || !file.endsWith(extension)) continue;
    map.set(cells[1], { file, row: cells });
  }
  return map;
}

// §채택 N컷 계열 표를 문서 순서대로 모아 병합한다(뒤 섹션이 앞을 덮는다 — 2차 패스·교정본 반영).
function parseAdoptedCutFileTables(markdown, extension, headerPattern) {
  const merged = new Map();
  for (const body of sectionsBodies(markdown, (heading) => /채택\s*\d+\s*컷/.test(heading))) {
    for (const [cut, entry] of parseAdoptedCutFileTable(body, extension, headerPattern)) {
      merged.set(cut, entry);
    }
  }
  return merged;
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

// 표 헤더 행에서 열 인덱스를 읽는다 — 열 순서·개수는 프로덕션마다 다르다
// (ep1: 세그먼트/화자/실측/mean/max/비고, ep2: 세그먼트/화자/음절/실측/mean/max/유사도/전사일치).
// 위치 하드코딩을 헤더 이름 매칭으로 대체한다.
function tableColumnIndex(body, patterns) {
  for (const line of body.split('\n')) {
    if (!isTableRow(line)) continue;
    const cells = cellsOf(line);
    if (!/세그먼트|컷/.test(cells[1] ?? '')) continue;
    const index = {};
    for (const [key, pattern] of Object.entries(patterns)) {
      const found = cells.findIndex((cell, position) => position > 0 && pattern.test(cell));
      if (found > 0) index[key] = found;
    }
    return index;
  }
  return {};
}

function parseTtsSegmentsV3(markdown) {
  const body = sectionBody(markdown, (heading) => /세그먼트 실측표/.test(heading));
  if (!body) throw new Error('03-assets.md: §세그먼트 실측표 section not found (v3 TTS 필요)');

  const column = tableColumnIndex(body, {
    duration: /실측/,
    syllables: /음절/,
    speakerLabel: /화자/,
    note: /비고/,
  });
  if (column.duration === undefined) {
    throw new Error('03-assets.md §세그먼트 실측표: "실측" 열을 헤더에서 찾지 못했습니다');
  }

  const segments = [];
  for (const line of body.split('\n')) {
    if (!isTableRow(line)) continue;
    const cells = cellsOf(line);
    const assetId = cells[1];
    const match = assetId?.match(/^N(\d{2})-(\d{2})-(.+)$/);
    if (!match) continue;
    const duration = numberCell(cells[column.duration]);
    if (!Number.isFinite(duration)) throw new Error(`03-assets.md: bad tts duration for ${assetId}`);
    const syllables = column.syllables === undefined ? undefined : numberCell(cells[column.syllables]);
    // 비고 칸의 "인간 채택 확정 = `X.wav`" 도 오버라이드 원천
    const noteCell = column.note === undefined ? undefined : cells[column.note];
    const inlineAdopted = noteCell?.match(/채택 확정 = `([^`]+\.wav)`/)?.[1];
    segments.push({
      assetId,
      segmentKey: `N${match[1]}-${match[2]}`,
      scene: Number(match[1]),
      order: Number(match[2]),
      speaker: match[3],
      speakerLabel: column.speakerLabel === undefined ? undefined : cells[column.speakerLabel],
      syllables: Number.isFinite(syllables) ? syllables : undefined,
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

/**
 * §A2V 립싱크 섹션 → 컷별 { 채택 클립 파일, 바인딩 TTS wav, 문서 길이 }.
 *
 * 열 위치도 섹션 구조도 **프로덕션마다 다르다** — 위치 하드코딩은 ep2에서 무너졌다:
 *  - ep1 §A2V 립싱크 5컷(h3, 표 1개): | 컷 | 채택 파일 | 오디오(확정본) | seed | 프레임/실측 | …
 *  - ep2 §A2V 립싱크 6컷(h2, 표 3개): | 컷 | 입력 이미지 | 입력 오디오(채택 확정본) | 채택 클립 | 시드 | 프레임/클립 | …
 *    → 2열이 클립이 아니라 **입력 이미지(.png)** 이고, 같은 h2 섹션 안에
 *      §실증 D 푸시인 표·§길이 처리 표가 **또 CUT-NN을 1열로 갖는다**. 종전 파서는 이 두 표의 행으로
 *      좋은 행을 덮어써 file/audioFile을 undefined로 만들었다(= "바인딩된 TTS 세그먼트를 찾지 못했습니다").
 *
 * 그래서 ①표 단위로 헤더를 읽어 ②"채택 클립/파일" 열과 "오디오" 열을 **둘 다** 가진 표만 소비한다.
 * 헤더가 없는 표(구 형식)만 종전처럼 2열=클립 / 3열=오디오로 폴백한다 — ep1 동작 보존.
 */
const A2V_CLIP_HEADER_RE = /채택\s*(클립|파일|영상)/;
const A2V_AUDIO_HEADER_RE = /오디오/;
const A2V_LENGTH_HEADER_RE = /프레임/;

function parseA2vTableColumns(headerCells) {
  // 오디오 열은 "입력 오디오(채택 확정본)"처럼 '채택'을 품을 수 있으므로 클립 열 탐색에서 먼저 배제한다.
  const audio = headerCells.findIndex((cell, i) => i > 1 && A2V_AUDIO_HEADER_RE.test(cell));
  const clip = headerCells.findIndex(
    (cell, i) => i > 1 && i !== audio && A2V_CLIP_HEADER_RE.test(cell),
  );
  if (clip < 0 || audio < 0) return null;
  const length = headerCells.findIndex((cell, i) => i > 1 && A2V_LENGTH_HEADER_RE.test(cell));
  return { clip, audio, length: length > 1 ? length : 5 };
}

function parseA2vTable(markdown) {
  const body = sectionBody(markdown, (heading) => /A2V 립싱크/.test(heading));
  if (!body) return new Map();
  const lines = body.split('\n');
  const isHeaderRow = (line) => isTableRow(line) && /^컷/.test(cellsOf(line)[1] ?? '');
  // 헤더 행이 하나도 없는 구 형식 문서만 위치 폴백(2열=클립 / 3열=오디오)을 쓴다.
  const hasHeader = lines.some(isHeaderRow);
  const LEGACY = { clip: 2, audio: 3, length: 5 };

  const map = new Map();
  let column = hasHeader ? null : LEGACY;
  for (const line of lines) {
    // 표 밖(빈 줄·본문·불릿)으로 나오면 열 해석을 리셋한다 — 다음 표에 전 표의 열을 물려주지 않는다.
    if (!line.trimStart().startsWith('|')) {
      column = hasHeader ? null : LEGACY;
      continue;
    }
    if (!isTableRow(line)) continue;            // 구분선(|---|---|)
    const cells = cellsOf(line);
    if (isHeaderRow(line)) {
      column = parseA2vTableColumns(cells);      // null이면 이 표는 대상이 아니다
      continue;
    }
    if (column === null) continue;               // 대상 아닌 표의 CUT-NN 행 — 덮어쓰지 않는다
    if (!/^CUT-\d{2}$/.test(cells[1] ?? '')) continue;
    const fileRaw = lastMatch(stripStrike(cells[column.clip] ?? ''), CUT_FILE_RE);
    // 클립 열은 반드시 .mp4다 — 이미지 열을 잘못 집었을 때 조용히 넘어가지 않게 잠근다(ep2 회귀 원인).
    const file = fileRaw?.endsWith('.mp4') ? fileRaw : undefined;
    const audioFile = lastMatch(stripStrike(cells[column.audio] ?? ''), TTS_FILE_RE);
    const docDuration = Number(lastMatch(cells[column.length] ?? '', /([\d.]+)s/g)?.replace('s', ''));
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

// 문서의 수치 셀 정규화 — 강조 마크업·유니코드 마이너스(U+2212)·기호를 제거하고 숫자로 만든다.
const numberCell = (cell) => Number(
  String(cell ?? '')
    .replace(/\*\*/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/[^0-9.+-]/g, '')
    .trim(),
);

// 03-assets §채택 N컷 + S6 A3 게인 — SFX 컷 1:1 매핑 + **컷별** 게인(dB).
// | 컷 | 채택 | 피크 dB | RMS dB | A3 게인 | 근거 |
// 게인 폭이 -14.6~+15.4dB(30dB)라 트랙 일괄 게인으로는 표현할 수 없다 → 클립별 volumeDb로 방출한다.
function parseSfxGainTable(markdown) {
  const rows = new Map();
  for (const body of sectionsBodies(markdown, (heading) => /A3 게인/.test(heading) && /채택/.test(heading))) {
    for (const rawLine of body.split('\n')) {
      if (!isTableRow(rawLine)) continue;
      const line = stripStrike(rawLine);
      if (REJECT_MARKERS.test(line)) continue;
      const cells = cellsOf(line);
      const cutId = (cells[1] ?? '').match(/CUT-\d{2}/)?.[0];
      if (!cutId) continue;
      const take = (cells[2] ?? '').match(/r\d+/)?.[0];
      const gainDb = numberCell(cells[5]);
      if (!Number.isFinite(gainDb)) {
        throw new Error(`03-assets §A3 게인: ${cutId} 게인 값을 읽지 못했습니다 (셀 "${cells[5]}")`);
      }
      const peakDb = numberCell(cells[3]);
      rows.set(cutId, {
        cutId,
        take,
        gainDb,
        peakDb: Number.isFinite(peakDb) ? peakDb : undefined,
        file: `${cutId}-sfx.wav`,
      });
    }
  }
  return rows;
}

// 레거시 11열 "에셋 레코드" 표의 type=sfx 행(후속 프로덕션이 대장에 직접 등재하는 경로).
// 게인은 비고 칸의 "A3 게인 <dB>" 표기를 읽는다.
function parseSfxLedgerRows(markdown) {
  const rows = new Map();
  for (const rawLine of markdown.split('\n')) {
    if (!isTableRow(rawLine)) continue;
    const cells = cellsOf(stripStrike(rawLine));
    if (cells.length < 11 || cells[2] !== 'sfx') continue;
    const cutId = (cells[3] ?? '').match(/CUT-\d{2}/)?.[0];
    if (!cutId) continue;
    const gainCell = rawLine.match(/A3 게인\s*([+-−]?[\d.]+)/)?.[1];
    const gainDb = gainCell === undefined ? 0 : numberCell(gainCell);
    const duration = numberCell(cells[5]);
    rows.set(cutId, {
      cutId,
      gainDb: Number.isFinite(gainDb) ? gainDb : 0,
      file: path.basename(cells[4] ?? `${cutId}-sfx.wav`),
      docDuration: Number.isFinite(duration) ? duration : undefined,
      fromLedger: true,
    });
  }
  return rows;
}

// 채택 SFX 해석: §A3 게인 표가 권위, 없으면 레거시 대장 type=sfx 행.
function parseSfxAssets(markdown, { mediaRoot, paths }) {
  if (!paths.sfx) return new Map();
  const table = parseSfxGainTable(markdown);
  const rows = table.size > 0 ? table : parseSfxLedgerRows(markdown);
  const sfx = new Map();
  for (const [cutId, row] of rows) {
    sfx.set(cutId, {
      ...row,
      assetId: `${cutId}-sfx`,
      path: path.resolve(mediaRoot, paths.sfx, row.file),
    });
  }
  return sfx;
}

// 업스케일 산출 매핑: 03-assets §업스케일 섹션(다른 에이전트 append 예정)의 표가 있으면 그것이 권위,
// 없으면 `clips-v3-1080p\CUT-NN.mp4` 규칙을 가정한다(가정임을 로그로 명시).
function parseUpscaleMap(markdown) {
  // 권위는 「매핑 표 (원본 → 1080p) — S6 소비 기준」 소절이다(ep1·ep2 공통 표기).
  // 상위 헤딩은 "업스케일 … 체인 N클립"이라 종전의 `!/체인/` 술어로는 영원히 걸리지 않았고,
  // 그래서 규칙 가정(`<upscaled>\CUT-NN.mp4`)으로만 동작했다 — 결과는 같았지만 표를 읽지 않았다.
  const body = sectionBody(markdown, (heading) => /매핑 표/.test(heading) && /1080p/.test(heading))
    ?? sectionBody(markdown, (heading) => /업스케일/.test(heading) && !/체인/.test(heading));
  if (!body) return null;
  const map = parseAdoptedCutFileTable(body, '.mp4', /채택|클립|파일|1080p/);
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
  const upscaledDir = assetsDoc.paths.clipsUpscaled;   // 인자 override는 resolveCyclePaths가 이미 반영
  const clipDir = useUpscaled ? upscaledDir : assetsDoc.paths.clips;

  for (const insert of inserts) {
    if (cuts.some((cut) => cut.id === insert.id)) {
      warnings.push(`${insert.id}: 콘티 본문에 이미 존재해 삽입을 건너뜁니다`);
      continue;
    }
    const anchor = cuts.find((cut) => cut.id === insert.afterCut);
    if (!anchor) throw new Error(`${insert.id}: 삽입 기준 컷 ${insert.afterCut}이 콘티에 없습니다`);

    const clipPath = path.resolve(assetsDoc.mediaRoot, clipDir, insert.clipFile);
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
      path: path.resolve(assetsDoc.mediaRoot, assetsDoc.paths.cuts, insert.imageFile),
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

function parseAssetsDocV3(markdown, { cycle, args = {}, pathLog = [] }) {
  const productionId = markdown.match(/^production_id:\s*(\S+)/m)?.[1];
  if (!productionId) throw new Error('03-assets.md: production_id not found');

  const mediaRoot = path.join(COMFY_OUTPUT_ROOT, productionId);
  const ttsProductionRoot = path.join(TTS_OUTPUT_ROOT, productionId);
  const paths = resolveCyclePaths(cycle, { mediaRoot, ttsProductionRoot, args, log: pathLog });
  const ttsRoot = path.resolve(ttsProductionRoot, paths.tts);

  // 컷 정지 이미지·I2V 클립은 §채택 N컷 계열 표 전체에서 해석한다(1차·2차 패스 병합, 뒤가 우선).
  const imageTable = parseAdoptedCutFileTables(markdown, '.png', /채택\s*(파일|이미지)/);
  const clipTable = parseAdoptedCutFileTables(markdown, '.mp4', /채택\s*(클립|파일|영상)/);
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
    image.path = path.resolve(mediaRoot, paths.cuts, image.file);
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
    clip.path = path.resolve(mediaRoot, paths.clips, clip.file);
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
  const sfx = parseSfxAssets(markdown, { mediaRoot, paths });

  return { productionId, mediaRoot, ttsRoot, paths, images, clips, tts, bgm, sfx, a2vTable, upscaleMap };
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
  const upscaledDir = paths.clipsUpscaled;             // 인자 override는 resolveCyclePaths가 이미 반영

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
        clip.path = path.resolve(assetsDoc.mediaRoot, upscaledDir, mapped);
        clip.file = mapped;
      }
      cut.clipAsset = clip;
    }

    // A2V 자동 판별 교차 검증: 콘티 a2v 필드 ↔ 03-assets §A2V 표
    const inA2vTable = assetsDoc.a2vTable.has(cut.id);
    if (cut.isA2V !== inA2vTable) {
      // --allow-pending-a2v: A2V 클립이 아직 생성되지 않은 단계(Phase D 미완)에서 스테이징 컴파일용.
      // 해당 컷은 이번 컴파일에서 A2V가 아닌 것으로 다루고(TTS 세그먼트는 A1에 그대로 배치),
      // 클립이 생성되면 플래그 없이 재컴파일해 이중화 규칙을 복원한다.
      if (cut.isA2V && !inA2vTable && args['allow-pending-a2v']) {
        warnings.push(
          `${cut.id}: 콘티 a2v=예이지만 03-assets §A2V 표에 채택 클립이 없습니다(Phase D 미완) — `
          + '--allow-pending-a2v로 이번 컴파일에서만 I2V/정지 컷으로 다루고 해당 TTS 세그먼트를 A1에 배치합니다',
        );
        cut.isA2V = false;
        cut.a2vPending = true;
        cut.a2vSegmentKey = undefined;
      } else {
        throw new Error(
          `${cut.id}: A2V 판별 불일치 — 콘티 a2v=${cut.isA2V ? '예' : '아니오'} / 03-assets §A2V 표 ${inA2vTable ? '존재' : '없음'}`
          + `${cut.isA2V ? ' (Phase D 미완이면 --allow-pending-a2v)' : ''}`,
        );
      }
    }
    if (cut.isA2V) {
      const row = assetsDoc.a2vTable.get(cut.id);
      const boundKey = row.audioFile?.match(/^N\d{2}-\d{2}/)?.[0];
      if (cut.a2vSegmentKey && boundKey && cut.a2vSegmentKey !== boundKey) {
        throw new Error(`${cut.id}: A2V 세그먼트 불일치 — 콘티 ${cut.a2vSegmentKey} / 03-assets ${boundKey}`);
      }
      // 콘티가 장면 수준(ep2 "N04")만 적은 경우: 03-assets 표의 오디오 열이 세그먼트를 확정하고,
      // 콘티의 장면 참조는 그 결과가 같은 장면인지 검증하는 데만 쓴다(오바인딩 방어).
      if (!cut.a2vSegmentKey && boundKey && cut.a2vSceneRef && !boundKey.startsWith(cut.a2vSceneRef)) {
        throw new Error(
          `${cut.id}: A2V 장면 불일치 — 콘티 a2v 장면 참조 ${cut.a2vSceneRef} / 03-assets 바인딩 ${boundKey}`,
        );
      }
      cut.a2vSegmentKey = cut.a2vSegmentKey ?? boundKey;
      if (!cut.a2vSegmentKey) {
        throw new Error(
          `${cut.id}: A2V 컷이지만 바인딩된 TTS 세그먼트를 찾지 못했습니다 — `
          + `콘티 a2v="${cut.a2vSceneRef ?? '세그먼트·장면 참조 없음'}" / `
          + `03-assets §A2V 표 오디오 열="${row.audioFile ?? '미해석'}". `
          + '§A2V 표에 "채택 클립/파일" 열과 "오디오" 열이 모두 있는지, 오디오 셀에 `N##-##-*.wav`가 있는지 확인하십시오',
        );
      }
      if (!row.file) {
        throw new Error(
          `${cut.id}: §A2V 표에서 채택 클립(.mp4)을 해석하지 못했습니다 — "채택 클립/파일" 열 표기를 확인하십시오`,
        );
      }
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

// 채택 SFX 해석: 컷 1:1 매핑 검증 + 파일 실측(문서 표가 아니라 파일이 원천).
// 콘티에 없는 컷을 가리키는 행은 배치하지 않고 경고로 남긴다(대장 오타·컷 번호 변경 방어).
async function resolveSfxAssets(cuts, assetsDoc, warnings) {
  const sfxMap = assetsDoc.sfx ?? new Map();
  if (sfxMap.size === 0) return [];
  const cutById = new Map(cuts.map((cut) => [cut.id, cut]));
  const missing = [];
  const resolved = [];

  for (const [cutId, entry] of sfxMap) {
    if (!cutById.has(cutId)) {
      warnings.push(`SFX ${cutId}: 콘티에 없는 컷입니다 — A3 배치를 건너뜁니다(${entry.file})`);
      continue;
    }
    if (!existsSync(entry.path)) {
      missing.push(`${cutId} sfx: ${entry.path}`);
      continue;
    }
    const measured = await probeDuration(entry.path);
    if (measured === undefined) {
      warnings.push(`SFX ${cutId}: ffprobe 실패 — 문서 길이(${entry.docDuration ?? '미기재'})로 폴백합니다`);
    } else if (entry.docDuration !== undefined && Math.abs(measured - entry.docDuration) > 0.05) {
      warnings.push(`SFX ${cutId}: 대장 ${entry.docDuration}s ≠ 파일 실측 ${round(measured)}s — 파일 실측을 채택`);
    }
    entry.duration = measured !== undefined ? round(measured) : entry.docDuration;
    if (!Number.isFinite(entry.duration)) {
      throw new Error(`SFX ${cutId}: 길이를 확정하지 못했습니다 (${entry.path})`);
    }
    resolved.push(entry);
  }

  if (missing.length > 0) {
    throw new Error(`채택 SFX 파일 누락 ${missing.length}건:\n  - ${missing.join('\n  - ')}`);
  }
  return resolved;
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
    // `\r?\n` / `(.+?)\s*$` — CRLF 잔여 `\r`에도 무너지지 않는 형태(§0 정규화의 2차 방어).
    const sectionMatch = body.match(/- \*\*나레이션\/대사\*\*:\r?\n([\s\S]*?)(?=^- \*\*)/m);
    if (!sectionMatch) throw new Error(`01-script.md: scene N${blocks[i]} has no 나레이션/대사 block`);
    const lines = [];
    for (const raw of sectionMatch[1].split('\n')) {
      const line = raw.match(/^\s+-\s+([^:]+):\s*(.+?)\s*$/);
      if (line) lines.push({ speaker: line[1].trim(), text: line[2].trim() });
    }
    if (lines.length === 0) throw new Error(`01-script.md: scene N${blocks[i]} has no dialogue lines`);
    dialogues.set(scene, lines);
  }
  return dialogues;
}

// 한글 음절 수 — 03-assets §세그먼트 실측표의 "음절" 열과 같은 셈법(한글 음절 글자만 센다).
const countSyllables = (text) => (String(text).match(/[가-힣]/g) ?? []).length;

/**
 * 대본 대사 라인 ↔ TTS 세그먼트 정렬.
 *
 * TTS 세그먼트는 "장면 내 화자 교대 단위"다 — 연속된 동일 화자 대사는 1세그로 병합된다
 * (03-assets §세그먼트 분해 규약). 단 인용 낭독부는 동일 화자라도 분리된다.
 * 따라서 대본 라인 수와 세그먼트 수가 1:1이 아닐 수 있고, 자막을 세그먼트에 붙이려면
 * 대본 라인을 세그먼트 단위로 묶어야 한다. 우선순위:
 *   ① 라인 수 == 세그먼트 수  → 1:1 (ep1 경로 — 종전 동작 그대로)
 *   ② 표에 음절 열이 있으면   → 음절 수로 그리디 묶음(문서 수치가 정렬의 원천)
 *   ③ 그 외                   → 연속 동일 화자 병합
 * 어느 경로로도 수가 맞지 않으면 예외 — 자막이 어긋난 채로 진행하지 않는다.
 */
function alignScriptDialoguesToSegments(scriptDialogues, ttsSegments, warnings = []) {
  const aligned = new Map();
  const scenes = [...new Set(ttsSegments.map((seg) => seg.scene))].sort((a, b) => a - b);

  for (const scene of scenes) {
    const segs = ttsSegments.filter((seg) => seg.scene === scene);
    const lines = scriptDialogues.get(scene);
    if (!lines) throw new Error(`01-script.md: scene N${String(scene).padStart(2, '0')} 대사 블록이 없습니다`);

    if (lines.length === segs.length) {
      aligned.set(scene, lines);
      continue;
    }

    const hasSyllables = segs.every((seg) => Number.isFinite(seg.syllables));
    let groups;
    if (hasSyllables) {
      groups = [];
      let cursor = 0;
      segs.forEach((seg, index) => {
        const isLast = index === segs.length - 1;
        const group = [];
        let count = 0;
        while (cursor < lines.length && (isLast || count < seg.syllables)) {
          group.push(lines[cursor]);
          count += countSyllables(lines[cursor].text);
          cursor += 1;
        }
        if (!isLast && count !== seg.syllables) {
          warnings.push(
            `${seg.assetId}: 대본 음절 합 ${count} ≠ 표 음절 ${seg.syllables} — 자막 묶음 경계를 확인하세요`,
          );
        }
        groups.push(group);
      });
      if (cursor !== lines.length) {
        throw new Error(
          `N${String(scene).padStart(2, '0')}: 음절 기준 정렬 실패 — 대본 ${lines.length}행 중 ${cursor}행만 소비`,
        );
      }
    } else {
      groups = [];
      for (const line of lines) {
        const previous = groups[groups.length - 1];
        if (previous && previous[0].speaker === line.speaker) previous.push(line);
        else groups.push([line]);
      }
    }

    if (groups.length !== segs.length) {
      throw new Error(
        `N${String(scene).padStart(2, '0')}: 대본 ${lines.length}행 → ${groups.length}묶음 ≠ TTS 세그먼트 ${segs.length}개`,
      );
    }
    // 화자 교차 검증(표의 한글 화자 라벨 ↔ 대본 화자) — 어긋나면 경고만(정렬은 음절/병합이 원천)
    segs.forEach((seg, index) => {
      const label = seg.speakerLabel ?? '';
      const scriptSpeaker = groups[index][0].speaker;
      if (label && !label.includes(scriptSpeaker) && !scriptSpeaker.includes(label.replace(/\(.*\)/, '').trim())) {
        warnings.push(`${seg.assetId}: 표 화자 "${label}" ↔ 대본 화자 "${scriptSpeaker}" 불일치 — 정렬 확인 요망`);
      }
    });
    aligned.set(scene, groups.map((group) => ({
      speaker: group[0].speaker,
      text: group.map((line) => line.text).join(' '),
    })));
  }
  return aligned;
}

// 문장 단위 분할 → 줄바꿈(줄당 ~30자) → 최대 2줄 캡션 단위로 묶기
const CAPTION_LINE_MAX = 30;
// 자막 창 가드 — 발화 앞뒤로 이만큼만 여유를 준다(무음 패딩 전체를 자막에 쓰지 않는다).
const CAPTION_LEAD_GUARD = 0.1;
const CAPTION_TRAIL_GUARD = 0.25;
const CAPTION_MIN_WINDOW = 0.5;

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

    // A2V(립싱크) 컷 — 클립에 보이스가 내장돼 있다. 바인딩된 TTS 세그먼트 키를 함께 읽어
    // A1 트랙 이중 배치를 막는다(오디오 단일화 규칙).
    // 표기는 **프로덕션마다 다르다**:
    //   ep1 "예 — N04-02(세종) 립싱크"     → 세그먼트 수준(N04-02)까지 명시
    //   ep2 "예 — N04(선임 생도) 립싱크"    → **장면 수준(N04)만** 명시
    // 따라서 세그먼트 키는 있을 때만 취하고, 없으면 장면 참조만 보관한다. 실제 바인딩은
    // 03-assets §A2V 표의 오디오 열이 권위이며(resolveCutAssetsV3), 장면 참조는 그 결과의 교차 검증용이다.
    const a2vRaw = field('a2v') ?? '아니오';
    const isA2V = /^예/.test(a2vRaw);
    const a2vSegmentKey = isA2V ? a2vRaw.match(/N\d{2}-\d{2}/)?.[0] : undefined;
    const a2vSceneRef = isA2V ? a2vRaw.match(/N\d{2}/)?.[0] : undefined;

    if (!Number.isFinite(durationPlan) || !Number.isFinite(scene)) {
      throw new Error(`${id}: duration_seconds/narration_ref parse failure`);
    }
    if (!(transitionRaw in TRANSITION_MAP)) {
      throw new Error(`${id}: transition "${transitionRaw}" outside §2.1a vocabulary — blocked`);
    }

    cuts.push({
      id, no, durationPlan, scene, transition: transitionRaw, chapter, subtitle, isTitleCard, bgmCue,
      isI2V: /^I2V/i.test(motion),
      isA2V, a2vSegmentKey, a2vSceneRef,
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

async function importMedia(apiBase, cuts, assetsDoc, mappingPath, { cycle = 'v2', preferStill = false, embeddedSegmentKeys = new Set(), sfxAssets = [] } = {}) {
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
  // A3 SFX — 채택 컷만(콘티에 없는 컷/미배치 컷은 resolveSfxAssets가 이미 걸러낸다)
  for (const entry of sfxAssets) addJob(entry.assetId, entry.path, `sfx ${entry.cutId}`);

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
async function importMediaOffline(cuts, assetsDoc, mappingPath, { cycle, preferStill, embeddedSegmentKeys, sfxAssets = [] }) {
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
  for (const entry of sfxAssets) addJob(entry.assetId, entry.path);

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

// 화자 교대 간격: 같은 장면 안에서 앞 세그먼트와 화자가 다른 세그먼트 **앞**에 삽입하는 숨(초).
// 장면 경계는 이미 SCENE_PAUSE_SECONDS가 담당하므로 장면 내 교대만 센다.
// 이 간격이 러닝타임 게이트(01-script §길이 게이트)의 조정 레버다 — 대본·TTS·배속을 건드리지 않는다.
// 대사 사이의 **들리는** 쉼 하한. 교대 간격은 화자가 바뀔 때만 들어가므로 같은 화자가 연달아
// 말하는 구간(내레이터 연속 문장 등)은 쉼이 TTS 잔여 무음뿐이고, ep2 v1 실측에서 최소 0.058s까지
// 붙었다(108쌍 중 13쌍이 0.35s 미만). 인간 검수 「앞뒤 대사에 쉼이 없음」의 배경이다.
// 실측 무음(앞 세그 말단 + 뒤 세그 선단)을 합산해 모자란 만큼만 국소로 보탠다 — 전역 간격을 키우지 않는다.
const MIN_AUDIBLE_PAUSE_SECONDS = 0.35;

function computeSpeakerTurnGaps(ttsSegments, gapSeconds) {
  const gaps = new Map();
  let previous;
  let turns = 0;
  let padded = 0;
  let paddedTotal = 0;
  for (const seg of ttsSegments) {
    const sameScene = Boolean(previous) && previous.scene === seg.scene;
    const isTurn = sameScene && previous.speaker !== seg.speaker;
    if (isTurn) turns += 1;
    let gap = isTurn ? gapSeconds : 0;
    if (sameScene) {
      const audible = (previous.speechTrail ?? 0) + gap + (seg.speechLead ?? 0);
      const extra = round(Math.max(0, MIN_AUDIBLE_PAUSE_SECONDS - audible));
      if (extra > 0.001) { gap = round(gap + extra); padded += 1; paddedTotal += extra; }
    }
    gaps.set(seg.segmentKey, gap);
    previous = seg;
  }
  return { gaps, turns, total: round(turns * gapSeconds), padded, paddedTotal: round(paddedTotal) };
}


function computeTimelineV3(cuts, ttsSegments, warnings, preferStill = false, options = {}) {
  const speakerTurnGap = options.speakerTurnGap ?? SPEAKER_TURN_GAP_SECONDS;
  const turnGaps = computeSpeakerTurnGaps(ttsSegments, speakerTurnGap);
  // 장면 오디오 몫 = 세그먼트 실측 합 + 장면 내 화자 교대 간격 합
  const sceneAudio = new Map();
  const sceneSpeech = new Map();
  for (const seg of ttsSegments) {
    const gap = turnGaps.gaps.get(seg.segmentKey) ?? 0;
    sceneAudio.set(seg.scene, (sceneAudio.get(seg.scene) ?? 0) + gap + seg.duration);
    sceneSpeech.set(seg.scene, (sceneSpeech.get(seg.scene) ?? 0) + seg.duration);
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
      audioAt += turnGaps.gaps.get(seg.segmentKey) ?? 0;
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
      audioAtFinal += turnGaps.gaps.get(seg.segmentKey) ?? 0;
      const anchoredStart = anchorStartById.get(seg.segmentKey);
      if (anchoredStart !== undefined) audioAtFinal = Math.max(audioAtFinal, anchoredStart + A2V_LEAD_PAD_SECONDS);
      audioAtFinal += seg.duration;
    }
    const requiredEnd = audioAtFinal + tail;
    if (requiredEnd > at + 0.001) {
      // 늘리면 안 되는 컷이 두 종류 있다 — 둘 다 늘리는 순간 배속 1.0 계약이 깨진다:
      //  ① 고정 길이(S6 삽입) 컷 — fixedDuration
      //  ② **A2V 앵커 컷(pinned)** — 길이가 클립 유효 길이로 고정돼 있고 클립에 보이스가 내장돼 있다.
      //     늘리면 buildProject에서 sourceLength < duration이 되어 `atempo`로 **내장 보이스가
      //     타임스트레치**된다(실측: ep2 CUT-18이 0.299s 늘어나 atempo=0.964 = 발화 3.6% 신장·립싱크 이탈).
      //     오디오 우선 원칙(03-assets §길이 처리)에 정면으로 어긋나므로 성장 대상에서 제외한다.
      // 늘릴 수 있는 마지막 컷을 늘리고, 그 뒤 컷들은 같은 양만큼 뒤로 민다(갭·중첩 0 유지).
      const sceneIndices = placedCuts
        .map((cut, index) => (cut.scene === scene ? index : -1))
        .filter((index) => index >= 0);
      const growable = (index) => !Number.isFinite(placedCuts[index].fixedDuration)
        && !placedCuts[index].pinned;
      const growIndex = [...sceneIndices].reverse().find(growable)
        // 장면이 A2V/고정 컷으로만 이뤄진 예외 — 종전처럼 마지막 컷을 늘리되 경고로 남긴다.
        ?? (() => {
          const fallback = sceneIndices[sceneIndices.length - 1];
          warnings.push(
            `N${String(scene).padStart(2, '0')}: 늘릴 수 있는 자유 컷이 없어 ${placedCuts[fallback].id}를 연장합니다 `
            + '— A2V/고정 컷이면 배속이 1.0에서 벗어납니다(내장 보이스 타임스트레치 주의)',
          );
          return fallback;
        })();
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
      at += turnGaps.gaps.get(seg.segmentKey) ?? 0;
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

  // (5) 컷 전환을 조용한 지점으로 스냅 — 총 길이·장면 경계는 건드리지 않는 국소 보정
  const snaps = snapCutBoundariesToQuiet(placedCuts, placedTts, warnings);

  return {
    placedCuts, placedTts, sceneStart, sceneSpan, sceneAudio, sceneSpeech, totalDuration, scenes,
    speakerTurnGap, speakerTurns: turnGaps.turns, speakerTurnTotal: turnGaps.total,
    pausePadded: turnGaps.padded, pausePaddedTotal: turnGaps.paddedTotal, boundarySnaps: snaps,
  };
}

// ---------------------------------------------------------------------------
// 컷 전환 위치 스냅 — 「화면 전환이 급해서 앞뒤 대사에 쉼이 없다」의 국소 해
// ---------------------------------------------------------------------------
// 컷 길이는 콘티 계획 비율로 나뉘므로 경계가 발화 한복판이나 숨의 꼬리에 떨어진다
// (ep2 v1 실측: 3:03 지점 CUT-26→27 경계 183.344s가 장영실 대사 안의 0.628초 숨
//  182.894~183.522s의 **끝에서 0.178초 앞**에 있었다 — 화면이 바뀌자마자 목소리가 이어진다).
// 실측 발화 런의 여집합(조용한 창)을 구해, 경계를 그 창의 **앞쪽**으로 옮긴다. 새 그림이
// 자리 잡을 시간을 벌어 준다. 총 길이·장면 경계·A2V 앵커는 절대 건드리지 않는다.
const SNAP_TOLERANCE_SECONDS = 1.5;   // 이보다 먼 조용한 창까지 끌고 가지 않는다
const SNAP_MIN_QUIET_SECONDS = 0.28;  // 이보다 짧은 틈은 전환 자리로 쓰지 않는다
const SNAP_ENTRY_SECONDS = 0.1;       // 조용한 창 시작에서 이만큼 뒤에 전환을 둔다
const SNAP_MIN_CUT_SECONDS = 1.2;     // 스냅으로 컷이 이보다 짧아지지 않게 한다

function buildQuietWindows(placedTts, totalDuration) {
  const speech = [];
  for (const seg of placedTts) {
    const runs = seg.speechRuns;
    if (Array.isArray(runs) && runs.length > 0) {
      for (const [from, to] of runs) speech.push([seg.start + from, seg.start + to]);
    } else {
      speech.push([seg.start, seg.start + seg.duration]);
    }
  }
  speech.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const span of speech) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + 0.001) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  const quiet = [];
  let at = 0;
  for (const [from, to] of merged) {
    if (from > at + 0.001) quiet.push([at, from]);
    at = Math.max(at, to);
  }
  if (totalDuration > at + 0.001) quiet.push([at, totalDuration]);
  return quiet;
}

function snapCutBoundariesToQuiet(placedCuts, placedTts, warnings) {
  const quiet = buildQuietWindows(placedTts, placedCuts[placedCuts.length - 1]?.end ?? 0);
  if (quiet.length === 0) return [];
  const moves = [];
  for (let i = 1; i < placedCuts.length; i += 1) {
    const prev = placedCuts[i - 1];
    const cur = placedCuts[i];
    // 장면 경계는 옮기지 않는다(장면 스팬·휴지 계약). A2V 앵커·고정 길이 컷도 제외.
    if (prev.scene !== cur.scene) continue;
    if (prev.pinned || cur.pinned) continue;
    if (Number.isFinite(prev.fixedDuration) || Number.isFinite(cur.fixedDuration)) continue;

    const boundary = cur.start;
    let best;
    for (const [qs, qe] of quiet) {
      if (qe - qs < SNAP_MIN_QUIET_SECONDS) continue;
      const target = Math.min(qs + SNAP_ENTRY_SECONDS, qe - SNAP_ENTRY_SECONDS);
      const distance = Math.abs(target - boundary);
      if (distance > SNAP_TOLERANCE_SECONDS) continue;
      if (!best || distance < best.distance) best = { target, distance, quiet: [qs, qe] };
    }
    if (!best || best.distance < 0.05) continue;

    const target = round(best.target);
    const prevDuration = round(target - prev.start);
    const curDuration = round(cur.end - target);
    if (prevDuration < SNAP_MIN_CUT_SECONDS || curDuration < SNAP_MIN_CUT_SECONDS) continue;
    // 배속 하한(0.85) 계약 — 늘리는 쪽만 검사한다. 이미 하한을 밑도는 컷은 더 나빠지지 않을 때만 허용.
    const fits = (cut, duration) => {
      if (duration <= cut.duration + 0.001) return true;                  // 짧아지면 트림뿐 — 항상 안전
      const source = effectiveSourceLength(cut);
      if (!Number.isFinite(source)) return true;
      return duration <= Math.max(cut.duration, source / MIN_FIT_SPEED) + 0.001;
    };
    if (!fits(prev, prevDuration) || !fits(cur, curDuration)) continue;

    moves.push({
      cutId: cur.id, from: boundary, to: target,
      delta: round(target - boundary), quiet: best.quiet,
    });
    prev.duration = prevDuration;
    prev.end = target;
    cur.start = target;
    cur.duration = curDuration;
  }
  if (moves.length > 0) {
    const worst = moves.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
    warnings.push(
      `컷 전환 스냅 ${moves.length}건 — 발화 한복판·숨 꼬리의 경계를 조용한 창 앞쪽으로 이동`
      + `(최대 이동: ${worst.map((m) => `${m.cutId} ${m.from.toFixed(3)}→${m.to.toFixed(3)}`).join(' · ')})`,
    );
  }
  return moves;
}

function buildProject({
  productionId, projectName, cuts, timeline, assetsDoc, mapping, scriptDialogues,
  cycle = 'v2', warnings = [], preferStill = false, kenBurns = cycle === 'v2', sfxDuckDb = 0,
  allowPendingBgm = false,
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
  // A3 SFX 소스 — 채택 컷 1:1(콘티에 없는 컷/파일 누락은 resolveSfxAssets가 이미 처리)
  for (const sfx of (assetsDoc.sfx ?? new Map()).values()) {
    if (!Number.isFinite(sfx.duration)) continue;
    pushMediaAsset(sfx.assetId, 'audio', `${sfx.cutId} SFX`, sfx.duration, { sfxCutId: sfx.cutId });
  }

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
    // 자막 창 = **클립 경계가 아니라 실측 발화 창**. TTS 선단·말단 무음을 그대로 자막에 쓰면
    // 자막이 목소리보다 최대 0.76s 먼저 뜨고 1.19s 더 남는다(ep2 v1 인간 지적 「자막 안 맞음」·
    // 「대사 안 나옴」). 리드 가드만큼만 미리 띄우고 테일 가드만큼만 붙잡는다.
    const lead = Math.max(0, seg.speechLead ?? 0);
    const trail = Math.max(0, seg.speechTrail ?? 0);
    const rawStart = seg.start + Math.max(0, lead - CAPTION_LEAD_GUARD);
    const rawEnd = seg.start + seg.duration - Math.max(0, trail - CAPTION_TRAIL_GUARD);
    const capStart = round(rawStart);
    const capEnd = round(Math.max(rawEnd, rawStart + CAPTION_MIN_WINDOW));
    const capSpan = capEnd - capStart;
    let at = capStart;
    units.forEach((text, unitIndex) => {
      const isLast = unitIndex === units.length - 1;
      const end = isLast
        ? capEnd
        : round(at + (capSpan * captionWeight(text)) / totalWeight);
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
      // 덕킹을 켤 때만 태그를 붙인다 — 렌더러 isDuckingSourceClip이 나레이션을 덕킹 소스로 인식하는 조건
      // (오디오 에셋은 태그가 없으면 소스로 잡히지 않는다). 태그는 automation 규칙과 무관('comfyui'만 매칭).
      automationTags: sfxDuckDb < 0 ? ['voice'] : [],
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
    // BGM 미생성 단계(대장 행 0건)에서는 A2를 비운 채 스테이징 컴파일을 허용한다.
    // 부분 생성(행이 있는데 구간 수와 다름)은 계약 위반이므로 그대로 차단한다.
    if (assetsDoc.bgm.length === 0 && allowPendingBgm) {
      warnings.push(
        `BGM 대장 행이 0건입니다 — A2 트랙을 비운 채로 컴파일했습니다(bgm_cue 구간 ${segments.length}개 대기). `
        + 'BGM 생성 후 플래그 없이 재컴파일 필요',
      );
      decisions.push(`A2 BGM: 미생성(구간 ${segments.length}개 대기) — 클립 0개`);
    } else {
      throw new Error(
        `bgm cue segments (${segments.length}) != bgm tracks (${assetsDoc.bgm.length})`
        + `${assetsDoc.bgm.length === 0 ? ' — BGM 미생성 단계면 --allow-pending-bgm' : ''}`,
      );
    }
  }
  const a2Clips = [];
  const BGM_MIN_REPEAT_TAIL = 4;   // 이보다 짧은 자투리는 반복하지 않는다(짧은 조각 재진입 = 부자연)
  const BGM_FADE_IN_SECONDS = 2;   // 구간 첫 조각의 진입 페이드(하드 스타트가 대사와 충돌하는 것을 막는다)
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
      const keyframes = [];
      // 첫 조각은 앞 2초 페이드인. 종전에는 페이드아웃만 있어 **BGM이 하드 스타트**했고,
      // ep2에서는 그 시점이 대사 시작과 정확히 같은 프레임이었다(0.000s = N01-01 시작,
      // 132.547s = N05-01 시작). 인간 검수 「0~9초 소리 겹침」의 직접 원인이라 진입을 완만하게 만든다.
      // 반복 조각(repeatIndex>0)은 이어 붙어야 하므로 페이드인 없음.
      if (repeatIndex === 0) {
        const fadeIn = round(Math.min(BGM_FADE_IN_SECONDS, placement.duration / 3));
        if (fadeIn > 0.05) {
          keyframes.push(
            { id: `kf-${clip.id}-in-a`, property: 'volume', time: 0, value: 0, easing: 'linear' },
            { id: `kf-${clip.id}-in-b`, property: 'volume', time: fadeIn, value: 1, easing: 'linear' },
          );
        }
      }
      // 마지막 조각만 끝 2초 페이드(구간 경계 클릭 방지). 중간 반복은 이어 붙어야 하므로 페이드 없음.
      if (repeatIndex === placements.length - 1) {
        keyframes.push(
          { id: `kf-${clip.id}-fade-a`, property: 'volume', time: round(Math.max(0, placement.duration - 2)), value: 1, easing: 'linear' },
          { id: `kf-${clip.id}-fade-b`, property: 'volume', time: placement.duration, value: 0, easing: 'linear' },
        );
      }
      if (keyframes.length > 0) clip.keyframes = keyframes.sort((a, b) => a.time - b.time);
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

  // ---- A3 SFX — 컷 1:1 배치 + 클립별 volumeDb ------------------------------
  // 게인은 03-assets §A3 게인 표(기준 피크 -18dBFS로 정규화한 컷별 값)를 그대로 쓴다.
  // 편차가 -14.6~+15.4dB(30dB)라 트랙 일괄 게인으로는 표현 불가 — 클립 단위 게인이 유일한 표현이다.
  // 의도된 침묵(bgm stop 구간)에는 배치하지 않는다(03-assets §S6 통합 설계 규약).
  const a3Clips = [];
  const sfxLedger = assetsDoc.sfx ?? new Map();
  if (sfxLedger.size > 0) {
    // bgm stop 구간 = stop 컷 시작 ~ 다음 start/change 컷 시작(없으면 타임라인 끝)
    const silenceSpans = [];
    for (const cut of placedCuts) {
      if (cut.bgmCue === 'stop') {
        silenceSpans.push({ start: cut.start, end: totalDuration, fromCutId: cut.id, toCutId: undefined });
      } else if ((cut.bgmCue === 'start' || cut.bgmCue === 'change') && silenceSpans.length > 0) {
        const open = silenceSpans[silenceSpans.length - 1];
        if (open.toCutId === undefined) {
          open.end = cut.start;
          open.toCutId = cut.id;
        }
      }
    }

    const placedSfx = [];
    const skippedSfx = [];
    for (const cut of placedCuts) {
      const sfx = sfxLedger.get(cut.id);
      if (!sfx) continue;
      if (!Number.isFinite(sfx.duration)) throw new Error(`SFX ${cut.id}: 길이 미확정 — resolveSfxAssets 선행 필요`);

      const adjustment = SFX_CUT_ADJUSTMENTS[cut.id] ?? {};
      const lead = Number.isFinite(adjustment.leadSeconds)
        ? (adjustment.onsetSeconds ?? 0) + adjustment.leadSeconds
        : 0;
      const start = round(Math.max(0, cut.start - lead));
      const end = round(Math.min(start + sfx.duration, cut.end));
      const duration = round(end - start);

      const silence = silenceSpans.find((span) => start < span.end - 0.001 && end > span.start + 0.001);
      if (silence) {
        skippedSfx.push(`${cut.id}(bgm stop ${silence.fromCutId}~${silence.toCutId ?? '끝'})`);
        warnings.push(
          `SFX ${cut.id}: 의도된 침묵 구간(bgm stop ${silence.fromCutId}~${silence.toCutId ?? '타임라인 끝'})과 겹쳐 `
          + 'A3 배치를 금지했습니다 — 03-assets §S6 통합 설계 규약',
        );
        continue;
      }
      if (duration < 0.05) {
        warnings.push(`SFX ${cut.id}: 컷 슬롯이 ${duration}s로 너무 짧아 배치하지 않았습니다`);
        continue;
      }

      const gainDb = round((sfx.gainDb ?? 0) + (adjustment.gainOffsetDb ?? 0));
      const clip = makeClip({
        id: `clip-${cut.id.toLowerCase()}-sfx`,
        assetId: assetIdOf.get(sfx.assetId),
        trackId: 'track-a3',
        name: `${cut.id} SFX${sfx.take ? ` ${sfx.take}` : ''} (${gainDb >= 0 ? '+' : ''}${gainDb}dB)`,
        kind: 'audio',
        start,
        duration,
        volumeDb: gainDb,           // ★ 클립 단위 게인 — 렌더러 오디오 그래프에 그대로 전달된다
        color: '#fb923c',
        automationTags: ['sfx'],
        effects: sfxDuckDb < 0
          ? [{
            id: `effect-${cut.id.toLowerCase()}-sfx-duck`,
            type: 'audio',
            label: 'SFX ducking (dialogue)',
            enabled: true,
            parameters: { reductionDb: sfxDuckDb, attackMs: 80, releaseMs: 250 },
          }]
          : [],
      });
      a3Clips.push(clip);
      placedSfx.push(`${cut.id}${sfx.take ? `/${sfx.take}` : ''} ${gainDb >= 0 ? '+' : ''}${gainDb}dB`);

      if (lead > 0) {
        decisions.push(
          `${cut.id}: SFX를 컷 시작보다 ${round(lead)}s 선행 배치(온셋 ${adjustment.onsetSeconds}s + 선행 ${adjustment.leadSeconds}s) — ${adjustment.note}`,
        );
        warnings.push(`SFX ${cut.id}: 선행 배치로 직전 컷 구간(${start}s~${cut.start}s)에 소리가 걸칩니다 — 편집기에서 육안·청취 확인 요망`);
        todoMarkers.push({ time: start, label: `${cut.id} SFX 선행 배치`, note: adjustment.note });
      }
      if (adjustment.advisory) {
        warnings.push(`SFX ${cut.id}: [레벨 판단 이관] ${adjustment.advisory}`);
        todoMarkers.push({ time: start, label: `${cut.id} SFX 레벨 판단`, note: adjustment.advisory });
      }
    }

    decisions.push(
      `A3 SFX ${a3Clips.length}클립 배치(트랙 게인 ${SFX_TRACK_GAIN_DB}dB — 절대 레벨은 클립별 volumeDb, `
      + `기준 피크 ${SFX_REFERENCE_PEAK_DBFS}dBFS): ${placedSfx.join(' · ')}`,
    );

    // 레벨 관계 점검: 대사(A1 나레이션 + A2V 내장 보이스)와 동시 발음되는 SFX를 명시한다.
    // 게인 표가 이미 기준 피크를 대사 아래로 잡았지만, 겹치는 구간은 인간이 청취로 확인해야 한다.
    const speechSpans = [
      ...a1Clips.map((clip) => ({ id: clip.name, start: clip.start, end: clip.start + clip.duration })),
      ...placedCuts
        .filter((cut) => cut.isA2V && cut.pinned)
        .map((cut) => ({ id: `${cut.id}(A2V 내장)`, start: cut.start, end: cut.end })),
    ];
    const overlapping = a3Clips
      .map((clip) => {
        const end = clip.start + clip.duration;
        const hits = speechSpans.filter((span) => span.start < end - 0.001 && span.end > clip.start + 0.001);
        return hits.length > 0 ? `${clip.name} ↔ ${hits.length}세그(${hits.map((hit) => hit.id).join(',')})` : undefined;
      })
      .filter(Boolean);
    if (overlapping.length > 0) {
      decisions.push(
        `A3 SFX 대사 동시 발음 ${overlapping.length}건 — 기준 피크 ${SFX_REFERENCE_PEAK_DBFS}dBFS로 대사 아래 배치됨`
        + `${sfxDuckDb < 0 ? `, 추가 덕킹 ${sfxDuckDb}dB 적용` : ', 추가 덕킹 없음(--sfx-duck-db로 -3~-6dB 권고)'}: `
        + overlapping.join(' / '),
      );
      if (sfxDuckDb === 0) {
        warnings.push(
          `A3 SFX ${overlapping.length}건이 대사와 동시 발음됩니다 — 03-assets §S6 통합 설계는 추가 -3~-6dB 덕킹을 권고합니다`
          + '(--sfx-duck-db -3). 현재는 게인 표 값만 적용했습니다 — 인간 청취 판단',
        );
      }
    }
    if (skippedSfx.length > 0) {
      decisions.push(`A3 SFX ${skippedSfx.length}건 배치 금지(의도된 침묵 구간): ${skippedSfx.join(' · ')}`);
    }
    if (sfxDuckDb < 0) {
      decisions.push(`A3 SFX 덕킹 ${sfxDuckDb}dB — 대사/내장 보이스 구간에서 자동 감쇠(렌더러 ducking 이펙트)`);
    }
  }

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

  const masterAudio = MASTER_AUDIO_BY_PRODUCTION[productionId];
  decisions.push(
    masterAudio
      ? `마스터 라우드니스 단 적용: I=${masterAudio.loudnessLufs} LUFS / TP=${masterAudio.truePeakDb} dBTP `
        + '(rule-before-export 명시 방출 — project-store 기본 규칙 병합 차단)'
      : ' 마스터 라우드니스 단 미적용(프로덕션 미등재) — rule-before-export를 파라미터 없이 방출해 '
        + '기본 규칙(I=-14/TP=-1.5) 병합을 차단한다(규칙 도입 전 동작 재현)',
  );

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
        // A3는 채택 SFX가 있을 때만 방출한다(없는 프로덕션의 프로젝트 형상 불변)
        ...(a3Clips.length > 0
          ? [{ ...makeTrack('track-a3', 'A3 SFX', 'audio', a3Clips), volumeDb: SFX_TRACK_GAIN_DB }]
          : []),
      ],
      markers,
      captions,
      // 마스터 라우드니스 단은 프로덕션별 옵트인이다(위 MASTER_AUDIO_BY_PRODUCTION 주석 참조).
      // 규칙 자체는 항상 방출해 project-store의 기본 규칙 병합을 차단한다 — 미등재 프로덕션은
      // 라우드니스 파라미터가 없으므로 renderer가 loudnorm·alimiter를 아예 붙이지 않는다.
      automation: [{
        id: 'rule-before-export',
        name: 'Caption, loudness, color pass',
        provider: 'local',
        trigger: 'before-export',
        targetTrackIds: ['track-v1', 'track-a1'],
        parameters: {
          captions: true,
          colorMatch: true,
          ...(MASTER_AUDIO_BY_PRODUCTION[productionId] ?? {}),
        },
      }],
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
    // 클립 단위 게인(dB) — 지정한 클립에만 필드를 만든다(미지정 클립의 JSON 형상 불변)
    ...(clip.volumeDb === undefined ? {} : { volumeDb: clip.volumeDb }),
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

  // vault 마크다운은 전부 readMarkdown()을 통해서만 읽는다 — CRLF 정규화 단일 관문(§0).
  const storyboardMd = await readMarkdown(args.storyboard);
  const assetsMd = await readMarkdown(args.assets);
  const scriptMd = await readMarkdown(args.script); // 전체 자막 원문(문장 분할 소스)

  const cycle = args.cycle;
  const isV3 = cycle === 'v3';
  PROJECT_FPS = PROJECT_FPS_BY_CYCLE[cycle];
  const warnings = [];

  // 러닝타임 게이트 레버 (01-script §길이 게이트 480~510초) — 미지정 시 종전 기본값
  for (const [flag, name] of [
    ['scene-pause', 'SCENE_PAUSE'],
    ['ending-margin', 'ENDING_MARGIN'],
    ['speaker-turn-gap', 'SPEAKER_TURN_GAP'],
  ]) {
    if (args[flag] === undefined) continue;
    const value = Number(args[flag]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${flag} must be a non-negative number`);
    if (name === 'SCENE_PAUSE') SCENE_PAUSE_SECONDS = value;
    else if (name === 'ENDING_MARGIN') ENDING_MARGIN_SECONDS = value;
    else SPEAKER_TURN_GAP_SECONDS = value;
  }

  // A3 SFX 덕킹(대사 구간 감쇠) — 03-assets §S6 통합 설계 권고 -3~-6dB. 기본 0 = 덕킹 없음.
  const sfxDuckDb = args['sfx-duck-db'] === undefined ? 0 : Number(args['sfx-duck-db']);
  if (!Number.isFinite(sfxDuckDb) || sfxDuckDb > 0) {
    throw new Error('--sfx-duck-db must be a non-positive number (예: -3)');
  }

  const pathLog = [];
  const assetsDoc = isV3
    ? parseAssetsDocV3(assetsMd, { cycle, args, pathLog })
    : parseAssetsDoc(assetsMd);
  for (const line of pathLog) console.log(`  ${line}`);

  // 컷별 보정 표 확정 — production_id 색인(에피소드 간 컷 번호 오적용 방지) + 외부 JSON override
  S6_CUT_ADJUSTMENTS = S6_CUT_ADJUSTMENTS_BY_PRODUCTION[assetsDoc.productionId] ?? {};
  SFX_CUT_ADJUSTMENTS = SFX_CUT_ADJUSTMENTS_BY_PRODUCTION[assetsDoc.productionId] ?? {};

  // BGM 트랙 게인도 프로덕션별 상수다(§BGM 러드니스 정합) — 미등재면 기본값 + 경고.
  BGM_TRACK_GAIN_DB = BGM_TRACK_GAIN_DB_BY_PRODUCTION[assetsDoc.productionId] ?? BGM_TRACK_GAIN_DB_DEFAULT;
  if (args['bgm-gain-db'] !== undefined) {
    const value = Number(args['bgm-gain-db']);
    if (!Number.isFinite(value)) throw new Error('--bgm-gain-db must be a number');
    BGM_TRACK_GAIN_DB = value;
  }
  if (BGM_TRACK_GAIN_DB_BY_PRODUCTION[assetsDoc.productionId] === undefined && args['bgm-gain-db'] === undefined) {
    warnings.push(
      `BGM 트랙 게인: production ${assetsDoc.productionId}의 등재 값이 없어 기본 ${BGM_TRACK_GAIN_DB_DEFAULT}dB를 씁니다 — `
      + '03-assets §BGM 러드니스 정합의 권고 게인을 상수 표에 등재하거나 --bgm-gain-db로 지정하십시오',
    );
  }
  console.log(`bgm track gain: ${BGM_TRACK_GAIN_DB}dB (production 상수${args['bgm-gain-db'] !== undefined ? ' — --bgm-gain-db override' : ''})`);
  if (args['cut-adjustments']) {
    S6_CUT_ADJUSTMENTS = JSON.parse(await readFile(args['cut-adjustments'], 'utf8'));
    console.log(`cut adjustments: ${args['cut-adjustments']} (${Object.keys(S6_CUT_ADJUSTMENTS).length}컷)`);
  }
  if (args['sfx-adjustments']) {
    SFX_CUT_ADJUSTMENTS = JSON.parse(await readFile(args['sfx-adjustments'], 'utf8'));
    console.log(`sfx adjustments: ${args['sfx-adjustments']} (${Object.keys(SFX_CUT_ADJUSTMENTS).length}컷)`);
  }
  console.log(
    `cut adjustments: ${Object.keys(S6_CUT_ADJUSTMENTS).length}컷 / sfx adjustments: ${Object.keys(SFX_CUT_ADJUSTMENTS).length}컷`
    + ` (production ${assetsDoc.productionId})`,
  );
  if (Object.keys(S6_CUT_ADJUSTMENTS).length === 0 && /S6 이관 플래그/.test(assetsMd)) {
    warnings.push(
      '03-assets에 §S6 이관 플래그 절이 있으나 이 프로덕션의 컷 보정 표가 등재되지 않았습니다 — '
      + '크롭·트림은 자동 적용되지 않습니다(선언 표 등재 또는 --cut-adjustments <json> 필요)',
    );
  }
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

  console.log(`cycle: ${cycle} (project fps ${PROJECT_FPS}, prefer ${args.prefer}${args.upscaled ? ', upscaled clips' : ''}, scene-pause ${SCENE_PAUSE_SECONDS}s, ending-margin ${ENDING_MARGIN_SECONDS}s, speaker-turn-gap ${SPEAKER_TURN_GAP_SECONDS}s)`);
  if (isV3) {
    const p = assetsDoc.paths;
    console.log(`media dirs: cuts=${p.cuts} / clips=${p.clips} / clips-upscaled=${p.clipsUpscaled ?? '—'} / tts=${p.tts} / sfx=${p.sfx ?? '—'} (root ${assetsDoc.mediaRoot})`);
  }

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

  // 세그먼트 ↔ 대본 대사 정렬 (연속 동일 화자 병합 규약 반영 — §세그먼트 분해 규약)
  const alignedDialogues = alignScriptDialoguesToSegments(scriptDialogues, assetsDoc.tts, warnings);
  for (const scene of alignedDialogues.keys()) {
    const segs = assetsDoc.tts.filter((seg) => seg.scene === scene);
    const units = alignedDialogues.get(scene);
    if (segs.length !== units.length) {
      throw new Error(`scene N${scene}: tts segments ${segs.length} != aligned dialogue units ${units.length}`);
    }
    const rawLines = scriptDialogues.get(scene).length;
    if (rawLines !== units.length) {
      console.log(`  N${String(scene).padStart(2, '0')}: 대본 ${rawLines}행 → 세그먼트 ${units.length}개로 묶음(화자 교대 단위)`);
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
    // 발화 구간 실측 — 자막 동기(§캡션)와 컷 전환 위치(§전환 스냅)의 원천.
    let silenceProbed = 0;
    for (const seg of assetsDoc.tts) {
      const probe = await probeSilence(seg.path, seg.duration ?? seg.docDuration);
      if (!probe) continue;
      seg.speechLead = probe.lead;
      seg.speechTrail = probe.trail;
      seg.speechRuns = probe.speech;
      silenceProbed += 1;
    }
    if (silenceProbed > 0) {
      const leadSum = round(assetsDoc.tts.reduce((sum, seg) => sum + (seg.speechLead ?? 0), 0));
      const trailSum = round(assetsDoc.tts.reduce((sum, seg) => sum + (seg.speechTrail ?? 0), 0));
      console.log(
        `발화 구간 실측: ${silenceProbed}/${assetsDoc.tts.length}개 — 선단 무음 합 ${leadSum}s · 말단 무음 합 ${trailSum}s `
        + '(자막은 발화에 정렬, 오디오 배치는 불변)',
      );
    }
  } else {
    resolveCutAssets(cuts, sourceMap, assetsDoc);
  }

  // 채택 SFX 해석(v3) — 컷 1:1 + 파일 실측. 없는 프로덕션에서는 빈 배열.
  const sfxAssets = isV3 ? await resolveSfxAssets(cuts, assetsDoc, warnings) : [];
  if (assetsDoc.sfx) {
    for (const cutId of [...assetsDoc.sfx.keys()]) {
      if (!sfxAssets.some((entry) => entry.cutId === cutId)) assetsDoc.sfx.delete(cutId);
    }
  }

  const uniqueImages = new Set(cuts.map((cut) => cut.imageAsset.assetId));
  const uniqueClips = isV3
    ? new Set(cuts.filter((cut) => cut.clipAsset).map((cut) => cut.clipAsset.assetId))
    : new Set(cuts.filter((cut) => cut.i2vAsset).map((cut) => cut.i2vAsset.assetId));
  const a2vCuts = cuts.filter((cut) => cut.isA2V);
  console.log(`production: ${assetsDoc.productionId}`);
  console.log(`cuts: ${cuts.length} / images: ${uniqueImages.size} / tts: ${assetsDoc.tts.length} / bgm: ${assetsDoc.bgm.length} / sfx: ${sfxAssets.length} / clips: ${uniqueClips.size} (A2V ${a2vCuts.length})`);
  if (sfxAssets.length > 0) {
    console.log(`sfx gains: ${sfxAssets.map((entry) => `${entry.cutId}${entry.take ? `/${entry.take}` : ''} ${entry.gainDb >= 0 ? '+' : ''}${entry.gainDb}dB`).join(' · ')}`);
  }

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
      ? await importMediaOffline(cuts, assetsDoc, mappingPath, { cycle, preferStill, embeddedSegmentKeys, sfxAssets })
      : await importMedia(args.api, cuts, assetsDoc, mappingPath, { cycle, preferStill, embeddedSegmentKeys, sfxAssets });
  }

  if (!steps.includes('compile')) return;

  // --target-duration: 화자 교대 간격을 설계 변수로 삼아 목표 러닝타임에 착지시킨다.
  //   총 길이는 간격에 대해 단조증가이므로 이분법으로 해를 구한다.
  //   대본·TTS 재생성·배속은 건드리지 않는다 — 조정 레버는 간격뿐이다.
  if (isV3 && args['target-duration'] !== undefined) {
    const target = Number(args['target-duration']);
    if (!Number.isFinite(target) || target <= 0) throw new Error('--target-duration must be a positive number');
    const probe = (gap) => computeTimelineV3(cuts, assetsDoc.tts, [], preferStill, { speakerTurnGap: gap }).totalDuration;
    let low = 0;
    let high = 1.0;
    if (probe(low) > target) {
      console.log(`\n--target-duration ${target}s: 간격 0에서도 ${probe(low)}s — 간격으로는 줄일 수 없습니다(간격 0 적용)`);
      SPEAKER_TURN_GAP_SECONDS = 0;
    } else {
      while (probe(high) < target && high < 8) high *= 2;
      for (let i = 0; i < 40; i += 1) {
        const mid = (low + high) / 2;
        if (probe(mid) < target) low = mid;
        else high = mid;
      }
      SPEAKER_TURN_GAP_SECONDS = Math.round(((low + high) / 2) * 1000) / 1000;
      console.log(`\n--target-duration ${target}s → 화자 교대 간격 해 ${SPEAKER_TURN_GAP_SECONDS}s (총 ${probe(SPEAKER_TURN_GAP_SECONDS)}s)`);
    }
  }

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
    scriptDialogues: alignedDialogues,
    cycle,
    warnings,
    preferStill,
    kenBurns: isV3 ? Boolean(args.kenburns) : true,
    sfxDuckDb,
    allowPendingBgm: Boolean(args['allow-pending-bgm']),
  });

  // 자체 검증 출력: 총 길이 정합
  const ttsTotal = round(assetsDoc.tts.reduce((sum, seg) => sum + seg.duration, 0));
  const turnTotal = timeline.speakerTurnTotal ?? 0;
  const pauseTotal = timeline.pausePaddedTotal ?? 0;
  const expected = round(
    ttsTotal + turnTotal + pauseTotal
    + (timeline.scenes.length - 1) * SCENE_PAUSE_SECONDS + ENDING_MARGIN_SECONDS,
  );
  console.log('\n--- duration self-check ---');
  console.log(`TTS 실측 합계: ${ttsTotal}s`);
  if (timeline.speakerTurns !== undefined) {
    console.log(`화자 교대 간격: ${timeline.speakerTurns}회 × ${timeline.speakerTurnGap}s = ${turnTotal}s (장면 내 교대만)`);
  }
  if (timeline.pausePadded) {
    console.log(
      `쉼 하한 보정: ${timeline.pausePadded}쌍 × 평균 ${round(timeline.pausePaddedTotal / timeline.pausePadded)}s = `
      + `${timeline.pausePaddedTotal}s (들리는 쉼 ${MIN_AUDIBLE_PAUSE_SECONDS}s 하한 — 실측 무음 합산 후 부족분만)`,
    );
  }
  if (timeline.boundarySnaps?.length) {
    console.log(`컷 전환 스냅: ${timeline.boundarySnaps.length}건 (조용한 창 앞쪽으로 이동 — 총 길이 불변)`);
  }
  console.log(`기대 총 길이 = 실측 + 교대 간격 ${turnTotal}s + 쉼 하한 보정 ${pauseTotal}s + 장면 휴지 ${(timeline.scenes.length - 1)}×${SCENE_PAUSE_SECONDS}s + 엔딩 마진 ${ENDING_MARGIN_SECONDS}s = ${expected}s`);
  console.log(`타임라인 총 길이: ${project.duration}s → ${Math.abs(project.duration - expected) < 0.01 ? 'OK' : `+${round(project.duration - expected)}s (A2V 고정 길이 흡수분)`}`);
  for (const scene of timeline.scenes) {
    console.log(`  N${String(scene).padStart(2, '0')}: start ${timeline.sceneStart.get(scene)}s / span ${round(timeline.sceneSpan.get(scene))}s (audio ${round(timeline.sceneAudio.get(scene))}s)`);
  }
  // v3는 A2V 고정 길이 때문에 장면 스팬이 연장될 수 있다 — 초과분만 허용, 미달은 결함.
  if (project.duration + 0.01 < expected || (!isV3 && Math.abs(project.duration - expected) >= 0.01)) {
    throw new Error('duration self-check failed');
  }

  // 러닝타임 게이트 판정 (01-script §길이 게이트) — 기본 480~510초, --duration-gate로 변경
  const gateRaw = args['duration-gate'] ?? '480-510';
  const [gateMin, gateMax] = String(gateRaw).split('-').map(Number);
  if (Number.isFinite(gateMin) && Number.isFinite(gateMax)) {
    const inGate = project.duration >= gateMin && project.duration <= gateMax;
    console.log(`러닝타임 게이트 ${gateMin}~${gateMax}s: ${project.duration}s → ${inGate ? 'PASS' : 'OUT OF GATE'}`);
    if (!inGate) {
      warnings.push(
        `러닝타임 ${project.duration}s가 게이트 ${gateMin}~${gateMax}s 밖입니다 — `
        + '--speaker-turn-gap / --scene-pause / --ending-margin 조정(또는 --target-duration으로 자동 해) 필요',
      );
    }
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
