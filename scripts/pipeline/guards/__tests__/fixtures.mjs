/**
 * guards/__tests__/fixtures.mjs — 탐지 실증용 픽스처 생성기
 *
 * 우리가 실제로 겪은 4종 사고를 파일로 재현한다. 가드가 「돌긴 하는데 아무것도 못 잡는」
 * 상태로 굳지 않게, 각 가드마다 반드시 잡아야 할 반례를 여기서 만든다.
 */

import { execFileSync } from 'child_process';
import { mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

export function ffmpegAvailable() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const run = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'ignore' });

export function makeFixtureDir() {
  return mkdtempSync(path.join(tmpdir(), 'danbi-guard-fx-'));
}

/** ep2 사고 재현: 오디오 규격 미선언 프로파일로 렌더된 **96kHz 모노** 산출물(해상도·fps도 어긋남). */
export function makeBadOutput(dir) {
  const out = path.join(dir, 'bad-96k-mono.mp4');
  if (!existsSync(out)) {
    run([
      '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=25:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=96000:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '96000', '-ac', '1',
      '-shortest', out,
    ]);
  }
  return out;
}

/** 요구 규격을 만족하는 산출물(1920x1080 / 24fps / 48kHz 스테레오) — 오탐 확인용. */
export function makeGoodOutput(dir, { durationSec = 2 } = {}) {
  const out = path.join(dir, `good-${durationSec}s.mp4`);
  if (!existsSync(out)) {
    run([
      '-f', 'lavfi', '-i', `testsrc=size=1920x1080:rate=24:duration=${durationSec}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${durationSec}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24',
      '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', out,
    ]);
  }
  return out;
}

/** 「Ken Burns 탈피」 요구를 위반한 정지 클립 — 한 프레임을 계속 들고 있는다. */
export function makeStaticClip(dir, { durationSec = 3 } = {}) {
  const out = path.join(dir, 'static-clip.mp4');
  if (!existsSync(out)) {
    run([
      '-f', 'lavfi', '-i', `color=c=gray:size=640x360:rate=24:duration=${durationSec}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', out,
    ]);
  }
  return out;
}

/** 진짜 모션이 있는 클립 — 정지 가드가 오탐하지 않는지 확인용. */
export function makeMotionClip(dir, { durationSec = 3 } = {}) {
  const out = path.join(dir, 'motion-clip.mp4');
  if (!existsSync(out)) {
    run([
      '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=24:duration=${durationSec}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', out,
    ]);
  }
  return out;
}

/** 도입부만 정지하고 이후 움직이는 클립 — 「컷 진입이 죽는」 사고 재현. */
export function makeHeadFrozenClip(dir) {
  const out = path.join(dir, 'head-frozen-clip.mp4');
  if (!existsSync(out)) {
    const still = path.join(dir, 'head-still.mp4');
    run([
      '-f', 'lavfi', '-i', 'color=c=gray:size=640x360:rate=24:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', still,
    ]);
    const moving = path.join(dir, 'head-moving.mp4');
    run([
      '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24:duration=3',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', moving,
    ]);
    run([
      '-i', still, '-i', moving,
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', out,
    ]);
  }
  return out;
}

/**
 * ep2 v1 사고 재현: 선단 2s · 말단 3s 무음 패딩이 붙은 TTS 테이크(발화 1s).
 * 이 파일의 클립 경계를 그대로 자막 창으로 쓰면 자막이 2초 먼저 뜨고 3초 더 남는다.
 */
export function makePaddedVoice(dir, { lead = 2, speech = 1, trail = 3 } = {}) {
  const out = path.join(dir, `padded-voice-${lead}-${speech}-${trail}.wav`);
  if (!existsSync(out)) {
    run([
      '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=mono:d=${lead}`,
      '-f', 'lavfi', '-i', `sine=frequency=300:sample_rate=48000:duration=${speech}`,
      '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=mono:d=${trail}`,
      '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]', '-map', '[a]',
      '-c:a', 'pcm_s16le', out,
    ]);
  }
  return out;
}
