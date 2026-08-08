# Editor Practical Quality Pass

작성일: 2026-06-20

## 목적

사용자가 지적한 1~5번 항목을 편집기 실사용 품질 기준으로 정리했다.

범위는 새 기능 확장이 아니라 기존 편집 기능을 더 잘 보이고, 더 잘 조작되고, 더 잘 검증되게 만드는 것이다.

## 1. 오디오 재생 / 모니터링

적용 상태: 완료

변경 내용:

- Program Monitor의 visual video element는 계속 muted 상태를 유지한다. 중복 출력 방지를 위해 실제 program audio 출력은 `ProgramAudioMixer`의 audio layer가 담당한다.
- Program audio layer에 실제 재생 판단 상태를 DOM 속성으로 노출했다.
- Source Monitor의 audio source element도 테스트 가능한 상태로 노출했다.
- media import 후 source monitor에서 imported `.wav`가 audio element로 준비되는지 검증했다.
- Program Monitor play 버튼을 누른 뒤 audio layer가 `canPlay`, `gain`, `playbackRate` 상태를 갖는지 검증했다.

주요 파일:

- `src/electron/renderer/program-audio-graph-controller.tsx`
- `src/electron/renderer/source-monitor.tsx`
- `tests/e2e/editor-media-import-grid.spec.ts`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`

## 2. Media Bin 상용 편집기형 정리

적용 상태: 완료

변경 내용:

- Media Bin panel을 독립된 어두운 영역으로 정리했다.
- grid card 최소 폭을 키워 thumbnail 중심으로 보이게 했다.
- 기존 hover-only action을 card 하단 상시 action으로 바꿨다.
- 기존 의미는 유지했다.
  - `Insert {name}`: timeline insert
  - `Open {name} in Source Monitor`: source monitor selection
  - `Overwrite {name}`: timeline overwrite
- selected asset 상태를 `data-selected`로 노출했다.

주요 파일:

- `src/electron/renderer/media-bin-panel.tsx`

## 3. Timeline 편집 품질

적용 상태: 완료

변경 내용:

- Timeline drop preview가 더 이상 고정 `h-14` 높이에 묶이지 않는다.
- 실제 track height와 clip inset 계산을 사용해 drag/drop preview가 실제 clip bounding box와 맞게 보인다.
- 기존 insert/overwrite/drop/collision/snap 계산은 변경하지 않았다.

주요 파일:

- `src/electron/renderer/timeline-track-row.tsx`

## 4. Program Monitor 편집감

적용 상태: 완료

변경 내용:

- 이전 단계에서 적용한 Program Monitor canvas viewport, zoom, pan, fit, aspect, fullscreen control을 유지했다.
- 이번 단계에서는 audio monitoring 상태를 Program Monitor control E2E에 연결했다.
- transform/crop handle, preview worker, diagnostics overlay, playback control 의미는 변경하지 않았다.

주요 파일:

- `src/electron/renderer/program-audio-graph-controller.tsx`
- `src/electron/renderer/program-composite-preview.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`

## 5. Inspector / Toolbar 난잡함 정리

적용 상태: 완료

변경 내용:

- top toolbar의 selection/history/save/status badge가 action button 영역을 밀어내지 않도록 최대 폭과 truncate를 적용했다.
- history badge는 넓은 화면에서만 보이게 했다.
- status는 title tooltip으로 full text를 유지한다.
- editing command semantics는 변경하지 않았다.

주요 파일:

- `src/electron/renderer/editor-top-toolbar.tsx`

## 실행한 검증

관련 범위만 실행했다. 전체 테스트 반복은 실행하지 않았다.

- `npx eslint src/electron/renderer/program-audio-graph-controller.tsx src/electron/renderer/source-monitor.tsx src/electron/renderer/timeline-track-row.tsx src/electron/renderer/media-bin-panel.tsx src/electron/renderer/editor-top-toolbar.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`
- `npx eslint tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`

결과:

- editor direct manipulation E2E: 16 passed
- media import/source/timeline E2E: 2 passed
- 관련 ESLint: 통과

## 건드리지 않은 영역

다음 시스템은 제거, 우회, 비활성화, 다운그레이드, mock, optional 처리하지 않았다.

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

## 추가 Pass: Editor Interaction Polish 1-5
적용일: 2026-06-20

### 목적

편집기 기본골격 이후 남아 있던 사용감 문제를 1-5번 항목으로 좁혀서 처리했다. 새 편집 기능을 늘리는 것이 아니라, 이미 연결된 편집 조작을 사용자가 직접 보고 조작할 수 있도록 피드백, 상태 노출, 패널 밀도를 정리했다.

### 적용 내용

1. Timeline neighbor impact 표시
   - roll trim과 slide edit 중 anchor clip뿐 아니라 영향받는 이웃 clip preview overlay를 표시한다.
   - overlay에는 operation, edge, delta, affected count, per-clip start/duration/sourceIn delta를 DOM 상태로 노출한다.

2. Timeline snap/collision 체감
   - clip body drag 중 collision/constraint 상태를 `Blocked` chip으로 표시한다.
   - drop preview에는 snap line과 blocked zone을 노출한다.

3. Program Monitor 조작감
   - 선택 visual transform overlay에 X/Y/Scale/Rotation readout을 추가했다.
   - move/scale/rotate 중 active crosshair와 HUD가 함께 표시된다.
   - transform commit, keyframe, effect semantics는 변경하지 않았다.

4. Media Bin 사용성
   - media bin에 visible/used/unused/issues quick status를 추가했다.
   - media asset card에 usage state, reference count, cache state, timeline state를 노출했다.
   - import, source monitor insert, timeline drop 흐름은 기존 구조를 유지했다.

5. Toolbar/Inspector 밀도 정리
   - top toolbar command rail에 selection/clipboard/range/render state를 노출했다.
   - toolbar group label과 menu command count를 표시했다.
   - Inspector command panel을 Primary, Clipboard, Range, Transitions cluster로 나눴다.

### 검증

변경 영향 범위만 실행했다.

- `npx eslint src\app\editor\page.tsx src\electron\renderer\editor-view-model.ts src\electron\renderer\timeline-track-row.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct roll trim|supports direct slide edit"`
- `npx eslint src\electron\renderer\timeline-clip-button.tsx src\electron\renderer\timeline-track-row.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "shows blocked collision feedback"`
- `npx eslint src\electron\renderer\program-transform-crop-overlays.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct program monitor transform manipulation"`
- `npx eslint src\electron\renderer\media-bin-panel.tsx tests\e2e\editor-media-import-grid.spec.ts`
- `npx playwright test editor-media-import-grid.spec.ts --project=chromium --grep "imports media through the visible media panel import button into the grid|imports media then routes it through source monitor insert onto the timeline"`
- `npx eslint src\electron\renderer\editor-top-toolbar.tsx src\electron\renderer\inspector-command-panels.tsx tests\e2e\editor-control-surface-audit.spec.ts tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-control-surface-audit.spec.ts --project=chromium --grep "exposes connected top toolbar menus"`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "exposes selected clip transform controls in the default inspector"`

결과:

- 위 ESLint 검증 통과
- roll/slide neighbor impact 관련 E2E: 2 passed
- blocked collision feedback E2E: 1 passed
- Program Monitor transform E2E: 1 passed
- Media Bin import/source insert E2E: 2 passed
- Toolbar audit E2E: 1 passed
- Inspector command cluster E2E: 1 passed

### 건드리지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

### 남은 품질 항목

- 실제 장시간 편집 세션에서 clip drag/trim 성능 체감 검증
- monitor transform handles의 더 정교한 cursor/handle affordance
- Media Bin 대량 파일 import 시 virtualization 또는 pagination 필요 여부 검토
- Inspector 세부 패널의 기능별 접기/고정 UX 정리

## 추가 Pass: Editor Real Workflow Stabilization 1-5
적용일: 2026-06-20

### 목적

사용자가 실제 파일을 가져와 Media Bin에서 확인하고, 타임라인에 올린 뒤, 소리와 preview를 보면서 기본 편집을 수행하는 흐름을 우선 안정화했다. 새 기능을 늘리지 않고 기존 편집기 기본 흐름의 노출, 동기화, 레이아웃 밀도를 보강했다.

### 적용 내용

1. 실제 import -> Media Bin -> Timeline drop
   - import 직후 검색/필터 때문에 새 asset이 숨지 않도록 Media Bin 필터를 `all`로 복귀한다.
   - 새로 import된 asset을 Source로 자동 선택하고 Source Monitor를 열어 바로 insert/drop할 수 있게 했다.

2. Timeline playback / scrub / audio 동기화
   - Program Monitor playhead 조작 시 active monitor를 `program`으로 복귀시킨다.
   - Program Monitor frame/control에 playhead, playback state/rate, audio/video layer count를 노출했다.

3. Clip 기본 편집 체감
   - 선택 clip에 start/duration readout을 표시한다.
   - clip drag commit 후 undo/redo가 같은 clip start 상태를 되돌리고 다시 적용하는지 E2E로 확인했다.

4. Program Monitor 편집 UI 정리
   - Zoom readout과 Fit 버튼을 분리했다.
   - 기본 overlay mode를 `clean`으로 노출하고 diagnostics overlay가 기본 화면을 덮지 않는 상태를 확인한다.

5. 상용 편집기식 레이아웃 밀도 조정
   - workspace layout을 `commercial-compact`로 표기하고 asset/inspector column 폭을 줄였다.
   - timeline row height와 asset/inspector/timeline panel density를 DOM 상태로 노출했다.

### 검증

변경 영향 범위만 실행했다.

- `npx eslint src\app\editor\page.tsx tests\e2e\editor-media-import-grid.spec.ts`
- `npx playwright test editor-media-import-grid.spec.ts --project=chromium --grep "imports media through the visible media panel import button into the grid|imports media then routes it through source monitor insert onto the timeline"`
- `npx eslint src\app\editor\page.tsx src\electron\renderer\program-composite-preview.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "links program monitor player controls to the timeline state"`
- `npx eslint src\electron\renderer\timeline-clip-button.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct timeline clip edge trim feedback|supports direct timeline clip body drag move feedback"`
- `npx eslint src\electron\renderer\program-composite-preview.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx eslint src\app\editor\page.tsx tests\e2e\editor-control-surface-audit.spec.ts`
- `npx playwright test editor-control-surface-audit.spec.ts --project=chromium --grep "exposes connected top toolbar menus"`

