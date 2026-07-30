/**
 * guards/report.mjs — S6 산출물 가드의 공통 리포트 자료형
 *
 * 모든 가드는 「항목·심각도·근거 수치」를 담은 finding 배열을 돌려준다. 사람이 읽는 문장만
 * 남기면 회귀 판정을 사람 눈에 의존하게 되므로(ep2 96kHz 모노 사고의 재발 구조), 근거는
 * 반드시 기계 판독 가능한 evidence 객체로 함께 싣는다.
 *
 * 심각도 계약:
 *   error — 납품 불가. 호출자는 non-zero exit로 파이프라인을 세운다(조용한 통과 금지).
 *   warn  — 인간 판단 대상. 진행은 하되 반드시 로그에 남는다.
 *   info  — 실측 수치 기록(가드가 실제로 돌았다는 증거).
 */

export const SEVERITY = Object.freeze({ ERROR: 'error', WARN: 'warn', INFO: 'info' });

const SEVERITY_RANK = { error: 3, warn: 2, info: 1 };

/**
 * 가드 하나의 리포트를 모은다.
 * @param {string} guard 가드 식별자(예: 'output-spec')
 * @param {string} title 사람이 읽는 제목
 */
export function createGuardReport(guard, title) {
  const findings = [];
  const push = (severity) => (code, subject, message, evidence = {}) => {
    findings.push({ guard, code, severity, subject, message, evidence });
    return findings[findings.length - 1];
  };
  return {
    guard,
    title,
    findings,
    error: push(SEVERITY.ERROR),
    warn: push(SEVERITY.WARN),
    info: push(SEVERITY.INFO),
    /** 심각도별 개수 */
    get counts() {
      return countBySeverity(findings);
    },
  };
}

export function countBySeverity(findings) {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

/** 여러 가드 리포트를 하나의 묶음으로 합친다(순서 보존). */
export function mergeGuardReports(reports) {
  const kept = reports.filter(Boolean);
  const findings = kept.flatMap((report) => report.findings);
  return {
    reports: kept,
    findings,
    // counts/ok는 **getter**여야 한다 — downgradeErrors()로 심각도를 바꾼 뒤에도
    // 값이 갱신되지 않으면 「강등했는데 여전히 실패로 종료」하는 모순이 생긴다.
    get counts() {
      return countBySeverity(findings);
    },
    get ok() {
      return countBySeverity(findings).error === 0;
    },
  };
}

/** error → warn 강등(스테이징 컴파일용 --guards-warn-only). info는 그대로 둔다. */
export function downgradeErrors(bundle) {
  for (const finding of bundle.findings) {
    if (finding.severity === SEVERITY.ERROR) {
      finding.severity = SEVERITY.WARN;
      finding.downgraded = true;
    }
  }
  return bundle;
}

const formatEvidence = (evidence) => {
  const entries = Object.entries(evidence ?? {}).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return '';
  return ` {${entries.map(([key, value]) => `${key}=${formatValue(value)}`).join(', ')}}`;
};

const formatValue = (value) => {
  if (Array.isArray(value)) return `[${value.map(formatValue).join(' ')}]`;
  if (typeof value === 'number') return String(Number(value.toFixed(4)));
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const MARK = { error: 'ERROR', warn: 'WARN ', info: 'info ' };

/** 콘솔 출력용 문자열 배열. 심각도 내림차순 정렬(에러가 위로). */
export function formatGuardBundle(bundle, { includeInfo = true } = {}) {
  const lines = [];
  for (const report of bundle.reports) {
    const counts = countBySeverity(report.findings);
    const visible = report.findings.filter((finding) => includeInfo || finding.severity !== SEVERITY.INFO);
    lines.push(
      `[${report.guard}] ${report.title} — error ${counts.error} / warn ${counts.warn} / info ${counts.info}`,
    );
    const sorted = visible.slice().sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    for (const finding of sorted) {
      lines.push(
        `  ${MARK[finding.severity]} ${finding.code}${finding.subject ? ` ${finding.subject}` : ''}: `
        + `${finding.message}${formatEvidence(finding.evidence)}`,
      );
    }
  }
  return lines;
}

/** 기계 판독용 JSON 직렬화(vault 기록·CI 수집용). */
export function toJsonReport(bundle, meta = {}) {
  return {
    ...meta,
    generatedAt: new Date().toISOString(),
    counts: bundle.counts,
    ok: bundle.counts.error === 0,
    findings: bundle.findings,
  };
}
