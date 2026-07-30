#!/usr/bin/env node
/**
 * script-gate.mjs — 게이트 ②: 대본 QC 게이트 (S1/S2 산출물 기계 검사)
 *
 * 입력  : 대본 마크다운 경로(20-productions/<id>/01-script.md)
 * 출력  : 위반 목록(장면 · 규칙 ID · 심각도 · 근거 · 수정 제안)
 * 종료  : ERROR 1건 이상이면 non-zero exit
 *
 * 검사 항목
 *   A. 기계적 계약 — TTS lint / 훅 / 분량·길이 / 태그 전수 / 복선 회수 / 2인칭 / 나레이터 비중 / 화자 로스터
 *   B. 서사 구조   — through-line 선언·분포 / reorder test 근사 지표 / 장면별 정보 밀도
 *   C. 문장 품질   — 한국어 AI-티 패턴(내레이션 산문 한정, 실록 인용 낭독부 제외)
 *   D. 대사 품질   — 캐릭터 대사 전용(기계적 대구 / 구어 부적합 추상 한자어 / 주어 반복 /
 *                    정보 없는 추상 대사 연속 / 지시어 공전 / 화자 어투 불일치)
 *
 * 규율
 *   - 대본 원문 수정 금지(검사 전용).
 *   - 음절·길이 계산은 전부 결정론(정규식 한글 음절 카운트). LLM 산수 금지.
 *   - 규칙 데이터는 rules/script-rules.json · rules/script-style-patterns.json ·
 *     rules/script-dialogue-patterns.json으로 분리.
 *
 * 사용법
 *   node scripts/gates/script-gate.mjs <script.md> [옵션]
 *     --json                  기계 판독용 JSON 출력
 *     --strict-style          항목 C의 S1 패턴을 ERROR로 승격
 *     --strict-dialogue       항목 D의 핵심 규칙을 ERROR로 승격
 *     --require-through-line  through_line 미선언을 ERROR로 승격
 *     --sps=auto|design|sohee_min|sohee_max|clone   장면 길이 대조용 프로파일(기본 auto)
 *     --allow=RULE-ID[,...]   특정 규칙을 WARN으로 강등(승인본 유예용)
 *     --quiet                 요약만 출력
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseScript,
  parseForeshadowTable,
  parseThroughLine,
  parseFactTaggedSpeakers,
  countSyllables,
  isLiteraryQuoteSentence,
} from './lib/script-md-parser.mjs';
import {
  structuralSimilarity,
  collectDynamicProperNouns,
  concreteElements,
  isConcrete,
  classifyEnding,
  deixisCount,
  subjectTokens,
  isPresentTense,
  parseQuotedFactScope,
  normalizeForQuoteMatch,
} from './lib/script-dialogue.mjs';
import {
  sceneDuration,
  totalDuration,
  sceneStartTimes,
  firstOccurrenceTime,
  extractStems,
  titleKeywordStems,
  commaCount,
  stdev,
} from './lib/script-metrics.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEVERITY_ORDER = { ERROR: 0, WARN: 1, INFO: 2 };

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(HERE, rel), 'utf8'));
}

function round(n, d = 1) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

class Report {
  constructor(allow) {
    this.findings = [];
    this.allow = new Set(allow);
    this.stats = {};
  }

  add(severity, ruleId, scene, message, evidence, fix, lineNo = null) {
    let sev = severity;
    if (sev === 'ERROR' && this.allow.has(ruleId)) sev = 'WARN';
    this.findings.push({ severity: sev, ruleId, scene, message, evidence, fix, lineNo });
  }

  error(...a) { this.add('ERROR', ...a); }
  warn(...a) { this.add('WARN', ...a); }
  info(...a) { this.add('INFO', ...a); }

  get errorCount() { return this.findings.filter((f) => f.severity === 'ERROR').length; }
  get warnCount() { return this.findings.filter((f) => f.severity === 'WARN').length; }
  get infoCount() { return this.findings.filter((f) => f.severity === 'INFO').length; }
}

// ───────────────────────────────────────────────────────────── 항목 A

function checkTtsLint(doc, rules, report) {
  const cfg = rules.tts_lint;
  const forbidden = cfg.forbidden.map((f) => ({ ...f, re: new RegExp(f.pattern, 'g') }));

  for (const scene of doc.scenes) {
    for (const line of scene.speech) {
      for (const f of forbidden) {
        f.re.lastIndex = 0;
        const hits = line.text.match(f.re);
        if (hits && hits.length) {
          report.error(
            f.id,
            scene.id,
            `발화 라인에 ${f.label} ${hits.length}건`,
            `${line.speaker || '(화자 미표기)'}: …${hits.slice(0, 5).join(' ')}… / ${line.text.slice(0, 40)}`,
            'TTS 낭독 규약 — 숫자는 한글 독음, 로마자는 한글 표기, 따옴표·괄호는 삭제하고 화자 표기로 대체',
            line.lineNo,
          );
        }
      }
      for (const sentence of line.sentences) {
        const syl = countSyllables(sentence);
        if (syl > cfg.max_sentence_syllables) {
          report.error(
            'TTS-SENT-LEN',
            scene.id,
            `문장 ${syl}음절 (상한 ${cfg.max_sentence_syllables})`,
            sentence.slice(0, 60),
            '문장을 둘로 쪼갠다. 규칙 24(단문 리듬)와도 정합',
            line.lineNo,
          );
        }
        const commas = commaCount(sentence);
        if (commas > cfg.max_commas_per_sentence) {
          report.error(
            'TTS-COMMA',
            scene.id,
            `문장 쉼표 ${commas}개 (상한 ${cfg.max_commas_per_sentence})`,
            sentence.slice(0, 60),
            '쉼표는 TTS 호흡 지시다. 문장 분리로 호흡을 확보한다',
            line.lineNo,
          );
        }
      }
    }
  }
}

function checkHook(doc, rules, report, timing) {
  const cfg = rules.hook;
  const first = doc.scenes[0];
  if (!first) {
    report.error('HOOK-NO-SCENE', null, '장면이 하나도 파싱되지 않았다', '', '대본 장면 헤딩 형식(## 장면 01 (N01) — 제목) 확인');
    return;
  }
  const firstLine = first.speech[0];
  if (!firstLine) {
    report.error('HOOK-NO-SPEECH', first.id, '첫 장면에 발화 라인이 없다', '', '나레이션/대사 블록 확인');
  } else {
    const firstSentence = firstLine.sentences[0] || firstLine.text;
    const syl = countSyllables(firstSentence);
    if (syl > cfg.first_sentence_max_syllables) {
      report.error(
        'HOOK-FIRST-SENT',
        first.id,
        `첫 문장 ${syl}음절 (상한 ${cfg.first_sentence_max_syllables})`,
        firstSentence,
        '규칙 1 — 첫 문장은 사건 한복판의 짧은 발화로',
        firstLine.lineNo,
      );
    } else {
      report.info('HOOK-FIRST-SENT', first.id, `첫 문장 ${syl}음절 — 통과`, firstSentence, '');
    }
  }

  const coldOpenScenes = doc.scenes.slice(0, cfg.cold_open_scene_count);
  const banned = cfg.forbidden_cold_open_patterns.map((p) => new RegExp(p));
  for (const scene of coldOpenScenes) {
    for (const line of scene.speech) {
      for (const re of banned) {
        if (re.test(line.text)) {
          report.error(
            'HOOK-COLD-OPEN',
            scene.id,
            '콜드 오픈 구간에 인사·예고 화법 검출',
            `${re.source} → ${line.text.slice(0, 50)}`,
            '규칙 1 — 인사·예고 문장 전면 금지. in medias res로 진입',
            line.lineNo,
          );
        }
      }
    }
  }

  const keywords = titleKeywordStems(doc.titleCore);
  if (keywords.length === 0) {
    report.warn('HOOK-TITLE-KEYWORD', null, '제목에서 키워드 어간을 추출하지 못했다', doc.titleCore, 'H1 제목 형식 확인');
  } else {
    let best = null;
    for (const kw of keywords) {
      const hit = firstOccurrenceTime(doc.scenes, timing.starts, kw, timing.sps);
      if (hit && (!best || hit.seconds < best.seconds)) best = { ...hit, keyword: kw };
    }
    if (!best) {
      report.error(
        'HOOK-TITLE-KEYWORD',
        null,
        `제목 키워드(${keywords.join('·')})가 발화에 한 번도 등장하지 않는다`,
        doc.titleCore,
        '규칙 5 — 제목의 약속을 첫 30초 안에 재확인',
      );
    } else if (best.seconds > cfg.title_keyword_deadline_sec) {
      report.error(
        'HOOK-TITLE-KEYWORD',
        best.sceneId,
        `제목 키워드 "${best.keyword}" 최초 등장 ${round(best.seconds)}초 (마감 ${cfg.title_keyword_deadline_sec}초)`,
        `후보 키워드: ${keywords.join('·')}`,
        '규칙 5 — 훅 구간으로 키워드를 앞당긴다',
      );
    } else {
      report.info(
        'HOOK-TITLE-KEYWORD',
        best.sceneId,
        `제목 키워드 "${best.keyword}" 누적 ${round(best.seconds)}초 — 통과`,
        `후보 키워드: ${keywords.join('·')}`,
        '',
      );
    }
  }
}

function computeTiming(doc, rules, spsOption) {
  const d = rules.duration;
  const profiles = d.sps_profiles;
  const declaredTotal = Number(doc.frontmatter.estimated_duration);

  const totals = {};
  for (const [name, sps] of Object.entries(profiles)) {
    totals[name] = totalDuration(doc.scenes, sps, d.scene_pause_sec, d.ending_margin_sec);
  }

  let chosen = spsOption;
  if (!chosen || chosen === 'auto') {
    if (Number.isFinite(declaredTotal)) {
      chosen = Object.keys(totals).reduce((a, b) =>
        Math.abs(totals[a] - declaredTotal) <= Math.abs(totals[b] - declaredTotal) ? a : b,
      );
    } else {
      chosen = d.gate_profiles[0];
    }
  }
  const sps = profiles[chosen];
  return {
    profiles,
    totals,
    chosen,
    sps,
    declaredTotal,
    starts: sceneStartTimes(doc.scenes, sps, d.scene_pause_sec),
    pause: d.scene_pause_sec,
    margin: d.ending_margin_sec,
  };
}

function checkLength(doc, rules, report, timing) {
  const d = rules.duration;
  const totalSyl = doc.scenes.reduce((a, s) => a + s.syllables, 0);
  report.stats.syllables = totalSyl;
  report.stats.sceneCount = doc.scenes.length;
  report.stats.durations = Object.fromEntries(
    Object.entries(timing.totals).map(([k, v]) => [k, round(v)]),
  );
  report.stats.spsProfileUsed = timing.chosen;

  // 프론트매터 음절 수 대조
  const declaredSyl = Number(doc.frontmatter.syllable_count);
  if (Number.isFinite(declaredSyl) && declaredSyl !== totalSyl) {
    report.warn(
      'LEN-SYL-DECL',
      null,
      `frontmatter syllable_count(${declaredSyl}) ≠ 계산값(${totalSyl})`,
      `차이 ${totalSyl - declaredSyl}음절`,
      '대본 수정 후 파생 수치 필드를 재계산하지 않았을 가능성. 게이트 계산값이 원천',
    );
  }

  // 길이 게이트 — 실측 보정 대역 전체가 게이트 안에 들어와야 한다
  for (const name of d.gate_profiles) {
    const sec = timing.totals[name];
    if (sec < d.gate_min_sec || sec > d.gate_max_sec) {
      report.error(
        'LEN-DURATION-BAND',
        null,
        `실측 보정(${name}=${timing.profiles[name]}음절/초) 길이 ${round(sec)}초 — 게이트 ${d.gate_min_sec}~${d.gate_max_sec}초 이탈`,
        `총 ${totalSyl}음절 / ${doc.scenes.length}장면 / 휴지 ${d.scene_pause_sec}초 · 마진 ${d.ending_margin_sec}초`,
        sec < d.gate_min_sec
          ? `음절을 ${Math.ceil((d.gate_min_sec - sec) * timing.profiles[name])}음절 이상 증량하라(설계식 3.8 기준이 아니라 실측 보정 기준으로 재설계)`
          : `음절을 ${Math.ceil((sec - d.gate_max_sec) * timing.profiles[name])}음절 이상 트림하라`,
      );
    } else {
      report.info('LEN-DURATION-BAND', null, `${name} 길이 ${round(sec)}초 — 통과`, '', '');
    }
  }

  // 선언 총길이 대조
  if (Number.isFinite(timing.declaredTotal)) {
    const anyMatch = Object.values(timing.totals).some(
      (v) => Math.abs(v - timing.declaredTotal) <= d.declared_total_tolerance_sec,
    );
    if (!anyMatch) {
      report.warn(
        'LEN-TOTAL-DECL',
        null,
        `frontmatter estimated_duration(${timing.declaredTotal}초)이 어떤 sps 프로파일 산출과도 맞지 않는다`,
        Object.entries(timing.totals).map(([k, v]) => `${k}=${round(v)}`).join(' · '),
        '길이 산출 모델을 머리 메모에 명시하고 파생 필드를 재계산하라',
      );
    }
  }

  // 장면별 선언 길이 대조
  for (let i = 0; i < doc.scenes.length; i += 1) {
    const scene = doc.scenes[i];
    if (scene.declaredDuration == null) {
      report.warn('LEN-SCENE-DECL', scene.id, '예상 길이 필드 누락', '', '- **예상 길이**: N.N초 형식으로 기재');
      continue;
    }
    const computed = sceneDuration(scene.syllables, timing.sps, timing.pause);
    if (Math.abs(computed - scene.declaredDuration) > d.declared_scene_tolerance_sec) {
      report.warn(
        'LEN-SCENE-DECL',
        scene.id,
        `예상 길이 선언 ${scene.declaredDuration}초 ≠ 계산 ${round(computed, 1)}초 (${timing.chosen})`,
        `${scene.syllables}음절 ÷ ${timing.sps} + ${timing.pause}`,
        '장면 개정 후 예상 길이 필드를 재계산하지 않은 흔적. 검증표 장면별 산출과도 대조하라',
        scene.lineNo,
      );
    }
  }

  const cfg = rules.scene_count.profiles[doc.format] || rules.scene_count.default;
  if (doc.scenes.length < cfg.min || doc.scenes.length > cfg.max) {
    report.warn(
      'LEN-SCENE-COUNT',
      null,
      `장면 수 ${doc.scenes.length} — 형식(${doc.format || '미상'}) 목표 ${cfg.min}~${cfg.max}`,
      '',
      '컷 정합 목적의 장면 세분화 기준 확인',
    );
  }
}

function checkTags(doc, rules, report) {
  const evidenceRes = rules.tags.evidence_patterns.map((p) => new RegExp(p));
  for (const scene of doc.scenes) {
    const block = scene.tagBlock || '';
    if (!block.trim()) {
      report.error(
        'TAG-BLOCK-MISSING',
        scene.id,
        '대사 태그 블록 없음',
        '',
        '전 장면에 - **대사 태그**: 항목을 기재하고 [사실]/[각색]을 전수 표기',
        scene.lineNo,
      );
      continue;
    }
    const hasFact = block.includes('[사실]');
    const hasFiction = block.includes('[각색]');
    if (!hasFact && !hasFiction) {
      report.error(
        'TAG-MARKER-MISSING',
        scene.id,
        '대사 태그 블록에 [사실]/[각색] 표기가 없다',
        block.slice(0, 60),
        '장면 내 발화를 [사실]/[각색]으로 전수 분류',
        scene.lineNo,
      );
    }
    if (hasFact) {
      const hasEvidence = evidenceRes.some((re) => re.test(block));
      if (!hasEvidence) {
        report.error(
          'TAG-FACT-EVIDENCE',
          scene.id,
          '[사실] 태그에 근거 기사 ID·자료 링크가 없다',
          block.slice(0, 80),
          '기사 ID(wda_########_###) 또는 05-sources 위키링크 또는 발췌 코드(A-1 등)를 명기',
          scene.lineNo,
        );
      }
    }
  }
}

function checkForeshadow(doc, rules, report) {
  const table = parseForeshadowTable(doc.headMemo);
  const sceneIds = new Set(doc.scenes.map((s) => s.id));
  if (!table) {
    report.error(
      'FS-TABLE-MISSING',
      null,
      '머리 메모에 복선 표가 없다',
      '',
      '규칙 11 — `> **복선 표(규칙 11 — 심기/회수)**: ① 라벨: N03 심기 → N11 회수` 형식으로 선언',
    );
    return;
  }
  report.stats.foreshadowCount = table.items.length;
  for (const item of table.items) {
    if (item.plants.length === 0) {
      report.warn('FS-NO-PLANT', null, `복선 "${item.label}"에 심기 장면 표기가 없다`, item.raw.slice(0, 70), '심기 장면을 N## 로 명기');
    }
    if (item.payoffs.length === 0) {
      report.error(
        'FS-NO-PAYOFF',
        null,
        `복선 "${item.label}" 미회수 — 회수 장면 표기 없음`,
        item.raw.slice(0, 70),
        '규칙 11 — 회수되지 않는 복선은 퇴고에서 삭제하거나 회수 장면을 만든다',
      );
    }
    for (const id of [...item.plants, ...item.payoffs]) {
      if (!sceneIds.has(id)) {
        report.error(
          'FS-SCENE-MISSING',
          id,
          `복선 "${item.label}"이 존재하지 않는 장면 ${id}을 참조한다`,
          item.raw.slice(0, 70),
          '장면 번호 재확인(장면 재편 후 복선 표 미갱신 가능성)',
        );
      }
    }
    // 심기 → 회수 순서
    for (const p of item.plants) {
      for (const q of item.payoffs) {
        if (sceneIds.has(p) && sceneIds.has(q) && Number(q.slice(1)) < Number(p.slice(1))) {
          report.error(
            'FS-ORDER',
            q,
            `복선 "${item.label}" 회수(${q})가 심기(${p})보다 앞선다`,
            item.raw.slice(0, 70),
            '심기/회수 장면 순서를 바로잡는다',
          );
        }
      }
    }
  }
}

function checkPerson(doc, rules, report) {
  const cfg = rules.person;
  const res = cfg.second_person_patterns.map((p) => new RegExp(p, 'g'));
  let count = 0;
  const hits = [];
  for (const scene of doc.scenes) {
    for (const line of scene.speech) {
      for (const re of res) {
        re.lastIndex = 0;
        const m = line.text.match(re);
        if (m) {
          count += m.length;
          hits.push(`${scene.id}:${m[0]}`);
        }
      }
    }
  }
  report.stats.secondPerson = count;
  if (count > cfg.second_person_max) {
    report.error(
      'PERSON-2ND-LIMIT',
      null,
      `2인칭 ${count}회 (상한 ${cfg.second_person_max})`,
      hits.join(' · '),
      '규칙 22 — 2인칭 끌어들이기는 전략 지점에서만. 효과 보존을 위해 감축',
    );
  } else {
    report.info('PERSON-2ND-LIMIT', null, `2인칭 ${count}회 — 통과`, hits.join(' · '), '');
  }
  // 현재형은 형식별 기본 시제가 달라(픽션 드라마는 현재형이 기본) 자동 상한 판정 대상에서 제외한다.
  report.info(
    'PERSON-PRESENT-TENSE',
    null,
    '현재형 사용 횟수는 자동 판정 제외 — 형식별 기본 시제가 다르다(픽션 드라마=현재형 기본)',
    '',
    '인간 판단 잔존 항목',
  );
}

function checkNarratorShare(doc, rules, report) {
  const narrator = rules.narrator_name;
  let narratorSyl = 0;
  let totalSyl = 0;
  const bySpeaker = {};
  for (const scene of doc.scenes) {
    for (const line of scene.speech) {
      totalSyl += line.syllables;
      const sp = line.speaker || '(미표기)';
      bySpeaker[sp] = (bySpeaker[sp] || 0) + line.syllables;
      if (sp === narrator) narratorSyl += line.syllables;
    }
  }
  const share = totalSyl > 0 ? narratorSyl / totalSyl : 0;
  report.stats.narratorShare = round(share * 100, 1);
  report.stats.speakerSyllables = bySpeaker;

  const cfg = rules.narrator_share.profiles[doc.format] || rules.narrator_share.default;
  if (share < cfg.min || share > cfg.max) {
    report.error(
      'NARR-SHARE',
      null,
      `나레이터 발화 비중 ${round(share * 100, 1)}% — 형식(${doc.format || '미상'}) 목표 ${round(cfg.min * 100)}~${round(cfg.max * 100)}%`,
      `내레이터 ${narratorSyl}음절 / 전체 ${totalSyl}음절`,
      share > cfg.max
        ? '나레이션을 캐릭터 대사로 번역하라(형식 교차 원칙)'
        : '나레이션 접착제를 보강하라',
    );
  } else {
    report.info(
      'NARR-SHARE',
      null,
      `나레이터 비중 ${round(share * 100, 1)}% — 통과 (형식 ${doc.format || '미상'})`,
      `내레이터 ${narratorSyl} / 전체 ${totalSyl}음절`,
      '',
    );
  }
}

function nameMatches(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function checkRoster(doc, rules, report) {
  const rosterKey = Object.keys(doc.headMemo).find((k) =>
    new RegExp(rules.roster.head_memo_key_pattern).test(k),
  );
  const rosterText = rosterKey ? doc.headMemo[rosterKey] : '';
  if (!rosterText) {
    report.warn('ROSTER-HEAD-MISSING', null, '머리 메모에 화자 로스터 선언이 없다', '', 'S5 보이스 배정 근거가 되는 화자 로스터를 머리 메모에 명기');
  }

  for (const scene of doc.scenes) {
    if (scene.speakers.length === 0) {
      report.error('ROSTER-SCENE-FIELD', scene.id, '화자 필드 없음', '', '- **화자**: 형식으로 장면 화자 명기', scene.lineNo);
      continue;
    }
    for (const line of scene.speech) {
      if (!line.speaker) {
        report.warn(
          'ROSTER-NO-SPEAKER',
          scene.id,
          '발화 라인에 화자 표기가 없다',
          line.text.slice(0, 40),
          '`- 화자명: 본문` 형식으로 통일(다중 보이스 배정의 기계 판독 근거)',
          line.lineNo,
        );
        continue;
      }
      const inScene = scene.speakers.some((s) => nameMatches(s, line.speaker));
      if (!inScene) {
        report.error(
          'ROSTER-SCENE-MISMATCH',
          scene.id,
          `발화 화자 "${line.speaker}"가 장면 화자 필드에 없다`,
          `화자 필드: ${scene.speakers.join(' + ')}`,
          '화자 필드와 실제 발화 화자를 일치시킨다(S5 보이스 배정 누락 방지)',
          line.lineNo,
        );
      }
      if (rosterText && !rosterText.includes(line.speaker)) {
        const loose = scene.speakers.some((s) => nameMatches(s, line.speaker) && rosterText.includes(s));
        if (!loose) {
          report.warn(
            'ROSTER-UNDECLARED',
            scene.id,
            `화자 "${line.speaker}"가 머리 메모 화자 로스터에 없다`,
            '',
            '보이스 로스터에 추가하거나 기존 보이스 겸용을 명시',
            line.lineNo,
          );
        }
      }
    }
  }
}

// ───────────────────────────────────────────────────────────── 항목 B

function sceneFullText(scene) {
  return `${scene.speech.map((l) => l.text).join(' ')} ${scene.visual || ''}`;
}

function checkThroughLine(doc, rules, report, opts) {
  const cfg = rules.through_line;
  const tl = parseThroughLine(doc.headMemo);

  if (!tl) {
    const sev = opts.requireThroughLine ? 'ERROR' : 'WARN';
    report.add(
      sev,
      'TL-UNDECLARED',
      null,
      'through_line 선언 필드가 없다(게이트 ② 신설 규약)',
      '',
      `대본 머리 메모에 다음 형식으로 선언: ${cfg.declaration_format}`,
    );
    // 선언을 돕는 후보 제시(결정론) — 여러 장면에 걸쳐 반복되는 어간.
    // 후보는 발화문에서만 뽑는다(화면 지시의 카메라 어휘가 후보를 오염시키지 않도록).
    const stopwords = new Set([...rules.stopwords, ...(cfg.candidate_stopwords || [])]);
    const candidateText = (s) =>
      cfg.candidate_source === 'speech' ? s.speech.map((l) => l.text).join(' ') : sceneFullText(s);
    const perScene = doc.scenes.map((s) => new Set(extractStems(candidateText(s), stopwords)));
    const spread = new Map();
    for (const set of perScene) {
      for (const stem of set) spread.set(stem, (spread.get(stem) || 0) + 1);
    }
    const candidates = [...spread.entries()]
      .filter(([, n]) => n >= cfg.candidate_min_scenes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, cfg.candidate_report_count)
      .map(([stem, n]) => `${stem}(${n}장면)`);
    if (candidates.length) {
      report.info('TL-CANDIDATE', null, 'through-line 사물 후보(장면 분포 상위)', candidates.join(' · '), '물리적 사물 1개를 골라 선언하라 — 인간 승인 사항');
    }
    return;
  }

  report.stats.throughLine = tl.object;
  if (!tl.object) {
    report.error('TL-NO-OBJECT', null, 'through_line 선언에 물건= 항목이 없다', tl.raw, cfg.declaration_format);
    return;
  }

  const appearing = doc.scenes.filter((s) => sceneFullText(s).includes(tl.object));
  if (appearing.length < cfg.min_scene_occurrences) {
    report.error(
      'TL-MULTI-SCENE',
      null,
      `through-line 사물 "${tl.object}"가 ${appearing.length}개 장면에만 등장 (최소 ${cfg.min_scene_occurrences})`,
      appearing.map((s) => s.id).join('·') || '(없음)',
      '사물을 복수 장면에 배치하거나 다른 사물을 through-line으로 지정',
    );
  } else {
    report.info(
      'TL-MULTI-SCENE',
      null,
      `through-line "${tl.object}" ${appearing.length}개 장면 등장 — 통과`,
      appearing.map((s) => s.id).join('·'),
      '',
    );
  }

  // 역할 단조 증가: 심기 → 상승 → 페이오프 순서가 엄격 증가하고 각 장면에 실제 등장
  const chain = [tl.plant, ...tl.escalations, tl.payoff].filter(Boolean);
  const sceneById = new Map(doc.scenes.map((s) => [s.id, s]));
  for (let i = 1; i < chain.length; i += 1) {
    if (Number(chain[i].slice(1)) <= Number(chain[i - 1].slice(1))) {
      report.error(
        'TL-MONOTONIC',
        chain[i],
        `through-line 역할 사슬이 단조 증가하지 않는다 (${chain[i - 1]} → ${chain[i]})`,
        tl.raw,
        '심기 → 상승 → 페이오프를 장면 순서대로 배치(중요도·긴장이 단조 증가해야 한다)',
      );
    }
  }
  for (const id of chain) {
    const scene = sceneById.get(id);
    if (!scene) {
      report.error('TL-SCENE-MISSING', id, `through-line이 존재하지 않는 장면 ${id}을 참조`, tl.raw, '장면 번호 재확인');
    } else if (!sceneFullText(scene).includes(tl.object)) {
      report.error(
        'TL-ROLE-ABSENT',
        id,
        `through-line 사물 "${tl.object}"가 선언된 장면 ${id}에 등장하지 않는다`,
        scene.title,
        '해당 장면 발화 또는 화면 지시에 사물을 명시하라',
        scene.lineNo,
      );
    }
  }

  if (!tl.payoff) {
    report.error('TL-NO-PAYOFF', null, 'through_line 선언에 페이오프= 항목이 없다', tl.raw, cfg.declaration_format);
  } else {
    const idx = doc.scenes.findIndex((s) => s.id === tl.payoff);
    const frac = idx >= 0 ? idx / doc.scenes.length : -1;
    if (frac >= 0 && frac < 1 - cfg.payoff_last_fraction) {
      report.warn(
        'TL-PAYOFF-POSITION',
        tl.payoff,
        `페이오프 장면이 후반부(마지막 ${Math.round(cfg.payoff_last_fraction * 100)}%) 밖에 있다`,
        `${tl.payoff} = ${idx + 1}/${doc.scenes.length}번째 장면`,
        '해소는 클라이맥스 이후에 배치',
      );
    }
  }
}

function findClimaxIndex(doc, rules) {
  const res = rules.reorder_test.climax_marker_patterns.map((p) => new RegExp(p));
  for (let i = doc.scenes.length - 1; i >= 0; i -= 1) {
    const s = doc.scenes[i];
    const hay = `${s.title} ${s.memo}`;
    if (res.some((re) => re.test(hay))) return i;
  }
  return doc.scenes.length - 1;
}

function checkReorderAndDensity(doc, rules, report) {
  const cfg = rules.reorder_test;
  const stopwords = new Set(rules.stopwords);
  const backRes = cfg.back_reference_patterns.map((p) => new RegExp(p));

  const seen = new Set();
  const newStemsPerScene = [];
  for (const scene of doc.scenes) {
    const speechText = scene.speech.map((l) => l.text).join(' ');
    const stems = extractStems(speechText, stopwords);
    const fresh = [];
    for (const stem of stems) {
      if (!seen.has(stem)) {
        seen.add(stem);
        fresh.push(stem);
      }
    }
    newStemsPerScene.push(fresh);
  }

  const climaxIdx = findClimaxIndex(doc, rules);
  const buildStart = Math.max(cfg.build_zone_start_scene - 1, 0);
  report.stats.buildZone = `${doc.scenes[buildStart]?.id || '-'}~${doc.scenes[Math.max(climaxIdx - 1, buildStart)]?.id || '-'}`;

  for (let i = 0; i < doc.scenes.length; i += 1) {
    const scene = doc.scenes[i];
    const fresh = newStemsPerScene[i];

    // 정보 밀도 — 전 장면 대상
    if (fresh.length < rules.density.min_new_stems) {
      report.warn(
        'DENS-ZERO-NEW',
        scene.id,
        `신규 고유명사·수치 어간 ${fresh.length}건 — 정보 밀도 0에 가깝다`,
        scene.title,
        '규칙 10 — 장면마다 새 정보를 하나는 얹어라. 없다면 장면 통합을 검토',
        scene.lineNo,
      );
    }

    // reorder test — 빌드 구간만
    if (i < buildStart || i >= climaxIdx) continue;
    const speechText = scene.speech.map((l) => l.text).join(' ');
    const hasBackRef = backRes.some((re) => re.test(speechText));
    const hasNewInfo = fresh.length >= cfg.new_info_min_stems;
    if (!hasBackRef && !hasNewInfo) {
      report.warn(
        'RO-REORDERABLE',
        scene.id,
        '빌드 구간 장면이 ①직전 결과 참조 ②새 정보 도입 둘 다 없다 — 재배치 가능(나열 의심)',
        `역참조 ${hasBackRef} / 신규 어간 ${fresh.length}건`,
        '직전 장면의 결과를 받는 지시어·인과 접속을 넣거나, 새 고유명사·수치를 도입해 상승을 만든다',
        scene.lineNo,
      );
    } else {
      report.info(
        'RO-REORDERABLE',
        scene.id,
        `빌드 구간 통과 — 역참조 ${hasBackRef ? 'O' : 'X'} / 신규 어간 ${fresh.length}건`,
        '',
        '',
      );
    }
  }
}

// ───────────────────────────────────────────────────────────── 항목 C

function collectStyleTargets(doc, style, rules) {
  const scopeSpeakers = new Set(style.scope.speakers);
  const targets = [];
  for (const scene of doc.scenes) {
    const factSpeakers = style.scope.exclude_fact_tagged_speakers
      ? parseFactTaggedSpeakers(scene)
      : new Set();
    for (const line of scene.speech) {
      const speaker = line.speaker || rules.narrator_name;
      if (!scopeSpeakers.has(speaker)) continue;
      if (style.scope.exclude_fact_tagged_speakers) {
        // [사실] 태그가 붙은 캐릭터 대사는 원문 보존 대상 — 검사 제외.
        // 내레이터는 [사실] 근거 서술도 우리 산문이므로 문장 단위(인용 낭독)로만 제외한다.
        if (speaker !== rules.narrator_name && factSpeakers.has(speaker)) continue;
      }
      for (const sentence of line.sentences) {
        if (style.scope.exclude_literary_quote_sentences && isLiteraryQuoteSentence(sentence)) {
          continue;
        }
        targets.push({ scene, line, sentence });
      }
    }
  }
  return targets;
}

function checkStyle(doc, style, rules, report, opts) {
  const targets = collectStyleTargets(doc, style, rules);
  report.stats.styleSentences = targets.length;
  report.stats.styleSyllables = targets.reduce((a, t) => a + countSyllables(t.sentence), 0);

  const promote = new Set(opts.strictStyle ? style.strict_promotes_to_error : []);
  const sevOf = (p) => (promote.has(p.severity) ? 'ERROR' : style.severity_default);

  for (const pattern of style.patterns) {
    if (pattern.custom === 'sentence_length_stdev') {
      const lens = targets.map((t) => countSyllables(t.sentence));
      const sd = stdev(lens);
      report.stats.sentenceSyllableStdev = round(sd, 2);
      if (lens.length >= 8 && sd < pattern.min_stdev) {
        report.add(sevOf(pattern), pattern.id, null, `${pattern.label} — 표준편차 ${round(sd, 2)} (하한 ${pattern.min_stdev})`, `문장 ${lens.length}개`, pattern.fix);
      }
      continue;
    }
    if (pattern.custom === 'possessive_chain') {
      for (const t of targets) {
        const chain = (t.sentence.match(/[가-힣]의(?=[\s가-힣])/g) || []).length;
        if (chain >= pattern.min_chain) {
          report.add(sevOf(pattern), pattern.id, t.scene.id, `${pattern.label} — 한 문장에 '의' ${chain}회`, t.sentence.slice(0, 60), pattern.fix, t.line.lineNo);
        }
      }
      continue;
    }
    if (pattern.scope === 'sequence') {
      const seq = pattern.sequence;
      let cursor = 0;
      const marks = [];
      for (const t of targets) {
        if (cursor < seq.length && t.sentence.includes(seq[cursor])) {
          marks.push(`${t.scene.id}:${seq[cursor]}`);
          cursor += 1;
        }
      }
      if (cursor >= seq.length) {
        report.add(sevOf(pattern), pattern.id, null, pattern.label, marks.join(' → '), pattern.fix);
      }
      continue;
    }

    const res = (pattern.patterns || []).map((p) => new RegExp(p, 'g'));
    const excludeRes = (pattern.exclude || []).map((p) => new RegExp(p));
    const excluded = (sentence) => excludeRes.some((re) => re.test(sentence));

    if (pattern.scope === 'scene') {
      for (const scene of doc.scenes) {
        const sceneTargets = targets.filter((t) => t.scene.id === scene.id);
        let n = 0;
        const ev = [];
        for (const t of sceneTargets) {
          if (excluded(t.sentence)) continue;
          for (const re of res) {
            re.lastIndex = 0;
            const m = t.sentence.match(re);
            if (m) { n += m.length; ev.push(...m); }
          }
        }
        if (n >= pattern.threshold) {
          report.add(sevOf(pattern), pattern.id, scene.id, `${pattern.label} — 장면 내 ${n}회 (임계 ${pattern.threshold})`, ev.slice(0, 8).join(' · '), pattern.fix, scene.lineNo);
        }
      }
      continue;
    }

    // 기본: 문서 전체 누적 카운트(문장 단위 매칭)
    let total = 0;
    const evidence = [];
    for (const t of targets) {
      if (excluded(t.sentence)) continue;
      for (const re of res) {
        re.lastIndex = 0;
        const m = t.sentence.match(re);
        if (m) {
          total += m.length;
          if (evidence.length < 8) evidence.push(`${t.scene.id}: …${t.sentence.slice(0, 44)}…`);
        }
      }
    }
    if (total >= pattern.threshold) {
      report.add(
        sevOf(pattern),
        pattern.id,
        null,
        `${pattern.label} — ${total}회 (임계 ${pattern.threshold})`,
        evidence.join(' | '),
        pattern.fix,
      );
    }
  }
}

// ───────────────────────────────────────────────────────────── 항목 D (대사 전용)

/**
 * 규칙 데이터(JSON)를 정규식·집합으로 한 번만 컴파일한다.
 * 임계값·사전은 전부 rules/script-dialogue-patterns.json이 원천 — 여기에 하드코딩하지 않는다.
 */
