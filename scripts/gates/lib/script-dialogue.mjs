/**
 * script-dialogue.mjs — 게이트 ②(대본 QC) 항목 D: 캐릭터 대사 전용 분석 원시함수
 *
 * 소유: scripts/gates/ (게이트 ② 담당). 규칙 데이터는 rules/script-dialogue-patterns.json이 원천이고
 * 이 파일은 그 데이터를 소비하는 결정론 판정기만 담는다. 임계값·사전은 여기에 하드코딩하지 않는다.
 *
 * 결정론 원칙: 정규식·문자 카운트만. 형태소 분석기·LLM 호출 없음.
 */

import { countSyllables } from './script-md-parser.mjs';

const PUNCT_TAIL = /[.!?…,·]+$/;

/** 문장을 어절 배열로. 문장부호는 어절 끝에서 떼어 낸다. */
export function tokenize(sentence) {
  return String(sentence || '')
    .split(/\s+/)
    .map((t) => t.replace(PUNCT_TAIL, '').replace(/^[「『"'"']+/, ''))
    .filter((t) => t.length > 0);
}

function lastChar(token) {
  return token ? token[token.length - 1] : '';
}

function suffix(token, n) {
  return token ? token.slice(-n) : '';
}

/**
 * 인접 문장 두 개의 구조 유사도(0~1).
 * 어절 수 · 어절 말음(조사·어미) 시퀀스 · 종결어미 · 어두 조사 · 동일 어절 비율의 가중합.
 * 의미가 아니라 **형태의 대칭성**만 본다 — 기계적 대구 검출용.
 */
export function structuralSimilarity(a, b, cfg) {
  const A = tokenize(a);
  const B = tokenize(b);
  const minTok = cfg.min_tokens ?? 2;
  if (A.length < minTok || B.length < minTok) return { score: 0, parts: null };

  const w = cfg.weights;
  const diff = Math.abs(A.length - B.length);
  const lenScore = diff === 0 ? 1 : diff === 1 ? 0.5 : 0;

  const n = Math.min(A.length, B.length);
  let tailHits = 0;
  let identHits = 0;
  for (let i = 0; i < n; i += 1) {
    if (lastChar(A[i]) === lastChar(B[i])) tailHits += 1;
    if (A[i] === B[i]) identHits += 1;
  }
  const tailScore = n ? tailHits / n : 0;
  const identScore = n ? identHits / n : 0;
  const endScore = suffix(A[A.length - 1], 2) === suffix(B[B.length - 1], 2) ? 1 : 0;
  const headScore = lastChar(A[0]) === lastChar(B[0]) ? 1 : 0;

  const score =
    w.token_count * lenScore +
    w.particle_tail_sequence * tailScore +
    w.final_ending * endScore +
    w.initial_particle * headScore +
    w.token_identity * identScore;

  return {
    score,
    parts: {
      tokens: `${A.length}:${B.length}`,
      tail: Number(tailScore.toFixed(2)),
      ending: endScore,
      head: headScore,
      ident: Number(identScore.toFixed(2)),
    },
  };
}

/** 문서 전체에서 고유명사 후보를 수집한다(화자명 + 위키링크). 프로덕션 이식성 확보용. */
export function collectDynamicProperNouns(doc, cfg) {
  const out = new Set();
  if (!cfg || !cfg.dynamic_proper_nouns) return out;
  const dyn = cfg.dynamic_proper_nouns;
  const min = dyn.min_length ?? 2;

  if (dyn.from_speaker_names) {
    for (const scene of doc.scenes) {
      for (const sp of scene.speakers) {
        const name = String(sp).replace(/^단역\s*/, '').trim();
        if (name.length >= min) out.add(name);
      }
      for (const line of scene.speech) {
        if (line.speaker && line.speaker.length >= min) out.add(line.speaker.replace(/^단역\s*/, '').trim());
      }
    }
  }
  if (dyn.from_wikilinks) {
    const raw = [doc.headMemoRaw.join(' '), ...doc.scenes.map((s) => `${s.tagBlock} ${s.memo}`)].join(' ');
    for (const m of raw.matchAll(/\[\[([^\]|#]+)/g)) {
      const label = m[1].trim();
      if (label.length >= min && /^[가-힣]/.test(label)) out.add(label);
    }
  }
  out.delete('내레이터');
  return out;
}

/**
 * 한 문장의 구체 요소를 뽑는다.
 * 구체 요소 = 고유명사 · 수치/단위 · 물리적 사물 명사 · 구체 동작 동사.
 * 지각·이동 일반동사(듣다·옮기다·보다…)는 의도적으로 제외 — 목적어 없이는 그림이 안 생긴다.
 */
export function concreteElements(sentence, ctx) {
  const cfg = ctx.concreteness;
  let s = String(sentence || '');
  const hits = [];

  for (const re of ctx.objectExclusionRes) s = s.replace(re, ' ');

  for (const name of ctx.properNouns) {
    if (name && s.includes(name)) hits.push(`고유명사:${name}`);
  }
  for (const re of ctx.properNounRes) {
    re.lastIndex = 0;
    const m = s.match(re);
    if (m) hits.push(`고유명사:${m[0].trim()}`);
  }
  for (const re of ctx.numeralRes) {
    re.lastIndex = 0;
    const m = s.match(re);
    if (m) hits.push(`수치:${m[0].trim()}`);
  }
  for (const noun of cfg.object_nouns) {
    if (s.includes(noun)) hits.push(`사물:${noun}`);
  }
  for (const re of ctx.actionVerbRes) {
    re.lastIndex = 0;
    const m = s.match(re);
    if (m) hits.push(`동작:${m[0]}`);
  }
  return Array.from(new Set(hits));
}

export function isConcrete(sentence, ctx) {
  return concreteElements(sentence, ctx).length > 0;
}

/** 종결어미 화계 분류. rules의 order가 곧 우선순위다. */
export function classifyEnding(sentence, ctx) {
  const s = String(sentence || '').trim();
  for (const cls of ctx.endingOrder) {
    for (const re of ctx.endingRes[cls]) {
      re.lastIndex = 0;
      if (re.test(s)) return cls;
    }
  }
  return null;
}

/** 지시어 개수. `아무것`·`저분` 등 지시 대상이 사람·부정칭인 것은 제외. */
export function deixisCount(sentence, ctx) {
  let s = String(sentence || '');
  for (const ex of ctx.deixisExclusions) s = s.split(ex).join(' ');
  let n = 0;
  const found = [];
  for (const re of ctx.deixisRes) {
    re.lastIndex = 0;
    const ms = Array.from(s.matchAll(re));
    n += ms.length;
    for (const m of ms) found.push(m[0].trim());
  }
  return { count: n, found };
}

/** 문장에서 주어 후보(사전 어휘 + 주격/주제 조사)를 뽑는다. */
export function subjectTokens(sentence, ctx) {
  const out = [];
  for (const lex of ctx.subjectLexicon) {
    const re = new RegExp(`${ctx.subjectPrefix}${lex}${ctx.subjectParticle}`, 'g');
    re.lastIndex = 0;
    if (re.test(String(sentence || ''))) out.push(lex);
  }
  return out;
}

/** 한글 음절의 종성 인덱스(0=받침 없음, 20=ㅆ). 비한글이면 -1. */
export function jongseongIndex(ch) {
  const code = String(ch || '').charCodeAt(0);
  if (!Number.isFinite(code) || code < 0xac00 || code > 0xd7a3) return -1;
  return (code - 0xac00) % 28;
}

/**
 * 현재형 종결 판정. `~다`로 끝나되 직전 음절 종성이 ㅆ이면 과거(쳤다·알렸다·만들었다).
 * `있다·없다·이다` 등 종성 ㅆ을 어간에 품은 현재형은 예외 목록으로 구제한다.
 */
export function isPresentTense(sentence, ctx) {
  const s = String(sentence || '').trim().replace(PUNCT_TAIL, '');
  if (!s) return false;
  const cfg = ctx.presentTense;
  if (cfg.always_present.some((w) => s.endsWith(w))) return true;
  const matched = ctx.presentTenseRes.some((re) => {
    re.lastIndex = 0;
    return re.test(s);
  });
  if (!matched) return false;
  const stem = s.endsWith('니까') ? s.slice(0, -2) : s.slice(0, -1);
  return jongseongIndex(stem[stem.length - 1]) !== cfg.past_jongseong_index;
}

/**
 * 장면의 `대사 태그` 블록에서 **문면이 실록 인용인 대사**를 식별한다.
 * 기존 parseFactTaggedSpeakers보다 좁다 — `대사가 전달하는 사실은 [사실]`류(정보 출처 표기)는
 * 제외 신호가 아니다. 이 구분이 없으면 ep2 15장면 중 11장면 대사가 통째로 검사에서 빠진다.
 * @returns {{speakers:Set<string>, sentences:Set<string>}}
 */
export function parseQuotedFactScope(scene, scopeCfg) {
  const speakers = new Set();
  const sentences = new Set();
  const block = scene.tagBlock || '';
  if (!block) return { speakers, sentences };

  const marker = scopeCfg.fact_tag_marker || '[사실]';
  const structuralRes = (scopeCfg.structural_fact_segment_patterns || []).map((p) => new RegExp(p));

  for (const seg of block.split(/(?<=[.!?…])\s+/)) {
    if (!seg.includes(marker)) continue;
    if (structuralRes.some((re) => re.test(seg))) continue;

    // 위키링크는 화자 지목이 아니다([[장영실]]이 `장영실 대사 [사실]`로 오독되는 것 차단)
    const cleaned = seg.replace(/\[\[[^\]]*\]\]/g, ' ');

    const names = new Set();
    for (const sp of scene.speakers) names.add(sp);
    for (const line of scene.speech) if (line.speaker) names.add(line.speaker);
    for (const name of names) {
      if (name && cleaned.includes(name)) speakers.add(name);
    }

    for (const m of cleaned.matchAll(/[""「『"]([^""」』"]{4,})[""」』"]/g)) {
      sentences.add(normalizeForQuoteMatch(m[1]));
    }
    for (const m of cleaned.matchAll(/\*\*([^*]{6,})\*\*/g)) {
      sentences.add(normalizeForQuoteMatch(m[1]));
    }
  }
  return { speakers, sentences };
}

export function normalizeForQuoteMatch(text) {
  return String(text || '')
    .replace(/[\s.!?…,·"'"'「」『』]/g, '')
    .trim();
}

export { countSyllables };
