# Electron Media Analyzer Split

작성일: 2026-06-15

## 목적

`ffprobe` 실행은 Node `child_process`가 필요하다. 이 실행 코드를 순수 editor core인 `src/lib/editor`에 두면 renderer 확장 중 Node 권한이 섞일 위험이 있다. 따라서 미디어 분석을 파서와 실행기로 분리한다.

## 현재 구조

- `src/lib/editor/media-analyzer.ts`
  - `MediaAnalysis` 타입
  - `parseFfprobeOutput()` 순수 parser
  - Node/Electron import 없음
- `src/server/editor/media-analyzer.ts`
  - `analyzeMediaFile()`
  - `ffprobe` 실행
  - Node `child_process` 소유

## 사용 경계

- Next API route, Electron main native import, render smoke, 기존 native queue service는 server analyzer를 호출한다.
- renderer, `src/app/editor`, shared contracts, 순수 editor core는 server analyzer를 직접 import하지 않는다.
- `npm run architecture:check`가 이 경계를 검사한다.

## 완료 증거

- `src/lib/editor/media-analyzer.ts`는 더 이상 `node:child_process`를 import하지 않는다.
- `scripts/check-electron-boundaries.mjs` allowlist에서 `src/lib/editor/media-analyzer.ts`가 제거됐다.
- `npm run architecture:check`가 server service 경계를 포함해 통과해야 한다.
