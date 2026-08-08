/**
 * Danbi S7 — 예약 공개(status.publishAt) 단위 검증
 *
 * 실제 API 호출은 하지 않는다. 시각 계산·인자 규칙·private 강제만 검증한다.
 *   npx vitest run scripts/publish/__tests__/publish-schedule.test.mjs
 */

import { describe, it, expect } from 'vitest';
import {
  parseTimezoneOffset, parsePublishAtInput, parseRelativeDuration,
  formatOffsetIso, formatKoreanTime, formatOffsetLabel, zoneName,
  formatRemaining, describePublishAt, assertFuturePublishAt, DEFAULT_TZ,
} from '../lib.mjs';
import { parseArgs, buildStatus } from '../upload.mjs';

/** 2026-08-08T18:12:01+09:00 == 2026-08-08T09:12:01Z */
const KST_1812 = Date.UTC(2026, 7, 8, 9, 12, 1);
const META = { title: 't', description: 'd', tags: ['a'], categoryId: '27', containsSyntheticMedia: true };

describe('parseTimezoneOffset', () => {
  it('여러 표기를 같은 분 단위 오프셋으로 받는다', () => {
    for (const v of ['+09:00', '+0900', '+9', 'KST', 'kst']) {
      expect(parseTimezoneOffset(v).minutes).toBe(540);
    }
    expect(parseTimezoneOffset('Z').minutes).toBe(0);
    expect(parseTimezoneOffset('UTC').minutes).toBe(0);
    expect(parseTimezoneOffset('-05:30').minutes).toBe(-330);
  });

  it('기본값은 KST(+09:00)', () => {
    expect(parseTimezoneOffset(undefined).minutes).toBe(540);
    expect(parseTimezoneOffset('').label).toBe('+09:00');
    expect(DEFAULT_TZ).toBe('+09:00');
  });

  it('IANA 지역명은 지원하지 않고 거부한다 (조용히 오해석하지 않는다)', () => {
    expect(() => parseTimezoneOffset('Asia/Seoul')).toThrow(/타임존 오프셋을 해석할 수 없다/);
    expect(() => parseTimezoneOffset('+99:00')).toThrow();
  });

  it('라벨·존 이름', () => {
    expect(formatOffsetLabel(540)).toBe('+09:00');
    expect(formatOffsetLabel(-330)).toBe('-05:30');
    expect(formatOffsetLabel(0)).toBe('+00:00');
    expect(zoneName(540)).toBe('KST');
    expect(zoneName(0)).toBe('UTC');
    expect(zoneName(-330)).toBe('UTC-05:30');
  });
});