function buildDialogueContext(doc, dlg) {
  const c = dlg.concreteness;
  const noConcrete = dlg.rules.find((r) => r.id === 'DLG-NO-CONCRETE');
  const vague = dlg.rules.find((r) => r.id === 'DLG-VAGUE-REFERENT');
  const subjRule = dlg.rules.find((r) => r.id === 'DLG-SUBJECT-REPEAT');

  return {
    concreteness: c,
    properNouns: collectDynamicProperNouns(doc, c),
    properNounRes: c.proper_noun_patterns.map((p) => new RegExp(p)),
    numeralRes: c.numeral_patterns.map((p) => new RegExp(p)),
    actionVerbRes: c.action_verb_patterns.map((p) => new RegExp(p)),
    objectExclusionRes: (c.object_noun_exclusions?.patterns || []).map((p) => new RegExp(p, 'g')),
    endingOrder: dlg.endings.order,
    endingRes: Object.fromEntries(
      Object.entries(dlg.endings.classes).map(([k, v]) => [k, v.map((p) => new RegExp(p))]),
    ),
    deixisRes: vague.detect.deixis_patterns.map((p) => new RegExp(p, 'g')),
    deixisExclusions: vague.detect.deixis_exclusions,
    subjectLexicon: subjRule.detect.subject_lexicon,
    subjectPrefix: subjRule.detect.subject_lexeme_prefix || '',
    subjectParticle: subjRule.detect.subject_particle_pattern,
    presentTense: subjRule.detect.present_tense,
    presentTenseRes: subjRule.detect.present_tense.terminal_patterns.map((p) => new RegExp(p)),
    noConcreteCfg: noConcrete.detect,
  };
}

