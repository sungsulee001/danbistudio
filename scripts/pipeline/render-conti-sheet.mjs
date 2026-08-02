#!/usr/bin/env node
// ---------------------------------------------------------------------------
// render-conti-sheet.mjs — 콘티 시트(전통 양식 그리드) 생성기
// ---------------------------------------------------------------------------
// 왜: `02-storyboard.md`는 컷마다 필드 블록이 세로로 이어지는 **기계 가독** 형식이다
//     (컴파일러·게이트가 소비하는 리터럴 계약). 인간은 이 형식으로 "흐름"을 훑을 수 없다.
//     업계 콘티 양식은 **행=컷 / 열=화면·내용·오디오·시간**의 그리드다. 이 스크립트는
//     같은 데이터를 그 그리드로 **표현만** 바꾼다 — 원문은 읽기만 하고 절대 수정하지 않는다.
//
// 입력:  02-storyboard.md 경로
// 출력:  콘티 시트 HTML 1장 (외부 의존 0 · 인라인 CSS/JS · 상대 경로 이미지)
//
// 사용:
//   node scripts/pipeline/render-conti-sheet.mjs <02-storyboard.md> [옵션]
//     --out <파일>          출력 HTML 경로 (기본: frontmatter media_root\09-boards\conti-sheet.html)
//     --boards-dir <폴더>   board 파일명을 붙일 기준 폴더 (기본: output_path의 02-cuts → media_root\02-cuts)
//     --previews-dir <폴더> 저해상도 프리뷰 폴더 (기본: <출력폴더>\previews → media_root\09-boards\previews)
//     --title "<문자열>"    시트 제목 override
//     --no-ensure-tree      D10 에피소드 트리 자동 생성 비활성화
//     --quiet               요약 로그 억제
//
// 이미지 슬롯 3단 우선순위(S4 전후 자동 전환):
//   ① 최종 컷 이미지 — `board` 필드가 가리키는 파일이 실재하면 그것(S4 이후)
//   ② 저해상도 프리뷰 — `09-boards\previews\CUT-NN.png`. `PREVIEW` 배지 + 흐린 테두리로 최종본이 아님을 명시.
//      ⚠ 프리뷰 **생성은 별도 에이전트 소관**이다. 이 스크립트는 표시 계약만 지킨다(생성하지 않는다).
//   ③ 빈 프레임 + 구도 요약 — 둘 다 없을 때(S3 직후 검토 모드)
//   즉 S3 직후 곧바로 쓸 수 있고, 프리뷰·최종본이 붙는 만큼 자동으로 그림이 올라온다.
// ---------------------------------------------------------------------------

import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MEDIA_ROOT, EPISODE_SUBDIRS, ensureEpisodeTree } from './lib/media-paths.mjs';

// ---------------------------------------------------------------------------
// 0. 인자
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) { args._.push(token); continue; }
    const key = token.slice(2);
    if (key === 'no-ensure-tree' || key === 'quiet') { args[key] = true; continue; }
    args[key] = argv[i + 1];
    i += 1;
  }
  return args;
}

// ---------------------------------------------------------------------------
// 1. 파싱 — 원문 무수정 · 읽기 전용
// ---------------------------------------------------------------------------

const normalizeNewlines = (text) => String(text).replace(/\r\n?/g, '\n');

/** frontmatter(YAML 아님 — 라인 단위 최소 파서). 배열·따옴표·백슬래시 이스케이프만 처리한다. */
function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-z_][a-z_0-9]*):\s*(.*)$/i);
    if (!field) continue;
    let value = field[2].replace(/\s+#.*$/, '').trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      out[field[1]] = value.slice(1, -1).split(',').map((v) => v.trim()).filter(Boolean);
      continue;
    }
    if (/^"(.*)"$/.test(value)) value = value.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\"/g, '"');
    else if (/^'(.*)'$/.test(value)) value = value.slice(1, -1);
    out[field[1]] = value;
  }
  return out;
}

// 컷 헤딩 — 접미 컷(CUT-40A) 지원. compile-storyboard.mjs `parseStoryboard()`와 동일 규약.
const CUT_HEADING_RE = /^### (CUT-\d{2,3}[A-Z]?)\s*$/m;
const CUT_SPLIT_RE = /^### (CUT-\d{2,3}[A-Z]?)\s*$/m;

/** 컷 블록에서 단일 라인 필드를 읽는다. 값이 다음 줄로 이어지는 형태는 쓰지 않는다(문서 계약). */
function readField(body, name) {
  const found = body.match(new RegExp(`^- \\*\\*${name}\\*\\*:\\s*(.*)$`, 'm'));
  if (!found) return undefined;
  const value = found[1].replace(/<!--[\s\S]*?-->/g, '').trim();
  return value === '' ? undefined : value;
}

/**
 * image_prompt는 중첩 리스트다: `  - 의도:` / `  - 컴파일본:`. 각 항목은 여러 줄로 접힐 수 있다.
 * 정규식 한 방(`$` 멀티라인)이 첫 줄에서 조기 종료하는 함정이 있어 라인 스캔으로 읽는다.
 */
function readImagePrompt(body) {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => /^- \*\*image_prompt\*\*:/.test(line));
  if (start === -1) return { intent: undefined, compiled: undefined };
  const buckets = {};
  let current = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^- \*\*/.test(line) || /^#{1,6}\s/.test(line)) break;   // 다음 필드/헤딩에서 종료
    const head = line.match(/^\s{1,}[-*]\s*(의도|컴파일본)\s*:\s*(.*)$/);
    if (head) { current = head[1]; buckets[current] = [head[2]]; continue; }
    if (current && line.trim()) buckets[current].push(line.trim());
  }
  return {
    intent: buckets['의도']?.join(' ').trim() || undefined,
    compiled: buckets['컴파일본']?.join(' ').trim() || undefined,
  };
}

const NO_VALUE = new Set(['—', '-', '–', '(S4 기입)', '(s4 기입)', '(S4 기입 대기)']);
const isEmptyValue = (value) => !value || NO_VALUE.has(value.trim());

function parseCuts(markdown) {
  const sections = markdown.split(CUT_SPLIT_RE);
  const cuts = [];
  for (let i = 1; i < sections.length; i += 2) {
    const id = sections[i];
    const body = sections[i + 1];
    const base = Number(id.slice(4).match(/^\d+/)[0]);
    const suffix = id.match(/[A-Z]$/) ? id.charCodeAt(id.length - 1) - 64 : 0;
    const image = readImagePrompt(body);

    const cut = {
      id,
      no: base + suffix / 100,
      start: Number(readField(body, 'start_seconds')?.match(/-?[\d.]+/)?.[0]),
      duration: Number(readField(body, 'duration_seconds')?.match(/[\d.]+/)?.[0]),
      scene: readField(body, 'scene')?.match(/N\d{2}/)?.[0]
        ?? readField(body, 'narration_ref')?.match(/N\d{2}/)?.[0],
      shotType: readField(body, 'shot_type'),
      camera: readField(body, 'camera'),
      motionPrompt: readField(body, 'motion_prompt'),
      motion: readField(body, 'motion'),
      intent: image.intent,
      compiled: image.compiled,
      narration: readField(body, 'narration_ref'),
      lineMap: readField(body, 'line_map'),
      soundTiming: readField(body, 'sound_timing'),
      subtitle: readField(body, 'subtitle'),
      transition: readField(body, 'transition'),
      bgmCue: readField(body, 'bgm_cue'),
      chapter: readField(body, 'chapter'),
      a2v: readField(body, 'a2v'),
      factChannel: readField(body, 'fact_channel'),
      renderRoute: readField(body, 'render_route'),
      outputPath: readField(body, 'output_path'),
      referenceSheet: readField(body, 'reference_sheet'),
      styleVariant: readField(body, 'style_variant'),
      reuse: readField(body, 'reuse'),
      approval: readField(body, 'approval'),
      board: readField(body, 'board'),
    };
    cut.isA2V = /^\*{0,2}예/.test(cut.a2v ?? '');
    cut.isNoFigure = /\{STYLE_NOFIGURE\}/.test(cut.compiled ?? '');
    cut.hasCap = CAP_RE.test(cut.compiled ?? '');
    cut.cameraLabel = (cut.camera ?? '').split('—')[0].replace(/\*/g, '').trim();
    cut.isMotion = MOTION_RE.test(cut.cameraLabel);
    cut.isAccent = /★/.test(cut.camera ?? '');
    // "이미지 재사용 `CUT-07`" 계열만 컷 재사용으로 센다 — "시트 … 재사용"(참조 시트 재활용)은 제외.
    // 필드 **선두**의 "이미지 (전체/편집) 재사용 `CUT-NN`"만 컷 재사용으로 센다.
    // 뒤쪽 문장의 "시트 … 재사용"(참조 시트 재활용)과 "CUT-71이 이 이미지를 재사용"(공급 측)은 제외.
    cut.isReuse = /^\*{0,2}이미지[^\n]{0,6}재사용/.test(cut.reuse ?? '');
    cut.reuseFrom = cut.isReuse ? (cut.reuse.match(/재사용\s*`?(CUT-\d{2,3}[A-Z]?)`?/)?.[1]) : undefined;
    cut.chapterName = isEmptyValue(cut.chapter) ? undefined : cut.chapter.replace(/\*/g, '').trim();
    cuts.push(cut);
  }
  cuts.sort((a, b) => a.no - b.no);
  return cuts;
}

