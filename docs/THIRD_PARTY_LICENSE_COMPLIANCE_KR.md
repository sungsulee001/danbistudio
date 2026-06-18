# Third Party License Compliance KR

작성일: 2026-06-14  
갱신일: 2026-06-15  
상태: 외부 오픈소스 mirror와 코드 반입을 위한 운영 규칙.

## 1. 현재 처리

외부 편집기 소스는 Danbi 앱 코드에 바로 섞지 않고 아래 위치에 별도 mirror로 복제했다.

공식 라이선스 확인 근거는 `docs/THIRD_PARTY_LICENSE_SOURCES_KR.md`에 기록한다.

외부 소스 반입 전 실제 작업 절차는 `docs/SOURCE_REUSE_INTAKE_CHECKLIST_KR.md`를 따른다. 이 체크리스트는 OpenCut/OpenCut Classic MIT 반입 절차와 Shotcut GPLv3 금지 경계를 작업 순서로 고정한다.

```text
third_party/source-mirrors/opencut
third_party/source-mirrors/opencut-classic
third_party/source-mirrors/shotcut
```

`third_party/source-mirrors/`는 `.gitignore`에 등록되어 Danbi repository 배포물에는 포함되지 않는다. 즉 mirror 자체는 “로컬 분석용 source mirror”다. Danbi main source에 들어가는 외부 파생 코드는 별도 register entry와 notice를 남긴다.

mirror의 origin, audit commit, license file, 허용 사용 방식, 배포 경계는 `third_party/source-mirrors.lock.json`에 고정한다. 이 lock 파일은 Git에 추적하고, 실제 mirror clone은 Git에 추적하지 않는다.

`source-mirrors`는 Git submodule도 아니다. OpenCut/OpenCut Classic/Shotcut 복제본은 분석과 라이선스 확인을 위한 로컬 clone으로만 유지한다. 본체 빌드, Electron bundle, 테스트 입력, runtime import, 정적 `public/` 런타임 파일, package script가 이 mirror를 직접 참조하면 안 된다.

Danbi Studio 본체의 최종 배포 라이선스는 아직 선택하지 않았다. 그래서 root `package.json`은 `private: true`, `license: "UNLICENSED"`로 유지한다. 이 설정은 npm 공개 배포를 막기 위한 안전장치이며, OpenCut/OpenCut Classic에서 반입한 MIT notice 보존 의무는 계속 유지한다.

## 2. Source별 규칙

| Source | License | Local mirror | Allowed use |
| --- | --- | --- | --- |
| OpenCut | MIT | `third_party/source-mirrors/opencut` | 구조 참고, 직접 복제, 수정 복제 가능. 반입 시 MIT notice 보존 필수. |
| OpenCut Classic | MIT | `third_party/source-mirrors/opencut-classic` | 실제 편집기 모듈 복제/수정 1순위. 반입 시 원본 file, commit, license 기록 필수. |
| Shotcut | GPLv3 | `third_party/source-mirrors/shotcut` | 직접 복사 금지. reference only, clean-room 재구현, 또는 별도 GPL process 경계에서만 사용. |

## 3. MIT 코드 반입 규칙

OpenCut/OpenCut Classic 파일을 Danbi 코드로 가져올 때는 다음을 지킨다.

1. `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`에 원본 URL, commit, 원본 파일, Danbi 대상 파일을 기록한다.
2. 원본 MIT license notice를 보존한다.
3. 직접 복제 파일 또는 가까운 NOTICE 문서에 원본 출처를 남긴다.
4. Danbi 구조에 맞게 수정한 내용과 테스트를 기록한다.
5. 반입 후 `git diff --check`와 관련 unit/e2e test를 통과시킨다.

## 4. GPLv3 Shotcut 처리 규칙

Shotcut은 오픈소스지만 GPLv3이다. 따라서 Danbi가 GPL 호환 배포로 전환하지 않는 한 Shotcut source file을 `src/`, `app/`, `electron/`, `lib/`, 정적 런타임 `public/` 등 Danbi runtime source에 직접 복사하지 않는다.

