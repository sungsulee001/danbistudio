#!/usr/bin/env node
/**
 * 게이트 ① — 이미지·영상 프롬프트 게이트 (Danbi 파이프라인)
 *
 * 인간 검수로 잡던 프롬프트 결함을 기계 검사로 옮긴다. 규칙은 코드가 아니라
 * `rules/*.json` 데이터 테이블에 있다 — 새 실증이 나오면 규칙만 추가하면 된다.
 *
 * 구조·검증기 설계는 gongnyang-prompt-kit(MIT)의 check_prompt.mjs를 포크 베이스로 차용했고,
 * 모델 팩트(gpt-image-2 전제 사이즈 락·Tier-1 텍스트 가드 등)는 전량 우리 것으로 치환했다.
 * 영상 프롬프트 정제 독트린은 vibe-creating-skill(MIT)의 judgment-first 사상을 참고했다.
 * 힉스필드 자산은 라이선스 미명시이므로 코드·문구를 복사하지 않았다(개념 참고·자체 재작성).
 *
 * 사용:
 *   node scripts/gates/prompt-gate.mjs <02-storyboard.md> [...]
 *   node scripts/gates/prompt-gate.mjs --json <prompts.json>
 *   node scripts/gates/prompt-gate.mjs --text "<prompt>" --kind image
 *   node scripts/gates/prompt-gate.mjs --dump <02-storyboard.md>      # 파싱 결과·플래그 확인
 *   옵션: --format text|json  --severity error|warn  --rules <dir>  --quiet
 *
 * exit code: ERROR 1건 이상 → 1 (CI 게이트). WARN만 있으면 0. 입력 오류 → 2.
 *
 * 의존성 없음(Node ESM 표준 라이브러리만).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RULES_DIR = resolve(SCRIPT_DIR, 'rules');

// ────────────────────────────────────────────────────────────────────────────
// 1. 규칙 테이블 로딩
// ────────────────────────────────────────────────────────────────────────────

/** 이 게이트가 소비하는 규칙 종류. rules/ 는 다른 게이트와 공유되므로 kind로 걸러낸다. */
export const GATE_KINDS = new Set(['image', 'video', 'audio']);

