/**
 * 게이트 ① 회귀 테스트
 *
 *  A. 골든 케이스 — 과거 실패 프롬프트가 실제로 걸리는가 / 현행 채택본이 통과하는가
 *  B. 실제 콘티 회귀 — ep1(2026-07-13-jangyeongsil-silence) · ep2(2026-07-29-jagyeongnu-night)
 *     02-storyboard.md 를 그대로 입력해 파싱·플래그·검출을 검증한다.
 *
 * vault 경로는 저장소 밖(E:\ai_tool\DanbiVault)이므로, 없으면 B 스위트를 건너뛴다.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadRules,
  parseStoryboard,
  normalizeJsonInput,
  checkItems,
  deriveFlags,
} from '../prompt-gate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(readFileSync(resolve(HERE, '../fixtures/prompt-gate-golden.json'), 'utf8'));
const { rules } = loadRules();

const VAULT = process.env.DANBI_VAULT ?? 'E:/ai_tool/DanbiVault';
const EP1 = `${VAULT}/20-productions/2026-07-13-jangyeongsil-silence/02-storyboard.md`;
const EP2 = `${VAULT}/20-productions/2026-07-29-jagyeongnu-night/02-storyboard.md`;
const hasVault = existsSync(EP1) && existsSync(EP2);

const runRecords = (records) => checkItems(normalizeJsonInput(records, '<golden>'), rules);
const runFile = (path) => {
  const parsed = parseStoryboard(readFileSync(path, 'utf8'), path);
  return { parsed, result: checkItems(parsed.cuts, rules) };
};
const errorsOf = (r) => r.violations.filter((v) => v.severity === 'ERROR');
const cutsFor = (r, ruleId) => errorsOf(r).filter((v) => v.rule === ruleId).map((v) => v.cut).sort();

// ────────────────────────────────────────────────────────────────────────────
// 0. 규칙 테이블 자체 무결성
// ────────────────────────────────────────────────────────────────────────────

describe('규칙 테이블', () => {
  it('image/video/audio 3종을 모두 로딩하고 ID가 유일하다', () => {
    const kinds = new Set(rules.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(['audio', 'image', 'video']);
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    expect(rules.length).toBeGreaterThanOrEqual(35);
  });

  it('모든 규칙이 severity·why·fix·정규식 컴파일 가능성을 갖춘다', () => {
    for (const r of rules) {
      expect(['ERROR', 'WARN'], `${r.id} severity`).toContain(r.severity);
      expect(r.why, `${r.id} why`).toBeTruthy();
      expect(r.fix, `${r.id} fix`).toBeTruthy();
      for (const key of ['pattern', 'with', 'unless']) {
        if (r.detect[key]) expect(() => new RegExp(r.detect[key], r.detect.flags ?? '')).not.toThrow();
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// A. 골든 케이스
// ────────────────────────────────────────────────────────────────────────────

describe('골든 케이스 ① 과거 실패 프롬프트는 반드시 걸린다', () => {
  for (const c of GOLDEN.fail) {
    it(`${c.id} → ${c.expect.join(', ')}`, () => {
      const res = runRecords([{ id: c.id, ...c.record }]);
      const hit = res.violations.map((v) => v.rule);
      for (const rule of c.expect) expect(hit, `${c.id} (${c.evidence})`).toContain(rule);
      expect(res.ok, `${c.id}은 ERROR로 게이트를 막아야 한다`).toBe(false);
    });
  }
});

describe('골든 케이스 ② 현행 채택본은 통과한다 (ERROR 0)', () => {
  for (const c of GOLDEN.pass) {
    it(`${c.id}`, () => {
      const res = runRecords([{ id: c.id, ...c.record }]);
      const errs = errorsOf(res).map((v) => `${v.rule}: ${v.evidence.join('/')}`);
      expect(errs, `${c.id} (${c.evidence})`).toEqual([]);
      expect(res.ok).toBe(true);
    });
  }
});

describe('exit code 계약', () => {
  it('ERROR가 있으면 ok=false, WARN만 있으면 ok=true', () => {
    const fail = runRecords([{ id: 'X', kind: 'video', motion_prompt: 'the room grows dark' }]);
    expect(fail.ok).toBe(false);
    const warnOnly = runRecords([{
      id: 'Y',
      kind: 'image',
      shot_type: 'WS(마당)',
      image_prompt: '{STYLE}, wide shot of a courtyard with a single official standing by the well, not a single other figure anywhere',
    }]);
    expect(errorsOf(warnOnly)).toEqual([]);
    expect(warnOnly.summary.warns).toBeGreaterThan(0);
    expect(warnOnly.ok).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// B. 실제 콘티 회귀 (ep1 · ep2)
// ────────────────────────────────────────────────────────────────────────────

describe.skipIf(!hasVault)('콘티 파서', () => {
  it('ep1 콘티 v3를 59컷으로 파싱한다 (부록 v2/v1은 제외)', () => {
    const { parsed } = runFile(EP1);
    expect(parsed.cuts.length).toBe(59);
    expect(parsed.declaredCutCount).toBe(59);
    expect(parsed.productionId).toBe('2026-07-13-jangyeongsil-silence');
    expect(parsed.cuts.every((c) => c.fields.image_prompt.length > 40)).toBe(true);
    expect(parsed.cuts.every((c) => c.fields.motion_prompt.length > 10)).toBe(true);
  });

  it('ep2 콘티 v1을 67컷으로 파싱한다', () => {
    const { parsed } = runFile(EP2);
    expect(parsed.cuts.length).toBe(67);
    expect(parsed.declaredCutCount).toBe(67);
    expect(parsed.productionId).toBe('2026-07-29-jagyeongnu-night');
  });

  it('ep2 플래그가 콘티 §시각 문법 계약과 일치한다', () => {
    const { parsed } = runFile(EP2);
    const ids = (flag) => parsed.cuts.filter((c) => c.flags.includes(flag)).map((c) => c.id);
    // A2V 6컷 (계약 4)
    expect(ids('a2v')).toEqual(['CUT-16', 'CUT-18', 'CUT-21', 'CUT-25', 'CUT-33', 'CUT-40']);
    // MCU/CU 단독 인물 = portrait-painterly 대상(손 컷 제외)
    expect(ids('single_figure')).toEqual(['CUT-16', 'CUT-18', 'CUT-21', 'CUT-25', 'CUT-33', 'CUT-40']);
    // hands-only 선언 8컷
    expect(ids('hands')).toEqual(
      ['CUT-02', 'CUT-11', 'CUT-22', 'CUT-32', 'CUT-37', 'CUT-41', 'CUT-48', 'CUT-54'],
    );
    // 무인 컷 33컷 (03-assets §검증 ③ "무인 컷 자체가 33컷으로 증가")
    expect(ids('nofigure_intent').length).toBe(33);
    // 군상 컷 (계약 6-②의 7컷 + 컷 본문이 군상 어휘 의무를 선언한 CUT-52)
    expect(ids('crowd')).toEqual(
      ['CUT-17', 'CUT-34', 'CUT-35', 'CUT-36', 'CUT-43', 'CUT-45', 'CUT-52', 'CUT-53'],
    );
  });
});

describe.skipIf(!hasVault)('ep1 회귀 — 문서화된 과거 실패가 검출된다', () => {
  const { result } = hasVault ? runFile(EP1) : { result: null };

  it('실사 드리프트 MCU 단독 인물 컷(11·13·14·35)을 잡는다', () => {
    // 근거: ep1 S4 화풍 보정 패스 — p3 채택 07·11·13·14 / p2 채택 35 / 34는 hands 계열
    const hit = cutsFor(result, 'IMG-CU-PORTRAIT-VARIANT');
    for (const cut of ['CUT-11', 'CUT-13', 'CUT-14', 'CUT-35']) expect(hit).toContain(cut);
  });

  it('손 CU 얼굴 침입 컷(07·32·34)을 잡는다', () => {
    // 근거: ep1 CUT-07·32 4/4·3/3 얼굴 침입 → S6 크롭 필수 / CUT-34 hands-only 재서술로 해소
    const hit = cutsFor(result, 'IMG-HANDS-VARIANT');
    for (const cut of ['CUT-07', 'CUT-32', 'CUT-34']) expect(hit).toContain(cut);
    expect(cutsFor(result, 'IMG-HANDS-SUBJECT')).toContain('CUT-07');
  });

  it('어휘 리스크 3종(cracked·frozen·twists) 실증 컷을 전부 잡는다', () => {
    // 근거: CUT-31 스킨 크랙 / CUT-37 프레임-인-프레임 / CUT-02 회전 도망
    const hit = cutsFor(result, 'VID-RISK-VOCAB');
    for (const cut of ['CUT-02', 'CUT-31', 'CUT-37']) expect(hit).toContain(cut);
  });

  it('말미 암전 프라이어 컷(CUT-48)을 어둠 어휘로 잡는다', () => {
    expect(cutsFor(result, 'VID-DARK-VOCAB')).toContain('CUT-48');
  });

  it('관모 갓형 결함이 다수 검출된다 (ep1 12컷 잔존)', () => {
    expect(cutsFor(result, 'IMG-HAT-SHAPE').length).toBeGreaterThanOrEqual(10);
  });
});

describe.skipIf(!hasVault)('ep2 회귀 — 규약 반영본은 이미지 측이 깨끗하다', () => {
  const { result } = hasVault ? runFile(EP2) : { result: null };

  it('이미지 ERROR가 ep1 대비 급감한다 (규약 1차 적용 효과)', () => {
    const ep1 = runFile(EP1).result;
    const img = (r) => errorsOf(r).filter((v) => v.kind === 'image').length;
    expect(img(result)).toBeLessThanOrEqual(6);
    expect(img(result)).toBeLessThan(img(ep1) / 3);
  });

  it('이미지 ERROR 잔여분은 전부 문서화된 실패·계약 위반이다', () => {
    const hit = errorsOf(result).filter((v) => v.kind === 'image').map((v) => `${v.cut}/${v.rule}`).sort();
    expect(hit).toEqual([
      'CUT-13/IMG-FACE-BEHIND-REQ',   // `from behind` — directly behind 계약 미달
      'CUT-19/IMG-HAT-SHAPE',         // 관모 갓형 15컷(나노바나나 교정 대상)
      'CUT-21/IMG-HAT-NEGATION',      // `with no brim` — 부정 어휘 금지 위반
      'CUT-61/IMG-HAT-SHAPE',         // 관모 갓형 15컷(나노바나나 교정 대상)
    ]);
  });

  it('무인 컷 33컷 전량이 {STYLE_NOFIGURE}를 쓴다', () => {
    expect(cutsFor(result, 'IMG-NOFIGURE-TOKEN')).toEqual([]);
  });

  it('군상 다양성 어휘가 전수 충족된다 (03-assets §검증 ⑥ 7/7 달성)', () => {
    expect(cutsFor(result, 'IMG-CROWD-DIVERSITY')).toEqual([]);
  });

  it('MCU 단독·손 컷의 화풍 규약이 전수 선언돼 있다', () => {
    expect(cutsFor(result, 'IMG-CU-PORTRAIT-VARIANT')).toEqual([]);
    expect(cutsFor(result, 'IMG-CU-OIL-VOCAB')).toEqual([]);
    expect(cutsFor(result, 'IMG-HANDS-VARIANT')).toEqual([]);
    expect(cutsFor(result, 'IMG-CU-LIFELIKE-TAIL')).toEqual([]);
  });
});

describe.skipIf(!hasVault)('ep2 회귀 — 영상 측 결함(71회 재생성의 원인)을 S3 단계에서 잡는다', () => {
  const { result } = hasVault ? runFile(EP2) : { result: null };

  it('§프롬프트 계약 6의 "콘티 어휘 중화 4컷"을 전부 검출한다', () => {
    // 근거: CUT-03 inner darkness / CUT-51 in the darkness behind / CUT-60 ink darkens / CUT-62 solid dark shape
    const hit = cutsFor(result, 'VID-DARK-VOCAB');
    for (const cut of ['CUT-03', 'CUT-51', 'CUT-60', 'CUT-62']) expect(hit).toContain(cut);
  });

  it('§실증 C의 이동 함의어 실패 9컷 중 8컷 이상을 검출한다', () => {
    // 근거: 관모 교정 2차 1시도 실패 CUT-08·15·17·20·24·37·43·45·57
    const documented = ['CUT-08', 'CUT-15', 'CUT-17', 'CUT-20', 'CUT-24', 'CUT-37', 'CUT-43', 'CUT-45', 'CUT-57'];
    const hit = cutsFor(result, 'VID-MOTION-IMPLIED');
    const caught = documented.filter((c) => hit.includes(c));
    expect(caught.length).toBeGreaterThanOrEqual(8);
  });

  it('A2V 말미 암전을 유발한 시간 종점 호명(CUT-40)을 검출한다', () => {
    expect(cutsFor(result, 'VID-TIME-ENDPOINT')).toContain('CUT-40');
  });

  it('무효 억제 절(`with no change of pose` 등)을 부정문 규칙으로 검출한다', () => {
    // 근거: §실증 C-2 "같은 문장 안의 억제 절은 이동을 막지 못한다" + §실증 A(부정문 무효)
    expect(cutsFor(result, 'VID-NEG-001').length).toBeGreaterThanOrEqual(30);
  });

  it('A2V 6컷의 카메라 제한은 지켜져 있다 (계약 4)', () => {
    expect(cutsFor(result, 'VID-A2V-CAMERA')).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// C. 플래그 도출 단위 검사 (오탐 방지 회귀)
// ────────────────────────────────────────────────────────────────────────────

describe('플래그 도출 오탐 방지', () => {
  it('"B-3 인용" 같은 근거 표기를 군상으로 오인하지 않는다', () => {
    const flags = deriveFlags({ shot_type: 'CU(기기 엎어짐)', intent: '복선 심기. (고증: B-3 인용)', image_prompt: '{STYLE_NOFIGURE}, tight close-up of a bronze tilting vessel' });
    expect([...flags]).not.toContain('crowd');
  });

  it('"군상 없음" 선언 컷을 군상으로 오인하지 않는다', () => {
    const flags = deriveFlags({ shot_type: 'WS(종·북)', intent: '인물은 화면 밖. **군상 없음**.', image_prompt: '{STYLE_NOFIGURE}, wide night shot beneath a gate tower, deserted courtyard' });
    expect([...flags]).not.toContain('crowd');
  });

  it('목인(나무 인형) 관모는 갓 prior 규칙 대상에서 제외한다', () => {
    const flags = deriveFlags({ shot_type: 'ECU(목인 얼굴)', intent: '나무 인형', image_prompt: '{STYLE_NOFIGURE}, extreme close-up of a carved wooden figurine wearing a small lacquered official cap' });
    expect([...flags]).toContain('figurine');
  });

  it('소유격 손 서술은 hands로 잡되 인물 주어 위반은 아니다', () => {
    const res = runRecords([{
      id: 'H',
      kind: 'image',
      style_variant: 'hands-only',
      image_prompt: "{STYLE}, extreme close-up of a young man's bare hands gripping a wooden mallet, hand-painted oil painting with visible impasto brush strokes",
    }]);
    expect(errorsOf(res).map((v) => v.rule)).not.toContain('IMG-HANDS-SUBJECT');
  });
});
