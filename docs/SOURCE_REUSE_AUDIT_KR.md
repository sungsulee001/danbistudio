# Source Reuse Audit KR

작성일: 2026-06-14  
상태: Phase 0/1 기준 문서. 실제 외부 코드 반입 전 반드시 이 문서를 먼저 갱신한다.

## 1. 결론

Danbi Studio Editor는 기능을 전부 새로 만들지 않는다. 호환성과 라이선스 문제가 없는 경우 OpenCut 계열 MIT 소스는 복제하거나 Danbi 구조에 맞게 수정해서 사용한다. Shotcut은 GPLv3이므로 Danbi main source에 직접 복사하지 않고, 구조와 동작을 참고해 clean-room 방식으로 재구현하거나 별도 GPL 경계가 있는 외부 프로세스로만 검토한다.

2026-06-14 현재 Danbi Studio repository에는 OpenCut Classic action registry, timeline snapping/placement, animation/keyframe, group move, group resize, waveform cache, preview frame cache, timeline transaction, storage recovery 패턴을 MIT 조건에 맞춰 adapted copy로 반입했다. Shotcut source file을 직접 복제한 기록은 없다.

## 2. 감사한 소스 스냅샷

| Source | URL | Local audit commit | License decision | Danbi decision |
| --- | --- | --- | --- | --- |
| OpenCut | https://github.com/opencut-app/opencut | `a5888e2087c125767a394dc7fe5b919ba503ae57` | MIT | 구조 방향 참고. 현재 rewrite scaffold라 즉시 복제 후보는 제한적이다. |
| OpenCut Classic | https://github.com/opencut-app/opencut-classic | `cf5e79e919144200294fb9fed22a222592a0aeea` | MIT | 실제 편집기 모듈 복제/수정 1순위 후보. |
| Shotcut | https://github.com/mltframework/shotcut | `9516f143e5c1e432d2088e91d2657c75bf6710e7` | GPLv3 | 직접 복사 금지. clean-room/reference only 또는 외부 GPL process 후보. |

2026-06-14 기준 세 mirror의 `origin`은 모두 공식 GitHub repository로 고정되어 있고, `HEAD`가 위 audit commit과 일치함을 확인했다.

2026-06-15 재검증 결과:

- `third_party/source-mirrors/opencut`, `third_party/source-mirrors/opencut-classic`, `third_party/source-mirrors/shotcut`은 `.gitignore`에 의해 Git 추적 대상에서 제외되어 있다.
- `git ls-files third_party/source-mirrors` 결과는 비어 있다.
- 세 mirror의 `HEAD`는 위 audit commit과 일치한다.
- `npm run license:check`가 통과했다.

감사 작업 폴더:

```text
C:\Users\danbi01\AppData\Local\Temp\danbi-source-audit\opencut
C:\Users\danbi01\AppData\Local\Temp\danbi-source-audit\opencut-classic
C:\Users\danbi01\AppData\Local\Temp\danbi-source-audit\shotcut
```

license 경계를 유지한 로컬 source mirror:

```text
third_party/source-mirrors/opencut
third_party/source-mirrors/opencut-classic
third_party/source-mirrors/shotcut
```

`third_party/source-mirrors/`는 `.gitignore`로 제외한다. 따라서 현재 mirror는 로컬 분석용이며 Danbi repository 배포물에 포함되지 않는다.

## 3. OpenCut main 평가

OpenCut main은 MIT이며 README 기준으로 Editor API, plugin-first architecture, Rust core, MCP server, headless mode, scripting tab 방향을 명시한다. 다만 현재 main branch는 rewrite 중심이라 Danbi가 당장 가져올 완성된 timeline/editor 모듈은 많지 않다.

Danbi 적용:

| Area | Import mode | Target | Priority | Decision |
| --- | --- | --- | --- | --- |
| Editor API 방향 | Reference / Adapted Copy | `src/electron/shared`, extension API | P2 | Danbi extension API 설계에 반영한다. |
| Plugin-first 구조 | Reference / Adapted Copy | `src/electron/renderer`, `src/electron/shared` | P2 | UI panel, command, render hook 구조 설계 참고. |
| MCP/headless 방향 | Reference | automation, ComfyUI 연동 | P3 | 기본 편집기 완성 후 자동화 단계에서 반영. |

