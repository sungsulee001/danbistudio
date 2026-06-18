# Plugin Signing Operations

상태: production plugin manifest signer 운영 기준.

## 현재 trusted signer

- Production public key: `danbi-production-plugin-rsa-2026`
  - 위치: `src/lib/editor/plugin-signature.ts`
  - 용도: production 플러그인 manifest RSA signature 검증
  - 상태: `active`
  - 유효 시작: `2026-06-01T00:00:00.000Z`
- Local development key: `danbi-local-plugin-dev-rsa-2026`
  - 용도: 테스트/로컬 개발 fixture
  - production readiness에서는 development-only key로 표시된다.

## 비밀키 보관

- production private key는 git에 넣지 않는다.
- 기본 생성 위치는 `.danbi/plugin-signing/*.private.pem`이며 `.danbi/`와 `*.pem`은 `.gitignore` 대상이다.
- release 작업자는 private key 파일을 OS credential vault, offline encrypted storage, 또는 별도 secret manager에 백업해야 한다.
- release artifact에는 private key를 포함하지 않는다.
- plugin package 서명과 Electron production release 준비는 분리한다. `plugin-package:sign`을 먼저 끝낸 뒤 production release prepare를 실행할 때는 `DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH`를 비워 둔다.

## 새 signer 생성

```powershell
npm run plugin-signing:keygen -- --key-id danbi-production-plugin-rsa-2027 --valid-from 2027-01-01T00:00:00.000Z
```

생성 결과:

- `.danbi/plugin-signing/<key-id>.private.pem`
- `.danbi/plugin-signing/<key-id>.public.pem`
- `.danbi/plugin-signing/<key-id>.trusted-key.json`
- `src/lib/editor/plugin-signature.ts`에 붙여 넣을 TypeScript trusted key snippet

공개키 snippet만 코드에 반영한다. private key 파일은 반영하지 않는다.

## 회전 절차

1. `plugin-signing:keygen`으로 새 key id를 생성한다.
2. 새 public trusted key를 `DEFAULT_PLUGIN_MANIFEST_TRUSTED_SIGNING_KEYS`에 `active`로 추가한다.
3. 기존 key는 `retiring`으로 바꾸고 `replacementKeyId`에 새 key id를 적는다.
4. 기존 key로 서명된 배포 대상 plugin package가 더 이상 필요 없으면 기존 key를 `revoked` 또는 `validUntil` 만료 상태로 전환한다.
5. `npm run plugin-signing:rotation-drill`로 retiring/active overlap, revoked old key, expired-without-replacement negative control을 리허설한다.
6. `npm run plugin-signing:check`와 production channel check를 실행한다.

## 회전 리허설

```powershell
npm run plugin-signing:rotation-drill
```

리허설은 실제 production private key를 사용하지 않는다. 스크립트가 in-memory RSA key를 생성하고 public trusted-key fixture만 `.danbi/plugin-signing-rotation-drill` 아래에 기록한다.

검증 시나리오:

- `retiring-current-with-active-next`: 기존 key가 `retiring`, 새 key가 `active`인 overlap 기간은 production-ready여야 한다.
- `revoked-current-with-active-next`: 기존 key가 `revoked`여도 새 active key가 있으면 production-ready여야 한다.
- `expired-current-without-next`: 대체 key 없이 기존 key가 만료된 경우 production-ready가 아니어야 한다.

산출물:

- `.danbi/plugin-signing-rotation-drill/rotation-drill-report.json`
- `.danbi/plugin-signing-rotation-drill/*.plugin-signature.ts`

이 리허설은 private key 파일을 쓰거나 출력하지 않는다.

## release gate

```powershell
npm run plugin-signing:check
$env:DANBI_RELEASE_CHANNEL='production'; npm run plugin-signing:check
npm run plugin-signing:rotation-drill
npm run plugin-signing:custody-audit
$env:DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH=$null
$env:DANBI_RELEASE_CHANNEL='production'; npm run electron:release:prepare
```

Production channel은 아래 조건을 요구한다.

- non-development key id/label
- `active` 또는 `retiring` lifecycle
- 현재 시점이 `validFrom`/`validUntil` 범위 안에 있음
- RSA public key material이 실제 modulus/exponent 형태로 준비됨
- production `electron:release:prepare`는 custody audit를 `--forbid-private-key-env` 정책으로 실행하므로 private key env가 남아 있으면 실패함

## private key custody audit

```powershell
npm run plugin-signing:custody-audit
npm run plugin-signing:custody-audit -- --forbid-private-key-env
```

audit는 기본적으로 release-bound 경로만 검사한다.

- `src`
- `scripts`
- `public/editor-preview-worker.js`
- `public/luts`
- `dist-electron`
- `.next/standalone/server.js`
- `.next/standalone/.next`
- `.danbi/electron-release`
- `release/electron`
- `electron-builder.yml`
- `package.json`

차단 조건:

- PEM private key 본문이 발견됨
- release output/manifest에 `.private.pem` 경로가 기록됨
- `DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH`가 repository 안에 있고 `.danbi/plugin-signing/` 밖을 가리킴
- `--forbid-private-key-env` 모드에서 `DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH`가 설정되어 있음

`tests/`와 `.danbi/plugin-signing/` private-key storage는 기본 scan 범위에서 제외된다. `npm run electron:release:prepare`는 release manifest를 쓴 뒤 이 audit를 실행하고, production channel에서는 private-key env 금지 모드로 통과한 summary를 manifest에 다시 기록한다.

## plugin package 서명

```powershell
$env:DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH='.danbi/plugin-signing/danbi-production-plugin-rsa-2026.private.pem'
npm run plugin-package:sign -- --package-dir path\to\plugin-package --key-id danbi-production-plugin-rsa-2026
```

`plugin-package:sign`은 아래를 수행한다.

- `danbi-plugin-package.json`의 `plugin.signature`를 RSA-SHA256으로 갱신한다.
- package `files[]`의 `bytes`와 `sha256`을 실제 파일 기준으로 다시 계산한다.
- `exporterWriters[].runtimePackage.files[]`의 `bytes`와 `sha256`도 package file manifest와 맞춘다.
- private key가 plugin package 폴더 안에 있으면 실패한다.
- private key가 repository 안에 있을 경우 `.danbi/plugin-signing/` 아래가 아니면 실패한다.
- private key 내용은 manifest, stdout, report에 쓰지 않는다.
- 서명 결과를 만든 뒤 production release prepare를 실행하기 전에는 `DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH`를 shell에서 제거한다.

운영자는 서명 후 아래를 확인한다.

```powershell
npm run plugin-signing:check
```

## 완료 기준

- production release manifest의 `pluginSigning.productionReady`가 `true`다.
- production release manifest의 `pluginSigningCustodyAudit.status`가 `passed`다.
- production release manifest의 `pluginSigningCustodyAudit.forbidPrivateKeyEnv`가 `true`이며 private key env violation이 없다.
- release manifest에는 private key 경로 또는 private key 내용이 없다.
- `plugin-package:sign`으로 서명된 package manifest는 trusted production public key로 검증된다.
- revoked/expired key로 서명된 plugin package는 설치 단계에서 차단된다.
