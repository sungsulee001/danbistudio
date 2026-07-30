/** 가드 리포트 자료형 — 심각도 계약(ERROR = non-zero exit)이 흔들리지 않는지 확인 */

import { describe, it, expect } from 'vitest';
import {
  createGuardReport, mergeGuardReports, downgradeErrors, formatGuardBundle, toJsonReport,
} from '../report.mjs';

const sample = () => {
  const report = createGuardReport('demo', '데모 가드');
  report.error('bad-thing', 'CUT-01', '망가졌습니다', { actual: 96000, expected: 48000 });
  report.warn('odd-thing', 'CUT-02', '이상합니다', { ratio: 0.4123456 });
  report.info('measured', '', '실측', { count: 3 });
  return report;
};

describe('guard report', () => {
  it('심각도별 개수를 센다', () => {
    expect(sample().counts).toEqual({ error: 1, warn: 1, info: 1 });
  });

  it('번들은 error가 있으면 ok=false', () => {
    const bundle = mergeGuardReports([sample()]);
    expect(bundle.ok).toBe(false);
    expect(bundle.counts.error).toBe(1);
  });

  it('warn-only 강등은 error를 없애고 흔적을 남긴다', () => {
    const bundle = downgradeErrors(mergeGuardReports([sample()]));
    expect(bundle.counts.error).toBe(0);
    expect(bundle.findings.filter((finding) => finding.downgraded)).toHaveLength(1);
  });

  it('출력에 근거 수치가 함께 실린다', () => {
    const lines = formatGuardBundle(mergeGuardReports([sample()])).join('\n');
    expect(lines).toContain('ERROR bad-thing CUT-01');
    expect(lines).toContain('actual=96000');
    expect(lines).toContain('expected=48000');
    // 에러가 경고보다 위에 온다
    expect(lines.indexOf('bad-thing')).toBeLessThan(lines.indexOf('odd-thing'));
  });

  it('JSON 리포트는 기계 판독용 필드를 갖춘다', () => {
    const json = toJsonReport(mergeGuardReports([sample()]), { stage: 'compile' });
    expect(json.stage).toBe('compile');
    expect(json.ok).toBe(false);
    expect(json.findings[0]).toMatchObject({ guard: 'demo', code: 'bad-thing', severity: 'error' });
  });
});
