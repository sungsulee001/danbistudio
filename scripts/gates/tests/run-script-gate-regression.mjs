#!/usr/bin/env node
/**
 * run-script-gate-regression.mjs — 게이트 ②(대본 QC) 회귀 테스트
 *
 * ① 현행 승인본(ep1 대본 v2.1 · ep2 대본 v1.0)이 통과하는가
 * ② 의도적으로 위반을 주입한 픽스처가 규칙별로 걸리는가
 * ③ 제외 규약(실록 인용 낭독부·[사실] 대사)이 실제로 동작하는가 — 네거티브 검증
 *
 * 픽스처는 승인본 원문을 메모리에서 변형해 임시 파일로만 쓴다.
 * **대본 원문은 절대 수정하지 않는다.**
 *
 * 실행: node scripts/gates/tests/run-script-gate-regression.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runGate } from '../script-gate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAULT = process.env.DANBI_VAULT || 'E:/ai_tool/DanbiVault';
const EP1 = path.join(VAULT, '20-productions/2026-07-13-jangyeongsil-silence/01-script.md');
const EP2 = path.join(VAULT, '20-productions/2026-07-29-jagyeongnu-night/01-script.md');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'script-gate-'));
const SOURCES = {};

function source(which) {
  if (!SOURCES[which]) SOURCES[which] = fs.readFileSync(which === 'ep1' ? EP1 : EP2, 'utf8');
  return SOURCES[which];
}

function gateOn(which, mutate, opts = {}) {
  const src = mutate ? mutate(source(which)) : source(which);
  const file = path.join(TMP, `${which}-${Math.random().toString(36).slice(2, 8)}.md`);
  fs.writeFileSync(file, src, 'utf8');
  return runGate(file, opts);
}

/** 장면 N의 발화 블록을 통째로 갈아 끼운다(다중 라인 안전 치환). */
function replaceSpeechBlock(src, sceneHeadingFragment, lines) {
  const start = src.indexOf(sceneHeadingFragment);
  if (start < 0) throw new Error(`장면 헤딩을 찾을 수 없다: ${sceneHeadingFragment}`);
  const blockStart = src.indexOf('- **나레이션/대사**:', start);
  const blockEnd = src.indexOf('- **화면 지시**:', blockStart);
  if (blockStart < 0 || blockEnd < 0) throw new Error('발화 블록 경계를 찾을 수 없다');
  const replacement = `- **나레이션/대사**:\n${lines.map((l) => `  - ${l}`).join('\n')}\n`;
  return src.slice(0, blockStart) + replacement + src.slice(blockEnd);
}

function must(src, needle) {
  if (!src.includes(needle)) throw new Error(`픽스처 앵커 소실: ${needle.slice(0, 50)}`);
  return src;
}

const EP1_FIRST = '  - 무관: 멈춰라. 어가를 멈춰라.';
const EP2_FIRST = '  - 갑사: 종채를 들어라.';
const EP1_FORESHADOW = '> **복선 표(규칙 11 — 심기/회수)**: ① 손 모티프: N03 심기';

// ─────────────────────────────────────────── 베이스라인(승인본)

const BASELINE = [
  {
    name: 'ep1 v2.1 승인본 — 길이 규칙 유예 시 통과',
    which: 'ep1',
    opts: { allow: ['LEN-DURATION-BAND'] },
    expectPass: true,
  },
  {
    name: 'ep1 v2.1 승인본 — 유예 없이는 길이 규칙만 ERROR',
    which: 'ep1',
    opts: {},
    expectPass: false,
    expectOnlyErrors: ['LEN-DURATION-BAND'],
  },
  {
    name: 'ep2 v1.0 승인본 — 무조건 통과',
    which: 'ep2',
    opts: {},
    expectPass: true,
  },
];

// ─────────────────────────────────────────── 위반 주입 픽스처

