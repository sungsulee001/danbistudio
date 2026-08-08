#!/usr/bin/env node
/**
 * Danbi S7 — YouTube 업로더 (YouTube Data API v3 · resumable upload)
 *
 *   node scripts/publish/upload.mjs <production_id|04-publish 경로> [옵션]
 *
 * 옵션
 *   --dry-run                파싱·검증·요약만. API 호출 0회. (기본 권장 첫 단계)
 *   --visibility <v>         private(기본) | unlisted | public
 *   --thumbnail <path>       썸네일 파일 경로 (미지정 시 §0-D 값 사용, --no-thumbnail로 생략)
 *   --no-thumbnail           썸네일 설정 건너뜀
 *   --playlist <playlistId>  업로드 후 재생목록에 추가 (§0-D의 재생목록 "이름"은 참고용이라 ID가 필요)
 *   --category <교육|인물/블로그|숫자ID>  §0-D 카테고리 덮어쓰기
 *   --restart                기존 resumable 세션을 버리고 처음부터 다시 업로드
 *   --no-writeback           04-publish.md 자동 기입 생략
 *   --set-visibility <v>     업로드하지 않고 기존 video_id의 공개 범위만 변경
 *   --video-id <id>          --set-visibility / --schedule-only와 함께 사용 (미지정 시 frontmatter의 video_id)
 *
 * 예약 공개 (status.publishAt) — 기본값은 "예약 없음". 아래 인자를 명시할 때만 켜진다.
 *   --publish-at <RFC3339>   절대 시각으로 예약. 예: --publish-at "2026-08-08T18:12:01+09:00"
 *                            오프셋을 생략하면 --timezone(기본 +09:00 KST)으로 해석한다.
 *   --publish-in <기간>       업로드 "완료" 시각 기준 상대 예약. 예: --publish-in 6h / 30m / 1d6h
 *                            완료 순간에 시스템 시각을 읽어 확정한다(미리 계산하지 않는다).
 *   --timezone <오프셋>       표기·해석 기준 타임존. 기본 +09:00. 예: +09:00 / Z / UTC / KST
 *   --schedule-only          업로드하지 않고 기존 video_id에 예약만 건다(--video-id 필요).
 *
 * 안전 기본값
 *   · 공개 범위 기본 private. public은 --visibility public 명시가 있어야만.
 *   · 예약 공개는 기본 꺼짐. --publish-at / --publish-in 을 준 경우에만 설정된다.
 *   · 예약 공개 시 privacyStatus는 private로 강제된다(YouTube 규약).
 *     --visibility public|unlisted 와 함께 주면 에러로 막는다.
 *   · 과거·임박 시각은 거부한다. 업로드 후에도 다시 검사해, 이미 지났으면 예약을
 *     걸지 않고 private로 남긴다(즉시 공개 방지).
 *   · §0 블록 형식이 어긋나면 추측하지 않고 즉시 중단(ep1 설명란 사고 재발 방지).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  E, DanbiError, LIMITS, CATEGORIES, SESSION_DIR, DEFAULT_TZ,
  parsePublishDoc, resolvePublishPath, probeVideo,
  getAccessToken, classifyApiError, writeBackPublishResult, writeBackScheduleResult, ensureDir,
  parseTimezoneOffset, parsePublishAtInput, parseRelativeDuration,
  formatOffsetIso, describePublishAt, formatRemaining, assertFuturePublishAt,
} from './lib.mjs';

const CHUNK = 16 * 1024 * 1024;     // 16MiB — 256KiB의 배수여야 한다
const MAX_RETRY = 6;

/** 예약 시각 최소 여유 — 이보다 임박하면 인자 단계에서 거부한다 */
const MIN_LEAD_MS = 60_000;
/** 업로드 완료 후 예약을 걸 때 요구하는 최소 여유 — 이보다 임박하면 예약을 걸지 않는다 */
const APPLY_LEAD_MS = 30_000;

// ─────────────────────────────────────────────────────────────
// 인자
// ─────────────────────────────────────────────────────────────

