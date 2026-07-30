/**
 * guards/index.mjs — S6 산출물 가드 4종의 단일 진입점
 *
 *  ① output-spec     최종 산출물 스펙 어서션 (렌더 후처리)
 *  ② pair-integrity  컷 ↔ 오디오 세그먼트 ↔ 클립 파일 정합 (컴파일)
 *  ③ freeze          정지 프레임 검출 (컴파일)
 *  ④ speech-window   발화 구간 기준 정렬·센터링 (컴파일 + 사후 검증)
 *
 * 호출자 계약: 리포트의 error가 1건이라도 있으면 **non-zero exit**로 파이프라인을 세운다.
 */

export {
  SEVERITY, createGuardReport, mergeGuardReports, downgradeErrors,
  formatGuardBundle, toJsonReport, countBySeverity,
} from './report.mjs';

export {
  probeMediaSpec, probeDurationSec, runFilterProbe, mapWithConcurrency,
  parseFrameRate, toolStatus,
} from './media-probe.mjs';

export {
  DELIVERY_BASELINE, auditExportProfiles, resolveExpectedSpec, assertOutputSpec,
} from './output-spec.mjs';

export { checkPairIntegrity } from './pair-integrity.mjs';

export {
  FREEZE_DEFAULTS, checkClipFreeze, parseFreezeLog, frozenRatio,
} from './freeze.mjs';

export {
  SILENCE_NOISE_DB, SILENCE_MIN_SECONDS,
  CAPTION_LEAD_GUARD, CAPTION_TRAIL_GUARD, CAPTION_MIN_WINDOW,
  probeSpeechWindow, parseSilenceLog, speechCaptionWindow, buildQuietWindows,
  checkSpeechAlignment,
} from './speech-window.mjs';
