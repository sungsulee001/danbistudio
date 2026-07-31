#!/usr/bin/env node
/**
 * Danbi S7 — YouTube OAuth 최초 1회 인증 (인간 전용)
 *
 *   node scripts/publish/auth.mjs
 *
 * ⚠ 이 스크립트는 브라우저에서 구글 계정 동의가 필요하다. 에이전트는 실행하지 않는다.
 * 성공하면 .secrets/youtube-token.json 에 refresh_token이 저장되고, 이후 upload.mjs는
 * 사람 개입 없이 access_token을 자동 갱신한다.
 *
 * 방식: 데스크톱 앱(installed) loopback redirect + PKCE(S256).
 * 의존성 없음 — node:http 로컬 서버 + 전역 fetch만 사용.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  SCOPES, TOKEN_PATH, DanbiError, E,
  loadClientSecret, saveToken, isWindows,
} from './lib.mjs';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function openBrowser(url) {
  try {
    if (isWindows()) {
      spawn('cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
    } else {
      spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { clientId, clientSecret, authUri, tokenUri } = loadClientSecret();

  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const result = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/') { res.writeHead(404).end(); return; }

      const err = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const gotState = url.searchParams.get('state');

      const html = (title, body, ok) => `<!doctype html><meta charset="utf-8">
<title>${title}</title><body style="font-family:system-ui;max-width:36rem;margin:4rem auto;line-height:1.7">
<h2 style="color:${ok ? '#137333' : '#c5221f'}">${title}</h2><p>${body}</p>
<p style="color:#666">이 창은 닫아도 됩니다.</p></body>`;

      if (err) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
           .end(html('인증 거부됨', `구글이 반환한 오류: <code>${err}</code>`, false));
        server.close();
        reject(new DanbiError(E.AUTH, `사용자가 동의를 거부했거나 구글이 오류를 반환했다: ${err}`));
        return;
      }
      if (!code || gotState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
           .end(html('잘못된 콜백', 'state 불일치 또는 code 누락입니다.', false));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
         .end(html('인증 완료 ✅', 'Danbi S7 업로더에 YouTube 계정이 연결되었습니다.<br>터미널로 돌아가세요.', true));
      server.close();
      resolve(code);
    });

    server.on('error', (e) => reject(new DanbiError(E.AUTH, `로컬 콜백 서버를 열 수 없다: ${e.message}`)));

    // 포트 0 = OS가 빈 포트 할당. 데스크톱 앱 클라이언트는 http://localhost 의 임의 포트를 허용한다.
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://localhost:${port}`;

      const authUrl = new URL(authUri);
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',       // refresh_token 발급
        prompt: 'consent',            // 재실행 시에도 refresh_token을 다시 받는다
        include_granted_scopes: 'true',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();

      console.log('\n=== Danbi S7 — YouTube 계정 연결 ===\n');
      console.log(`콜백 대기 중: ${redirectUri}`);
      console.log('\n브라우저가 열리지 않으면 아래 주소를 직접 붙여넣으세요:\n');
      console.log(authUrl.toString());
      console.log('\n화면 순서:');
      console.log('  1) 구글 계정 선택 → 유튜브 채널을 소유한 계정(예: silenttime5959)');
      console.log('  2) "Google에서 확인하지 않은 앱입니다" 경고 → [고급] → [<앱 이름>(으)로 이동]');
      console.log('     (본인이 만든 클라이언트이므로 정상. 심사 전 상태에서 나오는 화면입니다.)');
      console.log('  3) 권한 2개 모두 체크: YouTube 동영상 관리 / YouTube 계정 관리');
      console.log('  4) [계속] → 이 터미널에 "인증 완료"가 찍히면 끝\n');

      global.__redirectUri = redirectUri;
      openBrowser(authUrl.toString());
    });
  });

  // ── code → token 교환
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: result,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: global.__redirectUri,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let reason = text;
    try { const j = JSON.parse(text); reason = j.error_description ?? j.error ?? text; } catch {}
    throw new DanbiError(E.AUTH, `토큰 교환 실패 (HTTP ${res.status}): ${reason}`);
  }
  const j = JSON.parse(text);
  if (!j.refresh_token) {
    throw new DanbiError(
      E.AUTH,
      'refresh_token이 발급되지 않았다.',
      'Google 계정 → 보안 → 서드파티 액세스에서 이 앱 권한을 제거한 뒤 다시 실행하라.'
    );
  }

  saveToken({
    refresh_token: j.refresh_token,
    access_token: j.access_token,
    expiry: Date.now() + (j.expires_in ?? 3600) * 1000,
    scope: j.scope,
    token_type: j.token_type,
    obtained_at: new Date().toISOString(),
  });

  // 어떤 채널에 연결됐는지 확인 (1 unit)
  let channel = '(확인 실패)';
  try {
    const me = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${j.access_token}` },
    });
    if (me.ok) {
      const mj = await me.json();
      const c = mj.items?.[0];
      if (c) channel = `${c.snippet.title} (${c.id})`;
    }
  } catch {}

  console.log('✅ 인증 완료.');
  console.log(`   토큰 저장: ${TOKEN_PATH}`);
  console.log(`   연결된 채널: ${channel}`);
  console.log(`   스코프: ${j.scope}`);
  console.log('\n⚠ 동의 화면이 "테스트(Testing)" 상태이면 이 리프레시 토큰은 7일 후 만료됩니다.');
  console.log('   OAuth 동의 화면 → 게시 상태를 "프로덕션"으로 전환하면 만료가 사라집니다. (README §3)');
  console.log('\n다음 단계: node scripts/publish/upload.mjs <production_id> --dry-run\n');
}

main().catch((e) => {
  if (e instanceof DanbiError) {
    console.error(`\n❌ [${e.code}] ${e.message}`);
    if (e.hint) console.error(`   → ${e.hint}`);
  } else {
    console.error('\n❌ 예기치 못한 오류:', e.message);
  }
  process.exit(1);
});