describe('parsePublishAtInput — RFC 3339', () => {
  it('오프셋이 붙은 값을 정확히 해석한다', () => {
    expect(parsePublishAtInput('2026-08-08T18:12:01+09:00').epochMs).toBe(KST_1812);
    expect(parsePublishAtInput('2026-08-08T09:12:01Z').epochMs).toBe(KST_1812);
    expect(parsePublishAtInput('2026-08-08T18:12:01+0900').epochMs).toBe(KST_1812);
  });

  it('오프셋을 생략하면 기본 KST로 해석한다', () => {
    const p = parsePublishAtInput('2026-08-08T18:12:01');
    expect(p.epochMs).toBe(KST_1812);
    expect(p.offsetMinutes).toBe(540);
    expect(p.explicitOffset).toBe(false);
  });

  it('--timezone 으로 기본 타임존을 바꿀 수 있다', () => {
    expect(parsePublishAtInput('2026-08-08T09:12:01', 'UTC').epochMs).toBe(KST_1812);
    expect(parsePublishAtInput('2026-08-08T18:12:01', '+09:00').epochMs).toBe(KST_1812);
  });

  it('호스트 타임존에 의존하지 않는다 — new Date(문자열) 함정 회피', () => {
    // 같은 문자열을 로컬 해석하면 호스트 TZ마다 값이 달라진다. 우리 파서는 고정값이어야 한다.
    expect(parsePublishAtInput('2026-08-08T18:12:01', '+09:00').epochMs).toBe(KST_1812);
    expect(parsePublishAtInput('2026-08-08T18:12:01', '-05:00').epochMs).toBe(Date.UTC(2026, 7, 8, 23, 12, 1));
  });

  it('초·공백 구분자·소수 초를 허용한다', () => {
    expect(parsePublishAtInput('2026-08-08 18:12').epochMs).toBe(Date.UTC(2026, 7, 8, 9, 12, 0));
    expect(parsePublishAtInput('2026-08-08T18:12:01.500+09:00').epochMs).toBe(KST_1812);
  });

  it('날짜만 주면 거부한다 (시각이 모호해서 추측하지 않는다)', () => {
    expect(() => parsePublishAtInput('2026-08-08')).toThrow(/해석할 수 없다/);
  });

  it('달력에 없는 날짜를 거부한다', () => {
    expect(() => parsePublishAtInput('2026-02-30T10:00:00+09:00')).toThrow(/달력에 없는 날짜/);
    expect(() => parsePublishAtInput('2026-13-01T10:00:00+09:00')).toThrow();
    expect(() => parsePublishAtInput('2026-08-08T25:00:00+09:00')).toThrow();
  });

  it('빈 값·쓰레기 값을 거부한다', () => {
    for (const v of ['', 'tomorrow', '내일 6시', '1754640721']) {
      expect(() => parsePublishAtInput(v)).toThrow();
    }
  });
});

describe('parseRelativeDuration', () => {
  it('단일 단위', () => {
    expect(parseRelativeDuration('6h')).toBe(6 * 3600_000);
    expect(parseRelativeDuration('30m')).toBe(30 * 60_000);
    expect(parseRelativeDuration('2d')).toBe(2 * 86400_000);
    expect(parseRelativeDuration('45s')).toBe(45_000);
  });

  it('복합 단위와 대문자·공백', () => {
    expect(parseRelativeDuration('1d6h30m')).toBe(86400_000 + 6 * 3600_000 + 30 * 60_000);
    expect(parseRelativeDuration(' 6H ')).toBe(6 * 3600_000);
  });

  it('단위 없는 숫자·0·쓰레기를 거부한다', () => {
    for (const v of ['6', '0h', '0', 'abc', '', 'h6', '-6h']) {
      expect(() => parseRelativeDuration(v)).toThrow();
    }
  });
});

describe('표기 — ISO와 한국 시각 둘 다', () => {
  it('ISO는 지정 오프셋으로 렌더한다', () => {
    expect(formatOffsetIso(KST_1812, 540)).toBe('2026-08-08T18:12:01+09:00');
    expect(formatOffsetIso(KST_1812, 0)).toBe('2026-08-08T09:12:01+00:00');
  });

  it('한국 시각 표기', () => {
    expect(formatKoreanTime(KST_1812, 540)).toBe('2026년 8월 8일(토) 오후 6시 12분');
    expect(formatKoreanTime(Date.UTC(2026, 7, 7, 15, 0, 0), 540)).toBe('2026년 8월 8일(토) 오전 12시 00분');
    expect(formatKoreanTime(Date.UTC(2026, 7, 8, 3, 0, 0), 540)).toBe('2026년 8월 8일(토) 오후 12시 00분');
  });

  it('describePublishAt은 ISO·한국어·UTC를 함께 준다', () => {
    const d = describePublishAt(KST_1812, 540);
    expect(d.iso).toBe('2026-08-08T18:12:01+09:00');
    expect(d.human).toBe('2026년 8월 8일(토) 오후 6시 12분');
    expect(d.zone).toBe('KST');
    expect(d.utcIso).toBe('2026-08-08T09:12:01.000Z');
  });

  it('남은 시간 표기', () => {
    expect(formatRemaining(6 * 3600_000)).toBe('6시간');
    expect(formatRemaining(6 * 3600_000 + 30 * 60_000)).toBe('6시간 30분');
    expect(formatRemaining(0)).toBe('0분');
    expect(formatRemaining(-60_000)).toMatch(/이미 지남/);
  });

  it('파싱 → 렌더 왕복이 입력을 보존한다', () => {
    const s = '2026-08-08T18:12:01+09:00';
    const p = parsePublishAtInput(s);
    expect(formatOffsetIso(p.epochMs, p.offsetMinutes)).toBe(s);
  });
});

