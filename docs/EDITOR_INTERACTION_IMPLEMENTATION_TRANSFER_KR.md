# Editor Interaction Implementation Transfer

작성일: 2026-06-19

## 목적

Danbi Editor의 직접 조작 레이어를 화면 참고가 아니라 실행 가능한 편집기 소스의 구현 방식 기준으로 정리하고, 우선순위 PoC를 Danbi 기존 editor core에 연결한다.

이번 작업은 UI 모방이 아니다. OpenCut Classic의 상호작용 구현을 실행 확인한 뒤, 이벤트 흐름과 커밋 경계를 분석하고 Danbi용 adapter layer로 이식 가능한 구조만 추출했다.

## 실행 확인

대상 프로젝트: `E:\ai_tool\opencut-classic-ref`

실행 결과:

- 의존성 설치: `npx bun install` 성공
- Web editor 실행: `http://127.0.0.1:3021`
- Editor route 확인: `http://127.0.0.1:3021/editor/local-analysis`
- HTTP 확인: root 200, editor route 200

비고:

- 로컬 분석용 실행에서는 OpenCut 환경 변수 스키마를 만족시키기 위한 더미 값만 사용했다.
- Danbi에는 OpenCut 코드를 복붙하지 않았다.

## OpenCut 실제 구현 파일

| Interaction | 실제 구현 파일 | 핵심 역할 |
| --- | --- | --- |
| clip select | `apps/web/src/timeline/hooks/element/use-element-selection.ts` | 클릭/수정키 기반 선택 상태 변경 |
| clip body drag move | `apps/web/src/timeline/hooks/element/use-element-interaction.ts`, `apps/web/src/timeline/controllers/element-interaction-controller.ts`, `apps/web/src/timeline/group-move/*`, `apps/web/src/commands/timeline/element/move-elements.ts` | pointer capture, drag session, preview, command commit |
| clip edge trim/resize | `apps/web/src/timeline/hooks/use-timeline-resize.ts`, `apps/web/src/timeline/controllers/resize-controller.ts`, `apps/web/src/timeline/group-resize/compute-resize.ts` | edge별 resize session, snap/collision 계산, preview 후 commit |
| playhead drag/scrub | `apps/web/src/timeline/hooks/use-timeline-playhead.ts`, `apps/web/src/timeline/controllers/playhead-controller.ts`, `apps/web/src/timeline/controllers/seek-controller.ts` | ruler 좌표를 시간으로 변환하고 playback time 갱신 |
| timeline zoom/scroll | `apps/web/src/timeline/hooks/use-timeline-zoom.ts`, `apps/web/src/timeline/controllers/zoom-controller.ts` | wheel/gesture 기반 scale 변경과 scroll anchoring |
| monitor transform handles | `apps/web/src/preview/hooks/use-transform-handles.ts`, `apps/web/src/preview/controllers/transform-handle-controller.ts`, `apps/web/src/preview/components/transform-handles.tsx` | corner/edge/rotation handle session, transform preview, commit |
| monitor drag/select | `apps/web/src/preview/hooks/use-preview-interaction.ts`, `apps/web/src/preview/controllers/preview-interaction-controller.ts` | hit test, pending gesture, selected visual move, preview, commit |
| preview update | `apps/web/src/core/managers/timeline-manager.ts` | `previewElements`, `discardPreview`, `commitPreview`, overlay 적용 |
| undo/commit | `apps/web/src/commands/timeline/element/*.ts`, `apps/web/src/commands/timeline/tracks-snapshot.ts` | preview와 실제 command commit 분리 |

## Event Flow 요약

### 1. Clip Select

| 단계 | OpenCut 구현 흐름 | Danbi 매핑 |
| --- | --- | --- |
| pointer down | element hook/controller가 target element와 modifier 상태를 읽음 | `resolveTimelineClipSelectInteraction` adapter 호출 |
| move | 선택 자체는 move session과 분리 | 변경 없음 |
| preview state | 선택은 preview overlay가 아니라 editor selection state | 기존 `selectedClipIds`, `selectedClipId` 유지 |
| snap/collision | 없음 | 없음 |
| commit | selection store 갱신 | `setSelectedClipIds`, `setSelectedClipId`, 필요 시 playhead seek |
| undo | 선택은 편집 undo 대상이 아님 | 기존 동작 유지 |

### 2. Clip Body Drag Move

| 단계 | OpenCut 구현 흐름 | Danbi 매핑 |
| --- | --- | --- |
| pointer down | pointer capture, pending drag session 생성 | `beginTimelineClipBodyInteraction` |
| move | drag threshold 통과 후 delta 계산, preview 갱신 | `resolveTimelineClipBodyInteractionMove` 후 `resolveTimelineClipDragPreviewState` |
| preview state | `timeline.previewElements`로 임시 overlay | Danbi preview state로 `previewProject` 갱신 |
| snap/collision | group move 계산에서 snap/collision 적용 | 기존 `resolveTimelineClipMoveEdit` / preview helper 유지 |
| commit | pointer up에서 command 실행 | 기존 `commitProject` + `resolveTimelineClipDragCommitState` |
| undo | command stack | Danbi history commit 경로 유지 |

### 3. Clip Edge Trim/Resize

| 단계 | OpenCut 구현 흐름 | Danbi 매핑 |
| --- | --- | --- |
| pointer down | edge, resize mode, start geometry 저장 | `beginTimelineClipEdgeInteraction` |
| move | edge별 delta 계산, resize preview | `resolveTimelineClipEdgeInteractionMove` 후 `resolveTimelineClipTrimPreview` |
| preview state | preview overlay | Danbi `previewProject` |
| snap/collision | group resize 계산에서 유효 duration/neighbor 충돌 제한 | 기존 trim core validation 유지 |
| commit | pointer up에서 resize commit | 기존 `resolveTimelineClipTrimDragCommitPlan` + `commitProject` |
| undo | command stack | Danbi history commit 경로 유지 |

### 4. Playhead Scrub

| 단계 | OpenCut 구현 흐름 | Danbi 매핑 |
| --- | --- | --- |
| pointer down | ruler 좌표, scroll anchor, current time 저장 | `beginTimelineScrubInteraction` |
| move | coordinate to time 변환, clamp/frame snap | `resolveTimelineScrubInteractionMove` |
| preview state | playback current time 즉시 갱신 | `setPlayhead` |
| snap/collision | duration/frameRate 기준 clamp | 기존 scrub helper 유지 |
| commit | pointer up에서 최종 time 확정 | `resolveTimelineScrubInteractionEnd` |
| undo | playback seek는 편집 undo 대상 아님 | 기존 동작 유지 |

### 5. Import Timeline Drop

| 단계 | OpenCut 구현 흐름 | Danbi 매핑 |
| --- | --- | --- |
| pointer down | asset drag metadata 생성 | 기존 media drag state 유지 |
| move | drop target hover와 start time preview | 기존 drop preview 유지 |
| preview state | drop target preview | 기존 `resolveAssetTimelineDropPreviewPlan` |
| snap/collision | timeline coordinate + snap points | `resolveTimelineImportDropStart` |
| commit | drop 시 insert/add clip command | 기존 `resolveAssetTimelineDropCommitPlan` |
| undo | command/history | 기존 `commitProject` |

### 6. Monitor Transform Handles

| 단계 | OpenCut 구현 흐름 | Danbi 현재 상태 |
| --- | --- | --- |
| pointer down | corner/edge/rotation별 session 생성, pointer capture | Danbi 기존 monitor handle code가 있으나 별도 adapter 교체는 이번 PoC 범위 밖 |
| move | canvas 좌표 변환 후 scale/rotation/position preview | 별도 후속 adapter 대상 |
| preview state | `timeline.previewElements` | Danbi monitor preview state와 inspector sync 개선 필요 |
| snap/collision | canvas center/edge snap | 후속 대상 |
| commit | `commitPreview` | 후속 대상 |
| undo | command stack | 후속 대상 |

## Danbi Adapter Layer 설계

새 파일: `src/electron/renderer/timeline-interaction-adapter.ts`

설계 원칙:

- OpenCut 코드를 복붙하지 않는다.
- DOM event handler가 직접 계산을 흩뿌리지 않도록 `begin -> move -> commit-ready` 세션 함수를 둔다.
- Danbi의 기존 core 함수와 preview/commit 경로는 유지한다.
- 현재 PoC는 timeline 직접 조작만 대상으로 한다.
- ComfyUI, Automation, Render Worker, Plugin/Extension, Export validation 의미는 변경하지 않는다.

Adapter가 감싸는 기존 Danbi core:

| Danbi adapter 함수 | 기존 core/renderer 함수 |
| --- | --- |
| `beginTimelineClipBodyInteraction` | 기존 drag ref 초기화 로직 |
| `resolveTimelineClipBodyInteractionMove` | `timelinePointerDeltaSeconds`, `resolveTimelineClipDragPreviewState` |
| `beginTimelineClipEdgeInteraction` | 기존 trim ref 초기화 로직 |
| `resolveTimelineClipEdgeInteractionMove` | `timelinePointerDeltaSeconds`, `resolveTimelineClipTrimPreview` |
| `beginTimelineScrubInteraction` | `resolveTimelineRulerScrubStartPlan` |
| `resolveTimelineScrubInteractionMove` | `resolveTimelineRulerScrubMovePlan` |
| `resolveTimelineScrubInteractionEnd` | `resolveTimelineRulerScrubEndPlan` |
| `resolveTimelineImportDropStart` | `resolveTimelineDropStartPlan` |
| `resolveTimelineClipSelectInteraction` | `resolveTimelineClipClickSelection` |

## PoC 구현 범위

이번 PoC에서 연결한 항목:

- media import timeline drop start 계산
- timeline clip select
- clip body drag move
- clip edge trim/resize
- playhead ruler scrub
- program monitor visual move/scale/rotation 계산 adapter 분리

이번 PoC에서 의도적으로 제외한 항목:

- timeline zoom controller 교체
- 전체 command stack 교체
- OpenCut 전체 migration
- ComfyUI/Automation/Render/Plugin 관련 의미 변경

## Program Monitor 품질 패스

추가 파일: `src/electron/renderer/program-monitor-interaction-adapter.ts`

목적:

- Program Monitor transform overlay 내부에 흩어져 있던 move/scale/rotation 계산을 adapter로 분리한다.
- `pointer down -> threshold -> preview patch -> pointer up commit/cancel` 흐름을 테스트 가능한 단위로 고정한다.
- 기존 Motion effect, inspector, preview commit 경로는 유지한다.

Adapter가 담당하는 계산:

| Interaction | Adapter 함수 | 검증 항목 |
| --- | --- | --- |
| visual move | `beginProgramMonitorMoveInteraction`, `resolveProgramMonitorMoveInteractionMove` | drag threshold, canvas-space delta, center snap guide |
| corner scale | `beginProgramMonitorScaleInteraction`, `resolveProgramMonitorScaleInteractionMove` | rendered box diagonal 기반 scale delta |
| rotation | `beginProgramMonitorRotationInteraction`, `resolveProgramMonitorRotationInteractionMove` | visual center 기준 angle delta |

## 변경 파일

| 파일 | 변경 내용 |
| --- | --- |
| `src/electron/renderer/timeline-interaction-adapter.ts` | Danbi용 interaction adapter layer 추가 |
| `src/electron/renderer/program-monitor-interaction-adapter.ts` | Program Monitor move/scale/rotation adapter layer 추가 |
| `src/electron/renderer/timeline-clip-button.tsx` | clip body drag와 edge trim 이벤트가 adapter session을 사용하도록 연결 |
| `src/electron/renderer/program-transform-crop-overlays.tsx` | visual move/scale/rotation 이벤트가 Program Monitor adapter session을 사용하도록 연결 |
| `src/app/editor/page.tsx` | timeline drop, clip select, ruler scrub 계산을 adapter 경유로 변경 |
| `tests/lib/timeline-interaction-adapter.test.ts` | adapter 단위 테스트 추가 |
| `tests/lib/program-monitor-interaction-adapter.test.ts` | Program Monitor adapter 단위 테스트 추가 |
| `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts` | clip body drag move 직접 조작 e2e 추가 |
| `docs/EDITOR_INTERACTION_IMPLEMENTATION_TRANSFER_KR.md` | 실행 소스 분석, event flow, Danbi 매핑, PoC 범위 문서화 |

## 검증 결과

이번 변경과 연결된 범위만 실행했다.

| 명령 | 결과 |
| --- | --- |
| `npx vitest run tests/lib/timeline-interaction-adapter.test.ts` | 5 passed |
| `npx vitest run tests/lib/program-monitor-interaction-adapter.test.ts tests/lib/timeline-interaction-adapter.test.ts` | 10 passed |
| `npx eslint src/electron/renderer/timeline-interaction-adapter.ts src/electron/renderer/timeline-clip-button.tsx src/app/editor/page.tsx tests/lib/timeline-interaction-adapter.test.ts tests/e2e/editor-program-monitor-direct-manipulation.spec.ts tests/e2e/editor-media-import-grid.spec.ts` | passed |
| `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts tests/e2e/editor-media-import-grid.spec.ts --project=chromium` | 12 passed |
| `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium` | 11 passed |

## 판정

OpenCut의 검증된 패턴 중 Danbi에 바로 이식 가능한 핵심은 다음 구조다.

`pointer down -> session 생성 -> move preview -> pointer up commit -> undo/history`

Danbi는 이미 editor core와 history commit이 있으므로, 전체 편집기 이식이 아니라 interaction adapter layer로 직접 조작 경계를 정리하는 방향이 적합하다.

다음 우선순위는 monitor transform handles와 timeline zoom/scroll을 같은 adapter 구조로 분리하는 것이다.
