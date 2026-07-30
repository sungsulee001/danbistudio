/**
 * guards/output-spec.mjs — 가드 ① 최종 산출물 스펙 어서션
 *
 * ep2 사고: `landscape-hd` 프로파일에 오디오 규격(샘플레이트·채널)이 없어 렌더러 기본값으로
 * **96kHz 모노**가 나왔고, 파이프라인은 그걸 정상 완료로 보고했다. 사람이 파일을 열어보고서야
 * 발견해 `master-hd`로 재렌더했다. 렌더가 끝났다는 사실과 「요구 규격대로 나왔다」는 사실은
 * 다르다 — 그 간극을 여기서 닫는다.
 *
 * 두 지점에서 검사한다:
 *  1) 컴파일 시점 `auditExportProfiles()` — 프로파일 선언 자체의 결손(오디오 규격 미기재)을 경고.
 *     **기존 프로파일 정의는 바꾸지 않는다**(회귀 금지) — 결손을 드러내되 산출물은 불변.
 *  2) 렌더 직후 `assertOutputSpec()` — 실제 파일을 ffprobe로 재서 요구 규격과 대조. 불일치는 ERROR.
 *     프로파일이 오디오 규격을 선언하지 않았으면 **납품 기준선**(48kHz/2ch)으로 판정한다.
 */

import { createGuardReport } from './report.mjs';
import { probeMediaSpec } from './media-probe.mjs';

const round = (value) => Number(Number(value).toFixed(3));

/** 유튜브 납품 기준선 — 프로파일이 규격을 선언하지 않았을 때의 판정 기준. */
export const DELIVERY_BASELINE = Object.freeze({
  audioSampleRate: 48000,
  audioChannels: 2,
  pixFmt: 'yuv420p',
});

const FPS_TOLERANCE = 0.01;
const DEFAULT_DURATION_TOLERANCE = 1.0;

/**
 * 프로파일 선언 감사(컴파일 시점). 산출물을 바꾸지 않고 결손만 드러낸다.
 * @param {Array} profiles project.exportProfiles
 * @param {object} [options] { strict: true면 master 목적 프로파일의 오디오 결손을 ERROR로 }
 */
export function auditExportProfiles(profiles, options = {}) {
  const report = createGuardReport('profile-spec', '내보내기 프로파일 규격 선언');
  const strict = Boolean(options.strict);
  for (const profile of profiles ?? []) {
    const missing = [];
    if (profile.audioSampleRate === undefined) missing.push('audioSampleRate');
    if (profile.audioChannels === undefined) missing.push('audioChannels');
    if (missing.length === 0) {
      report.info('declared', profile.id, '오디오 규격 선언됨', {
        sampleRate: profile.audioSampleRate, channels: profile.audioChannels,
      });
      continue;
    }
    const master = profile.purpose === 'master';
    const severity = master && strict ? 'error' : 'warn';
    report[severity](
      'audio-spec-missing', profile.id,
      `${master ? '마스터' : '프록시'} 프로파일에 오디오 규격이 없습니다 — 렌더러 기본값에 맡겨집니다`
      + `(ep2에서 96kHz 모노 산출로 이어진 결손). 납품 기준선 ${DELIVERY_BASELINE.audioSampleRate}Hz/`
      + `${DELIVERY_BASELINE.audioChannels}ch로 사후 판정합니다`,
      { missing, purpose: profile.purpose ?? 'unknown' },
    );
  }
  return report;
}

/** 프로파일 + 납품 기준선으로 「요구 규격」을 확정한다. */
export function resolveExpectedSpec(profile, baseline = DELIVERY_BASELINE) {
  const declared = {
    audioSampleRate: profile?.audioSampleRate !== undefined,
    audioChannels: profile?.audioChannels !== undefined,
  };
  return {
    width: profile?.width,
    height: profile?.height,
    fps: profile?.fps,
    codec: profile?.codec,
    audioSampleRate: profile?.audioSampleRate ?? baseline.audioSampleRate,
    audioChannels: profile?.audioChannels ?? baseline.audioChannels,
    pixFmt: baseline.pixFmt,
    declared,
  };
}

/**
 * 렌더 산출물 스펙 어서션.
 *
 * @param {object} input
 * @param {string} input.outputPath 렌더 산출 파일
 * @param {object} input.profile    사용한 exportProfile
 * @param {number} [input.expectedDurationSec] 프로젝트 타임라인 길이
 * @param {number} [input.durationToleranceSec] 기본 1.0초
 * @param {[number,number]} [input.durationGate] 러닝타임 게이트(초)
 * @param {object} [input.baseline] 납품 기준선 override
 */
