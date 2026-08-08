# Editor OpenCut Base Shell Mapping

작성일: 2026-06-20

## 배경

Danbi Editor의 기존 화면은 기능을 많이 붙여 둔 상태였지만, 기본 편집기 UX/UI 골격이 약했다.

문제점:

- 상단 버튼이 과도하게 나열됨
- media / preview / inspector / timeline의 우선순위가 명확하지 않음
- 상용 편집기와 OpenCut/OpenReel 같은 전용 편집기의 기본 구조보다 Danbi 자체 화면 구조에 계속 맞추는 문제가 있었음

이번 패스의 목표는 Danbi 화면을 계속 덧칠하지 않고, 로컬에 존재하는 완성도 있는 편집기 소스의 기본 골격을 기준으로 삼아 Danbi 기능을 매핑하는 것이다.

## 사용한 기준 소스

OpenShot 소스는 로컬에서 발견되지 않았다.

이번 기준 소스:

- `E:\ai_tool\opencut-classic-ref`

참조한 파일:

- `apps/web/src/components/editor/editor-header.tsx`
- `apps/web/src/components/editor/panels/assets/index.tsx`
- `apps/web/src/components/editor/panels/assets/tabbar.tsx`
- `apps/web/src/components/editor/panels/properties/index.tsx`
- `apps/web/src/timeline/components/index.tsx`
- `apps/web/src/timeline/components/timeline-toolbar.tsx`

## OpenCut 구조에서 가져온 기준

OpenCut classic의 기본 편집기 구조:

- 고정 높이 editor header
- 좌측 assets panel
- assets panel 내부 세로 tab bar
- 중앙 preview/monitor
- 우측 properties panel
- 하단 timeline panel
- timeline 내부 toolbar는 timeline 전용으로 분리
- wheel/scroll/zoom/seek/drag/drop/resize 컨트롤러는 timeline 영역에 귀속

## Danbi 매핑

| OpenCut 기준 | Danbi 매핑 |
| --- | --- |
| EditorHeader | `EditorTopToolbar` compact header |
| AssetsPanel | `MediaBinPanel`, project/templates/health panels |
| Assets vertical tab bar | `EDITOR_ASSET_PANELS` / primary mode rail |
| Preview center | `PreviewStage` + optional `SourceMonitor` |
| PropertiesPanel | `Inspector*Panel`, Export, Plugins, Jobs |
| Timeline panel | `TimelineTransportRulerPanel`, `TimelineTrackRow`, `TimelineClipList` |
| Timeline toolbar | timeline controls inside `TimelineTransportRulerPanel` |

## 구현 내용

### 1. 상단 toolbar 정리

파일:

- `src/electron/renderer/editor-top-toolbar.tsx`

변경:

- header를 OpenCut식 고정 높이 한 줄 구조로 변경
- `Insert Gap`, `Ripple`, `Snap`, `Loop`, paste mode를 `Timeline` 메뉴로 이동
- 항상 보이는 버튼을 Undo, Redo, Import, Commands, Cut, Delete, Edit, Source, Marks, Timeline, Export, Render, AI 중심으로 축소
- 기존 기능 핸들러는 제거하지 않음

### 2. editor workbench grid 교체

파일:

- `src/app/editor/page.tsx`

변경:

- 기존 상단 primary mode row를 좌측 세로 rail로 이동
- grid를 다음 구조로 재배치
  - column 1: primary mode rail
  - column 2: assets/media panel
  - column 3: program/source monitor
  - column 4: inspector/properties panel
  - bottom: timeline
- timeline은 assets rail을 제외한 전체 작업 폭을 사용
- 각 주요 영역을 panel 단위 border/rounded shell로 분리

## 유지한 기능

기능을 제거하거나 약화하지 않았다.

- media import
- source monitor
- program monitor
- inspector transform/effects/audio/text/jobs/export/plugins
- timeline drag/drop
- clip select
- clip body drag move
- clip edge trim
- playhead scrub
- waveform interaction
- ComfyUI
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system

## 검증

실행한 검사:

