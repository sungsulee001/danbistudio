#!/usr/bin/env node
/**
 * run-script-gate-regression.mjs — 게이트 ②(대본 QC) 회귀 테스트
 *
 * ① 현행 승인본(ep1 대본 v2.1 · ep2 대본 v1.0)이 통과하는가
 * ② 의도적으로 위반을 주입한 픽스처가 규칙별로 걸리는가
 * ③ 제외 규약(실록 인용 낭독부·[사실] 대사)이 실제로 동작하는가 — 네거티브 검증
 * ④ 화면 러닝타임 계산 경로(2026-08-01 신설) — 묵음 표기 있음/없음/혼합
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

  // ── 항목 D: 대사 전용 검사 축
  {
    name: 'D/지적 구간 회귀 — ep2 승인본 N08(선임·윤담)이 실제로 검출된다',
    which: 'ep2',
    expect: ['DLG-PARALLEL', 'DLG-ABSTRACT-HANJA', 'DLG-SUBJECT-REPEAT', 'DLG-VAGUE-REFERENT', 'DLG-NO-CONCRETE'],
    expectScene: 'N08',
  },
  {
    name: 'D/오탐 통제 — ep2 승인본 축 D WARN은 N08에만 몰린다',
    which: 'ep2',
    customAssert: (report) => {
      const warns = report.findings.filter((f) => f.ruleId.startsWith('DLG-') && f.severity !== 'INFO');
      const other = warns.filter((f) => f.scene !== 'N08');
      return other.length === 0 ? null : `N08 밖 검출 ${other.length}건: ${other.map((f) => `${f.scene}/${f.ruleId}`).join(', ')}`;
    },
  },
  {
    name: 'D/오탐 통제 — ep1(하이브리드·대사 소수)에서 축 D 검출 0',
    which: 'ep1',
    opts: { allow: ['LEN-DURATION-BAND'] },
    customAssert: (report) => {
      const warns = report.findings.filter((f) => f.ruleId.startsWith('DLG-') && f.severity !== 'INFO');
      return warns.length === 0 ? null : `검출 ${warns.length}건: ${warns.map((f) => `${f.scene}/${f.ruleId}`).join(', ')}`;
    },
  },
  {
    name: 'D/DLG-PARALLEL — 기계적 대구 주입(구체 요소 없음)',
    which: 'ep2',
    mutate: (s) =>
      replaceSpeechBlock(s, '## 장면 05 (N05)', [
        '선임: 여기까지가 어제의 뜻이다. 이제부터가 오늘의 뜻이다.',
      ]),
    expectScene: 'N05',
    expect: ['DLG-PARALLEL'],
    expectSeverity: 'WARN',
  },
  {
    name: 'D/DLG-PARALLEL — 구체 요소가 있는 대구는 INFO로 강등(의도된 리듬 보호)',
    which: 'ep2',
    customAssert: (report) => {
      const hit = report.findings.find((f) => f.ruleId === 'DLG-PARALLEL' && f.scene === 'N06');
      if (!hit) return 'N06 대구(종은 인형이 칩니다/인형은 물이 칩니다) 미검출';
      return hit.severity === 'INFO' ? null : `심각도 ${hit.severity} ≠ INFO`;
    },
  },
  {
    name: 'D/DLG-ABSTRACT-HANJA — 구어 부적합 추상 한자어 주입',
    which: 'ep2',
    mutate: (s) =>
      replaceSpeechBlock(s, '## 장면 05 (N05)', [
        '선임: 이 일은 우리가 수행한다.',
        '윤담: 무엇을 확보합니까.',
      ]),
    expectScene: 'N05',
    expect: ['DLG-ABSTRACT-HANJA'],
  },
  {
    name: 'D/DLG-ABSTRACT-HANJA — 시대극 한자어 화이트리스트는 미검출(서운관·호군·직무·시각)',
    which: 'ep2',
    mutate: (s) =>
      replaceSpeechBlock(s, '## 장면 05 (N05)', [
        '선임: 서운관 생도의 직무는 시각을 지키는 일이다.',
        '윤담: 호군 나리의 품계는 정사품입니까.',
      ]),
    expectScene: 'N05',
    expectNot: ['DLG-ABSTRACT-HANJA'],
  },
  {
    name: 'D/DLG-SUBJECT-REPEAT — 주어 반복 + 현재형 단문 나열 주입',
    which: 'ep2',
    mutate: (s) =>
      replaceSpeechBlock(s, '## 장면 05 (N05)', [
        '선임: 우리는 듣는다.',
        '선임: 우리는 옮긴다.',
      ]),
    expectScene: 'N05',
    expect: ['DLG-SUBJECT-REPEAT'],
    expectSeverity: 'WARN',
  },
  {
    name: 'D/DLG-NO-CONCRETE — 추상 대사 연속 주입(축 D 핵심)',
    which: 'ep2',
    mutate: (s) =>
      replaceSpeechBlock(s, '## 장면 05 (N05)', [
        '선임: 우리의 일은 그렇게 정해진 것이다.',
        '윤담: 그러면 그것은 무엇을 뜻합니까.',
        '선임: 뜻은 뜻대로 남을 뿐이다.',
        '윤담: 저는 아직 잘 모르겠습니다.',
      ]),
    expectScene: 'N05',
    expect: ['DLG-NO-CONCRETE'],
    expectSeverity: 'WARN',
  },
  {
    name: 'D/DLG-NO-CONCRETE — 구체 요소가 한 줄만 있어도 연쇄가 끊긴다(오탐 억제 검증)',
    which: 'ep2',
    mutate: (s) =>
      replaceSpeechBlock(s, '## 장면 05 (N05)', [
        '선임: 우리의 일은 그렇게 정해진 것이다.',
        '윤담: 저 종채를 쥐고 기다립니까.',
        '선임: 뜻은 뜻대로 남을 뿐이다.',
        '윤담: 저는 아직 잘 모르겠습니다.',
      ]),
    expectScene: 'N05',
    expectNot: ['DLG-NO-CONCRETE'],
  },
  {
    name: 'D/DLG-VAGUE-REFERENT — 지시어 과다 + 구체 요소 0',
    which: 'ep2',
    mutate: (s) =>
      replaceSpeechBlock(s, '## 장면 05 (N05)', [
        '선임: 그 일은 이것이 대신한다.',
      ]),
    expectScene: 'N05',
    expect: ['DLG-VAGUE-REFERENT'],
  },
  {
    name: 'D/DLG-REGISTER-MISMATCH — 선언 어투(윤담=합쇼체) ↔ 하오체 발화',
    which: 'ep2',
    mutate: (s) =>
      replaceSpeechBlock(s, '## 장면 05 (N05)', [
        '윤담: 저 살대가 무엇이오.',
      ]),
    expectScene: 'N05',
    expect: ['DLG-REGISTER-MISMATCH'],
  },
  {
    name: 'D/DLG-REGISTER-MISMATCH — 상대 높임 전환(선임의 합쇼체 alt)은 미검출',
    which: 'ep2',
    customAssert: (report) => {
      const hits = report.findings.filter(
        (f) => f.ruleId === 'DLG-REGISTER-MISMATCH' && f.severity !== 'INFO',
      );
      return hits.length === 0
        ? null
        : `선임이 김빈 앞에서 합쇼체로 전환하는 라인이 오탐: ${hits.map((f) => f.evidence).slice(0, 3).join(' | ')}`;
    },
  },
  {
    name: 'D/--strict-dialogue — 핵심 규칙 ERROR 승격',
    which: 'ep2',
    opts: { strictDialogue: true },
    expect: ['DLG-NO-CONCRETE'],
    expectSeverity: 'ERROR',
  },
  {
    name: 'D/기본 심각도 — 옵션 없이는 ERROR 0(승인본 무회귀 보장)',
    which: 'ep2',
    customAssert: (report) => {
      const errs = report.findings.filter((f) => f.ruleId.startsWith('DLG-') && f.severity === 'ERROR');
      return errs.length === 0 ? null : `ERROR ${errs.length}건`;
    },
  },
  {
    name: 'D/네거티브 — [사실] 대사(세종 실록 수록 발언)에 위반 어휘를 심어도 미검출',
    which: 'ep2',
    mutate: (s) =>
      must(s, '  - 세종: 이번에 스스로 치는 궁루를 만들었다.').replace(
        '  - 세종: 이번에 스스로 치는 궁루를 만들었다.',
        '  - 세종: 그 일은 이것이 보증한다. 그 뜻은 이것이 담보한다.',
      ),
    forbidEvidence: ['그 일은 이것이 보증한다', '그 뜻은 이것이 담보한다'],
  },
  {
    name: 'D/네거티브 — [사실] 낭독 대사(김빈 서문)에 위반 어휘를 심어도 미검출',
    which: 'ep2',
    mutate: (s) =>
      must(s, '  - 김빈: 실로 우리 동방에 전에 없던 훌륭한 제도이다.').replace(
        '  - 김빈: 실로 우리 동방에 전에 없던 훌륭한 제도이다.',
        '  - 김빈: 그 일은 이것이 보증한다.',
      ),
    forbidEvidence: ['그 일은 이것이 보증한다'],
  },
  {
    name: 'D/네거티브 — 내레이터 실록 인용 낭독부는 축 D 비대상',
    which: 'ep2',
    mutate: (s) =>
      must(s, '  - 내레이터: 간의와 맞추어 보면 털끝만큼도 어긋나지 않았다.').replace(
        '  - 내레이터: 간의와 맞추어 보면 털끝만큼도 어긋나지 않았다.',
        '  - 내레이터: 그 일은 이것이 보증한다. 그 뜻은 이것이 담보한다.',
      ),
    forbidEvidence: ['그 일은 이것이 보증한다', '그 뜻은 이것이 담보한다'],
  },
  {
    name: 'D/제외 범위 — `대사가 전달하는 사실은 [사실]`은 화자 제외 신호가 아니다',
    which: 'ep2',
    customAssert: (report) =>
      report.stats.dialogueLines >= 100
        ? null
        : `검사 대상 대사 ${report.stats.dialogueLines}줄 — 구조 표기를 제외 신호로 오독하면 대사가 통째로 빠진다(기대 100줄 이상)`,
  },
];

// ─────────────────────── [3] 화면 러닝타임 계산 경로(2026-08-01 신설)

const EP3 = path.join(VAULT, '20-productions/2026-08-01-anyeo-reconstruction/01-script.md');

function gateOnFile(file, opts = {}) {
  return runGate(file, opts);
}

/** 장면의 `화면 지시` 필드 앞에 `소리 타이밍` 필드를 끼워 넣는다. */
function withSoundTiming(src, sceneHeadingFragment, lines, header = '- **소리 타이밍**:') {
  const start = src.indexOf(sceneHeadingFragment);
  if (start < 0) throw new Error(`장면 헤딩을 찾을 수 없다: ${sceneHeadingFragment}`);
  const at = src.indexOf('- **화면 지시**:', start);
  if (at < 0) throw new Error('화면 지시 필드를 찾을 수 없다');
  const block = `${header}\n${lines.map((l) => `  - ${l}`).join('\n')}\n`;
  return src.slice(0, at) + block + src.slice(at);
}

