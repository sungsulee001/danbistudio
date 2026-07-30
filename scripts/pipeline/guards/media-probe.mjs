/**
 * guards/media-probe.mjs — ffprobe/ffmpeg 실측 래퍼 (가드 공용)
 *
 * 컴파일러 본체의 관례를 그대로 따른다:
 *  - `promisify(execFile)`로 호출하고 파일 부재는 예외가 아니라 undefined로 돌린다.
 *  - 도구가 없으면(ENOENT) 한 번만 경고하고 이후 호출을 건너뛴다 — 도구 부재로 파이프라인이
 *    죽지는 않되, 「검사를 못 했다」는 사실은 가드 리포트에 info/warn으로 남는다(조용한 통과 금지).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync } from 'fs';

const execFileAsync = promisify(execFile);

const availability = { ffprobe: true, ffmpeg: true };

/** 도구 가용성 스냅샷 — 가드가 「검사 불가」 사유를 리포트에 싣는 데 쓴다. */
export function toolStatus() {
  return { ...availability };
}

const markMissing = (tool, error) => {
  if (String(error?.code) === 'ENOENT') {
    if (availability[tool]) {
      console.warn(`  warn: ${tool} not found — 해당 가드 검사를 건너뜁니다(검사 결과는 unknown으로 기록)`);
    }
    availability[tool] = false;
    return true;
  }
  return false;
};

/** r_frame_rate("24/1") → 24. 파싱 실패 시 undefined. */
export function parseFrameRate(raw) {
  if (!raw) return undefined;
  const text = String(raw).trim();
  if (text.includes('/')) {
    const [num, den] = text.split('/').map(Number);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return num / den;
    return undefined;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * 산출물/소재의 실제 규격을 한 번의 ffprobe 호출로 읽는다.
 * @returns {Promise<{ok: boolean, reason?: string, path: string, sizeBytes?: number,
 *   durationSec?: number, video?: object, audio?: object, audioStreamCount?: number}>}
 */
export async function probeMediaSpec(filePath) {
  if (!filePath) return { ok: false, reason: 'no-path', path: filePath };
  if (!existsSync(filePath)) return { ok: false, reason: 'missing', path: filePath };
  const sizeBytes = statSync(filePath).size;
  if (!availability.ffprobe) return { ok: false, reason: 'ffprobe-unavailable', path: filePath, sizeBytes };

  let parsed;
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath,
    ], { maxBuffer: 32 * 1024 * 1024 });
    parsed = JSON.parse(stdout);
  } catch (error) {
    if (markMissing('ffprobe', error)) {
      return { ok: false, reason: 'ffprobe-unavailable', path: filePath, sizeBytes };
    }
    return { ok: false, reason: `ffprobe-failed: ${error?.message ?? error}`, path: filePath, sizeBytes };
  }

  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
  const audioStream = audioStreams[0];
  const durationSec = Number(parsed.format?.duration);

  return {
    ok: true,
    path: filePath,
    sizeBytes,
    durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
    audioStreamCount: audioStreams.length,
    video: videoStream
      ? {
        codec: videoStream.codec_name,
        width: Number(videoStream.width),
        height: Number(videoStream.height),
        fps: parseFrameRate(videoStream.avg_frame_rate) ?? parseFrameRate(videoStream.r_frame_rate),
        rFps: parseFrameRate(videoStream.r_frame_rate),
        pixFmt: videoStream.pix_fmt,
        profile: videoStream.profile,
        nbFrames: Number(videoStream.nb_frames) || undefined,
      }
      : undefined,
    audio: audioStream
      ? {
        codec: audioStream.codec_name,
        sampleRate: Number(audioStream.sample_rate),
        channels: Number(audioStream.channels),
        channelLayout: audioStream.channel_layout,
        bitRateKbps: Number(audioStream.bit_rate) > 0 ? Math.round(Number(audioStream.bit_rate) / 1000) : undefined,
      }
      : undefined,
  };
}

/** 컴파일러 본체 probeDuration과 같은 계약(형식 duration만) — 가드 내부 재사용용. */
export async function probeDurationSec(filePath) {
  const spec = await probeMediaSpec(filePath);
  return spec.ok ? spec.durationSec : undefined;
}

/**
 * ffmpeg 필터를 null 먹서로 돌리고 stderr를 돌려준다(freezedetect/silencedetect 공용).
 * @param {string[]} inputArgs -i 앞에 붙는 인자(예: ['-t','1.5'] / ['-sseof','-2'])
 */
export async function runFilterProbe(filePath, filterArgs, inputArgs = []) {
  if (!availability.ffmpeg) return { ok: false, reason: 'ffmpeg-unavailable' };
  if (!existsSync(filePath)) return { ok: false, reason: 'missing' };
  try {
    const { stderr } = await execFileAsync('ffmpeg', [
      '-hide_banner', '-nostats', '-v', 'info',
      ...inputArgs, '-i', filePath,
      ...filterArgs,
      '-f', 'null', '-',
    ], { maxBuffer: 32 * 1024 * 1024 });
    return { ok: true, stderr: String(stderr) };
  } catch (error) {
    if (markMissing('ffmpeg', error)) return { ok: false, reason: 'ffmpeg-unavailable' };
    // ffmpeg는 필터 로그를 stderr에 쓰고도 비정상 종료할 수 있다 — 로그는 넘기되 `failed`로 표시해,
    // 「부분 로그를 완전한 실측으로 오인」하지 않게 한다(호출자가 신뢰 수준을 결정).
    if (error?.stderr) return { ok: true, failed: true, stderr: String(error.stderr) };
    return { ok: false, failed: true, reason: `ffmpeg-failed: ${error?.message ?? error}` };
  }
}

/** 동시 실행 수를 제한한 map — 클립 60개 프로브가 CPU를 독점하지 않게 한다. */
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.max(1, Math.min(limit, items.length))).fill(0).map(async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
