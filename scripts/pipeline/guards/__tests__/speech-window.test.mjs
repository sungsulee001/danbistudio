/**
 * 가드 ④ 발화 구간 기준 정렬·센터링 — 승격 로직 + 탐지 실증
 *
 * 재현 사고: ep2 v1에서 TTS 파일의 무음 패딩(선단 12.4s·말단 48.8s 합)이 그대로 자막 시간이 되어
 * 「2:12 대사 안 나옴」·「자막 안 맞음」 지적을 받았다. v2에서 손으로 대응한 로직을 정식 함수로
 * 승격했으므로, ①함수가 발화 기준 창을 내는지 ②정렬 안 된 자막을 사후 검증이 잡는지 둘 다 본다.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import {
  parseSilenceLog, probeSpeechWindow, speechCaptionWindow, buildQuietWindows, checkSpeechAlignment,
} from '../speech-window.mjs';
import { probeDurationSec } from '../media-probe.mjs';
import { ffmpegAvailable, makeFixtureDir, makePaddedVoice } from './fixtures.mjs';

const codesOf = (report, severity) => report.findings
  .filter((finding) => finding.severity === severity)
  .map((finding) => finding.code);

describe('parseSilenceLog', () => {
  it('선단·말단 무음과 발화 런을 분리한다', () => {
    const log = [
      'silence_start: 0',
      'silence_end: 2 | silence_duration: 2',
      'silence_start: 3',
      'silence_end: 6 | silence_duration: 3',
    ].join('\n');
    const result = parseSilenceLog(log, 6);
    expect(result.lead).toBe(2);
    expect(result.trail).toBe(3);
    expect(result.speech).toEqual([[2, 3]]);
  });

  it('무음이 없으면 파일 전체가 발화다', () => {
    const result = parseSilenceLog('', 4);
    expect(result).toMatchObject({ lead: 0, trail: 0, speech: [[0, 4]] });
  });
});

describe('speechCaptionWindow (승격된 자막 창 계산)', () => {
  it('선단·말단 무음을 걷어내고 가드 여유만 남긴다', () => {
    // 100s에 배치된 6s 파일: 선단 2s / 말단 3s 무음 → 발화는 102~103s.
    const window = speechCaptionWindow({ start: 100, duration: 6, speechLead: 2, speechTrail: 3 });
    expect(window.start).toBeCloseTo(101.9, 3);   // 리드 가드 0.1s만 미리
    expect(window.end).toBeCloseTo(103.25, 3);    // 테일 가드 0.25s만 더
  });

  it('무음이 가드보다 작으면 창을 건드리지 않는다', () => {
    const window = speechCaptionWindow({ start: 10, duration: 4, speechLead: 0.05, speechTrail: 0.2 });
    expect(window.start).toBe(10);
    expect(window.end).toBe(14);
  });

  it('짧은 세그먼트에는 최소 창 하한이 걸린다', () => {
    const window = speechCaptionWindow({ start: 0, duration: 2, speechLead: 0.9, speechTrail: 1.0 });
    expect(window.minWindowApplied).toBe(true);
    expect(window.end - window.start).toBeCloseTo(0.5, 3);
  });
});

describe('buildQuietWindows', () => {
  it('배치된 발화 런의 여집합을 낸다', () => {
    const placed = [
      { start: 0, duration: 5, speechRuns: [[1, 4]] },
      { start: 5, duration: 5, speechRuns: [[0.5, 3]] },
    ];
    expect(buildQuietWindows(placed, 10)).toEqual([[0, 1], [4, 5.5], [8, 10]]);
  });

  it('발화 런이 없으면 세그먼트 전체를 발화로 본다(보수적)', () => {
    expect(buildQuietWindows([{ start: 0, duration: 4 }], 6)).toEqual([[4, 6]]);
  });
});

describe('checkSpeechAlignment (사후 검증)', () => {
  // ep2 실측 최대치(선단 0.757s·말단 1.193s)를 닮은 현실적 세그먼트.
  const segments = [
    { assetId: 'N01-01-narrator', start: 0, duration: 6, speechLead: 0.7, speechTrail: 1.2 },
    { assetId: 'N01-02-narrator', start: 6, duration: 5, speechLead: 0.2, speechTrail: 0.3 },
  ];

  it('발화 기준으로 잡힌 자막 창은 통과한다', () => {
    const captionWindows = new Map(segments.map((seg) => {
      const window = speechCaptionWindow(seg);
      return [seg.assetId, { start: window.start, end: window.end, count: 1 }];
    }));
    const report = checkSpeechAlignment({ segments, captionWindows, probedCount: 2 });
    expect(codesOf(report, 'error')).toEqual([]);
  });

  it('클립 경계를 그대로 쓴 자막 창을 ERROR로 잡는다 (ep2 v1 재현)', () => {
    // 정렬 이전 동작: 자막 = 세그먼트 파일 경계 전체.
    const captionWindows = new Map(segments.map((seg) => [
      seg.assetId, { start: seg.start, end: seg.start + seg.duration, count: 1 },
    ]));
    const report = checkSpeechAlignment({ segments, captionWindows, probedCount: 2 });
    const early = report.findings.find((item) => item.code === 'caption-early');
    const late = report.findings.find((item) => item.code === 'caption-late');
    expect(early.subject).toBe('N01-01-narrator');
    expect(early.evidence.early).toBeCloseTo(0.6, 2);   // 0.6초 먼저 뜬다
    expect(late.evidence.late).toBeCloseTo(0.95, 2);    // 0.95초 더 남는다
  });

  it('실측이 한 건도 없으면 ERROR (정렬이 조용히 꺼진 상태)', () => {
    const report = checkSpeechAlignment({
      segments: segments.map(({ assetId, start, duration }) => ({ assetId, start, duration })),
      probedCount: 0,
    });
    expect(codesOf(report, 'error')).toContain('not-measured');
  });

  it('전부 무음인 테이크를 ERROR로 잡는다', () => {
    const report = checkSpeechAlignment({
      segments: [{ assetId: 'N01-01-narrator', start: 0, duration: 4, speechLead: 4, speechTrail: 0 }],
      probedCount: 1,
    });
    expect(codesOf(report, 'error')).toContain('no-speech');
  });

  it('패딩이 파일 대부분인 테이크를 ERROR로 잡는다', () => {
    const report = checkSpeechAlignment({
      segments: [{ assetId: 'N01-01-narrator', start: 0, duration: 10, speechLead: 4.5, speechTrail: 4.5 }],
      probedCount: 1,
    });
    expect(codesOf(report, 'error')).toContain('padding-dominant');
  });

  it('과한 선단·말단 무음은 WARN으로 남긴다', () => {
    const report = checkSpeechAlignment({
      segments: [{ assetId: 'N01-01-narrator', start: 0, duration: 10, speechLead: 0.9, speechTrail: 1.5 }],
      probedCount: 1,
    });
    expect(codesOf(report, 'warn')).toEqual(expect.arrayContaining(['lead-padding', 'trail-padding']));
  });
});

describe.runIf(ffmpegAvailable())('probeSpeechWindow (실제 TTS 파일)', () => {
  let dir;
  beforeAll(() => { dir = makeFixtureDir(); }, 120_000);
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('무음 패딩이 큰 테이크의 선단·말단을 실측한다', async () => {
    const voice = makePaddedVoice(dir, { lead: 2, speech: 1, trail: 3 });
    const duration = await probeDurationSec(voice);
    const probe = await probeSpeechWindow(voice, duration);
    expect(probe).toBeDefined();
    expect(probe.lead).toBeGreaterThan(1.8);
    expect(probe.lead).toBeLessThan(2.2);
    expect(probe.trail).toBeGreaterThan(2.8);
    expect(probe.trail).toBeLessThan(3.2);
  }, 120_000);

  it('실측 결과를 자막 창에 물리면 정렬 사후 검증을 통과한다', async () => {
    const voice = makePaddedVoice(dir, { lead: 2, speech: 1, trail: 3 });
    const duration = await probeDurationSec(voice);
    const probe = await probeSpeechWindow(voice, duration);
    const seg = {
      assetId: 'N01-01-narrator', start: 0, duration,
      speechLead: probe.lead, speechTrail: probe.trail, speechRuns: probe.speech,
    };
    const window = speechCaptionWindow(seg);
    const aligned = checkSpeechAlignment({
      segments: [seg],
      captionWindows: new Map([[seg.assetId, { start: window.start, end: window.end, count: 1 }]]),
      probedCount: 1,
    });
    // 이 픽스처는 의도적으로 패딩이 극단적(6초 중 발화 1초)이라 padding-dominant는 별도로 뜬다 —
    // 여기서 확인할 것은 「정렬을 적용하면 자막 창 위반이 사라진다」는 것이다.
    expect(codesOf(aligned, 'error')).not.toContain('caption-early');
    expect(codesOf(aligned, 'error')).not.toContain('caption-late');

    // 같은 파일을 정렬 없이(파일 경계 그대로) 쓰면 잡힌다.
    const unaligned = checkSpeechAlignment({
      segments: [seg],
      captionWindows: new Map([[seg.assetId, { start: 0, end: duration, count: 1 }]]),
      probedCount: 1,
    });
    expect(codesOf(unaligned, 'error')).toEqual(expect.arrayContaining(['caption-early', 'caption-late']));
  }, 120_000);
});