결과:

- 관련 ESLint 통과
- Media Bin import/source insert E2E: 2 passed
- Program Monitor playback/sync E2E: 1 passed
- Clip edge/body edit E2E: 2 passed
- Toolbar/layout audit E2E: 1 passed

### 건드리지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

### 남은 품질 항목

- 대량 media bin 성능과 thumbnail virtualization 검증
- 긴 timeline에서 drag/drop auto-scroll 체감 검증
- 실제 장시간 playback에서 browser audio drift 확인
- Inspector 세부 패널별 접기/고정 UX 추가 정리

## 추가 Pass: Timeline Multi-select Group Move Feedback
적용일: 2026-06-20

### 목적

multi-select group move는 commit 후 여러 clip이 같이 이동했지만, 드래그 중에는 사용자가 실제로 어떤 clip 묶음이 함께 이동 중인지 읽기 어려웠다. 이번 pass는 기존 group move 계산과 commit semantics는 유지하고, 조작 중 group ghost overlay와 HUD metadata만 보강했다.

### 적용 내용

- `TimelineClipEditPreview`에 `groupCount` metadata를 추가했다.
- group move 중 dragged clip HUD에 `2 clips` 형태의 group count를 표시한다.
- timeline lane에 selected group의 shifted ghost overlay를 표시한다.
- group overlay DOM에 operation, group count, delta, start/end를 노출한다.
- 각 ghost clip DOM에 clip id, preview start, duration을 노출한다.

### 변경 파일

- `src/app/editor/page.tsx`
- `src/electron/renderer/editor-view-model.ts`
- `src/electron/renderer/timeline-edit-preview-helpers.ts`
- `src/electron/renderer/timeline-clip-button.tsx`
- `src/electron/renderer/timeline-track-row.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src\app\editor\page.tsx src\electron\renderer\editor-view-model.ts src\electron\renderer\timeline-edit-preview-helpers.ts src\electron\renderer\timeline-clip-button.tsx src\electron\renderer\timeline-track-row.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test ./tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct multi-select group clip drag move"`

결과:

- ESLint 통과
- multi-select group move feedback E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Program Monitor Operation Feedback
적용일: 2026-06-20

### 목적

Program Monitor에서 transform/crop handle은 동작하지만, 조작 중 현재 move/scale/rotate/crop 값이 화면 안에서 바로 읽히지 않아 직접 조작감이 약했다. 이번 pass는 기존 motion/crop draft, commit, cancel semantics를 유지하고 조작 중 HUD와 draft state 노출만 보강했다.

### 적용 내용

- transform move/scale/rotate 중 `program-transform-operation-hud-*`를 표시한다.
- transform overlay에 draft position, scale, rotation data attribute를 노출한다.
- crop handle 조작 중 `program-crop-operation-hud-*`를 표시한다.
- crop overlay/box에 draft left/right/top/bottom data attribute를 노출한다.
- E2E에서 scale, move, rotate, crop 조작 중 HUD가 실제로 보이는지 검증한다.

### 변경 파일

- `src/electron/renderer/program-transform-crop-overlays.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src\electron\renderer\program-transform-crop-overlays.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test ./tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct program monitor transform manipulation|supports direct program monitor crop corner manipulation"`

결과:

- ESLint 통과
- Program Monitor transform/crop feedback E2E: 2 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Media Bin to Timeline Drag Feedback
적용일: 2026-06-20

### 목적

Media Bin에서 asset을 잡아 timeline lane으로 끌 때, 실제 drop 동작은 있었지만 사용자가 현재 어떤 asset을 들고 있는지, timeline에 insert/overwrite 중 어떤 방식으로 들어갈지, ripple 영향이 있는지 즉시 확인하기 어려웠다. 이번 pass는 import -> timeline drop 편집 경험의 피드백 보강이며, import/insert/overwrite/drop 계산 semantics는 변경하지 않았다.

### 적용 내용

- Media Bin panel에 현재 드래그 중인 asset id/name 상태를 노출했다.
- 드래그 중인 Media Bin card와 drag handle에 active state를 표시했다.
- asset drop preview DOM에 `data-drop-mode`를 노출해 insert/overwrite 상태를 구분 가능하게 했다.
- asset drop guide에 operation, duration, constrained, ripple metadata를 추가했다.
- timeline drop preview와 guide가 같은 asset drop 작업을 가리키도록 E2E에서 고정했다.

### 변경 파일

- `src/app/editor/page.tsx`
- `src/electron/renderer/media-bin-panel.tsx`
- `src/electron/renderer/media-drop-helpers.ts`
- `src/electron/renderer/timeline-track-row.tsx`
- `tests/e2e/editor-media-import-grid.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행한다.

- `npx eslint src\app\editor\page.tsx src\electron\renderer\media-bin-panel.tsx src\electron\renderer\media-drop-helpers.ts src\electron\renderer\timeline-track-row.tsx tests\e2e\editor-media-import-grid.spec.ts`
- `npx playwright test ./tests/e2e/editor-media-import-grid.spec.ts --project=chromium --grep "imports media then drags the media card directly onto an audio timeline lane"`

결과:

- ESLint 통과
- media import -> audio lane drag feedback E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Editor-only Regression Sweep

적용일: 2026-06-20

### 목적

기본골격 pass에서 직접 수정한 editor 범위가 서로 깨지지 않는지 확인했다. 전체 테스트 반복이 아니라 toolbar/control surface, media import/drop, Program Monitor/timeline direct manipulation에 한정한 editor-only sweep이다. 이 판정은 코드 보강 결과를 로컬 기준으로 분류한 것이며, 문서 수정만으로 완성품 완료나 release approval을 만든 것이 아니다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/app/editor/page.tsx src/electron/renderer/editor-top-toolbar.tsx src/electron/renderer/editor-view-model.ts src/electron/renderer/media-bin-panel.tsx src/electron/renderer/media-drop-helpers.ts src/electron/renderer/program-transform-crop-overlays.tsx src/electron/renderer/timeline-clip-button.tsx src/electron/renderer/timeline-edit-preview-helpers.ts src/electron/renderer/timeline-track-row.tsx tests/e2e/editor-control-surface-audit.spec.ts tests/e2e/editor-media-import-grid.spec.ts tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`

결과:

- ESLint 통과
- editor control surface E2E: 3 passed
- media import/grid/drop E2E: 6 passed
- Program Monitor/timeline direct manipulation E2E: 16 passed

### 판정

- 기본골격 범위: `LOCAL_BASE_SKELETON_PASS`
- 상용 편집기 체감 품질: `IN_PROGRESS`
- Fresh Windows QA evidence / returned evidence ZIP / external manual result JSON / final release approval: `EXTERNAL_PENDING`
- 실제 스피커/장치 오디오 체감: `PENDING_HUMAN_CHECK`
- 상용 편집기 수준 UX 만족도: `PENDING_HUMAN_DECISION`

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Timeline Context Menu Command State

적용일: 2026-06-20

### 목적

기본골격 코드 보강 범위로 timeline context menu의 명령 상태를 실제 editor state와 맞췄다. 상단 toolbar에는 selection, clipboard, mark range 기준 disabled 처리가 들어가 있었지만, context menu는 일부 명령을 항상 누를 수 있게 보여 사용자가 실행 후 실패 status를 봐야 하는 문제가 남아 있었다.

### 적용 내용

- timeline context menu에 `clipboardClipCount`, `hasAttributeClipboard`, `hasInMark`, `hasOutMark`, `hasMarkedRange`, `selectedCaptionCount`, `canSplitAtPlayhead` 상태를 전달했다.
- `Copy`, `Cut`, `Duplicate`, `Group`, `Ungroup`, `Move selection`, `Trim`, `Delete`, transition 명령은 selection 조건을 반영한다.
- `Paste`, `Paste attributes`, `Paste at In`, `Append`는 clipboard/attribute clipboard/In mark 조건을 반영한다.
- `Go to In/Out`, `Clear In/Out`, `Select/Copy/Cut/Lift/Extract marked range`는 mark 상태를 반영한다.
- caption context actions는 selected caption 수를 반영한다.
- context menu DOM에 selection, clipboard, mark state를 `data-*`로 노출해 E2E 감사가 가능하게 했다.

### 변경 파일

- `src/electron/renderer/timeline-context-menu.tsx`
- `src/app/editor/page.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/timeline-context-menu.tsx src/app/editor/page.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "supports direct timeline box selection and context actions"`

결과:

- ESLint 통과
- context menu direct manipulation E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Inspector Command Panel State

적용일: 2026-06-20

### 목적

기본골격 코드 보강의 다음 단계로 Inspector command panel의 명령 상태를 실제 editor state와 맞췄다. 선택 clip이 있는 상태에서도 `Paste`, `Paste attr`, `Lift range`, `Extract range`, `Group`, `Pack`처럼 추가 전제조건이 필요한 명령은 조건이 없으면 눌리지 않아야 한다.

### 적용 내용

- Inspector command panel에 `clipboardClipCount`, `hasAttributeClipboard`, `hasMarkedRange`, `canSplitAtPlayhead` 상태를 전달했다.
- selection이 필요한 `Trim`, `Delete`, `Copy`, `Duplicate`, transition, precision trim 명령은 selection 조건을 반영한다.
- multi-select가 필요한 `Group`, `Pack`, `Arrange apply`는 2개 이상 선택 조건을 반영한다.
- clipboard가 필요한 `Paste`, `Append`, attribute clipboard가 필요한 `Paste attr`는 각각 clipboard 상태를 반영한다.
- marked range가 필요한 `Lift range`, `Extract range`는 In/Out range 상태를 반영한다.
- Inspector command buttons에 안정적인 `data-testid`를 추가해 E2E 감사가 가능하게 했다.

### 변경 파일

- `src/electron/renderer/inspector-command-panels.tsx`
- `src/app/editor/page.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/inspector-command-panels.tsx src/app/editor/page.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`

결과:

- ESLint 통과
- Inspector command state E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Media Bin Hover Scrub Feedback

적용일: 2026-06-20

### 목적

Media Bin grid/list 품질 보강의 다음 단계로 asset thumbnail 위 마우스 위치가 시간 스크럽 상태로 보이게 했다. 실제 디코딩/preview worker 구조를 변경하지 않고, 기존 thumbnail/fallback 위에 hover 위치, timecode, scrub line만 추가해 사용자가 자산 길이와 탐색 위치를 더 쉽게 파악하게 하는 범위다.

### 적용 내용

- media asset card에 `data-scrub-active`, `data-scrub-ratio`, `data-scrub-time`을 노출했다.
- thumbnail hover/move 시 scrub line과 timecode badge를 표시한다.
- hover가 끝나면 scrub 상태를 해제한다.
- video/image/audio 모두 기존 thumbnail 또는 fallback 위에서 동일한 hover feedback을 사용한다.
- import, source selection, timeline insert/overwrite/drop 의미는 변경하지 않았다.

### 변경 파일

- `src/electron/renderer/media-bin-panel.tsx`
- `tests/e2e/editor-media-import-grid.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/media-bin-panel.tsx tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium -g "imports media through the visible media panel import button into the grid"`

결과:

- ESLint 통과
- Media Bin import/grid hover scrub E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Timeline Drop Impact Ghost Preview

적용일: 2026-06-20

### 목적

Timeline 드래그/drop 중 이미 계산되는 `ripple`, `snap`, `collision`, `limit` 상태를 사용자가 바로 볼 수 있게 했다. 편집 의미나 commit 로직은 변경하지 않고, 드래그 중 preview 레이어에 영향 범위 ghost overlay와 상태 속성만 추가했다.

### 적용 내용

- drop preview에 `data-drop-ghost`, `data-drop-ghost-reason`을 노출했다.
- ripple insert/overwrite 상태에서는 삽입 지점 뒤쪽에 `Ripple range` ghost overlay를 표시한다.
- collision, limit, snap 상태도 같은 preview 레이어에서 reason별 ghost로 구분 가능하게 했다.
- 기존 start/end rail, operation, snap, collision, ripple badge 의미는 유지했다.
- timeline edit commit, trim/move 계산, render/export 의미는 변경하지 않았다.

### 변경 파일

- `src/electron/renderer/timeline-track-row.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/timeline-track-row.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "supports direct media bin drag drop onto timeline"`

결과:

- ESLint 통과
- Media Bin to Timeline drag/drop preview E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Toolbar Command State Audit

적용일: 2026-06-20

### 목적

Toolbar/menu에 표시된 명령 중 현재 상태에서 실행 전제조건이 없는 명령을 disabled로 노출했다. 사용자가 눌러본 뒤에야 실패 status를 보는 상황을 줄이는 작업이다.

### 적용 내용

- `EditorTopToolbar`에 `canSplitAtPlayhead`, `canTrimSelectionToPlayhead`, `hasInMark`, `hasOutMark`, `hasMarkedRange` props를 추가했다.
- page에서 `activeTimelineClip`, `selectedClip`, `markIn`, `markOut`, `markedRange`를 기반으로 toolbar command state를 넘긴다.
- 선택 clip이 필요한 `Delete`, `Trim`, `Ripple Del`, `Copy`, `Duplicate`, `Copy Attr`, `Move Here`, `Mark Sel` 계열을 조건부 disabled 처리했다.
- clipboard가 필요한 `Paste`, `Paste Attr`, `Paste In`, `Append` 계열을 조건부 disabled 처리했다.
- mark range가 필요한 `Go In`, `Go Out`, `Clear I/O`, `Select Range`, `Copy Range`, `Cut Range`, `Lift`, `Extract`를 조건부 disabled 처리했다.
- `Cut`은 선택 clip뿐 아니라 playhead 아래 active clip이 있으면 기존 동작을 유지하도록 했다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/editor-top-toolbar.tsx src/app/editor/page.tsx tests/e2e/editor-control-surface-audit.spec.ts`
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium`

결과:

- ESLint 통과
- editor control surface E2E: 3 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Program Monitor Handle Hit Area

적용일: 2026-06-20

### 목적

Program Monitor transform/crop handle의 hit target과 조작 상태 노출을 보강했다. 사용자가 화면 위에서 직접 scale, move, rotate, crop 조작을 할 때 어떤 handle이 잡혔는지 더 명확히 보이게 하는 패스다.

### 적용 내용

