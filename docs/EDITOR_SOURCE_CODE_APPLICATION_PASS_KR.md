# Editor Source Code Application Pass

작성일: 2026-06-20

## 목적

이번 작업은 단순히 상용 편집기처럼 보이게 만드는 것이 아니라, 로컬에 실제 존재하는 편집기 소스에서 검증된 편집기 동작 구조를 Danbi Editor에 적용하는 첫 번째 패스다.

사용자가 지적한 핵심 문제는 다음과 같다.

- UI 모방이 충분하지 않다.
- OpenShot 분석 내용이 실제 구현에 적용되지 않았다.
- 버튼과 패널은 있지만 실제 편집 조작으로 이어지지 않는 부분이 있다.
- 눈가리기식 외형 변경이 아니라 편집기로서의 완성도를 올려야 한다.

## 로컬 소스 확인 결과

OpenShot 소스는 이번 작업 시점에 로컬에서 발견되지 않았다.

- `E:\ai_tool` 하위 2-depth 기준 OpenShot / openshot-qt 폴더 없음
- 따라서 OpenShot을 실제 적용했다고 주장하지 않는다.

실제 확인 가능한 로컬 편집기 소스는 다음과 같다.

- `E:\ai_tool\shotcut`
- `E:\ai_tool\opencut-classic-ref`
- `E:\ai_tool\opencut-ref`
- `E:\ai_tool\openreel-video-comfyui-ref`

이번 패스에서는 `E:\ai_tool\shotcut`의 실제 타임라인 설정/렌더링 구조를 기준으로 Danbi에 바로 적용 가능한 항목을 반영했다.

## Shotcut에서 확인한 구조

확인 파일:

- `E:\ai_tool\shotcut\src\settings.h`
- `E:\ai_tool\shotcut\src\qml\views\timeline\timeline.qml`

Shotcut에서 확인한 편집기 설정 항목:

- `timelineShowWaveforms`
- `timelineShowThumbnails`
- `timelineDragScrub`
- `timelineScrollZoom`
- `timelineRectangleSelect`
- `timelineSnap`
- `timelineRipple`
- `timelineRippleAllTracks`
- `timelineRippleMarkers`
- `timelineAdjustGain`

이번 Danbi 적용 대상:

- waveform 표시 토글
- thumbnail 표시 토글
- timeline track height 조절

선정 이유:

- 단순 버튼이 아니라 실제 clip DOM 렌더링, waveform 렌더링, thumbnail 렌더링, lane height에 직접 연결된다.
- 기존 Danbi 구조인 `TimelineTransportRulerPanel`, `TimelineTrackRow`, `TimelineClipList`, `TimelineClipButton`에 무리 없이 연결 가능하다.
- 편집기의 가독성과 조작 밀도를 개선하는 기본 기능이다.

## 구현 내용

### 1. Timeline Display State

파일: `src/app/editor/page.tsx`

추가 상태:

- `timelineShowWaveforms`
- `timelineShowThumbnails`
- `timelineTrackHeight`

이 상태는 timeline transport, track row, clip list까지 전달된다.

### 2. Clip Rendering 연결

파일: `src/electron/renderer/timeline-clip-list.tsx`

- `showThumbnails`가 false면 clip thumbnail source를 전달하지 않는다.
- `showWaveforms`가 false면 audio waveform을 렌더링하지 않는다.
- `trackHeight`를 clip button에 전달한다.

파일: `src/electron/renderer/timeline-clip-button.tsx`

- fixed `h-14` clip height를 제거했다.
- `trackHeight` 기반으로 clip inset과 clip height를 계산한다.
- track height 변경이 실제 clip bounding box 높이에 반영된다.

파일: `src/electron/renderer/timeline-track-row.tsx`

- fixed `h-20` lane height를 제거했다.
- lane과 track header가 `trackHeight`를 따른다.

### 3. Timeline Control UI

파일: `src/electron/renderer/timeline-transport-ruler.tsx`

추가 컨트롤:

- `Thumbs`: 실제 timeline thumbnail 렌더링 on/off
- `Wave`: 실제 waveform 렌더링 on/off
- `Height`: 실제 track lane/clip height 조절

## 검증 결과

실행한 관련 검사:

- `npx eslint src/app/editor/page.tsx src/electron/renderer/timeline-transport-ruler.tsx src/electron/renderer/timeline-track-row.tsx src/electron/renderer/timeline-clip-list.tsx src/electron/renderer/timeline-clip-button.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx eslint tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`

통과 결과:

- ESLint 통과
- Editor direct manipulation E2E 14개 통과

E2E에서 확인한 내용:

- waveform toggle off 시 `timeline-waveform-clip-music-1` DOM이 사라진다.
- waveform toggle on 시 waveform DOM이 다시 표시된다.
- track height slider를 실제 마우스 드래그로 조작하면 clip bounding box height가 증가한다.

## 건드리지 않은 영역

이번 작업은 편집기 timeline display/interaction 품질 개선 범위만 다뤘다.

다음 시스템은 제거, 우회, 비활성화, 다운그레이드, mock 처리하지 않았다.

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics

## 다음 적용 후보

소스 기반으로 다음에 적용할 수 있는 편집기 기본기 항목:

1. Timeline wheel zoom anchoring
2. Timeline scroll mode: no scroll / page / smooth / center playhead
3. Rectangle selection mode와 modifier key 동작 정리
4. Ripple all tracks / ripple markers 상태의 명시적 UI 연결
5. Clip hover, body drag, edge trim hit target 분리 강화
6. Monitor transform handles의 commit/undo 경로 정리

## 2026-06-20 추가 적용 결과

OpenCut classic의 `element-interaction-controller.ts`와 `resize-controller.ts`에서 확인한 구조 중 다음 부분을 Danbi Editor에 적용했다.

적용 기준:

- body drag는 pointer down 시 클립 내부 클릭 위치를 시간 오프셋으로 보존한다.
- drag move는 preview state를 먼저 계산하고 commit은 그 결과를 사용한다.
- edge trim은 raw delta를 그대로 UI/commit에 넘기지 않고, 최소 길이와 timeline 0초 경계를 controller layer에서 먼저 제한한다.

적용 파일:

- `src/electron/renderer/timeline-interaction-adapter.ts`
- `src/electron/renderer/timeline-clip-button.tsx`
- `tests/lib/timeline-interaction-adapter.test.ts`

구현 내용:

- `clickOffsetSeconds`와 `grabTime`을 추가해 사용자가 클립을 잡은 내부 시간 지점이 drag session에 유지되도록 했다.
- pointer down 직후가 아니라 포인터가 drag threshold를 넘은 뒤에만 active preview, guide, `aria-grabbed`가 켜지도록 했다.
- body drag와 edge trim threshold는 초 단위가 아니라 OpenCut과 같은 픽셀 이동 기준으로 판정한다.
- edge trim session에 `clipStart`, `clipDuration`, `minDuration`, `rawDeltaSeconds`를 추가했다.
- edge trim move 결과를 raw delta와 clamped delta로 분리했다.
- head trim은 0초 이전으로 이동하지 않으며, head/tail trim 모두 최소 길이 아래로 줄지 않는다.
- edge trim도 threshold를 넘기 전에는 active preview, guide, commit으로 이어지지 않는다.
- `TimelineClipButton`은 실제 DOM bounds 기준 click offset과 clip duration을 adapter에 전달한다.

검증:

- `npx eslint src/electron/renderer/timeline-interaction-adapter.ts src/electron/renderer/timeline-clip-button.tsx tests/lib/timeline-interaction-adapter.test.ts`
- `npx vitest run tests/lib/timeline-interaction-adapter.test.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`

결과:

- ESLint 통과
- timeline interaction adapter unit test 11개 통과
- editor direct manipulation E2E 14개 통과

범위 제한:

- ComfyUI, Automation hooks, Render Worker, Render Worker Daemon, Fleet Discovery, Headless Render, Plugin/Extension system, export validation semantics는 변경하지 않았다.