export function parseArgs(argv, { nowMs = Date.now() } = {}) {
  const o = {
    target: null, dryRun: false, visibility: 'private', thumbnail: undefined,
    noThumbnail: false, playlist: null, category: null, restart: false,
    writeback: true, setVisibility: null, videoId: null,
    publishAt: null, publishIn: null, timezone: null, scheduleOnly: false,
    visibilityExplicit: false, schedule: null,
  };
  const VIS = ['private', 'unlisted', 'public'];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => {
      const v = argv[++i];
      if (v === undefined) throw new DanbiError(E.USAGE, `${a} 뒤에 값이 필요하다.`);
      return v;
    };
    switch (a) {
      case '--dry-run': o.dryRun = true; break;
      case '--visibility': o.visibility = need(); o.visibilityExplicit = true; break;
      case '--thumbnail': o.thumbnail = need(); break;
      case '--no-thumbnail': o.noThumbnail = true; break;
      case '--playlist': o.playlist = need(); break;
      case '--category': o.category = need(); break;
      case '--restart': o.restart = true; break;
      case '--no-writeback': o.writeback = false; break;
      case '--set-visibility': o.setVisibility = need(); break;
      case '--video-id': o.videoId = need(); break;
      case '--publish-at': o.publishAt = need(); break;
      case '--publish-in': o.publishIn = need(); break;
      case '--timezone': case '--tz': o.timezone = need(); break;
      case '--schedule-only': o.scheduleOnly = true; break;
      case '-h': case '--help': o.help = true; break;
      default:
        if (a.startsWith('--')) throw new DanbiError(E.USAGE, `알 수 없는 옵션: ${a}`);
        if (o.target) throw new DanbiError(E.USAGE, `대상이 두 개 지정됐다: ${o.target}, ${a}`);
        o.target = a;
    }
  }
  for (const [k, v] of [['--visibility', o.visibility], ['--set-visibility', o.setVisibility]]) {
    if (v !== null && !VIS.includes(v)) throw new DanbiError(E.USAGE, `${k} 값은 ${VIS.join('|')} 중 하나여야 한다 (받은 값: ${v})`);
  }
  if (o.help) return o;

  // ── 예약 공개
  if (o.publishAt !== null && o.publishIn !== null) {
    throw new DanbiError(E.USAGE, '--publish-at 과 --publish-in 은 함께 쓸 수 없다.', '절대 시각(--publish-at) 또는 업로드 완료 기준 상대 시각(--publish-in) 중 하나만 지정하라.');
  }
  const wantsSchedule = o.publishAt !== null || o.publishIn !== null;

  if (o.scheduleOnly && !wantsSchedule) {
    throw new DanbiError(E.USAGE, '--schedule-only 에는 --publish-at 또는 --publish-in 이 필요하다.');
  }
  if (o.timezone !== null && !wantsSchedule) {
    throw new DanbiError(E.USAGE, '--timezone 은 --publish-at / --publish-in 과 함께 써야 한다.');
  }

  if (wantsSchedule) {
    // YouTube 규약: publishAt은 privacyStatus=private 과만 유효하다.
    if (o.visibilityExplicit && o.visibility !== 'private') {
      throw new DanbiError(
        E.USAGE,
        `예약 공개(--publish-${o.publishAt !== null ? 'at' : 'in'})와 --visibility ${o.visibility} 는 함께 쓸 수 없다.`,
        'YouTube Data API v3는 status.publishAt을 privacyStatus=private 일 때만 적용한다. public/unlisted와 함께 보내면 무시되거나 거부된다.\n         → --visibility 를 빼거나 --visibility private 로 두어라. 예약 시각이 되면 YouTube가 알아서 public으로 전환한다.'
      );
    }
    if (o.setVisibility !== null) {
      if (o.setVisibility !== 'private') {
        throw new DanbiError(
          E.USAGE,
          `예약 공개와 --set-visibility ${o.setVisibility} 는 함께 쓸 수 없다.`,
          '예약 공개는 privacyStatus=private 을 요구한다.'
        );
      }
      // --set-visibility 경로는 예약을 적용하지 않는다. 조용히 무시하지 말고 막는다.
      throw new DanbiError(
        E.USAGE,
        '--set-visibility 는 예약 공개를 설정하지 않는다.',
        '이미 올라간 영상에 예약만 걸려면 --schedule-only 를 쓰라. 예: --schedule-only --video-id <id> --publish-in 6h'
      );
    }
    o.visibility = 'private';   // 강제

    const tz = parseTimezoneOffset(o.timezone ?? DEFAULT_TZ);
    if (o.publishAt !== null) {
      const p = parsePublishAtInput(o.publishAt, o.timezone ?? DEFAULT_TZ);
      assertFuturePublishAt(p.epochMs, p.offsetMinutes, { nowMs, minLeadMs: MIN_LEAD_MS, where: '--publish-at' });
      o.schedule = {
        mode: 'absolute',
        raw: o.publishAt,
        epochMs: p.epochMs,
        offsetMinutes: p.offsetMinutes,
        explicitOffset: p.explicitOffset,
      };
    } else {
      o.schedule = {
        mode: 'relative',
        raw: o.publishIn,
        deltaMs: parseRelativeDuration(o.publishIn),
        offsetMinutes: tz.minutes,
      };
    }
  }
  return o;
}

// ─────────────────────────────────────────────────────────────
// HTTP helper — 5xx/네트워크는 지수 백오프 재시도
// ─────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, init, { retry = MAX_RETRY, allow = [] } = {}) {
  let last;
  for (let attempt = 0; attempt <= retry; attempt++) {
    if (attempt > 0) {
      const wait = Math.min(2 ** attempt * 1000, 32_000) + Math.floor(Math.random() * 500);
      console.log(`   ↻ 재시도 ${attempt}/${retry} (${Math.round(wait / 1000)}초 대기) — ${last}`);
      await sleep(wait);
    }
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      last = `네트워크 오류: ${e.message}`;
      if (attempt === retry) throw new DanbiError(E.NETWORK, `네트워크 오류로 실패했다: ${e.message}`, '연결 복구 후 같은 명령을 다시 실행하면 resumable 세션이 이어진다.');
      continue;
    }
    if (res.ok || allow.includes(res.status)) return res;
    const text = await res.text();
    const err = classifyApiError(res.status, text);
    if (err.code === E.NETWORK && res.status >= 500 && attempt < retry) { last = err.message; continue; }
    throw err;
  }
  throw new DanbiError(E.NETWORK, `재시도 한도 초과: ${last}`);
}

