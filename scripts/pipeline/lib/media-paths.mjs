// ---------------------------------------------------------------------------
// media-paths.mjs — 콘텐츠 아웃풋 트리 경로 계약 (D10)
// ---------------------------------------------------------------------------
// 표준 트리:  E:\danbi-media\[<장르>\<포맷>\]<분류>\<소스>\<시리즈>\<epNN-슬러그>\
//   축 접두(장르\포맷)는 선택 — 생략하면 기존 배치와 동일하다(계층-구조-규약 §9).
//   01-sheets  02-cuts  03-clips  04-clips-1080p  05-tts  06-sfx  07-bgm
//   08-thumbnails  09-boards  10-renders  99-work
//
// 계약:
// - 생성 도구는 **처음부터** 이 트리에 산출한다(ComfyUI filename_prefix,
//   TTS 헤드리스 호출의 sf.write 경로, 렌더 잡 POST body의 outputPath, PIL 저장 경로).
// - 에피소드 폴더는 `episode.json` 마커로 production_id와 결속한다 — 폴더명
//   (`ep03-슬러그`)과 production_id(`YYYY-MM-DD-슬러그`)는 형식이 다르므로
//   폴더명 추측이 아니라 마커가 권위다.
// - ep1·ep2(구 배치: ComfyUI output\danbi·tts_make outputs\danbi·.danbi\outputs)는
//   이 트리에 등재하지 않는다 — D5 "참조되는 것은 이동 금지". 신규 체계는 ep3부터.
//
// 이 모듈은 의존성 0(node 내장만). 컴파일러·자료정리 스크립트·생성 에이전트가 공용한다.
// ---------------------------------------------------------------------------

import path from 'node:path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

/** 트리 루트. 테스트·이설 시 환경변수로만 바꾼다(코드 하드코딩 금지). */
export const MEDIA_ROOT = process.env.DANBI_MEDIA_ROOT ?? 'E:\\danbi-media';

/** 에피소드 내부 표준 하위 폴더 — 키는 파이프라인 논리명, 값은 실제 폴더명. */
export const EPISODE_SUBDIRS = Object.freeze({
  sheets: '01-sheets',            // 캐릭터·배경·기물 시트 (S4 시트 우선 체계)
  cuts: '02-cuts',                // 컷 정지 이미지 (채택본)
  clips: '03-clips',              // I2V/A2V 클립 원본 (채택본)
  clipsUpscaled: '04-clips-1080p',// 업스케일 2pass 산출
  tts: '05-tts',                  // 채택 보이스 테이크
  sfx: '06-sfx',                  // 효과음 (채택은 06-sfx\adopted 하위 관례 유지)
  bgm: '07-bgm',                  // BGM 소스·정합본
  thumbnails: '08-thumbnails',    // 썸네일 (PIL 직접 저장)
  boards: '09-boards',            // 콘티 이미지화 보드
  renders: '10-renders',          // 렌더 산출(드래프트·마스터) — 마스터는 업로드 후 releases로 복사
  work: '99-work',                // 임시·거부 테이크·중간 산출물 — 업로드 후 intermediates로 이동
});

/** 에피소드 폴더임을 나타내는 마커 파일명. */
export const EPISODE_MARKER = 'episode.json';

/** 시리즈 폴더 아래의 템플릿 폴더명 — 에피소드 탐색에서 항상 제외한다. */
export const TEMPLATE_DIR_NAME = '_TEMPLATE';

/**
 * 위계 경로 해석. episode까지 주면 에피소드 루트, series까지 주면 시리즈 루트…
 * 앞 단계를 건너뛴 지정(예: series 없이 episode)은 계약 위반으로 즉시 던진다.
 *
 * 축 구조(2026-08-05, 계층-구조-규약 §9):
 *   E:\danbi-media\<장르>\<포맷>\<분류>\<소스>\<시리즈>\<epNN-슬러그>\
 *
 * **하위 호환**: `genre`·`format`을 생략하면 축 폴더 없이 `<분류>`부터 시작한다 —
 * 기존 배치(`E:\danbi-media\한국사\조선왕조실록\장영실\…`)와 ep3 경로·episode.json 마커·
 * 컴파일러 탐색이 전부 무변경이다. 축 폴더는 **신규 조합부터** 물리적으로 나타난다.
 * `_library`·`_TEMPLATE`은 축 위(MEDIA_ROOT 직하)에 그대로 둔다 — base 자산이다.
 *
 * @param {{genre?: string, format?: string, category?: string, source?: string, series?: string, episode?: string}} spec
 * @returns {string} 절대 경로
 */
