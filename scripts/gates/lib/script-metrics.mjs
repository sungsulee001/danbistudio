/**
 * script-metrics.mjs — 게이트 ②(대본 QC) 전용 결정론 계량 유틸
 *
 * 소유: scripts/gates/ (게이트 ② 담당). 파일명 접두사 `script-` 고정 — 타 게이트와 충돌 회피.
 * 모든 수치는 정규식·산술만으로 계산한다(LLM 산수 금지 규약).
 */

import { countSyllables } from './script-md-parser.mjs';

/** 장면 발화 길이(초) = 음절 ÷ sps + 장면 휴지. 대본 계약식 그대로(무수정). */
export function sceneDuration(syllables, sps, pause) {
  return syllables / sps + pause;
}

/** 전체 발화 길이(초) = Σ 장면 길이 + 엔딩 마진. 화면 러닝타임의 발화 항. */
export function totalDuration(scenes, sps, pause, margin) {
  const sum = scenes.reduce((a, s) => a + sceneDuration(s.syllables, sps, pause), 0);
  return sum + margin;
}

// ───────────────────────────────────────── 소리 타이밍(명시 침묵) 계량

/**
 * 장면 `소리 타이밍` 필드에서 초 단위 침묵 표기를 뽑는다.
 *
 * 판독 대상은 대본 규약(규칙 29·37)이 고정한 어휘 3종뿐이다 —
 *   `묵음 N.N`   줄 사이의 의도된 쉼
 *   `무발화 N.N` 대사·나레이션 없이 화면만 가는 구간
 *   `SFX 후 N.N` 효과음 발생 시점 기준 지연(그 지연 동안 발화가 없다)
 *
 * 결정론 규율: 표기 1건 = 1회로만 센다. 산문 수식어("세 줄 사이 각각", "앞과 뒤 모두")의
 * 배수 해석은 자연어 추론이므로 하지 않는다 — 게이트 산출은 대본 §검증의 손 집계보다
 * 항상 같거나 작은 보수적 하한이 된다.
 *
 * @param {string} raw          장면 soundTimingRaw(들여쓴 하위 줄이 공백으로 이어붙은 원문)
 * @param {object} markerSource {explicit_silence, non_speech, sfx_lead} 정규식 소스
 */
export function parseSoundTiming(raw, markerSource) {
  const text = String(raw || '');
  const pick = (src) => {
    const out = [];
    if (!src) return out;
    const re = new RegExp(src, 'g');
    for (const m of text.matchAll(re)) {
      const v = Number(m[1]);
      if (Number.isFinite(v) && v >= 0) out.push(v);
    }
    return out;
  };
  const explicitSilence = pick(markerSource.explicit_silence);
  const nonSpeech = pick(markerSource.non_speech);
  const sfxLead = pick(markerSource.sfx_lead);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const explicitSilenceSec = sum(explicitSilence);
  const nonSpeechSec = sum(nonSpeech);
  const sfxLeadSec = sum(sfxLead);
  return {
    declared: text.trim().length > 0,
    explicitSilence,
    nonSpeech,
    sfxLead,
    explicitSilenceSec,
    nonSpeechSec,
    sfxLeadSec,
    totalSec: explicitSilenceSec + nonSpeechSec + sfxLeadSec,
  };
}

/** 문서 전체 침묵 합산. scene.sound(parseSoundTiming 결과)를 전제한다. */
export function silenceTotals(scenes) {
  const acc = {
    explicitSilenceSec: 0,
    nonSpeechSec: 0,
    sfxLeadSec: 0,
    totalSec: 0,
    explicitSilenceCount: 0,
    nonSpeechCount: 0,
    sfxLeadCount: 0,
    annotatedScenes: 0,
  };
  for (const s of scenes) {
    const t = s.sound;
    if (!t) continue;
    acc.explicitSilenceSec += t.explicitSilenceSec;
    acc.nonSpeechSec += t.nonSpeechSec;
    acc.sfxLeadSec += t.sfxLeadSec;
    acc.totalSec += t.totalSec;
    acc.explicitSilenceCount += t.explicitSilence.length;
    acc.nonSpeechCount += t.nonSpeech.length;
    acc.sfxLeadCount += t.sfxLead.length;
    if (t.declared) acc.annotatedScenes += 1;
  }
  return acc;
}