## 4. OpenCut Classic 복제 후보

OpenCut Classic은 MIT이고 실제 web editor와 Rust/WASM core가 들어 있다. 공식 README에서도 `apps/web`, `apps/desktop`, `rust`, `docs` 구조를 설명하며, TypeScript와 Rust/WGSL 기반 구현이 확인된다.

복제/수정 후보:

| Candidate path | What to reuse | Import mode | Danbi target | Risk | Priority |
| --- | --- | --- | --- | --- | --- |
| `apps/web/src/actions/*` | action registry, keybindings, shortcut help, command definitions | Adapted Copy | `src/electron/shared`, `src/electron/renderer` | store/import alias 차이 | P1 |
| `apps/web/src/timeline/snapping/*` | snap point build, edge/playhead/marker snapping | Adapted Copy | timeline interaction helpers | Danbi timeline schema mapping 필요 | P1 |
| `apps/web/src/timeline/group-move/*` | grouped clip move and snap resolve | Adapted Copy | `src/lib/editor/timeline-group-move.ts` 반입 완료 | existing/new track move와 drop preview 연결 완료 | P1 |
| `apps/web/src/timeline/group-resize/*` | grouped trim/resize behavior | Adapted Copy | `src/lib/editor/timeline-group-resize.ts` 반입 완료 | 기존 trim command와 호환 유지 | P2 |
| `apps/web/src/timeline/placement/*` | drop/insert placement, overlap resolution | Adapted Copy | media-bin drag/drop, insert/overwrite | mixed video/audio file drop track compatibility routing 완료 | P1 |
| `apps/web/src/timeline/update-pipeline.ts`, `apps/web/src/core/managers/commands.ts` | timeline update pipeline, command history, undo/redo transaction | Adapted Copy | `src/lib/editor/timeline-transaction.ts` 반입 완료 | immutable project state로 변환 완료 | P1 |
| `apps/web/src/animation/*` | keyframe interpolation, bezier, value resolve, transform channels | Adapted Copy | `src/lib/editor/keyframe-interpolation.ts` 반입 완료 | effect parameter/bezier model은 후속 범위 | P1 |
| `apps/web/src/services/waveform-cache/service.ts` | waveform cache service pattern | Adapted Copy | `src/lib/editor/waveform-cache.ts` 반입 완료 | FFmpeg/runtime waveform pipeline과 호환 유지 | P2 |
| `apps/web/src/services/video-cache/service.ts` | video frame cache, seek generation, prefetch semantics | Adapted Copy | `src/lib/editor/preview-frame-cache.ts` 반입 완료 | 실제 decode는 Danbi preview worker/WebCodecs 경로에서 처리 | P2 |
| `apps/web/src/services/storage/*` | IndexedDB/OPFS persistence, migrations, quota, project ordering | Adapted Copy / Reference | `src/lib/editor/project-recovery.ts` 반입 완료 | actual browser storage adapter는 Danbi persistence 정책과 중복 | P3 |
| `apps/web/src/services/renderer/*` | canvas/GPU renderer, scene builder/exporter | Reference / Adapted Copy | preview/render parity | Danbi는 FFmpeg/Electron 중심이라 즉시 복제 위험 | P2 |
| `rust/crates/time/*` | media time, frame rate, timecode logic | Adapted Copy | future native core | Rust toolchain 도입 결정 필요 | P3 |
| `rust/crates/compositor`, `effects`, `gpu`, `masks` | GPU compositor, WGSL effects/masks | Reference / Submodule candidate | future GPU preview engine | WASM/Rust packaging 비용 큼 | P3 |

