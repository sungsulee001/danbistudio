/**
 * script-md-parser.mjs — 게이트 ②(대본 QC) 전용 대본 마크다운 파서
 *
 * 소유: scripts/gates/ (게이트 ② 담당). prompt-gate.mjs 등 타 게이트와 파일명 충돌 회피용으로
 * `script-` 접두사를 고정한다. 공용화 금지 — 대본(01-script.md) 구조에만 특화되어 있다.
 *
 * 파싱 대상 구조(20-productions/<id>/01-script.md):
 *   ---                       frontmatter(YAML 유사 key: value)
 *   # 대본 vX: 제목 (형식)      H1
 *   > **키**: 값               머리 메모(blockquote)
 *   ## 장면 01 (N01) — 제목
 *   - **화자**: A + B(단역)
 *   - **나레이션/대사**:
 *     - 화자: 발화문.
 *   - **화면 지시**: ...
 *   - **예상 길이**: 16.5초
 *   - **대사 태그**: ...
 *   - **메모**: ...
 *   ## 검증 ...              (검사 대상 아님)
 *   ## 부록 — 대본 v1 전문     (보존본 — 검사 대상 아님, 여기서 문서를 자른다)
 *
 * 결정론 원칙: 정규식·문자 카운트만 사용. 추론·산수 위임 없음.
 */

/** 한글 음절만 센다(공백·문장부호·한자·라틴 제외). 길이 계산의 유일한 원천. */
export function countSyllables(text) {
  if (!text) return 0;
  const m = String(text).match(/[가-힣]/g);
  return m ? m.length : 0;
}

/** 발화문을 문장 단위로 쪼갠다. 종결부호(. ! ? …) 기준 결정론 분할. */
export function splitSentences(text) {
  if (!text) return [];
  return String(text)
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 문어체 평서 종결(= 실록 인용 낭독부) 판정.
 * 내레이션 기본 문체는 합니다체(`~니다.`)이므로, `~다.`로 끝나되 `~니다.`가 아닌 문장은
 * 대본 문체 메모가 규정한 "의도된 문어체 전환 = 인용 낭독"으로 본다.
 * 예) "…훌륭한 제도였다." / "영실은 동래현의 관노다." / "…어긋나지 않았다."
 */
export function isLiteraryQuoteSentence(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (/니다[.!?…]?$/.test(s)) return false;
  return /다[.!?…]?$/.test(s);
}

function parseFrontmatter(lines) {
  const fm = {};
  if (lines[0] !== '---') return { frontmatter: fm, bodyStart: 0 };
  let i = 1;
  for (; i < lines.length; i += 1) {
    if (lines[i] === '---') {
      i += 1;
      break;
    }
    const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (m) {
      let value = m[2].trim();
      value = value.replace(/\s+#.*$/, '').trim();
      value = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      fm[m[1]] = value;
    }
  }
  return { frontmatter: fm, bodyStart: i };
}

/** `무관(단역)` → `무관`, `세종(회상 인용)` → `세종` */
function normalizeSpeakerName(raw) {
  return String(raw || '')
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/\*\*/g, '')
    .trim();
}

/** 화자 필드(`무관(단역) + 내레이터`)를 이름 배열로. */
function parseSpeakerRoster(value) {
  return String(value || '')
    .split(/[+·,、]/)
    .map((s) => normalizeSpeakerName(s))
    .filter((s) => s.length > 0);
}

/** 발화 라인 `화자: 본문` 분해. 콜론이 앞쪽 16자 안에 있을 때만 화자로 인정. */
function parseSpeechLine(raw) {
  const line = String(raw).trim();
  const idx = line.indexOf(':');
  if (idx > 0 && idx <= 16) {
    const speaker = normalizeSpeakerName(line.slice(0, idx));
    const text = line.slice(idx + 1).trim();
    if (speaker && text) return { speaker, text };
  }
  return { speaker: null, text: line };
}

const FIELD_ALIASES = {
  '화자': 'speakersRaw',
  '나레이션/대사': 'speechBlock',
  '화면 지시': 'visual',
  '예상 길이': 'declaredDurationRaw',
  '발음 주의': 'pronunciation',
  '대사 태그': 'tagBlock',
  '메모': 'memo',
};

/**
 * 대본 md 전체를 구조화한다.
 * @param {string} source 파일 원문
 * @returns {{frontmatter:object,title:string,format:string|null,headMemo:object,headMemoRaw:string[],scenes:Array}}
 */
