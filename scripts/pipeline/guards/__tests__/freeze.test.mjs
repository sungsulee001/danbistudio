/**
 * 가드 ③ 정지 프레임 검출 — 탐지 실증
 *
 * 재현 요구: 2사이클 전환의 핵심이 「Ken Burns 탈피, 진짜 모션」이었는데 프레임 차분 확인을
 * 매번 손으로 했다. 정지 클립이 컴파일을 그냥 통과하지 않는지 실제 파일로 확인한다.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import { checkClipFreeze, parseFreezeLog, frozenRatio } from '../freeze.mjs';
import { probeDurationSec } from '../media-probe.mjs';
import {
  ffmpegAvailable, makeFixtureDir, makeStaticClip, makeMotionClip, makeHeadFrozenClip,
} from './fixtures.mjs';

const codesOf = (report, severity) => report.findings
  .filter((finding) => finding.severity === severity)
  .map((finding) => finding.code);

describe('parseFreezeLog', () => {
  it('freeze_start/duration/end 3종을 구간으로 묶는다', () => {
    const log = [
      '[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 1.5',
      '[freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 2.25',
      '[freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 3.75',
    ].join('\n');
    const { spans } = parseFreezeLog(log, 5);
    expect(spans).toEqual([{ start: 1.5, end: 3.75, duration: 2.25, openEnded: false }]);
  });

  it('freeze_end 없이 끝나면 클립 끝까지 정지로 본다', () => {
    const log = 'lavfi.freezedetect.freeze_start: 0';
    const { spans } = parseFreezeLog(log, 4);
    expect(spans[0]).toMatchObject({ start: 0, end: 4, openEnded: true });
    expect(frozenRatio(spans, 4)).toBe(1);
  });

  it('정지 이벤트가 없으면 빈 배열', () => {
    expect(parseFreezeLog('nothing here', 5).spans).toEqual([]);
    expect(frozenRatio([], 5)).toBe(0);
  });
});

describe.runIf(ffmpegAvailable())('checkClipFreeze (실제 클립)', () => {
  let dir;
  beforeAll(() => { dir = makeFixtureDir(); }, 120_000);
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('전체가 정지한 클립을 ERROR로 잡는다', async () => {
    const clipPath = makeStaticClip(dir);
    const duration = await probeDurationSec(clipPath);
    const report = await checkClipFreeze([{ id: 'CUT-51', path: clipPath, duration }], { scan: 'full' });
    const finding = report.findings.find((item) => item.code === 'static-clip');
    expect(finding).toBeDefined();
    expect(finding.severity).toBe('error');
    expect(finding.subject).toBe('CUT-51');
    expect(finding.evidence.frozenRatio).toBeGreaterThanOrEqual(0.95);
  }, 180_000);

  it('진짜 모션이 있는 클립은 통과한다 (오탐 없음)', async () => {
    const clipPath = makeMotionClip(dir);
    const duration = await probeDurationSec(clipPath);
    const report = await checkClipFreeze([{ id: 'CUT-01', path: clipPath, duration }], { scan: 'full' });
    expect(codesOf(report, 'error')).toEqual([]);
    expect(codesOf(report, 'warn')).toEqual([]);
  }, 180_000);

  it('도입부만 정지한 클립을 WARN으로 잡는다', async () => {
    const clipPath = makeHeadFrozenClip(dir);
    const duration = await probeDurationSec(clipPath);
    const report = await checkClipFreeze([{ id: 'CUT-04', path: clipPath, duration }], { scan: 'full' });
    expect(codesOf(report, 'warn')).toContain('head-freeze');
    expect(codesOf(report, 'error')).toEqual([]);
  }, 180_000);

  it('scan=off면 검사하지 않고 그 사실을 남긴다', async () => {
    const report = await checkClipFreeze([{ id: 'CUT-01', path: 'nope.mp4' }], { scan: 'off' });
    expect(report.findings.map((item) => item.code)).toEqual(['skipped']);
  });

  it('읽을 수 없는 클립은 조용히 넘어가지 않는다', async () => {
    const report = await checkClipFreeze([{ id: 'CUT-99', path: `${dir}/missing.mp4` }], { scan: 'full' });
    expect(codesOf(report, 'warn')).toContain('unreadable');
  }, 60_000);
});
