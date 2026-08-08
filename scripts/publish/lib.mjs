/**
 * Danbi S7 — YouTube 업로더 공용 라이브러리
 *
 * 의존성: Node 내장 모듈만 (node:fs, node:http, node:crypto, 전역 fetch).
 * 서드파티 패키지 0개 — googleapis(≈50MB) 미사용, OAuth·resumable upload 모두 HTTPS 직접 호출.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

// ─────────────────────────────────────────────────────────────
// 경로 상수
// ─────────────────────────────────────────────────────────────

export const STUDIO_ROOT = 'E:\\ai_tool\\Danbi_Studio';
export const VAULT_ROOT = 'E:\\ai_tool\\DanbiVault';
export const SECRETS_DIR = path.join(STUDIO_ROOT, '.secrets');
export const CLIENT_SECRET_PATH = path.join(SECRETS_DIR, 'youtube-oauth-client.json');
export const TOKEN_PATH = path.join(SECRETS_DIR, 'youtube-token.json');
export const SESSION_DIR = path.join(SECRETS_DIR, 'upload-sessions');
export const PRODUCTIONS_DIR = path.join(VAULT_ROOT, '20-productions');

export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];

/** YouTube 카테고리 ID (한국 기준) */
export const CATEGORIES = {
  '교육': '27',
  'education': '27',
  '인물/블로그': '22',
  '인물': '22',
  'people': '22',
  '엔터테인먼트': '24',
};

/** YouTube API 상한 */
export const LIMITS = {
  TITLE_CHARS: 100,
  DESCRIPTION_CHARS: 5000,
  TAGS_TOTAL_CHARS: 500,
};

// ─────────────────────────────────────────────────────────────
// 에러 타입 — 호출부가 원인별로 분기할 수 있게 code를 붙인다
// ─────────────────────────────────────────────────────────────

export class DanbiError extends Error {
  constructor(code, message, hint) {
    super(message);
    this.name = 'DanbiError';
    this.code = code;
    this.hint = hint;
  }
}

export const E = {
  PARSE: 'PARSE',           // 04-publish 형식 불일치
  AUTH: 'AUTH',             // 토큰 없음/만료/거부
  QUOTA: 'QUOTA',           // 일일 쿼터 초과
  MEDIA: 'MEDIA',           // 마스터 파일 문제
  NETWORK: 'NETWORK',       // 네트워크/일시 오류
  API: 'API',               // 그 외 API 오류
  USAGE: 'USAGE',           // 인자 오류
};

// ─────────────────────────────────────────────────────────────
// 04-publish.md §0 붙여넣기 블록 파서
//
// 존재 이유: ep1 사고(§1 제목 후보 "분석 문서"가 공개 설명란에 들어감)를
// 구조적으로 차단한다. 설명란에 들어가는 것은 §0-B 코드블록 안 텍스트뿐이며,
// 형식이 어긋나면 추측하지 않고 즉시 중단한다.
// ─────────────────────────────────────────────────────────────

/** §0-B 설명문에 절대 들어오면 안 되는 내부 분석 문서의 지문 */
const INTERNAL_DOC_MARKERS = [
  '제목 후보',
  '추천 1위',
  '약속-이행 판정',
  '시리즈 정합',
  '붙여넣기 블록',
  '인간 결정 대기',
  '미실행 확인',
];

function normalizeText(raw) {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/** 지정 인덱스 이후 첫 펜스 코드블록의 내용을 반환 */
function extractFencedBlock(block, fromIdx, label) {
  const openRe = /^```[^\n]*\n/gm;
  openRe.lastIndex = fromIdx;
  const open = openRe.exec(block);
  if (!open) {
    throw new DanbiError(
      E.PARSE,
      `§0 ${label} 절 뒤에 코드블록(\`\`\`)이 없다.`,
      `04-publish.md의 "### ${label}" 바로 아래에 \`\`\` 로 감싼 블록이 있어야 한다.`
    );
  }
  const contentStart = open.index + open[0].length;
  const closeRe = /^```[ \t]*$/gm;
  closeRe.lastIndex = contentStart;
  const close = closeRe.exec(block);
  if (!close) {
    throw new DanbiError(
      E.PARSE,
      `§0 ${label} 절의 코드블록이 닫히지 않았다(\`\`\` 누락).`,
      '여는 펜스와 닫는 펜스가 짝을 이뤄야 한다.'
    );
  }
  return block.slice(contentStart, close.index).replace(/\n+$/, '');
}