describe('과거 시각 거부', () => {
  const now = KST_1812;

  it('과거는 거부', () => {
    expect(() => assertFuturePublishAt(now - 1000, 540, { nowMs: now })).toThrow(/과거다/);
  });

  it('현재와 같은 시각도 거부', () => {
    expect(() => assertFuturePublishAt(now, 540, { nowMs: now })).toThrow(/과거다/);
  });

  it('최소 여유(60초) 미만은 거부', () => {
    expect(() => assertFuturePublishAt(now + 30_000, 540, { nowMs: now })).toThrow(/임박했다/);
  });

  it('충분히 미래면 통과하고 표기를 돌려준다', () => {
    const d = assertFuturePublishAt(now + 6 * 3600_000, 540, { nowMs: now });
    expect(d.iso).toBe('2026-08-09T00:12:01+09:00');
  });
});

describe('buildStatus — privacyStatus=private 강제', () => {
  it('publishAt 없으면 기존과 동일한 status (회귀 확인)', () => {
    expect(buildStatus(META, 'public', false)).toEqual({
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
      license: 'youtube',
      embeddable: true,
      publicStatsViewable: true,
    });
  });

  it('withSynthetic이면 containsSyntheticMedia를 붙인다 (기존 동작)', () => {
    expect(buildStatus(META, 'private', true).containsSyntheticMedia).toBe(true);
    expect(buildStatus({ ...META, containsSyntheticMedia: false }, 'private', true).containsSyntheticMedia).toBeUndefined();
  });

  it('private + publishAt 조합만 허용한다', () => {
    const s = buildStatus(META, 'private', false, '2026-08-08T18:12:01+09:00');
    expect(s.privacyStatus).toBe('private');
    expect(s.publishAt).toBe('2026-08-08T18:12:01+09:00');
  });

  it('public/unlisted + publishAt 은 던진다', () => {
    expect(() => buildStatus(META, 'public', false, '2026-08-08T18:12:01+09:00')).toThrow(/private 일 때만/);
    expect(() => buildStatus(META, 'unlisted', false, '2026-08-08T18:12:01+09:00')).toThrow(/private 일 때만/);
  });
});