/** 화자별 어투 프로파일 해석 — JSON 명시 프로파일 우선, 없으면 머리 메모 로스터에서 유도. */
function resolveRegisterProfiles(doc, dlg) {
  const cfg = dlg.register_profiles;
  const explicit = cfg.profiles.map((p) => ({ ...p, re: new RegExp(p.match) }));

  const derived = new Map();
  const dcfg = cfg.derive_from_head_memo;
  if (dcfg) {
    const key = Object.keys(doc.headMemo).find((k) => new RegExp(dcfg.roster_key_pattern).test(k));
    if (key) {
      const raw = doc.headMemo[key];
      for (const m of raw.matchAll(/([가-힣[\]]{2,12})\s*[（(]([^)）]*)[)）]/g)) {
        const name = m[1].replace(/[[\]]/g, '').replace(/^[^가-힣]*/, '').trim();
        const desc = m[2];
        for (const [kw, cls] of Object.entries(dcfg.keyword_map)) {
          if (desc.includes(kw)) {
            if (!derived.has(name)) derived.set(name, new Set());
            derived.get(name).add(cls);
          }
        }
      }
    }
  }

  return (speaker) => {
    for (const p of explicit) {
      if (p.re.test(speaker)) return { label: p.label, allowed: new Set([...p.primary, ...p.alt]), primary: new Set(p.primary), source: 'rules' };
    }
    for (const [name, set] of derived) {
      if (name && (speaker.includes(name) || name.includes(speaker))) {
        return { label: `머리 메모 로스터 유도(${[...set].join('·')})`, allowed: new Set(set), primary: new Set(set), source: 'head_memo' };
      }
    }
    return null;
  };
}