const INJECTIONS = [
  // ── 항목 A: TTS lint
  {
    name: 'A/TTS — 아라비아 숫자',
    which: 'ep1',
    mutate: (s) => must(s, '천사백사십이 년 봄').replace('천사백사십이 년 봄', '1442년 봄'),
    expect: ['TTS-DIGIT'],
  },
  {
    name: 'A/TTS — 로마자',
    which: 'ep1',
    mutate: (s) => must(s, EP1_FIRST).replace(EP1_FIRST, '  - 무관: 멈춰라. TTS 어가를 멈춰라.'),
    expect: ['TTS-LATIN'],
  },
  {
    name: 'A/TTS — 따옴표',
    which: 'ep1',
    mutate: (s) => must(s, EP1_FIRST).replace(EP1_FIRST, '  - 무관: 멈춰라. "어가를 멈춰라."'),
    expect: ['TTS-QUOTE'],
  },
  {
    name: 'A/TTS — 괄호',
    which: 'ep1',
    mutate: (s) => must(s, EP1_FIRST).replace(EP1_FIRST, '  - 무관: 멈춰라. 어가를(지금) 멈춰라.'),
    expect: ['TTS-PAREN'],
  },
  {
    name: 'A/TTS — 문장 55음절 초과',
    which: 'ep1',
    mutate: (s) =>
      must(s, EP1_FIRST).replace(
        EP1_FIRST,
        '  - 무관: 지금 이 자리에서 어가의 행렬을 전부 멈추고 모두 물러서서 임금의 가마가 기울어지지 않도록 바퀴와 이음새를 하나하나 살펴 다시 세우도록 하라.',
      ),
    expect: ['TTS-SENT-LEN'],
  },
  {
    name: 'A/TTS — 쉼표 3개 이상',
    which: 'ep1',
    mutate: (s) =>
      must(s, EP1_FIRST).replace(EP1_FIRST, '  - 무관: 멈춰라, 어가를, 지금, 당장 멈춰라.'),
    expect: ['TTS-COMMA'],
  },

  // ── 항목 A: 훅
  {
    name: 'A/훅 — 첫 문장 18음절 초과',
    which: 'ep1',
    mutate: (s) =>
      must(s, EP1_FIRST).replace(
        EP1_FIRST,
        '  - 무관: 지금 이 자리에서 어가의 행렬을 전부 멈추고 모두 물러서라. 어가를 멈춰라.',
      ),
    expect: ['HOOK-FIRST-SENT'],
  },
  {
    name: 'A/훅 — 콜드 오픈 위반(인사·예고 화법)',
    which: 'ep1',
    mutate: (s) =>
      must(s, EP1_FIRST).replace(
        EP1_FIRST,
        '  - 무관: 안녕하세요. 오늘은 장영실에 대해 알아보겠습니다.',
      ),
    expect: ['HOOK-COLD-OPEN'],
  },
  {
    name: 'A/훅 — 제목 키워드 30초 내 미등장',
    which: 'ep2',
    mutate: (s) =>
      must(s, '# 대본 v1.0: 자격루의 밤').replace('# 대본 v1.0: 자격루의 밤', '# 대본 v1.0: 측우기의 밤'),
    expect: ['HOOK-TITLE-KEYWORD'],
  },

  // ── 항목 A: 태그 전수
  {
    name: 'A/태그 — 대사 태그 블록 누락',
    which: 'ep1',
    mutate: (s) => s.replace(/^- \*\*대사 태그\*\*: 무관 대사.*$/m, ''),
    expect: ['TAG-BLOCK-MISSING'],
  },
  {
    name: 'A/태그 — [사실]에 근거 기사 ID 없음',
    which: 'ep1',
    mutate: (s) =>
      s.replace(
        /^- \*\*대사 태그\*\*: 전부 내레이터 \*\*\[사실\]\*\*\(곤장 팔십 대.*$/m,
        '- **대사 태그**: 전부 내레이터 **[사실]**(곤장 팔십 대·파직). 나머지는 **[각색]** 연출 선언.',
      ),
    expect: ['TAG-FACT-EVIDENCE'],
  },

  // ── 항목 A: 복선
  {
    name: 'A/복선 — 미회수 복선',
    which: 'ep1',
    mutate: (s) =>
      must(s, EP1_FORESHADOW).replace(
        /^> \*\*복선 표\(규칙 11 — 심기\/회수\)\*\*:.*$/m,
        '> **복선 표(규칙 11 — 심기/회수)**: ① 손 모티프: N03 심기(쇠를 다루는 손) ② 기기: N07 심기(가득 차면 엎어진다) → N11 회수(가득 찼던 시간이 엎어진 것)',
      ),
    expect: ['FS-NO-PAYOFF'],
  },
  {
    name: 'A/복선 — 존재하지 않는 장면 참조',
    which: 'ep1',
    mutate: (s) => must(s, 'N10·N12 회수').replace('N10·N12 회수', 'N99 회수'),
    expect: ['FS-SCENE-MISSING'],
  },

  // ── 항목 A: 2인칭 / 나레이터 비중 / 화자 로스터
  {
    name: 'A/2인칭 — 상한 초과',
    which: 'ep2',
    mutate: (s) =>
      must(s, '  - 내레이터: 새벽입니다.').replace(
        '  - 내레이터: 새벽입니다.',
        '  - 내레이터: 여러분 새벽입니다. 여러분 보십시오. 여러분 들으십시오. 여러분 기다리십시오.',
      ),
    expect: ['PERSON-2ND-LIMIT'],
  },
  {
    name: 'A/나레이터 비중 — 픽션 드라마 30% 초과',
    which: 'ep2',
    mutate: (s) => s.replace(/^ {2}- 선임: /gm, '  - 내레이터: '),
    expect: ['NARR-SHARE'],
  },
  {
    name: 'A/화자 로스터 — 장면 화자 필드와 불일치',
    which: 'ep1',
    mutate: (s) => must(s, EP1_FIRST).replace(EP1_FIRST, '  - 도승지: 멈춰라. 어가를 멈춰라.'),
    expect: ['ROSTER-SCENE-MISMATCH'],
  },

  // ── 항목 B: through-line
  {
    name: 'B/through-line — 유효 선언은 위반 0 (규약 실현 가능성 검증)',
    which: 'ep2',
    mutate: (s) =>
      s.replace(
        /^(> \*\*복선 표.*)$/m,
        '> **through_line**: 물건=종채 | 심기=N03 | 상승=N10 | 페이오프=N13\n$1',
      ),
    expectNot: ['TL-UNDECLARED', 'TL-MULTI-SCENE', 'TL-ROLE-ABSENT', 'TL-MONOTONIC', 'TL-NO-PAYOFF', 'TL-PAYOFF-POSITION'],
  },
  {
    name: 'B/through-line — 사물이 본문에 없음',
    which: 'ep2',
    mutate: (s) =>
      s.replace(
        /^(> \*\*복선 표.*)$/m,
        '> **through_line**: 물건=측우기 | 심기=N03 | 상승=N10 | 페이오프=N13\n$1',
      ),
    expect: ['TL-MULTI-SCENE', 'TL-ROLE-ABSENT'],
  },
  {
    name: 'B/through-line — 역할 사슬 단조 증가 위반',
    which: 'ep2',
    mutate: (s) =>
      s.replace(
        /^(> \*\*복선 표.*)$/m,
        '> **through_line**: 물건=종채 | 심기=N13 | 상승=N10 | 페이오프=N03\n$1',
      ),
    expect: ['TL-MONOTONIC', 'TL-PAYOFF-POSITION'],
  },
  {
    name: 'B/through-line — 미선언을 ERROR로 승격',
    which: 'ep2',
    opts: { requireThroughLine: true },
    expect: ['TL-UNDECLARED'],
    expectSeverity: 'ERROR',
  },

  // ── 항목 B: reorder test / 정보 밀도
  {
    name: 'B/reorder — 역참조도 새 정보도 없는 빌드 장면(나열 의심)',
    which: 'ep2',
    mutate: (s) =>
      replaceSpeechBlock(s, '## 장면 05 (N05)', [
        '윤담: 물을 지킵니까.',
        '선임: 물은 하루를 한 번도 거르지 않는다.',
        '윤담: 살대가 무엇을 합니까.',
      ]),
    expect: ['RO-REORDERABLE', 'DENS-ZERO-NEW'],
  },

  // ── 항목 C: AI-티 패턴
  {
    name: 'C/AI-티 — 결산 피벗 + 본질적으로',
    which: 'ep2',
    mutate: (s) =>
      must(s, '  - 내레이터: 새벽입니다.').replace(
        '  - 내레이터: 새벽입니다.',
        '  - 내레이터: 결론적으로 새벽입니다. 본질적으로 이것은 중요합니다. 이를 통해 밤이 끝납니다.',
      ),
    expect: ['D-1', 'D-3'],
  },
  {
    name: 'C/AI-티 — --strict-style 시 S1 패턴 ERROR 승격',
    which: 'ep2',
    opts: { strictStyle: true },
    mutate: (s) =>
      must(s, '  - 내레이터: 새벽입니다.').replace(
        '  - 내레이터: 새벽입니다.',
        '  - 내레이터: 결론적으로 새벽입니다. 본질적으로 이것은 중요합니다. 이를 통해 밤이 끝납니다.',
      ),
    expect: ['D-1'],
    expectSeverity: 'ERROR',
  },
  {
    name: 'C/제외 규약 — 실록 인용 낭독부(문어체 평서)는 검사 제외',
    which: 'ep2',
    mutate: (s) =>
      must(s, '  - 내레이터: 간의와 맞추어 보면 털끝만큼도 어긋나지 않았다.').replace(
        '  - 내레이터: 간의와 맞추어 보면 털끝만큼도 어긋나지 않았다.',
        '  - 내레이터: 결론적으로 간의와 맞추어 보면 털끝만큼도 어긋나지 않았다.',
      ),
    expectNot: ['D-1'],
  },
  {
    name: 'C/제외 규약 — [사실] 캐릭터 대사는 검사 제외',
    which: 'ep2',
    mutate: (s) =>
      must(s, '  - 세종: 이번에 스스로 치는 궁루를 만들었다.').replace(
        '  - 세종: 이번에 스스로 치는 궁루를 만들었다.',
        '  - 세종: 결론적으로 본질적으로 이번에 스스로 치는 궁루를 만들었다.',
      ),
    expectNot: ['D-1', 'D-3'],
  },
];

// ─────────────────────────────────────────── 실행

let pass = 0;
let fail = 0;
const failures = [];

function record(name, ok, detail) {
  if (ok) {
    pass += 1;
    process.stdout.write(`  PASS  ${name}\n`);
  } else {
    fail += 1;
    failures.push(`${name} — ${detail}`);
    process.stdout.write(`  FAIL  ${name}\n        ${detail}\n`);
  }
}

process.stdout.write('\n게이트 ②: 대본 QC 게이트 — 회귀 테스트\n');
process.stdout.write('='.repeat(72) + '\n');
process.stdout.write('\n[1] 승인본 베이스라인\n');

for (const c of BASELINE) {
  try {
    const { report } = gateOn(c.which, null, c.opts || {});
    const errs = report.findings.filter((f) => f.severity === 'ERROR');
    const ids = [...new Set(errs.map((f) => f.ruleId))];
    if (c.expectPass) {
      record(c.name, errs.length === 0, `ERROR ${errs.length}건: ${ids.join(', ')}`);
    } else {
      const onlyExpected =
        ids.length > 0 && ids.every((id) => (c.expectOnlyErrors || []).includes(id));
      record(c.name, onlyExpected, `실제 ERROR 규칙: ${ids.join(', ') || '(없음)'}`);
    }
  } catch (e) {
    record(c.name, false, `예외: ${e.message}`);
  }
}

process.stdout.write('\n[2] 위반 주입 픽스처\n');

for (const c of INJECTIONS) {
  try {
    const { report } = gateOn(c.which, c.mutate || null, c.opts || {});
    const found = report.findings;
    const problems = [];
    for (const id of c.expect || []) {
      const hits = found.filter((f) => f.ruleId === id);
      if (hits.length === 0) {
        problems.push(`${id} 미검출`);
      } else if (c.expectSeverity && !hits.some((h) => h.severity === c.expectSeverity)) {
        problems.push(`${id} 심각도 ${hits[0].severity} ≠ 기대 ${c.expectSeverity}`);
      }
    }
    for (const id of c.expectNot || []) {
      if (found.some((f) => f.ruleId === id && f.severity !== 'INFO')) {
        problems.push(`${id} 오탐(검출되면 안 됨)`);
      }
    }
    record(c.name, problems.length === 0, problems.join(' / '));
  } catch (e) {
    record(c.name, false, `예외: ${e.message}`);
  }
}

process.stdout.write('\n' + '='.repeat(72) + '\n');
process.stdout.write(`결과: ${pass} PASS / ${fail} FAIL (총 ${pass + fail})\n`);
if (failures.length) {
  process.stdout.write('\n실패 목록:\n');
  for (const f of failures) process.stdout.write(`  - ${f}\n`);
}
process.stdout.write(`임시 픽스처: ${TMP}\n\n`);
process.exit(fail > 0 ? 1 : 0);