세부 경계 결정은 [Shotcut GPL Boundary KR](./SHOTCUT_GPL_BOUNDARY_KR.md)를 따른다. 기준 파일 경로는 `docs/SHOTCUT_GPL_BOUNDARY_KR.md`다. 공식 저장소 기준 판정과 로컬 mirror audit commit은 [Third Party License Decision Log KR](./THIRD_PARTY_LICENSE_DECISION_LOG_KR.md)에 기록한다.

허용되는 방식:

- Reference Only: 구조, feature set, 동작을 읽고 Danbi 쪽에서 새로 설계한다.
- Clean-room Reimplementation: Shotcut 코드를 복붙하지 않고 Danbi 타입/테스트 기준으로 새로 구현한다.
- External GPL Process: 별도 실행 파일 또는 submodule/process 경계를 만들고 GPL 의무를 별도로 충족한다.

금지되는 방식:

- Shotcut `.cpp`, `.h`, `.qml`, `.js` 파일을 Danbi source tree나 정적 런타임 `public/`에 그대로 복사.
- Shotcut 함수/클래스 구현을 이름만 바꿔서 붙여 넣기.
- GPL notice/source 제공 정책 없이 Shotcut 기반 코드를 packaged Danbi 앱에 포함.

## 5. 현재 Danbi 상태

2026-06-14 현재:

- OpenCut/OpenCut Classic/Shotcut mirror는 로컬에 복제되어 있다.
- Danbi main source에는 OpenCut Classic action registry, timeline snapping, timeline placement, keyframe interpolation, group move, group resize, waveform cache, preview frame cache, timeline transaction, storage recovery 패턴을 MIT adapted copy로 반입했다.
- 반입 기록은 `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`의 `OPCUT-CLASSIC-ACTIONS-001`, `OPCUT-CLASSIC-TIMELINE-SNAP-PLACE-001`, `OPCUT-CLASSIC-ANIMATION-001`, `OPCUT-CLASSIC-GROUP-MOVE-001`, `OPCUT-CLASSIC-GROUP-RESIZE-001`, `OPCUT-CLASSIC-WAVEFORM-CACHE-001`, `OPCUT-CLASSIC-VIDEO-CACHE-001`, `OPCUT-CLASSIC-TIMELINE-TRANSACTION-001`, `OPCUT-CLASSIC-STORAGE-RECOVERY-001` 항목에 있다.
- OpenCut Classic의 추가 MIT 모듈을 가져오려면 먼저 register entry를 추가해야 한다.
- Shotcut은 구조 분석과 clean-room checklist 작성에만 사용한다.
- 2026-06-15 ProRes 422 HQ intermediate export 작업은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 구현이다. 따라서 `third_party/NOTICE.md`에 새 notice를 추가하지 않고, Shotcut GPL source는 계속 reference-only 경계에 둔다.
- 2026-06-15 precision slide keyboard e2e 작업은 OpenCut/Shotcut source를 새로 복제하지 않은 기존 Danbi timeline 구현 검증이다. 따라서 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 precision slip/roll Inspector e2e와 undo/redo selection 유지 작업은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 구현 및 기존 MIT adapted transaction module 수정이다. 기존 `OPCUT-CLASSIC-TIMELINE-TRANSACTION-001` notice 범위 안의 유지보수이며 새 notice/register 항목은 추가하지 않는다.
- 2026-06-15 clip lock e2e 작업은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 UI 검증이다. 기존 timeline lock/move 구현을 테스트한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 track mute/solo Program Monitor e2e와 track toggle 접근성 보강은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 UI/testability 작업이다. `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 track mute/solo FFmpeg render-plan parity test는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 렌더 검증이다. 기존 render engine의 playback policy를 테스트한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 track lock playback semantics 수정은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 정책 수정이다. locked track을 preview/render에서 제외하지 않도록 한 편집기 기본 동작 보정이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 export manifest/preflight playback parity 수정은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 manifest 정책 보정이다. muted/solo track은 실제 export 대상에서 제외하고 locked track은 export/preflight 대상에 유지하는 내부 정책 수정이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 preview worker video-thumbnail frame delivery 수정은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 worker 계약 보강이다. video layer와 image decode source를 분리한 내부 구현이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Electron smoke script는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 release 검증 보강이다. `dist-electron` bundle에서 source mirror/GPL marker를 검사하고 smoke mode로 IPC/preload 경계를 확인하는 도구이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Electron package/release scripts는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 배포 검증 보강이다. Next standalone renderer와 electron-builder `win-unpacked` 산출물, smoke result JSON, `resources/renderer/standalone/node_modules/next` 포함 여부를 검증하며 `third_party/source-mirrors`를 package input으로 연결하지 않는다. 새 런타임 소스 반입이 아니므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Electron runtime diagnostics와 FFmpeg discovery는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 배포 안정성 보강이다. `FFMPEG_PATH`/`FFPROBE_PATH`, packaged resource 후보, PATH 실행 파일을 탐색하고 userData/log/crash path를 노출하는 내부 진단 코드이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 sample project/tutorial pack은 OpenCut/Shotcut source나 외부 미디어를 복제하지 않는다. FFmpeg lavfi 합성 영상/오디오와 Danbi 자체 project JSON/tutorial text를 release 시 생성해 package import/edit/export를 검증하므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 packaged Electron GUI smoke와 Open sample UI 연결은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 release 검증 보강이다. 패키지 리소스의 synthetic sample package를 preload IPC diagnostics로 찾아 기존 Electron project package import 경로를 호출하므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 packaged Electron GUI render smoke는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 Electron dialog/renderer/FFmpeg queue 검증 보강이다. `DANBI_ELECTRON_AUTOMATION_SAVE_FILE_PATH`는 테스트용 저장 경로 override일 뿐이며, GUI `Render` 버튼에서 생성된 MP4를 확인하는 self-authored automation이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Source panel V/A patch target selector는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 편집 워크플로 보강이다. 기존 Danbi track model과 source patch helper를 UI에서 직접 선택 가능하게 연결한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Source Monitor range rail I/O handle trim은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 Source Monitor 조작성 보강이다. 레일 좌표를 프레임 단위 source time으로 변환하고 최소 1프레임 range를 유지하는 내부 helper/UI 연결이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Inspector Precision Trim step frames는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 정밀 편집 UI 보강이다. 기존 slip/roll/slide/J-L cut helper에 사용자 지정 frame step을 연결한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Program audio meter readout은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 오디오 미터 보강이다. waveform peak를 program output dB/headroom/hot/clipping 상태로 해석하는 내부 helper와 renderer 표시 변경이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Program audio analyzer preview is Danbi-owned waveform analysis/UI work. It derives RMS, crest, stereo balance, mono compatibility, density, and energy-band readouts from existing waveform peaks and live low/mid/high FFT bands from the browser Web Audio `AnalyserNode` API without copying OpenCut/Shotcut source or bundling third-party DSP code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-17 Audio render preflight warnings are Danbi-owned export-readiness work. They reuse the existing Danbi waveform analyzer and Program preview stack to raise channel-balance, dense-compression, and mono-compatibility warnings before FFmpeg queueing without copying OpenCut/Shotcut source or bundling third-party DSP code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-17 Preview/render parity warning deduplication is Danbi-owned export-readiness logic. It removes duplicate sample-time warnings for issues already represented by the Danbi export-graph feature matrix without copying OpenCut/Shotcut source or bundling third-party analysis code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-17 Compact issue-list hidden-count summaries are Danbi-owned renderer UI work. They add a small shared helper for Export Preflight, Preview/Render Parity, and Media Health panels without copying OpenCut/Shotcut source or bundling third-party UI code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-17 Command Palette result-count summaries are Danbi-owned renderer UI work. They extend the existing command registry resolver with total/visible/hidden search counts and UI labels without copying OpenCut/Shotcut source or bundling third-party search/palette code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 Render worker daemon/fleet discovery, manual remote daemon enrollment, automatic least-loaded worker routing, WebSocket status streaming, local run scheduling, and run lease metadata are Danbi-owned controller/client/daemon work. They probe the existing local daemon `/status` endpoint across deterministic candidate URLs plus user-entered remote daemon URLs, summarize selectable worker statuses, choose a live submission target from queued/running/capacity status, implement the small daemon-wide WebSocket `/events` stream, queue submitted runs behind `--max-runs`, and report lease timestamps without copying OpenCut/Shotcut source or bundling third-party discovery/WebSocket/scheduler libraries, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-16 Render worker zero-config LAN discovery is Danbi-owned Node UDP code in `src/electron/main/render-worker-discovery.ts`. The daemon answers `--discovery` probes with minimal worker URL/authRequired metadata, Electron main exposes probing through existing preload IPC, and the renderer still verifies workers through the authenticated `/status` path. This adds no third-party discovery library and does not copy OpenCut/Shotcut source, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 Clip gain dB Inspector editing은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 오디오 편집 UI 보강이다. 기존 clip volume multiplier와 FFmpeg volume filter 경로에 dB 변환 helper를 연결한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Multi-band EQ audio cleanup preset is Danbi-owned editor effect work. It adds local `audioEffect` parameters, Inspector controls, and FFmpeg `equalizer` filter mapping without copying OpenCut/Shotcut source or bundling new third-party DSP code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 Spectral repair audio cleanup preset is Danbi-owned editor effect work. It maps local repair parameters to built-in FFmpeg `highpass`, `afftdn`, `equalizer`, and `lowpass` filters without copying OpenCut/Shotcut source or bundling new third-party DSP code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 Timeline source-range waveform display는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 타임라인 표시 보강이다. 기존 waveform peak cache 값을 clip `sourceIn`/duration/speed/reverse 기준으로 표시용 slice/downsample하는 helper를 추가한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Embedded-audio video waveform strip은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 타임라인 표시 보강이다. 기존 timeline waveform helper에 embedded audio 표시 조건을 추가한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Timeline volume envelope overlay는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 타임라인 표시 보강이다. 기존 clip volume/keyframe 데이터를 표시용 polyline으로 변환한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Timeline opacity envelope overlay는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 타임라인 표시 보강이다. 기존 clip opacity/keyframe 데이터를 표시용 polyline으로 변환한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Keyframe ease-in/ease-out/ease-in-out support는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 keyframe 보강이다. 기존 MIT adapted keyframe interpolation module을 Danbi 제품 기준에 맞게 확장한 유지보수이며 `third_party/NOTICE.md`와 source register 새 항목은 필요하지 않다.
- 2026-06-15 Timeline envelope easing sampling은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 타임라인 표시 보강이다. 기존 volume/opacity envelope helper가 Danbi keyframe interpolation 결과를 중간 샘플로 표시하도록 확장한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Media Bin usage-count sort/status display는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 미디어 관리 보강이다. 기존 asset reference count와 Media Bin filter/sort helper를 확장한 내부 구현이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Import routing for SRT/WebVTT sidecars는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 import workflow 보강이다. subtitle sidecar를 FFmpeg media 분석 대상에서 분리하고 기존 caption parser/import core에 연결한 내부 구현이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Timeline viewport render-window filtering은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 renderer workflow 보강이다. scroll viewport와 selected clip state를 사용해 offscreen clip DOM 렌더링을 줄이는 내부 UI helper 변경이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Caption render preflight는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 export 품질 보강이다. caption timing/text/overlap/project-duration 조건을 검사하는 순수 helper와 preflight aggregation 변경이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Caption word timing project schema validation은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 project JSON 계약 보강이다. STT word object의 start/end/text/confidence, caption range 포함 여부, 단어 순서와 겹침 여부를 검증하는 내부 validator 변경이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Caption style project schema validation은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 project JSON 계약 보강이다. font size, #rrggbb color, box/shadow toggle, opacity, offset, position, align 값을 검증하는 내부 validator 변경이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Clip effect and title-style project schema validation은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 project JSON 계약 보강이다. effect id/type/label/enabled/parameters 공통 계약과 text clip title-style effect의 style parameter를 검증하는 내부 validator 변경이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Automation/plugin/export profile project schema validation은 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 project JSON 계약 보강이다. automation provider/trigger/target/parameter, plugin permission/contribution, export profile container/codec/dimension/fps/bitrate/preset/CRF 값을 검증하는 내부 validator 변경이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Export profile container/codec compatibility와 WebM Opus render command는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 export 계약 보강이다. container별 codec allowlist와 FFmpeg audio encoder 선택을 내부 helper/render plan에 추가한 것이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 Export profile compatibility render preflight는 OpenCut/Shotcut source를 새로 복제하지 않은 Danbi 자체 export 실행 경계 보강이다. container/codec 불일치를 source `profile` blocked issue로 변환해 direct/queue/headless render 전에 차단하는 내부 preflight 변경이므로 `third_party/NOTICE.md`와 source register 갱신 대상이 아니다.
- 2026-06-15 FFmpeg/FFprobe binary license boundary를 별도 문서로 고정했다. 현재 Danbi는 FFmpeg/FFprobe binary를 repository나 Electron package input에 동봉하지 않고 외부 process로만 호출한다. 향후 binary를 동봉하려면 `docs/FFMPEG_BINARY_LICENSE_BOUNDARY_KR.md`와 `third_party/FFMPEG_BINARY_NOTICE.md`에 version, checksum, configure line, LGPL/GPL mode, source offer, `--enable-gpl`/`--enable-nonfree` 상태를 먼저 기록해야 한다.
- 2026-06-15 Source reuse intake checklist를 추가했다. 이후 OpenCut/OpenCut Classic MIT 코드를 새로 반입할 때는 register entry, MIT notice, adapted-source header, 테스트 증거를 먼저 또는 동시에 남기고, Shotcut GPLv3 코드는 reference only, clean-room, external GPL process 경계 밖으로 넘기지 않는다.

- 2026-06-15 Electron native file/package path hardening is Danbi-owned IPC security work. It rejects unsafe shell file-action paths and package filename escapes in main-process code without copying OpenCut/Shotcut source, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 Render output path safety hardening is Danbi-owned FFmpeg IPC/security work. It rejects null-byte and URL/protocol output targets in shared preflight and Electron main render execution without copying OpenCut/Shotcut source, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 ComfyUI URL allowlist and output filename hardening is Danbi-owned local automation security work. It adds localhost/default remote allowlist checks and output directory escape prevention without copying OpenCut/Shotcut source, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 STT speaker embedding diarization refinement is Danbi-owned transcript/schema/clustering work. It adds optional embedding vector handling and deterministic cosine clustering without copying OpenCut/Shotcut source or bundling an acoustic model, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-16 STT speaker encoder preset manifest discovery is Danbi-owned process-boundary glue. It only locates a user-provided or packaged `danbi-speaker-encoder.json` command template and does not bundle a voiceprint model, encoder binary, or third-party STT code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-16 ComfyUI workflow plugin manifest support is Danbi-owned preset metadata handling. It reads project/plugin `comfyUIWorkflows` declarations, validates primitive parameters and required node type names, and routes those presets into existing ComfyUI dry-run/execution payloads without importing external plugin files, copying ComfyUI workflow templates from third parties, or bundling model/node code. `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-17 Model-backed AI effect pass presets are Danbi-owned metadata and FFmpeg filter tuning over completed user/ComfyUI pass media. They add restoration-detail, segmentation-matte, and beauty-retouch defaults plus Inspector controls without bundling model weights, inference runtimes, third-party workflow templates, or external plugin files, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-16 FCPXML Danbi metadata preservation is Danbi-owned interchange glue. It serializes sanitized Danbi clip effects, keyframes, incoming transitions, and Danbi-only outgoing transitions into `data-danbi-*` XML attributes for Danbi round-trip restoration without copying FCPXML templates, Apple sample code, OpenCut source, or Shotcut source, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-17 Visual FX soft glow, advanced bloom, motion trails, optical-flow motion blur, and film grain are Danbi-owned preset metadata and FFmpeg filter wiring over the existing `filter` effect contract. They use the already-declared FFmpeg runtime and do not add third-party source, media, LUTs, or model assets, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-17 Program Monitor RGB Parade video scope extension is Danbi-owned RGBA sampling and overlay UI work. It derives per-channel histogram and waveform arrays from the already sampled frame data without copying OpenCut/Shotcut source or bundling third-party scope/DSP code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 Built-in extension registry hardening is Danbi-owned plugin runtime/schema/UI work. It adds entry, permission, and contribution checks for existing built-in fixtures without loading external plugin files or copying OpenCut/Shotcut source, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 External plugin sandbox policy is Danbi-owned plugin host/UI work. It classifies project plugin manifests into trusted built-in, reviewed external command, manifest-only external, or blocked runtime states and exposes declared APIs/status without importing external plugin files or copying OpenCut/Shotcut source, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 External plugin sandbox runner is Danbi-owned process-boundary work. It bundles a local TypeScript sandbox entry, spawns a separate Node process, validates manifest JSON, and executes only reviewed built-in sandbox commands such as `danbi.external.inspectManifest`, sanitized-snapshot `danbi.external.analyzeTimeline`, sanitized-export-profile `danbi.external.analyzeExports`, sanitized-effect-plan `danbi.external.planEffects`, and sanitized-transition-plan `danbi.external.planTransitions` without importing external plugin files or copying OpenCut/Shotcut source. The follow-up effect/transition-plan reader/apply paths and bounded parameter override contracts are also Danbi-owned project transformation code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 Plugin-authored effect/transition parameter schema validation is Danbi-owned manifest and plan-boundary work. It extends the local project JSON schema and reviewed external plan application checks without importing plugin files or copying OpenCut/Shotcut source, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 Reviewed external analyzer/exporter custom payload filters are Danbi-owned sandbox API work. They add scope/profile/severity filtering and request/coverage metadata to sanitized snapshot analyzers without importing plugin files or copying OpenCut/Shotcut source, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-15 Reviewed external exporter output manifest planning, handoff materialization, exporter writer declarations, writer-process runner, Plugins panel approve/review/block controls, and approved-command fingerprint audit are Danbi-owned sandbox/API work. `danbi.external.planExports` builds safe relative output manifests from sanitized export profile data, `danbi.external.writeExports` writes reviewed `.danbi-export.json` plus batch handoff JSON files under safe `exports/` paths from Electron main, plugin manifest `exporterWriters` only stores command metadata/trust state, project history stores user trust decisions and command fingerprints, and `npm run editor:external-exporter` can run a trusted declaration or user-supplied writer executable against those handoffs with output verification and JSON reports. This does not import plugin files into Danbi, copy OpenCut/Shotcut source, or bundle third-party writer code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-16 Title/caption style packs are Danbi-owned preset metadata over the existing `CaptionStyle` contract. They add local color/box/shadow/position presets and Inspector buttons without copying OpenCut/Shotcut source or bundling third-party templates/assets, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-16 Free creator templates are Danbi-owned timeline scaffold metadata. They generate editable local title clips, captions, markers, and ComfyUI draft placeholders without copying OpenCut/Shotcut source or bundling third-party media/template assets, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-16 Shared Asset Library is Danbi-owned reusable text asset metadata stored as project `EditorAsset` entries. It does not bundle stock footage, music, image packs, fonts, OpenCut source, or Shotcut source, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-16 Webhook automation hardening is Danbi-owned local automation security work. It adds explicit execution, allowlist/API-token-gated delivery, scoped environment bearer secrets, request body redaction, timeout, and retry policy without copying OpenCut/Shotcut source or bundling third-party automation templates, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-16 Optional cloud sync is Danbi-owned local folder sync work. It writes Danbi portable project packages and manifest/index JSON files into a user-selected sync folder without linking OneDrive/Google Drive/Dropbox SDKs, copying OpenCut/Shotcut source, or bundling third-party cloud code, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-16 Next standalone release artifact hygiene is Danbi-owned release-boundary work. The release prune strips development/source artifacts such as `.git`, `.env`, `.logs`, `.next/dev`, `.next/diagnostics`, `.next/types`, `src`, `third_party`, `dist-electron`, `package-lock.json`, dev logs, and release config files from standalone renderer output, sanitizes standalone `package.json` to a runtime-only `server.js` start entry, and scrubs build-root paths from `server.js`. This does not add or copy third-party source; `npm run license:check` now also verifies existing standalone release artifacts and `.nft.json` traces for these boundaries.
- 2026-06-17 Fresh Windows evidence package reporting and import verification are Danbi-owned release tooling. They write and verify a JSON report for the already-generated evidence ZIP, sidecar, MP4, result JSON, handoff manifest, and checksum fingerprints without copying OpenCut/Shotcut source or bundling third-party QA tooling, so `third_party/NOTICE.md` and source register updates are not required.
- 2026-06-18 Packaged Electron userData storage fixes, native media import automation for install smoke, sample project renderPath evidence checks, and Local Installed-App Acceptance reporting are Danbi-owned runtime/release tooling. They do not copy OpenCut/Shotcut source, bundle third-party media, add third-party QA tooling, or change FFmpeg binary bundling policy, so `third_party/NOTICE.md` and source register updates are not required.