// 관모(사모·익선관) 등장 판정 — image_prompt 컴파일본의 실물 서술 어휘로 결정론 검출.
// 표기 변종은 실제 콘티(ep1~ep3)에서 관측된 것만 넣는다 — 일반 `cap`은 오검출(capture/capital) 때문에 쓰지 않는다.
const CAP_RE = /\b(?:samo|ikseon\w*|gat)\b|(?:court|winged|silk|horsehair|gauze|cloth|soft|black)\s+cap\b|사모|익선관|관모|복두|갓\b/i;
// 카메라 모션 계상 — 이동·회전·줌·초점 계열만 1회. static·overhead·low angle 등 프레이밍은 0회.
// 어휘는 [[카메라-연출-프리셋-힉스필드]] 22종 + ep1~ep3 콘티 실사용 라벨에서 뽑았다.
// (ep1 검증: 이 규칙으로 모션 17컷 → 8.94회/분 = 콘티 문서의 9.0회/분과 일치)
const MOTION_RE = /dolly|pan\b|tilt|crane|jib|arc\b|orbit|zoom|whip|through|rack\s*focus|focus\s*change|lazy\s*susan|still\s*world|fpv|push|track|드리프트/i;

// ---------------------------------------------------------------------------
// 2. 요약 지표 — 게이트 산출 수치를 시트 상단에 그대로 얹는다
// ---------------------------------------------------------------------------

function buildSummary(cuts, frontmatter) {
  const total = cuts.length;
  const durations = cuts.map((c) => c.duration).filter(Number.isFinite);
  const runtime = durations.reduce((a, b) => a + b, 0);
  const scenes = new Set(cuts.map((c) => c.scene).filter(Boolean));
  const chapters = cuts.filter((c) => c.chapterName).length;
  const a2v = cuts.filter((c) => c.isA2V).length;
  const noFigure = cuts.filter((c) => c.isNoFigure).length;
  const cap = cuts.filter((c) => c.hasCap).length;
  const motion = cuts.filter((c) => c.isMotion).length;
  const reuse = cuts.filter((c) => c.isReuse).length;
  const boards = cuts.filter((c) => c.boardSrc).length;
  const previews = cuts.filter((c) => c.previewSrc).length;
  const transitions = {};
  for (const cut of cuts) {
    const key = (cut.transition ?? '—').split(/[\s—]/)[0];
    transitions[key] = (transitions[key] ?? 0) + 1;
  }
  const changesPerMinute = runtime > 0 ? ((total + motion) / runtime) * 60 : 0;

  return {
    total, runtime, scenes: scenes.size, chapters, a2v, noFigure, cap, motion, reuse, boards, previews,
    transitions, changesPerMinute,
    min: durations.length ? Math.min(...durations) : 0,
    max: durations.length ? Math.max(...durations) : 0,
    avg: durations.length ? runtime / durations.length : 0,
    cutCountDeclared: frontmatter.cut_count ? Number(frontmatter.cut_count) : undefined,
    targetDuration: frontmatter.target_duration ? Number(frontmatter.target_duration) : undefined,
  };
}

// ---------------------------------------------------------------------------
// 3. 이미지 슬롯 해석 — board 필드 → 실제 파일 → 출력 HTML 기준 상대 경로
// ---------------------------------------------------------------------------

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif)$/i;

/**
 * 저해상도 프리뷰 계약(별도 프리뷰 생성 에이전트 소관 — 이 스크립트는 **표시만** 한다):
 *   <에피소드 트리>\09-boards\previews\CUT-NN.png   (접미 컷은 CUT-07A.png)
 *   <에피소드 트리>\09-boards\previews\index.json   [{cut_id, file, seed, w, h, prompt_hash}]
 * index.json이 없어도 파일명 규약(CUT-NN.png)만으로 동작한다 — seed만 표시되지 않는다.
 */
const PREVIEW_DIR_NAME = 'previews';
const PREVIEW_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

function loadPreviewIndex(previewsDir) {
  const byCut = new Map();
  if (!previewsDir || !existsSync(previewsDir)) return byCut;
  const indexPath = path.join(previewsDir, 'index.json');
  if (existsSync(indexPath)) {
    try {
      const parsed = JSON.parse(readFileSync(indexPath, 'utf8'));
      const rows = Array.isArray(parsed) ? parsed : (parsed.previews ?? parsed.items ?? []);
      for (const row of rows) {
        const id = row?.cut_id ?? row?.cutId ?? row?.id;
        if (id) byCut.set(String(id), row);
      }
    } catch {
      // 파손된 index.json은 무시하고 파일명 규약으로 폴백한다 — 시트 생성은 절대 실패시키지 않는다.
    }
  }
  return byCut;
}

function resolvePreviewImage(cut, previewsDir, previewIndex) {
  if (!previewsDir || !existsSync(previewsDir)) return undefined;
  const entry = previewIndex.get(cut.id);
  const named = entry?.file ? [entry.file] : [];
  for (const candidate of [...named, ...PREVIEW_EXTS.map((ext) => `${cut.id}${ext}`)]) {
    const file = path.isAbsolute(candidate) ? candidate : path.join(previewsDir, candidate);
    if (existsSync(file) && IMAGE_EXT_RE.test(file)) return { file, entry };
  }
  return undefined;
}

/** 컷별 이미지 후보 폴더(우선순위 순). output_path의 02-cuts가 가장 권위 있다. */
function candidateDirs(cut, { boardsDirArg, mediaRoot, storyboardDir, outDir }) {
  const dirs = [];
  if (boardsDirArg) dirs.push(boardsDirArg);
  const fromOutput = (cut.outputPath ?? '').match(/`([^`]*\.(?:png|jpe?g|webp))`/)?.[1]
    ?? (cut.outputPath ?? '').match(/([A-Za-z]:\\[^\s`·]+\.(?:png|jpe?g|webp))/)?.[1];
  if (fromOutput) dirs.push(path.dirname(fromOutput));
  if (mediaRoot) {
    dirs.push(path.join(mediaRoot, EPISODE_SUBDIRS.cuts));
    dirs.push(path.join(mediaRoot, EPISODE_SUBDIRS.boards));
  }
  // 구 배치(ep1·ep2 — `ComfyUI\output\danbi\<id>\cuts`)는 media_root도 output_path도 없다.
  // 이 경우 출력 HTML을 그 폴더에 두는 것이 관례이므로 출력 폴더와 그 형제 `cuts`를 후보에 넣는다.
  if (outDir) {
    dirs.push(outDir);
    dirs.push(path.join(outDir, 'cuts'));
    dirs.push(path.join(path.dirname(outDir), 'cuts'));
  }
  dirs.push(storyboardDir);
  return dirs.filter(Boolean);
}

