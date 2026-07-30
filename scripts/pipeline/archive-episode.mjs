#!/usr/bin/env node
/**
 * archive-episode.mjs — 업로드 완료 후 자료정리 (D10 §자료정리)
 *
 * 동작:
 *   ① 마스터(렌더 폴더의 최종본) → D:\DanbiArchive\releases\ **복사**(기존 명명 규약:
 *      production_id로 시작하지 않으면 `<production_id>-<파일명>`으로 프리픽스).
 *   ② 99-work·*-work(거부 테이크·중간 산출물) → D:\DanbiArchive\intermediates\<series>-<ep>\ **이동**.
 *   ③ 이동 전 참조 검사: vault 마크다운·EditorProject JSON(pipeline out + prisma dev.db + autosave)이
 *      해당 파일을 **절대 경로로 참조**하면 이동 대상에서 제외하고 경고한다(D5 — 참조되는 것은 이동 금지).
 *   ④ 결과 리포트: 이동/복사/보존(제외) 목록과 용량.
 *
 * 기본은 **드라이런**이다 — 실제 복사·이동은 `--execute`를 명시했을 때만 수행한다.
 *
 * 사용:
 *   node scripts/pipeline/archive-episode.mjs <에피소드 미디어 루트> [옵션]
 *
 * 옵션:
 *   --execute              실제 실행 (기본: 드라이런 — 파일시스템 무변경)
 *   --production <id>      production_id (기본: episode.json 마커 → 루트 폴더명)
 *   --series <name>        intermediates 라벨의 시리즈부 (기본: 마커 series → 루트 부모 폴더명)
 *   --ep <name>            intermediates 라벨의 에피소드부 (기본: 마커 episode → 루트 폴더명)
 *   --renders-dir <dir>    마스터 위치 (기본: <루트>\10-renders. 구 배치는 .danbi\outputs 지정)
 *   --tts-root <dir>       구 배치의 TTS 프로덕션 루트(tts-work 등 work 폴더를 함께 수집)
 *   --include <relpath>    이동 후보 폴더 수동 추가(루트 기준 상대, 반복 지정 가능)
 *   --releases <dir>       릴리스 아카이브 (기본 D:\DanbiArchive\releases)
 *   --intermediates <dir>  중간 산출물 아카이브 루트 (기본 D:\DanbiArchive\intermediates)
 *   --vault <dir>          참조 검사용 vault (기본 E:\ai_tool\DanbiVault)
 *
 * 규율: 참조 검사 원천이 하나라도 읽기 실패하면 **실행 모드는 중단**한다(모르는 채 이동 금지).
 */

import path from 'node:path';
import {
  existsSync, readdirSync, readFileSync, statSync,
  mkdirSync, copyFileSync, rmSync, rmdirSync, writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

import { EPISODE_SUBDIRS, readEpisodeMarker } from './lib/media-paths.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

const DEFAULT_RELEASES = 'D:\\DanbiArchive\\releases';
const DEFAULT_INTERMEDIATES = 'D:\\DanbiArchive\\intermediates';
const DEFAULT_VAULT = 'E:\\ai_tool\\DanbiVault';

// 이동 후보로 인정하는 폴더명 — 99-work(신규 트리 표준)과 `-work` 접미(구 배치 관례: tts-work,
// tts-v21-r3-work 등). 그 외 폴더는 명시(--include) 없이는 절대 건드리지 않는다(보수 원칙).
const WORK_DIR_PATTERN = /^99-work$|-work$/;

// 마스터 판정: 렌더 폴더 안의 영상 파일 중 파일명에 master가 들어간 것.
// (드래프트·landscape 등은 중간 산출물이지만 렌더 폴더는 이동 대상이 아니다 — 복사만 한다.)
const MASTER_PATTERN = /master/i;
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm']);

function parseArgs(argv) {
  const args = { include: [] };
  const positional = [];
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) {
      positional.push(key);
      continue;
    }
    const name = key.slice(2);
    if (name === 'execute') {
      args.execute = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`--${name} 값이 없습니다`);
    if (name === 'include') args.include.push(value);
    else args[name] = value;
    i += 1;
  }
  if (positional.length !== 1) {
    throw new Error('사용법: node archive-episode.mjs <에피소드 미디어 루트> [--execute ...]');
  }
  args.root = path.resolve(positional[0]);
  return args;
}