// ─────────────────────────────────────────────────────────────
// resumable 세션 상태
// ─────────────────────────────────────────────────────────────

const sessionFile = (pid) => path.join(SESSION_DIR, `${pid}.json`);

function loadSession(pid, video) {
  const f = sessionFile(pid);
  if (!fs.existsSync(f)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (s.size !== video.size || s.videoPath !== video.path) {
      console.log('   ⚠ 저장된 세션이 다른 파일 것이다 — 새 세션을 시작한다.');
      return null;
    }
    return s;
  } catch { return null; }
}

function saveSession(pid, data) {
  ensureDir(SESSION_DIR);
  fs.writeFileSync(sessionFile(pid), JSON.stringify(data, null, 2));
}

function clearSession(pid) {
  try { fs.unlinkSync(sessionFile(pid)); } catch {}
}

// ─────────────────────────────────────────────────────────────
// 업로드
// ─────────────────────────────────────────────────────────────

export function buildStatus(meta, visibility, withSynthetic, publishAtIso) {
  const status = {
    privacyStatus: visibility,
    selfDeclaredMadeForKids: false,   // 아동용 아님
    license: 'youtube',
    embeddable: true,
    publicStatsViewable: true,
  };
  if (withSynthetic && meta.containsSyntheticMedia) status.containsSyntheticMedia = true;
  // publishAt은 privacyStatus=private 일 때만 유효하다 — 호출부가 이미 강제하지만 여기서도 막는다.
  if (publishAtIso) {
    if (visibility !== 'private') {
      throw new DanbiError(E.USAGE, `status.publishAt은 privacyStatus=private 일 때만 보낼 수 있다 (받은 값: ${visibility}).`);
    }
    status.publishAt = publishAtIso;
  }
  return status;
}

function buildBody(meta, visibility, withSynthetic) {
  const status = buildStatus(meta, visibility, withSynthetic);
  return {
    snippet: {
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      categoryId: meta.categoryId,
      defaultLanguage: 'ko',
      defaultAudioLanguage: 'ko',
    },
    status,
  };
}

async function startSession(token, meta, video, visibility) {
  const url = 'https://www.googleapis.com/upload/youtube/v3/videos'
    + '?uploadType=resumable&part=snippet,status&notifySubscribers=false';

  let withSynthetic = true;
  for (;;) {
    const res = await api(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
        'X-Upload-Content-Length': String(video.size),
        'X-Upload-Content-Type': video.mimeType,
      },
      body: JSON.stringify(buildBody(meta, visibility, withSynthetic)),
    }, { allow: withSynthetic ? [400] : [] });

    if (res.status === 400 && withSynthetic) {
      const t = await res.text();
      if (/containsSyntheticMedia|unexpected|invalidMetadata|badRequest/i.test(t)) {
        console.log('   ⚠ status.containsSyntheticMedia 필드가 이 API 버전에서 거부됐다 — 필드를 빼고 재시도.');
        console.log('     → 업로드 후 유튜브 스튜디오에서 "변형·합성 콘텐츠" 항목을 수동 체크해야 한다.');
        withSynthetic = false;
        continue;
      }
      throw classifyApiError(400, t);
    }

    const loc = res.headers.get('location');
    if (!loc) throw new DanbiError(E.API, 'resumable 세션 URI(Location 헤더)를 받지 못했다.');
    return { sessionUri: loc, syntheticApplied: withSynthetic && meta.containsSyntheticMedia ? true : (meta.containsSyntheticMedia ? 'manual' : null) };
  }
}