/**
 * 검사 대상 대사 스트림을 만든다.
 * 제외: 내레이터 / 문면이 실록 인용인 [사실] 대사(화자 단위·문장 단위) / 초단문 응답(예·네).
 */
function collectDialogueTargets(doc, dlg, rules) {
  const excludeSpeakers = new Set(dlg.scope.exclude_speakers);
  const exemptSet = new Set(dlg.scope.exempt_short_utterances);
  const scenes = [];

  for (const scene of doc.scenes) {
    const quoted = parseQuotedFactScope(scene, dlg.scope);
    const entries = [];
    for (const line of scene.speech) {
      const speaker = line.speaker || rules.narrator_name;
      const isNarrator = excludeSpeakers.has(speaker);
      const speakerExcluded =
        dlg.scope.exclude_fact_tagged_speakers && quoted.speakers.has(speaker);

      const sentences = [];
      for (const sentence of line.sentences) {
        const norm = normalizeForQuoteMatch(sentence);
        if (dlg.scope.exclude_fact_quoted_sentences && quoted.sentences.has(norm)) continue;
        sentences.push(sentence);
      }

      const bare = String(line.text).replace(/[.!?…\s]/g, '');
      const isExempt =
        exemptSet.has(bare) || countSyllables(line.text) <= dlg.scope.exempt_max_syllables;

      entries.push({
        scene,
        line,
        speaker,
        sentences,
        isNarrator,
        excluded: isNarrator || speakerExcluded || sentences.length === 0,
        exempt: isExempt,
      });
    }
    scenes.push({ scene, entries, quoted });
  }
  return scenes;
}