// ---------------------------------------------------------------------------
// 참조 검사 — 절대 경로 인덱스
// ---------------------------------------------------------------------------

const ABS_PATH_RE = /[A-Za-z]:[\\/][^\u0000-\u001f"'<>|\s]+/g;

function normalizePath(raw) {
  return raw
    .replace(/\//g, '\\')
    .replace(/\\+/g, '\\')           // JSON 이스케이프(E:\\ai_tool\\…)의 이중 백슬래시 정규화
    .replace(/[).,;:\]'"`|>]+$/, '') // 문장·표 안 인용의 꼬리 문자 제거
    .toLowerCase();
}

function harvestPaths(text, into) {
  for (const match of text.matchAll(ABS_PATH_RE)) into.add(normalizePath(match[0]));
}

function* walkFiles(dir, { skip = () => false } = {}) {
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (skip(entry.name, full)) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) yield full;
    }
  }
}

/** 참조 원천을 모두 읽어 절대 경로 집합을 만든다. 실패 원천은 리스트로 보고. */
function buildReferenceIndex({ vaultDir }) {
  const referenced = new Set();
  const sources = [];
  const failures = [];

  // ① vault 마크다운 전체 (05-sources·10-knowledge·20-productions — .git 제외)
  if (existsSync(vaultDir)) {
    let count = 0;
    for (const file of walkFiles(vaultDir, { skip: (name) => name === '.git' })) {
      if (!/\.(md|json)$/i.test(file)) continue;
      try {
        harvestPaths(readFileSync(file, 'utf8'), referenced);
        count += 1;
      } catch (error) {
        failures.push(`${file}: ${error.message}`);
      }
    }
    sources.push(`vault ${vaultDir} (${count} files)`);
  } else {
    failures.push(`vault 없음: ${vaultDir}`);
  }

  // ② 컴파일러 산출 EditorProject·매핑 JSON (scripts\pipeline\out\**)
  const pipelineOut = path.join(SCRIPT_DIR, 'out');
  if (existsSync(pipelineOut)) {
    let count = 0;
    for (const file of walkFiles(pipelineOut)) {
      if (!/\.(json|txt)$/i.test(file)) continue;
      try {
        harvestPaths(readFileSync(file, 'utf8'), referenced);
        count += 1;
      } catch (error) {
        failures.push(`${file}: ${error.message}`);
      }
    }
    sources.push(`pipeline out ${pipelineOut} (${count} files)`);
  }

  // ③ API 저장 EditorProject — prisma SQLite(레코드 data가 JSON 텍스트) raw 스캔
  const devDb = path.join(STUDIO_ROOT, 'prisma', 'prisma', 'dev.db');
  if (existsSync(devDb)) {
    try {
      harvestPaths(readFileSync(devDb).toString('latin1'), referenced);
      sources.push(`prisma dev.db ${devDb}`);
    } catch (error) {
      failures.push(`${devDb}: ${error.message}`);
    }
  } else {
    failures.push(`prisma dev.db 없음: ${devDb}`);
  }

  // ④ 편집기 autosave
  const autosaveDir = path.join(STUDIO_ROOT, '.danbi', 'autosave');
  if (existsSync(autosaveDir)) {
    let count = 0;
    for (const file of walkFiles(autosaveDir)) {
      try {
        harvestPaths(readFileSync(file, 'utf8'), referenced);
        count += 1;
      } catch (error) {
        failures.push(`${file}: ${error.message}`);
      }
    }
    sources.push(`autosave ${autosaveDir} (${count} files)`);
  }

  return { referenced, sources, failures };
}

/**
 * 파일이 참조되는가 — **파일 자체** 또는 **직속 폴더**가 절대 경로로 등장할 때만 참조로 본다.
 * 조상 전체를 거슬러 올라가면 문서가 도구 루트(E:\ai_tool\tts_make 등)를 한 번 언급한 것만으로
 * 산하 전부가 이동 불가가 된다(ep2 실측 — 1155건 전량 오탐). D5의 취지는 "그 파일을 절대 경로로
 * 가리키는 참조가 깨지는가"이므로 파일·직속 폴더 수준으로 한정한다.
 */
function isReferenced(referenced, filePath) {
  const probe = normalizePath(filePath);
  return referenced.has(probe) || referenced.has(path.dirname(probe));
}

