# Editor Core Remaining Stage Completion

작성일: 2026-06-20

## 목적

이번 작업은 Danbi Editor를 "버튼이 놓여 있는 화면"에서 실제 편집 상호작용이 가능한 편집기 화면으로 끌어올리는 4단계 마무리 작업이다.

새 편집 기능을 넓게 추가하지 않고, 기존 editor core가 이미 가진 기능을 마우스 직접 조작 경로와 검증 가능한 acceptance path로 연결했다.

## 완료 범위

### 1. Timeline selection / drag

완료 상태: 완료

적용 내용:

- timeline clip DOM에 `data-clip-id`, `data-track-id`, `data-asset-id`를 노출해 실제 선택/이동 결과를 검증 가능하게 했다.
- multi-select 상태에서 clip group drag move가 실제 timeline state를 갱신하는지 E2E로 고정했다.
- clip body drag로 호환 video track으로 이동하는 경로를 E2E로 고정했다.
- 기존 trim, scrub, box selection, context action 경로는 유지했다.

주요 파일:

- `src/electron/renderer/timeline-clip-button.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`

### 2. Program Monitor direct manipulation / Inspector sync

완료 상태: 완료

적용 내용:

- Program Monitor transform handle drag 후 Inspector의 Position X/Y 값이 같은 state를 보도록 검증했다.
- Inspector Position X/Y 입력 변경이 Program Monitor overlay의 motion state로 반영되는 경로를 검증했다.
- 숫자 입력 컴포넌트에 테스트 식별자를 추가했다.
- transform/crop handle, preview worker, render worker, inspector panel 구조는 유지했다.

주요 파일:

- `src/electron/renderer/editor-form-controls.tsx`
- `src/electron/renderer/inspector-motion-panels.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`

### 3. Media import -> bin -> source monitor -> timeline

완료 상태: 완료

적용 내용:

- visible Media panel `+ Import` 버튼으로 가져온 파일이 media grid에 들어오는 기존 경로를 유지했다.
- 가져온 asset card 클릭 시 Source Monitor가 해당 asset을 선택하는지 검증했다.
- 가져온 `.wav` asset을 card Insert 버튼으로 timeline audio track에 삽입하는 경로를 E2E로 고정했다.
- 동적 clip id에 의존하지 않도록 timeline clip에 source asset id를 DOM 속성으로 노출했다.
- Source Monitor에 선택된 source asset id/name을 테스트 가능한 속성으로 노출했다.

주요 파일:

- `src/electron/renderer/source-monitor.tsx`
- `src/electron/renderer/timeline-clip-button.tsx`
- `tests/e2e/editor-media-import-grid.spec.ts`

### 4. Program Monitor UI cleanup

완료 상태: 완료

적용 내용:

- Program Monitor canvas viewport와 실제 project canvas의 시각 경계를 분리했다.
- viewport 배경을 canvas와 다른 톤으로 정리해 영상/캔버스가 왼쪽으로 붙어 보이는 문제를 줄였다.
- canvas stage를 중앙 정렬하고 얇은 stage boundary를 추가했다.
- playback, proxy, info, zoom, aspect, fullscreen controls는 preview canvas 아래의 별도 control bar에 유지했다.
- diagnostics overlay는 기본 숨김 상태를 유지했다.

주요 파일:

- `src/electron/renderer/program-composite-preview.tsx`

## 실행한 검증

관련 범위만 실행했다. 전체 테스트 반복은 실행하지 않았다.

- `npx eslint src/electron/renderer/timeline-clip-button.tsx src/electron/renderer/source-monitor.tsx tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`
- `npx eslint src/electron/renderer/program-composite-preview.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`

통과 결과:

- media import grid/source/timeline E2E: 2 passed
- editor direct manipulation E2E: 16 passed
- 관련 ESLint: 통과

이전 단계에서 통과한 관련 검증:

- `npx vitest run tests/lib/timeline-interaction-adapter.test.ts`: 11 passed
- `npx vitest run tests/lib/program-monitor-interaction-adapter.test.ts`: 6 passed

## 건드리지 않은 영역

이번 작업은 다음 시스템을 제거, 우회, 비활성화, 다운그레이드, mock 처리하지 않았다.

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 남은 품질 과제

이번 작업은 편집기 직접 조작의 핵심 경로를 닫은 단계다. CapCut / Filmora / Shotcut 수준으로 계속 끌어올리려면 다음 항목은 별도 단계로 남는다.

- media bin의 large thumbnail grid / compact list 전환
- inspector panel의 상용 편집기형 tab 구조 정리
- Program Monitor canvas aspect preset 변경 UX
- source/program monitor 전환 UX 세분화
- timeline drag/drop 중 snap line, collision, ripple preview의 시각 품질 강화
- audio playback 출력 장치/음량/음소거 UX 정리
