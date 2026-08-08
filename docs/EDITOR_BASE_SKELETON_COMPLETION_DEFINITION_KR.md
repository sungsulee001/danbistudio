# Danbi Editor 기본골격 완료정의서

작성일: 2026-06-20

상태: 기준 문서 겸 현황 보고서. 이 문서는 `완성품 완료`가 아니라 `기본골격 완료`를 정의하고, 현재 근거로 그 기준을 충족했는지 판정한다.

## 1. 목적

현재 Danbi Editor가 어느 수준까지 왔는지 판단할 때, "상용 편집기 수준으로 완성"과 "편집기로서 기본골격이 세워짐"을 분리한다.

이 문서의 목적은 다음과 같다.

- 현재 판단근거로 기본골격 완료 기준을 고정한다.
- 이번 세션에서 진행한 것은 editor 기본골격 코드 보강과 그 결과 문서화이며, 문서 수정만으로 완료 판정을 만든 것이 아니다.
- 이후 작업을 이 기준과 남은 품질 과제로 나눠 진행한다.
- 외부 QA, 최종 승인, 사람의 제품 판단이 필요한 항목은 완료로 처리하지 않고 pending으로 남긴다.
- ComfyUI, Automation, Render Worker, Extension 같은 Danbi orchestration 기능을 제거하지 않고, editor 기본골격 위에 유지한다.

## 2. 용어 정의

### 기본골격 완료

사용자가 실제 미디어를 가져와 timeline에 올리고, monitor에서 확인하고, clip을 선택/이동/trim하고, inspector와 preview가 같은 선택 상태를 바라보며, local installed app acceptance 기준으로 import/render 경로가 막히지 않는 상태다.

기본골격 완료는 다음을 의미하지 않는다.

- CapCut/Filmora/Shotcut 수준의 최종 사용감 완성
- 모든 메뉴의 상용 제품 수준 정리
- 모든 고급 편집 기능의 완성
- 외부 Fresh Windows QA 완료
- 최종 release approval 완료

### 완성품 완료

`docs/EDITOR_COMPLETION_DEFINITION_KR.md`의 전체 조건을 만족하는 상태다. 기본골격 완료보다 높은 기준이다.

## 3. 현재 판정

현재 판단:

- 기본골격: `LOCAL_BASE_SKELETON_PASS`
- Editor-only regression sweep: `PASS`
- 상용 편집기 체감 품질: `IN_PROGRESS`
- 완성품 전체 기준: `NOT_COMPLETE`
- 외부 Fresh Windows / 최종 승인: `EXTERNAL_PENDING`

판정 범위:

- `LOCAL_BASE_SKELETON_PASS`는 로컬 개발/설치 앱에서 editor 기본 조작 경로가 막히지 않는다는 판정이다.
- 이 판정은 상용 편집기 수준의 UX 만족, 실제 장치 오디오 체감, 외부 Fresh Windows QA, 최종 release approval을 대체하지 않는다.
- 현재 문서 수정은 판정 범위를 명확히 하는 정정이며, ComfyUI/Automation/Render Worker/Plugin/export validation 의미를 변경하지 않는다.

판정 근거:

- Media import, Media Bin, Source Monitor, timeline insert/drop 경로가 있다.
- Timeline direct manipulation의 핵심인 select, body drag move, edge trim, multi-select move, scrub, zoom, playhead 조작 경로가 있다.
- Program Monitor direct manipulation의 기본인 transform/crop handle, monitor controls, inspector sync 경로가 있다.
- Inspector는 edit/workflow 그룹 분리와 `Video / Audio / Speed / Animation / Tracking / Adjust` 접근 경로를 갖기 시작했다.
- Local Installed-App Acceptance 문서 기준으로 packaged Electron import/storage/render blocker는 local PC에서 통과한 기록이 있다.
- 단, toolbar/menu 세부 동작 감사, 상용 편집기형 조작감, 전체 UX 만족도, 외부 QA 승인은 아직 완료가 아니다.
- 2026-06-20 editor-only regression sweep에서 toolbar/control surface, media import/drop, Program Monitor/timeline direct manipulation 관련 E2E가 통과했다.

## 4. 기본골격 완료 조건

아래 조건은 기본골격 완료의 최소 기준이다.

| 영역 | 완료 기준 | 현재 상태 | 근거 |
| --- | --- | --- | --- |
| App shell | Project Hub와 Editor, AI Studio, Automation, Render Queue, Extensions, Settings가 분리된다. | 충족 | `docs/UX_UI_SCREEN_STRUCTURE_KR.md`, `docs/UX_STRUCTURE_DESIGN_KR.md` |
| Editor layout | media/source, Program Monitor, Inspector, timeline이 별도 작업 영역으로 배치된다. | 충족 | `src/app/editor/page.tsx`, `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md` |
| Media import | visible import button으로 media를 가져오고 Media Bin에서 asset을 확인한다. | 충족 | `tests/e2e/editor-media-import-grid.spec.ts` |
| Source Monitor | Media Bin asset 선택이 Source Monitor와 연결된다. | 충족 | `src/electron/renderer/source-monitor.tsx`, media import e2e |
| Timeline drop | Media Bin asset을 timeline lane에 직접 drag/drop할 수 있다. | 충족 | `tests/e2e/editor-media-import-grid.spec.ts` |
| Drop 후 선택 | drop된 clip이 바로 선택되고 Program Monitor로 이어진다. | 충족 | `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md` |
| Timeline select/move | clip 선택과 body drag move가 실제 timeline state를 바꾼다. | 충족 | `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts` |
| Timeline trim | clip edge drag trim이 실제 timeline state를 바꾼다. | 충족 | `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts` |
| Playhead/scrub/zoom | timeline scrub, playhead, zoom 조작이 가능하다. | 충족 | direct manipulation e2e |
| Program Monitor | timeline composite preview와 player controls가 있다. | 충족 | `src/electron/renderer/program-composite-preview.tsx`, `program-preview-stage.tsx` |
| Program direct manipulation | monitor에서 선택 visual layer의 move/scale/rotate/crop 직접 조작 경로가 있다. | 충족 | direct manipulation e2e |
| Inspector sync | 선택 clip의 transform/clip 속성이 Inspector와 Program Monitor에 동기화된다. | 충족 | direct manipulation e2e |
| Local installed app path | 설치 앱 import/storage/render 경로가 Program Files가 아니라 userData를 사용한다. | 충족 | `docs/ELECTRON_LOCAL_INSTALLED_ACCEPTANCE_KR.md` |
| Core architecture constraints | ComfyUI/Automation/Render Worker/Plugin/export validation semantics를 제거하거나 우회하지 않는다. | 충족 유지 | 작업 문서의 변경하지 않은 영역 |
| 작업 문서화 | 각 pass의 목적, 변경 파일, 검증, 건드리지 않은 영역을 문서로 남긴다. | 충족 | `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md` |

## 5. 최근 검증 근거

최근 editor 기본골격 관련 검증은 전체 테스트 반복이 아니라 변경 영향 범위만 실행했다.

최근 실행 및 통과:

- `npx eslint src/app/editor/page.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "supports direct timeline clip edge trim feedback|supports direct timeline clip body drag move feedback"`
  - 결과: 2 passed
- `npx eslint src/app/editor/page.tsx src/electron/renderer/program-preview-stage.tsx src/electron/renderer/source-monitor.tsx tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium -g "imports media then drags|imports image media then drags|imports MP4 media then"`
  - 결과: 4 passed
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium -g "imports media then routes it through source monitor insert onto the timeline"`
  - 결과: 1 passed
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium -g "routes primary mode buttons to their asset bay and inspector panels"`
  - 결과: 1 passed
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`
  - 결과: 1 passed

기존 관련 검증 기록:

- `docs/EDITOR_CORE_REMAINING_STAGE_COMPLETION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`
- `docs/ELECTRON_LOCAL_INSTALLED_ACCEPTANCE_KR.md`

2026-06-20 editor-only regression sweep:

- `npx eslint src/app/editor/page.tsx src/electron/renderer/editor-top-toolbar.tsx src/electron/renderer/editor-view-model.ts src/electron/renderer/media-bin-panel.tsx src/electron/renderer/media-drop-helpers.ts src/electron/renderer/program-transform-crop-overlays.tsx src/electron/renderer/timeline-clip-button.tsx src/electron/renderer/timeline-edit-preview-helpers.ts src/electron/renderer/timeline-track-row.tsx tests/e2e/editor-control-surface-audit.spec.ts tests/e2e/editor-media-import-grid.spec.ts tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
  - 결과: 통과
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium`
  - 결과: 3 passed
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`
  - 결과: 6 passed
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`
  - 결과: 16 passed

## 6. 기본골격 완료와 무관하게 남은 품질 과제

아래 항목은 기본골격 이후의 품질 과제다. 기본골격 완료를 막지는 않지만, 상용 편집기 체감에는 필요하다.

| 과제 | 상태 | 비고 |
| --- | --- | --- |
| Toolbar/menu 난잡함 정리 | `PARTIAL_PASS` | 상단 toolbar를 History/Ingest/Edit/Timeline/Output/State command group으로 묶었다. 메뉴별 세부 동작 감사는 계속 필요하다. |
| Media Bin 상용 grid/list 체감 | `PARTIAL_PASS` | 큰 썸네일 grid/list 폭, duration/type/use/status badge, metadata summary, thumbnail hover scrub 피드백을 보강했다. bin 구조 추가 개선은 남아 있다. |
| Timeline snap/collision/ripple preview 시각 품질 | `PARTIAL_PASS` | clip move/trim/drop/asset drop preview에 operation, snap, limit, collision, ripple 상태 속성과 badge, 조작 중 clip HUD, guide callout metadata, 드롭 중 ripple/snap/collision 영향 범위 ghost overlay를 추가했다. 더 세밀한 multi-clip ripple 영향량 preview는 남아 있다. |
| Multi-select trim/move 체감 | `IN_PROGRESS` | group move는 검증됐지만 조작감과 표시 품질은 더 필요하다. |
| Program Monitor handle 조작감 | `PARTIAL_PASS` | transform/crop handle hit area, active operation 상태, handle size 속성, stacked visual layer 선택 target/label/editable 상태를 보강했다. multi-layer overlay의 더 세밀한 hit 우선순위와 시각 품질은 남아 있다. |
| Source/Program Monitor 전환 UX | `PARTIAL_PASS` | active monitor 복귀에 더해 Program/Source monitor switcher와 Source panel 표시/숨김 상태를 분리했다. 더 세밀한 dual monitor layout/shortcut polishing은 남아 있다. |
| Audio 실제 출력 UX | `PENDING_HUMAN_CHECK` | 자동화는 DOM/audio state까지 검증 가능하지만 실제 스피커 출력 체감은 수동 확인 필요. |
| 메뉴별 실제 동작 감사 | `PARTIAL_PASS` | Toolbar Edit/Source/Marks 메뉴, timeline context menu, Inspector command panel, Inspector motion/transition/effects/audio panel에서 selection, clipboard, caption, mark range, motion 가능 여부, transition/effect/audio 실행 가능 상태를 disabled/state로 노출했다. timeline context menu는 anchor clip, selection summary, command section grouping까지 보강했다. context action 전체 감사는 남아 있다. |
| 상용 편집기 체감 승인 | `PENDING_HUMAN_DECISION` | 최종 만족도는 사용자가 실제 설치 앱에서 판단해야 한다. |

## 7. 외부 개입이 필요한 pending 항목

아래 항목은 agent가 생성하거나 대신 승인하지 않는다.

| 항목 | 상태 | 이유 |
| --- | --- | --- |
| Fresh Windows QA evidence | `EXTERNAL_PENDING` | 실제 외부/fresh Windows 환경 증거가 필요하다. |
| Returned evidence ZIP | `EXTERNAL_PENDING` | 외부 QA가 반환해야 한다. |
| External manual result JSON | `EXTERNAL_PENDING` | 사람이 실제 확인 후 작성해야 한다. |
| Final release approval | `EXTERNAL_PENDING` | release owner의 승인 판단이다. |
| 실제 스피커/장치 오디오 체감 | `PENDING_HUMAN_CHECK` | 자동화만으로 사용자가 듣는 출력 품질을 증명할 수 없다. |
| 상용 편집기 수준 UX 만족도 | `PENDING_HUMAN_DECISION` | 제품 판단 영역이다. |

## 8. 이후 진행 원칙

1. 기본골격은 유지하면서 품질 패스를 진행한다.
2. 새 기능을 넓히기보다 기존 편집기 기본 조작의 직접성, 피드백, 정리 상태를 먼저 올린다.
3. 테스트는 변경사항과 직접 연결된 범위만 실행한다.
4. ComfyUI, Automation, Render Worker, Render Worker Daemon, Fleet Discovery, Headless Render, Plugin/Extension, ComfyUI export validation semantics는 제거/우회/비활성화/다운그레이드/mock 처리하지 않는다.
5. 외부 QA나 최종 승인이 필요한 항목은 완료로 만들지 않고 pending으로 남긴다.
6. 각 pass는 `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md` 또는 별도 문서에 목적, 변경 파일, 검증, 남은 항목을 기록한다.

## 9. 다음 작업 후보

기본골격 이후 품질 pass 후보는 다음 순서로 정리했다.

1. Toolbar/menu command grouping 정리
2. Media Bin large thumbnail grid/list polish
3. Timeline snap/collision/ripple preview 시각 피드백 강화 1차 적용, multi-clip 영향량 정밀화 남음
4. Program Monitor handle hit area와 transform overlay polish 1차 적용, stacked layer hit 우선순위 정밀화 남음
5. 메뉴별 실제 동작/disabled/state 감사
6. Editor-only regression sweep

위 1~6번은 기본골격 품질 pass로 수행했다. 남은 후속 작업은 각 항목의 `PARTIAL_PASS` 또는 `IN_PROGRESS` 세부 품질을 더 끌어올리는 범위다. 이 순서는 상용 편집기 체감 품질을 올리기 위한 작업 순서이며, 외부 Fresh Windows final gate를 대체하지 않는다.

## 10. 2026-06-20 Toolbar Command Grouping Pass

목적:

- 상단 toolbar/menu가 한 줄에 기능을 나열해 보이는 문제를 줄인다.
- 기능 제거 없이 `History`, `Ingest`, `Edit`, `Timeline`, `Output`, `State` 작업군으로 묶는다.
- 기존 command handler, ComfyUI batch, STT, export/render 버튼 연결은 유지한다.

변경 파일:

- `src/electron/renderer/editor-top-toolbar.tsx`
- `tests/e2e/editor-control-surface-audit.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src/electron/renderer/editor-top-toolbar.tsx tests/e2e/editor-control-surface-audit.spec.ts`
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium`
  - 결과: 3 passed

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 22. 2026-06-20 Editor Interaction Polish 1-5 Pass

목적:

- 기본골격 완료 후 남은 편집기 사용감 1-5번 항목을 실제 조작 피드백 중심으로 보강했다.
- 새 기능 추가가 아니라 기존 timeline, monitor, media bin, toolbar, inspector의 직접 조작성과 상태 노출을 정리했다.

변경 파일:

- `src/app/editor/page.tsx`
- `src/electron/renderer/editor-view-model.ts`
- `src/electron/renderer/timeline-track-row.tsx`
- `src/electron/renderer/timeline-clip-button.tsx`
- `src/electron/renderer/program-transform-crop-overlays.tsx`
- `src/electron/renderer/media-bin-panel.tsx`
- `src/electron/renderer/editor-top-toolbar.tsx`
- `src/electron/renderer/inspector-command-panels.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `tests/e2e/editor-media-import-grid.spec.ts`
- `tests/e2e/editor-control-surface-audit.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

완료정의 반영:

- roll trim과 slide edit 중 이웃 clip 영향 preview가 표시된다.
- clip body drag 중 collision/constraint 상태가 `Blocked`로 표시된다.
- Program Monitor transform 조작 중 readout, HUD, active crosshair가 표시된다.
- Media Bin에서 import된 asset의 usage/reference/cache/timeline state를 확인할 수 있다.
- Toolbar는 group label/menu count/state 속성을 노출한다.
- Inspector command panel은 Primary, Clipboard, Range, Transitions cluster로 나뉜다.

검증:

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

- 관련 ESLint 통과
- 관련 Playwright E2E 총 9개 통과

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

남은 확인:

- 전체 테스트는 실행하지 않았다.
- 대량 프로젝트와 장시간 편집 세션의 체감 성능은 별도 검증이 필요하다.

## 23. 2026-06-20 Editor Real Workflow Stabilization 1-5 Pass

목적:

- 실제 파일 import부터 Media Bin 표시, Source 선택, Timeline drop, Program Monitor playback/scrub/audio, clip 기본 편집, monitor UI, 전체 workspace 밀도를 순서대로 보강했다.
- 새 편집 기능 추가가 아니라 이미 존재하는 편집 흐름이 실제 사용 기준으로 덜 숨고 덜 혼란스럽게 동작하도록 정리했다.

변경 파일:

- `src/app/editor/page.tsx`
- `src/electron/renderer/program-composite-preview.tsx`
- `src/electron/renderer/timeline-clip-button.tsx`
- `tests/e2e/editor-media-import-grid.spec.ts`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `tests/e2e/editor-control-surface-audit.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

완료정의 반영:

- import 후 현재 검색/필터가 새 asset을 숨기지 않는다.
- import된 asset이 Source로 선택되고 Source Monitor가 열린다.
- Program Monitor playhead 조작은 timeline playhead와 동기화되고 active monitor를 program으로 복귀시킨다.
- Program Monitor는 playback/playhead/audio layer 상태를 DOM 상태로 노출한다.
- 선택 clip은 start/duration readout을 표시한다.
- clip drag commit 후 undo/redo로 start 상태가 되돌아가고 다시 적용된다.
- Program Monitor는 Fit 버튼과 Zoom readout을 분리한다.
- 기본 monitor overlay mode는 `clean`이다.
- workspace layout은 `commercial-compact` density로 asset/inspector 폭을 줄이고 timeline-first panel density를 노출한다.

검증:

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
- 관련 Playwright E2E 총 6개 통과
- 전체 테스트는 실행하지 않았다.

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

남은 확인:

- 대량 import와 장시간 timeline scrub/playback 성능은 별도 검증이 필요하다.
- 실제 설치 앱에서 OS 파일 드래그와 browser audio permission 체감 확인은 별도 acceptance에서 확인해야 한다.

## 11. 2026-06-20 Media Bin Grid/List Polish Pass

목적:

- import된 파일이 media bin에서 더 명확한 썸네일 카드로 보이게 한다.
- 기능을 넓히지 않고 duration, type, usage, status, metadata 정보를 카드 안에서 바로 읽히게 한다.
- 기존 import, source monitor 선택, timeline drag/drop 동작은 유지한다.

변경 파일:

- `src/electron/renderer/media-bin-panel.tsx`
- `tests/e2e/editor-media-import-grid.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src/electron/renderer/media-bin-panel.tsx tests/e2e/editor-media-import-grid.spec.ts`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium -g "imports media through the visible media panel import button into the grid|imports media then drags the media card directly onto an audio timeline lane"`
  - 결과: 2 passed

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 12. 2026-06-20 Timeline Preview State Pass

목적:

- timeline에서 직접 조작 중 사용자가 현재 상태를 `Move`, `Trim`, `Snap`, `Limit`, `Collision`, `Ripple`로 즉시 구분할 수 있게 한다.
- 기존 move/trim/drop/insert/overwrite commit 동작은 바꾸지 않고 preview state와 badge만 보강한다.

변경 파일:

- `src/electron/renderer/editor-view-model.ts`
- `src/electron/renderer/timeline-edit-preview-helpers.ts`
- `src/electron/renderer/media-drop-helpers.ts`
- `src/electron/renderer/timeline-track-row.tsx`
- `src/electron/renderer/timeline-clip-button.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src/electron/renderer/editor-view-model.ts src/electron/renderer/timeline-edit-preview-helpers.ts src/electron/renderer/media-drop-helpers.ts src/electron/renderer/timeline-track-row.tsx src/electron/renderer/timeline-clip-button.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "supports direct timeline clip edge trim feedback|supports direct timeline clip body drag move feedback|supports direct clip drag move to another compatible video track|supports direct media bin drag drop onto timeline"`
  - 결과: 4 passed

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 13. 2026-06-20 Program Monitor Handle Hit Area Pass

목적:

- Program Monitor에서 transform/crop handle이 작게 느껴지는 문제를 줄인다.
- 사용자가 현재 move/scale/rotate/crop 중 어떤 조작을 하고 있는지 DOM 상태와 시각 ring으로 확인할 수 있게 한다.
- 기존 transform/crop 계산과 commit 동작은 변경하지 않는다.

변경 파일:

- `src/electron/renderer/program-transform-crop-overlays.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src/electron/renderer/program-transform-crop-overlays.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "supports direct program monitor transform manipulation|supports direct program monitor crop corner manipulation"`
  - 결과: 2 passed

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 13-A. 2026-06-20 Program Monitor Layer Selection Clarity Pass

목적:

- stacked visual layer가 있는 Program Monitor에서 어떤 레이어가 선택 대상인지 확인하기 쉽게 한다.
- 선택 target에 clip/track/kind/stack index/selected/keyframed motion/editable 상태를 노출한다.
- keyframed motion clip의 기존 transform overlay 제한은 변경하지 않는다.

변경 파일:

- `src/electron/renderer/program-transform-crop-overlays.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src/electron/renderer/program-transform-crop-overlays.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes stacked program monitor layer selection targets"`
  - 결과: 1 passed

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 14. 2026-06-20 Toolbar Command State Audit Pass

목적:

- 상단 toolbar/menu에 보이지만 현재 상태에서 실행 불가능한 명령을 눌러야만 실패 상태를 알 수 있는 문제를 줄인다.
- 기능 제거 없이 selection, clipboard, mark range처럼 명확한 전제조건이 있는 명령만 disabled 상태로 노출한다.

변경 파일:

- `src/electron/renderer/editor-top-toolbar.tsx`
- `src/app/editor/page.tsx`
- `tests/e2e/editor-control-surface-audit.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src/electron/renderer/editor-top-toolbar.tsx src/app/editor/page.tsx tests/e2e/editor-control-surface-audit.spec.ts`
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium`
  - 결과: 3 passed

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 14-A. 2026-06-20 Inspector Motion Command State Pass

목적:

- Inspector transform panel이 현재 선택 clip에서 motion 편집 가능한지 명확히 드러내게 한다.
- motion preset, center, 100%, reset 버튼의 disabled 상태를 테스트 가능하게 만든다.
- 기존 motion transform 계산, preset 적용, keyframe semantics는 변경하지 않는다.

변경 파일:

- `src/electron/renderer/inspector-motion-panels.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src/electron/renderer/inspector-motion-panels.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`
  - 결과: 1 passed

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 14-B. 2026-06-20 Inspector Transition Panel State Pass

목적:

- Inspector transition panel이 현재 transition 상태와 transition type을 명확히 노출하게 한다.
- transition remove 가능 여부와 direction 편집 가능 여부를 테스트 가능하게 만든다.
- 기존 transition 적용/수정/ComfyUI AI morph 의미는 변경하지 않는다.

변경 파일:

- `src/electron/renderer/inspector-motion-panels.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src/electron/renderer/inspector-motion-panels.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`
  - 결과: 1 passed

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 14-C. 2026-06-20 Inspector Effects Panel State Pass

목적:

- Inspector effects panel이 현재 선택 clip에서 어떤 effect command/preset을 실행할 수 있는지 명확히 노출하게 한다.
- Tracking/Adjust/Effects dock에서 같은 component가 반복 렌더링되어도 테스트 식별자가 충돌하지 않게 한다.
- 기존 effect 적용, AI enhancement, tracking, ComfyUI 관련 의미는 변경하지 않는다.

변경 파일:

- `src/electron/renderer/inspector-effects-panel.tsx`
- `src/app/editor/page.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src/electron/renderer/inspector-effects-panel.tsx src/app/editor/page.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`
  - 결과: 1 passed

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 14-D. 2026-06-20 Inspector Audio Panel State Pass

목적:

- Inspector audio panel이 현재 선택 clip에서 audio fade, waveform sync, normalize, silence, beat command를 실행할 수 있는지 명확히 노출하게 한다.
- 실제 audio 처리, waveform 분석, normalize/silence/beat 실행 로직은 변경하지 않는다.

변경 파일:

- `src/electron/renderer/inspector-media-panels.tsx`
- `src/electron/renderer/inspector-analysis-panels.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src/electron/renderer/inspector-media-panels.tsx src/electron/renderer/inspector-analysis-panels.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "exposes selected clip transform controls in the default inspector"`
  - 결과: 1 passed

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 15. 2026-06-20 Editor-only Regression Sweep

목적:

- 기본골격 pass에서 직접 수정한 editor 범위가 서로 깨지지 않는지 확인한다.
- 전체 테스트 반복 대신 변경 영향이 있는 editor 상호작용 E2E만 실행한다.

검증:

- `npx eslint src/app/editor/page.tsx src/electron/renderer/editor-top-toolbar.tsx src/electron/renderer/editor-view-model.ts src/electron/renderer/media-bin-panel.tsx src/electron/renderer/media-drop-helpers.ts src/electron/renderer/program-transform-crop-overlays.tsx src/electron/renderer/timeline-clip-button.tsx src/electron/renderer/timeline-edit-preview-helpers.ts src/electron/renderer/timeline-track-row.tsx tests/e2e/editor-control-surface-audit.spec.ts tests/e2e/editor-media-import-grid.spec.ts tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
  - 결과: 통과
- `npx playwright test tests/e2e/editor-control-surface-audit.spec.ts --project=chromium`
  - 결과: 3 passed
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`
  - 결과: 6 passed
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`
  - 결과: 16 passed

판정:

- 기본골격 범위: `LOCAL_BASE_SKELETON_PASS`
- 상용 편집기 체감 품질: `IN_PROGRESS`
- 외부 Fresh Windows QA evidence / returned evidence ZIP / external manual result JSON / final release approval: `EXTERNAL_PENDING`

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 16. 2026-06-20 Media Bin to Timeline Drag Feedback Pass

목적:

- Media Bin asset을 timeline lane으로 끌 때 현재 드래그 중인 asset과 drop 영향을 화면에서 바로 확인 가능하게 한다.
- 기존 import, source monitor, insert/overwrite, timeline drop 계산 로직은 유지한다.

변경 파일:

- `src/app/editor/page.tsx`
- `src/electron/renderer/media-bin-panel.tsx`
- `src/electron/renderer/media-drop-helpers.ts`
- `src/electron/renderer/timeline-track-row.tsx`
- `tests/e2e/editor-media-import-grid.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src\app\editor\page.tsx src\electron\renderer\media-bin-panel.tsx src\electron\renderer\media-drop-helpers.ts src\electron\renderer\timeline-track-row.tsx tests\e2e\editor-media-import-grid.spec.ts`
- `npx playwright test ./tests/e2e/editor-media-import-grid.spec.ts --project=chromium --grep "imports media then drags the media card directly onto an audio timeline lane"`

결과:

- ESLint 통과
- media import -> audio lane drag feedback E2E: 1 passed

완료정의 반영:

- Media Bin panel은 `data-asset-dragging`, `data-dragging-asset-id`로 현재 drag 상태를 노출한다.
- drag 중인 asset card/handle은 `data-dragging`, `data-drag-active`로 직접 조작 상태를 노출한다.
- timeline asset drop preview는 `data-drop-mode`, `data-drop-operation`, `data-drop-ripple`로 insert/drop/ripple 상태를 노출한다.
- timeline edit guide는 asset drop operation, duration, ripple metadata를 노출한다.

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 17. 2026-06-20 Timeline Multi-select Group Move Feedback Pass

목적:

- multi-select group move 중 사용자가 같이 이동하는 clip 묶음을 바로 확인 가능하게 한다.
- 기존 group move 계산, commit, undo/redo 흐름은 유지한다.

변경 파일:

- `src/app/editor/page.tsx`
- `src/electron/renderer/editor-view-model.ts`
- `src/electron/renderer/timeline-edit-preview-helpers.ts`
- `src/electron/renderer/timeline-clip-button.tsx`
- `src/electron/renderer/timeline-track-row.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src\app\editor\page.tsx src\electron\renderer\editor-view-model.ts src\electron\renderer\timeline-edit-preview-helpers.ts src\electron\renderer\timeline-clip-button.tsx src\electron\renderer\timeline-track-row.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test ./tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct multi-select group clip drag move"`

결과:

- ESLint 통과
- multi-select group move feedback E2E: 1 passed

완료정의 반영:

- dragged clip HUD는 group move 중 `data-hud-group-count`와 `2 clips` 형태의 표시를 제공한다.
- timeline lane은 group move ghost overlay를 표시한다.
- group overlay는 `data-preview-operation="group-move"`, group count, delta, start/end를 노출한다.
- group 안의 각 ghost clip은 preview start/duration을 노출한다.

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics

## 18. 2026-06-20 Program Monitor Operation Feedback Pass

목적:

- Program Monitor 직접 조작 중 move/scale/rotate/crop의 현재 작업과 draft 값을 화면에서 바로 확인 가능하게 한다.
- 기존 motion/crop draft, commit, cancel semantics는 유지한다.

변경 파일:

- `src/electron/renderer/program-transform-crop-overlays.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src\electron\renderer\program-transform-crop-overlays.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test ./tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct program monitor transform manipulation|supports direct program monitor crop corner manipulation"`

결과:

- ESLint 통과
- Program Monitor transform/crop feedback E2E: 2 passed

완료정의 반영:

- transform overlay는 조작 중 operation HUD와 draft position/scale/rotation을 노출한다.
- crop overlay는 조작 중 operation HUD와 draft crop left/right/top/bottom을 노출한다.
- scale, move, rotate, crop handle 조작 중 HUD가 실제로 화면에 보이는 것을 검증했다.

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics
## 19. 2026-06-20 Timeline Ripple Trim Impact Feedback Pass

목적:

- ripple trim 중 뒤따라 이동하는 clip 영향을 사용자가 드래그 중 직접 볼 수 있게 한다.
- 기존 ripple trim commit, undo/redo, export validation, render pipeline semantics는 유지한다.

변경 파일:

- `src/app/editor/page.tsx`
- `src/electron/renderer/editor-view-model.ts`
- `src/electron/renderer/timeline-track-row.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src\app\editor\page.tsx src\electron\renderer\editor-view-model.ts src\electron\renderer\timeline-track-row.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "shows ripple trim downstream impact while dragging a clip edge"`

결과:

- ESLint 통과
- ripple trim downstream impact E2E: 1 passed

완료정의 반영:

- Ripple 모드에서 clip edge trim 드래그 중 영향받는 downstream clip ghost가 timeline lane에 표시된다.
- ghost overlay는 operation, edge, delta, affected count, per-clip next start를 DOM 상태로 노출한다.
- release 후 실제 downstream clip start가 ripple trim preview 방향과 일치하게 변경되는 것을 검증했다.

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics
## 20. 2026-06-20 Timeline Multi-select Group Trim Pass

목적:

- multi-select 상태에서 edge trim이 anchor clip 하나가 아니라 선택된 clip group에 직접 반영되게 한다.
- ripple trim semantics는 유지하고, 일반 multi-select trim에만 group resize 코어를 연결한다.

변경 파일:

- `src/app/editor/page.tsx`
- `src/electron/renderer/editor-view-model.ts`
- `src/electron/renderer/timeline-edit-preview-helpers.ts`
- `src/electron/renderer/timeline-track-row.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src\app\editor\page.tsx src\electron\renderer\editor-view-model.ts src\electron\renderer\timeline-edit-preview-helpers.ts src\electron\renderer\timeline-track-row.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct multi-select group clip edge trim"`

결과:

- ESLint 통과
- multi-select group trim E2E: 1 passed

완료정의 반영:

- box-select로 여러 clip을 선택한 뒤 clip edge를 drag trim하면 선택된 clip들이 같은 delta로 함께 resize된다.
- drag 중 `timeline-group-trim-preview-*` overlay가 표시된다.
- overlay는 operation, edge, group count, delta, per-clip next duration을 DOM 상태로 노출한다.
- release 후 선택된 두 clip의 duration이 실제 timeline state에 반영되는 것을 검증했다.

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics
## 21. 2026-06-20 Timeline Slip / Roll / Slide Direct Manipulation Pass

목적:

- slip, roll trim, slide가 실제 마우스 modifier drag로 동작하는지 고정한다.
- 기존 precision edit commit, undo/redo, render/export semantics는 유지한다.

변경 파일:

- `src/electron/renderer/editor-view-model.ts`
- `src/electron/renderer/timeline-edit-preview-helpers.ts`
- `src/electron/renderer/timeline-clip-button.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `docs/EDITOR_BASE_SKELETON_COMPLETION_DEFINITION_KR.md`
- `docs/EDITOR_PRACTICAL_QUALITY_PASS_2026_06_20_KR.md`

검증:

- `npx eslint src\electron\renderer\editor-view-model.ts src\electron\renderer\timeline-edit-preview-helpers.ts src\electron\renderer\timeline-clip-button.tsx tests\e2e\editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test editor-program-monitor-direct-manipulation.spec.ts --project=chromium --grep "supports direct slip edit|supports direct roll trim|supports direct slide edit"`

결과:

- ESLint 통과
- slip/roll/slide 직접 조작 E2E: 3 passed

완료정의 반영:

- `Alt+clip drag`로 slip edit preview와 commit이 동작한다.
- `Alt+clip edge drag`로 roll trim preview와 commit이 동작한다.
- next clip이 있는 상태에서 `Shift+Alt+clip drag`로 slide edit preview와 commit이 동작한다.
- 조작 중 clip DOM/HUD에서 sourceIn 변화량을 확인할 수 있다.

건드리지 않은 영역:

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin/Extension system
- ComfyUI export validation semantics
