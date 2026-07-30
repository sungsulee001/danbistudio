/**
 * guards/speech-window.mjs — 가드 ④ 발화 구간 기준 정렬·센터링
 *
 * ep2 v1 사고: TTS wav의 무음 패딩(109파일 실측 선단 합 12.4s·말단 합 48.8s)이 그대로 자막
 * 시간이 되어 「2:12 대사 안 나옴」·「자막 안 맞음」 지적을 받았다. v2에서 손으로 대응했던
 * 로직을 여기로 **승격**해 정식 함수로 고정한다 — 컴파일러 본체는 이 모듈만 호출하고
 * 자체 구현을 두지 않는다(중복 금지).
 *
 * 제공:
 *  - probeSpeechWindow()  : silencedetect 실측 → 선단/말단 무음·발화 런
 *  - speechCaptionWindow(): 세그먼트의 자막 창(발화 기준, 가드 여유만 허용)
 *  - buildQuietWindows()  : 타임라인 전역의 조용한 창(컷 전환 스냅 대상 구간)
 *  - checkSpeechAlignment(): 정렬이 실제로 적용됐는지 사후 검증(리포트)
 */

import { existsSync } from 'fs';
import { createGuardReport } from './report.mjs';
import { runFilterProbe, toolStatus } from './media-probe.mjs';

const ROUND = 3;
const round = (value) => Number(value.toFixed(ROUND));

// 무음 판정 임계(TTS 노이즈 플로어보다 충분히 위)와 최소 무음 길이.
// 이보다 짧은 무음은 발화의 일부(파열음 앞 폐쇄)로 본다.
export const SILENCE_NOISE_DB = -45;
export const SILENCE_MIN_SECONDS = 0.1;

// 자막 창 가드 — 발화 앞뒤로 이만큼만 여유를 준다(무음 패딩 전체를 자막에 쓰지 않는다).
export const CAPTION_LEAD_GUARD = 0.1;
export const CAPTION_TRAIL_GUARD = 0.25;
export const CAPTION_MIN_WINDOW = 0.5;

// 정렬 품질 판정 임계 — ep2 실측 최대치(선단 0.757s·말단 1.193s)를 기준선으로 잡았다.
const LEAD_WARN_SECONDS = 0.75;
const TRAIL_WARN_SECONDS = 1.2;
const PADDING_RATIO_ERROR = 0.8;   // 파일의 80% 이상이 무음 = 채택 테이크 결함
const MIN_SPEECH_SECONDS = 0.1;    // 이보다 짧으면 발화가 없는 것으로 본다
const CAPTION_EPSILON = 0.011;     // 반올림(소수 3자리) 오차 허용

/**
 * TTS 파일의 무음/발화 구간 실측.
 * @returns {Promise<undefined | {lead: number, trail: number, silences: number[][], speech: number[][]}>}
 *   ffmpeg 부재·실측 실패 시 undefined(호출자는 문서 표 폴백을 쓰고, 가드가 그 사실을 리포트한다).
 */
export async function probeSpeechWindow(filePath, duration) {
  if (!Number.isFinite(duration) || !existsSync(filePath)) return undefined;
  const probe = await runFilterProbe(filePath, [
    '-af', `silencedetect=n=${SILENCE_NOISE_DB}dB:d=${SILENCE_MIN_SECONDS}`,
  ]);
  if (!probe.ok || probe.failed) return undefined;
  return parseSilenceLog(probe.stderr, duration);
}

