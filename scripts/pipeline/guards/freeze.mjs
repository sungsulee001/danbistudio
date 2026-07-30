/**
 * guards/freeze.mjs — 가드 ③ 정지 프레임(freeze) 검출
 *
 * 2사이클 전환의 핵심 요구가 「Ken Burns 탈피, 진짜 모션」이었는데, 우리는 그 확인을 매번
 * 손으로(프레임 차분 지표 수작업) 했다. 그래서 정지 클립이 컴파일을 그냥 통과했다.
 * 여기서 ffmpeg `freezedetect`를 상시 검사로 승격한다 — 클립 **도입부**와 **전체**를 본다.
 *
 * 판정:
 *   전체 정지(정지 비율 ≥ 0.95)            → ERROR (모션 클립이 아니다 — 재생성 대상)
 *   도입부 정지(0초 근처에서 시작·일정 이상) → WARN  (컷 진입이 죽는다)
 *   말미 정지                                → WARN
 *   전체 정지 비율이 기준 이상               → WARN
 *
 * 정지 이미지 폴백 컷(`--prefer still`, 클립 없는 컷)은 **의도된 정지**이므로 검사 대상이 아니다 —
 * 호출자가 모션 클립만 넘긴다.
 */

import { createGuardReport } from './report.mjs';
import { runFilterProbe, mapWithConcurrency, toolStatus } from './media-probe.mjs';

const round = (value) => Number(Number(value).toFixed(3));

export const FREEZE_DEFAULTS = Object.freeze({
  noiseDb: -60,          // 프레임 차분 임계 — 이보다 조용하면 「같은 그림」
  minSeconds: 0.8,       // 이보다 짧은 정지는 정상적인 홀드로 본다
  headSeconds: 1.5,      // 도입부 판정 창
  tailSeconds: 2.0,      // 말미 판정 창
  headStartTolerance: 0.15, // 이 시각 이전에 시작한 정지를 「도입부 정지」로 본다
  staticRatio: 0.95,     // 이 비율 이상 정지 = 전체 정지(ERROR)
  warnRatio: 0.35,       // 이 비율 이상 정지 = 경고
  concurrency: 4,
});

/**
 * freezedetect stderr 파싱. (단위 테스트 대상 — ffmpeg 없이 검증한다)
 * @returns {{spans: Array<{start:number,end:number|undefined,duration:number,openEnded:boolean}>}}
 */
export function parseFreezeLog(stderr, clipDuration) {
  const text = String(stderr ?? '');
  const events = [];
  const pattern = /freeze_(start|duration|end):\s*(-?[\d.]+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    events.push({ kind: match[1], value: Number(match[2]) });
  }
  const spans = [];
  let open;
  for (const event of events) {
    if (event.kind === 'start') {
      if (open) spans.push(closeSpan(open, undefined, clipDuration));
      open = { start: Math.max(0, event.value) };
      continue;
    }
    if (event.kind === 'duration') {
      if (open) open.duration = event.value;
      continue;
    }
    if (event.kind === 'end') {
      if (!open) continue;
      spans.push(closeSpan(open, event.value, clipDuration));
      open = undefined;
    }
  }
  if (open) spans.push(closeSpan(open, undefined, clipDuration));
  return { spans };
}

function closeSpan(open, end, clipDuration) {
  // freeze_end 없이 끝났다 = 클립 끝까지 정지 상태(전체 정지 판정의 핵심 신호).
  const resolvedEnd = end ?? (Number.isFinite(clipDuration) ? clipDuration : undefined);
  const duration = open.duration
    ?? (Number.isFinite(resolvedEnd) ? Math.max(0, resolvedEnd - open.start) : 0);
  return {
    start: round(open.start),
    end: Number.isFinite(resolvedEnd) ? round(resolvedEnd) : undefined,
    duration: round(duration),
    openEnded: end === undefined,
  };
}

/** 정지 구간 합계 → 클립 대비 비율 */
export function frozenRatio(spans, clipDuration) {
  if (!Number.isFinite(clipDuration) || clipDuration <= 0) return 0;
  const total = spans.reduce((sum, span) => sum + (span.duration ?? 0), 0);
  return Math.min(1, total / clipDuration);
}

/**
 * 클립 목록의 정지 프레임 검사.
 *
 * @param {Array<{id: string, path: string, duration?: number}>} clips
 * @param {object} [options] FREEZE_DEFAULTS 참조 + { scan: 'full' | 'head' | 'off' }
 */
