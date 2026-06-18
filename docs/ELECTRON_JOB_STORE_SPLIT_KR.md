# Electron Job Store Split

작성일: 2026-06-15

## 목적

render, media cache, STT, ComfyUI queue는 실행 상태를 로컬 개발 `.danbi/jobs`, Electron 패키지 `userData/jobs`에 저장한다. 이 파일 시스템 영속화는 Node runtime 책임이므로 순수 editor core인 `src/lib/editor` 밖으로 이동한다.

## 현재 구조

- `src/server/editor/job-store.ts`
  - `savePersistedJob()`
  - `getPersistedJob()`
  - `listPersistedJobs()`
  - `clearTerminalPersistedJobs()`
  - local data root의 `jobs/*.json` atomic write
- `src/lib/editor/*-queue.ts`
  - 아직 migration 중인 Node-backed queue service로 남아 있다.
  - job persistence는 server job store를 호출한다.

## 완료 증거

- `src/lib/editor/job-store.ts` 제거.
- `scripts/check-electron-boundaries.mjs` allowlist에서 `src/lib/editor/job-store.ts` 제거.
- `npm run architecture:check` 통과.
- render/cache/STT/ComfyUI queue의 persisted job 테스트가 기존 `editor-core` 테스트에서 통과.

## 다음 이동 대상

`media-cache-queue`, `render-queue`, `stt-queue`, `comfyui-queue` 자체가 아직 `src/lib/editor` allowlist에 남아 있다. 이 파일들은 실행 queue/service 경계로 옮기고, 순수 timeline/render plan 타입은 `src/lib/editor`에 남기는 방식으로 단계적으로 줄인다.