/**
 * 화면 러닝타임(초) = 발화 시간(음절÷sps + 장면 휴지 + 엔딩 마진) + 명시 침묵 합.
 * 판정 기준의 정의식. 장면 휴지·엔딩 마진은 **표기 없는 전환 여백의 상수**로 유지하고,
 * 대본이 명시한 묵음·무발화·SFX 지연은 그 위에 가산한다(중복 상계 없음 — 규칙 데이터 `why` 참조).
 */
export function sceneScreenDuration(scene, sps, pause) {
  return sceneDuration(scene.syllables, sps, pause) + (scene.sound ? scene.sound.totalSec : 0);
}

export function totalScreenDuration(scenes, sps, pause, margin) {
  return totalDuration(scenes, sps, pause, margin) + silenceTotals(scenes).totalSec;
}

const PARTICLES = [
  '으로써', '이라고', '으로서', '에서는', '에게서', '으로', '에서', '에게', '까지', '부터',
  '라고', '이라', '에는', '에도', '만큼', '처럼', '보다', '이나', '조차', '마저',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '와', '과', '로', '랑', '께', '나',
];

/** 한글 토큰에서 흔한 조사를 1회 벗겨 어간 후보를 만든다(2음절 이상 유지). */
export function stemToken(token) {
  let t = String(token);
  for (const p of PARTICLES) {
    if (t.length - p.length >= 2 && t.endsWith(p)) return t.slice(0, t.length - p.length);
  }
  return t;
}

/** 용언 종결형으로 보이는 토큰(새 정보 판정에서 제외). */
function looksLikePredicate(token) {
  return /(다|요|까|죠|네|군|자|라)$/.test(token) && token.length >= 2;
}

/**
 * 한글 토큰 추출 → 어간화 → 2음절 이상만.
 * 새 정보(고유명사·수치어) 근사 지표의 입력이 된다.
 */
export function extractStems(text, stopwords = new Set()) {
  const out = [];
  const tokens = String(text || '').match(/[가-힣]+/g) || [];
  for (const raw of tokens) {
    if (looksLikePredicate(raw)) continue;
    const stem = stemToken(raw);
    if (stem.length < 2) continue;
    if (stopwords.has(stem)) continue;
    out.push(stem);
  }
  return out;
}

/** 제목에서 키워드 어간을 뽑는다(2음절 이상, 용언 어미 제거). */
export function titleKeywordStems(titleCore) {
  const cleaned = String(titleCore || '').replace(/[—\-–·:：]/g, ' ');
  const tokens = cleaned.match(/[가-힣]+/g) || [];
  const out = [];
  for (const raw of tokens) {
    let t = raw.replace(/(한다|합니다|했다|하는|하다|된다|이다|입니다)$/, '');
    t = stemToken(t);
    if (t.length >= 2) out.push(t);
  }
  return Array.from(new Set(out));
}

/** 문장의 쉼표 개수. */
export function commaCount(sentence) {
  return (String(sentence).match(/[,，]/g) || []).length;
}

/** 표본 표준편차(음절 기준 리듬 계측용). */
export function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const varSum = values.reduce((a, b) => a + (b - mean) ** 2, 0);
  return Math.sqrt(varSum / (values.length - 1));
}

/**
 * 장면별 누적 시작 시각(초)을 계산한다. 훅 키워드 30초 게이트의 기준.
 */
export function sceneStartTimes(scenes, sps, pause) {
  const starts = [];
  let acc = 0;
  for (const s of scenes) {
    starts.push(acc);
    acc += sceneDuration(s.syllables, sps, pause);
  }
  return starts;
}

/**
 * 특정 장면 안에서 `needle`이 처음 등장하는 지점의 누적 시각(초).
 * 장면 시작 시각 + (앞선 음절 수 ÷ sps). 결정론.
 */
export function firstOccurrenceTime(scenes, starts, needle, sps) {
  for (let i = 0; i < scenes.length; i += 1) {
    let before = 0;
    for (const line of scenes[i].speech) {
      const idx = line.text.indexOf(needle);
      if (idx >= 0) {
        const prefixSyl = countSyllables(line.text.slice(0, idx));
        return { sceneId: scenes[i].id, seconds: starts[i] + (before + prefixSyl) / sps };
      }
      before += line.syllables;
    }
  }
  return null;
}

/** 정규식 소스 배열 → 전역 정규식 배열. */
export function compilePatterns(list) {
  return list.map((p) => new RegExp(p, 'g'));
}

/** 문자열에서 패턴 총 매치 수. */
export function countMatches(text, regexes) {
  let n = 0;
  for (const re of regexes) {
    re.lastIndex = 0;
    const m = String(text).match(re);
    if (m) n += m.length;
  }
  return n;
}