function checkDialogue(doc, dlg, rules, report, opts) {
  const ctx = buildDialogueContext(doc, dlg);
  const profileOf = resolveRegisterProfiles(doc, dlg);
  const streams = collectDialogueTargets(doc, dlg, rules);
  const byId = Object.fromEntries(dlg.rules.map((r) => [r.id, r]));

  const promote = new Set(opts.strictDialogue ? dlg.strict_promotes_to_error : []);
  const sevOf = (ruleId, fallback) => {
    const base = fallback || dlg.severity_default;
    if (base === 'INFO') return 'INFO';
    return promote.has(ruleId) ? 'ERROR' : base;
  };

  const active = streams.flatMap((s) => s.entries.filter((e) => !e.excluded));
  report.stats.dialogueLines = active.length;
  report.stats.dialogueSentences = active.reduce((a, e) => a + e.sentences.length, 0);
  report.stats.dialogueSyllables = active.reduce((a, e) => a + countSyllables(e.line.text), 0);
  report.stats.dialogueExcludedLines = streams.flatMap((s) => s.entries.filter((e) => e.excluded && !e.isNarrator)).length;
  report.stats.dialogueFindings = {};

  const bump = (id) => {
    report.stats.dialogueFindings[id] = (report.stats.dialogueFindings[id] || 0) + 1;
  };

  for (const { scene, entries } of streams) {
    // 대사 스트림(내레이터·제외 라인이 끊는다) — 문장 단위
    const sentStream = [];
    for (const e of entries) {
      if (e.excluded) {
        sentStream.push(null); // 스트림 절단 마커
        continue;
      }
      if (e.exempt) continue; // 초단문 응답은 투명 통과
      for (const s of e.sentences) sentStream.push({ entry: e, sentence: s });
    }

    // ── DLG-PARALLEL — 동일 화자 인접 문장의 구조 과잉 대칭
    const pr = byId['DLG-PARALLEL'];
    for (let i = 0; i + 1 < sentStream.length; i += 1) {
      const a = sentStream[i];
      const b = sentStream[i + 1];
      if (!a || !b) continue;
      if (pr.detect.same_speaker_only && a.entry.speaker !== b.entry.speaker) continue;
      const sim = structuralSimilarity(a.sentence, b.sentence, pr.detect);
      if (sim.score < pr.detect.similarity_threshold) continue;
      const bothConcrete = isConcrete(a.sentence, ctx) && isConcrete(b.sentence, ctx);
      const severity = pr.detect.downgrade_to_info_if_concrete && bothConcrete
        ? 'INFO'
        : sevOf(pr.id, pr.severity);
      if (severity !== 'INFO') bump(pr.id);
      report.add(
        severity,
        pr.id,
        scene.id,
        `${pr.label} — 유사도 ${round(sim.score, 2)} (임계 ${pr.detect.similarity_threshold})${bothConcrete ? ' · 구체 요소 있음 → 의도된 리듬 가능' : ''}`,
        `${a.entry.speaker}: ${a.sentence} ⟂ ${b.sentence} [어절 ${sim.parts.tokens} · 말음일치 ${sim.parts.tail} · 종결일치 ${sim.parts.ending}]`,
        pr.fix,
        a.entry.line.lineNo,
      );
    }

    // ── DLG-ABSTRACT-HANJA — 구어 부적합 추상 한자어
    const ah = byId['DLG-ABSTRACT-HANJA'];
    const whitelist = ah.whitelist.terms;
    const stripWhite = (s) => {
      let t = String(s);
      for (const w of whitelist) t = t.split(w).join(' ');
      return t;
    };
    const tier2Hits = [];
    for (const item of sentStream) {
      if (!item) continue;
      const stripped = stripWhite(item.sentence);
      const t1 = ah.lexicon_tier1.filter((w) => stripped.includes(w));
      if (t1.length >= ah.detect.threshold) {
        bump(ah.id);
        report.add(
          sevOf(ah.id, ah.severity),
          ah.id,
          scene.id,
          `${ah.label} — ${t1.join('·')}`,
          `${item.entry.speaker}: ${item.sentence}`,
          ah.fix,
          item.entry.line.lineNo,
        );
      }
      const t2 = ah.lexicon_tier2.filter((w) => stripped.includes(w));
      if (t2.length) tier2Hits.push({ item, words: t2 });
    }
    if (tier2Hits.length >= ah.tier2_threshold) {
      report.add(
        'INFO',
        ah.id,
        scene.id,
        `${ah.label}(추상 명사 tier2) — 장면 내 ${tier2Hits.length}문장`,
        tier2Hits.slice(0, 4).map((h) => `${h.item.entry.speaker}: ${h.words.join('·')}`).join(' | '),
        ah.fix,
        scene.lineNo,
      );
    }

    // ── DLG-SUBJECT-REPEAT — 동일 주어 반복 + 현재형 종결
    const sr = byId['DLG-SUBJECT-REPEAT'];
    const seen = new Map(); // subject -> [{idx, item}]
    for (let i = 0; i < sentStream.length; i += 1) {
      const item = sentStream[i];
      if (!item) { seen.clear(); continue; }
      if (sr.detect.require_present_tense && !isPresentTense(item.sentence, ctx)) continue;
      for (const subj of subjectTokens(item.sentence, ctx)) {
        const list = seen.get(subj) || [];
        list.push({ idx: i, item });
        seen.set(subj, list);
      }
    }
    for (const [subj, list] of seen) {
      for (let i = 0; i + sr.detect.min_repeats - 1 < list.length; i += 1) {
        const group = list.slice(i, i + sr.detect.min_repeats);
        const span = group[group.length - 1].idx - group[0].idx;
        if (span >= sr.detect.window) continue;
        const anyConcrete = group.some((g) => isConcrete(g.item.sentence, ctx));
        const severity = sr.detect.downgrade_to_info_if_any_concrete && anyConcrete
          ? 'INFO'
          : sevOf(sr.id, sr.severity);
        if (severity !== 'INFO') bump(sr.id);
        report.add(
          severity,
          sr.id,
          scene.id,
          `${sr.label} — 주어 "${subj}" ${group.length}회 / 인접 ${span + 1}문장${anyConcrete ? ' · 구체 요소 있음 → 의도된 아나포라 가능' : ''}`,
          group.map((g) => `${g.item.entry.speaker}: ${g.item.sentence}`).join(' ⟂ '),
          sr.fix,
          group[0].item.entry.line.lineNo,
        );
        break; // 장면·주어당 1건만 보고
      }
    }

    // ── DLG-VAGUE-REFERENT — 지시어만 있고 지시 대상이 없다
    const vr = byId['DLG-VAGUE-REFERENT'];
    for (const item of sentStream) {
      if (!item) continue;
      const dx = deixisCount(item.sentence, ctx);
      if (dx.count < vr.detect.min_deixis) continue;
      if (vr.detect.require_zero_concrete && isConcrete(item.sentence, ctx)) continue;
      bump(vr.id);
      report.add(
        sevOf(vr.id, vr.severity),
        vr.id,
        scene.id,
        `${vr.label} — 지시어 ${dx.count}개(${dx.found.join('·')}) · 구체 요소 0`,
        `${item.entry.speaker}: ${item.sentence}`,
        vr.fix,
        item.entry.line.lineNo,
      );
    }

    // ── DLG-NO-CONCRETE — 추상 대사 연속(축 D 핵심)
    const nc = byId['DLG-NO-CONCRETE'];
    let run = [];
    const flushRun = () => {
      if (run.length >= nc.detect.min_consecutive_lines) {
        const syl = run.reduce((a, e) => a + countSyllables(e.line.text), 0);
        if (syl >= nc.detect.min_run_syllables) {
          bump(nc.id);
          report.add(
            sevOf(nc.id, nc.severity),
            nc.id,
            scene.id,
            `${nc.label} — 연속 ${run.length}줄 / ${syl}음절에 고유명사·수치·사물·구체 동작이 0`,
            run.map((e) => `${e.speaker}: ${e.line.text}`).join(' / '),
            nc.fix,
            run[0].line.lineNo,
          );
        }
      }
      run = [];
    };
    for (const e of entries) {
      if (e.excluded) { flushRun(); continue; }
      if (e.exempt) continue;
      const concrete = e.sentences.some((s) => isConcrete(s, ctx));
      if (concrete) flushRun();
      else run.push(e);
    }
    flushRun();

    // ── DLG-REGISTER-MISMATCH — 선언 어투 ↔ 실제 종결어미
    const rm = byId['DLG-REGISTER-MISMATCH'];
    for (const e of entries) {
      if (e.excluded || e.exempt) continue;
      const prof = profileOf(e.speaker);
      if (!prof) continue;
      const classes = new Set();
      for (const sentence of e.sentences) {
        const cls = classifyEnding(sentence, ctx);
        classes.add(cls);
        if (cls && !prof.allowed.has(cls)) {
          bump(rm.id);
          report.add(
            sevOf(rm.id, rm.severity),
            rm.id,
            scene.id,
            `${rm.label} — ${e.speaker} 선언 "${prof.label}" ↔ 실제 ${cls}`,
            `${e.speaker}: ${sentence}`,
            rm.fix,
            e.line.lineNo,
          );
        }
      }
      if (rm.detect.flag_intra_line_mix && classes.size > 1) {
        const known = [...classes].filter(Boolean);
        if (known.length > 1 && known.every((c) => prof.allowed.has(c))) {
          bump(rm.id);
          report.add(
            sevOf(rm.id, 'INFO'),
            rm.id,
            scene.id,
            `${rm.label} — ${e.speaker} 한 라인 안에서 화계 혼용(${known.join('↔')})`,
            `${e.speaker}: ${e.line.text}`,
            rm.fix,
            e.line.lineNo,
          );
        }
      }
    }
  }
}