- transform overlay에 `data-transform-active-operation`, `data-transform-handle-size`, `data-transform-rotate-handle-size`를 추가했다.
- scale handle을 `28px`, rotate handle을 `30px` hit area로 키웠다.
- move/scale/rotate 중 active ring이 다르게 보이도록 했다.
- transform handle에 안정적인 `data-testid`와 `data-transform-handle`을 추가했다.
- crop overlay에 `data-crop-active-handle`, `data-crop-handle-size`를 추가했다.
- crop edge/corner handle hit area를 키우고 각 handle에 `data-testid`, `data-crop-handle`, `data-handle-size`를 추가했다.
- 기존 motion/crop draft, commit, cancel 계산은 변경하지 않았다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/program-transform-crop-overlays.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "supports direct program monitor transform manipulation|supports direct program monitor crop corner manipulation"`

결과:

- ESLint 통과
- Program Monitor transform/crop E2E: 2 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Program Monitor Layer Selection Clarity

적용일: 2026-06-20

### 목적

Program Monitor에 여러 visual layer가 겹쳐 있을 때 어떤 레이어가 선택 대상인지, 선택한 레이어가 직접 transform 편집 가능한지 확인하기 쉽게 했다. 이번 범위는 selection target의 상태 노출과 작은 label 보강이며, motion/crop 계산이나 keyframed motion 제한은 변경하지 않았다.

### 적용 내용

- Program Monitor selection target wrapper에 `data-layer-count`, `data-selected-clip-id`를 노출했다.
- 각 layer target에 clip id/name, asset kind, track id/name, stack index, selected 상태를 노출했다.
- layer target에 locked/keyframed motion/editable 상태를 노출했다.
- selected layer와 hover/focus layer에 작은 layer label을 표시한다.
- transform overlay에 selected clip/track/kind 상태와 selection label을 추가했다.
- keyframed motion clip은 기존처럼 transform overlay를 띄우지 않고, target 상태에서 `data-layer-motion-keyframed="true"` / `data-layer-motion-editable="false"`로 확인하게 했다.

### 변경 파일

- `src/electron/renderer/program-transform-crop-overlays.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/program-transform-crop-overlays.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes stacked program monitor layer selection targets"`

결과:

- ESLint 통과
- Program Monitor stacked layer selection E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Inspector Motion Command State

적용일: 2026-06-20

### 목적

Inspector transform panel에서 현재 선택 clip이 motion 편집 가능한지, motion preset과 reset류 명령을 실행할 수 있는지 명확히 드러나게 했다. 기존 motion transform/preset/keyframe 의미는 변경하지 않고 상태 속성과 테스트 가능한 버튼 id만 보강했다.

### 적용 내용

- transform panel에 `data-can-use-motion`, `data-can-apply-motion-preset`, `data-motion-effect-state`를 노출했다.
- transform panel에 현재 scale/position/rotation 상태를 DOM 속성으로 노출했다.
- `Center`, `100%`, `Reset` 버튼에 안정적인 `data-testid`를 추가했다.
- motion preset panel과 preset button에 `data-testid`, `data-motion-preset-id`, 적용 가능 상태를 추가했다.
- non-motion 선택 상태에서는 transform command가 disabled이고, motion 가능한 clip 선택 후 enabled로 바뀌는지 E2E로 확인했다.

### 변경 파일

- `src/electron/renderer/inspector-motion-panels.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/inspector-motion-panels.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`

결과:

- ESLint 통과
- Inspector motion command state E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Inspector Transition Panel State

적용일: 2026-06-20

### 목적

Inspector transition panel에서 현재 clip의 transition 상태, transition type, remove 가능 여부, direction 편집 가능 여부를 명확히 드러나게 했다. 기존 transition 적용/수정 로직과 ComfyUI AI morph 의미는 변경하지 않고, 상태 속성과 테스트 가능한 button/select id만 보강했다.

### 적용 내용

- transition panel에 `data-transition-state`, `data-transition-type`, `data-can-remove-transition`, `data-can-edit-direction`, `data-transition-duration`을 노출했다.
- transition type 버튼에 `data-testid`, `data-transition-type`, `aria-pressed`를 추가했다.
- direction select와 remove button에 안정적인 `data-testid`를 추가했다.
- transition이 없는 clip은 `cut` 상태로, sample transition이 있는 clip은 `crossfade` active 상태로 읽히는지 E2E로 확인했다.
- `AI morph` 버튼은 기존 transition type 선택 경로로 유지했고, ComfyUI workflow/export validation 의미는 변경하지 않았다.

### 변경 파일

- `src/electron/renderer/inspector-motion-panels.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/inspector-motion-panels.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`

결과:

- ESLint 통과
- Inspector transition panel state E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Inspector Effects Panel State

적용일: 2026-06-20

### 목적

Inspector effects panel에서 현재 선택 clip이 어떤 quick effect, preset, tracking/object command를 실행할 수 있는지 명확히 드러나게 했다. 기존 effect 적용 로직, AI enhancement, tracking, ComfyUI workflow 의미는 변경하지 않고 상태 속성과 테스트 가능한 id만 보강했다.

### 적용 내용

- effects panel에 clip id/kind, effect count, 각 command/preset 적용 가능 상태를 `data-*` 속성으로 노출했다.
- Tracking/Adjust/Effects dock별로 `testIdPrefix`를 전달해 반복 렌더링되는 effects panel의 test id 충돌을 줄였다.
- quick effect 버튼에 `data-testid`, `data-effect-action`을 추가했다.
- crop/color/visual/AI/stabilize/audio cleanup preset 버튼에 `data-testid`, `data-effect-preset-id`를 추가했다.
- effect stack item에 effect id/type/enabled/index 상태와 toggle/up/down/remove test id를 추가했다.
- Tracking/Adjust 탭에서 reframe/track/object, color/AI/visual/stabilize command가 현재 선택 clip 상태에 맞게 enabled로 노출되는지 E2E로 확인했다.

### 변경 파일

- `src/electron/renderer/inspector-effects-panel.tsx`
- `src/app/editor/page.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/inspector-effects-panel.tsx src/app/editor/page.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`

결과:

- ESLint 통과
- Inspector effects panel state E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Inspector Audio Panel State

적용일: 2026-06-20

### 목적

Inspector audio panel에서 현재 선택 clip이 audio fade, waveform sync, peak normalize, silence removal, beat edit command를 실행할 수 있는지 명확히 드러나게 했다. 실제 audio 처리, waveform 분석, normalize/silence/beat 실행 로직은 변경하지 않고 상태 속성과 테스트 가능한 id만 보강했다.

### 적용 내용

- audio panel에 audio fade 가능 여부, 대상 clip count, waveform sync pair 상태, waveform sync 가능 상태를 `data-*` 속성으로 노출했다.
- audio fade 버튼과 waveform sync 버튼에 안정적인 `data-testid`를 추가했다.
- peak normalize panel에 normalize 가능 여부, ready count, target peak, plan 상태를 노출했다.
- silence panel에 waveform 준비 상태, silence settings, plan 상태, analyze/remove button id를 추가했다.
- beat edit panel에 waveform 준비 상태, beat settings, plan 상태, analyze/markers/cut button id를 추가했다.
- Audio 탭에서 fade/sync/analysis command 상태가 현재 선택 clip 조건에 맞게 enabled/disabled로 노출되는지 E2E로 확인했다.

### 변경 파일

- `src/electron/renderer/inspector-media-panels.tsx`
- `src/electron/renderer/inspector-analysis-panels.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/inspector-media-panels.tsx src/electron/renderer/inspector-analysis-panels.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`

결과:

- ESLint 통과
- Inspector audio panel state E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Timeline Preview State

적용일: 2026-06-20

### 목적

Timeline 직접 조작 중 현재 preview가 어떤 의미인지 더 명확히 보이게 했다. 사용자가 clip move, edge trim, cross-track drop, media asset drop 중 `Move`, `Trim`, `Snap`, `Limit`, `Collision`, `Ripple` 상태를 구분할 수 있도록 표시와 DOM 상태를 보강했다.

### 적용 내용

- `TimelineClipEditPreview`에 표시용 `operation`, `ripple`, `delta` 상태를 추가했다.
- `TimelineClipDropPreview`와 `TimelineAssetDropPreview`에 표시용 `operation`, `snapped`, `constrained`, `collision`, `ripple` 상태를 추가했다.
- timeline clip에 `data-preview-state`, `data-preview-operation`, `data-preview-snapped`, `data-preview-constrained`, `data-preview-ripple`을 추가했다.
- clip drag/trim 중 작은 preview badge를 표시한다.
- track drop preview에 `data-drop-operation`, `data-drop-impact`, `data-drop-collision`, `data-drop-snapped`, `data-drop-constrained`, `data-drop-ripple`을 추가했다.
- asset drop preview는 insert mode에서 ripple badge를 표시한다.
- 기존 `data-drop-valid`, `data-drop-state`, start/end marker, commit handler는 유지했다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/editor-view-model.ts src/electron/renderer/timeline-edit-preview-helpers.ts src/electron/renderer/media-drop-helpers.ts src/electron/renderer/timeline-track-row.tsx src/electron/renderer/timeline-clip-button.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "supports direct timeline clip edge trim feedback|supports direct timeline clip body drag move feedback|supports direct clip drag move to another compatible video track|supports direct media bin drag drop onto timeline"`

결과:

- ESLint 통과
- timeline direct manipulation E2E: 4 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Media Bin Grid/List Polish

적용일: 2026-06-20

### 목적

Media Bin에 import된 파일이 편집기 자산처럼 보이도록 카드 정보 계층을 보강했다. 새 편집 기능을 추가하지 않고 기존 import, source 선택, timeline drag/drop 조작의 표시 품질만 올렸다.

### 적용 내용

- grid 카드 최소 폭을 키워 thumbnail이 더 읽히게 했다.
- asset card에 `data-asset-status`, `data-preview-ready`를 추가했다.
- thumbnail에 duration badge, status badge, preview kind 속성을 추가했다.
- 카드 본문에 usage badge, type badge, metadata summary test id를 추가했다.
- health/cache 상태를 표시용 badge로 계산하되, 단순 `unused-media`는 blocker처럼 보이지 않게 `Unused`로 분리했다.
- 기존 `Insert`, `Source`, `Overwrite`, drag handle, double-click insert 동작은 유지했다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/media-bin-panel.tsx tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium -g "imports media through the visible media panel import button into the grid|imports media then drags the media card directly onto an audio timeline lane"`

결과:

- ESLint 통과
- media import/grid + audio lane drag E2E: 2 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Toolbar Command Grouping

적용일: 2026-06-20

### 목적

상단 toolbar가 기능 버튼을 한 줄에 나열해 보여 작업 흐름을 파악하기 어려운 문제를 줄였다. 기능 제거가 아니라 기존 명령을 편집 작업 흐름 단위로 재배치하는 패스다.

### 적용 내용

- 상단 command rail을 `History`, `Ingest`, `Edit`, `Timeline`, `Output`, `State` 그룹으로 분리했다.
- `Undo/Redo`, `Import/Commands`, `Cut/Delete`, `Edit/Source/Marks`, `Timeline`, `Export/Render/AI`, 선택/저장/status 표시를 각각 역할별로 묶었다.
- 기존 button `data-testid`, command handler, disabled state, menu label은 유지했다.
- ComfyUI batch와 STT caption entry는 `AI` 메뉴 안에 그대로 유지했다.
- export/render preflight block state는 기존 `Render blocked` 버튼 상태를 그대로 사용한다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/editor-top-toolbar.tsx tests/e2e/editor-control-surface-audit.spec.ts`
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium`

결과:

- ESLint 통과
- editor control surface E2E: 3 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Media Bin Grid / Compact List

적용일: 2026-06-20

### 목적

import된 파일이 CapCut/Filmora식 media bin처럼 더 쉽게 훑어보이도록 grid/list 전환을 추가했다. 이번 범위는 Media Bin 표시 밀도와 액션 정리이며 import, source monitor, timeline insert/overwrite/drop 동작은 변경하지 않았다.

### 적용 내용

- Media Bin 상단에 `Grid / List` view mode toggle을 추가했다.
- asset list와 asset card에 현재 view mode를 `data-view-mode`로 노출했다.
- grid mode는 기존 thumbnail 중심 카드 구조를 유지한다.
- compact list mode는 thumbnail, 이름/metadata, Add/Source/Over 액션을 한 줄에 배치한다.
- list mode에서도 기존 `Insert`, `Open in Source Monitor`, `Overwrite` 접근성 label을 유지했다.
- drag handle과 double-click insert 경로는 유지했다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/media-bin-panel.tsx tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`

결과:

- ESLint 통과
- media import/source/timeline/audio/image/MP4 drag E2E: 6 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 문서화: 기본골격 완료정의서

적용일: 2026-06-20

### 목적

현재 편집기 상태를 "완성품 완료"로 과장하지 않고, 별도 단계인 "기본골격 완료"로 판정하기 위한 기준서를 작성했다. 이 문서는 구현 결과를 기록하고 판정 범위를 명확히 하는 문서이며, 외부 QA나 사람 승인 항목을 우회하지 않는다.

### 작성 문서

- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`

### 핵심 판정

- 기본골격: `LOCAL_BASE_SKELETON_PASS`
- 상용 편집기 체감 품질: `IN_PROGRESS`
- 완성품 전체 기준: `NOT_COMPLETE`
- Fresh Windows QA / final release approval: `EXTERNAL_PENDING`

### 문서에 남긴 내용

- 기본골격 완료와 완성품 완료의 차이
- `LOCAL_BASE_SKELETON_PASS`가 의미하는 로컬/editor-only 판정 범위
- 현재 판단근거와 관련 검증 기록
- Media import, Source Monitor, timeline drop, direct move/trim, Program Monitor, Inspector sync, Local Installed-App Acceptance 기준
- 아직 남은 상용 편집기 품질 과제
- 외부 개입이나 사람 판단이 필요한 pending 항목
- 이후 진행 우선순위

### 검증

문서 변경만 수행했다. 새 코드 변경이나 전체 테스트는 실행하지 않았다.

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Timeline Move / Trim Commit Focus

적용일: 2026-06-20

### 목적

Timeline clip을 직접 move/trim한 뒤 선택 상태와 Program Monitor 활성 상태가 편집 흐름에 맞게 이어지도록 보강했다. Source Monitor가 active인 상태에서 timeline 직접 조작을 해도 commit 후 Program Monitor/Inspector 편집 대상으로 복귀해야 한다.

### 적용 내용

- clip edge trim commit 후 trim 대상 clip을 primary selection으로 유지한다.
- clip edge trim commit 후 selected track과 playhead를 trim edge 위치로 갱신하고 Program Monitor를 active로 전환한다.
- clip body drag move commit 후 anchor clip을 primary selected clip으로 유지한다.
- clip body drag move commit 후 target track/playhead를 갱신하고 Program Monitor를 active로 전환한다.
- Source Monitor를 먼저 active로 만든 뒤 move/trim을 수행하는 E2E를 추가해 monitor focus 복귀를 검증했다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/app/editor/page.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "supports direct timeline clip edge trim feedback|supports direct timeline clip body drag move feedback"`

결과:

- ESLint 통과
- direct timeline move/trim E2E: 2 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Timeline Drop Selection / Preview Sync

적용일: 2026-06-20

### 목적

Media Bin에서 timeline으로 asset을 올린 뒤 새 clip이 곧바로 선택되지 않거나 Source Monitor 상태가 남아, 사용자가 바로 Program Monitor/Inspector에서 편집을 이어가기 어려운 흐름을 줄였다.

### 적용 내용

- source insert/overwrite와 timeline drop이 같은 inserted clip selection resolver를 사용하도록 맞췄다.
- Media Bin pointer drag/drop과 HTML5 drag/drop 모두 commit 결과 프로젝트에서 새 clip을 찾아 선택한다.
- OS 파일을 timeline에 직접 drop하는 경로도 생성된 첫 asset/clip 선택으로 이어지게 했다.
- drop/insert commit 후 Program Monitor를 active monitor로 전환한다.
- Program Monitor와 Source Monitor에 `data-active` 상태를 노출해 active monitor 연동을 E2E에서 안정적으로 검증할 수 있게 했다.
- 기존 ComfyUI, Automation, Render Worker, Plugin, export validation 흐름은 변경하지 않았다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/app/editor/page.tsx src/electron/renderer/program-preview-stage.tsx src/electron/renderer/source-monitor.tsx tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium -g "imports media then drags|imports image media then drags|imports MP4 media then"`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium -g "imports media then routes it through source monitor insert onto the timeline"`

결과:

- ESLint 통과
- media import/drop/source insert E2E: 5 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Inspector Commercial Property Tabs

적용일: 2026-06-20

### 목적

오른쪽 Inspector가 상용 편집기의 속성 패널처럼 `Video / Audio / Speed / Animation / Tracking / Adjust` 기준으로 접근되지 않아, 실제 편집 속성이 어디에 있는지 찾기 어려운 문제를 줄였다.

### 적용 내용

- Inspector Edit 그룹에 `Speed`, `Animation`, `Tracking`, `Adjust` 탭을 추가했다.
- `Speed`는 기존 clip media/retime/speed ramp 컨트롤로 연결했다.
- `Animation`은 기존 transform/keyframe 컨트롤로 연결했다.
- `Tracking`과 `Adjust`는 기존 effects/adjustment 컨트롤로 연결했다.
- `Filters`와 `Adjust` primary mode가 같은 asset bay와 Inspector panel을 공유할 수 있도록, 마지막으로 선택한 primary mode를 보존해 active button 표시가 틀어지지 않게 했다.
- 새 기능 의미를 추가하지 않고 기존 편집 컨트롤을 찾기 쉬운 탭 경로로 재배치했다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/app/editor/page.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts tests/e2e/editor-control-surface-audit.spec.ts`
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium -g "routes primary mode buttons to their asset bay and inspector panels"`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`

결과:

- ESLint 통과
- primary mode routing E2E: 1 passed
- selected clip Inspector E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Program Monitor Control State Visibility

적용일: 2026-06-20

### 목적

Program Monitor의 zoom, pan, aspect, fullscreen 컨트롤이 실제 상태와 연결되어 있는지 사용자가 더 명확히 확인할 수 있게 했다. 이번 범위는 상태 노출과 검증 보강이며 preview/render architecture는 변경하지 않았다.

### 적용 내용

- Program Monitor frame에 `data-monitor-zoom`, `data-monitor-aspect`, `data-monitor-fullscreen`, `data-monitor-pan-x/y`를 노출했다.
- canvas viewport에 `data-zoomed`, `data-pan-enabled`를 노출했다.
- canvas stage에 canvas size, scale, zoom percent, pan 값을 노출했다.
- aspect label에 `data-testid="program-monitor-aspect-label"`과 `data-aspect-label`을 추가했다.
- 기존 Play/Pause, program playhead, proxy, info, zoom, fit, aspect, fullscreen control 동작은 변경하지 않았다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/program-composite-preview.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "links program monitor player controls to the timeline state"`

결과:

- ESLint 통과
- program monitor player controls E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Timeline Drag Feedback Visibility

적용일: 2026-06-20

### 목적

timeline drag/drop 중 기능은 동작하지만 사용자가 현재 상태를 즉시 읽기 어려운 문제를 줄였다. 이번 범위는 시각 피드백과 테스트 가능성 보강이며, drag/drop/trim 계산 semantics는 변경하지 않았다.

### 적용 내용

- timeline edit guide line에 `data-guide-active-track`, `data-guide-tone`, `data-guide-label`, `data-guide-time`을 노출했다.
- active track에는 별도 callout을 표시해 `Move`, `Snap`, `Limit`, `Drop` 상태와 timecode를 분리해서 읽을 수 있게 했다.
- drop preview에 `data-drop-state`, `data-drop-end`를 추가했다.
- drop preview 시작/끝 edge rail을 표시해 사용자가 들어갈 범위를 더 쉽게 볼 수 있게 했다.
- drop preview 하단에 start-end 시간 범위를 표시했다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/timeline-track-row.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "supports direct timeline clip body drag move feedback|supports direct clip drag move to another compatible video track"`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`

결과:

- ESLint 통과
- timeline body drag / cross-track drop E2E: 2 passed
- media import/source/timeline/audio/image/MP4 drag E2E: 6 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Toolbar Command / Timeline Wheel Anchor

적용일: 2026-06-20

### 목적

상단 toolbar가 단순 노출이 아니라 실제 편집 state와 history에 연결되는지 확인하고, timeline wheel zoom이 상용 편집기처럼 마우스 커서 아래 시간을 유지하는지 검증했다.

### 발견한 문제

- `resolveTimelineWheelZoomInteraction`은 cursor anchor scrollLeft를 계산하고 있었다.
- 하지만 `pixelsPerSecond` 변경 직후 `resolveTimelineVisibleScrollLeft` effect가 실행되면서 playhead 중심 auto-scroll이 wheel zoom scrollLeft를 덮었다.
- 결과적으로 실제 브라우저에서는 Ctrl/Meta wheel zoom 시 커서 아래 시간이 약 4.5초 밀렸다.

### 적용 내용

- wheel zoom / fit zoom이 scrollLeft를 직접 정하는 경우, 다음 1회의 playhead-visible auto-scroll을 건너뛰도록 guard를 추가했다.
- toolbar `Cut`, `Delete`, `Undo`, `Redo`가 timeline clip state와 history에 실제로 연결되는지 E2E로 고정했다.
- React controlled range input 테스트 helper를 native value setter 방식으로 보강해 playhead 변경 검증이 안정적으로 되도록 했다.
- timeline wheel zoom E2E에 cursor anchor time 유지 검증을 추가했다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/app/editor/page.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts tests/e2e/editor-control-surface-audit.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "supports direct timeline zoom scrub and playhead manipulation"`
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium`

결과:

- ESLint 통과
- timeline zoom/scrub/playhead E2E: 1 passed
- editor control surface audit E2E: 3 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Editor Control Surface Audit

적용일: 2026-06-20

### 목적

상단 toolbar와 primary workspace 버튼이 단순히 화면에 나열된 껍데기인지, 실제 상태/패널/메뉴와 연결되어 있는지 최소 범위로 감사했다.

### 적용 내용

- top toolbar의 직접 버튼에 테스트 가능한 `data-testid`를 추가했다.
- `ToggleButton`에 `aria-pressed`를 노출해 Ripple/Snap/Loop 상태를 사용 기준으로 검증할 수 있게 했다.
- toolbar menu(`Edit`, `Source`, `Marks`, `Timeline`, `AI`)에 summary/content 테스트 id를 추가했다.
- primary mode 버튼에 대상 asset panel / dock panel 정보를 노출했다.
- editor shell에 현재 primary mode, asset panel, dock panel 상태를 노출했다.
- primary mode 클릭 시 status 문구가 갱신되도록 연결했다.

### 검증

관련 범위만 실행했다.

- `npx eslint tests/e2e/editor-control-surface-audit.spec.ts`
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium`

결과:

- ESLint 통과
- editor control surface audit E2E: 2 passed

### 확인된 동작

- Undo/Redo/Import/Commands/Cut/Delete/Export/Render 버튼이 테스트 가능한 control surface로 노출된다.
- Command palette 버튼은 실제 dialog를 연다.
- toolbar menu는 사용자가 열 수 있고 주요 command button이 노출된다.
- Ripple/Snap은 직접 클릭으로 상태가 반전된다.
- Loop는 loop range 조건이 필요한 기존 검증 로직을 유지하며 상태 노출만 확인했다.
- primary workspace 버튼은 Media/Audio/Text/Effects/Transitions/Captions/Filters/Adjust/Templates/AI 각각의 asset bay와 inspector dock 상태로 연결된다.

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Imported MP4 Drag / Program Monitor Play / Timeline Edit 검증

적용일: 2026-06-20

### 목적

실제 MP4 파일을 Media Bin으로 import한 뒤 상용 편집기에서 기대하는 기본 경로가 동작하는지 검증했다. 이번 pass의 product code 변경은 Program Monitor media/audio element에 테스트 가능한 asset/clip id를 노출한 것뿐이며, 편집 로직, export validation, render worker, ComfyUI, automation 계층은 변경하지 않았다.

### 검증한 사용 경로

- MP4 파일을 Media Bin으로 import한다.
- imported MP4 asset card의 drag handle을 잡는다.
- video timeline lane으로 직접 drag한다.
- drop preview가 표시되고 valid 상태인지 확인한다.
- mouse up 후 video timeline clip이 생성되는지 확인한다.
- Program Monitor에서 imported MP4가 worker decoded frame 또는 video element로 preview되는지 확인한다.
- Program Monitor play 버튼으로 imported MP4 preview가 재생되는지 확인한다.
- embedded audio가 있는 MP4의 program audio layer가 생성되고 muted 상태가 아닌지 확인한다.
- video-only MP4 imported clip을 직접 drag move한다.
- imported MP4 clip의 tail edge trim이 실제 duration 변경으로 반영되는지 확인한다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/program-media-layer-preview.tsx src/electron/renderer/program-audio-graph-controller.tsx tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`

결과:

- ESLint 통과
- media import/source/timeline/audio drag/image preview/MP4 preview/MP4 edit E2E: 6 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Imported Image Drag-to-Timeline 및 Program Monitor Preview 검증

적용일: 2026-06-20

### 목적

audio import뿐 아니라 visual media도 Media Bin에서 직접 timeline으로 끌어 놓고 Program Monitor에서 바로 확인 가능한지 검증했다. 이번 pass에서는 기존 구현이 동작했으므로 product code는 변경하지 않고 E2E 회귀 테스트만 추가했다.

### 검증한 사용 경로

- png 파일을 Media Bin으로 import한다.
- imported asset card의 drag handle을 잡는다.
- video timeline lane으로 직접 drag한다.
- drop preview가 표시되고 valid 상태인지 확인한다.
- mouse up 후 timeline clip이 생성되는지 확인한다.
- playhead를 dropped clip 구간으로 이동한다.
- Program Monitor에 imported image가 실제 preview image로 표시되는지 확인한다.

### 검증

관련 범위만 실행했다.

- `npx eslint tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`

결과:

- ESLint 통과
- media import/source/timeline/audio drag/image preview E2E: 4 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Imported Media 직접 Drag-to-Timeline 검증

적용일: 2026-06-20

### 목적

import 버튼과 card action 버튼만 동작하는 상태가 아니라, 사용자가 Media Bin에서 가져온 파일을 직접 timeline lane으로 끌어 놓을 수 있는지 검증했다. 이번 pass에서는 기존 구현이 동작했으므로 product code는 변경하지 않고 E2E 회귀 테스트만 추가했다.

### 검증한 사용 경로

- wav 파일을 Media Bin으로 import한다.
- imported asset card의 drag handle을 잡는다.
- audio timeline lane으로 직접 drag한다.
- drop preview가 표시되고 valid 상태인지 확인한다.
- mouse up 후 timeline clip이 생성되는지 확인한다.
- 생성된 clip이 imported asset id를 유지하고 audio track에 배치되는지 확인한다.

### 검증

관련 범위만 실행했다.

- `npx eslint tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`

결과:

- ESLint 통과
- media import/source/timeline/drag E2E: 3 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Media Bin Source 연결 노출

적용일: 2026-06-20

### 목적

Media Bin에서 파일을 가져온 뒤 실제로 Source Monitor와 timeline insert 경로에 연결됐는지 사용자가 화면에서 바로 확인하기 어렵던 문제를 줄였다. 편집 엔진, export validation, ComfyUI, automation, render worker 계층은 변경하지 않았다.

### 적용 내용

- Media Bin 상단에 현재 Source Monitor로 선택된 asset 이름을 표시했다.
- 선택된 asset card 썸네일에 `Source` 배지를 표시했다.
- Source controls 영역은 asset 선택 시 자동으로 열린 상태가 되도록 했다.
- asset card title에 double-click insert 동작을 명시했다.
- 기존 `Insert`, `Source`, `Overwrite`, drag/drop 동작 자체는 변경하지 않았다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/electron/renderer/media-bin-panel.tsx tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`

결과:

- ESLint 통과
- media import/source/timeline E2E: 2 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 아직 남은 상용 편집기 수준 과제

이번 pass는 1~5번의 직접 체감 품질을 보강한 단계다. 다음 단계에서 더 올릴 수 있는 항목은 다음과 같다.

- 실제 OS 오디오 출력 확인은 자동화만으로는 한계가 있으므로 설치 앱 수동 확인이 필요하다.
- Media Bin list/grid 전환과 thumbnail hover scrub은 이후 pass에서 적용했다. 남은 항목은 bin 구조와 더 세밀한 asset organization 정리다.
- Timeline ripple/snap/collision preview는 drop 영향 범위 ghost overlay까지 1차 보강했다. 남은 항목은 multi-clip ripple 영향량과 충돌 회피 후보를 더 정밀하게 보여주는 작업이다.
- Inspector tab 구조를 CapCut/Filmora식 `Video / Audio / Speed / Animation / Tracking / Adjust`로 더 정리할 수 있다.
- Toolbar command grouping은 더 줄일 수 있지만, 단축키/command palette와 같이 설계해야 한다.

## 추가 Pass: Inspector / Media Bin / Timeline Feedback

적용일: 2026-06-20

### 목적

이전 pass에서 연결한 기능을 사용자가 더 쉽게 인지하도록 UI 피드백을 보강했다.

### 적용 내용

Inspector:

- Inspector dock 버튼을 `tablist` / `tab` 구조로 바꿨다.
- `C / V / A / FX`처럼 약어 버튼으로 보이던 문제를 줄이기 위해 full label을 더 읽기 쉽게 노출했다.
- 기존 active dock panel 의미와 내부 패널 연결은 변경하지 않았다.

Media Bin:

- asset card에 `data-asset-name`, `data-asset-kind`, `data-asset-duration`, `data-selected`를 노출했다.
- imported asset이 grid card에서 바로 식별되는지 E2E로 고정했다.
- `Insert`, `Source`, `Overwrite` action이 hover 없이 보이는 상태를 유지한다.

Timeline:

- drop preview에 `data-drop-label`, `data-drop-tone`을 추가했다.
- drag 중 preview가 asset drop인지 clip move인지 테스트에서 구분 가능하게 했다.
- invalid preview label은 사용자가 다른 track/time을 선택해야 한다는 상태를 더 명확히 보여준다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/app/editor/page.tsx src/electron/renderer/media-bin-panel.tsx src/electron/renderer/timeline-track-row.tsx tests/e2e/editor-media-import-grid.spec.ts tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`

결과:

- ESLint 통과
- media import/source/timeline E2E: 2 passed
- editor direct manipulation E2E: 16 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Inspector Edit / Workflow 분리

적용일: 2026-06-20

### 목적

Inspector 탭이 `Clip / Video / Audio / Effects / Text / Jobs / Export / Plugins`로 한 줄에 섞여 있어 편집 속성 패널과 워크플로 패널이 같은 성격처럼 보이는 문제를 줄였다.

### 적용 내용

- `Clip / Video / Audio / Effects / Text`를 Edit 탭 그룹으로 분리했다.
- `Jobs / Export / Plugins`를 Workflow 탭 그룹으로 분리했다.
- Inspector tab UI를 `tablist` / `tab` 의미로 유지했다.
- active panel이 Workflow 영역이면 우측 badge가 `Workflow`로 표시된다.
- `Clip / Video / Audio / Effects`처럼 선택된 timeline clip이 필요한 패널에서 clip이 없으면 빈 선택 상태를 표시한다.
- 기존 panel id, active panel state, 각 패널 내부 기능 연결은 변경하지 않았다.

### 검증

관련 범위만 실행했다.

- `npx eslint src/app/editor/page.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`

결과:

- ESLint 통과
- editor direct manipulation E2E: 16 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Timeline Context Action 사용성

적용일: 2026-06-20

### 참고 소스 확인

로컬 reference를 UI 모방 대상이 아니라 interaction 구조 참고용으로 확인했다.

- Shotcut `src/qml/views/timeline/Clip.qml`: clip 본체 우클릭은 먼저 clip click/selection 흐름을 태우고 context action으로 넘어간다. trim-in/trim-out은 별도 MouseArea로 분리되어 pointer down, move delta, release commit 흐름을 가진다.
- Shotcut `src/qml/views/timeline/Timeline.js`: selection toggle/range/box selection이 별도 helper로 정리되어 있다.
- Shotcut `src/commands/timelinecommands.h/.cpp`: move/trim/split/delete 같은 timeline commit은 undo command 계층으로 분리되어 있다.
- OpenReel reference `apps/web/src/components/editor/timeline`: clip context menu, clip component, track lane이 component 단위로 분리되어 있고, selection/action 상태를 UI에 직접 드러낸다.

이번 pass는 Danbi 기존 adapter/commit 구조를 유지하고, timeline context action 표면만 상용 편집기 방식에 가깝게 정리했다.

### 적용 내용

- timeline context menu를 긴 평면 목록에서 `Edit`, `Clip selection`, `Playhead edit`, `Navigate`, `Marks and captions`, `Audio and link`, `Remove and transition` 섹션으로 분리했다.
- 우클릭 anchor clip id/name을 menu DOM 상태와 header에 노출했다.
- selection count, clipboard count, mark state, attribute clipboard state를 menu DOM 상태로 유지했다.
- 주요 명령에 shortcut hint를 추가했다.
- 메뉴 높이에 상한과 overflow를 적용하고 viewport 안으로 위치를 clamp해 화면 끝에서 잘리지 않게 했다.
- 기존 command handler, selection commit, undo/redo 흐름은 변경하지 않았다.

### 검증

관련 범위만 실행했다.

- `npx eslint src\electron\renderer\timeline-context-menu.tsx src\app\editor\page.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test ./tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct timeline box selection and context actions"`

결과:

- ESLint 통과
- timeline context action E2E: 1 passed

첫 Playwright 실행은 Windows backslash 경로와 `-g` 인자 조합으로 테스트 파일을 찾지 못해 실패했고, 동일한 단일 테스트를 forward-slash 경로와 `--grep`로 재실행해 통과했다. 코드 실패가 아니라 명령 인자 해석 문제였다.

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Source / Program Monitor 전환 UX

적용일: 2026-06-20

### 목적

Source Monitor 표시 여부와 실제 active monitor가 섞여 보이던 문제를 줄였다. 기존 `Source` 버튼은 panel visibility 토글에 가까웠고, 사용자가 현재 keyboard/playback 조작 대상이 Source인지 Program인지 빠르게 확인하기 어려웠다.

### 적용 내용

- Edit Workspace header에 `Program / Source` monitor switcher를 추가했다.
- `Program` switch는 Program Monitor를 active monitor로 전환한다.
- `Source` switch는 Source Monitor panel을 표시하고 Source Monitor를 active monitor로 전환한다.
- 기존 Source panel 표시/숨김 버튼은 유지하되, label을 `Show Source` / `Hide Source`로 바꿔 용도를 명확히 했다.
- monitor workspace에 `data-active-monitor`, `data-source-monitor-visible`, `data-scene-readout-visible` 상태를 노출했다.
- Source panel을 보이는 상태에서 Program으로 전환해도 Source panel은 유지되고 active 대상만 Program으로 바뀌게 했다.
- Source panel을 숨길 때 Source가 active였다면 Program Monitor로 복귀한다.

### 검증

관련 범위만 실행했다.

- `npx eslint src\app\editor\page.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test ./tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "keeps monitor diagnostics hidden by default and source video audio unmuted"`

결과:

- ESLint 통과
- Source/Program monitor 전환 E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation

## 추가 Pass: Timeline Clip 조작 피드백

적용일: 2026-06-20

### 목적

Timeline clip을 move/trim하는 동안 badge만으로는 현재 조작 의미와 수치 변화가 충분히 보이지 않았다. 이번 pass는 기존 preview/commit 로직을 유지하고, 이미 계산되는 preview state를 사용자에게 더 직접적으로 보여주는 데 집중했다.

### 적용 내용

- `TimelineEditGuide`에 표시용 metadata를 추가했다.
  - operation
  - delta
  - duration
  - groupCount
  - snapped/constrained/ripple
- move/trim guide line DOM에 위 상태를 `data-guide-*` 속성으로 노출했다.
- guide callout에 operation, delta, duration, multi-clip count, ripple 상태를 함께 표시한다.
- clip 조작 중 clip 내부에 `timeline-clip-edit-hud-*` HUD를 표시한다.
- clip HUD에는 operation, delta, duration, snap/limit/ripple 상태를 표시한다.
- move/trim 계산, snap/limit 판정, commit, undo/redo 흐름은 변경하지 않았다.

### 검증

관련 범위만 실행했다.

- `npx eslint src\electron\renderer\editor-view-model.ts src\electron\renderer\timeline-edit-preview-helpers.ts src\electron\renderer\timeline-track-row.tsx src\electron\renderer\timeline-clip-button.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test ./tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct timeline clip edge trim feedback|supports direct timeline clip body drag move feedback"`

결과:

- ESLint 통과
- timeline move/trim feedback E2E: 2 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation
## 추가 Pass: Timeline Ripple Trim 영향 표시
적용일: 2026-06-20

### 목적

Ripple 모드에서 clip edge trim을 수행할 때 downstream clip들이 어느 방향으로 얼마나 이동하는지 드래그 중 바로 확인할 수 있게 한다. 기존 ripple trim 계산, commit, undo/redo semantics는 변경하지 않고 preview layer만 추가했다.

### 적용 내용

- `TimelineRippleTrimPreview` view-model을 추가했다.
- ripple trim 중 영향을 받는 downstream clip 목록, 이전 start, 다음 start, duration을 계산한다.
- timeline lane 위에 ripple trim ghost overlay를 표시한다.
- overlay DOM에 `data-ripple-*` 상태를 노출해 실제 상호작용 테스트가 가능하게 했다.
- clip trim commit 로직과 ripple 적용 로직은 변경하지 않았다.

### 검증

관련 범위만 실행했다.

- `npx eslint src\app\editor\page.tsx src\electron\renderer\editor-view-model.ts src\electron\renderer\timeline-track-row.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "shows ripple trim downstream impact while dragging a clip edge"`

결과:

- ESLint 통과
- ripple trim downstream impact E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation
## 추가 Pass: Timeline Multi-select Group Trim
적용일: 2026-06-20

### 목적

multi-select 상태에서 clip edge trim을 수행할 때 anchor clip만 줄어드는 것이 아니라 선택된 clip 그룹이 같은 edge delta로 함께 resize되도록 한다. 기존 ripple trim semantics는 변경하지 않고, ripple이 꺼진 일반 multi-select trim에만 OpenCut 기반 group resize 코어를 연결했다.

### 적용 내용

- `resolveTimelineClipTrimEdit`를 추가해 selected clip group의 edge resize preview를 계산한다.
- 기존 `timeline-group-resize` 코어를 사용해 static clip과 source bound를 고려한 trim clamp를 유지한다.
- multi-select trim 중 timeline lane에 `group-trim` ghost overlay를 표시한다.
- anchor clip HUD와 guide callout에 group count를 표시한다.
- commit 후에도 multi-select 상태를 유지하고 Program Monitor 편집 대상으로 복귀한다.
- ripple mode trim, linked trim, roll/slip/slide, render/export semantics는 변경하지 않았다.

### 검증

관련 범위만 실행했다.

- `npx eslint src\app\editor\page.tsx src\electron\renderer\editor-view-model.ts src\electron\renderer\timeline-edit-preview-helpers.ts src\electron\renderer\timeline-track-row.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct multi-select group clip edge trim"`

결과:

- ESLint 통과
- multi-select group trim E2E: 1 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation
## 추가 Pass: Timeline Slip / Roll / Slide 직접 조작
적용일: 2026-06-20

### 목적

상용 편집기 기본 조작인 slip, roll trim, slide가 실제 마우스 modifier drag로 동작하고, 조작 중 sourceIn/start/duration 변화가 확인되도록 한다. 기존 slip/roll/slide commit semantics는 변경하지 않고 preview metadata와 E2E 검증을 보강했다.

### 적용 내용

- `TimelineClipEditPreview`에 `sourceIn`, `sourceInDelta` metadata를 추가했다.
- slip/roll/slide preview helper가 조작 중 sourceIn 변화를 노출하도록 했다.
- timeline clip DOM과 HUD에 `data-preview-source-in`, `data-preview-source-delta`, `data-hud-source-*` 상태를 노출했다.
- Playwright E2E에 modifier drag helper를 추가해 실제 `Alt+drag`, `Alt+edge drag`, `Shift+Alt+drag` pointer flow를 검증했다.
- slide는 같은 A-roll 뒤에 기존 media asset을 drop해 next clip이 있는 실제 조건을 만든 뒤 검증했다.

### 검증

관련 범위만 실행했다.

- `npx eslint src\electron\renderer\editor-view-model.ts src\electron\renderer\timeline-edit-preview-helpers.ts src\electron\renderer\timeline-clip-button.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct slip edit|supports direct roll trim|supports direct slide edit"`

결과:

- ESLint 통과
- slip/roll/slide 직접 조작 E2E: 3 passed

### 변경하지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics for ComfyUI generation
