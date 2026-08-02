#!/usr/bin/env node
// ---------------------------------------------------------------------------
// serve-boards.mjs — 콘티 시트 정적 서버
// ---------------------------------------------------------------------------
// 왜 필요한가: `file://`로 열면 브라우저가 `fetch`와 File System Access API를 막는다.
//   → 코멘트 디스크 저장·자동 복원이 동작하지 않고, 프리뷰 index.json도 못 읽는다.
//   http로 열면 이 전부가 온전히 동작한다. **이것이 권장 열람 경로다.**
//
// 사용:
//   node scripts/pipeline/serve-boards.mjs <09-boards 폴더> [--port 8788] [--no-open]
//   npm run conti:serve -- <09-boards 폴더>
//
// PUT 지원: File System Access가 없는 환경(비-Chromium 등)을 위해
//   `PUT /conti-feedback-<id>.json`을 받아 그 폴더에 그대로 쓴다. 시트가 자동으로 사용한다.
// ---------------------------------------------------------------------------

import http from 'node:http';
import path from 'node:path';
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--no-open') { args.noOpen = true; continue; }
    if (token.startsWith('--')) { args[token.slice(2)] = argv[i + 1]; i += 1; continue; }
    args._.push(token);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args._[0] ?? process.cwd());
const port = Number(args.port ?? 8788);

if (!existsSync(root)) {
  console.error(`폴더가 없습니다: ${root}`);
  process.exit(2);
}

/** 루트 밖으로 나가는 경로는 거부한다(경로 이탈 방지). */
function safeJoin(urlPath) {
  const rel = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  const resolved = path.resolve(root, rel);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  const target = safeJoin(req.url === '/' ? '/conti-sheet.html' : req.url);
  if (!target) { res.writeHead(403); res.end('forbidden'); return; }

  // 피드백 JSON 저장(File System Access 불가 환경용 폴백 경로)
  if (req.method === 'PUT' && /conti-feedback-[^/\\]+\.json$/i.test(target)) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        JSON.parse(body);                     // 형식 검증 — 깨진 본문은 쓰지 않는다
        writeFileSync(target, body, 'utf8');
        console.log(`[serve-boards] PUT ${path.basename(target)} (${body.length}B)`);
        res.writeHead(204); res.end();
      } catch (err) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`bad json: ${err.message}`);
      }
    });
    return;
  }

  try {
    if (statSync(target).isDirectory()) { res.writeHead(404); res.end('directory'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',          // 프리뷰가 새로 생기면 새로고침으로 바로 보이게
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/conti-sheet.html`;
  console.log(`[serve-boards] ${root}`);
  console.log(`[serve-boards] ${url}`);
  console.log('[serve-boards] Ctrl+C로 종료. http로 열어야 코멘트 디스크 저장·자동 복원이 동작한다.');
  if (!args.noOpen && process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  }
});