function resolveBoardImage(cut, context) {
  const raw = cut.board;
  if (isEmptyValue(raw)) return undefined;
  // 백틱·굵게 표기를 벗기고 첫 이미지 파일 토큰만 취한다.
  const cleaned = raw.replace(/[`*]/g, ' ').trim();
  const token = cleaned.match(/[^\s|·]+\.(?:png|jpe?g|webp|gif|avif)/i)?.[0];
  if (!token) return undefined;
  if (path.isAbsolute(token)) return existsSync(token) ? token : { missing: token };
  for (const dir of candidateDirs(cut, context)) {
    const candidate = path.join(dir, token);
    if (existsSync(candidate)) return candidate;
  }
  return { missing: token };
}

// ---------------------------------------------------------------------------
// 4. 표현 헬퍼
// ---------------------------------------------------------------------------

const escapeHtml = (text) => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** 마크다운 인라인 최소 렌더 — 굵게·코드·위키링크만. HTML 이스케이프 후에 적용한다. */
function inline(text) {
  if (text === undefined || text === null || text === '') return '';
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="wl">$1</span>');
}

function timecode(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

const firstSentence = (text, limit = 120) => {
  if (!text) return '';
  const stripped = text.replace(/\(고증[^)]*\)/g, '').trim();
  const cut = stripped.split(/(?<=[.。!?])\s/)[0] ?? stripped;
  return cut.length > limit ? `${cut.slice(0, limit)}…` : cut;
};

const clip = (text, limit) => (!text ? '' : (text.length > limit ? `${text.slice(0, limit)}…` : text));

/** shot_type → 구도 요약(빈 프레임 안에 넣을 짧은 문구). 괄호 안 구도 서술을 우선한다. */
function compositionSummary(cut) {
  const shot = cut.shotType ?? '';
  const paren = shot.match(/\(([^)]*)\)/)?.[1];
  return clip(paren || shot.split('—')[0] || cut.id, 70);
}

const shotLabel = (cut) => ((cut.shotType ?? '').split('(')[0].split('—')[0].replace(/\*/g, '').trim() || '—');

/** narration_ref에서 대사 본문(「」 또는 "")만 뽑는다. */
function narrationParts(cut) {
  const raw = cut.narration ?? '';
  const quote = raw.match(/[「"]([^」"]+)[」"]/)?.[1];
  const speaker = raw.match(/\(([^)]*)\)/)?.[1];
  const scene = raw.match(/^N\d{2}/)?.[0];
  return { scene, speaker, quote };
}

// ---------------------------------------------------------------------------
// 5. HTML
// ---------------------------------------------------------------------------

function renderSummaryTable(summary, frontmatter, meta) {
  const cells = [
    ['총 컷 수', `${summary.total}컷${summary.cutCountDeclared && summary.cutCountDeclared !== summary.total ? ` <span class="warn">(frontmatter ${summary.cutCountDeclared})</span>` : ''}`],
    ['화면 러닝타임', `${summary.runtime.toFixed(1)}초 · ${timecode(summary.runtime)}`],
    ['장면 수', `${summary.scenes}장면`],
    ['챕터 수', `${summary.chapters}개`],
    ['A2V 컷', `${summary.a2v}컷 (${pct(summary.a2v, summary.total)})`],
    ['무인 컷', `${summary.noFigure}컷 (${pct(summary.noFigure, summary.total)})`],
    ['관모 컷', `${summary.cap}컷 (${pct(summary.cap, summary.total)})`],
    ['재사용 컷', `${summary.reuse}컷`],
    ['카메라 모션 컷', `${summary.motion}컷`],
    ['분당 시각 변화', `${summary.changesPerMinute.toFixed(2)}회/분`],
    ['컷 길이', `최단 ${summary.min.toFixed(1)} / 평균 ${summary.avg.toFixed(2)} / 최장 ${summary.max.toFixed(1)}초`],
    ['전환', Object.entries(summary.transitions).map(([k, v]) => `${escapeHtml(k)} ${v}`).join(' · ')],
    ['이미지 슬롯', `최종 ${summary.boards} · 프리뷰 ${summary.previews} · 빈 프레임 ${summary.total - summary.boards - summary.previews} / ${summary.total}컷`],
    ['status', `${escapeHtml(frontmatter.status ?? '—')} · v${escapeHtml(frontmatter.storyboard_version ?? '—')}`],
  ];
  return `<table class="summary"><tbody>${
    chunk(cells, 5).map((row) => `<tr>${row.map(([k, v]) => `<th>${k}</th><td>${v}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`;
}

const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : '—');

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function emptyFrame(cut) {
  return `<div class="frame ${cut.boardMissing ? 'missing' : ''}">
      <span class="frame-label">${cut.boardMissing ? '보드 파일 없음' : '생성 전'}</span>
      <span class="frame-comp">${escapeHtml(compositionSummary(cut))}</span>
      ${cut.boardMissing ? `<span class="frame-file">${escapeHtml(cut.boardMissing)}</span>` : ''}
    </div>`;
}

/**
 * 이미지 슬롯 3단 우선순위:
 *   ① 최종 컷 이미지(board 필드 — S4 이후) ② 저해상도 프리뷰 ③ 빈 프레임 + 구도 요약
 * 프리뷰는 **최종본이 아님**을 PREVIEW 배지 + 흐린 테두리로 명시한다.
 */
function renderScreenCell(cut) {
  const badgeRoute = cut.renderRoute ? `<div class="micro">${inline(clip(cut.renderRoute, 46))}</div>` : '';
  const src = cut.boardSrc ?? cut.previewSrc;
  const isPreview = !cut.boardSrc && Boolean(cut.previewSrc);
  const frame = src
    ? `<div class="slot ${isPreview ? 'is-preview' : ''}" data-cut="${escapeHtml(cut.id)}">
         <img class="board" src="${escapeHtml(src)}" alt="${escapeHtml(cut.id)} ${isPreview ? '프리뷰' : '컷 이미지'}" loading="lazy" data-cut="${escapeHtml(cut.id)}">
         ${isPreview ? '<span class="pv-badge">PREVIEW</span>' : ''}
         <span class="zoom-hint">클릭 확대</span>
       </div>`
    : emptyFrame(cut);
  return `${frame}
    <div class="shot">${escapeHtml(shotLabel(cut))}</div>
    ${cut.styleVariant ? `<div class="micro">${inline(clip(cut.styleVariant, 40))}</div>` : ''}
    ${badgeRoute}`;
}

function renderContentCell(cut) {
  const intentLead = firstSentence(cut.intent, 150);
  const motionLead = clip(cut.motionPrompt, 110);
  return `<div class="intent">${inline(intentLead)}</div>
    ${cut.motionPrompt ? `<div class="motion"><span class="tag">motion</span> ${inline(motionLead)}</div>` : ''}
    ${cut.referenceSheet ? `<div class="micro"><span class="tag">sheet</span> ${inline(clip(cut.referenceSheet, 90))}</div>` : ''}
    ${(cut.intent || cut.compiled || cut.motionPrompt) ? `<details class="full">
      <summary>프롬프트 전문</summary>
      ${cut.intent ? `<div class="fullblk"><b>의도</b><p>${inline(cut.intent)}</p></div>` : ''}
      ${cut.compiled ? `<div class="fullblk"><b>image_prompt 컴파일본</b><p class="mono">${inline(cut.compiled)}</p></div>` : ''}
      ${cut.motionPrompt ? `<div class="fullblk"><b>motion_prompt</b><p class="mono">${inline(cut.motionPrompt)}</p></div>` : ''}
      ${cut.lineMap ? `<div class="fullblk"><b>line_map</b><p>${inline(cut.lineMap)}</p></div>` : ''}
      ${cut.reuse ? `<div class="fullblk"><b>reuse</b><p>${inline(cut.reuse)}</p></div>` : ''}
      ${cut.previewMeta ? `<div class="fullblk"><b>프리뷰 메타</b><p class="mono">seed <b class="seed">${escapeHtml(String(cut.previewMeta.seed ?? '—'))}</b>${cut.previewMeta.w ? ` · ${escapeHtml(String(cut.previewMeta.w))}×${escapeHtml(String(cut.previewMeta.h ?? '?'))}` : ''}${cut.previewMeta.prompt_hash ? ` · hash ${escapeHtml(String(cut.previewMeta.prompt_hash))}` : ''}</p></div>` : ''}
      ${cut.outputPath ? `<div class="fullblk"><b>output_path</b><p class="mono">${inline(cut.outputPath)}</p></div>` : ''}
    </details>` : ''}`;
}

function renderCameraCell(cut) {
  const detail = (cut.camera ?? '').split('—').slice(1).join('—').trim();
  return `<div class="camlabel ${cut.isMotion ? 'is-motion' : ''}">${escapeHtml(cut.cameraLabel || '—')}${cut.isAccent ? ' <span class="accent">★</span>' : ''}</div>
    ${detail ? `<div class="micro">${inline(clip(detail, 70))}</div>` : ''}
    ${cut.motion ? `<div class="micro">${inline(clip(cut.motion, 44))}</div>` : ''}`;
}

function renderAudioCell(cut) {
  const { speaker, quote } = narrationParts(cut);
  const sound = (cut.soundTiming ?? '').replace(/`lib\/([^`]+)`/g, '<code class="lib">lib/$1</code>');
  return `${cut.isA2V ? '<span class="badge a2v">A2V 립싱크</span>' : '<span class="badge vo">VO</span>'}
    ${speaker ? `<div class="micro">${inline(clip(speaker, 60))}</div>` : ''}
    ${quote ? `<div class="quote">「${escapeHtml(clip(quote, 110))}」</div>` : '<div class="quote none">— 무발화</div>'}
    ${cut.soundTiming ? `<div class="sound">${inlineKeepCode(sound)}</div>` : ''}
    ${cut.bgmCue ? `<div class="micro"><span class="tag">bgm</span> ${inline(clip(cut.bgmCue, 44))}</div>` : ''}
    ${cut.subtitle && !isEmptyValue(cut.subtitle) ? `<div class="micro"><span class="tag">자막</span> ${inline(clip(cut.subtitle, 50))}</div>` : ''}`;
}

/** sound_timing은 미리 <code>를 심어 두므로 이스케이프를 우회하되 태그 화이트리스트만 남긴다. */
function inlineKeepCode(text) {
  const placeholders = [];
  const stashed = String(text).replace(/<code class="lib">[^<]*<\/code>/g, (m) => {
    placeholders.push(m);
    return ` ${placeholders.length - 1} `;
  });
  return inline(stashed).replace(/ (\d+) /g, (_, i) => placeholders[Number(i)]);
}

function renderTimeCell(cut) {
  return `<div class="tc">${timecode(cut.start)}</div>
    <div class="dur">${Number.isFinite(cut.duration) ? `${cut.duration.toFixed(1)}s` : '—'}</div>
    <div class="micro">${escapeHtml((cut.transition ?? '—').split(/[\s—]/)[0])}</div>`;
}

function renderCutCell(cut, index) {
  const badges = [];
  if (cut.isA2V) badges.push('<span class="badge a2v">A2V</span>');
  if (cut.isAccent) badges.push('<span class="badge accentb">강조</span>');
  if (cut.isReuse) badges.push(`<span class="badge reuse">재사용${cut.reuseFrom ? `←${cut.reuseFrom.replace('CUT-', '')}` : ''}</span>`);
  if (cut.isNoFigure) badges.push('<span class="badge nofig">무인</span>');
  if (cut.hasCap) badges.push('<span class="badge cap">관모</span>');
  return `<div class="cutid">${escapeHtml(cut.id)}</div>
    <div class="scene">${escapeHtml(cut.scene ?? '—')}</div>
    <div class="badges">${badges.join('')}</div>
    ${cut.factChannel ? `<div class="micro fact">${inline(clip(cut.factChannel.replace(/—.*$/, ''), 34))}</div>` : ''}
    <div class="micro seq">#${index + 1}</div>`;
}

/**
 * 인간 검수 코멘트 셀. 값은 HTML에 굽지 않는다 — localStorage(프로덕션 id 스코프)에서
 * 로드하므로 **시트를 재생성해도 컷 id 기준으로 코멘트가 살아남는다**(S4 이후 이미지가
 * 붙어 재생성되는 시나리오가 정상 경로다).
 */
function renderNoteCell(cut) {
  const id = escapeHtml(cut.id);
  return `<div class="verdicts" data-cut="${id}">
      <button type="button" class="v" data-v="ok" title="${id} OK">OK</button>
      <button type="button" class="v" data-v="fix" title="${id} 수정">수정</button>
      <button type="button" class="v" data-v="hold" title="${id} 보류">보류</button>
    </div>
    <div class="verdicts-print">☐ OK&nbsp;&nbsp;☐ 수정&nbsp;&nbsp;☐ 보류</div>
    <textarea class="note" data-cut="${id}" rows="3" placeholder="코멘트…" aria-label="${id} 코멘트"></textarea>
    <div class="note-print"></div>`;
}

function renderRows(cuts) {
  const rows = [];
  let lastScene = null;
  cuts.forEach((cut, index) => {
    if (cut.chapterName) {
      rows.push(`<tr class="chapter-row"><td colspan="7"><span class="ch-mark">◎</span> ${inline(cut.chapterName)} <span class="ch-from">— ${escapeHtml(cut.id)}부터</span></td></tr>`);
    }
    const sceneBreak = lastScene !== null && cut.scene !== lastScene && !cut.chapterName;
    lastScene = cut.scene;
    rows.push(`<tr class="cut${sceneBreak ? ' scene-break' : ''}" id="${escapeHtml(cut.id)}" data-cut="${escapeHtml(cut.id)}">
      <td class="c-cut">${renderCutCell(cut, index)}</td>
      <td class="c-screen">${renderScreenCell(cut)}</td>
      <td class="c-content">${renderContentCell(cut)}</td>
      <td class="c-camera">${renderCameraCell(cut)}</td>
      <td class="c-audio">${renderAudioCell(cut)}</td>
      <td class="c-time">${renderTimeCell(cut)}</td>
      <td class="c-note">${renderNoteCell(cut)}</td>
    </tr>`);
  });
  return rows.join('\n');
}

const CSS = `
:root{--ink:#161513;--sub:#6b6560;--line:#c9c2b8;--line2:#e6e0d6;--bg:#faf8f4;--panel:#fff;--accent:#a03225;--a2v:#1d5c8a;--ok:#2f6b3a;
  --v-ok:#2f7d3f;--v-fix:#d2721c;--v-hold:#8a857d;}
*{box-sizing:border-box}
body{margin:0;padding:18px 16px 40px;background:var(--bg);color:var(--ink);
  font-family:"Malgun Gothic","맑은 고딕","Noto Sans KR",system-ui,sans-serif;font-size:12px;line-height:1.45}
h1{font-size:19px;margin:0 0 2px}
.subtitle{color:var(--sub);font-size:11px;margin:0 0 12px}
.meta{color:var(--sub);font-size:10.5px;margin:0 0 10px}
.meta code{background:#efe9df;padding:1px 4px;border-radius:2px}
table{border-collapse:collapse;width:100%;background:var(--panel)}
table.summary{margin:0 0 14px;border:1px solid var(--line);font-size:11px}
table.summary th{background:#f0ebe1;text-align:right;padding:4px 8px;white-space:nowrap;border:1px solid var(--line2);font-weight:600;width:1%}
table.summary td{padding:4px 10px;border:1px solid var(--line2);white-space:nowrap}
table.sheet{border:1.5px solid var(--ink);table-layout:fixed}
table.sheet thead th{background:#efe9df;border:1px solid var(--ink);padding:6px 4px;font-size:11.5px;letter-spacing:.04em}
table.sheet td{border:1px solid var(--line);padding:5px 6px;vertical-align:top}
col.w-cut{width:64px}col.w-screen{width:172px}col.w-content{width:auto}col.w-camera{width:112px}col.w-audio{width:232px}col.w-time{width:58px}col.w-note{width:150px}
tr.cut:nth-child(even) td{background:#fdfcfa}
tr.scene-break td{border-top:2px solid #9a938a}
tr.chapter-row td{background:#2c2a27;color:#f4efe6;font-size:13px;font-weight:700;padding:5px 10px;border:1px solid var(--ink);letter-spacing:.05em}
.ch-mark{color:#e0b64a}
.ch-from{font-weight:400;font-size:10.5px;opacity:.75}
.cutid{font-weight:700;font-size:12.5px;letter-spacing:.02em}
.scene{color:var(--sub);font-size:11px}
.seq{opacity:.55}
.badges{margin:3px 0 0;display:flex;flex-wrap:wrap;gap:2px}
.badge{display:inline-block;font-size:9px;padding:1px 3px;border-radius:2px;border:1px solid var(--line);background:#f3efe8;color:var(--sub);white-space:nowrap}
.badge.a2v{background:#e4eef6;border-color:#9dbdd6;color:var(--a2v);font-weight:700}
.badge.vo{background:#f1f0ec}
.badge.accentb{background:#f7e3df;border-color:#d9a79d;color:var(--accent);font-weight:700}
.badge.reuse{background:#e9f2e6;border-color:#a9c6a2;color:var(--ok)}
.badge.nofig{background:#f2eee6}
.badge.cap{background:#efeaf5;border-color:#c0b3d4;color:#5b4a7a}
.frame{height:96px;border:1.5px dashed #b3aa9d;background:repeating-linear-gradient(45deg,#f7f4ee,#f7f4ee 6px,#f2eee6 6px,#f2eee6 12px);
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:5px;gap:3px;border-radius:2px}
.frame.missing{border-color:#c98c80;background:#fbf1ef}
.frame-label{font-size:9px;color:#8d857a;letter-spacing:.08em}
.frame-comp{font-size:10px;color:#4a4640;line-height:1.3}
.frame-file{font-size:8.5px;color:#a5493a;font-family:Consolas,monospace}
img.board{width:100%;height:96px;object-fit:cover;border:1px solid var(--line);border-radius:2px;background:#000;display:block}
.shot{margin-top:4px;font-weight:600;font-size:11px}
.micro{font-size:9.5px;color:var(--sub);line-height:1.35;margin-top:2px;word-break:break-word}
.fact{color:#7a6a3d}
.tag{display:inline-block;font-size:8.5px;background:#e9e4da;color:#6b6560;border-radius:2px;padding:0 3px;margin-right:2px;vertical-align:1px}
.intent{font-size:11.5px;line-height:1.5}
.motion{margin-top:4px;font-size:10px;color:#4d4a44}
details.full{margin-top:5px}
details.full>summary{cursor:pointer;font-size:10px;color:var(--a2v);user-select:none}
details.full[open]>summary{margin-bottom:4px}
.fullblk{margin:0 0 6px;padding:5px 7px;background:#f6f3ed;border-left:2px solid var(--line)}
.fullblk b{font-size:9.5px;color:var(--sub);display:block;margin-bottom:2px}
.fullblk p{margin:0;font-size:10.5px;line-height:1.5;word-break:break-word}
.mono{font-family:Consolas,"D2Coding",monospace;font-size:9.8px}
.camlabel{font-weight:700;font-size:11.5px}
.camlabel.is-motion{color:var(--accent)}
.accent{color:var(--accent)}
.quote{margin-top:3px;font-size:11px;line-height:1.45}
.quote.none{color:#9a938a;font-style:italic}
.sound{margin-top:4px;font-size:9.8px;color:#4d4a44;line-height:1.45;word-break:break-word}
code{font-family:Consolas,monospace;font-size:9.5px;background:#efe9df;padding:0 3px;border-radius:2px}
code.lib{background:#e4eef6;color:#1d5c8a}
.wl{color:#5b4a7a}
.tc{font-weight:700;font-size:12px;font-family:Consolas,monospace}
.dur{font-size:11px;color:var(--sub);font-family:Consolas,monospace}
.warn{color:var(--accent);font-weight:700}
.pre-s4{color:var(--sub)}
.toolbar{position:sticky;top:0;z-index:9;background:var(--bg);padding:6px 0 10px;margin-bottom:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line2)}
.toolbar button{font:inherit;font-size:11px;padding:3px 10px;border:1px solid var(--line);background:#fff;border-radius:3px;cursor:pointer}
.toolbar button:hover{background:#f0ebe1}
.toolbar .hint{color:var(--sub);font-size:10px}
.chapnav a{font-size:10.5px;color:var(--a2v);text-decoration:none;margin-right:8px}
.chapnav a:hover{text-decoration:underline}
footer{margin-top:14px;color:var(--sub);font-size:10px}

/* --- 인간 검수 코멘트 층 (localStorage · 프로덕션 id 스코프) --- */
.counter{font-size:11px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.counter b{font-weight:700}
.cnt-ok{color:var(--v-ok)}.cnt-fix{color:var(--v-fix)}.cnt-hold{color:#6b6560}.cnt-none{color:#9a938a}
.saved{font-size:10px;color:var(--sub);min-width:96px}
.toolbar .sep{width:1px;height:18px;background:var(--line);margin:0 2px}
.toolbar button.primary{background:#2c2a27;color:#f4efe6;border-color:#2c2a27;font-weight:700}
.toolbar button.danger{color:var(--accent);border-color:#d9a79d}
tr.cut td.c-cut{border-left:4px solid transparent}
tr.v-ok td.c-cut{border-left-color:var(--v-ok)}
tr.v-fix td.c-cut{border-left-color:var(--v-fix)}
tr.v-hold td.c-cut{border-left-color:var(--v-hold)}
tr.v-fix td{background:#fffaf2}
tr.v-hold td{background:#f7f7f5}
td.c-note{background:#fdfdfb}
.verdicts{display:flex;gap:3px;margin-bottom:4px}
.verdicts button{font:inherit;font-size:10px;padding:2px 0;flex:1;border:1px solid var(--line);background:#fff;border-radius:3px;cursor:pointer;color:var(--sub)}
.verdicts button:hover{background:#f3efe8}
.verdicts button[data-v="ok"].on{background:var(--v-ok);border-color:var(--v-ok);color:#fff;font-weight:700}
.verdicts button[data-v="fix"].on{background:var(--v-fix);border-color:var(--v-fix);color:#fff;font-weight:700}
.verdicts button[data-v="hold"].on{background:var(--v-hold);border-color:var(--v-hold);color:#fff;font-weight:700}
textarea.note{width:100%;min-height:54px;font:inherit;font-size:10.5px;line-height:1.4;padding:4px 5px;
  border:1px solid var(--line);border-radius:3px;background:#fff;resize:vertical;color:var(--ink)}
textarea.note:focus{outline:2px solid #9dbdd6;outline-offset:-1px}
textarea.note.filled{background:#fffdf5;border-color:#c9b98f}
.verdicts-print,.note-print{display:none}

/* --- 이미지 슬롯 · 프리뷰 배지 · 라이트박스 --- */
.slot{position:relative;cursor:zoom-in;line-height:0}
.slot.is-preview img.board{border:1.5px dashed #b58b52;filter:saturate(.9)}
.pv-badge{position:absolute;top:3px;right:3px;background:rgba(181,139,82,.94);color:#fff;font-size:8px;
  letter-spacing:.09em;font-weight:700;padding:1px 4px;border-radius:2px;line-height:1.5}
.zoom-hint{position:absolute;left:3px;bottom:3px;background:rgba(22,21,19,.62);color:#fff;font-size:8px;
  padding:1px 4px;border-radius:2px;opacity:0;transition:opacity .12s;line-height:1.5}
.slot:hover .zoom-hint{opacity:1}
#lightbox{position:fixed;inset:0;z-index:99;background:rgba(18,17,15,.975);display:none;
  grid-template-columns:1fr 340px;gap:14px;padding:16px}
#lightbox.on{display:grid}
#lb-stage{display:flex;align-items:center;justify-content:center;min-width:0;position:relative}
#lb-img{max-width:100%;max-height:calc(100vh - 32px);object-fit:contain;background:#000;border:1px solid #3a372f}
#lb-empty{color:#cfc8bc;text-align:center;font-size:13px;line-height:1.7;border:1.5px dashed #6d675d;padding:40px 30px;border-radius:4px}
#lb-side{color:#efe9df;overflow:auto;display:flex;flex-direction:column;gap:8px;position:relative;
  background:#1c1a17;border:1px solid #3a372f;border-radius:5px;padding:12px 14px}
#lb-side h2{font-size:16px;margin:0}
#lb-side .lb-meta{font-size:11px;line-height:1.6;color:#cfc8bc}
#lb-side .lb-meta b{color:#fff}
#lb-side .lb-shot{font-size:12px;color:#fff}
#lb-side .lb-kind{display:inline-block;font-size:9px;padding:1px 5px;border-radius:2px;background:#3f3a31;color:#e6dfd2;letter-spacing:.06em}
#lb-side .lb-kind.preview{background:#b58b52;color:#fff}
#lb-note{width:100%;min-height:150px;font:inherit;font-size:12px;line-height:1.5;padding:7px;border-radius:4px;
  border:1px solid #55504a;background:#26241f;color:#f4efe6;resize:vertical}
#lb-verdicts{display:flex;gap:5px}
#lb-verdicts button{flex:1;font:inherit;font-size:12px;padding:5px 0;border-radius:4px;border:1px solid #55504a;background:#26241f;color:#cfc8bc;cursor:pointer}
#lb-verdicts button.on[data-v="ok"]{background:var(--v-ok);border-color:var(--v-ok);color:#fff;font-weight:700}
#lb-verdicts button.on[data-v="fix"]{background:var(--v-fix);border-color:var(--v-fix);color:#fff;font-weight:700}
#lb-verdicts button.on[data-v="hold"]{background:var(--v-hold);border-color:var(--v-hold);color:#fff;font-weight:700}
#lb-nav{display:flex;gap:6px;align-items:center;font-size:11px;color:#a9a297}
#lb-nav button{font:inherit;font-size:12px;padding:4px 12px;border-radius:4px;border:1px solid #55504a;background:#26241f;color:#efe9df;cursor:pointer}
#lb-close{position:absolute;top:6px;right:8px;font-size:22px;line-height:1;background:none;border:0;color:#cfc8bc;cursor:pointer}

@media print{
  @page{size:A4 landscape;margin:7mm 6mm 8mm}
  body{background:#fff;padding:0;font-size:6.4pt;line-height:1.26}
  .toolbar,.chapnav,footer .noprint{display:none!important}
  h1{font-size:11pt;margin-bottom:1mm}
  .subtitle,.meta{font-size:5.8pt}
  table.summary{font-size:5.8pt;margin-bottom:3mm;break-inside:avoid}
  table.summary th,table.summary td{padding:1px 4px}
  table.sheet thead{display:table-header-group}
  table.sheet thead th{font-size:6.6pt;padding:1px}
  table.sheet td{padding:1px 2px}
  tr.cut{break-inside:avoid;page-break-inside:avoid}
  tr.chapter-row{break-inside:avoid;break-after:avoid;page-break-after:avoid}
  tr.chapter-row td{font-size:7.4pt;padding:1mm 3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .frame,img.board{height:12mm}
  .frame{gap:1px}
  .frame-comp{font-size:5.2pt}
  .frame-label{font-size:5pt}
  details.full{display:none}         /* 인쇄 기본: 전문 접힘 — 훑기용 1장 유지 */
  body.print-full details.full{display:block}
  body.print-full details.full>summary{display:none}
  .badge{-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:5pt;padding:0 2px}
  .micro{font-size:5.2pt;margin-top:1px}
  .intent{font-size:6.4pt}
  .shot{font-size:6.2pt;margin-top:2px}
  .cutid{font-size:7pt}
  .tc{font-size:6.8pt}
  .sound,.motion,.quote{font-size:5.6pt}
  /* 페이지당 6~8컷을 보장하는 장치 — 긴 문단을 줄 수로 잘라 행 높이를 고정한다.
     전문이 필요하면 "인쇄(전문 포함)"으로 뽑는다(그 경우 컷당 페이지 수가 늘어난다). */
  .intent{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .motion,.quote{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .sound{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .micro{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  body.print-full .intent,body.print-full .motion,body.print-full .quote,
  body.print-full .sound,body.print-full .micro{display:block;overflow:visible}
  /* 코멘트 열: 인쇄는 **빈 칸**(손글씨용) — 화면 입력값은 인쇄하지 않는다 */
  .verdicts,textarea.note{display:none!important}
  .verdicts-print{display:block;font-size:6.6pt;letter-spacing:.02em;margin-bottom:1mm}
  .note-print{display:block;height:15mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;
    background:repeating-linear-gradient(transparent,transparent 4.6mm,#cfc9bf 4.6mm,#cfc9bf 4.75mm)}
  td.c-note{background:#fff}
  tr.v-fix td,tr.v-hold td{background:#fff}
  tr.cut td.c-cut{border-left:1px solid var(--line)}
  #lightbox{display:none!important}
  .zoom-hint{display:none}
  .pv-badge{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;

/**
 * 인라인 스크립트. 외부 의존 0.
 * localStorage 키 = `danbi-conti::<production_id>::<CUT-ID>` — **프로덕션 id 스코프**라
 * ep2/ep3 시트를 같은 브라우저에서 같이 열어도 서로의 코멘트를 덮지 않는다.
 */
function buildJs(productionId) {
  const prod = JSON.stringify(String(productionId || 'unknown'));
  return `
(function(){
  var PROD=${prod};
  var PREFIX='danbi-conti::'+PROD+'::';
  var LABEL={ok:'OK',fix:'수정',hold:'보류'};
  var store={};
  function keyOf(cut){return PREFIX+cut;}
  function load(cut){
    try{var raw=localStorage.getItem(keyOf(cut));return raw?JSON.parse(raw):null;}catch(e){return null;}
  }
  function save(cut,entry){
    try{
      if(!entry||(!entry.verdict&&!(entry.comment||'').trim())){localStorage.removeItem(keyOf(cut));}
      else{localStorage.setItem(keyOf(cut),JSON.stringify(entry));}
      stamp();
    }catch(e){ /* 사생활 모드·용량 초과 — 화면 상태는 유지한다 */ }
  }
  function stamp(){
    var d=new Date();
    document.getElementById('saved-at').textContent='마지막 저장: '+
      String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  }
  function rowOf(cut){return document.querySelector('tr.cut[data-cut="'+cut+'"]');}
  function paint(cut){
    var e=store[cut]||{};
    var row=rowOf(cut); if(!row)return;
    row.classList.remove('v-ok','v-fix','v-hold');
    if(e.verdict)row.classList.add('v-'+e.verdict);
    row.querySelectorAll('.verdicts button').forEach(function(b){
      b.classList.toggle('on',b.getAttribute('data-v')===e.verdict);
    });
    var ta=row.querySelector('textarea.note');
    if(ta&&ta.value!==(e.comment||''))ta.value=e.comment||'';
    if(ta)ta.classList.toggle('filled',!!(e.comment||'').trim());
  }
  function counts(){
    var c={ok:0,fix:0,hold:0,none:0};
    cutIds.forEach(function(cut){
      var v=(store[cut]||{}).verdict;
      if(v==='ok')c.ok++;else if(v==='fix')c.fix++;else if(v==='hold')c.hold++;else c.none++;
    });
    document.getElementById('cnt-ok').textContent=c.ok;
    document.getElementById('cnt-fix').textContent=c.fix;
    document.getElementById('cnt-hold').textContent=c.hold;
    document.getElementById('cnt-none').textContent=c.none;
  }
  function entries(){
    return cutIds.map(function(cut){var e=store[cut]||{};
      return {cut_id:cut,verdict:e.verdict||'',comment:(e.comment||'').trim(),ts:e.ts||''};
    }).filter(function(e){return e.verdict||e.comment;});
  }
  function markdown(){
    var list=entries();
    var head='## 콘티 피드백 — '+PROD+' (총 '+cutIds.length+'컷 중 '+list.length+'컷 코멘트)';
    if(!list.length)return head+'\\n- (코멘트 없음)';
    return head+'\\n'+list.map(function(e){
      return '- '+e.cut_id+' ['+(LABEL[e.verdict]||'코멘트')+']'+(e.comment?' '+e.comment.replace(/\\s*\\n\\s*/g,' / '):'');
    }).join('\\n');
  }
  function copyText(text){
    function fallback(){
      var ta=document.createElement('textarea');
      ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.focus();ta.select();
      var ok=false;try{ok=document.execCommand('copy');}catch(e){ok=false;}
      document.body.removeChild(ta);
      flash(ok?'복사 완료 — 채팅에 붙여넣으세요':'복사 실패 — 콘솔 출력 사용');
      if(!ok)console.log(text);
    }
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){flash('복사 완료 — 채팅에 붙여넣으세요');},fallback);
    }else fallback();
  }
  function flash(msg){
    var el=document.getElementById('saved-at');var prev=el.textContent;
    el.textContent=msg;setTimeout(function(){el.textContent=prev;},2200);
  }
  var cutIds=[].slice.call(document.querySelectorAll('tr.cut')).map(function(r){return r.getAttribute('data-cut');});
  cutIds.forEach(function(cut){var e=load(cut);if(e)store[cut]=e;paint(cut);});
  counts();
  if(entries().length)stamp();

  document.querySelectorAll('.verdicts button').forEach(function(btn){
    btn.addEventListener('click',function(){
      var cut=btn.parentNode.getAttribute('data-cut');
      var v=btn.getAttribute('data-v');
      var e=store[cut]||{};
      e.verdict=(e.verdict===v)?'':v;      // 같은 버튼 재클릭 = 미검토로 되돌림
      e.ts=new Date().toISOString();
      store[cut]=e;save(cut,e);paint(cut);counts();
    });
  });
  var timer=null;
  document.querySelectorAll('textarea.note').forEach(function(ta){
    ta.addEventListener('input',function(){
      var cut=ta.getAttribute('data-cut');
      var e=store[cut]||{};e.comment=ta.value;e.ts=new Date().toISOString();
      store[cut]=e;ta.classList.toggle('filled',!!ta.value.trim());
      clearTimeout(timer);timer=setTimeout(function(){save(cut,e);},250);
    });
    ta.addEventListener('blur',function(){
      var cut=ta.getAttribute('data-cut');save(cut,store[cut]);
    });
  });

  document.getElementById('btn-copy').onclick=function(){copyText(markdown());};
  document.getElementById('btn-json').onclick=function(){
    var payload=JSON.stringify(entries(),null,2);
    var blob=new Blob([payload],{type:'application/json'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='conti-feedback-'+PROD+'.json';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  };
  document.getElementById('btn-clear').onclick=function(){
    if(!window.confirm(PROD+' 시트의 코멘트·판정을 전부 지웁니다. 되돌릴 수 없습니다. 계속할까요?'))return;
    cutIds.forEach(function(cut){try{localStorage.removeItem(keyOf(cut));}catch(e){}delete store[cut];paint(cut);});
    counts();document.getElementById('saved-at').textContent='저장 없음';
  };

  // ---- 라이트박스: 썸네일 원본 확대 + 확대 화면에서 바로 코멘트 ----
  var LB=window.__CONTI_CUTS__||[];
  var lbIndex=-1;
  var box=document.getElementById('lightbox');
  var lbImg=document.getElementById('lb-img');
  var lbEmpty=document.getElementById('lb-empty');
  var lbNote=document.getElementById('lb-note');
  function lbPaintVerdict(){
    var cut=LB[lbIndex]&&LB[lbIndex].id;var v=(store[cut]||{}).verdict;
    document.querySelectorAll('#lb-verdicts button').forEach(function(b){
      b.classList.toggle('on',b.getAttribute('data-v')===v);
    });
  }
  function lbOpen(i){
    if(i<0||i>=LB.length)return;
    lbIndex=i;var c=LB[i];
    document.getElementById('lb-title').textContent=c.id+' · '+(c.scene||'')+' · '+c.tc;
    document.getElementById('lb-shot').textContent=c.shot||'';
    var kind=document.getElementById('lb-kind');
    kind.textContent=c.kind==='final'?'최종 컷 이미지':(c.kind==='preview'?'저해상도 프리뷰 — 최종본 아님':'이미지 없음');
    kind.className='lb-kind'+(c.kind==='preview'?' preview':'');
    document.getElementById('lb-info').innerHTML=
      '카메라 <b>'+(c.camera||'—')+'</b><br>길이 <b>'+(c.dur||'—')+'</b>'+(c.seed?'<br>seed <b>'+c.seed+'</b>':'')+
      (c.src?'<br>파일 <b>'+c.src.split('/').pop()+'</b>':'');
    document.getElementById('lb-pos').textContent=(i+1)+' / '+LB.length;
    if(c.src){lbImg.hidden=false;lbEmpty.hidden=true;lbImg.src=c.src;}
    else{lbImg.hidden=true;lbImg.removeAttribute('src');lbEmpty.hidden=false;lbEmpty.textContent='이미지 없음 — '+(c.comp||c.shot||c.id);}
    lbNote.value=(store[c.id]||{}).comment||'';
    lbPaintVerdict();
    box.classList.add('on');box.setAttribute('aria-hidden','false');
  }
  function lbClose(){box.classList.remove('on');box.setAttribute('aria-hidden','true');lbIndex=-1;}
  lbImg.addEventListener('error',function(){ // 깨진 아이콘 대신 빈 프레임 폴백
    var c=LB[lbIndex]||{};lbImg.hidden=true;lbEmpty.hidden=false;
    lbEmpty.textContent='이미지 로드 실패 — '+(c.src||'')+'\\n'+(c.comp||'');
  });
  document.querySelectorAll('.slot').forEach(function(slot){
    slot.addEventListener('click',function(){
      var cut=slot.getAttribute('data-cut');
      for(var i=0;i<LB.length;i++){if(LB[i].id===cut){lbOpen(i);return;}}
    });
  });
  // 썸네일 로드 실패 → 빈 프레임으로 교체(깨진 아이콘 금지)
  document.querySelectorAll('img.board').forEach(function(img){
    img.addEventListener('error',function(){
      var slot=img.closest('.slot');if(!slot)return;
      var cut=slot.getAttribute('data-cut');var c=null;
      for(var i=0;i<LB.length;i++){if(LB[i].id===cut){c=LB[i];break;}}
      slot.outerHTML='<div class="frame missing"><span class="frame-label">이미지 로드 실패</span>'+
        '<span class="frame-comp">'+((c&&c.comp)||cut)+'</span></div>';
    });
  });
  document.getElementById('lb-close').onclick=lbClose;
  document.getElementById('lb-prev').onclick=function(){lbOpen(Math.max(0,lbIndex-1));};
  document.getElementById('lb-next').onclick=function(){lbOpen(Math.min(LB.length-1,lbIndex+1));};
  box.addEventListener('click',function(ev){if(ev.target===box||ev.target.id==='lb-stage')lbClose();});
  document.querySelectorAll('#lb-verdicts button').forEach(function(btn){
    btn.addEventListener('click',function(){
      var cut=LB[lbIndex]&&LB[lbIndex].id;if(!cut)return;
      var v=btn.getAttribute('data-v');var e=store[cut]||{};
      e.verdict=(e.verdict===v)?'':v;e.ts=new Date().toISOString();
      store[cut]=e;save(cut,e);paint(cut);counts();lbPaintVerdict();
    });
  });
  lbNote.addEventListener('input',function(){
    var cut=LB[lbIndex]&&LB[lbIndex].id;if(!cut)return;
    var e=store[cut]||{};e.comment=lbNote.value;e.ts=new Date().toISOString();
    store[cut]=e;paint(cut);
    clearTimeout(timer);timer=setTimeout(function(){save(cut,e);},250);
  });
  document.addEventListener('keydown',function(ev){
    if(!box.classList.contains('on'))return;
    if(ev.key==='Escape'){lbClose();return;}
    if(ev.target===lbNote)return;                       // 코멘트 입력 중에는 방향키를 넘기지 않는다
    if(ev.key==='ArrowLeft'){ev.preventDefault();lbOpen(Math.max(0,lbIndex-1));}
    if(ev.key==='ArrowRight'){ev.preventDefault();lbOpen(Math.min(LB.length-1,lbIndex+1));}
  });

  function setAll(open){document.querySelectorAll('details.full').forEach(function(d){d.open=open;});}
  document.getElementById('btn-open').onclick=function(){setAll(true);};
  document.getElementById('btn-close').onclick=function(){setAll(false);};
  document.getElementById('btn-print').onclick=function(){document.body.classList.remove('print-full');window.print();};
  document.getElementById('btn-print-full').onclick=function(){document.body.classList.add('print-full');window.print();};
})();
`;
}

function renderHtml({ cuts, summary, frontmatter, meta }) {
  const chapters = cuts.filter((c) => c.chapterName);
  const nav = chapters.length
    ? `<div class="chapnav">${chapters.map((c) => `<a href="#${escapeHtml(c.id)}">◎ ${inline(c.chapterName)}</a>`).join('')}</div>`
    : '';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>콘티 시트 — ${escapeHtml(meta.title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="toolbar">
  <button id="btn-copy" class="primary" type="button" title="코멘트·판정이 있는 컷만 마크다운으로 복사 → 채팅에 붙여넣기">복사</button>
  <button id="btn-json" type="button">JSON 내려받기</button>
  <button id="btn-clear" class="danger" type="button">전체 지우기</button>
  <span class="sep"></span>
  <span class="counter">
    <span class="cnt-ok">OK <b id="cnt-ok">0</b></span>
    <span class="cnt-fix">수정 <b id="cnt-fix">0</b></span>
    <span class="cnt-hold">보류 <b id="cnt-hold">0</b></span>
    <span class="cnt-none">미검토 <b id="cnt-none">0</b></span>
  </span>
  <span class="saved" id="saved-at">저장 없음</span>
  <span class="sep"></span>
  <button id="btn-open" type="button">전체 펼치기</button>
  <button id="btn-close" type="button">전체 접기</button>
  <button id="btn-print" type="button">인쇄(훑기용)</button>
  <button id="btn-print-full" type="button">인쇄(전문 포함)</button>
  <span class="hint">A4 가로 · 페이지당 6~8컷 · 코멘트 열은 인쇄 시 빈 칸(손글씨용)</span>
</div>
<h1>콘티 시트 — ${escapeHtml(meta.title)}</h1>
<p class="subtitle">${escapeHtml(frontmatter.production_id ?? '')} · ${escapeHtml(meta.sourceLabel)} · 생성 ${escapeHtml(meta.generatedAt)}</p>
<p class="meta">원문 <code>${escapeHtml(meta.sourcePath)}</code>${frontmatter.media_root ? ` · 미디어 루트 <code>${escapeHtml(frontmatter.media_root)}</code>` : ''}${frontmatter.script ? ` · 대본 ${inline(frontmatter.script)}` : ''}${frontmatter.style_guide ? ` · 그림체 ${inline(frontmatter.style_guide)}` : ''}
<br>표현 계층 전용 뷰 — <b>02-storyboard.md는 읽기만 했고 어떤 필드도 수정하지 않았다.</b> 수치는 본 시트 생성 시점의 문서 파싱 결과다.</p>
${renderSummaryTable(summary, frontmatter, meta)}
${nav}
<table class="sheet">
<colgroup><col class="w-cut"><col class="w-screen"><col class="w-content"><col class="w-camera"><col class="w-audio"><col class="w-time"><col class="w-note"></colgroup>
<thead><tr><th>컷</th><th>화면</th><th>내용 · 지문</th><th>카메라</th><th>오디오</th><th>시간</th><th>코멘트</th></tr></thead>
<tbody>
${renderRows(cuts)}
</tbody>
</table>
<footer>
  <div>범례: <b>무인</b> = image_prompt가 <code>{STYLE_NOFIGURE}</code>로 시작하는 컷 · <b>관모</b> = 컴파일본에 사모/익선관 실물 서술 존재 · <b>강조</b> = camera에 ★ 표기 · 분당 시각 변화 = (컷 수 + 카메라 모션 컷) ÷ 러닝타임 × 60.</div>
  <div class="noprint">화면 열: <code>board</code> 필드가 비었으면 빈 프레임 + 구도 요약(S4 이전 검토), 채워지고 파일이 실재하면 실제 컷 이미지(상대 경로).</div>
  <div class="noprint">이미지 슬롯 우선순위: ① 최종 컷 이미지(<code>board</code>) ② 저해상도 프리뷰(<code>09-boards\\previews\\CUT-NN.png</code> · <code>PREVIEW</code> 배지) ③ 빈 프레임 + 구도 요약. 썸네일 클릭 = 원본 확대(← → 이동 · ESC 닫기 · 확대 화면에서 코멘트 입력 가능).</div>
  <div class="noprint">코멘트 열: 판정·코멘트는 <b>이 브라우저의 localStorage</b>에 <code>danbi-conti::${escapeHtml(meta.productionId)}::CUT-NN</code> 키로 저장된다. 시트를 재생성해도 컷 id가 같으면 그대로 복원된다. 반출은 상단 <b>복사</b>(마크다운 → 채팅 붙여넣기) 또는 <b>JSON 내려받기</b>.</div>
</footer>
<div id="lightbox" aria-hidden="true">
  <div id="lb-stage">
    <img id="lb-img" alt="">
    <div id="lb-empty" hidden></div>
  </div>
  <div id="lb-side">
    <button id="lb-close" type="button" title="닫기 (ESC)">×</button>
    <h2 id="lb-title">CUT</h2>
    <div class="lb-shot" id="lb-shot"></div>
    <div><span class="lb-kind" id="lb-kind"></span></div>
    <div class="lb-meta" id="lb-info"></div>
    <div id="lb-verdicts">
      <button type="button" data-v="ok">OK</button>
      <button type="button" data-v="fix">수정</button>
      <button type="button" data-v="hold">보류</button>
    </div>
    <textarea id="lb-note" placeholder="이 컷 코멘트… (그대로 시트·localStorage에 저장됩니다)"></textarea>
    <div id="lb-nav">
      <button type="button" id="lb-prev">← 이전</button>
      <button type="button" id="lb-next">다음 →</button>
      <span id="lb-pos"></span>
    </div>
  </div>
</div>
<script>window.__CONTI_CUTS__=${JSON.stringify(meta.lightboxCuts)};</script>
<script>${buildJs(meta.productionId)}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// 6. 출력 경로 — D10 트리 계약
// ---------------------------------------------------------------------------

/** media_root가 표준 트리(MEDIA_ROOT\분류\소스\시리즈\에피소드) 안이면 4단계를 되돌려 준다. */
function splitEpisodeSpec(mediaRoot) {
  if (!mediaRoot) return null;
  const normalized = path.resolve(mediaRoot.replace(/[\\/]+$/, ''));
  const rel = path.relative(path.resolve(MEDIA_ROOT), normalized);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (parts.length !== 4) return null;
  const [category, source, series, episode] = parts;
  return { category, source, series, episode, root: normalized };
}

function resolveOutput(frontmatter, storyboardPath, args) {
  if (args.out) return { file: path.resolve(args.out), episodeRoot: null, spec: null };
  const mediaRoot = frontmatter.media_root;
  if (mediaRoot) {
    const root = path.resolve(mediaRoot.replace(/[\\/]+$/, ''));
    return {
      file: path.join(root, EPISODE_SUBDIRS.boards, 'conti-sheet.html'),
      episodeRoot: root,
      spec: splitEpisodeSpec(mediaRoot),
    };
  }
  return { file: path.join(path.dirname(storyboardPath), 'conti-sheet.html'), episodeRoot: null, spec: null };
}

// ---------------------------------------------------------------------------
// 7. main
// ---------------------------------------------------------------------------

function main(argv) {
  const args = parseArgs(argv);
  const input = args._[0];
  if (!input) {
    console.error('사용: node render-conti-sheet.mjs <02-storyboard.md> [--out <html>] [--boards-dir <dir>] [--title "제목"]');
    process.exit(2);
  }
  const storyboardPath = path.resolve(input);
  if (!existsSync(storyboardPath)) {
    console.error(`입력 파일이 없습니다: ${storyboardPath}`);
    process.exit(2);
  }

  const markdown = normalizeNewlines(readFileSync(storyboardPath, 'utf8'));
  if (!CUT_HEADING_RE.test(markdown)) {
    console.error(`${storyboardPath}: '### CUT-NN' 컷 섹션을 찾지 못했습니다 — 콘티 문서가 맞는지 확인하세요.`);
    process.exit(1);
  }
  const frontmatter = parseFrontmatter(markdown);
  const cuts = parseCuts(markdown);

  const output = resolveOutput(frontmatter, storyboardPath, args);
  const outDir = path.dirname(output.file);

  // D10 트리: media_root 기반 출력이면 표준 하위 11종을 만들고 episode.json 마커를 결속한다.
  if (output.episodeRoot && !args['no-ensure-tree']) {
    const spec = output.spec;
    ensureEpisodeTree(output.episodeRoot, frontmatter.production_id ? {
      productionId: frontmatter.production_id,
      category: spec?.category, source: spec?.source, series: spec?.series, episode: spec?.episode,
    } : undefined);
  }
  mkdirSync(outDir, { recursive: true });

  // 이미지 슬롯 해석 — 출력 HTML 기준 상대 경로로 바꾼다(로컬에서 바로 열리게).
  const context = {
    boardsDirArg: args['boards-dir'] ? path.resolve(args['boards-dir']) : undefined,
    mediaRoot: frontmatter.media_root ? path.resolve(frontmatter.media_root.replace(/[\\/]+$/, '')) : undefined,
    storyboardDir: path.dirname(storyboardPath),
    outDir,
  };
  const previewsDir = args['previews-dir']
    ? path.resolve(args['previews-dir'])
    : [
      path.join(outDir, PREVIEW_DIR_NAME),
      context.mediaRoot ? path.join(context.mediaRoot, EPISODE_SUBDIRS.boards, PREVIEW_DIR_NAME) : null,
    ].filter(Boolean).find((dir) => existsSync(dir));
  const previewIndex = loadPreviewIndex(previewsDir);

  const toRelative = (absolute) => encodeURI(path.relative(outDir, absolute).split(path.sep).join('/'));

  for (const cut of cuts) {
    const resolved = resolveBoardImage(cut, context);
    if (typeof resolved === 'string') {
      cut.boardSrc = toRelative(resolved);
      cut.boardAbs = resolved;
    } else if (resolved && resolved.missing) {
      cut.boardMissing = resolved.missing;
    }
    // ② 프리뷰 — 최종 컷 이미지가 없을 때만 슬롯을 채운다(메타는 있으면 항상 싣는다: seed 재사용).
    const preview = resolvePreviewImage(cut, previewsDir, previewIndex);
    if (preview) {
      cut.previewAbs = preview.file;
      cut.previewMeta = preview.entry;
      if (!cut.boardSrc) cut.previewSrc = toRelative(preview.file);
    }
  }

  const summary = buildSummary(cuts, frontmatter);
  const title = args.title
    ?? markdown.match(/^#\s+(.+)$/m)?.[1]?.replace(/\s*\(.*$/, '').trim()
    ?? (frontmatter.production_id ?? path.basename(storyboardPath));

  const html = renderHtml({
    cuts,
    summary,
    frontmatter,
    meta: {
      title,
      productionId: frontmatter.production_id ?? path.basename(path.dirname(storyboardPath)),
      lightboxCuts: cuts.map((cut) => ({
        id: cut.id,
        scene: cut.scene ?? '',
        tc: timecode(cut.start),
        dur: Number.isFinite(cut.duration) ? `${cut.duration.toFixed(1)}s` : '—',
        shot: cut.shotType ?? '',
        camera: cut.cameraLabel || '—',
        comp: compositionSummary(cut),
        seed: cut.previewMeta?.seed ?? '',
        src: cut.boardSrc ?? cut.previewSrc ?? '',
        kind: cut.boardSrc ? 'final' : (cut.previewSrc ? 'preview' : 'none'),
      })),
      sourceLabel: `${summary.total}컷 · ${summary.runtime.toFixed(1)}초`,
      sourcePath: storyboardPath,
      generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    },
  });

  writeFileSync(output.file, html, 'utf8');

  if (!args.quiet) {
    const bytes = statSync(output.file).size;
    console.log(`[conti-sheet] ${output.file} (${(bytes / 1024).toFixed(0)} KB)`);
    console.log(`  컷 ${summary.total} · 러닝타임 ${summary.runtime.toFixed(1)}초 · 장면 ${summary.scenes} · 챕터 ${summary.chapters}`);
    console.log(`  A2V ${summary.a2v} · 무인 ${summary.noFigure}(${pct(summary.noFigure, summary.total)}) · 관모 ${summary.cap} · 모션 ${summary.motion} · 재사용 ${summary.reuse}`);
    console.log(`  분당 시각 변화 ${summary.changesPerMinute.toFixed(2)}회/분 · 컷 길이 ${summary.min.toFixed(1)}~${summary.max.toFixed(1)}(평균 ${summary.avg.toFixed(2)})초`);
    console.log(`  이미지 슬롯 — 최종 ${summary.boards} · 프리뷰 ${summary.previews} · 빈 프레임 ${summary.total - summary.boards - summary.previews} / ${summary.total}컷${previewsDir ? ` (previews: ${previewsDir})` : ''}`);
    const missing = cuts.filter((c) => c.boardMissing);
    if (missing.length) console.log(`  ⚠ board 기재됐으나 파일 미발견 ${missing.length}컷: ${missing.slice(0, 5).map((c) => c.id).join(', ')}${missing.length > 5 ? ' …' : ''}`);
  }
  return output.file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}

export { parseCuts, parseFrontmatter, buildSummary, renderHtml, main };