export async function checkClipFreeze(clips, options = {}) {
  const config = { ...FREEZE_DEFAULTS, ...options };
  const scan = options.scan ?? 'full';
  const report = createGuardReport('freeze', '정지 프레임 검출');

  if (scan === 'off') {
    report.info('skipped', '', '정지 프레임 검사가 꺼져 있습니다(--freeze-scan off)');
    return report;
  }
  if (!toolStatus().ffmpeg) {
    report.warn('ffmpeg-unavailable', '', 'ffmpeg 부재로 정지 프레임을 검사하지 못했습니다');
    return report;
  }
  if (clips.length === 0) {
    report.info('no-clips', '', '검사할 모션 클립이 없습니다');
    return report;
  }

  const filter = `freezedetect=n=${config.noiseDb}dB:d=${config.minSeconds}`;
  let scanned = 0;
  let unreadable = 0;

  const results = await mapWithConcurrency(clips, config.concurrency, async (clip) => {
    // 도입부 창은 항상 따로 본다 — 전체 스캔에서도 「0초 근처 정지」를 놓치지 않기 위해서다.
    const headProbe = await runFilterProbe(
      clip.path,
      ['-vf', `freezedetect=n=${config.noiseDb}dB:d=${Math.min(config.minSeconds, config.headSeconds * 0.6)}`, '-an'],
      ['-t', String(config.headSeconds)],
    );
    const fullProbe = scan === 'full'
      ? await runFilterProbe(clip.path, ['-vf', filter, '-an'])
      : undefined;
    return { clip, headProbe, fullProbe };
  });

  for (const { clip, headProbe, fullProbe } of results) {
    if (!headProbe.ok && !(fullProbe?.ok)) {
      unreadable += 1;
      report.warn('unreadable', clip.id, `클립을 검사하지 못했습니다 (${headProbe.reason ?? 'unknown'})`, {
        path: clip.path,
      });
      continue;
    }
    scanned += 1;

    const headSpans = headProbe.ok ? parseFreezeLog(headProbe.stderr, config.headSeconds).spans : [];
    const headFrozen = headSpans.some((span) => span.start <= config.headStartTolerance);

    let ratio;
    let fullSpans = [];
    if (fullProbe?.ok && Number.isFinite(clip.duration)) {
      fullSpans = parseFreezeLog(fullProbe.stderr, clip.duration).spans;
      ratio = frozenRatio(fullSpans, clip.duration);
    }

    if (ratio !== undefined && ratio >= config.staticRatio) {
      report.error('static-clip', clip.id,
        '클립 전체가 정지 상태입니다 — 모션 클립이 아닙니다(재생성 대상, 「진짜 모션」 계약 위반)', {
          frozenRatio: round(ratio), duration: round(clip.duration), spans: fullSpans.length,
          firstFreezeAt: fullSpans[0] ? round(fullSpans[0].start) : undefined,
        });
      continue;
    }
    if (headFrozen) {
      const span = headSpans.find((item) => item.start <= config.headStartTolerance);
      report.warn('head-freeze', clip.id, '클립 도입부가 정지 상태로 시작합니다 — 컷 진입이 죽습니다', {
        freezeStart: span ? round(span.start) : 0,
        freezeDuration: span ? round(span.duration) : undefined,
        window: config.headSeconds,
      });
    }
    if (ratio !== undefined && ratio >= config.warnRatio) {
      report.warn('mostly-frozen', clip.id, '클립의 상당 구간이 정지 상태입니다', {
        frozenRatio: round(ratio), duration: round(clip.duration), spans: fullSpans.length,
      });
    }
    if (fullSpans.length > 0 && Number.isFinite(clip.duration)) {
      const last = fullSpans[fullSpans.length - 1];
      const tailStart = clip.duration - config.tailSeconds;
      if (last.openEnded && last.start >= tailStart && ratio !== undefined && ratio < config.warnRatio) {
        report.warn('tail-freeze', clip.id, '클립 말미가 정지 상태로 끝납니다 — 말미 트림 또는 재생성 검토', {
          freezeStart: round(last.start), duration: round(clip.duration),
        });
      }
    }
  }

  report.info('scanned', '', `모션 클립 ${scanned}개 정지 프레임 검사 완료 (scan=${scan})`, {
    scanned, unreadable, total: clips.length, noiseDb: config.noiseDb, minSeconds: config.minSeconds,
  });
  return report;
}