첫 반입은 `actions/*` 패턴으로 진행했고, 두 번째 반입은 `timeline/snapping/*`와 `timeline/placement/*` 패턴으로 진행했다. 세 번째 반입은 `animation/interpolation.ts`, `animation/resolve.ts`, `animation/types.ts` 패턴을 Danbi seconds 기반 keyframe resolver로 축소해 진행했다. 네 번째 반입은 `timeline/group-move/*` 패턴을 Danbi grouped/linked clip move resolver로 축소해 진행했다. 다섯 번째 반입은 `timeline/group-resize/*` 패턴을 Danbi grouped/linked trim clamp resolver로 축소해 진행했다. 여섯 번째 반입은 `services/waveform-cache/service.ts` 패턴을 Danbi persistent/runtime waveform resolver와 Promise cache로 축소해 진행했다. 일곱 번째 반입은 `services/video-cache/service.ts` 패턴을 Danbi preview frame cache와 seek-generation resolver로 축소해 진행했다. 여덟 번째 반입은 `timeline/update-pipeline.ts`와 `core/managers/commands.ts` 패턴을 Danbi immutable timeline transaction/history core로 축소해 진행했다. 아홉 번째 반입은 `services/storage/*` 패턴 중 project ordering, malformed skip, quota evaluation 방향을 Danbi project recovery index와 storage capacity check로 축소해 진행했다.

## 5. Shotcut 참고 후보

Shotcut은 GPLv3이고 MLT, Qt 6, FFTW, FFmpeg, Frei0r, SDL 의존성이 확인된다. Danbi가 GPL 배포로 전환하지 않는 한 Shotcut source file은 main source에 직접 복사하지 않는다.

참고/clean-room 후보:

| Candidate path | What to learn | Import mode | Danbi target | Priority |
| --- | --- | --- | --- | --- |
| `src/mltcontroller.*` | MLT adapter and engine boundary | Reference / External Process | future MLT/FFmpeg engine adapter | P2 |
| `src/jobs/*`, `src/jobqueue.*` | render/export job queue and diagnostics | Clean-room | render queue, cancel/retry/log | P2 |
| `src/proxymanager.*`, `src/transcoder.*` | proxy generation and transcode flow | Clean-room | media cache/proxy engine | P2 |
| `src/models/multitrackmodel.*` | multitrack model behavior | Clean-room | timeline state and project schema | P1 |
| `src/models/playlistmodel.*` | playlist/clip ordering | Clean-room | timeline track items | P2 |
| `src/models/markersmodel.*` | marker model and commands | Clean-room | marker/caption timeline annotations | P1 |
| `src/models/keyframesmodel.*` | keyframe editing model | Clean-room | keyframe editor | P1 |
| `src/models/attachedfiltersmodel.*` | filter attachment and parameter state | Clean-room | effects stack | P2 |
| `src/controllers/addonmetadataparser.*` | filter catalog metadata parsing | Clean-room | effect catalog and parameter UI | P2 |
| `src/commands/filtercommands.*`, `markercommands.*` | undoable command pattern | Clean-room | command reducer/history | P1 |

Shotcut의 가치는 “검증된 편집기 구조”다. 코드는 가져오지 않고, feature set과 module responsibility, render/job/proxy/filter model을 Danbi 문서와 테스트 기준으로 바꿔 구현한다.

## 6. 실제 반입 절차

외부 source file을 Danbi에 넣을 때는 아래 절차를 통과해야 한다.

1. `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`에 source, commit, license, import mode를 기록한다.
2. MIT 등 복제 가능한 license면 원본 notice를 보존한다.
3. 복제 파일 상단 또는 가까운 NOTICE 문서에 original file URL과 commit을 남긴다.
4. Danbi module boundary를 먼저 정한다.
5. 기존 기능이 깨지지 않도록 unit/e2e test를 추가하거나 기존 테스트를 갱신한다.
6. Shotcut GPL source는 이 절차로도 main source에 직접 반입하지 않는다. GPL 경계 결정을 별도로 해야 한다.

## 7. 다음 구현 순서

기능 추가를 재개할 때는 아래 순서로만 진행한다.

1. Shotcut multitrack/markers/keyframes/filter/job 구조는 clean-room checklist로 Danbi architecture 문서에 반영한다.
2. preview/render engine은 OpenCut renderer와 Shotcut/MLT 구조를 비교해 결정한다.
3. media cache/proxy persistence와 project package media bundle export/import 경로를 보강한다.

## 8. 근거 링크

- OpenCut main: https://github.com/opencut-app/opencut
- OpenCut Classic: https://github.com/opencut-app/opencut-classic
- Shotcut source: https://github.com/mltframework/shotcut
- Shotcut features: https://www.shotcut.org/features/