// ───────────────────────────────────────────────────────────── 실행

export function runGate(filePath, options = {}) {
  const rules = options.rules || loadJson('rules/script-rules.json');
  const style = options.style || loadJson('rules/script-style-patterns.json');
  const dialogue = options.dialogue || loadJson('rules/script-dialogue-patterns.json');
  const source = fs.readFileSync(filePath, 'utf8');
  const doc = parseScript(source);
  const report = new Report(options.allow || []);

  report.stats.file = filePath;
  report.stats.productionId = doc.frontmatter.production_id || null;
  report.stats.scriptVersion = doc.frontmatter.script_version || null;
  report.stats.format = doc.format;
  report.stats.status = doc.frontmatter.status || null;

  const timing = computeTiming(doc, rules, options.sps);

  // A
  checkTtsLint(doc, rules, report);
  checkHook(doc, rules, report, timing);
  checkLength(doc, rules, report, timing);
  checkTags(doc, rules, report);
  checkForeshadow(doc, rules, report);
  checkPerson(doc, rules, report);
  checkNarratorShare(doc, rules, report);
  checkRoster(doc, rules, report);
  // B
  checkThroughLine(doc, rules, report, options);
  checkReorderAndDensity(doc, rules, report);
  // C
  checkStyle(doc, style, rules, report, options);
  // D
  checkDialogue(doc, dialogue, rules, report, options);

  report.findings.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return String(a.scene || '').localeCompare(String(b.scene || ''));
  });

  return { doc, report, timing };
}