const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

const SCREEN_DURATION = [
  {
    name: '픽스처(표기 없음) — ep1은 소리 타이밍 0장면, 침묵 0초 · 화면 러닝타임 = 발화 시간',
    fn: () => {
      const { report } = gateOn('ep1', null, {});
      const s = report.stats.silence;
      if (s.totalSec !== 0 || s.annotatedScenes !== 0) return `침묵 ${s.totalSec}초 / 기재 ${s.annotatedScenes}장면 (기대 0/0)`;
      for (const k of Object.keys(report.stats.durations)) {
        if (report.stats.screenDurations[k] !== report.stats.durations[k]) {
          return `${k}: 화면 ${report.stats.screenDurations[k]} ≠ 발화 ${report.stats.durations[k]}`;
        }
      }
      return null;
    },
  },
  {
    name: '픽스처(표기 있음) — 묵음·무발화·SFX 후를 각각 초 단위로 합산한다',
    fn: () => {
      const { report } = gateOn(
        'ep1',
        (s) =>
          withSoundTiming(s, '## 장면 05 (N05)', [
            '`SFX: lib/종이-넘김-단장` — 첫 프레임.',
            '`SFX 후 0.8` `VO` 내레이터 첫 줄.',
            '`묵음 1.5` — 둘째 줄 앞.',
            '`무발화 2.5` — 장면 끝.',
          ]),
        {},
      );
      const s = report.stats.silence;
      if (s.explicitSilenceCount !== 1 || !near(s.explicitSilenceSec, 1.5)) return `묵음 ${s.explicitSilenceCount}건 ${s.explicitSilenceSec}초 (기대 1건 1.5초)`;
      if (s.nonSpeechCount !== 1 || !near(s.nonSpeechSec, 2.5)) return `무발화 ${s.nonSpeechCount}건 ${s.nonSpeechSec}초 (기대 1건 2.5초)`;
      if (s.sfxLeadCount !== 1 || !near(s.sfxLeadSec, 0.8)) return `SFX 선행 ${s.sfxLeadCount}건 ${s.sfxLeadSec}초 (기대 1건 0.8초)`;
      if (!near(s.totalSec, 4.8)) return `합계 ${s.totalSec}초 (기대 4.8초) — \`SFX: lib/<id>\`는 길이 항이 아니다`;
      return null;
    },
  },
  {
    name: '픽스처(표기 있음) — 발화 시간 계산은 불변, 침묵만 가산된다',
    fn: () => {
      const base = gateOn('ep1', null, {}).report.stats;
      const withS = gateOn(
        'ep1',
        (s) => withSoundTiming(s, '## 장면 05 (N05)', ['`묵음 1.5` — 둘째 줄 앞.', '`무발화 2.5` — 장면 끝.']),
        {},
      ).report.stats;
      for (const k of Object.keys(base.durations)) {
        if (base.durations[k] !== withS.durations[k]) return `발화 시간이 바뀌었다 ${k}: ${base.durations[k]} → ${withS.durations[k]}`;
        if (!near(withS.screenDurations[k], base.durations[k] + 4.0)) {
          return `${k}: 화면 ${withS.screenDurations[k]} ≠ 발화 ${base.durations[k]} + 4.0`;
        }
      }
      return null;
    },
  },
  {
    name: '픽스처(혼합) — ep2 승인본 2/15 장면 기재: 묵음 0.5 + 무발화 6.0 + SFX 후 0.5 = 7.0초',
    fn: () => {
      const { report } = gateOn('ep2', null, {});
      const s = report.stats.silence;
      if (s.annotatedScenes !== 2) return `소리 타이밍 기재 ${s.annotatedScenes}장면 (기대 2)`;
      if (!near(s.explicitSilenceSec, 0.5) || !near(s.nonSpeechSec, 6.0) || !near(s.sfxLeadSec, 0.5)) {
        return `묵음 ${s.explicitSilenceSec} / 무발화 ${s.nonSpeechSec} / SFX 후 ${s.sfxLeadSec}`;
      }
      if (!near(s.totalSec, 7.0)) return `합계 ${s.totalSec}초 (기대 7.0초)`;
      if (!near(report.stats.screenDurations.sohee_min, report.stats.durations.sohee_min + 7.0)) {
        return `화면 ${report.stats.screenDurations.sohee_min} ≠ 발화 ${report.stats.durations.sohee_min} + 7.0`;
      }
      return null;
    },
  },
  {
    name: '필드 헤더 — 괄호 부기 표기(`- **소리 타이밍**(규칙 37 …):`)도 파싱된다',
    fn: () => {
      const { report } = gateOn(
        'ep1',
        (s) =>
          withSoundTiming(s, '## 장면 05 (N05)', ['`묵음 1.0` — 둘째 줄 앞.'], '- **소리 타이밍**(규칙 37 — 표기 규약은 머리 메모):'),
        {},
      );
      const s = report.stats.silence;
      return s.annotatedScenes === 1 && near(s.totalSec, 1.0) ? null : `기재 ${s.annotatedScenes}장면 / ${s.totalSec}초`;
    },
  },
  {
    name: '결정론 — 산문 배수 수식어(「각각」·「앞뒤 모두」)는 추론하지 않는다(표기 1건 = 1회)',
    fn: () => {
      const { report } = gateOn(
        'ep1',
        (s) =>
          withSoundTiming(s, '## 장면 05 (N05)', [
            '`묵음 0.5` 계문 세 줄 사이 각각. 세 줄이 한 호흡으로 붙지 않게 끊는다.',
            '`묵음 1.2` — 마지막 줄 앞과 뒤 모두.',
          ]),
        {},
      );
      const s = report.stats.silence;
      return s.explicitSilenceCount === 2 && near(s.explicitSilenceSec, 1.7)
        ? null
        : `묵음 ${s.explicitSilenceCount}건 ${s.explicitSilenceSec}초 (기대 2건 1.7초 — 배수 미적용)`;
    },
  },
  {
    name: 'ep3(소리 타이밍 16/16) — 화면 러닝타임 기준 판정 PASS',
    fn: () => {
      const { report } = gateOnFile(EP3, { requireThroughLine: true, strictDialogue: true });
      const s = report.stats.silence;
      if (!near(s.totalSec, 87.4)) return `침묵 합계 ${s.totalSec}초 (기대 87.4초)`;
      if (s.annotatedScenes !== 16) return `기재 ${s.annotatedScenes}/16장면`;
      if (!near(report.stats.screenDurations.sohee_min, 594.1, 0.15)) return `sohee_min 화면 ${report.stats.screenDurations.sohee_min}초 (기대 594.1초)`;
      if (!near(report.stats.screenDurations.sohee_max, 590.4, 0.15)) return `sohee_max 화면 ${report.stats.screenDurations.sohee_max}초 (기대 590.4초)`;
      const errs = report.findings.filter((f) => f.severity === 'ERROR');
      return errs.length === 0 ? null : `ERROR ${errs.length}건: ${[...new Set(errs.map((f) => f.ruleId))].join(', ')}`;
    },
  },
  {
    name: '규칙 37 정합 — 하한 미달 대본에 설계된 무발화를 배치하면 대역 안으로 들어온다',
    fn: () => {
      const before = gateOn('ep1', null, {}).report.findings.filter((f) => f.ruleId === 'LEN-DURATION-BAND' && f.severity === 'ERROR');
      if (before.length === 0) return 'ep1이 개정 전부터 하한을 통과한다 — 픽스처 전제 붕괴';
      const after = gateOn(
        'ep1',
        (s) => withSoundTiming(s, '## 장면 05 (N05)', ['`무발화 6.0` — 장면 끝, 화면만 간다.']),
        {},
      ).report.findings.filter((f) => f.ruleId === 'LEN-DURATION-BAND' && f.severity === 'ERROR');
      return after.length === 0 ? null : `무발화 6.0초 배치 후에도 ERROR ${after.length}건`;
    },
  },
  {
    name: '상한 — 침묵 과다는 LEN-DURATION-BAND 상한 ERROR로 걸린다(무한 신장 차단)',
    fn: () => {
      const { report } = gateOn(
        'ep2',
        (s) => withSoundTiming(s, '## 장면 05 (N05)', ['`무발화 200.0` — 과다 주입.']),
        {},
      );
      const hits = report.findings.filter((f) => f.ruleId === 'LEN-DURATION-BAND' && f.severity === 'ERROR');
      if (hits.length === 0) return '상한 이탈 미검출';
      return /이탈/.test(hits[0].message) ? null : `메시지 이상: ${hits[0].message}`;
    },
  },
  {
    name: '발화 0줄 장면 — `무발화 N.N` 미표기는 LEN-SILENT-SCENE-UNMARKED WARN(길이 추정 금지)',
    fn: () => {
      const bare = gateOn('ep1', (s) => replaceSpeechBlock(s, '## 장면 05 (N05)', []), {});
      const warn = bare.report.findings.filter((f) => f.ruleId === 'LEN-SILENT-SCENE-UNMARKED');
      if (warn.length === 0) return '발화 0줄 장면 미검출';
      const marked = gateOn(
        'ep1',
        (s) => withSoundTiming(replaceSpeechBlock(s, '## 장면 05 (N05)', []), '## 장면 05 (N05)', ['`무발화 8.0` — 화면만 가는 장면.']),
        {},
      );
      const still = marked.report.findings.filter((f) => f.ruleId === 'LEN-SILENT-SCENE-UNMARKED');
      return still.length === 0 ? null : `무발화 표기 후에도 WARN ${still.length}건`;
    },
  },
  {
    name: '선언 필드 기준 불변 — 장면 `예상 길이`는 종전대로 발화 시간과 대조한다',
    fn: () => {
      const { report } = gateOnFile(EP3, {});
      const hits = report.findings.filter((f) => f.ruleId === 'LEN-SCENE-DECL');
      return hits.length === 0
        ? null
        : `ep3 장면 예상 길이(발화 기준)가 ${hits.length}건 어긋난다 — 선언 필드 기준이 화면으로 밀린 것`;
    },
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
      const hits = found.filter((f) => f.ruleId === id && (!c.expectScene || f.scene === c.expectScene));
      if (hits.length === 0) {
        problems.push(`${id} 미검출${c.expectScene ? `(장면 ${c.expectScene})` : ''}`);
      } else if (c.expectSeverity && !hits.some((h) => h.severity === c.expectSeverity)) {
        problems.push(`${id} 심각도 ${hits[0].severity} ≠ 기대 ${c.expectSeverity}`);
      }
    }
    if (c.customAssert) {
      const detail = c.customAssert(report);
      if (detail) problems.push(detail);
    }
    for (const id of c.expectNot || []) {
      if (found.some((f) => f.ruleId === id && f.severity !== 'INFO' && (!c.expectScene || f.scene === c.expectScene))) {
        problems.push(`${id} 오탐(검출되면 안 됨)${c.expectScene ? `(장면 ${c.expectScene})` : ''}`);
      }
    }
    // 주입 문구가 어떤 위반 근거에도 등장하지 않아야 한다(장면 단위 스코프가 불가능한 네거티브용)
    for (const marker of c.forbidEvidence || []) {
      const hit = found.find(
        (f) => f.severity !== 'INFO' && String(f.evidence || '').includes(marker),
      );
      if (hit) problems.push(`주입 문구가 ${hit.ruleId} 근거에 등장 — 제외 규약 미작동`);
    }
    record(c.name, problems.length === 0, problems.join(' / '));
  } catch (e) {
    record(c.name, false, `예외: ${e.message}`);
  }
}

process.stdout.write('\n[3] 화면 러닝타임 계산 경로(2026-08-01 신설)\n');

for (const c of SCREEN_DURATION) {
  try {
    const detail = c.fn();
    record(c.name, !detail, detail || '');
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