export function parseScript(source) {
  const normalized = String(source).replace(/\r\n?/g, '\n');
  const allLines = normalized.split('\n');

  const { frontmatter, bodyStart } = parseFrontmatter(allLines);

  // 부록(보존된 구판 전문)은 검사 대상이 아니다 — 문서를 여기서 자른다.
  let endIdx = allLines.length;
  for (let i = bodyStart; i < allLines.length; i += 1) {
    if (/^##\s+부록/.test(allLines[i])) {
      endIdx = i;
      break;
    }
  }
  const lines = allLines.slice(bodyStart, endIdx);

  // H1 제목 + 형식
  let title = '';
  let format = null;
  for (const line of lines) {
    const m = line.match(/^#\s+(.*)$/);
    if (m) {
      title = m[1].trim();
      break;
    }
  }
  const paren = title.match(/[（(]([^)）]*)[)）]\s*$/);
  if (paren) {
    const inner = paren[1];
    if (/픽션\s*드라마/.test(inner)) format = '픽션 드라마';
    else if (/하이브리드/.test(inner)) format = '하이브리드';
    else format = inner.trim();
  }
  // 제목 본문(버전 접두사·형식 괄호 제거)
  const titleCore = title
    .replace(/^#*\s*/, '')
    .replace(/^대본\s*v?[\d.]+\s*[:：]\s*/, '')
    .replace(/[（(][^)）]*[)）]\s*$/, '')
    .trim();

  // 머리 메모(blockquote) — `> **키**: 값` 형태를 키/값으로, 원문도 보존
  const headMemo = {};
  const headMemoRaw = [];
  for (const line of lines) {
    if (/^##\s/.test(line)) break;
    const m = line.match(/^>\s*(.*)$/);
    if (!m) continue;
    const content = m[1].trim();
    if (!content) continue;
    headMemoRaw.push(content);
    const kv = content.match(/^\*\*(.+?)\*\*\s*[:：]\s*(.*)$/);
    if (kv) {
      const key = kv[1].replace(/[（(][^)）]*[)）]/g, '').trim();
      headMemo[key] = kv[2].trim();
    } else {
      const kv2 = content.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[:：]\s*(.*)$/);
      if (kv2) headMemo[kv2[1]] = kv2[2].trim();
    }
  }

  // 장면 파싱
  const scenes = [];
  let current = null;
  let currentField = null;
  let inSpeech = false;

  const flush = () => {
    if (current) scenes.push(current);
    current = null;
    currentField = null;
    inSpeech = false;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const head = line.match(/^##\s+장면\s*(\d+)\s*[（(]\s*(N\d+)\s*[)）]\s*(?:[—\-–]\s*(.*))?$/);
    if (head) {
      flush();
      current = {
        index: Number(head[1]),
        id: head[2],
        title: (head[3] || '').trim(),
        lineNo: bodyStart + i + 1,
        speakersRaw: '',
        speakers: [],
        speech: [],
        visual: '',
        declaredDurationRaw: '',
        declaredDuration: null,
        pronunciation: '',
        tagBlock: '',
        memo: '',
      };
      continue;
    }
    if (/^##\s/.test(line)) {
      // 다른 h2(검증 등) — 장면 수집 종료
      flush();
      continue;
    }
    if (!current) continue;

    const field = line.match(/^-\s+\*\*(.+?)\*\*\s*[:：]\s*(.*)$/);
    if (field) {
      const key = FIELD_ALIASES[field[1].trim()];
      inSpeech = false;
      currentField = null;
      if (key === 'speechBlock') {
        inSpeech = true;
        continue;
      }
      if (key) {
        current[key] = field[2].trim();
        currentField = key;
      }
      continue;
    }

    if (inSpeech) {
      const sp = line.match(/^\s{2,}-\s+(.*)$/);
      if (sp) {
        const parsed = parseSpeechLine(sp[1]);
        current.speech.push({
          speaker: parsed.speaker,
          text: parsed.text,
          lineNo: bodyStart + i + 1,
          syllables: countSyllables(parsed.text),
          sentences: splitSentences(parsed.text),
        });
        continue;
      }
      if (line.trim() === '') continue;
      inSpeech = false;
    }

    // 필드 값 연속 줄(들여쓴 이어쓰기)
    if (currentField && /^\s+\S/.test(line)) {
      current[currentField] += ` ${line.trim()}`;
    }
  }
  flush();

  for (const scene of scenes) {
    scene.speakers = parseSpeakerRoster(scene.speakersRaw);
    const d = scene.declaredDurationRaw.match(/([\d.]+)\s*초/);
    scene.declaredDuration = d ? Number(d[1]) : null;
    scene.syllables = scene.speech.reduce((a, s) => a + s.syllables, 0);
  }

  return {
    frontmatter,
    title,
    titleCore,
    format,
    headMemo,
    headMemoRaw,
    scenes,
  };
}