/** rules 디렉터리의 *-rules.json 중 이 게이트 소관(kind: image/video/audio)만 읽는다. */
export function loadRules(rulesDir = DEFAULT_RULES_DIR) {
  const files = readdirSync(rulesDir).filter((f) => f.endsWith('-rules.json')).sort();
  const tables = [];
  const rules = [];
  const seen = new Set();
  for (const file of files) {
    const table = JSON.parse(readFileSync(resolve(rulesDir, file), 'utf8'));
    // 다른 게이트(예: 게이트 ② 대본 QC)의 테이블은 조용히 건너뛴다 — rules/ 공유 디렉터리.
    if (!GATE_KINDS.has(table.kind) || !Array.isArray(table.rules)) continue;
    tables.push({ file, kind: table.kind, model: table.model, doc: table.doc, count: table.rules.length });
    for (const rule of table.rules) {
      if (!rule.id || !rule.severity || !rule.detect) {
        throw new Error(`${file}: 규칙에 id/severity/detect 누락 — ${JSON.stringify(rule).slice(0, 80)}`);
      }
      if (seen.has(rule.id)) throw new Error(`규칙 ID 중복: ${rule.id}`);
      seen.add(rule.id);
      rules.push({ ...rule, kind: table.kind, source: file });
    }
  }
  return { rules, tables };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. 콘티(02-storyboard.md) 파서
//    `### CUT-NN` 헤딩 + `- **field**: value` 구조. image_prompt만 중첩 리스트
//    (`- 의도:` / `- 컴파일본:`)를 가진다. 컴파일러 리터럴은 읽기만 하고 건드리지 않는다.
// ────────────────────────────────────────────────────────────────────────────

// 접미 컷(CUT-40A 등, ep2 v1.1) 지원 — 종전 정규식은 접미 컷 헤딩을 조용히 건너뛰었다.
const CUT_HEADING = /^#{2,4}\s+(CUT-\d{2,3}[A-Z]?)\s*$/;
const FIELD_LINE = /^-\s+\*\*([a-z_0-9]+)\*\*\s*:\s*(.*)$/i;
const SUB_FIELD_LINE = /^\s{2,}-\s+(의도|컴파일본)\s*:\s*(.*)$/;
const HEADING_ANY = /^(#{1,6})\s+/;

/** 마크다운 주석·트레일링 공백 제거 */
const clean = (s) => String(s ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();

export function parseStoryboard(markdown, sourcePath = '<inline>') {
  const lines = markdown.split(/\r?\n/);
  const productionId = markdown.match(/^production_id:\s*(\S+)/m)?.[1] ?? null;
  const cutCount = Number(markdown.match(/^cut_count:\s*(\d+)/m)?.[1] ?? 0) || null;

  const cuts = [];
  let cur = null;
  let curLevel = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const cutMatch = line.match(CUT_HEADING);
    if (cutMatch) {
      // 부록(강등된 구버전 콘티)은 헤딩 레벨이 더 깊다 — 첫 컷의 레벨만 채택한다.
      const level = line.match(HEADING_ANY)[1].length;
      if (cuts.length === 0) curLevel = level;
      if (level !== curLevel) { cur = null; continue; }
      cur = { id: cutMatch[1], line: i + 1, source: sourcePath, fields: {} };
      cuts.push(cur);
      continue;
    }
    if (!cur) continue;
    if (HEADING_ANY.test(line)) { cur = null; continue; } // 컷 블록 종료

    const sub = line.match(SUB_FIELD_LINE);
    if (sub) {
      cur.fields[sub[1] === '의도' ? 'intent' : 'image_prompt'] = clean(sub[2]);
      continue;
    }
    const field = line.match(FIELD_LINE);
    if (field) {
      const key = field[1].toLowerCase();
      const value = clean(field[2]);
      if (key === 'image_prompt' && !value) continue; // 다음 줄의 중첩 리스트가 실값
      cur.fields[key] = value;
    }
  }

  return {
    kind: 'storyboard',
    path: sourcePath,
    productionId,
    declaredCutCount: cutCount,
    cuts: cuts.map((c) => toItem(c)),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. 컷 → 검사 대상 아이템 + 플래그 도출
//    플래그는 applies_to 조건(컷 유형)을 데이터로 표현하기 위한 어휘다.
// ────────────────────────────────────────────────────────────────────────────

const PERSON_NOUN = /\b(man|woman|men|women|boy|girl|official|officials|scholar|cadet|king|soldier|soldiers|guard|guards|craftsman|artisan|figure|figures|attendant|monk|servant|clerk|minister)\b/i;
const CLOSEUP_SHOT = /^\s*(?:MCU|CU|ECU|BCU)\b/i;
// 인원수 표기는 공백 없는 "3인" 형태만 인정한다("B-3 인용" 같은 오탐 차단).
const CROWD_KO = /군상|군중|여러\s*사람|(?:삼|[3-9]|1[0-9]|열두|십이)인(?!용|칭|계|\s*구도)|다수\s*인물|개체\s*차이|개체\s*분산/;
const HAT_VOCAB = /\b(?:hat|cap|helmet|samo|sammo|ikseongwan)\b|사모|익선관|투구|관모/i;
const NOFIGURE_KO = /무인|인물\s*없|인물\s*미등장|인물은?\s*화면\s*밖|사람\s*없|정물/;
const SEATED = /\bseated\b|\bsitting\b|착좌|앉/i;
const FULLBODY = /전신|\bfull[- ]body\b|\bfull\s+length\b|^\s*(?:FS|LS|EWS|WS)\b/i;
const MOVING_CAMERA = /^\s*(?:Dolly|Crane|Jib|Orbit|Arc|Zoom|Crash|Whip|Push|Pull|Track|Rack|Tilt|Pan|FPV|Lazy|Through|Earth)/i;
/** 손 컷 판정 — 컴파일본의 첫 절(피사체 선언부)이 손을 주어로 삼는가 */
const HANDS_SUBJECT = /^[^,]{0,20}(?:\{STYLE[_A-Z]*\})?[^,]{0,60},?[^,]{0,90}\bhands?\b/i;
/** 군상 판정(영문 프롬프트 측) — 복수 인물 명사에 수량·집합 한정어가 붙은 형태 */
const CROWD_EN = /\b(?:three|four|five|six|seven|eight|nine|ten|eleven|twelve|a\s+group\s+of|a\s+row\s+of|rows\s+of|assembled|a\s+line\s+of|a\s+crowd\s+of)\s+[a-z' -]{0,20}\b(?:men|women|officials|ministers|soldiers|guards|figures|figurines|cadets|attendants|courtiers)\b/i;

/**
 * 컷 유형 플래그를 도출한다 — applies_to 조건을 데이터(JSON)로 쓰기 위한 어휘.
 * 콘티 파싱 경로와 --json 입력 경로가 같은 함수를 쓴다.
 */
export function deriveFlags(f = {}) {
  const shot = f.shot_type ?? '';
  const intent = f.intent ?? '';
  const image = f.image_prompt ?? '';
  const camera = f.camera ?? '';
  const styleVariant = f.style_variant ?? '';
  const a2vField = f.a2v ?? '';
  const ko = `${shot} ${intent}`;
  // 부정 문맥("군상 없음")은 플래그 판정에서 제거한다.
  const koCrowd = ko.replace(/군상[^.,·]{0,6}(?:없음|없다|비대상|미대상|제외)/g, ' ');

  const flags = new Set();

  const isNoFigureToken = /^\s*\{STYLE_NOFIGURE\}/.test(image);
  const hasPersonNoun = PERSON_NOUN.test(image.replace(/\{STYLE[_A-Z]*\}/g, ''));
  const hands = /hands-only/i.test(styleVariant) || HANDS_SUBJECT.test(image);
  const crowd = CROWD_KO.test(koCrowd) || CROWD_EN.test(image);

  if (hands) flags.add('hands');
  if (crowd) flags.add('crowd');
  // 클로즈업: 콘티 shot_type 코드 또는 (콘티 없이 프롬프트만 들어온 경우) 영문 프레이밍 어휘
  if (CLOSEUP_SHOT.test(shot) || (!shot && /\b(?:extreme\s+|medium\s+|tight\s+)?close-?up\b/i.test(image))) {
    flags.add('closeup');
  }
  if (HAT_VOCAB.test(image) || HAT_VOCAB.test(ko)) flags.add('hat');
  if (SEATED.test(image) || SEATED.test(ko)) flags.add('seated');
  if (FULLBODY.test(shot)) flags.add('fullbody');
  // 목인(나무 인형) 컷 — 사람이 쓰는 관모가 아니므로 갓 prior 규칙 대상에서 뺀다.
  if (/figurine|carved wooden|wooden figure/i.test(image) || /목인|나무\s*인형|목각/.test(ko)) flags.add('figurine');
  // 얼굴 미노출 계약: 명시적 "미노출" 선언이 있는 컷만(단순 뒷모습 구도와 구분)
  if (/미노출/.test(shot) || /얼굴\s*미노출/.test(intent)) flags.add('face_hidden');
  if (/뒷모습|정후방/.test(shot) || /directly behind/i.test(image)) flags.add('back_view');
  if (/^\s*예/.test(a2vField)) flags.add('a2v');
  if (camera && !MOVING_CAMERA.test(camera)) flags.add('static_camera');
  // 무인 컷: 한국어 의도가 무인을 말하거나, {STYLE_NOFIGURE} 토큰을 쓰고 있거나,
  // 인물 명사 없이 장면 어휘(deserted/empty)만 있는 경우.
  if (NOFIGURE_KO.test(ko) || isNoFigureToken
      || (!hasPersonNoun && /\bdeserted\b|\bempty\b|\bunmanned\b/i.test(image))) {
    if (!hands) flags.add('nofigure_intent');
  }
  // 단독 인물: 클로즈업이면서 군상·손·무인이 아니고 인물 명사가 있는 컷
  if (flags.has('closeup') && !crowd && !hands && !flags.has('nofigure_intent')
      && hasPersonNoun && !/이인|두\s*사람|2인|이인\(/.test(ko)) {
    flags.add('single_figure');
  }
  return flags;
}

/** 콘티 컷 블록 → 검사 대상 아이템 */
function toItem(cut) {
  const f = cut.fields;
  const fields = {
    image_prompt: f.image_prompt ?? '',
    motion_prompt: f.motion_prompt ?? '',
    camera: f.camera ?? '',
    style_variant: f.style_variant ?? '',
    shot_type: f.shot_type ?? '',
    intent: f.intent ?? '',
    reference_sheet: f.reference_sheet ?? '',
    a2v: f.a2v ?? '',
  };
  return {
    id: cut.id,
    source: cut.source,
    line: cut.line,
    flags: [...deriveFlags(fields)].sort(),
    fields,
  };
}

/** --json 입력(프롬프트 배열)을 아이템으로 정규화한다. 명시 flags는 도출 플래그에 합집합. */
export function normalizeJsonInput(records, sourcePath = '<json>') {
  return records.map((rec, i) => {
    const fields = {
      image_prompt: rec.image_prompt ?? (rec.kind === 'image' ? rec.text ?? '' : ''),
      motion_prompt: rec.motion_prompt ?? (rec.kind === 'video' ? rec.text ?? '' : ''),
      camera: rec.camera ?? '',
      style_variant: rec.style_variant ?? '',
      shot_type: rec.shot_type ?? '',
      intent: rec.intent ?? '',
      prompt: rec.prompt ?? (rec.kind === 'audio' ? rec.text ?? '' : ''),
      mode: rec.mode ?? '',
      reference_sheet: rec.reference_sheet ?? '',
      a2v: rec.a2v ? '예' : '',
    };
    const flags = deriveFlags(fields);
    for (const x of Array.isArray(rec.flags) ? rec.flags : []) flags.add(x);
    if (rec.a2v) flags.add('a2v');
    if (rec.subkind) flags.add(String(rec.subkind).toLowerCase()); // sfx / bgm
    return {
      id: rec.id ?? `ITEM-${String(i + 1).padStart(2, '0')}`,
      source: sourcePath,
      line: i + 1,
      flags: [...flags].sort(),
      fields,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 4. 검사 엔진
// ────────────────────────────────────────────────────────────────────────────

const rxCache = new Map();
function rx(pattern, flags = '') {
  const key = `${flags} ${pattern}`;
  let re = rxCache.get(key);
  if (!re) { re = new RegExp(pattern, flags); rxCache.set(key, re); }
  re.lastIndex = 0;
  return re;
}

function applies(rule, item) {
  const a = rule.applies_to ?? {};
  const flags = new Set(item.flags);
  if (a.flags_all && !a.flags_all.every((x) => flags.has(x))) return false;
  if (a.flags_any && !a.flags_any.some((x) => flags.has(x))) return false;
  if (a.flags_none && a.flags_none.some((x) => flags.has(x))) return false;
  return true;
}

/** detect 서술어 실행 → 위반 근거(매치 문자열 목록) 또는 null */
function detect(rule, text) {
  const d = rule.detect;
  switch (d.type) {
    case 'regex': {
      const found = [...String(text).matchAll(rx(d.pattern, d.flags?.includes('g') ? d.flags : `${d.flags ?? ''}g`))];
      if (!found.length) return null;
      return [...new Set(found.map((m) => m[0].trim()))].slice(0, 5);
    }
    case 'regex_absent': {
      if (rx(d.pattern, d.flags).test(String(text))) return null;
      return ['(필수 표현 없음)'];
    }
    case 'regex_count': {
      const found = [...String(text).matchAll(rx(d.pattern, `${(d.flags ?? '').replace('g', '')}g`))];
      const max = d.max ?? Infinity;
      const min = d.min ?? 0;
      if (found.length > max) return [`${found.length}회 (상한 ${max})`, ...new Set(found.map((m) => m[0].trim()))].slice(0, 5);
      if (found.length < min) return [`${found.length}회 (하한 ${min})`];
      return null;
    }
    case 'regex_pair': {
      const hit = rx(d.pattern, d.flags).test(String(text));
      if (!hit) return null;
      const withHit = rx(d.with, d.flags).test(String(text));
      const wantAbsent = d.with_mode === 'absent';
      if (wantAbsent ? withHit : !withHit) return null;
      const m = String(text).match(rx(d.pattern, d.flags));
      return [m ? m[0].trim() : '(매치)'];
    }
    case 'regex_unless': {
      if (rx(d.unless, d.flags).test(String(text))) return null;
      const found = [...String(text).matchAll(rx(d.pattern, `${(d.flags ?? '').replace('g', '')}g`))];
      if (!found.length) return null;
      return [...new Set(found.map((m) => m[0].trim()))].slice(0, 5);
    }
    default:
      throw new Error(`알 수 없는 detect.type: ${d.type} (rule ${rule.id})`);
  }
}

/**
 * 아이템이 어떤 레인(이미지/영상/오디오)을 가지고 있는지 판정한다.
 * 레인이 없으면 그 종류의 규칙은 적용 대상이 아니다 — 이미지 프롬프트만 넣었는데
 * 영상 규칙의 "필수 표현 없음"이 뜨는 것을 막는다.
 */
function lanesOf(item) {
  const f = item.fields;
  return {
    image: Boolean(f.image_prompt),
    video: Boolean(f.motion_prompt || f.camera),
    audio: Boolean(f.prompt || f.mode),
  };
}

/** 아이템 1건에 규칙 전체를 적용한다. */
export function checkItem(item, rules) {
  const violations = [];
  const lanes = lanesOf(item);
  for (const rule of rules) {
    if (!lanes[rule.kind]) continue;
    const field = rule.applies_to?.field ?? 'image_prompt';
    const text = item.fields[field];
    if (text === undefined || text === null) continue;
    // 빈 필드는 "표현이 없다"는 사실 자체가 판정 근거인 regex_absent 규칙에서만 평가한다.
    if (text === '' && rule.detect.type !== 'regex_absent') continue;
    if (!applies(rule, item)) continue;
    const evidence = detect(rule, text);
    if (!evidence) continue;
    violations.push({
      cut: item.id,
      source: item.source,
      line: item.line,
      rule: rule.id,
      kind: rule.kind,
      severity: rule.severity,
      title: rule.title ?? rule.id,
      field,
      evidence,
      why: rule.why,
      fix: rule.fix,
    });
  }
  return violations;
}

export function checkItems(items, rules) {
  const violations = [];
  for (const item of items) violations.push(...checkItem(item, rules));
  const errors = violations.filter((v) => v.severity === 'ERROR').length;
  const warns = violations.filter((v) => v.severity === 'WARN').length;
  return {
    ok: errors === 0,
    summary: {
      items: items.length,
      violations: violations.length,
      errors,
      warns,
      cutsWithError: new Set(violations.filter((v) => v.severity === 'ERROR').map((v) => v.cut)).size,
    },
    violations,
  };
}

/** 콘티 파일 경로 → 검사 결과 (편의 API) */
export function checkStoryboardFile(path, rulesDir = DEFAULT_RULES_DIR) {
  const md = readFileSync(path, 'utf8');
  const parsed = parseStoryboard(md, basename(path));
  const { rules } = loadRules(rulesDir);
  return { parsed, result: checkItems(parsed.cuts, rules) };
}

// ────────────────────────────────────────────────────────────────────────────
// 5. 리포트
// ────────────────────────────────────────────────────────────────────────────

function renderText(result, opts) {
  const out = [];
  const bySeverity = opts.severity === 'error'
    ? result.violations.filter((v) => v.severity === 'ERROR')
    : result.violations;

  const byCut = new Map();
  for (const v of bySeverity) {
    if (!byCut.has(v.cut)) byCut.set(v.cut, []);
    byCut.get(v.cut).push(v);
  }
  for (const [cut, list] of byCut) {
    out.push(`\n${cut}  (${list[0].source})`);
    for (const v of list) {
      const ev = v.evidence.join(' / ');
      out.push(`  [${v.severity}] ${v.rule}  ${v.field}  → ${ev}`);
      out.push(`      why: ${v.why}`);
      out.push(`      fix: ${v.fix}`);
    }
  }
  const s = result.summary;
  out.push('');
  out.push(`── 요약: 아이템 ${s.items} · 위반 ${s.violations} (ERROR ${s.errors} / WARN ${s.warns}) · ERROR 컷 ${s.cutsWithError}`);
  out.push(result.ok ? '게이트 통과 (ERROR 0)' : `게이트 불합격 — ERROR ${s.errors}건`);
  return out.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// 6. CLI
// ────────────────────────────────────────────────────────────────────────────

function parseArgv(argv) {
  const o = { files: [], format: 'text', severity: 'all', rulesDir: DEFAULT_RULES_DIR, json: null, text: null, kind: 'image', dump: false, quiet: false, listRules: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--format') o.format = argv[++i];
    else if (a === '--severity') o.severity = argv[++i];
    else if (a === '--rules') o.rulesDir = resolve(argv[++i]);
    else if (a === '--json') o.json = argv[++i];
    else if (a === '--text') o.text = argv[++i];
    else if (a === '--kind') o.kind = argv[++i];
    else if (a === '--dump') o.dump = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--list-rules') o.listRules = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else o.files.push(a);
  }
  return o;
}

const HELP = `게이트 ① 이미지·영상 프롬프트 게이트

  node scripts/gates/prompt-gate.mjs <02-storyboard.md> [...]   콘티 문서 검사
  node scripts/gates/prompt-gate.mjs --json <prompts.json>      프롬프트 배열 검사
  node scripts/gates/prompt-gate.mjs --text "<prompt>" --kind image|video|audio
  node scripts/gates/prompt-gate.mjs --dump <02-storyboard.md>  파싱·플래그 확인
  node scripts/gates/prompt-gate.mjs --list-rules               규칙 목록

  --format text|json   --severity all|error   --rules <dir>   --quiet

exit: ERROR 있으면 1, 없으면 0 (입력 오류 2)`;

function main() {
  const opts = parseArgv(process.argv.slice(2));
  if (opts.help) { console.log(HELP); process.exit(0); }

  let rules;
  let tables;
  try { ({ rules, tables } = loadRules(opts.rulesDir)); }
  catch (e) { console.error(`규칙 로딩 실패: ${e.message}`); process.exit(2); }

  if (opts.listRules) {
    for (const t of tables) console.log(`${t.kind.padEnd(6)} ${t.file.padEnd(20)} ${t.count}종  ${t.model}`);
    console.log('');
    for (const r of rules) console.log(`${r.severity.padEnd(5)} ${r.id.padEnd(28)} ${r.title ?? ''}`);
    console.log(`\n총 ${rules.length}종 (이미지 ${rules.filter((r) => r.kind === 'image').length} / 영상 ${rules.filter((r) => r.kind === 'video').length} / 오디오 ${rules.filter((r) => r.kind === 'audio').length})`);
    process.exit(0);
  }

  let items = [];
  try {
    if (opts.json) {
      const recs = JSON.parse(readFileSync(opts.json, 'utf8'));
      items = normalizeJsonInput(Array.isArray(recs) ? recs : recs.items ?? [], basename(opts.json));
    } else if (opts.text !== null) {
      items = normalizeJsonInput([{ id: 'INLINE-01', kind: opts.kind, text: opts.text }], '<text>');
    } else if (opts.files.length) {
      for (const file of opts.files) {
        const parsed = parseStoryboard(readFileSync(file, 'utf8'), basename(file));
        if (opts.dump) {
          console.log(JSON.stringify({ path: parsed.path, productionId: parsed.productionId, declaredCutCount: parsed.declaredCutCount, cuts: parsed.cuts }, null, 2));
          process.exit(0);
        }
        items.push(...parsed.cuts);
      }
    } else {
      console.log(HELP);
      process.exit(2);
    }
  } catch (e) {
    console.error(`입력 오류: ${e.message}`);
    process.exit(2);
  }

  if (!items.length) { console.error('검사 대상이 0건입니다 — 파싱 실패로 간주합니다.'); process.exit(2); }

  const result = checkItems(items, rules);
  if (!opts.quiet) {
    if (opts.format === 'json') console.log(JSON.stringify(result, null, 2));
    else console.log(renderText(result, opts));
  }
  process.exit(result.ok ? 0 : 1);
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