export async function assertOutputSpec({
  outputPath, profile, expectedDurationSec, durationToleranceSec = DEFAULT_DURATION_TOLERANCE,
  durationGate, baseline = DELIVERY_BASELINE,
}) {
  const report = createGuardReport('output-spec', '최종 산출물 스펙 어서션');
  const expected = resolveExpectedSpec(profile, baseline);
  const spec = await probeMediaSpec(outputPath);

  if (!spec.ok) {
    const reason = spec.reason ?? 'unknown';
    const severity = reason === 'ffprobe-unavailable' ? 'warn' : 'error';
    report[severity]('unreadable', profile?.id ?? '', `산출물을 실측하지 못했습니다 (${reason})`, {
      path: outputPath, sizeBytes: spec.sizeBytes,
    });
    return report;
  }
  if (!spec.sizeBytes) {
    report.error('empty-file', profile?.id ?? '', '산출물이 0바이트입니다', { path: outputPath });
    return report;
  }

  // ---- 비디오 ----------------------------------------------------------
  if (!spec.video) {
    report.error('no-video-stream', profile?.id ?? '', '비디오 스트림이 없습니다', { path: outputPath });
  } else {
    if (expected.width !== undefined && spec.video.width !== expected.width) {
      report.error('width-mismatch', profile?.id ?? '', '가로 해상도가 요구 규격과 다릅니다', {
        actual: spec.video.width, expected: expected.width,
      });
    }
    if (expected.height !== undefined && spec.video.height !== expected.height) {
      report.error('height-mismatch', profile?.id ?? '', '세로 해상도가 요구 규격과 다릅니다', {
        actual: spec.video.height, expected: expected.height,
      });
    }
    if (expected.fps !== undefined && Number.isFinite(spec.video.fps)
        && Math.abs(spec.video.fps - expected.fps) > FPS_TOLERANCE) {
      report.error('fps-mismatch', profile?.id ?? '', 'fps가 요구 규격과 다릅니다', {
        actual: round(spec.video.fps), expected: expected.fps, tolerance: FPS_TOLERANCE,
      });
    }
    if (expected.codec && spec.video.codec && normalizeCodec(spec.video.codec) !== normalizeCodec(expected.codec)) {
      report.error('codec-mismatch', profile?.id ?? '', '비디오 코덱이 요구 규격과 다릅니다', {
        actual: spec.video.codec, expected: expected.codec,
      });
    }
    if (expected.pixFmt && spec.video.pixFmt && spec.video.pixFmt !== expected.pixFmt) {
      report.warn('pix-fmt', profile?.id ?? '', '픽셀 포맷이 납품 기준선과 다릅니다(재생 호환성 확인)', {
        actual: spec.video.pixFmt, expected: expected.pixFmt,
      });
    }
  }

  // ---- 오디오 (ep2 96kHz 모노 사고의 직접 대응) --------------------------
  if (!spec.audio) {
    report.error('no-audio-stream', profile?.id ?? '', '오디오 스트림이 없습니다', { path: outputPath });
  } else {
    const source = expected.declared.audioSampleRate ? 'profile' : 'delivery-baseline';
    if (spec.audio.sampleRate !== expected.audioSampleRate) {
      report.error('audio-sample-rate', profile?.id ?? '', '오디오 샘플레이트가 요구 규격과 다릅니다', {
        actual: spec.audio.sampleRate, expected: expected.audioSampleRate, source,
      });
    }
    if (spec.audio.channels !== expected.audioChannels) {
      report.error('audio-channels', profile?.id ?? '', '오디오 채널 수가 요구 규격과 다릅니다', {
        actual: spec.audio.channels, expected: expected.audioChannels,
        layout: spec.audio.channelLayout,
        source: expected.declared.audioChannels ? 'profile' : 'delivery-baseline',
      });
    }
    if (!expected.declared.audioSampleRate || !expected.declared.audioChannels) {
      report.warn('audio-spec-undeclared', profile?.id ?? '',
        '프로파일이 오디오 규격을 선언하지 않아 납품 기준선으로 판정했습니다 — 프로파일에 명시하십시오', {
          sampleRate: spec.audio.sampleRate, channels: spec.audio.channels,
        });
    }
  }

  // ---- 길이 ------------------------------------------------------------
  if (!Number.isFinite(spec.durationSec)) {
    report.error('no-duration', profile?.id ?? '', '산출물 길이를 읽지 못했습니다', { path: outputPath });
  } else {
    if (Number.isFinite(expectedDurationSec)) {
      const delta = spec.durationSec - expectedDurationSec;
      if (Math.abs(delta) > durationToleranceSec) {
        report.error('duration-mismatch', profile?.id ?? '', '산출물 길이가 타임라인과 어긋납니다', {
          actual: round(spec.durationSec), expected: round(expectedDurationSec),
          delta: round(delta), tolerance: durationToleranceSec,
        });
      }
    }
    if (Array.isArray(durationGate) && durationGate.length === 2
        && Number.isFinite(durationGate[0]) && Number.isFinite(durationGate[1])) {
      const [min, max] = durationGate;
      if (spec.durationSec < min || spec.durationSec > max) {
        report.error('duration-gate', profile?.id ?? '', '산출물 길이가 러닝타임 게이트 밖입니다', {
          actual: round(spec.durationSec), gateMin: min, gateMax: max,
        });
      }
    }
  }

  report.info('measured', profile?.id ?? '', '산출물 실측', {
    path: outputPath,
    sizeMB: round(spec.sizeBytes / (1024 * 1024)),
    duration: Number.isFinite(spec.durationSec) ? round(spec.durationSec) : undefined,
    resolution: spec.video ? `${spec.video.width}x${spec.video.height}` : undefined,
    fps: spec.video && Number.isFinite(spec.video.fps) ? round(spec.video.fps) : undefined,
    videoCodec: spec.video?.codec,
    audio: spec.audio
      ? `${spec.audio.codec} ${spec.audio.sampleRate}Hz ${spec.audio.channels}ch`
      : 'none',
  });
  return report;
}

const CODEC_ALIASES = { h264: 'h264', avc: 'h264', x264: 'h264', hevc: 'hevc', h265: 'hevc', x265: 'hevc' };
const normalizeCodec = (codec) => CODEC_ALIASES[String(codec).toLowerCase()] ?? String(codec).toLowerCase();
