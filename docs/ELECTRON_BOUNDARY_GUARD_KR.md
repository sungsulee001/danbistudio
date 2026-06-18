# Electron Boundary Guard

작성일: 2026-06-15

## 목적

Danbi Studio 편집기가 Electron main / preload / renderer / shared 경계를 유지하도록 자동 검사한다. 이후 FFmpeg, ComfyUI, STT, 자동화, extension API를 확장할 때 renderer에 Node/Electron 권한이 섞이지 않게 막는 것이 목적이다.

## 적용된 구조

- `src/electron/shared/editor-api.ts`
  - preload bridge의 타입과 factory 계약을 소유한다.
  - renderer와 preload가 같은 계약을 import한다.
- `src/electron/preload/editor-api.ts`
  - shared 계약을 re-export만 한다.
  - Electron runtime 접근은 `electron-preload.ts`에서만 수행한다.
- `src/electron/renderer/editor-ipc-client.ts`
  - preload module을 직접 import하지 않고 shared 계약을 import한다.
- `scripts/check-electron-boundaries.mjs`
  - source import graph와 native module 사용을 검사한다.

## 검사 명령

```powershell
npm run architecture:check
```

현재 검사 결과:

```text
Electron architecture boundary check passed (241 files scanned).
```

## 강제 규칙

- renderer, `src/app/editor`, shared는 Node/Electron native module을 직접 import하지 않는다.
- renderer와 `src/app/editor`는 main/preload를 직접 import하지 않는다.
- main, preload, shared는 renderer 또는 `src/app/editor`에 의존하지 않는다.
- preload는 shared contract를 renderer에 노출하는 bridge 역할만 한다.
- editor core는 Electron layer에 의존하지 않는다.

## 남은 이전 대상

아래 파일들은 현재 Node 기반 local service 성격이 강해 `src/lib/editor` 안에 남아 있지만, 검사 스크립트의 explicit allowlist에만 허용되어 있다. 다음 구조 작업에서 Electron main 또는 server service boundary로 옮겨야 한다.

- `src/lib/editor/comfyui-queue.ts`
- `src/lib/editor/media-cache-queue.ts`
- `src/lib/editor/media-cache.ts`
- `src/lib/editor/render-queue.ts`
- `src/lib/editor/stt-queue.ts`

이 목록은 새 기능 추가 대상이 아니라 구조 부채 목록이다. 완성품 기준의 "Electron main/preload/renderer/shared boundary" 증거를 강화하기 위해 단계적으로 줄여야 한다.