function findSubsection(block, letter, nameRe) {
  const re = new RegExp(`^###[ \\t]*${letter}\\.[ \\t]*${nameRe.source}`, 'm');
  const m = re.exec(block);
  return m ? m.index + m[0].length : -1;
}

/**
 * 04-publish.md 전문을 파싱해 업로드 메타데이터를 반환한다.
 * 형식 불일치는 전부 DanbiError(E.PARSE)로 중단한다 — 부분 추측 금지.
 */
export function parsePublishDoc(rawText, sourcePath) {
  const text = normalizeText(rawText);

  // ── frontmatter
  const fmMatch = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fmMatch) {
    throw new DanbiError(E.PARSE, `frontmatter(--- 블록)가 없다: ${sourcePath}`);
  }
  const fm = fmMatch[1];
  const productionId = (/^production_id:[ \t]*(.+)$/m.exec(fm)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
  const existingVideoId = (/^video_id:[ \t]*(.*)$/m.exec(fm)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
  if (!productionId) {
    throw new DanbiError(E.PARSE, `frontmatter에 production_id가 없다: ${sourcePath}`);
  }

  // ── §0 붙여넣기 블록 위치
  const zeroRe = /^##[ \t]+0\.[ \t]*붙여넣기[ \t]*블록[ \t]*$/m;
  const zero = zeroRe.exec(text);
  if (!zero) {
    throw new DanbiError(
      E.PARSE,
      `§0 블록 필요 — "## 0. 붙여넣기 블록" 절을 찾을 수 없다: ${sourcePath}`,
      [
        '이 문서는 §0 붙여넣기 블록이 없는 구형식이다. 업로더는 구형식을 자동 처리하지 않는다.',
        '(ep1 사고 — 내부 분석 문서가 공개 설명란에 들어감 — 재발 방지를 위한 의도적 제약이다.)',
        '해결: 90-templates/tpl-publish.md의 §0 규격에 맞춰 A/B/C/D 절을 작성한 뒤 다시 실행하라.',
      ].join('\n         ')
    );
  }

  // §0 블록의 끝 = zero 이후 첫 "## " 헤딩(= §0-2 등) 또는 문서 끝
  const afterZero = zero.index + zero[0].length;
  const nextH2 = /^##[ \t]+/m;
  nextH2.lastIndex = 0;
  const tail = text.slice(afterZero);
  const nextMatch = nextH2.exec(tail);
  const zeroBlock = nextMatch ? tail.slice(0, nextMatch.index) : tail;

  // ── A. 제목
  const aIdx = findSubsection(zeroBlock, 'A', /제목/);
  if (aIdx < 0) throw new DanbiError(E.PARSE, '§0 블록에 "### A. 제목" 절이 없다.', '§0 규격: A 제목 / B 설명문 / C 태그 / D 업로드 설정');
  const titleRaw = extractFencedBlock(zeroBlock, aIdx, 'A. 제목');
  const titleLines = titleRaw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (titleLines.length !== 1) {
    throw new DanbiError(
      E.PARSE,
      `§0-A 제목 코드블록은 정확히 1줄이어야 한다 (현재 ${titleLines.length}줄).`,
      '여러 후보를 남겨두지 말고 확정안 1줄만 넣어라.'
    );
  }
  const title = titleLines[0];
  if (title.length > LIMITS.TITLE_CHARS) {
    throw new DanbiError(E.PARSE, `§0-A 제목이 YouTube 상한 ${LIMITS.TITLE_CHARS}자를 초과했다 (${title.length}자).`);
  }
  if (/[<>]/.test(title)) {
    throw new DanbiError(E.PARSE, '§0-A 제목에 YouTube가 금지하는 문자(< 또는 >)가 있다.');
  }

  // ── B. 설명문
  const bIdx = findSubsection(zeroBlock, 'B', /설명문/);
  if (bIdx < 0) throw new DanbiError(E.PARSE, '§0 블록에 "### B. 설명문" 절이 없다.');
  const description = extractFencedBlock(zeroBlock, bIdx, 'B. 설명문');
  if (!description.trim()) {
    throw new DanbiError(E.PARSE, '§0-B 설명문 코드블록이 비어 있다.');
  }
  if (description.length > LIMITS.DESCRIPTION_CHARS) {
    throw new DanbiError(
      E.PARSE,
      `§0-B 설명문이 YouTube 상한 ${LIMITS.DESCRIPTION_CHARS}자를 초과했다 (${description.length}자).`
    );
  }
  // ep1 사고 차단: 내부 분석 문서의 지문이 설명문에 섞였는가
  const leaked = INTERNAL_DOC_MARKERS.filter((m) => description.includes(m));
  if (leaked.length > 0) {
    throw new DanbiError(
      E.PARSE,
      `§0-B 설명문에 내부 분석 문서의 표현이 섞여 있다: ${leaked.join(', ')}`,
      'ep1 사고(내부 분석이 공개 설명란에 게시됨)와 같은 형태다. §0-B에는 시청자에게 보일 문장만 넣어라.'
    );
  }

  // ── C. 태그
  const cIdx = findSubsection(zeroBlock, 'C', /태그/);
  if (cIdx < 0) throw new DanbiError(E.PARSE, '§0 블록에 "### C. 태그" 절이 없다.');
  const tagsRaw = extractFencedBlock(zeroBlock, cIdx, 'C. 태그');
  const tags = tagsRaw
    .split('\n')
    .join(',')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length === 0) {
    throw new DanbiError(E.PARSE, '§0-C 태그 코드블록이 비어 있다.');
  }
  const tagsTotal = tags.join(',').length;
  if (tagsTotal > LIMITS.TAGS_TOTAL_CHARS) {
    throw new DanbiError(
      E.PARSE,
      `§0-C 태그 총 길이가 YouTube 상한 ${LIMITS.TAGS_TOTAL_CHARS}자를 초과했다 (${tagsTotal}자, ${tags.length}개).`
    );
  }

  // ── D. 업로드 설정
  const dIdx = findSubsection(zeroBlock, 'D', /업로드/);
  if (dIdx < 0) throw new DanbiError(E.PARSE, '§0 블록에 "### D. 업로드 화면 부가 설정" 절이 없다.');
  const dBlock = zeroBlock.slice(dIdx);

  const videoPath = /^[-*][ \t]*영상[ \t]*파일[ \t]*:[ \t]*`([^`]+)`/m.exec(dBlock)?.[1]?.trim();
  if (!videoPath) {
    throw new DanbiError(
      E.PARSE,
      '§0-D에 "영상 파일" 항목이 없다.',
      '형식: - 영상 파일: `D:\\DanbiArchive\\releases\\<production_id>-vN-master.mp4`'
    );
  }
  const thumbnailPath = /^[-*][ \t]*썸네일[ \t]*파일[ \t]*:[ \t]*`([^`]+)`/m.exec(dBlock)?.[1]?.trim() ?? null;
  const playlistNote = /^[-*][ \t]*재생목록[ \t]*:[ \t]*(.+)$/m.exec(dBlock)?.[1]?.trim() ?? null;

  // 변형·합성 콘텐츠 고지 — "권장" 또는 "필수"면 켠다
  const syntheticLine = dBlock.split('\n').find((l) => /변형[·\/]?합성/.test(l)) ?? null;
  const containsSyntheticMedia = syntheticLine ? /권장|필수|체크|예|true/i.test(syntheticLine) : false;

  // 카테고리 — D절에 명시가 없으면 기본 교육(27)
  const catRaw = /^[-*][ \t]*카테고리[ \t]*:[ \t]*(.+)$/m.exec(dBlock)?.[1]?.trim() ?? null;
  let categoryId = '27';
  let categorySource = 'default(교육/27 — D절 미지정)';
  if (catRaw) {
    const key = catRaw.replace(/[`"'*]/g, '').split(/[(（]/)[0].trim();
    const hit = CATEGORIES[key] ?? CATEGORIES[key.toLowerCase()] ?? (/^\d+$/.test(key) ? key : null);
    if (!hit) {
      throw new DanbiError(E.PARSE, `§0-D 카테고리 값을 해석할 수 없다: "${catRaw}"`, `허용: ${Object.keys(CATEGORIES).join(' / ')} 또는 숫자 ID`);
    }
    categoryId = hit;
    categorySource = `04-publish §0-D ("${key}")`;
  }

  return {
    sourcePath,
    productionId,
    existingVideoId: existingVideoId || null,
    title,
    description,
    tags,
    tagsTotal,
    videoPath,
    thumbnailPath,
    playlistNote,
    containsSyntheticMedia,
    syntheticLine,
    categoryId,
    categorySource,
  };
}

/** production_id 또는 04-publish.md 경로 → 04-publish.md 절대 경로 */
export function resolvePublishPath(arg) {
  if (!arg) throw new DanbiError(E.USAGE, 'production_id 또는 04-publish.md 경로가 필요하다.');
  if (/04-publish\.md$/i.test(arg)) {
    if (!fs.existsSync(arg)) throw new DanbiError(E.USAGE, `파일이 없다: ${arg}`);
    return path.resolve(arg);
  }
  const p = path.join(PRODUCTIONS_DIR, arg, '04-publish.md');
  if (!fs.existsSync(p)) {
    const available = fs.existsSync(PRODUCTIONS_DIR) ? fs.readdirSync(PRODUCTIONS_DIR).join(', ') : '(없음)';
    throw new DanbiError(E.USAGE, `04-publish.md가 없다: ${p}`, `사용 가능한 production_id: ${available}`);
  }
  return p;
}

// ─────────────────────────────────────────────────────────────
// 마스터 파일 검증
// ─────────────────────────────────────────────────────────────

export function probeVideo(videoPath) {
  if (!fs.existsSync(videoPath)) {
    throw new DanbiError(E.MEDIA, `마스터 영상 파일이 없다: ${videoPath}`, '§0-D "영상 파일" 경로를 확인하라.');
  }
  const stat = fs.statSync(videoPath);
  if (!stat.isFile() || stat.size === 0) {
    throw new DanbiError(E.MEDIA, `마스터 영상이 비어 있거나 파일이 아니다: ${videoPath}`);
  }

  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', videoPath], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    throw new DanbiError(
      E.MEDIA,
      `ffprobe 실행 실패: ${r.error?.message ?? r.stderr?.trim() ?? `exit ${r.status}`}`,
      'ffprobe가 PATH에 있어야 한다.'
    );
  }

  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    throw new DanbiError(E.MEDIA, 'ffprobe 출력을 파싱할 수 없다.');
  }

  const v = json.streams?.find((s) => s.codec_type === 'video');
  const a = json.streams?.find((s) => s.codec_type === 'audio');
  if (!v) throw new DanbiError(E.MEDIA, `비디오 스트림이 없다: ${videoPath}`);

  const duration = Number(json.format?.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new DanbiError(E.MEDIA, `영상 길이를 읽을 수 없다(손상 의심): ${videoPath}`);
  }

  const [fpsNum, fpsDen] = String(v.r_frame_rate ?? '0/1').split('/').map(Number);
  return {
    path: videoPath,
    size: stat.size,
    sizeHuman: `${(stat.size / 1024 ** 3).toFixed(2)} GB`,
    container: json.format?.format_name ?? '?',
    duration,
    durationHuman: formatDuration(duration),
    width: v.width,
    height: v.height,
    videoCodec: v.codec_name,
    fps: fpsDen ? +(fpsNum / fpsDen).toFixed(3) : null,
    audioCodec: a?.codec_name ?? null,
    audioChannels: a?.channels ?? null,
    audioRate: a?.sample_rate ?? null,
    hasAudio: Boolean(a),
    mimeType: 'video/mp4',
  };
}

export function formatDuration(sec) {
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// 예약 공개(status.publishAt) 시각 계산
//
// YouTube Data API v3 규약:
//   · status.publishAt 은 RFC 3339 타임스탬프여야 한다 (오프셋 포함).
//   · status.privacyStatus 가 반드시 private 이어야 한다. public/unlisted 와
//     함께 보내면 무시되거나 거부된다.
//   · 과거 시각은 거부되거나 즉시 공개로 이어질 수 있다.
//
// 여기서는 호스트 타임존에 의존하지 않는다. 문자열을 부품으로 뜯어
// Date.UTC + 오프셋으로 epoch 를 직접 만든다. (new Date("2026-08-08T18:12:01")
// 은 호스트 로컬 타임존으로 해석되므로 쓰지 않는다.)
// ─────────────────────────────────────────────────────────────

/** 기본 타임존 — KST(+09:00) */
export const DEFAULT_TZ = '+09:00';

const TZ_ALIASES = { KST: 540, UTC: 0, Z: 0, GMT: 0 };
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** 분 단위 오프셋 → "+09:00" */
export function formatOffsetLabel(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** 분 단위 오프셋 → 표시용 존 이름 */
export function zoneName(minutes) {
  if (minutes === 540) return 'KST';
  if (minutes === 0) return 'UTC';
  return `UTC${formatOffsetLabel(minutes)}`;
}

/** "+09:00" | "+0900" | "+9" | "Z" | "UTC" | "KST" → { minutes, label } */
export function parseTimezoneOffset(tz) {
  if (tz === undefined || tz === null || String(tz).trim() === '') {
    return parseTimezoneOffset(DEFAULT_TZ);
  }
  const t = String(tz).trim();
  const alias = TZ_ALIASES[t.toUpperCase()];
  if (alias !== undefined) return { minutes: alias, label: formatOffsetLabel(alias) };
  const m = /^([+-])(\d{1,2}):?(\d{2})?$/.exec(t);
  if (!m) {
    throw new DanbiError(
      E.USAGE,
      `타임존 오프셋을 해석할 수 없다: "${tz}"`,
      '형식: +09:00 / -05:00 / +0900 / +9 / Z / UTC / KST  (IANA 지역명(Asia/Seoul)과 서머타임은 지원하지 않는다)'
    );
  }
  const hh = Number(m[2]);
  const mm = Number(m[3] ?? 0);
  if (hh > 14 || mm > 59) throw new DanbiError(E.USAGE, `타임존 오프셋 범위를 벗어났다: "${tz}"`);
  const minutes = (m[1] === '-' ? -1 : 1) * (hh * 60 + mm);
  return { minutes, label: formatOffsetLabel(minutes) };
}

const ABS_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?[ \t]*(Z|z|[+-]\d{1,2}:?\d{2}|[+-]\d{1,2})?$/;

/**
 * 절대 시각 문자열 → { epochMs, offsetMinutes, offsetLabel, explicitOffset }
 * 오프셋이 생략되면 tzDefault(기본 KST)로 해석한다.
 */
export function parsePublishAtInput(input, tzDefault = DEFAULT_TZ) {
  const raw = String(input ?? '').trim();
  const m = ABS_TIME_RE.exec(raw);
  if (!m) {
    throw new DanbiError(
      E.USAGE,
      `--publish-at 값을 해석할 수 없다: "${raw}"`,
      [
        'RFC 3339 형식이어야 한다. 예: 2026-08-08T18:12:01+09:00',
        `오프셋을 생략하면 --timezone(기본 ${DEFAULT_TZ})으로 해석한다. 예: "2026-08-08 18:12"`,
        '날짜만(2026-08-08) 주는 것은 허용하지 않는다 — 시각이 모호해진다.',
      ].join('\n         ')
    );
  }
  const [, Y, Mo, D, H, Mi, S, off] = m;
  const tz = parseTimezoneOffset(off ? (/^[Zz]$/.test(off) ? 'Z' : off) : tzDefault);
  const y = +Y, mo = +Mo, d = +D, h = +H, mi = +Mi, s = S ? +S : 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) {
    throw new DanbiError(E.USAGE, `--publish-at 값의 날짜·시각 범위가 잘못됐다: "${raw}"`);
  }
  const localMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const chk = new Date(localMs);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) {
    throw new DanbiError(E.USAGE, `--publish-at 값이 달력에 없는 날짜다: "${raw}"`);
  }
  return {
    epochMs: localMs - tz.minutes * 60_000,
    offsetMinutes: tz.minutes,
    offsetLabel: tz.label,
    explicitOffset: Boolean(off),
  };
}

/** "6h" | "30m" | "2d" | "1d6h30m" → 밀리초 */
export function parseRelativeDuration(input) {
  const raw = String(input ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m || !m.slice(1).some((g) => g !== undefined)) {
    throw new DanbiError(
      E.USAGE,
      `--publish-in 값을 해석할 수 없다: "${input}"`,
      '형식: 6h / 30m / 2d / 1d6h30m  (d=일, h=시간, m=분, s=초). 단위 없는 숫자는 허용하지 않는다.'
    );
  }
  const ms =
    Number(m[1] ?? 0) * 86_400_000 +
    Number(m[2] ?? 0) * 3_600_000 +
    Number(m[3] ?? 0) * 60_000 +
    Number(m[4] ?? 0) * 1000;
  if (ms <= 0) {
    throw new DanbiError(E.USAGE, `--publish-in 값이 0이다: "${input}"`, '예약 시각은 반드시 미래여야 한다.');
  }
  return ms;
}

/** epoch → 지정 오프셋의 RFC 3339 문자열 ("2026-08-08T18:12:01+09:00") */
export function formatOffsetIso(epochMs, offsetMinutes) {
  const d = new Date(epochMs + offsetMinutes * 60_000);
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}` +
    formatOffsetLabel(offsetMinutes)
  );
}

/** epoch → "2026년 8월 8일(토) 오후 6시 12분" */
export function formatKoreanTime(epochMs, offsetMinutes) {
  const d = new Date(epochMs + offsetMinutes * 60_000);
  const h24 = d.getUTCHours();
  const ampm = h24 < 12 ? '오전' : '오후';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return (
    `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` +
    `(${WEEKDAY_KO[d.getUTCDay()]}) ${ampm} ${h12}시 ${String(d.getUTCMinutes()).padStart(2, '0')}분`
  );
}

/** 밀리초 간격 → "5시간 59분" */
export function formatRemaining(ms) {
  if (ms < 0) return `${formatRemaining(-ms)} 전(이미 지남)`;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}일`);
  if (h) parts.push(`${h}시간`);
  if (m || parts.length === 0) parts.push(`${m}분`);
  return parts.join(' ');
}

/** 예약 시각 1건을 사람이 읽는 형태로 묶어 반환 */
export function describePublishAt(epochMs, offsetMinutes) {
  return {
    epochMs,
    iso: formatOffsetIso(epochMs, offsetMinutes),
    human: formatKoreanTime(epochMs, offsetMinutes),
    zone: zoneName(offsetMinutes),
    utcIso: new Date(epochMs).toISOString(),
  };
}

/** 예약 시각이 미래인지 확인. 아니면 DanbiError(USAGE). */
export function assertFuturePublishAt(epochMs, offsetMinutes, { nowMs = Date.now(), minLeadMs = 60_000, where = '--publish-at' } = {}) {
  const d = describePublishAt(epochMs, offsetMinutes);
  if (epochMs <= nowMs) {
    throw new DanbiError(
      E.USAGE,
      `${where} 값이 과거다: ${d.iso} (= ${d.human} ${d.zone})`,
      `지금은 ${formatOffsetIso(nowMs, offsetMinutes)} 다. YouTube는 과거 publishAt을 거부하거나 즉시 공개해 버린다.`
    );
  }
  if (epochMs < nowMs + minLeadMs) {
    throw new DanbiError(
      E.USAGE,
      `${where} 값이 너무 임박했다: ${d.iso} (남은 시간 ${Math.round((epochMs - nowMs) / 1000)}초)`,
      `업로드가 끝나기 전에 시각이 지나면 즉시 공개된다. 최소 ${Math.round(minLeadMs / 1000)}초 뒤로 잡아라.`
    );
  }
  return d;
}

// ─────────────────────────────────────────────────────────────
// OAuth — 클라이언트 시크릿 / 토큰
// ─────────────────────────────────────────────────────────────

export function loadClientSecret() {
  if (!fs.existsSync(CLIENT_SECRET_PATH)) {
    throw new DanbiError(
      E.AUTH,
      `OAuth 클라이언트 파일이 없다: ${CLIENT_SECRET_PATH}`,
      'Google Cloud Console에서 발급한 데스크톱 앱 클라이언트 JSON을 이 경로에 두어라.'
    );
  }
  const j = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf8'));
  const c = j.installed ?? j.web;
  if (!c?.client_id || !c?.client_secret) {
    throw new DanbiError(E.AUTH, 'OAuth 클라이언트 JSON 형식이 아니다(installed/web 키 없음).');
  }
  // 값은 반환만 하고 절대 로그로 출력하지 않는다.
  return { clientId: c.client_id, clientSecret: c.client_secret, tokenUri: c.token_uri ?? 'https://oauth2.googleapis.com/token', authUri: c.auth_uri ?? 'https://accounts.google.com/o/oauth2/auth' };
}

export function saveToken(tok) {
  fs.mkdirSync(SECRETS_DIR, { recursive: true });
  const tmp = TOKEN_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tok, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, TOKEN_PATH);
}

export function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new DanbiError(
      E.AUTH,
      `인증 토큰이 없다: ${TOKEN_PATH}`,
      '인간이 1회 실행: node scripts/publish/auth.mjs   (브라우저 동의 필요 — 에이전트 실행 금지)'
    );
  }
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}

/** 유효한 access_token을 반환한다. 만료되었으면 refresh_token으로 무인 갱신. */
export async function getAccessToken() {
  const tok = loadToken();
  if (tok.access_token && tok.expiry && Date.now() < tok.expiry - 60_000) {
    return tok.access_token;
  }
  if (!tok.refresh_token) {
    throw new DanbiError(E.AUTH, '토큰 파일에 refresh_token이 없다.', 'node scripts/publish/auth.mjs 를 인간이 다시 실행해야 한다.');
  }

  const { clientId, clientSecret, tokenUri } = loadClientSecret();
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    let reason = body;
    try { reason = JSON.parse(body).error_description ?? JSON.parse(body).error ?? body; } catch {}
    throw new DanbiError(
      E.AUTH,
      `액세스 토큰 갱신 실패 (HTTP ${res.status}): ${reason}`,
      [
        '흔한 원인:',
        '  · 동의 화면이 "테스트" 상태 → 리프레시 토큰 7일 만료 (invalid_grant)',
        '  · 사용자가 계정 설정에서 앱 접근 권한을 철회',
        '해결: 인간이 node scripts/publish/auth.mjs 재실행',
      ].join('\n         ')
    );
  }
  const j = JSON.parse(body);
  const next = {
    ...tok,
    access_token: j.access_token,
    expiry: Date.now() + (j.expires_in ?? 3600) * 1000,
    scope: j.scope ?? tok.scope,
  };
  saveToken(next);
  return next.access_token;
}

// ─────────────────────────────────────────────────────────────
// API 오류 분류
// ─────────────────────────────────────────────────────────────

export function classifyApiError(status, bodyText) {
  let err = {};
  try { err = JSON.parse(bodyText)?.error ?? {}; } catch {}
  const reason = err.errors?.[0]?.reason ?? err.status ?? '';
  const msg = err.message ?? bodyText?.slice(0, 400) ?? '';

  if (status === 401) {
    return new DanbiError(E.AUTH, `인증 만료·무효 (401): ${msg}`, '인간이 node scripts/publish/auth.mjs 재실행 후 같은 명령을 다시 실행하라(resumable 세션은 이어서 재개된다).');
  }
  if (status === 403 && /quotaExceeded|dailyLimitExceeded|rateLimitExceeded|userRateLimitExceeded/i.test(reason)) {
    return new DanbiError(
      E.QUOTA,
      `쿼터 초과 (403 ${reason}): ${msg}`,
      '업로드 1회 = 1600 units, 일 한도 10,000 units(≈6회). 태평양시 자정 리셋. 내일 같은 명령 재실행 시 resumable 세션이 이어진다.',
    );
  }
  if (status === 403 && /uploadLimitExceeded/i.test(reason)) {
    return new DanbiError(E.QUOTA, `채널 업로드 횟수 한도 초과 (403 ${reason}): ${msg}`, '24시간 후 재시도.');
  }
  if (status === 403) {
    return new DanbiError(E.API, `권한 거부 (403 ${reason}): ${msg}`, '스코프 부족 또는 채널 권한 문제. auth.mjs 재실행으로 스코프를 다시 동의하라.');
  }
  if (status === 400 && /youtubeSignupRequired|invalidVideoMetadata|invalidTags|invalidDescription|invalidTitle/i.test(reason)) {
    return new DanbiError(E.API, `메타데이터 거부 (400 ${reason}): ${msg}`, '04-publish §0 블록 내용을 수정하라.');
  }
  if (status === 404) {
    return new DanbiError(E.NETWORK, `resumable 세션 만료·소실 (404): ${msg}`, '--restart 로 새 세션을 시작하라(업로드를 처음부터 다시 전송한다).');
  }
  if (status >= 500) {
    return new DanbiError(E.NETWORK, `서버 일시 오류 (${status}): ${msg}`, '자동 재시도 대상.');
  }
  return new DanbiError(E.API, `API 오류 (${status} ${reason}): ${msg}`);
}

// ─────────────────────────────────────────────────────────────
// vault 원자적 쓰기 (CLAUDE.md §6-8)
// ─────────────────────────────────────────────────────────────

export function atomicWrite(filePath, content) {
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

/** 04-publish.md frontmatter에 video_id/url/published_at을 기입하고 §게시 결과를 append */
export function writeBackPublishResult(publishPath, result) {
  const raw = fs.readFileSync(publishPath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let text = raw;

  // frontmatter 범위
  const fmEnd = text.indexOf('\n---', 4);
  if (fmEnd < 0) throw new DanbiError(E.PARSE, 'frontmatter 종료(---)를 찾을 수 없다.');
  let fm = text.slice(0, fmEnd);
  const rest = text.slice(fmEnd);

  // 예약 공개가 실제로 걸렸으면 state는 published가 아니라 scheduled다.
  const sch = result.schedule ?? null;
  const scheduled = Boolean(sch?.applied);
  const ytFields = [
    `state: ${scheduled ? 'scheduled' : 'published'}`,
    `url: "${result.url}"`,
    `published_at: "${result.publishedAt}"`,
    `visibility: ${result.visibility}`,
    ...(sch ? [`publish_at: "${scheduled ? sch.iso : ''}"`] : []),
  ];

  fm = fm.replace(/^video_id:.*$/m, `video_id: "${result.videoId}"`);
  fm = fm.replace(/^([ \t]*youtube:).*$/m, `$1 { ${ytFields.join(', ')} }`);
  fm = fm.replace(/^updated:.*$/m, `updated: ${result.publishedAt.slice(0, 10)}`);

  text = fm + rest;

  const section = [
    '',
    `## 게시 결과 — 자동 기입 (upload.mjs, ${result.publishedAt})`,
    '',
    '| 항목 | 값 |',
    '|---|---|',
    `| video_id | \`${result.videoId}\` |`,
    `| URL | ${result.url} |`,
    `| 공개 범위 | ${result.visibility} |`,
    `| 게시 시각 | ${result.publishedAt} |`,
    ...(sch
      ? [
          `| 예약 공개 요청 | ${sch.iso} = ${sch.human} ${sch.zone} |`,
          `| 예약 기준 | ${sch.basis} |`,
          `| 예약 적용 | ${scheduled
            ? `✅ 적용됨 — API 재조회 확인: status.privacyStatus=\`${sch.actualPrivacyStatus}\`, status.publishAt=\`${sch.actualPublishAt}\``
            : `❌ 미적용 (${sch.reason}) — 영상은 \`${result.visibility}\` 상태로 남아 있다. 스튜디오에서 수동 예약 필요`} |`,
        ]
      : []),
    `| 업로드 주체 | \`scripts/publish/upload.mjs\` (YouTube Data API v3, resumable) |`,
    `| 제목 | ${result.title} |`,
    `| 태그 수 | ${result.tagCount}개 |`,
    `| 카테고리 | ${result.categoryId} (${result.categorySource}) |`,
    `| 아동용 | 아님 (selfDeclaredMadeForKids=false) |`,
    `| 변형·합성 고지 | ${result.syntheticApplied === true ? 'API 필드 적용됨' : result.syntheticApplied === 'manual' ? '⚠ API 미적용 — 스튜디오에서 수동 체크 필요' : '해당 없음'} |`,
    `| 썸네일 | ${result.thumbnail ?? '미설정'} |`,
    `| 재생목록 | ${result.playlist ?? '미추가'} |`,
    `| 마스터 | \`${result.videoPath}\` |`,
    '',
    ...(result.notes?.length ? ['**후속 확인 사항**', '', ...result.notes.map((n) => `- ${n}`), ''] : []),
  ].join(eol);

  atomicWrite(publishPath, text.replace(/\s*$/, eol) + section + eol);
}

/**
 * 이미 업로드된 영상에 예약 공개만 건 경우(--schedule-only)의 기록.
 * 게시 결과표는 건드리지 않고 frontmatter의 youtube 상태와 짧은 절만 덧붙인다.
 */
export function writeBackScheduleResult(publishPath, sch) {
  const raw = fs.readFileSync(publishPath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const fmEnd = raw.indexOf('\n---', 4);
  if (fmEnd < 0) throw new DanbiError(E.PARSE, 'frontmatter 종료(---)를 찾을 수 없다.');
  let fm = raw.slice(0, fmEnd);
  const rest = raw.slice(fmEnd);

  if (sch.applied) {
    fm = fm.replace(/^([ \t]*youtube:)[ \t]*\{([^}]*)\}[ \t]*$/m, (_all, key, inner) => {
      let body = inner
        .replace(/state:[ \t]*[A-Za-z_]+/, 'state: scheduled')
        .replace(/publish_at:[ \t]*"[^"]*"[,]?[ \t]*/, '');
      body = body.trim().replace(/,$/, '');
      return `${key} { ${body}, publish_at: "${sch.iso}" }`;
    });
  }

  const section = [
    '',
    `## 예약 공개 설정 — 자동 기입 (upload.mjs --schedule-only, ${sch.recordedAt})`,
    '',
    '| 항목 | 값 |',
    '|---|---|',
    `| video_id | \`${sch.videoId}\` |`,
    `| 예약 공개 요청 | ${sch.iso} = ${sch.human} ${sch.zone} |`,
    `| 예약 기준 | ${sch.basis} |`,
    `| 예약 적용 | ${sch.applied
      ? `✅ 적용됨 — API 재조회 확인: status.privacyStatus=\`${sch.actualPrivacyStatus}\`, status.publishAt=\`${sch.actualPublishAt}\``
      : `❌ 미적용 (${sch.reason})`} |`,
    '',
  ].join(eol);

  atomicWrite(publishPath, (fm + rest).replace(/\s*$/, eol) + section + eol);
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function isWindows() {
  return os.platform() === 'win32';
}