describe('parseArgs — 예약 인자', () => {
  const NOW = Date.UTC(2026, 7, 8, 0, 0, 0);   // 2026-08-08 09:00 KST
  const p = (args) => parseArgs(args, { nowMs: NOW });

  it('회귀: 예약 인자가 없으면 예약은 꺼져 있고 기본값이 그대로다', () => {
    const o = p(['ep3']);
    expect(o.schedule).toBeNull();
    expect(o.visibility).toBe('private');
    expect(o.visibilityExplicit).toBe(false);
    expect(o.dryRun).toBe(false);
    expect(o.writeback).toBe(true);
    expect(o.scheduleOnly).toBe(false);
    expect(o.target).toBe('ep3');
  });

  it('회귀: 기존 인자 조합이 그대로 동작한다', () => {
    const o = p(['ep3', '--dry-run', '--visibility', 'public', '--playlist', 'PL1', '--no-thumbnail', '--no-writeback']);
    expect(o.schedule).toBeNull();
    expect(o.visibility).toBe('public');
    expect(o.playlist).toBe('PL1');
    expect(o.noThumbnail).toBe(true);
    expect(o.writeback).toBe(false);
    expect(p(['ep3', '--set-visibility', 'public']).setVisibility).toBe('public');
  });

  it('--publish-at: 절대 시각을 잡고 visibility를 private로 강제한다', () => {
    const o = p(['ep3', '--publish-at', '2026-08-08T18:12:01+09:00']);
    expect(o.schedule.mode).toBe('absolute');
    expect(o.schedule.epochMs).toBe(KST_1812);
    expect(o.schedule.offsetMinutes).toBe(540);
    expect(o.visibility).toBe('private');
  });

  it('--publish-in: 델타만 잡고 절대 시각은 확정하지 않는다 (완료 시각 기준)', () => {
    const o = p(['ep3', '--publish-in', '6h']);
    expect(o.schedule.mode).toBe('relative');
    expect(o.schedule.deltaMs).toBe(6 * 3600_000);
    expect(o.schedule.epochMs).toBeUndefined();
    expect(o.visibility).toBe('private');
  });

  it('--timezone 이 절대 시각 해석에 반영된다', () => {
    const o = p(['ep3', '--publish-at', '2026-08-08T09:12:01', '--timezone', 'UTC']);
    expect(o.schedule.epochMs).toBe(KST_1812);
    expect(o.schedule.offsetMinutes).toBe(0);
  });

  it('예약 + --visibility public|unlisted 는 에러로 막는다', () => {
    expect(() => p(['ep3', '--publish-at', '2026-08-08T18:12:01+09:00', '--visibility', 'public']))
      .toThrow(/함께 쓸 수 없다/);
    expect(() => p(['ep3', '--publish-in', '6h', '--visibility', 'unlisted']))
      .toThrow(/함께 쓸 수 없다/);
    expect(() => p(['ep3', '--visibility', 'public', '--publish-in', '6h']))
      .toThrow(/함께 쓸 수 없다/);
  });

  it('예약 + --visibility private 는 허용한다', () => {
    expect(p(['ep3', '--publish-in', '6h', '--visibility', 'private']).visibility).toBe('private');
  });

  it('예약 + --set-visibility 는 어느 값이든 막는다 (조용히 무시되면 예약이 안 걸린다)', () => {
    expect(() => p(['ep3', '--publish-in', '6h', '--set-visibility', 'public'])).toThrow(/함께 쓸 수 없다/);
    expect(() => p(['ep3', '--publish-in', '6h', '--set-visibility', 'private']))
      .toThrow(/--set-visibility 는 예약 공개를 설정하지 않는다/);
  });

  it('--publish-at 과 --publish-in 동시 지정을 막는다', () => {
    expect(() => p(['ep3', '--publish-at', '2026-08-08T18:12:01+09:00', '--publish-in', '6h']))
      .toThrow(/함께 쓸 수 없다/);
  });

  it('과거 시각을 인자 단계에서 거부한다', () => {
    expect(() => p(['ep3', '--publish-at', '2026-08-07T18:00:00+09:00'])).toThrow(/과거다/);
    expect(() => p(['ep3', '--publish-at', '2026-08-08T09:00:30+09:00'])).toThrow(/과거다|임박/);
  });

  it('--schedule-only 는 예약 인자를 요구한다', () => {
    expect(() => p(['ep3', '--schedule-only'])).toThrow(/--publish-at 또는 --publish-in 이 필요하다/);
    expect(p(['ep3', '--schedule-only', '--publish-in', '6h', '--video-id', 'X']).scheduleOnly).toBe(true);
  });

  it('--timezone 만 단독으로 주면 거부한다 (조용히 무시하지 않는다)', () => {
    expect(() => p(['ep3', '--timezone', '+09:00'])).toThrow(/함께 써야 한다/);
  });

  it('값 누락·미지 옵션은 기존대로 거부한다', () => {
    expect(() => p(['ep3', '--publish-at'])).toThrow(/값이 필요하다/);
    expect(() => p(['ep3', '--publish-later', '6h'])).toThrow(/알 수 없는 옵션/);
  });
});