function formatText(result, quiet) {
  const { report, doc } = result;
  const out = [];
  out.push('');
  out.push('게이트 ②: 대본 QC 게이트');
  out.push('='.repeat(72));
  out.push(`대상      : ${report.stats.file}`);
  out.push(`production: ${report.stats.productionId || '-'} / v${report.stats.scriptVersion || '-'} / status=${report.stats.status || '-'}`);
  out.push(`형식      : ${report.stats.format || '미상'} · 장면 ${report.stats.sceneCount} · ${report.stats.syllables}음절`);
  out.push(`길이      : ${Object.entries(report.stats.durations).map(([k, v]) => `${k}=${v}초`).join(' · ')}  (장면 대조 프로파일: ${report.stats.spsProfileUsed})`);
  out.push(`나레이터  : ${report.stats.narratorShare}% · 2인칭 ${report.stats.secondPerson}회 · 복선 ${report.stats.foreshadowCount ?? '-'}건`);
  out.push(`항목 C 대상: 내레이션 ${report.stats.styleSentences}문장 / ${report.stats.styleSyllables}음절 (실록 인용 낭독부·[사실] 대사 제외)`);
  out.push(`항목 D 대상: 대사 ${report.stats.dialogueLines}줄 / ${report.stats.dialogueSentences}문장 / ${report.stats.dialogueSyllables}음절 (내레이터·[사실] 인용 대사 ${report.stats.dialogueExcludedLines}줄 제외)`);
  out.push('');

  const groups = quiet ? ['ERROR'] : ['ERROR', 'WARN', 'INFO'];
  for (const sev of groups) {
    const list = report.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    out.push(`── ${sev} (${list.length})`);
    for (const f of list) {
      out.push(`  [${f.ruleId}] ${f.scene ? `${f.scene} ` : ''}${f.message}`);
      if (f.evidence) out.push(`      근거: ${String(f.evidence).slice(0, 200)}`);
      if (f.fix) out.push(`      제안: ${f.fix}`);
      if (f.lineNo) out.push(`      위치: ${path.basename(report.stats.file)}:${f.lineNo}`);
    }
    out.push('');
  }

  out.push('='.repeat(72));
  out.push(`판정: ERROR ${report.errorCount} · WARN ${report.warnCount} · INFO ${report.infoCount} → ${report.errorCount > 0 ? 'FAIL' : 'PASS'}`);
  out.push('');
  return out.join('\n');
}

