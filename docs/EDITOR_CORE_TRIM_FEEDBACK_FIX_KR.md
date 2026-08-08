# Editor Core Clip Edge Trim Feedback Fix

작성일: 2026-06-19

## 목적

상용 편집기 기준의 편집기 핵심 조작 감사에서 `clip edge drag trim` 항목은 기능은 존재하지만, 사용자가 마우스로 잡을 수 있는 trim edge와 드래그 중 피드백 노출이 부족했다.

이번 변경은 새 편집 기능 추가가 아니라 기존 clip trim 기능의 직접 조작 지점과 드래그 중 상태 표시를 명확히 노출하는 수정이다.

## 변경 범위

- 타임라인 클립 양쪽 edge trim hit target에 `aria-label`, `data-testid`, `data-trim-edge`를 추가했다.
- trim edge hit target 폭을 `w-2`에서 `w-3`으로 넓혀 마우스 조작 가능성을 높였다.
- 드래그 중 clip preview 상태를 테스트 가능하도록 `data-preview-label`, `data-preview-start`, `data-preview-duration`을 노출했다.
- trim preview label을 `Trim head +... / ...`, `Trim tail +... / ...` 형태로 표시해 드래그 중 변화량과 결과 길이를 확인할 수 있게 했다.

## 수정 파일

- `src/electron/renderer/timeline-clip-button.tsx`
- `src/electron/renderer/timeline-edit-preview-helpers.ts`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `tests/lib/editor-core.test.ts`

## 건드리지 않은 영역

다음 시스템의 동작, 의미, 검증 기준, 아키텍처는 변경하지 않았다.

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Extension / Plugin system
- 기존 ComfyUI export validation semantics

## 검증 계획

전체 테스트 반복은 하지 않고 변경 영향 범위만 확인한다.

- `npx vitest run tests/lib/editor-core.test.ts -t "builds trim preview guides"`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`
- `npm run build`
- `git diff --check`