/**
 * 머리 메모의 `복선 표` 줄을 항목 배열로 분해한다.
 * `① 손 모티프: N03 심기(...) → N10·N12 회수(...)` → {label, plants:['N03'], payoffs:['N10','N12']}
 * `→`가 없으면 심기/회수 키워드 위치로 대체 판정한다.
 */
export function parseForeshadowTable(headMemo) {
  const key = Object.keys(headMemo).find((k) => /복선\s*표/.test(k));
  if (!key) return null;
  const raw = headMemo[key];
  const chunks = raw
    .split(/[①②③④⑤⑥⑦⑧⑨⑩]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const items = chunks.map((chunk) => {
    const arrowIdx = chunk.search(/[→⇒]/);
    let leftPart = chunk;
    let rightPart = '';
    if (arrowIdx >= 0) {
      leftPart = chunk.slice(0, arrowIdx);
      rightPart = chunk.slice(arrowIdx + 1);
    } else {
      const pIdx = chunk.search(/회수|회귀/);
      if (pIdx >= 0) {
        leftPart = chunk.slice(0, pIdx);
        rightPart = chunk.slice(pIdx);
      }
    }
    const grab = (s) => Array.from(String(s).matchAll(/\bN(\d{2})\b/g)).map((m) => `N${m[1]}`);
    const label = (chunk.split(/[:：]/)[0] || chunk).replace(/\*\*/g, '').trim().slice(0, 40);
    return {
      label,
      raw: chunk,
      plants: Array.from(new Set(grab(leftPart))),
      payoffs: Array.from(new Set(grab(rightPart))),
    };
  });
  return { key, raw, items };
}

/**
 * 머리 메모의 `through_line` 선언을 파싱한다(게이트 ② 신설 규약).
 * 형식: `> **through_line**: 물건=종채 | 심기=N03 | 상승=N09,N10 | 페이오프=N13`
 */
export function parseThroughLine(headMemo) {
  const key = Object.keys(headMemo).find((k) => /^through[_\s-]?line$/i.test(k.trim()));
  if (!key) return null;
  const raw = headMemo[key];
  const out = { raw, object: null, plant: null, escalations: [], payoff: null };
  for (const part of raw.split('|')) {
    const kv = part.split(/[=:：]/);
    if (kv.length < 2) continue;
    const k = kv[0].replace(/\*\*/g, '').trim();
    const v = kv.slice(1).join('=').replace(/\*\*/g, '').trim();
    const scenes = Array.from(v.matchAll(/\bN(\d{2})\b/g)).map((m) => `N${m[1]}`);
    if (/물건|object|사물/i.test(k)) out.object = v;
    else if (/심기|plant/i.test(k)) out.plant = scenes[0] || null;
    else if (/상승|escalat|증폭/i.test(k)) out.escalations = scenes;
    else if (/페이오프|payoff|해소/i.test(k)) out.payoff = scenes[0] || null;
  }
  return out;
}

/**
 * 장면의 `대사 태그` 블록에서 [사실]로 태그된 화자 집합을 뽑는다.
 * 태그 블록을 문장 단위로 쪼개고, [사실]을 포함한 문장에 등장하는 화자명을 수집한다.
 */
export function parseFactTaggedSpeakers(scene) {
  const block = scene.tagBlock || '';
  if (!block) return new Set();
  const out = new Set();
  const segments = block.split(/(?<=[.!?…])\s+/);
  for (const seg of segments) {
    if (!/\[사실\]/.test(seg)) continue;
    for (const sp of scene.speakers) {
      if (sp && seg.includes(sp)) out.add(sp);
    }
    // 화자 필드에 없는 축약 표기(선임 등)도 발화 화자 기준으로 한 번 더
    for (const line of scene.speech) {
      if (line.speaker && seg.includes(line.speaker)) out.add(line.speaker);
    }
  }
  return out;
}