export function resolveMediaRoot({ genre, format, category, source, series, episode } = {}) {
  const levels = [
    ['genre', genre],
    ['format', format],
    ['category', category],
    ['source', source],
    ['series', series],
    ['episode', episode],
  ];
  const has = (v) => v !== undefined && v !== null && v !== '';
  for (const [name, value] of levels) {
    if (has(value) && /[\\/]/.test(value)) {
      throw new Error(`resolveMediaRoot: ${name} 값에 경로 구분자를 넣을 수 없습니다 (got ${value})`);
    }
  }
  // 축 접두(genre·format)는 **통째로 생략 가능**하다(하위 호환). 단 format만 주는 것은 경로가
  // 모호해지므로(장르 자리인지 포맷 자리인지) 금지한다.
  if (has(format) && !has(genre)) {
    throw new Error('resolveMediaRoot: genre 없이 format만 지정할 수 없습니다 (축: 장르\\포맷)');
  }
  const parts = [];
  for (const [, value] of levels.slice(0, 2)) if (has(value)) parts.push(value);
  // 분류 이하 위계는 종전대로 앞 단계 건너뛰기를 금지한다.
  let stopped = null;
  for (const [name, value] of levels.slice(2)) {
    if (!has(value)) {
      stopped = stopped ?? name;
      continue;
    }
    if (stopped) {
      throw new Error(`resolveMediaRoot: ${stopped} 없이 ${name}만 지정할 수 없습니다 (위계: 분류\\소스\\시리즈\\에피소드)`);
    }
    parts.push(value);
  }
  return path.join(MEDIA_ROOT, ...parts);
}

/**
 * 에피소드 루트 → 하위 폴더 절대 경로 묶음.
 * @param {string} episodeRoot
 * @returns {{root: string} & Record<keyof typeof EPISODE_SUBDIRS, string>}
 */
export function episodePaths(episodeRoot) {
  const resolved = { root: path.resolve(episodeRoot) };
  for (const [key, dir] of Object.entries(EPISODE_SUBDIRS)) {
    resolved[key] = path.join(resolved.root, dir);
  }
  return resolved;
}

/**
 * 에피소드 트리 생성(존재해도 무해) + 마커 기록. production_id 확정 시 호출한다.
 * @param {string} episodeRoot
 * @param {{productionId: string, category?: string, source?: string, series?: string, episode?: string}} [marker]
 * @returns {ReturnType<typeof episodePaths>}
 */
export function ensureEpisodeTree(episodeRoot, marker) {
  const paths = episodePaths(episodeRoot);
  for (const key of Object.keys(EPISODE_SUBDIRS)) {
    mkdirSync(paths[key], { recursive: true });
  }
  if (marker?.productionId) {
    const markerPath = path.join(paths.root, EPISODE_MARKER);
    // 이미 있으면 production_id 불일치만 막고 덮어쓰지 않는다(마커는 append-only 계약).
    if (existsSync(markerPath)) {
      const existing = readEpisodeMarker(paths.root);
      if (existing?.production_id && existing.production_id !== marker.productionId) {
        throw new Error(
          `ensureEpisodeTree: ${markerPath}의 production_id(${existing.production_id})와 요청(${marker.productionId})이 다릅니다`,
        );
      }
    } else {
      writeFileSync(markerPath, `${JSON.stringify({
        production_id: marker.productionId,
        category: marker.category,
        source: marker.source,
        series: marker.series,
        episode: marker.episode,
        created: new Date().toISOString().slice(0, 10),
      }, null, 2)}\n`, 'utf8');
    }
  }
  return paths;
}

/** 마커 읽기 — 없거나 파손이면 null (탐색 루틴이 조용히 건너뛸 수 있도록). */
export function readEpisodeMarker(episodeRoot) {
  try {
    return JSON.parse(readFileSync(path.join(episodeRoot, EPISODE_MARKER), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * production_id → 표준 트리의 에피소드 루트 탐색.
 * 판정 기준(권위 순): ① episode.json 마커의 production_id 일치 ② 폴더명 자체가 production_id.
 * 트리에 없으면 null — 호출측(컴파일러)은 구 배치(ComfyUI output\danbi 등)로 폴백한다.
 *
 * 깊이: 축 접두(장르\포맷)가 선택적이므로 **에피소드는 깊이 4~6 어디에나 있을 수 있다**
 * (구 배치 = 분류\소스\시리즈\에피소드 = 4 · 축 배치 = 장르\포맷\분류\소스\시리즈\에피소드 = 6).
 * 그래서 고정 깊이가 아니라 **마커 발견 시 즉시 에피소드로 판정**하고, 마커가 있는 폴더 아래로는
 * 더 내려가지 않는다(에피소드 하위 01-sheets… 를 훑지 않는다). `_TEMPLATE`은 항상 제외한다.
 * @param {string} productionId
 * @param {{root?: string, maxDepth?: number}} [options]
 * @returns {string|null}
 */
export function findEpisodeRoot(productionId, { root = MEDIA_ROOT, maxDepth = 6 } = {}) {
  if (!productionId || !existsSync(root)) return null;
  const stack = [{ dir: root, depth: 0 }];
  let fallback = null;
  while (stack.length > 0) {
    const { dir, depth } = stack.pop();
    if (depth >= maxDepth) continue;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === TEMPLATE_DIR_NAME) continue;
      const child = path.join(dir, entry.name);
      const marker = readEpisodeMarker(child);
      if (marker) {
        // 에피소드 폴더다 — 마커가 권위. 일치하면 즉시 반환, 아니면 하위로 내려가지 않는다.
        if (marker.production_id === productionId) return child;
        continue;
      }
      // 마커가 없더라도 폴더명이 production_id면 차선 후보로 기억한다(마커 우선 원칙 유지).
      if (entry.name === productionId) {
        fallback = fallback ?? child;
        continue;
      }
      stack.push({ dir: child, depth: depth + 1 });
    }
  }
  return fallback;
}