function parseArgs(argv) {
  const opts = { file: null, json: false, quiet: false, strictStyle: false, strictDialogue: false, requireThroughLine: false, sps: 'auto', allow: [] };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--quiet') opts.quiet = true;
    else if (arg === '--strict-style') opts.strictStyle = true;
    else if (arg === '--strict-dialogue') opts.strictDialogue = true;
    else if (arg === '--require-through-line') opts.requireThroughLine = true;
    else if (arg.startsWith('--sps=')) opts.sps = arg.slice(6);
    else if (arg.startsWith('--allow=')) opts.allow = arg.slice(8).split(',').map((s) => s.trim()).filter(Boolean);
    else if (!arg.startsWith('--')) opts.file = arg;
  }
  return opts;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.file) {
    process.stderr.write('사용법: node scripts/gates/script-gate.mjs <script.md> [--json] [--strict-style] [--require-through-line] [--sps=auto|design|sohee_min|sohee_max|clone] [--allow=ID,ID] [--quiet]\n');
    process.exit(2);
  }
  if (!fs.existsSync(opts.file)) {
    process.stderr.write(`대본 파일을 찾을 수 없다: ${opts.file}\n`);
    process.exit(2);
  }
  const result = runGate(opts.file, opts);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ stats: result.report.stats, findings: result.report.findings, verdict: result.report.errorCount > 0 ? 'FAIL' : 'PASS' }, null, 2)}\n`);
  } else {
    process.stdout.write(formatText(result, opts.quiet));
  }
  process.exit(result.report.errorCount > 0 ? 1 : 0);
}