/** 서버가 이미 받은 바이트 수를 조회 (재개용) */
async function queryOffset(sessionUri, total) {
  const res = await fetch(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${total}`, 'Content-Length': '0' },
  });
  if (res.status === 200 || res.status === 201) return { done: true, body: await res.json() };
  if (res.status === 308) {
    const range = res.headers.get('range');
    const offset = range ? Number(range.split('-')[1]) + 1 : 0;
    return { done: false, offset };
  }
  if (res.status === 404) throw classifyApiError(404, await res.text());
  throw classifyApiError(res.status, await res.text());
}

async function uploadChunks(sessionUri, video, startOffset) {
  const fd = fs.openSync(video.path, 'r');
  const buf = Buffer.allocUnsafe(CHUNK);
  let offset = startOffset;
  const t0 = Date.now();

  try {
    while (offset < video.size) {
      const len = Math.min(CHUNK, video.size - offset);
      fs.readSync(fd, buf, 0, len, offset);
      const chunk = buf.subarray(0, len);
      const end = offset + len - 1;

      let res, attempt = 0;
      for (;;) {
        try {
          res = await fetch(sessionUri, {
            method: 'PUT',
            headers: {
              'Content-Length': String(len),
              'Content-Range': `bytes ${offset}-${end}/${video.size}`,
              'Content-Type': video.mimeType,
            },
            body: chunk,
          });
        } catch (e) {
          if (++attempt > MAX_RETRY) throw new DanbiError(E.NETWORK, `청크 전송 실패: ${e.message}`, '같은 명령을 다시 실행하면 이 지점부터 재개된다.');
          const w = Math.min(2 ** attempt * 1000, 32_000);
          console.log(`   ↻ 네트워크 오류, ${Math.round(w / 1000)}초 후 재시도 (${attempt}/${MAX_RETRY})`);
          await sleep(w);
          const q = await queryOffset(sessionUri, video.size);
          if (q.done) return q.body;
          offset = q.offset;
          continue;
        }
        break;
      }

      if (res.status === 200 || res.status === 201) {
        process.stdout.write('\n');
        return await res.json();
      }
      if (res.status === 308) {
        const range = res.headers.get('range');
        offset = range ? Number(range.split('-')[1]) + 1 : offset + len;
        const pct = ((offset / video.size) * 100).toFixed(1);
        const mbps = (offset / 1024 / 1024) / ((Date.now() - t0) / 1000);
        const eta = mbps > 0 ? Math.round(((video.size - offset) / 1024 / 1024) / mbps) : 0;
        process.stdout.write(`\r   ⬆ ${pct}%  ${(offset / 1024 ** 3).toFixed(2)}/${(video.size / 1024 ** 3).toFixed(2)} GB  ${mbps.toFixed(1)} MB/s  ETA ${eta}s   `);
        continue;
      }
      process.stdout.write('\n');
      throw classifyApiError(res.status, await res.text());
    }
  } finally {
    fs.closeSync(fd);
  }
  // 전량 전송했는데 최종 응답이 없으면 상태를 조회
  const q = await queryOffset(sessionUri, video.size);
  if (q.done) return q.body;
  throw new DanbiError(E.API, '전량 전송했으나 서버가 완료 응답을 주지 않았다.');
}

async function setThumbnail(token, videoId, file) {
  if (!fs.existsSync(file)) throw new DanbiError(E.MEDIA, `썸네일 파일이 없다: ${file}`);
  const size = fs.statSync(file).size;
  if (size > 2 * 1024 * 1024) throw new DanbiError(E.MEDIA, `썸네일이 2MB 상한을 넘었다 (${(size / 1024 / 1024).toFixed(2)}MB): ${file}`);
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  await api(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': mime, 'Content-Length': String(size) },
    body: fs.readFileSync(file),
  });
}

async function addToPlaylist(token, videoId, playlistId) {
  await api('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
  });
}

async function patchVisibility(token, videoId, visibility) {
  await api('https://www.googleapis.com/youtube/v3/videos?part=status', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: videoId, status: { privacyStatus: visibility, selfDeclaredMadeForKids: false } }),
  });
}

// ─────────────────────────────────────────────────────────────
// 예약 공개
//
// publishAt은 업로드 insert 본문에 넣지 않고 업로드 "완료 후" videos.update로
// 적용한다. 이유 3가지:
//   1) --publish-in 은 완료 시각 기준이어야 한다. insert 시점에 계산하면
//      업로드 소요 시간(수 분~수십 분)만큼 어긋난다.
//   2) resumable 세션을 다음 날 재개하는 경우, insert 시점에 박아둔 절대 시각이
//      이미 과거가 되어 finalize 순간 즉시 공개될 수 있다.
//   3) 실패 방향이 안전하다 — update가 실패해도 영상은 private로 남는다.
// ─────────────────────────────────────────────────────────────

/** videos.update part=status — 예약 시각을 포함한 status 파트를 통째로 다시 쓴다 */
async function putStatus(token, videoId, meta, withSyntheticInitial, publishAtIso) {
  let withSynthetic = withSyntheticInitial;
  for (;;) {
    const res = await api('https://www.googleapis.com/youtube/v3/videos?part=status', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: videoId, status: buildStatus(meta, 'private', withSynthetic, publishAtIso) }),
    }, { allow: withSynthetic ? [400] : [] });

    if (res.status === 400 && withSynthetic) {
      const t = await res.text();
      if (/containsSyntheticMedia|unexpected|invalidMetadata|badRequest/i.test(t)) {
        console.log('   ⚠ status.containsSyntheticMedia 필드가 거부됐다 — 필드를 빼고 재시도.');
        withSynthetic = false;
        continue;
      }
      throw classifyApiError(400, t);
    }
    return await res.json();
  }
}

/** videos.list part=status — 실제로 무엇이 설정됐는지 서버에서 다시 읽는다 (추정 금지) */
async function fetchVideoStatus(token, videoId) {
  const res = await api(
    `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(videoId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const j = await res.json();
  const item = j.items?.[0];
  if (!item) throw new DanbiError(E.API, `videos.list가 ${videoId}에 대해 아무것도 반환하지 않았다.`, '업로드 직후 색인 지연일 수 있다. 유튜브 스튜디오에서 직접 확인하라.');
  return item.status ?? {};
}

/**
 * 예약 공개를 확정·적용·검증한다.
 * anchorMs는 상대 지정의 기준 시각(= 업로드 완료 시각). 여기서 실제 시스템 시각을 읽는다.
 */
async function applySchedule(token, videoId, meta, sched, { withSynthetic, anchorMs, notes, dryRun = false }) {
  const targetMs = sched.mode === 'relative' ? anchorMs + sched.deltaMs : sched.epochMs;
  const d = describePublishAt(targetMs, sched.offsetMinutes);
  const basis = sched.mode === 'relative'
    ? `업로드 완료 시각 ${formatOffsetIso(anchorMs, sched.offsetMinutes)} + ${sched.raw} (--publish-in)`
    : `절대 지정 (--publish-at ${sched.raw})`;

  console.log(`\n▶ 예약 공개 설정`);
  console.log(`   기준        : ${basis}`);
  console.log(`   예약 시각   : ${d.iso}`);
  console.log(`                 = ${d.human} (${d.zone})   [UTC ${d.utcIso}]`);
  console.log(`   privacyStatus: private (YouTube 규약상 예약 공개는 private에서만 동작)`);

  const base = { mode: sched.mode, raw: sched.raw, basis, iso: d.iso, human: d.human, zone: d.zone, utcIso: d.utcIso, epochMs: targetMs };

  // 업로드에 걸린 시간 때문에 절대 시각이 이미 지났을 수 있다 — 즉시 공개를 막는다.
  const now = Date.now();
  if (targetMs <= now + APPLY_LEAD_MS) {
    const msg = `⚠ 예약 시각(${d.iso})이 이미 지났거나 ${Math.round(APPLY_LEAD_MS / 1000)}초 이내다 — 즉시 공개를 막기 위해 예약을 설정하지 않았다. 영상은 private 상태로 남아 있다. 스튜디오에서 직접 예약하라.`;
    console.log(`   ❌ ${msg}`);
    notes?.push(msg);
    return { ...base, applied: false, reason: '적용 시점에 과거·임박 시각', actualPrivacyStatus: null, actualPublishAt: null };
  }

  if (dryRun) {
    console.log('   (--dry-run — API 호출 없음)');
    return { ...base, applied: false, reason: 'dry-run', actualPrivacyStatus: null, actualPublishAt: null };
  }

  await putStatus(token, videoId, meta, withSynthetic, d.iso);

  // ── 검증: 응답을 믿지 말고 서버에서 다시 읽는다
  const actual = await fetchVideoStatus(token, videoId);
  const actualMs = actual.publishAt ? Date.parse(actual.publishAt) : NaN;
  const privacyOk = actual.privacyStatus === 'private';
  const timeOk = Number.isFinite(actualMs) && Math.abs(actualMs - targetMs) < 1000;

  console.log(`   ${privacyOk ? '✔' : '✗'} API 확인 — status.privacyStatus = ${actual.privacyStatus ?? '(없음)'}`);
  console.log(`   ${timeOk ? '✔' : '✗'} API 확인 — status.publishAt     = ${actual.publishAt ?? '(없음)'}`);
  if (Number.isFinite(actualMs)) {
    console.log(`                                      = ${describePublishAt(actualMs, sched.offsetMinutes).human} (${d.zone})`);
  }

  const result = {
    ...base,
    applied: privacyOk && timeOk,
    actualPrivacyStatus: actual.privacyStatus ?? null,
    actualPublishAt: actual.publishAt ?? null,
  };
  if (!result.applied) {
    result.reason = `API 재조회 불일치 — privacyStatus=${actual.privacyStatus ?? '(없음)'}, publishAt=${actual.publishAt ?? '(없음)'}`;
    const msg = `⚠ 예약 공개가 요청대로 설정되지 않았다. 요청 ${d.iso} / 서버 privacyStatus=${actual.privacyStatus ?? '(없음)'}, publishAt=${actual.publishAt ?? '(없음)'}. 유튜브 스튜디오에서 직접 확인·설정하라.`;
    console.log(`   ❌ ${msg}`);
    notes?.push(msg);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// 출력
// ─────────────────────────────────────────────────────────────

function printSummary(meta, video, opts) {
  const line = '─'.repeat(72);
  const descLines = meta.description.split('\n');
  console.log(`\n${line}`);
  console.log(`  §0 붙여넣기 블록 파싱 결과 — ${meta.productionId}`);
  console.log(`  출처: ${meta.sourcePath}`);
  console.log(line);
  console.log(`\n[A] 제목 (${meta.title.length}자 / 상한 ${LIMITS.TITLE_CHARS})`);
  console.log(`    ${meta.title}`);
  console.log(`\n[B] 설명문 (${meta.description.length}자 / 상한 ${LIMITS.DESCRIPTION_CHARS}, ${descLines.length}줄)`);
  console.log('    ── 앞 10줄 ──');
  descLines.slice(0, 10).forEach((l) => console.log(`    ${l}`));
  if (descLines.length > 10) console.log(`    … (이하 ${descLines.length - 10}줄 생략)`);
  console.log(`    ── 마지막 줄: ${descLines[descLines.length - 1]}`);
  console.log(`\n[C] 태그 ${meta.tags.length}개 (총 ${meta.tagsTotal}자 / 상한 ${LIMITS.TAGS_TOTAL_CHARS})`);
  console.log(`    ${meta.tags.join(' | ')}`);
  console.log('\n[D] 업로드 설정');
  console.log(`    영상        : ${video.path}`);
  console.log(`    규격        : ${video.sizeHuman} · ${video.durationHuman}(${video.duration.toFixed(3)}s) · ${video.width}x${video.height} · ${video.fps}fps · ${video.videoCodec} / ${video.audioCodec ?? '음성없음'} ${video.audioRate ?? ''}Hz ${video.audioChannels ?? ''}ch`);
  console.log(`    썸네일      : ${opts.noThumbnail ? '(생략 --no-thumbnail)' : (opts.thumbnail ?? meta.thumbnailPath ?? '(미지정)')}`);
  console.log(`    카테고리    : ${meta.categoryId} ← ${meta.categorySource}`);
  console.log(`    언어        : ko (defaultLanguage / defaultAudioLanguage)`);
  console.log(`    아동용      : 아님 (selfDeclaredMadeForKids=false)`);
  console.log(`    변형·합성   : ${meta.containsSyntheticMedia ? '고지 ON (status.containsSyntheticMedia=true 시도)' : '고지 OFF'}`);
  if (meta.syntheticLine) console.log(`                  근거: ${meta.syntheticLine.trim().slice(0, 90)}`);
  console.log(`    재생목록    : ${opts.playlist ?? `(ID 미지정)${meta.playlistNote ? ` — §0-D 메모: ${meta.playlistNote}` : ''}`}`);
  console.log(`    공개 범위   : ${opts.visibility}${opts.visibility === 'public' ? '  ⚠ 즉시 공개된다' : ''}`);
  printSchedulePlan(opts.schedule, '    ');
  console.log(`\n${line}\n`);
}

/** 계산된 예약 시각을 ISO와 한국 시각 표기 양쪽으로 보여준다 (인간 확인용) */
function printSchedulePlan(sched, indent = '') {
  if (!sched) {
    console.log(`${indent}예약 공개   : 없음 (기본값 — --publish-at / --publish-in 미지정)`);
    return;
  }
  const now = Date.now();
  if (sched.mode === 'absolute') {
    const d = describePublishAt(sched.epochMs, sched.offsetMinutes);
    console.log(`${indent}예약 공개   : ${d.iso}`);
    console.log(`${indent}              = ${d.human} (${d.zone})`);
    console.log(`${indent}              절대 지정 (--publish-at ${sched.raw}${sched.explicitOffset ? '' : ` — 오프셋 생략, ${d.zone} 로 해석`})`);
    console.log(`${indent}              지금(${formatOffsetIso(now, sched.offsetMinutes)}) 기준 ${formatRemaining(sched.epochMs - now)} 뒤`);
    console.log(`${indent}              UTC 전송값: ${d.utcIso}`);
  } else {
    const est = describePublishAt(now + sched.deltaMs, sched.offsetMinutes);
    console.log(`${indent}예약 공개   : 업로드 완료 시각 + ${sched.raw}  (--publish-in — 완료 순간의 시스템 시각으로 확정)`);
    console.log(`${indent}              지금(${formatOffsetIso(now, sched.offsetMinutes)}) 업로드가 끝난다고 가정하면`);
    console.log(`${indent}              ${est.iso}`);
    console.log(`${indent}              = ${est.human} (${est.zone})`);
    console.log(`${indent}              ↑ 예상값이다. 실제 예약 시각은 업로드가 끝난 뒤 그만큼 뒤로 밀린다.`);
  }
  console.log(`${indent}              privacyStatus는 private로 강제된다. 예약 시각에 YouTube가 public으로 전환한다.`);
  console.log(`${indent}              ⚠ 되돌릴 수 없는 동작 — 사람이 보지 않아도 공개로 넘어간다.`);
}

function usage() {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
}

// ─────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.target) { usage(); process.exit(opts.target ? 0 : 1); }

  const publishPath = resolvePublishPath(opts.target);
  const meta = parsePublishDoc(fs.readFileSync(publishPath, 'utf8'), publishPath);

  if (opts.category) {
    const key = opts.category.trim();
    const hit = CATEGORIES[key] ?? CATEGORIES[key.toLowerCase()] ?? (/^\d+$/.test(key) ? key : null);
    if (!hit) throw new DanbiError(E.USAGE, `--category 값을 해석할 수 없다: ${key}`, `허용: ${Object.keys(CATEGORIES).join(' / ')} 또는 숫자 ID`);
    meta.categoryId = hit;
    meta.categorySource = `--category ${key}`;
  }

  // ── 업로드 없이 기존 영상에 예약만 거는 모드
  if (opts.scheduleOnly) {
    const videoId = opts.videoId ?? meta.existingVideoId;
    if (!videoId) throw new DanbiError(E.USAGE, 'video_id가 없다.', '04-publish frontmatter에 video_id가 있거나 --video-id로 지정해야 한다.');
    const line = '─'.repeat(72);
    console.log(`\n${line}`);
    console.log(`  예약 공개만 설정 — ${meta.productionId} / ${videoId}`);
    console.log(`  https://youtu.be/${videoId}`);
    console.log(line);
    printSchedulePlan(opts.schedule, '  ');
    console.log(`  ※ videos.update part=status 는 status 파트를 통째로 다시 쓴다.`);
    console.log(`     privacyStatus=private, license=youtube, embeddable=true, publicStatsViewable=true,`);
    console.log(`     selfDeclaredMadeForKids=false 로 설정된다. 스튜디오에서 다른 값을 쓰고 있었다면 덮어쓴다.`);
    console.log(`${line}\n`);

    if (opts.dryRun) {
      console.log('✅ 드라이런 완료 — API 호출 0회.');
      console.log(`   실제 적용: node scripts/publish/upload.mjs ${opts.target} --schedule-only --video-id ${videoId}${opts.publishAt ? ` --publish-at "${opts.publishAt}"` : ` --publish-in ${opts.publishIn}`}\n`);
      return;
    }

    const token = await getAccessToken();
    const sch = await applySchedule(token, videoId, meta, opts.schedule, {
      withSynthetic: meta.containsSyntheticMedia,
      anchorMs: Date.now(),
      notes: [],
    });
    if (opts.writeback) {
      writeBackScheduleResult(publishPath, { ...sch, videoId, recordedAt: new Date().toISOString() });
      console.log(`\n   04-publish.md 기입 완료: ${publishPath}`);
    }
    console.log(sch.applied
      ? `\n✅ 예약 완료 — ${sch.iso} (${sch.human} ${sch.zone})에 자동 공개된다.\n   취소하려면 유튜브 스튜디오에서 예약을 해제하라(이 스크립트에는 예약 해제 경로가 없다).\n`
      : `\n❌ 예약이 적용되지 않았다 (${sch.reason}). 영상은 private 상태다.\n`);
    if (!sch.applied) process.exitCode = 1;
    return;
  }

  // ── 공개 범위만 변경하는 모드
  if (opts.setVisibility) {
    const videoId = opts.videoId ?? meta.existingVideoId;
    if (!videoId) throw new DanbiError(E.USAGE, 'video_id가 없다.', '04-publish frontmatter에 video_id가 있거나 --video-id로 지정해야 한다.');
    console.log(`\n공개 범위 변경: ${videoId} → ${opts.setVisibility}`);
    if (opts.dryRun) { console.log('   (--dry-run — API 호출 없음)\n'); return; }
    const token = await getAccessToken();
    await patchVisibility(token, videoId, opts.setVisibility);
    console.log(`✅ 완료: https://youtu.be/${videoId} → ${opts.setVisibility}\n`);
    return;
  }

  const video = probeVideo(meta.videoPath);
  printSummary(meta, video, opts);

  const schedFlags = opts.schedule
    ? (opts.schedule.mode === 'absolute' ? ` --publish-at "${opts.publishAt}"` : ` --publish-in ${opts.publishIn}`)
      + (opts.timezone ? ` --timezone ${opts.timezone}` : '')
    : '';

  if (opts.dryRun) {
    console.log('✅ 드라이런 완료 — 파싱·검증 통과. API 호출 0회, 업로드 없음.');
    console.log(`   실제 업로드: node scripts/publish/upload.mjs ${opts.target}${opts.playlist ? ` --playlist ${opts.playlist}` : ''}${schedFlags}\n`);
    return;
  }

  if (opts.visibility === 'public') {
    console.log('⚠ --visibility public — 업로드 즉시 전체 공개된다. 5초 후 시작 (Ctrl+C로 중단)');
    await sleep(5000);
  }

  // 절대 예약 시각은 업로드 시작 직전에 다시 검사한다 (드라이런과 실행 사이에 시간이 흘렀을 수 있다)
  if (opts.schedule?.mode === 'absolute') {
    assertFuturePublishAt(opts.schedule.epochMs, opts.schedule.offsetMinutes, { minLeadMs: MIN_LEAD_MS, where: '--publish-at' });
  }

  const token = await getAccessToken();

  // ── resumable 세션 확보
  let session = opts.restart ? null : loadSession(meta.productionId, video);
  if (opts.restart) clearSession(meta.productionId);
  let startOffset = 0;

  if (session) {
    console.log(`↻ 기존 resumable 세션 발견 (${session.startedAt}) — 서버 수신 위치 조회 중…`);
    try {
      const q = await queryOffset(session.sessionUri, video.size);
      if (q.done) {
        console.log('   서버가 이미 전량 수신 완료 상태였다.');
        return await finish(q.body, session, token, meta, video, opts, publishPath);
      }
      startOffset = q.offset;
      console.log(`   ${(startOffset / 1024 ** 3).toFixed(2)} GB 지점부터 재개한다.`);
    } catch (e) {
      console.log(`   세션 재개 불가(${e.message}) — 새 세션을 시작한다.`);
      clearSession(meta.productionId);
      session = null;
    }
  }

  if (!session) {
    console.log('▶ resumable 세션 생성 중…');
    const s = await startSession(token, meta, video, opts.visibility);
    session = {
      sessionUri: s.sessionUri, syntheticApplied: s.syntheticApplied,
      videoPath: video.path, size: video.size,
      visibility: opts.visibility, startedAt: new Date().toISOString(),
    };
    saveSession(meta.productionId, session);
    console.log(`   세션 저장: ${sessionFile(meta.productionId)}  (중단 시 같은 명령으로 재개)`);
  }

  console.log(`▶ 업로드 시작 — ${video.sizeHuman}, 청크 ${CHUNK / 1024 / 1024}MiB`);
  const result = await uploadChunks(session.sessionUri, video, startOffset);
  await finish(result, session, token, meta, video, opts, publishPath);
}

async function finish(result, session, token, meta, video, opts, publishPath) {
  const videoId = result.id;
  const url = `https://youtu.be/${videoId}`;
  const completedAtMs = Date.now();     // ← 상대 예약의 기준. 여기서 시스템 시각을 실제로 읽는다.
  clearSession(meta.productionId);
  console.log(`\n✅ 업로드 완료: ${url}  (공개 범위: ${result.status?.privacyStatus ?? session.visibility})`);

  const notes = [];

  // ── 예약 공개 (요청이 있을 때만)
  let schedule = null;
  if (opts.schedule) {
    try {
      schedule = await applySchedule(token, videoId, meta, opts.schedule, {
        withSynthetic: session.syntheticApplied === true,
        anchorMs: completedAtMs,
        notes,
      });
    } catch (e) {
      const msg = `⚠ 예약 공개 설정 실패 — 영상은 private 상태로 남아 있다. 스튜디오에서 수동 예약 필요: ${e.message}`;
      console.log(`   ❌ ${msg}`);
      notes.push(msg);
      schedule = {
        mode: opts.schedule.mode, raw: opts.schedule.raw,
        basis: opts.schedule.mode === 'relative'
          ? `업로드 완료 시각 ${formatOffsetIso(completedAtMs, opts.schedule.offsetMinutes)} + ${opts.schedule.raw} (--publish-in)`
          : `절대 지정 (--publish-at ${opts.schedule.raw})`,
        ...describePublishAt(
          opts.schedule.mode === 'relative' ? completedAtMs + opts.schedule.deltaMs : opts.schedule.epochMs,
          opts.schedule.offsetMinutes,
        ),
        applied: false, reason: e.message,
        actualPrivacyStatus: null, actualPublishAt: null,
      };
    }
  }

  // 썸네일
  let thumbUsed = null;
  const thumb = opts.noThumbnail ? null : (opts.thumbnail ?? meta.thumbnailPath);
  if (thumb) {
    try {
      await setThumbnail(token, videoId, thumb);
      thumbUsed = thumb;
      console.log(`   썸네일 설정 완료: ${path.basename(thumb)}`);
    } catch (e) {
      notes.push(`⚠ 썸네일 설정 실패 — 수동 설정 필요: ${e.message}`);
      console.log(`   ⚠ 썸네일 설정 실패(영상은 정상 업로드됨): ${e.message}`);
    }
  }

  // 재생목록
  let playlistUsed = null;
  if (opts.playlist) {
    try {
      await addToPlaylist(token, videoId, opts.playlist);
      playlistUsed = opts.playlist;
      console.log(`   재생목록 추가 완료: ${opts.playlist}`);
    } catch (e) {
      notes.push(`⚠ 재생목록 추가 실패 — 수동 추가 필요: ${e.message}`);
      console.log(`   ⚠ 재생목록 추가 실패: ${e.message}`);
    }
  } else if (meta.playlistNote) {
    notes.push(`재생목록 미추가 — §0-D 메모(${meta.playlistNote})의 재생목록 ID를 확인해 \`--playlist <id>\`로 추가하라.`);
  }

  if (session.syntheticApplied === 'manual') {
    notes.push('⚠ **변형·합성 콘텐츠 고지가 API로 적용되지 않았다.** 유튜브 스튜디오 → 해당 영상 → 세부정보 → "변형된 콘텐츠 또는 합성 콘텐츠" 항목을 수동 체크할 것.');
  }
  if (schedule?.applied) {
    notes.push(`예약 공개 확인 항목: ${schedule.iso} (${schedule.human} ${schedule.zone})에 실제로 공개됐는지 그 시각 이후 대조할 것. OAuth 프로젝트가 미심사(테스트) 상태일 때 예약 공개가 실제로 동작하는지는 아직 실측되지 않았다.`);
  } else {
    notes.push('첫 업로드 확인 항목: OAuth 프로젝트가 미심사(테스트) 상태일 때 공개 전환이 실제로 제한되는지 — 이 업로드에서 `--set-visibility public`이 성공하는지로 검증한다.');
  }

  if (opts.writeback) {
    writeBackPublishResult(publishPath, {
      videoId, url,
      visibility: result.status?.privacyStatus ?? session.visibility,
      publishedAt: new Date().toISOString(),
      title: meta.title, tagCount: meta.tags.length,
      categoryId: meta.categoryId, categorySource: meta.categorySource,
      syntheticApplied: session.syntheticApplied,
      thumbnail: thumbUsed, playlist: playlistUsed,
      videoPath: video.path, schedule, notes,
    });
    console.log(`   04-publish.md 기입 완료: ${publishPath}`);
  }

  if (notes.length) {
    console.log('\n후속 확인 사항:');
    notes.forEach((n) => console.log(`  - ${n.replace(/\*\*/g, '')}`));
  }

  if (schedule?.applied) {
    console.log(`\n예약 완료 — ${schedule.iso} (${schedule.human} ${schedule.zone})에 YouTube가 자동으로 전체 공개한다.`);
    console.log('   지금 수동 공개할 필요 없다. 취소하려면 유튜브 스튜디오에서 예약을 해제하라.\n');
  } else if (schedule) {
    console.log(`\n⚠ 예약이 적용되지 않았다 (${schedule.reason}). 영상은 비공개 상태다 — 스튜디오에서 직접 예약하라.\n`);
  } else {
    console.log(`\n다음: node scripts/publish/upload.mjs ${meta.productionId} --set-visibility public\n`);
  }
}

// 직접 실행일 때만 main()을 돈다 — 단위 테스트가 parseArgs를 import할 수 있게 한다.
const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((e) => {
    if (e instanceof DanbiError) {
      console.error(`\n❌ [${e.code}] ${e.message}`);
      if (e.hint) console.error(`   → ${e.hint}`);
    } else {
      console.error('\n❌ 예기치 못한 오류:', e.stack ?? e.message);
    }
    process.exit(1);
  });
}