- `npx eslint src/app/editor/page.tsx src/electron/renderer/editor-top-toolbar.tsx`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts tests/e2e/editor-media-import-grid.spec.ts --project=chromium`

결과:

- ESLint 통과
- Editor / media 관련 E2E 13개 통과

확인된 동작:

- media import 버튼을 통한 grid import 동작 유지
- media bin drag/drop to timeline 유지
- program monitor transform/crop direct manipulation 유지
- timeline clip edge trim 유지
- timeline clip body drag move 유지
- timeline zoom/scrub/playhead 유지
- waveform interaction 유지
- program monitor controls와 timeline state 연동 유지

## 다음 단계

이번 패스는 편집기 기본 골격 전환이다.

## 2026-06-20 추가 controller 적용

기본 shell 전환 이후 OpenCut classic의 controller 구조 중 바로 Danbi에 적용 가능한 항목을 추가로 연결했다.

### 1. Timeline wheel zoom anchoring

기준 소스:

- `E:\ai_tool\opencut-classic-ref\apps\web\src\timeline\hooks\use-timeline-zoom.ts`
- `E:\ai_tool\opencut-classic-ref\apps\web\src\timeline\controllers\zoom-controller.ts`

Danbi 적용 파일:

- `src/electron/renderer/timeline-interaction-adapter.ts`
- `src/electron/renderer/timeline-transport-ruler.tsx`
- `src/app/editor/page.tsx`

적용 내용:

- Ctrl/Meta + wheel gesture를 timeline zoom으로 처리
- zoom 전 커서 아래 timeline time을 계산
- zoom 후에도 같은 timeline time이 같은 화면 좌표에 남도록 `scrollLeft`를 재계산
- 일반 wheel/shift wheel scroll은 기존 브라우저 스크롤 동작을 유지

검증:

- adapter unit test에서 anchor time과 scrollLeft 계산 확인
- E2E에서 실제 `WheelEvent(ctrlKey=true)`가 timeline zoom과 scrollLeft를 변경하는지 확인

### 2. Program monitor viewport pan

기준 소스:

- `E:\ai_tool\opencut-classic-ref\apps\web\src\preview\components\preview-viewport.tsx`

Danbi 적용 파일:

- `src/electron/renderer/program-composite-preview.tsx`

적용 내용:

- program monitor zoom이 100%를 넘으면 canvas viewport에서 middle-drag pan 가능
- pan은 stage 크기와 viewport 크기를 기준으로 clamp
- Fit 버튼은 zoom과 pan을 함께 초기화
- 기존 transform handle / crop handle 동작은 유지

검증:

- E2E에서 monitor zoom을 150%로 올린 뒤 middle-drag pan이 stage pan state를 변경하는지 확인

### 3. Program monitor wheel zoom anchoring

기준 소스:

- `E:\ai_tool\opencut-classic-ref\apps\web\src\preview\components\preview-viewport.tsx`

Danbi 적용 파일:

- `src/electron/renderer/program-monitor-interaction-adapter.ts`
- `src/electron/renderer/program-composite-preview.tsx`

적용 내용:

- Ctrl/Meta + wheel gesture를 program monitor viewport zoom으로 처리
- wheel 입력 위치의 stage anchor를 계산
- zoom 후에도 같은 preview 지점이 마우스 아래에 남도록 pan을 재계산
- stage가 viewport보다 작은 경우 pan은 안전하게 0으로 clamp
- 기존 transform/crop handle 동작은 유지

검증:

- adapter unit test에서 off-center cursor zoom 시 pan 계산 확인
- E2E에서 program monitor viewport에 실제 `WheelEvent(ctrlKey=true)`를 dispatch해 zoom percent 변경 확인

### 추가 검증 결과

실행한 검사:

- `npx eslint src/app/editor/page.tsx src/electron/renderer/timeline-transport-ruler.tsx src/electron/renderer/timeline-interaction-adapter.ts tests/lib/timeline-interaction-adapter.test.ts tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx eslint src/electron/renderer/program-composite-preview.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx eslint src/electron/renderer/program-monitor-interaction-adapter.ts src/electron/renderer/program-composite-preview.tsx tests/lib/program-monitor-interaction-adapter.test.ts tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx vitest run tests/lib/timeline-interaction-adapter.test.ts`
- `npx vitest run tests/lib/program-monitor-interaction-adapter.test.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`

통과 결과:

- timeline interaction adapter unit test 6개 통과
- program monitor interaction adapter unit test 6개 통과
- editor direct manipulation E2E 14개 통과

다음에 OpenCut classic에서 더 가져올 수 있는 실제 구현 영역:

1. timeline scroll sync controller
2. element interaction controller 기반 body drag/resize 통합
3. properties panel tab registry 구조
4. media assets panel tabbar 구조의 실제 component 분리

## 2026-06-20 추가 적용: element interaction controller 패턴

이번 단계는 OpenCut classic 전체 마이그레이션이 아니라, 실제 소스에서 확인한 상호작용 컨트롤러 구조 중 Danbi Timeline에 바로 필요한 부분만 이식했다.

기준 소스:

- `E:\ai_tool\opencut-classic-ref\apps\web\src\timeline\controllers\element-interaction-controller.ts`
- `E:\ai_tool\opencut-classic-ref\apps\web\src\timeline\controllers\resize-controller.ts`

OpenCut에서 확인한 동작 구조:

- clip body drag는 `pending -> dragging -> commit` 세션을 분리한다.
- body drag 시작 시 마우스가 클립 안의 어느 시간 지점을 잡았는지 `clickOffsetTime`으로 보존한다.
- edge resize는 mousemove마다 raw delta를 계산한 뒤 snap/limit/group resize를 먼저 해석하고 preview에 반영한다.
- commit은 preview에서 계산한 결과가 실제 변경일 때만 수행한다.

Danbi 적용 파일:

- `src/electron/renderer/timeline-interaction-adapter.ts`
- `src/electron/renderer/timeline-clip-button.tsx`
- `tests/lib/timeline-interaction-adapter.test.ts`

적용 내용:

- `TimelineClipBodyInteractionSession`에 `clickOffsetSeconds`를 추가했다.
- body drag move 결과에 `grabTime`을 추가해 사용자가 잡은 클립 내부 시간 지점이 드래그 중 유지되도록 했다.
- `TimelineClipButton`에서 pointer down 시 실제 클립 DOM bounds 기준으로 click offset을 계산해 adapter에 전달한다.
- pointer down 직후가 아니라 OpenCut처럼 포인터가 drag threshold를 넘은 뒤에만 active preview, guide, `aria-grabbed`가 켜지도록 했다.
- body drag와 edge trim threshold는 초 단위가 아니라 픽셀 이동 기준으로 판정한다.
- `TimelineClipEdgeInteractionSession`에 `clipStart`, `clipDuration`, `minDuration`, `rawDeltaSeconds`를 추가했다.
- edge trim move 결과를 `rawDeltaSeconds`, clamped `deltaSeconds`, `constrained`, `previewStart`, `previewDuration`으로 분리했다.
- head trim은 0초 이전으로 이동하지 못하고, 클립 길이가 `minDuration` 아래로 줄지 않도록 adapter 단계에서 제한한다.
- tail trim은 클립 길이가 `minDuration` 아래로 줄지 않도록 adapter 단계에서 제한한다.
- edge trim도 threshold를 넘기 전에는 active preview, guide, commit으로 이어지지 않는다.
- preview와 commit이 같은 clamped delta를 사용하므로, 마우스로 과도하게 끌 때 preview가 무효 시간으로 튀는 경로를 줄였다.

검증:

- `npx eslint src/electron/renderer/timeline-interaction-adapter.ts src/electron/renderer/timeline-clip-button.tsx tests/lib/timeline-interaction-adapter.test.ts`
- `npx vitest run tests/lib/timeline-interaction-adapter.test.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`

결과:

- ESLint 통과
- timeline interaction adapter unit test 11개 통과
- editor direct manipulation E2E 14개 통과

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics
