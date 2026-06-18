# Third Party Source Register KR

작성일: 2026-06-14  
상태: Phase 0 기준 문서. 외부 소스를 가져오기 전후에 반드시 갱신한다.

## 1. 목적

Danbi Studio Editor는 모든 기능을 처음부터 수작업으로 만들지 않는다. 호환성과 라이선스 문제가 없으면 OpenCut, Shotcut, MLT, FFmpeg 등 검증된 편집기/미디어 소스의 구조와 구현을 적극적으로 사용한다.

다만 “가져다 쓴다”는 말은 무조건 복사한다는 뜻이 아니다. 라이선스, 배포 의무, 기술 호환성, 테스트 가능성을 확인한 뒤 아래 방식 중 하나를 선택한다.

- Direct Copy: 코드를 Danbi Studio repository 안으로 그대로 복제한다.
- Adapted Copy: 일부 파일이나 알고리즘을 Danbi Studio 구조에 맞게 수정해 가져온다.
- Clean-room Reimplementation: 구조와 동작만 참고하고 코드는 새로 작성한다.
- External Process: 별도 실행 파일/process로 호출한다.
- Submodule/Package: 원본 license와 경계를 유지한 채 submodule 또는 dependency로 둔다.
- Reference Only: 설계 참고만 하고 코드는 가져오지 않는다.

상세 감사 결과는 [Source Reuse Audit KR](./SOURCE_REUSE_AUDIT_KR.md)에 기록한다.

## 2. 기본 원칙

- OpenCut 계열 MIT 코드는 복제 후보로 우선 검토한다.
- Shotcut GPLv3 코드는 Danbi Studio main source에 직접 복사하지 않는다.
- Shotcut 기능을 쓰려면 GPL 호환 배포, 별도 GPL process/submodule, clean-room 재구현 중 하나를 먼저 결정한다.
- Shotcut 경계 결정은 [Shotcut GPL Boundary KR](./SHOTCUT_GPL_BOUNDARY_KR.md)를 따른다.
- MLT/FFmpeg 계열은 library/binary/process 경계와 배포 license notice를 먼저 정한다.
- 가져온 코드에는 원본 URL, commit/tag, license, 수정 내용, 테스트 증거를 남긴다.
- 기능 구현 전 source reuse 가능성 검토를 먼저 한다.

## 3. 현재 실제 반입 상태

2026-06-14 현재 Danbi Studio 코드베이스에는 OpenCut Classic action registry, timeline snapping/placement, animation/keyframe, group move, group resize, waveform cache, preview frame cache, timeline transaction, storage recovery 패턴을 MIT 조건에 맞춰 adapted copy로 반입했다. Shotcut source file을 직접 복제한 기록은 없다.

현재 상태:

- OpenCut main: local audit와 source mirror 복제 완료. MIT. rewrite scaffold라 즉시 복제 후보는 제한적이다.
- OpenCut Classic: local audit와 source mirror 복제 완료. MIT. action registry, timeline snapping/placement, animation/keyframe logic, group move, group resize, waveform cache, preview frame cache, timeline transaction, storage recovery를 복제/수정 후보로 둔다.
- Shotcut: sparse local audit와 source mirror 복제 완료. GPLv3. main source 직접 복사는 금지하고 구조/기능 참고만 허용한다.
- MLT: 직접 통합 없음. 향후 render engine 또는 external process 후보.
- FFmpeg: command/process 기반 사용. 배포 packaging 때 binary license/build option 검증 필요.

## 4. Source별 정책

| Source | URL | License | 허용 방식 | 현재 상태 | 결정 |
| --- | --- | --- | --- | --- | --- |
| OpenCut | https://github.com/opencut-app/opencut | MIT | Direct Copy, Adapted Copy, Clean-room, Reference | audit 완료, commit `a5888e2087c125767a394dc7fe5b919ba503ae57` | API/plugin/headless 방향 참고 |
| OpenCut Classic | https://github.com/opencut-app/opencut-classic | MIT | Direct Copy, Adapted Copy, Clean-room, Reference | audit 완료, commit `cf5e79e919144200294fb9fed22a222592a0aeea` | 실제 복제/수정 1순위 후보 |
| Shotcut | https://github.com/mltframework/shotcut | GPLv3 | Reference Only, External GPL boundary, Clean-room | sparse audit 완료, commit `9516f143e5c1e432d2088e91d2657c75bf6710e7` | main source 직접 복사 금지 |
| MLT Framework | https://github.com/mltframework/mlt | LGPL-2.1 | External Process, Library/Submodule, Clean-room | 미반입 | render engine 후보 |
| FFmpeg | https://www.ffmpeg.org/legal.html | LGPL 2.1+ 기본, optional GPL component 가능 | External Process/Binary | command 기반 사용 | packaging 전 build/license audit 필요 |
| Frei0r plugins | https://frei0r.dyne.org/ | 확인 필요 | Package/External, Reference | 미반입 | 효과 plugin 후보, license 확인 필요 |

로컬 mirror 위치:

```text
third_party/source-mirrors/opencut
third_party/source-mirrors/opencut-classic
third_party/source-mirrors/shotcut
```

이 mirror들은 `.gitignore`로 제외되어 Danbi repository에는 포함되지 않는다.

## 5. OpenCut 계열 반입 후보

OpenCut main은 Editor API, plugin-first architecture, MCP server, headless mode, scripting tab 방향을 참고한다.

OpenCut Classic은 실제 편집기 모듈 반입 후보로 둔다.

| Candidate | Import mode | Danbi target | Priority |
| --- | --- | --- | --- |
| `apps/web/src/actions/*` | Adapted Copy | command registry, shortcuts, action palette | P1 |
| `apps/web/src/timeline/snapping/*` | Adapted Copy | timeline snap helper | P1 |
| `apps/web/src/timeline/placement/*` | Adapted Copy | media drop/insert placement | P1 |
| `apps/web/src/timeline/group-move/*` | Adapted Copy | grouped clip movement | P1 |
| `apps/web/src/timeline/group-resize/*` | Adapted Copy | grouped trim/resize | P2 |
| `apps/web/src/animation/*` | Adapted Copy | keyframe interpolation and transform resolve | P1 |
| `apps/web/src/services/waveform-cache/service.ts` | Adapted Copy | waveform cache | P2 |
| `apps/web/src/services/video-cache/service.ts` | Adapted Copy | preview frame cache / seek generation | P2 |
| `apps/web/src/timeline/update-pipeline.ts`, `apps/web/src/core/managers/commands.ts` | Adapted Copy | undoable timeline transaction / project history core | P1 |
| `apps/web/src/services/storage/*` | Adapted Copy / Reference | project/cache persistence, recovery index, quota check | P3 |
| `apps/web/src/services/renderer/*` | Reference / Adapted Copy | preview/render parity | P2 |
| `rust/crates/*` | Reference / Submodule candidate | future GPU compositor/native core | P3 |

## 6. Shotcut 참고 후보

Shotcut은 GPLv3이므로 다음 파일군은 직접 복사하지 않고 clean-room/reference only로만 쓴다.

| Candidate | Use | Import mode | Priority |
| --- | --- | --- | --- |
| `src/mltcontroller.*` | MLT adapter 구조 | Reference / External Process | P2 |
| `src/jobs/*`, `src/jobqueue.*` | render/job queue 구조 | Clean-room | P2 |
| `src/proxymanager.*`, `src/transcoder.*` | proxy/transcode 구조 | Clean-room | P2 |
| `src/models/multitrackmodel.*` | multitrack data model | Clean-room | P1 |
| `src/models/markersmodel.*` | marker model | Clean-room | P1 |
| `src/models/keyframesmodel.*` | keyframe model | Clean-room | P1 |
| `src/models/attachedfiltersmodel.*` | effect/filter attachment | Clean-room | P2 |
| `src/controllers/addonmetadataparser.*` | effect catalog metadata | Clean-room | P2 |
| `src/commands/filtercommands.*`, `markercommands.*` | undo command pattern | Clean-room | P1 |

## 7. 반입 기록 템플릿

```text
ID:
Date:
Source:
Source URL:
Commit/Tag:
License:
Original files:
Imported files:
Import mode: Direct Copy | Adapted Copy | Clean-room | External Process | Submodule/Package | Reference Only
Reason:
Modifications:
Danbi module:
Tests:
Notice required:
Reviewer notes:
Decision:
```

## 8. 실제 반입 기록

```text
ID: OPCUT-CLASSIC-ACTIONS-001
Date: 2026-06-14
Source: OpenCut Classic
Source URL: https://github.com/opencut-app/opencut-classic
Commit/Tag: cf5e79e919144200294fb9fed22a222592a0aeea
License: MIT
Original files:
- apps/web/src/actions/definitions.ts
- apps/web/src/actions/registry.ts
- apps/web/src/actions/types.ts
Imported files:
- src/lib/editor/command-registry.ts
- src/lib/editor/keyboard-map.ts
Import mode: Adapted Copy
Reason: Danbi command/shortcut/extension surface를 기능별 button handler가 아니라 중앙 command registry로 정리하기 위함.
Modifications:
- OpenCut의 action id/category/default shortcut 개념을 Danbi command id/group/key display 구조로 변환.
- 전역 mutable registry 대신 createEditorCommandRegistry() factory로 테스트 격리와 renderer/extension host 분리를 지원.
- Danbi timeline/export/project command id와 payload type을 추가.
Danbi module: src/lib/editor
Tests: npx vitest run tests/lib/editor-core.test.ts
Notice required: Yes. third_party/NOTICE.md에 MIT notice와 원본 파일 기록.
Reviewer notes: Shotcut GPL source는 사용하지 않음.
Decision: Accepted as MIT adapted copy.
```

```text
ID: OPCUT-CLASSIC-TIMELINE-SNAP-PLACE-001
Date: 2026-06-14
Source: OpenCut Classic
Source URL: https://github.com/opencut-app/opencut-classic
Commit/Tag: cf5e79e919144200294fb9fed22a222592a0aeea
License: MIT
Original files:
- apps/web/src/timeline/snapping/build.ts
- apps/web/src/timeline/snapping/resolve.ts
- apps/web/src/timeline/snapping/types.ts
- apps/web/src/timeline/placement/compatibility.ts
- apps/web/src/timeline/placement/overlap.ts
- apps/web/src/timeline/placement/resolve.ts
- apps/web/src/timeline/placement/types.ts
Imported files:
- src/lib/editor/timeline-snapping.ts
- src/lib/editor/timeline-placement.ts
- src/lib/editor/timeline.ts
- src/electron/renderer/media-drop-helpers.ts
- src/electron/renderer/timeline-edit-preview-helpers.ts
Import mode: Adapted Copy
Reason: Danbi timeline move/drop/insert workflows가 같은 snap point와 placement/collision 정책을 공유하게 하기 위함.
Modifications:
- OpenCut MediaTime/tick 기반 API를 Danbi seconds 기반 API로 변환.
- OpenCut SceneTracks/Element 모델을 Danbi EditorProject/TimelineTrack/TimelineClip 모델로 변환.
- main source 직접 복사가 아니라 Danbi schema에 맞춘 순수 계산 모듈로 재작성.
- Media file timeline drop now applies Danbi track compatibility routing for mixed video/audio batches: visual assets stay on the requested visual lane while pure audio files route to the active editable audio patch track before insert/overwrite commit.
Danbi module: src/lib/editor
Tests: npx vitest run tests/lib/editor-core.test.ts
Notice required: Yes. third_party/NOTICE.md에 MIT notice와 원본 파일 기록.
Reviewer notes: Shotcut GPL source는 사용하지 않음.
Decision: Accepted as MIT adapted copy.
```

```text
ID: OPCUT-CLASSIC-ANIMATION-001
Date: 2026-06-14
Source: OpenCut Classic
Source URL: https://github.com/opencut-app/opencut-classic
Commit/Tag: cf5e79e919144200294fb9fed22a222592a0aeea
License: MIT
Original files:
- apps/web/src/animation/interpolation.ts
- apps/web/src/animation/resolve.ts
- apps/web/src/animation/types.ts
Imported files:
- src/lib/editor/keyframe-interpolation.ts
- src/lib/editor/preview.ts
- src/lib/editor/timeline.ts
Import mode: Adapted Copy
Reason: preview, split, trim, range copy에서 쓰는 numeric keyframe interpolation을 하나의 순수 모듈로 통합해 편집 경계와 Program Monitor 값 계산의 일관성을 유지하기 위함.
Modifications:
- OpenCut MediaTime/tick 기반 channel API를 Danbi seconds 기반 ClipKeyframe API로 변환.
- OpenCut scalar/discrete/bezier channel 전체가 아니라 Danbi 범위인 hold/linear/smooth numeric keyframe resolver로 시작했고, 이후 Danbi 자체 구현으로 explicit easeIn/easeOut/easeInOut support를 확장.
- Program Preview style 계산과 timeline split/trim boundary keyframe 계산이 같은 resolver를 사용하도록 연결.
Danbi module: src/lib/editor
Tests: npx vitest run tests/lib/editor-core.test.ts
Notice required: Yes. third_party/NOTICE.md에 MIT notice와 원본 파일 기록.
Reviewer notes: Shotcut GPL source는 사용하지 않음.
Decision: Accepted as MIT adapted copy.
```

```text
ID: OPCUT-CLASSIC-GROUP-MOVE-001
Date: 2026-06-14
Source: OpenCut Classic
Source URL: https://github.com/opencut-app/opencut-classic
Commit/Tag: cf5e79e919144200294fb9fed22a222592a0aeea
License: MIT
Original files:
- apps/web/src/timeline/group-move/build-group.ts
- apps/web/src/timeline/group-move/resolve-move.ts
- apps/web/src/timeline/group-move/types.ts
Imported files:
- src/lib/editor/timeline-group-move.ts
- src/lib/editor/timeline.ts
- src/electron/renderer/timeline-edit-preview-helpers.ts
Import mode: Adapted Copy
Reason: selected/grouped/linked clip 이동이 anchor offset, collision clamp, target track overlap validation을 하나의 순수 resolver로 공유하게 하기 위함.
Modifications:
- OpenCut SceneTracks/Element/MediaTime 기반 group move model을 Danbi EditorProject/TimelineClip/seconds 기반으로 변환.
- existing track move/drop preview, same-track move clamp, and new track creation are all resolved through the shared Danbi group move resolver.
- renderer drag preview와 timeline commit 경로가 같은 group move resolver를 사용하도록 연결하고, lane 위/아래 drag는 새 track insert plan을 거쳐 `moveClipsToNewTrackAtTime`으로 commit한다.
Danbi module: src/lib/editor
Tests: npx vitest run tests/lib/editor-core.test.ts
Notice required: Yes. third_party/NOTICE.md에 MIT notice와 원본 파일 기록.
Reviewer notes: Shotcut GPL source는 사용하지 않음.
Decision: Accepted as MIT adapted copy.
```

```text
ID: OPCUT-CLASSIC-GROUP-RESIZE-001
Date: 2026-06-14
Source: OpenCut Classic
Source URL: https://github.com/opencut-app/opencut-classic
Commit/Tag: cf5e79e919144200294fb9fed22a222592a0aeea
License: MIT
Original files:
- apps/web/src/timeline/group-resize/compute-resize.ts
- apps/web/src/timeline/group-resize/types.ts
Imported files:
- src/lib/editor/timeline-group-resize.ts
- src/lib/editor/timeline.ts
- tests/lib/editor-core.test.ts
Import mode: Adapted Copy
Reason: selected/grouped/linked clip trim과 resize에서 minimum duration, source extent, neighbor collision bounds를 하나의 순수 resolver로 계산해 timeline.ts의 큰 trim clamp 로직을 분리하기 위함.
Modifications:
- OpenCut MediaTime/frame-rate 기반 resize delta 계산을 Danbi seconds 기반 EditorProject/TimelineClip 모델로 변환.
- OpenCut의 trimStart/trimEnd patch model 대신 Danbi 기존 trimTimelineClip 경로와 호환되도록 edge timeline time, anchor delta, update plan만 계산.
- 기존 clampClipTrimTime public API는 유지하되 내부 계산을 timeline-group-resize resolver로 위임.
Danbi module: src/lib/editor
Tests: npx vitest run tests/lib/editor-core.test.ts
Notice required: Yes. third_party/NOTICE.md에 MIT notice와 원본 파일 기록.
Reviewer notes: Shotcut GPL source는 사용하지 않음.
Decision: Accepted as MIT adapted copy.
```

```text
ID: OPCUT-CLASSIC-WAVEFORM-CACHE-001
Date: 2026-06-14
Source: OpenCut Classic
Source URL: https://github.com/opencut-app/opencut-classic
Commit/Tag: cf5e79e919144200294fb9fed22a222592a0aeea
License: MIT
Original files:
- apps/web/src/services/waveform-cache/service.ts
Imported files:
- src/lib/editor/waveform-cache.ts
- src/lib/editor/media-cache.ts
- src/lib/editor/preview-source.ts
- src/electron/renderer/audio-analysis-workflow-helpers.ts
- src/electron/renderer/timeline-source-helpers.ts
- src/electron/renderer/selected-clip-capabilities.ts
- src/lib/editor/media-bin.ts
- src/lib/editor/media-health.ts
- tests/lib/editor-core.test.ts
Import mode: Adapted Copy
Reason: persistent waveform cache, runtime waveform peaks, embedded video audio analysis readiness, and promise de-duplication rules를 하나의 editor-core module로 모으기 위함.
Modifications:
- OpenCut의 browser AudioBuffer/File/URL decoding service는 Danbi의 FFmpeg/runtime waveform pipeline과 충돌하지 않도록 직접 복사하지 않고 promise cache semantics만 TypeScript generic class로 축소.
- Danbi EditorAsset/MediaCacheManifest 기준으로 persistent waveform, runtime waveform, no waveform source를 판정하는 resolver 추가.
- audio asset뿐 아니라 `metadata.hasAudio !== false`인 video asset도 runtime waveform read request 대상에 포함.
- Media Bin, Media Health, selected clip capability, preview source, audio analysis helper가 같은 waveform resolver를 사용하도록 연결.
Danbi module: src/lib/editor
Tests: npx vitest run tests/lib/editor-core.test.ts
Notice required: Yes. third_party/NOTICE.md에 MIT notice와 원본 파일 기록.
Reviewer notes: Shotcut GPL source는 사용하지 않음.
Decision: Accepted as MIT adapted copy.
```

```text
ID: OPCUT-CLASSIC-VIDEO-CACHE-001
Date: 2026-06-14
Source: OpenCut Classic
Source URL: https://github.com/opencut-app/opencut-classic
Commit/Tag: cf5e79e919144200294fb9fed22a222592a0aeea
License: MIT
Original files:
- apps/web/src/services/video-cache/service.ts
Imported files:
- src/lib/editor/preview-frame-cache.ts
- src/lib/editor/preview-worker.ts
- tests/lib/editor-core.test.ts
Import mode: Adapted Copy
Reason: Program Monitor preview에서 stale seek, forward frame iteration, next-frame prefetch 상태를 하나의 editor-core module로 관리하기 위함.
Modifications:
- OpenCut의 Mediabunny Input/CanvasSink 직접 decoding은 Danbi에 반입하지 않고, seek generation과 cached current/next frame decision만 순수 TypeScript state resolver로 축소.
- browser File/Canvas 의존성은 제거하고 Danbi preview worker/WebCodecs/proxy preview 경로가 사용할 수 있는 frame cache planning API로 변환.
- `PreviewWorkerPlan`에 optional preview frame cache stats를 연결해 cache 상태와 pending request를 performance overlay가 설명할 수 있게 함.
Danbi module: src/lib/editor
Tests: npx vitest run tests/lib/editor-core.test.ts
Notice required: Yes. third_party/NOTICE.md에 MIT notice와 원본 파일 기록.
Reviewer notes: Shotcut GPL source는 사용하지 않음.
Decision: Accepted as MIT adapted copy.
```

```text
ID: OPCUT-CLASSIC-TIMELINE-TRANSACTION-001
Date: 2026-06-14
Source: OpenCut Classic
Source URL: https://github.com/opencut-app/opencut-classic
Commit/Tag: cf5e79e919144200294fb9fed22a222592a0aeea
License: MIT
Original files:
- apps/web/src/timeline/update-pipeline.ts
- apps/web/src/core/managers/commands.ts
Imported files:
- src/lib/editor/timeline-transaction.ts
- src/electron/renderer/project-history-controller.ts
- tests/lib/editor-core.test.ts
Import mode: Adapted Copy
Reason: renderer-local history 배열에 흩어진 undo/redo 처리를 editor-core transaction module로 분리하고, timeline clip patch/update를 serialized no-op 감지와 selection snapshot이 있는 command boundary로 묶기 위함.
Modifications:
- OpenCut의 mutable EditorCore/Command class 구조는 Danbi의 immutable EditorProject state에 맞춰 순수 함수형 transaction result로 변환.
- OpenCut update-pipeline의 "patch -> derive/enforce rule -> command history" 방향을 Danbi `updateClip` 규칙, project serialization no-op detection, changed clip diff로 축소.
- 기존 `project-history-controller` public API는 유지하되 내부 commit/undo/redo 계산을 `src/lib/editor/timeline-transaction.ts`로 위임.
Danbi module: src/lib/editor, src/electron/renderer
Tests: npx vitest run tests/lib/editor-core.test.ts
Notice required: Yes. third_party/NOTICE.md에 MIT notice와 원본 파일 기록.
Reviewer notes: Shotcut GPL source는 사용하지 않음.
Decision: Accepted as MIT adapted copy.
```

```text
ID: OPCUT-CLASSIC-STORAGE-RECOVERY-001
Date: 2026-06-14
Source: OpenCut Classic
Source URL: https://github.com/opencut-app/opencut-classic
Commit/Tag: cf5e79e919144200294fb9fed22a222592a0aeea
License: MIT
Original files:
- apps/web/src/services/storage/service.ts
- apps/web/src/services/storage/quota.ts
- apps/web/src/services/storage/types.ts
Imported files:
- src/lib/editor/project-recovery.ts
- src/electron/renderer/project-persistence-workflow-helpers.ts
- tests/lib/editor-core.test.ts
Import mode: Adapted Copy
Reason: database save, autosave, local fallback, package import 같은 여러 저장 source를 하나의 recovery candidate index로 정렬하고, project persistence 전 저장 용량 위험을 판단하기 위함.
Modifications:
- OpenCut의 IndexedDB/OPFS adapter 직접 구현은 Danbi의 SQLite/API/autosave/localStorage 구조와 맞지 않아 반입하지 않음.
- OpenCut storage service의 updatedAt 기반 project ordering, malformed entry skip, migration/recovery 사고방식을 Danbi `ProjectRecoveryCandidate` 정렬 규칙으로 축소.
- OpenCut quota evaluator의 required/available/reserve 판단을 Danbi project JSON byte-size capacity check로 변환.
Danbi module: src/lib/editor, src/electron/renderer
Tests: npx vitest run tests/lib/editor-core.test.ts
Notice required: Yes. third_party/NOTICE.md에 MIT notice와 원본 파일 기록.
Reviewer notes: Shotcut GPL source는 사용하지 않음.
Decision: Accepted as MIT adapted copy.
```

## 9. 다음 작업

다음 반입 후보:

1. Shotcut multitrack/markers/keyframes/filter/job 구조는 clean-room checklist로만 architecture 문서에 반영한다.
2. preview/render engine은 OpenCut renderer와 Shotcut/MLT 구조를 비교하되, GPL source 직접 복사는 하지 않는다.
3. media cache/proxy persistence와 project package media bundle export/import 경로를 보강한다.