/** silencedetect stderr → 선단/말단 무음 + 발화 런. (파서 단위 테스트 대상) */
export function parseSilenceLog(stderr, duration) {
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

/**
 * 세그먼트의 자막 창 — **클립 경계가 아니라 실측 발화 창**.
 * TTS 선단·말단 무음을 그대로 자막에 쓰면 자막이 목소리보다 먼저 뜨고 더 남는다(ep2 v1 지적).
 * 리드 가드만큼만 미리 띄우고 테일 가드만큼만 붙잡는다.
 */
export function speechCaptionWindow(segment, options = {}) {
  const leadGuard = options.leadGuard ?? CAPTION_LEAD_GUARD;
  const trailGuard = options.trailGuard ?? CAPTION_TRAIL_GUARD;
  const minWindow = options.minWindow ?? CAPTION_MIN_WINDOW;
  const lead = Math.max(0, segment.speechLead ?? 0);
  const trail = Math.max(0, segment.speechTrail ?? 0);
  const rawStart = segment.start + Math.max(0, lead - leadGuard);
  const rawEnd = segment.start + segment.duration - Math.max(0, trail - trailGuard);
  const start = round(rawStart);
  const end = round(Math.max(rawEnd, rawStart + minWindow));
  return { start, end, span: end - start, lead, trail, minWindowApplied: rawEnd < rawStart + minWindow };
}

/**
 * 타임라인 전역의 조용한 창 = 배치된 세그먼트 발화 런의 여집합.
 * 컷 전환을 발화 한복판이 아니라 이 창 안으로 옮기는 데 쓴다.
 */
export function buildQuietWindows(placedTts, totalDuration) {
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

/**
 * 사후 검증 — 「발화 실측이 실제로 자막에 반영됐는가」.
 *
 * @param {object} input
 * @param {Array} input.segments 배치된 TTS 세그먼트({assetId,start,duration,speechLead,speechTrail,speechRuns})
 * @param {Map<string,{start:number,end:number,count:number}>} [input.captionWindows]
 *        assetId → 실제 방출된 자막 창(최소 start·최대 end). 없으면 창 검증은 건너뛴다.
 * @param {number} [input.probedCount] 실측에 성공한 세그먼트 수
 */
export function checkSpeechAlignment({ segments, captionWindows, probedCount, options = {} }) {
  const report = createGuardReport('speech-window', '발화 구간 기준 정렬·센터링');
  const leadGuard = options.leadGuard ?? CAPTION_LEAD_GUARD;
  const trailGuard = options.trailGuard ?? CAPTION_TRAIL_GUARD;
  const minWindow = options.minWindow ?? CAPTION_MIN_WINDOW;
  const total = segments.length;
  const probed = probedCount ?? segments.filter((seg) => seg.speechLead !== undefined).length;

  if (total === 0) {
    report.warn('no-segments', '', '검사할 TTS 세그먼트가 없습니다');
    return report;
  }

  if (probed === 0) {
    const tools = toolStatus();
    const severity = tools.ffmpeg ? 'error' : 'warn';
    report[severity](
      'not-measured', '',
      tools.ffmpeg
        ? '발화 구간 실측이 한 건도 이뤄지지 않았습니다 — 자막이 무음 패딩째 배치됩니다(ep2 v1 재발)'
        : 'ffmpeg 부재로 발화 구간을 실측하지 못했습니다 — 자막은 클립 경계 기준(정렬 미보증)',
      { segments: total, ffmpeg: tools.ffmpeg },
    );
    return report;
  }
  if (probed < total) {
    report.warn('partial-measure', '', `${total - probed}개 세그먼트가 실측되지 않아 클립 경계 기준으로 배치됩니다`, {
      probed, total,
    });
  }

  let leadSum = 0;
  let trailSum = 0;
  for (const seg of segments) {
    const lead = seg.speechLead ?? 0;
    const trail = seg.speechTrail ?? 0;
    const duration = seg.duration ?? 0;
    leadSum += lead;
    trailSum += trail;
    const speechSpan = Math.max(0, duration - lead - trail);

    if (seg.speechLead === undefined) continue;
    if (speechSpan < MIN_SPEECH_SECONDS) {
      report.error('no-speech', seg.assetId ?? seg.segmentKey ?? '', '파일 전체가 무음으로 측정됐습니다 — 채택 테이크 교체 필요', {
        duration: round(duration), lead: round(lead), trail: round(trail),
      });
      continue;
    }
    if (duration > 0 && (lead + trail) / duration > PADDING_RATIO_ERROR) {
      report.error('padding-dominant', seg.assetId ?? seg.segmentKey ?? '',
        '무음 패딩이 파일의 대부분을 차지합니다 — 채택 테이크 결함', {
          duration: round(duration), lead: round(lead), trail: round(trail),
          paddingRatio: round((lead + trail) / duration),
        });
      continue;
    }
    if (lead > LEAD_WARN_SECONDS) {
      report.warn('lead-padding', seg.assetId ?? seg.segmentKey ?? '', '선단 무음이 기준치를 넘습니다', {
        lead: round(lead), threshold: LEAD_WARN_SECONDS,
      });
    }
    if (trail > TRAIL_WARN_SECONDS) {
      report.warn('trail-padding', seg.assetId ?? seg.segmentKey ?? '', '말단 무음이 기준치를 넘습니다', {
        trail: round(trail), threshold: TRAIL_WARN_SECONDS,
      });
    }
  }

  // 자막 창 사후 검증 — 실제 방출된 창이 발화 기준을 벗어나면 정렬이 적용되지 않은 것이다.
  if (captionWindows instanceof Map && captionWindows.size > 0) {
    let checked = 0;
    for (const seg of segments) {
      const window = captionWindows.get(seg.assetId);
      if (!window || seg.speechLead === undefined) continue;
      checked += 1;
      const expected = speechCaptionWindow(seg, { leadGuard, trailGuard, minWindow });
      if (window.start < expected.start - CAPTION_EPSILON) {
        report.error('caption-early', seg.assetId, '자막이 발화보다 일찍 뜹니다 — 무음 패딩이 자막 시간에 섞였습니다', {
          captionStart: round(window.start), speechStart: round(expected.start),
          early: round(expected.start - window.start), lead: round(seg.speechLead ?? 0),
        });
      }
      // 최소 창 하한이 걸린 짧은 세그먼트는 말단 초과가 정상이다.
      if (!expected.minWindowApplied && window.end > expected.end + CAPTION_EPSILON) {
        report.error('caption-late', seg.assetId, '자막이 발화 종료 후까지 남습니다 — 말단 무음이 자막 시간에 섞였습니다', {
          captionEnd: round(window.end), speechEnd: round(expected.end),
          late: round(window.end - expected.end), trail: round(seg.speechTrail ?? 0),
        });
      }
    }
    report.info('caption-window', '', `자막 창 ${checked}개를 발화 기준으로 검증했습니다`, { checked });
  }

  report.info('measured', '', '발화 구간 실측 요약', {
    probed, total, leadSum: round(leadSum), trailSum: round(trailSum),
    paddingSum: round(leadSum + trailSum),
  });
  return report;
}