// ---------------------------------------------------------------------------
// 후보 수집
// ---------------------------------------------------------------------------

function collectFiles(dir) {
  const files = [];
  for (const file of walkFiles(dir)) {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch { /* 사라진 파일은 0으로 */ }
    files.push({ path: file, size });
  }
  return files;
}

function listWorkDirs(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && WORK_DIR_PATTERN.test(entry.name))
    .map((entry) => path.join(root, entry.name));
}

function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function sum(files) {
  return files.reduce((total, file) => total + file.size, 0);
}

// 교차 드라이브 이동(E: → D:)은 rename이 안 되므로 복사+삭제로 이동한다.
function moveFile(from, to) {
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
  const src = statSync(from);
  const dst = statSync(to);
  if (src.size !== dst.size) {
    rmSync(to);
    throw new Error(`이동 검증 실패(크기 불일치): ${from} → ${to}`);
  }
  rmSync(from);
}

function removeEmptyDirsUpTo(dir, stopAt) {
  let current = dir;
  while (current !== stopAt && current.startsWith(stopAt)) {
    try {
      if (readdirSync(current).length > 0) break;
      rmdirSync(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);
  const { root } = args;
  if (!existsSync(root)) throw new Error(`에피소드 미디어 루트가 없습니다: ${root}`);

  const marker = readEpisodeMarker(root);
  const productionId = args.production ?? marker?.production_id ?? path.basename(root);
  const series = args.series ?? marker?.series ?? path.basename(path.dirname(root));
  const ep = args.ep ?? marker?.episode ?? path.basename(root);
  const label = series === ep ? ep : `${series}-${ep}`;

  const releasesDir = path.resolve(args.releases ?? DEFAULT_RELEASES);
  const intermediatesDir = path.join(path.resolve(args.intermediates ?? DEFAULT_INTERMEDIATES), label);
  const rendersDir = args['renders-dir']
    ? path.resolve(args['renders-dir'])
    : path.join(root, EPISODE_SUBDIRS.renders);
  const execute = args.execute === true;

  console.log(`archive-episode ${execute ? '**실행 모드**' : '드라이런(무변경 — --execute로 실행)'}`);
  console.log(`  root:          ${root}`);
  console.log(`  production_id: ${productionId} (마커 ${marker ? '있음' : '없음'})`);
  console.log(`  releases:      ${releasesDir}`);
  console.log(`  intermediates: ${intermediatesDir}`);
  console.log(`  renders:       ${rendersDir}`);

  // -------------------------------------------------------------------------
  // 참조 인덱스
  // -------------------------------------------------------------------------
  const vaultDir = path.resolve(args.vault ?? DEFAULT_VAULT);
  const { referenced, sources, failures } = buildReferenceIndex({ vaultDir });
  console.log('\n참조 검사 원천:');
  for (const source of sources) console.log(`  - ${source}`);
  for (const failure of failures) console.log(`  ⚠ 원천 실패: ${failure}`);
  if (failures.length > 0 && execute) {
    throw new Error('참조 원천 읽기 실패가 있어 실행을 중단합니다(모르는 채 이동 금지) — 드라이런으로 확인하십시오');
  }
  console.log(`  절대 경로 인덱스: ${referenced.size}건`);

  // -------------------------------------------------------------------------
  // ① 마스터 → releases 복사
  // -------------------------------------------------------------------------
  const copies = [];
  // 렌더 폴더가 에피소드 루트 밖(구 배치의 공용 .danbi\outputs 등)이면 다른 프로덕션의
  // 마스터가 섞여 있으므로 파일명에 production_id가 들어간 것만 이 에피소드의 마스터로 본다.
  const sharedRendersDir = !normalizePath(rendersDir).startsWith(normalizePath(root));
  if (existsSync(rendersDir)) {
    for (const entry of readdirSync(rendersDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXT.has(ext) || !MASTER_PATTERN.test(entry.name)) continue;
      if (sharedRendersDir && !entry.name.includes(productionId)) continue;
      const from = path.join(rendersDir, entry.name);
      const targetName = entry.name.startsWith(productionId) ? entry.name : `${productionId}-${entry.name}`;
      const to = path.join(releasesDir, targetName);
      let note = '';
      if (existsSync(to)) {
        note = statSync(to).size === statSync(from).size
          ? '이미 아카이브됨(동일 크기) — 건너뜀'
          : '⚠ 동명이며 크기 다름 — 덮어쓰지 않음(수동 확인)';
      }
      copies.push({ from, to, size: statSync(from).size, note });
    }
  } else {
    console.log(`\n⚠ 렌더 폴더 없음: ${rendersDir} (구 배치라면 --renders-dir로 지정)`);
  }

  // -------------------------------------------------------------------------
  // ② 이동 후보 수집: 99-work·*-work (+ --tts-root의 work, --include)
  // -------------------------------------------------------------------------
  const candidateDirs = [
    ...listWorkDirs(root),
    ...(args['tts-root'] ? listWorkDirs(path.resolve(args['tts-root'])) : []),
    ...args.include.map((rel) => path.resolve(root, rel)),
  ].filter((dir, index, all) => all.indexOf(dir) === index);

  const moves = [];
  const preserved = [];
  for (const dir of candidateDirs) {
    if (!existsSync(dir)) {
      console.log(`⚠ 이동 후보 폴더 없음(건너뜀): ${dir}`);
      continue;
    }
    const base = path.dirname(dir);
    for (const file of collectFiles(dir)) {
      const rel = path.relative(base, file.path);
      if (isReferenced(referenced, file.path)) {
        preserved.push({ ...file, rel, reason: 'vault·EditorProject가 절대 경로로 참조 — 이동 금지(D5)' });
      } else {
        moves.push({ ...file, rel, to: path.join(intermediatesDir, rel) });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 리포트
  // -------------------------------------------------------------------------
  console.log(`\n① 마스터 → releases 복사: ${copies.length}건 (${formatBytes(sum(copies))})`);
  for (const copy of copies) {
    console.log(`  ${copy.note?.startsWith('⚠') ? '⚠' : '+'} ${copy.from}`);
    console.log(`      → ${copy.to}${copy.note ? `  [${copy.note}]` : ''}`);
  }

  console.log(`\n② 중간 산출물 → intermediates 이동: ${moves.length}건 (${formatBytes(sum(moves))})`);
  const movesByDir = new Map();
  for (const move of moves) {
    const top = move.rel.split(path.sep)[0];
    movesByDir.set(top, (movesByDir.get(top) ?? { count: 0, size: 0 }));
    movesByDir.get(top).count += 1;
    movesByDir.get(top).size += move.size;
  }
  for (const [dir, info] of movesByDir) {
    console.log(`  ${dir}\\ — ${info.count}건 (${formatBytes(info.size)}) → ${path.join(intermediatesDir, dir)}`);
  }

  console.log(`\n③ 참조되어 보존(이동 제외): ${preserved.length}건 (${formatBytes(sum(preserved))})`);
  for (const item of preserved.slice(0, 20)) {
    console.log(`  ⚠ ${item.path}`);
    console.log(`      — ${item.reason}`);
  }
  if (preserved.length > 20) console.log(`  … 외 ${preserved.length - 20}건 (전체는 실행 리포트 JSON 참조)`);

  // -------------------------------------------------------------------------
  // 실행
  // -------------------------------------------------------------------------
  if (!execute) {
    console.log('\n[드라이런] 파일시스템 무변경으로 종료합니다. 실제 실행: --execute');
    return;
  }

  let copied = 0;
  for (const copy of copies) {
    if (copy.note) continue; // 동일 크기 기존재·충돌은 건너뜀
    mkdirSync(path.dirname(copy.to), { recursive: true });
    copyFileSync(copy.from, copy.to);
    copied += 1;
  }
  let moved = 0;
  const movedDirs = new Set();
  for (const move of moves) {
    moveFile(move.path, move.to);
    movedDirs.add(path.dirname(move.path));
    moved += 1;
  }
  for (const dir of movedDirs) removeEmptyDirsUpTo(dir, root);

  const report = {
    executedAt: new Date().toISOString(),
    productionId, root, releasesDir, intermediatesDir,
    copied: copies, moved: moves, preserved,
  };
  mkdirSync(intermediatesDir, { recursive: true });
  const reportPath = path.join(intermediatesDir, `archive-report-${Date.now()}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\n실행 완료: 복사 ${copied}건 / 이동 ${moved}건 / 보존 ${preserved.length}건`);
  console.log(`리포트: ${reportPath}`);
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
