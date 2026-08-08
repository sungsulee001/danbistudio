# Editor Core Timeline Interaction Completion

작성일: 2026-06-19

## 목적

상용 편집기 기준 감사에서 남아 있던 타임라인 직접 조작 항목을 보강했다.

이번 변경은 새 편집 기능 추가가 아니라 기존 편집기 기능의 마우스 조작 지점, 상태 피드백, E2E 검증 가능성을 정리한 작업이다.

## 완료한 항목

- Timeline zoom slider를 직접 드래그해 확대/축소 상태를 확인할 수 있게 했다.
- Timeline ruler scrubber를 마우스로 직접 드래그해 playhead가 이동하는지 검증했다.
- Timeline playhead slider 직접 조작 상태를 테스트 가능하게 했다.
- Timeline lane box selection을 실제 drag range로 검증했다.
- Timeline context menu를 `role="menu"`와 action test id로 노출해 우클릭 후 context action 실행을 검증했다.
- Media Bin asset drag handle을 추가하고, 기존 HTML5 drag/drop은 유지하면서 pointer 기반 timeline drop fallback을 추가했다.
- Timeline drop preview와 drop commit이 기존 asset drop plan을 그대로 사용하도록 연결했다.

## 수정 파일

- `src/app/editor/page.tsx`
- `src/electron/renderer/editor-top-toolbar.tsx`
- `src/electron/renderer/media-bin-panel.tsx`
- `src/electron/renderer/timeline-context-menu.tsx`
- `src/electron/renderer/timeline-track-row.tsx`
- `src/electron/renderer/timeline-transport-ruler.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`

## 유지한 동작

- 기존 HTML5 media asset drag/drop 경로는 제거하지 않았다.
- 기존 insert/overwrite drop plan, source range, audio patch, snap, timeline edit guide 로직을 재사용했다.
- context menu action semantics는 변경하지 않았다.
- timeline zoom/scrub/playhead/box selection 기존 로직은 유지하고 테스트 가능한 상태값만 추가했다.

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

## 검증

실행한 검증:

- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`

결과:

- 7 passed

전체 테스트 반복은 실행하지 않았다.
