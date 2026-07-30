/**
 * 가드 ① 최종 산출물 스펙 어서션 — 탐지 실증
 *
 * 재현 사고: ep2에서 `landscape-hd` 프로파일에 오디오 규격이 없어 96kHz 모노로 렌더됐고,
 * 파이프라인은 그것을 정상 완료로 보고했다. 아래 테스트는 **그 파일을 실제로 만들어** 가드가
 * 실패로 판정하는지 확인한다.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import path from 'path';
import { auditExportProfiles, assertOutputSpec, resolveExpectedSpec, DELIVERY_BASELINE } from '../output-spec.mjs';
import { ffmpegAvailable, makeFixtureDir, makeBadOutput, makeGoodOutput } from './fixtures.mjs';

const codesOf = (report, severity) => report.findings
  .filter((finding) => finding.severity === severity)
  .map((finding) => finding.code);

// ep2 사고 당시의 프로파일 형상 그대로(오디오 규격 미선언).
const LANDSCAPE_HD = {
  id: 'landscape-hd', purpose: 'master', container: 'mp4', codec: 'h264',
  width: 1920, height: 1080, fps: 24, videoBitrateMbps: 12, audioBitrateKbps: 192,
};
const MASTER_HD = {
  ...LANDSCAPE_HD, id: 'master-hd', audioSampleRate: 48000, audioChannels: 2,
};

describe('auditExportProfiles (프로파일 규격 선언 감사)', () => {
  it('오디오 규격이 없는 마스터 프로파일을 지목한다', () => {
    const report = auditExportProfiles([LANDSCAPE_HD, MASTER_HD]);
    const warn = report.findings.find((finding) => finding.code === 'audio-spec-missing');
    expect(warn).toBeDefined();
    expect(warn.subject).toBe('landscape-hd');
    expect(warn.evidence.missing).toEqual(['audioSampleRate', 'audioChannels']);
    // 규격을 선언한 프로파일은 걸리지 않는다(오탐 없음)
    expect(codesOf(report, 'warn')).toHaveLength(1);
  });

  it('--strict-profile-audio에서는 마스터 프로파일 결손이 ERROR가 된다', () => {
    const report = auditExportProfiles([LANDSCAPE_HD], { strict: true });
    expect(codesOf(report, 'error')).toContain('audio-spec-missing');
  });

  it('규격 미선언 프로파일은 납품 기준선으로 판정 기준이 채워진다', () => {
    const expected = resolveExpectedSpec(LANDSCAPE_HD);
    expect(expected.audioSampleRate).toBe(DELIVERY_BASELINE.audioSampleRate);
    expect(expected.audioChannels).toBe(DELIVERY_BASELINE.audioChannels);
    expect(expected.declared).toEqual({ audioSampleRate: false, audioChannels: false });
  });
});

describe.runIf(ffmpegAvailable())('assertOutputSpec (실제 산출물 대조)', () => {
  let dir;
  beforeAll(() => { dir = makeFixtureDir(); }, 120_000);
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('96kHz 모노 · 해상도/fps 불일치 산출물을 ERROR로 잡는다 (ep2 사고 재현)', async () => {
    const output = makeBadOutput(dir);
    const report = await assertOutputSpec({
      outputPath: output, profile: LANDSCAPE_HD, expectedDurationSec: 2,
    });
    const errors = codesOf(report, 'error');
    expect(errors).toContain('audio-sample-rate');
    expect(errors).toContain('audio-channels');
    expect(errors).toContain('width-mismatch');
    expect(errors).toContain('height-mismatch');
    expect(errors).toContain('fps-mismatch');
    // 근거 수치가 실제로 실려야 한다 — 사람 판단 없이 재현 가능해야 하므로.
    const audio = report.findings.find((finding) => finding.code === 'audio-sample-rate');
    expect(audio.evidence).toMatchObject({ actual: 96000, expected: 48000, source: 'delivery-baseline' });
    // 프로파일이 규격을 선언하지 않았다는 사실도 함께 남는다(근본 원인 지목).
    expect(codesOf(report, 'warn')).toContain('audio-spec-undeclared');
  }, 120_000);

  it('요구 규격을 만족하는 산출물은 통과한다 (오탐 없음)', async () => {
    const output = makeGoodOutput(dir);
    const report = await assertOutputSpec({
      outputPath: output, profile: MASTER_HD, expectedDurationSec: 2,
    });
    expect(codesOf(report, 'error')).toEqual([]);
  }, 120_000);

  it('타임라인 길이와 어긋난 산출물을 잡는다', async () => {
    const output = makeGoodOutput(dir);
    const report = await assertOutputSpec({
      outputPath: output, profile: MASTER_HD, expectedDurationSec: 480, durationToleranceSec: 1,
    });
    const finding = report.findings.find((item) => item.code === 'duration-mismatch');
    expect(finding).toBeDefined();
    expect(finding.evidence.expected).toBe(480);
  }, 120_000);

  it('러닝타임 게이트 밖 산출물을 잡는다', async () => {
    const output = makeGoodOutput(dir);
    const report = await assertOutputSpec({
      outputPath: output, profile: MASTER_HD, durationGate: [480, 510],
    });
    expect(codesOf(report, 'error')).toContain('duration-gate');
  }, 120_000);

  it('산출물이 없으면 조용히 통과하지 않는다', async () => {
    const report = await assertOutputSpec({
      outputPath: path.join(dir, 'does-not-exist.mp4'), profile: MASTER_HD,
    });
    expect(codesOf(report, 'error')).toContain('unreadable');
  });
});