## 6. 자동 검사

`npm run license:check`는 다음 조건을 강제한다.

- 필수 license 문서와 `third_party/NOTICE.md`가 존재한다.
- `docs/SOURCE_REUSE_INTAKE_CHECKLIST_KR.md`가 OpenCut/OpenCut Classic MIT 반입 절차와 Shotcut GPLv3 처리 절차를 포함한다.
- `third_party/source-mirrors.lock.json`의 schema, origin URL, audit commit, license file, 허용 사용 방식, GPL 금지 조건이 존재하고 일관된다.
- root `package.json`과 `package-lock.json`이 `private: true`, `license: "UNLICENSED"` 상태를 유지한다.
- `third_party/source-mirrors/`가 `.gitignore`, `tsconfig.json`, `vitest.config.ts`에서 제외되어 있다.
- 각 source mirror 경로가 실제 `git check-ignore` 기준으로 무시되고, Git 추적 대상이나 `.gitmodules` submodule로 등록되지 않는다.
- `package.json` scripts가 `third_party/source-mirrors/`를 직접 실행/번들 대상으로 연결하지 않는다.
- OpenCut, OpenCut Classic, Shotcut mirror의 공식 GitHub `origin`, audit commit, license 파일 핵심 문구가 일치한다.
- OpenCut Classic MIT adapted copy 파일은 source, commit, license header와 NOTICE/register 기록을 갖는다.
- 실제 MIT adapted-source 파일과 단순 연동 파일을 구분한다. 실제 외부 구현을 품은 파일은 `Adapted from`, source URL, commit, `License: MIT`, `third_party/NOTICE.md`, source register 경로를 파일 헤더에 둔다. 단순 호출/통합 파일은 NOTICE/register에 기록하되 파일 전체를 외부 소스처럼 표시하지 않는다.
- Danbi runtime source(`src/`, `public/`)에서 `OpenCut`을 언급하는 파일은 MIT adapted-source header와 NOTICE/register 링크를 갖는다.
- Shotcut/GPL 원본 흔적은 Danbi runtime source(`src/`, `public/`)에 들어오지 않는다.
- FFmpeg/FFprobe binary를 동봉하지 않는 현재 상태는 `third_party/FFMPEG_BINARY_NOTICE.md`의 `Bundled status: none`으로 기록한다.
- tracked project tree에 FFmpeg/FFprobe 실행 파일이 들어오면 `third_party/FFMPEG_BINARY_NOTICE.md`에 `Bundled status: present`, version, checksum, configure line, license mode, source offer를 기록해야 한다.
- `.next/standalone` 또는 `release/electron/win-unpacked/resources/renderer/standalone` 산출물이 존재하면 `.git`, `.env`, `.danbi`, `src`, `scripts`, `tests`, `third_party`, source mirror, private-key trace, dev dependency, project script, build-root path가 남아 있지 않은지 검사한다.
