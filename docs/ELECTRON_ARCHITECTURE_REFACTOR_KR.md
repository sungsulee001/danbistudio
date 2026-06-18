# Danbi Studio Electron Architecture Refactor

작성일: 2026-06-14

## 목표

기능 추가를 멈추고 현재 편집기 코드를 Electron 전환이 가능한 구조로 재배치한다. 이번 단계의 범위는 동작 유지와 모듈 경계 정리이며, CapCut/Shotcut/Filmora급 기능 확장은 다음 단계로 미룬다.

## 참고 저장소

검증일: 2026-06-14. GitHub HEAD 기준으로 구조만 참고했고, 라이선스가 다른 구현 코드는 복사하지 않는다. 2026-06-15 기준 OpenCut/OpenCut Classic/Shotcut source mirror의 origin, audit commit, license file, 허용 사용 방식, 배포 경계는 `third_party/source-mirrors.lock.json`과 `npm run license:check`로 고정한다.

### Shotcut

- 저장소: https://github.com/mltframework/shotcut
- 확인 기준 HEAD: `9516f143e5c1e432d2088e91d2657c75bf6710e7`
- 관찰한 구조:
  - `src/controllers`: filter/scope 같은 기능 제어 계층
  - `src/docks`: timeline, jobs, filters, export 등 편집 패널 계층
  - `src/models`: multitrack, playlist, keyframes, markers, subtitles 등 상태/모델 계층
  - `src/qml`: QML UI modules/views/filters/scopes/extensions
  - `src/jobs`: 장시간 작업 큐 계층
- 적용한 원칙:
  - UI, 모델, 컨트롤러, job 실행을 한 파일에 합치지 않는다.
  - render/export/job은 UI와 분리된 실행 엔진을 둔다.
  - GPLv3 코드이므로 소스 복사는 하지 않고 구조 패턴만 참고한다.

### OpenCut

- 현재 리라이트 저장소: https://github.com/opencut-app/opencut
- 확인 기준 HEAD: `a5888e2087c125767a394dc7fe5b919ba503ae57`
- 관찰한 구조:
  - `apps/web`: 웹 앱 패키지
  - README의 방향: Editor API, plugin-first architecture, Rust core, MCP server, headless automation
- classic 저장소: https://github.com/opencut-app/opencut-classic
- 확인 기준 HEAD: `cf5e79e919144200294fb9fed22a222592a0aeea`
- 관찰한 구조:
  - `apps/web`: Next.js editor UI
  - `apps/desktop`: desktop shell
  - `rust/crates`: compositor, effects, gpu, masks, time, bridge
  - `apps/web/src/timeline`, `preview`, `rendering`, `project`, `media`, `commands`, `services`
- 적용한 원칙:
  - web/desktop shell과 editor core를 분리한다.
  - renderer UI는 commands/services/core API를 통과한다.
  - plugin-first와 headless automation을 IPC/API 계약으로 준비한다.

## 현재 문제

- `src/app/editor/page.tsx`가 렌더러 UI, 상태 타입, 브라우저 미디어 I/O, preview helper를 함께 가진다.
- Next API route가 FFmpeg plan/preflight/render orchestration을 직접 조립했다.
- 프로젝트 JSON, timeline state, IPC, extension API 계약이 명시적 계층으로 분리되어 있지 않았다.
- Electron main/preload/renderer/shared 경계가 없어 desktop shell 전환 시 UI 코드와 Node 실행 코드가 섞일 위험이 있었다.

## 새 폴더 구조

```text
src/electron/
  index.ts
  main/
    ffmpeg-render-engine.ts
    headless-render-engine.ts
    index.ts
    ipc-handlers.ts
    native-dialog-service.ts
    native-media-import-engine.ts
    project-package-engine.ts
    project-store-adapter.ts
  preload/
    editor-api.ts
    index.ts
  renderer/
    ai-queue-workflow-helpers.ts
    automation-hooks-client.ts
    automation-hooks-workflow-helpers.ts
    audio-analysis-workflow-helpers.ts
    caption-workflow-helpers.ts
    clip-audio-link-workflow-helpers.ts
    clip-clipboard-workflow-helpers.ts
    clip-create-workflow-helpers.ts
    clip-edit-workflow-helpers.ts
    clip-move-workflow-helpers.ts
    clip-precision-edit-workflow-helpers.ts
    clip-split-trim-workflow-helpers.ts
    editor-form-controls.tsx
    editor-panel-title.tsx
    editor-ipc-client.ts
    editor-keyboard-dispatcher.ts
    editor-media-client.ts
    editor-system-client.ts
    editor-system-workflow-helpers.ts
    editor-time-helpers.ts
    editor-top-toolbar.tsx
    editor-view-model.ts
    effect-workflow-helpers.ts
    comfyui-client.ts
    comfyui-result-review-panel.tsx
    comfyui-review-helpers.ts
    export-delivery-settings-panel.tsx
    export-job-status-panels.tsx
    export-preflight-panel.tsx
    export-settings-panel.tsx
    export-workspace-panel.tsx
    export-workflow-helpers.ts
    inspector-analysis-panels.tsx
    inspector-command-panels.tsx
    inspector-effects-panel.tsx
    inspector-media-panels.tsx
    inspector-motion-panels.tsx
    inspector-sidebar-panels.tsx
    inspector-controls.tsx
    index.ts
    media-cache-client.ts
    media-bin-workflow-helpers.ts
    media-cache-workflow-helpers.ts
    media-drop-helpers.ts
    media-bin-panel.tsx
    media-health-cache-panels.tsx
    marker-workflow-helpers.ts
    media-workspace-helpers.ts
    playback-workflow-helpers.ts
    program-audio-graph-controller.tsx
    program-caption-title-overlays.tsx
    program-composite-preview.tsx
    program-media-layer-preview.tsx
    program-monitor-overlays.tsx
    program-preview-stage.tsx
    program-review-workspace-helpers.ts
    program-transform-crop-overlays.tsx
    project-history-controller.ts
    project-persistence-client.ts
    project-persistence-workflow-helpers.ts
    project-session-workspace-helpers.ts
    project-settings-workflow-helpers.ts
    project-workspace-panels.tsx
    preview-worker-controller.ts
    preflight-issue-helpers.ts
    render-client.ts
    render-status-panel.tsx
    scene-readout-panel.tsx
    selected-clip-capabilities.ts
    selected-clip-workspace-helpers.ts
    sidebar-workflow-panels.tsx
    source-asset-range-panel.tsx
    source-edit-workflow-helpers.ts
    source-monitor.tsx
    stt-client.ts
    timeline-clip-button.tsx
    timeline-clip-list.tsx
    timeline-context-menu.tsx
    timeline-edit-preview-helpers.ts
    timeline-gap-workflow-helpers.ts
    timeline-mark-workflow-helpers.ts
    timeline-selection-helpers.ts
    timeline-source-helpers.ts
    timeline-track-row.tsx
    timeline-transport-ruler.tsx
    timeline-state-adapter.ts
    timeline-viewport-helpers.ts
    timeline-workspace-helpers.ts
    track-workflow-helpers.ts
  shared/
    extension-api.ts
    index.ts
    ipc-contract.ts
    project-schema.ts
    timeline-state.ts
```

## 모듈 역할

### `shared/ipc-contract.ts`

Project package export/import, native directory dialog, native save-file dialog, native file open/reveal, and native media import IPC contracts are defined here as shared request/response types. The shared layer owns the contract; main implements filesystem copying/native dialogs/file actions/media import, preload exposes typed calls, and renderer code does not import Node filesystem or Electron APIs.

Electron main/preload/renderer가 공유하는 IPC 채널과 request/response 타입을 정의한다. 프로젝트 CRUD, timeline snapshot, render plan/preflight/direct/queue/job, extension list/invoke 채널을 포함한다.

### `shared/project-schema.ts`

프로젝트 JSON parse/stringify/migrate/validate 경계를 제공한다. 기존 `src/lib/editor/project-store.ts`를 감싸서 Next API와 Electron IPC가 같은 스키마 계약을 사용하게 한다.

### `shared/timeline-state.ts`

`EditorProject`에서 renderer/extension이 읽을 수 있는 순수 `TimelineStateSnapshot`을 만든다. track, clip, marker, caption, asset usage를 구조화하며 UI와 render engine에 종속되지 않는다.

### `shared/extension-api.ts`

plugin manifest, permission, contribution, extension context, invocation contract를 분리한다. 내장 extension fixture runtime을 제공해 `plugin-ffmpeg-renderer`와 `plugin-comfyui-bridge`가 command와 `before-render` hook을 등록한다. Electron IPC `extension:list/invoke`는 이 runtime을 통해 manifest 권한을 확인하고 command를 실행한다. 외부 plugin file loader는 아직 열지 않고, sandbox policy와 process-isolated handshake/ reviewed command runner로 동적 코드 실행 전 보안/라이선스 경계를 별도 검증한다.

Implementation note 2026-06-16: External plugin exporter writer package execution now has a verified handoff and install boundary. `runtimePackage` metadata is validated in shared project/sandbox code, exposed in the renderer Plugins panel, preserved in `external-exporter-handoff-writer.ts`, and verified by `external-exporter-runner.ts` before process spawn. The runner checks package root containment, entry membership, regular files, byte counts, and `sha256-` digests, and blocks tampered packages without calling the writer. `plugin-package-installer.ts` reads local `danbi-plugin-package.json` folders, verifies plugin manifest signatures and package file hashes, copies safe `plugins/`/`tools/` package files into the Electron package root, and saves the updated project through typed IPC exposed by the Plugins panel. `plugin-signing-readiness.mjs` is wired into release preparation so development builds record signer readiness while production channel builds require active non-development RSA public-key material, `plugin-signing-keygen.mjs` creates ignored private/public material for rotation, `plugin-signing-rotation-drill.mjs` rehearses retiring/active/revoked/expired production readiness scenarios without writing private keys, `plugin-package-sign.mjs` signs package manifests while refreshing package/runtimePackage file metadata and rejecting unsafe private-key custody, and `plugin-signing-custody-audit.mjs` gates release preparation against private-key body/path leaks in release-bound outputs. External plugin file imports remain closed; installed packages are executed only through reviewed sandbox commands and trusted packaged writer handoffs.

### `main/ffmpeg-render-engine.ts`

Direct and queued render requests preserve caller-provided `outputPath` values so Electron save-file selections flow into FFmpeg plans. When no explicit path is supplied, the renderer uses durable local output storage served through `/outputs/...` instead of writing release outputs into packaged public assets.

Direct, queued, API preflight, and headless render paths now merge Node-side output filesystem access checks from `server/editor/render-output-access.ts` into the shared render preflight report before FFmpeg starts. Invalid target directories, unwritable output files, and container/extension mismatches surface as `output` blocked issues instead of late FFmpeg failures.

Direct render and queued render now run extension `before-render` hooks before FFmpeg plan/job creation and preserve the hook run snapshot on direct render responses or render job snapshots. Headless render dry-run also executes the same hook path so UI, Electron IPC, and CLI automation share extension pre-render evidence.

FFmpeg plan, preflight, direct render, queued render, render job list/get/cancel/retry를 한 엔진으로 묶는다. 기존 Next API route와 미래 Electron main IPC handler가 같은 엔진을 호출한다.

### `main/headless-render-engine.ts`

Headless batch render CLI support. It loads raw project JSON or portable `.danbi-project.json` packages, resolves selected/all export profiles, builds collision-safe profile-specific output paths, supports dry-run preflight, and delegates actual rendering to `main/ffmpeg-render-engine.ts` so CLI automation and UI rendering share the same FFmpeg behavior.

### `main/electron-app.ts`

Actual Electron desktop bootstrap. It creates the `BrowserWindow`, loads the Next `/editor` renderer URL, attaches the bundled preload file, enforces context isolation with no node integration, registers IPC handlers, and wires native dialog/file/media/project services into the main process. In packaged mode it starts the internal standalone renderer server before opening the editor, so the desktop app is not tied to an external `localhost:3000` development server.

Implementation note 2026-06-15: `DANBI_ELECTRON_SMOKE=1` runs the same Electron main bundle without opening a window. The smoke path waits for Electron readiness, validates the bundled preload path, registers the IPC handlers with an isolated smoke user-data directory, prints a pass marker, and quits. `npm run electron:smoke` builds the Electron bundles, checks for blocked third-party source markers, and launches this smoke mode.

Implementation note 2026-06-15: `npm run electron:package:smoke` prepares Next standalone output, copies release static/public assets, starts the packaged renderer server through Electron smoke mode, builds `release/electron/win-unpacked` with electron-builder, checks that the standalone `next` dependency was copied into `resources/renderer/standalone/node_modules`, and runs the generated `Danbi Studio.exe` with a smoke result JSON file.

Implementation note 2026-06-15: Electron startup now initializes a desktop runtime directory under userData before IPC registration. The runtime creates `logs`, `crashDumps`, `projects`, `packages`, `renders`, and `temp`, sets Electron's app log and crash dump paths where available, writes `logs/main-process.jsonl`, and exposes the snapshot through `editor:system:diagnostics`.

### `main/packaged-renderer-server.ts`

Packaged renderer host for the desktop release. It resolves `.next/standalone/server.js` from development, explicit env override, or `process.resourcesPath/renderer/standalone/server.js` in packaged builds; finds a local port; starts the standalone Next server with `ELECTRON_RUN_AS_NODE=1`; waits until `/editor` responds; and exposes a stop handle so Electron quits without leaving the renderer server alive.

### `main/ffmpeg-discovery.ts`

FFmpeg/FFprobe setup boundary for desktop and packaged runtime. It checks explicit `FFMPEG_PATH`/`FFPROBE_PATH`, packaged `resources/ffmpeg`, `resources/bin`, app/cwd `bin`, and PATH candidates, runs `-version` with a timeout, records selected executables, applies selected paths to `process.env`, and can attach encoder capabilities for diagnostics and render planning.

### `main/runtime-diagnostics.ts`

Desktop runtime diagnostics boundary. It resolves local data paths from Electron userData, creates log/crash/project/package/render/temp directories, writes main-process JSONL diagnostic events, records uncaught exception/unhandled rejection summaries, resolves packaged getting-started sample package candidates, and builds the `DanbiRuntimeDiagnosticsSnapshot` returned by preload IPC, the Settings Runtime Diagnostics panel, and smoke result JSON. The renderer system client also exposes native open/reveal actions for diagnostic paths through the existing file bridge.

### `main/sample-project-pack.ts`

Release sample project boundary. It generates license-safe synthetic FFmpeg media, imports the media through the native media import path, builds thumbnail/proxy/waveform cache, exports a portable `project.danbi-project.json` plus `tutorial.md`, and verifies the packaged copy by importing it, applying a title edit, and rendering the edited project through the Electron FFmpeg engine. `prepare-electron-release.mjs` writes the pack under `.danbi/electron-release/samples/getting-started`, electron-builder copies it to `resources/samples/getting-started`, and `npm run electron:gui-smoke` opens that package through the packaged Projects panel, builds the Export Plan, clicks the GUI render button, waits for the queued FFmpeg job to complete, and verifies the rendered MP4 file.

### `main/native-dialog-service.ts`

Electron native directory/save-file selection adapter. The module accepts Electron-like `showOpenDialog`/`showSaveDialog` dependencies, converts Danbi's shared dialog requests into native dialog options, and returns typed canceled/directory or canceled/filePath responses. Tests can inject a fake dialog without importing Electron. Packaged GUI smoke can set `DANBI_ELECTRON_AUTOMATION_SAVE_FILE_PATH` to bypass the OS save dialog while still exercising the renderer button, preload IPC, main dialog boundary, queued render engine, and FFmpeg output path preservation.

### `main/native-file-service.ts`

Electron native file action adapter. The module accepts an Electron-like `shell.openPath/showItemInFolder` dependency, opens rendered files or reveals them in the OS file manager, returns typed success/error responses, and keeps shell access out of renderer code.

Implementation note 2026-06-15: Native file actions now validate renderer-provided paths in main before touching Electron shell APIs. The bridge rejects empty paths, relative paths, null-byte paths, URL schemes, and shell protocol strings; only absolute filesystem paths reach `shell.openPath` or `shell.showItemInFolder`.

### `main/native-media-import-engine.ts`

Electron native media import engine. It opens an Electron-like multi-file dialog, copies selected local media into durable import storage (`.danbi/imports` in local development or `userData/imports` in the packaged app), runs the same ffprobe analysis used by the browser upload API, optionally queues media-cache work, and returns the same imported media record shape used by the renderer import workflow.

### `main/project-package-engine.ts`

Electron-only project package writer/reader. It writes a folder package with `project.danbi-project.json` and copied `media/` files from bundle-ready manifest entries, reports missing/failed copies, and imports the package by rewriting bundled media paths to the package folder. Browser JSON export remains in `renderer/project-persistence-client.ts`; filesystem copying stays in main.

Implementation note 2026-06-15: Project package import/export now resolves `packageFileName` through a shared main-process guard. Custom package file names must be leaf file names inside the selected package directory, so `../`, absolute path, and separator-based escapes cannot write or read outside the package folder.

### `main/native-project-repository.ts`

Electron file-backed project repository. It stores migrated editor project JSON under the Electron user-data project directory, lists projects from file metadata, supports load/save/delete without Next/Prisma, and feeds the same project repository interface used by IPC handlers.

### `main/ipc-handlers.ts`

Electron `ipcMain.handle`에 연결 가능한 handler map을 만든다. 실제 Electron dependency를 직접 import하지 않고 `ElectronIpcMainLike` 인터페이스를 사용해 테스트 가능하게 유지한다.

### `main/project-store-adapter.ts`

프로젝트 저장소를 Electron main에서 교체 가능한 repository interface로 추상화한다. 현재 Next/Prisma 저장소와 미래 로컬 파일/SQLite 저장소를 같은 형태로 연결할 수 있다.

### `preload/editor-api.ts`

`ipcRenderer.invoke` 같은 invoke 함수를 받아 `window.danbiEditor`에 노출할 수 있는 typed API를 만든다. Electron package가 없어도 타입/테스트가 가능하다.

### `preload/electron-preload.ts`

Actual Electron preload entry. It binds `ipcRenderer.invoke` to `createEditorPreloadApi` and exposes the typed `window.danbiEditor` bridge through `contextBridge`.

### `renderer/editor-ipc-client.ts`

renderer에서 preload API를 가져오거나 mock invoke로 client를 만들 수 있는 경계다.

### `renderer/automation-hooks-client.ts`

Automation hook plan 실행 API 호출을 page에서 분리한다. manual/on-import/before-export/on-gap 이벤트는 이 모듈을 통해 Next route로 전달되며, 추후 Electron preload IPC나 headless automation runner로 바꾸기 쉬운 경계가 된다.

### `renderer/automation-hooks-workflow-helpers.ts`

Before-export hook request planning and prepared export project fallback selection also live here. `page.tsx` still runs the API call and applies React state, but it no longer hardcodes the before-export event/context/options shape.

Automation hook 실행 결과의 status 우선순위와 후속 상태 적용 판단을 `page.tsx`에서 분리했다. queued ComfyUI job, local action commit label/applied project, webhook execution summary, prepared action count, hook failure status를 React state나 browser I/O 없이 계산한다. 실제 API 호출은 `automation-hooks-client.ts`가 맡고, 실제 project mutation 반영은 page shell의 기존 commit 함수가 맡는다.

### `renderer/ai-queue-workflow-helpers.ts`

ComfyUI/STT polling eligibility is now resolved here, so `page.tsx` keeps the fetch intervals but no longer owns queued/running status checks for AI jobs.

ComfyUI batch queue와 STT caption queue의 start/retry/cancel/polling/failure 상태, ComfyUI clip binding/preset command plan, result import/replace 가능 여부, STT import/issue selection/cleanup/speaker diarization selection/result/failure 상태 계산을 `page.tsx`에서 분리했다. API 호출과 editor core mutation은 기존 client와 `src/lib/editor`에 남기고, queue job view model과 selected clip command를 화면 상태로 해석하는 규칙은 이 helper가 담당한다.

### `renderer/audio-analysis-workflow-helpers.ts`

Runtime waveform preload request selection and runtime peak map merging now live here as pure renderer workflow decisions. `page.tsx` keeps the browser audio read effect, but it no longer owns the rules for which audio assets need peak reads or how successful peak reads are merged.

Silence removal과 beat detection command의 반복 판단을 `page.tsx`에서 분리했다. 선택 clip 없음, 기존 beat plan 재사용, beat 결과 없음 차단, silence/beat 분석 결과와 실패 status 문구를 React state나 DOM 접근 없이 계산한다. 브라우저에서 읽은 runtime waveform peak를 프로젝트 asset cache 모양으로 주입하는 패치도 이 모듈에서 계산하고, 실제 silence/beat editor core mutation은 기존 `src/lib/editor` 함수가 맡는다.

### `renderer/caption-workflow-helpers.ts`

Caption editor command 판단을 `page.tsx`에서 분리했다. caption selection validity, speaker draft, speaker 적용, playhead 이동, nudge, spacing tighten, style patch target, selection toggle, jump, split, merge, delete plan과 caption sidecar import failure status를 React state 없이 계산하고, 실제 caption mutation은 기존 `src/lib/editor/timeline.ts` core 함수가 맡는다.

Caption sidecar import result planning also lives here: empty import status, commit label, imported captions, next selected caption ids, warning-aware success status, and failure status are computed without React state. `page.tsx` keeps file reading/parsing and only applies the returned plan through `importCaptionSegments`.

### `renderer/clip-audio-link-workflow-helpers.ts`

Audio link command 판단을 `page.tsx`에서 분리했다. embedded audio detach, detached audio relink, linked V/A unlink, manual V/A link, waveform sync/link command label, next selection, sync option, success/failure status 문구를 React state나 DOM 접근 없이 계산한다. 실제 detach/relink/unlink/link/sync mutation은 기존 `src/lib/editor/timeline.ts`와 `src/lib/editor/audio-sync.ts` core 함수가 맡는다.

### `renderer/clip-clipboard-workflow-helpers.ts`

Timeline clipboard command 판단을 `page.tsx`에서 분리했다. 선택 clip copy/cut, attribute copy/paste, clipboard paste at playhead/In point, append target time, commit label, status 문구를 React state 없이 계산하고, 실제 clip 복제/삭제/붙여넣기 mutation은 기존 `src/lib/editor/timeline.ts` core 함수가 맡는다.

### `renderer/clip-create-workflow-helpers.ts`

Created title/adjustment clip selection now includes Program Monitor activation state, so `page.tsx` applies clip id, track id, and active monitor from one selection result.

Title clip과 adjustment layer 생성 후 selection/state 판단을 `page.tsx`에서 분리했다. title target track, 생성된 clip selection, adjustment layer range/status, title text/style patch validation과 commit label을 React state 없이 계산한다. 실제 title/adjustment clip 생성과 title mutation은 기존 `src/lib/editor/timeline.ts`와 `src/lib/editor/adjustment-layer.ts` core 함수가 맡는다.

### `renderer/clip-edit-workflow-helpers.ts`

Selected clip edit command decisions are separated from `page.tsx`. This helper resolves delete/group/ungroup/arrange/duplicate validation, single clip edit and selected clips patch plans, expanded target clip ids, commit labels, normalized arrange gaps, duplicated selection state, and status text without React state or DOM access. Actual timeline mutation stays in `src/lib/editor/timeline.ts`.

### `renderer/clip-move-workflow-helpers.ts`

Selected clip move command decisions are separated from `page.tsx`. This helper resolves selected move, move-to-playhead, move-to-track validation, expanded target clip ids, snap/clamp-applied move delta, next playhead, commit labels, and status text without React state or DOM access. Actual move mutation stays in `src/lib/editor/timeline.ts`.
Timeline drag/drop group move commit planning also lives here: the helper resolves cross-track/new-track drop labels, selected target track state, target clip ids, move delta, next playhead, and whether the commit should call same-track move, move-to-track-at-time, or move-to-new-track-at-time. `page.tsx` only wires the plan into existing timeline mutation functions.

### `renderer/clip-precision-edit-workflow-helpers.ts`

Precision edit command decisions are separated from `page.tsx`. This helper resolves Inspector start/duration edit plans, start move delta, duration trim end/playhead, slip, slide, roll trim, timeline drag selection/playhead updates, linked audio split labels, and mute/lock toggle command labels/status without React state or DOM access. Actual precision edit mutation stays in `src/lib/editor/timeline.ts`.

### `renderer/clip-split-trim-workflow-helpers.ts`

Split and trim command decisions are separated from `page.tsx`. This helper resolves delete-side, trim-to-playhead, timeline drag trim commit time/options, selected split, active-clip split fallback, split-all labels, target clip ids, next selection, and status text without React state or DOM access. Actual split/trim mutation stays in `src/lib/editor/timeline.ts`.

### `renderer/editor-form-controls.tsx`

Editor UI에서 반복 사용하는 number input, toggle button, toolbar button을 분리했다. command 실행은 props callback으로만 받고, project/timeline 상태를 직접 변경하지 않는다.

### `renderer/editor-panel-title.tsx`

Inspector와 Scene readout에서 반복 사용하는 panel title 컴포넌트를 분리했다. 기본 스타일은 Inspector header와 동일하게 유지하고, Scene readout은 기존 h2/색상 스타일을 props로 보존한다.

### `renderer/editor-keyboard-dispatcher.ts`

Global keyboard shortcut routing을 `page.tsx`에서 분리했다. DOM `KeyboardEvent`를 command handler contract로 변환하며, text input guard, playback/edit/trim/timeline/export shortcut 분기, Program Monitor arrow nudge 우선순위를 이 모듈이 담당한다. 실제 project mutation과 async 작업은 여전히 `page.tsx`가 주입한 callback으로 실행한다.

### `renderer/editor-media-client.ts`

브라우저 쪽 media upload, LUT upload, media metadata read, waveform peak read를 `page.tsx`에서 분리했다.
Electron builds now use `window.danbiEditor.media.selectAndImport` before falling back to browser file input for media import and single-file relink. The client also converts native/uploaded media records into the same prepared media shape used by the Media Bin import workflow.

### `renderer/editor-system-client.ts`

Queue settings 조회/적용과 FFmpeg capability 조회 API 호출을 `page.tsx`에서 분리했다. 이 모듈은 renderer의 system-level browser fetch만 담당하고, 상태 반영은 `page.tsx`가 수행한다.

### `renderer/editor-system-workflow-helpers.ts`

Escape clear state is separated from `page.tsx`; the page applies returned values through setters while this helper owns the selected clip/caption reset, playback stop, context menu clear, and status message contract.

Queue settings 적용 성공/실패 상태 결정을 `page.tsx`에서 분리했다. API 호출은 `editor-system-client.ts`가 담당하고, 이 helper는 적용된 settings와 사용자 status 메시지만 순수하게 계산한다.

### `renderer/editor-time-helpers.ts`

timeline, program monitor, source monitor, inspector에서 반복 사용하는 시간 반올림, numeric clamp, timecode/ruler/edit delta/clock 표시 helper를 분리했다. DOM이나 React 상태를 갖지 않는 renderer utility로 유지해 `page.tsx`와 세부 패널이 같은 시간 표시 규칙을 재사용할 수 있게 한다.

### `renderer/editor-top-toolbar.tsx`

상단 application shell, navigation, hidden file input bridge, edit/export command toolbar, status pills를 분리했다. 실제 command 실행과 async 작업은 `page.tsx` callback으로 유지하고, 이 모듈은 버튼 배치, 아이콘, toolbar 상태 표시만 담당한다.

### `renderer/editor-view-model.ts`

`page.tsx`에 흩어져 있던 view state 타입과 UI 상수를 분리했다. queue/job/autosave/hook/review/timeline drag/drop/keyframe 관련 view model을 이 파일에서 관리한다.

### `renderer/effect-workflow-helpers.ts`

Effect/preset/timeline batch command의 반복 판단을 `page.tsx`에서 분리했다. 선택 clip 없음, 대상 clip 없음, capability 불가 상태, preset label 기반 commit label, speed/transition/motion/effect updated/skipped 결과 status, motion transform patch add/update plan, Program Monitor motion/crop validation/add/update plan, LUT import plan/status/failure status, subject tracking/object mask plan, peak normalize success/failure status, fade/canvas/freeze frame command plan, effect stack move plan, effect parameter/toggle/remove의 batch target matcher를 순수 함수로 계산하고, 실제 mutation은 기존 editor core 함수가 맡는다.

### `renderer/comfyui-client.ts`

ComfyUI batch job poll, queue, cancel, retry API 호출을 `page.tsx`에서 분리했다. 이 모듈은 renderer browser fetch와 API error normalization만 담당하고, job 상태와 review/import/replace 상태 반영은 `page.tsx`가 유지한다.

### `renderer/comfyui-result-review-panel.tsx`

ComfyUI 결과 리뷰의 원본/결과 media preview, waveform, prompt lineage, cache/proxy readout, import/replace buttons 표시를 분리했다. 선택, 가져오기, 교체 command는 `page.tsx` callback으로 수행한다.

### `renderer/comfyui-review-helpers.ts`

ComfyUI queue 결과를 review UI용 asset/clip/readout item으로 변환하는 helper를 분리했다. 결과 파일 kind/MIME 추론, review asset 생성, lineage report 연결을 담당하며 import/replace 실행은 `page.tsx` callback으로 유지한다.

### `renderer/export-delivery-settings-panel.tsx`

Master audio loudness/true peak 설정과 caption sidecar download 옵션 UI를 분리했다. 실제 master audio project patch와 sidecar 다운로드 요청은 `page.tsx` callback이 수행한다.

### `renderer/export-job-status-panels.tsx`

Preview/render parity 요약, ComfyUI batch 상태, STT job 상태, STT review/diarization 상태 패널을 분리했다. cancel/retry/import/replace/clean/diarize 실행은 `page.tsx` callback을 통해 수행한다.

### `renderer/export-preflight-panel.tsx`

Export preflight 상태, media cache 재빌드 버튼, preflight issue focus/primary Resolve/relink action 표시를 분리했다. 실제 cache queue, timeline focus, output 선택, profile 전환, relink 실행은 `page.tsx` callback으로 유지한다.

### `renderer/preflight-issue-helpers.ts`

Preflight issue command decisions are separated from `page.tsx`. This helper resolves whether an issue should focus a source asset, media smart collection, timeline clip, track, playhead time, status message, or relink action without React state or DOM access.

### `renderer/export-settings-panel.tsx`

Export profile 선택/편집, export range 선택, manifest/render plan readout 표시를 분리했다. profile patch, duplicate/delete, range 변경은 `page.tsx` callback을 통해 실행해 project 상태 변경과 UI 렌더링 책임을 나눈다.

### `renderer/export-workspace-panel.tsx`

우측 sidebar의 Export Plan shell을 분리했다. export settings, preflight, master audio, caption sidecar, preview parity, ComfyUI/STT/render status 패널을 조립하며 실제 export/render/job/caption mutation은 `page.tsx` callback으로 유지한다.

### `renderer/export-workflow-helpers.ts`

This pass moves export profile fallback synchronization plus manifest/render plan synchronization out of `page.tsx`. The page now applies the helper result through React setters, while export workflow state remains calculated in a renderer module.

Render job polling eligibility is also resolved here. `page.tsx` keeps the timer and API call, while queued/running status checks belong to the export workflow module.
Render queue request planning also lives here. The helper combines preflight blocking, blocked render state, queue priority, encoder preference, profile id, project, and export range into a request plan so `page.tsx` only calls the render client or applies the blocked state.
Direct render request planning also lives here. The helper owns the immediate render client payload shape while `page.tsx` keeps export preparation, API invocation, and returned state application.
Server render plan request planning, caption sidecar download request planning, and polled render job state application also live here. `page.tsx` keeps timers, browser downloads, API calls, and React setters, while request payload shapes and render job state decisions stay inside the renderer workflow module.
Initial export plan sync now lives here as well, while the default export profile id is owned by the editor project core. `page.tsx` no longer owns export profile fallback literals or initial manifest/render-plan construction.

Active export profile/range, export range mode guard, render plan range matching, export draft manifest/FFmpeg plan/preflight, preview-render parity, master audio settings, preflight cache target 계산을 `page.tsx`에서 분리했다. 이번 정리에서 render queue 시작 상태, preflight block 판단, queued/retry/cancel/polling/instant render 완료 상태, server render plan 적용 판단, render failure state, caption sidecar download/failure status까지 이 helper가 담당하도록 확장했다. API 호출과 React state setter 실행은 page/client에 남기고, export/render workflow 상태 결정은 이 모듈에서만 계산한다.

### `renderer/inspector-command-panels.tsx`

Inspector selected clip command grid, arrange controls, precision trim controls를 분리했다. `page.tsx`는 command handler와 selection 상태만 전달하고, 버튼 구성과 disabled 조건은 이 모듈에서 관리한다.

### `renderer/inspector-analysis-panels.tsx`

Inspector의 Peak Normalize, Silence, Beat Edit 패널을 분리했다. waveform 기반 분석 설정과 결과 readout을 담당하며 실제 normalize/silence/beat edit 실행은 `page.tsx` callback으로 유지한다.

### `renderer/inspector-effects-panel.tsx`

Inspector의 Effects 패널을 분리했다. color/LUT/AI/audio/stabilize/crop/reframe quick actions, preset grids, effect stack item controls, effect parameter controls를 담당하며 실제 effect mutation은 `page.tsx` callback으로 유지한다.

### `renderer/inspector-media-panels.tsx`

Inspector의 Clip, Visual, Audio 패널을 분리했다. clip name/track/timing/speed ramp/blend/freeze/audio link, canvas layout/visual fade, audio fade/waveform sync UI를 담당하며 실제 project mutation은 `page.tsx` callback으로 유지한다.

### `renderer/inspector-motion-panels.tsx`

Inspector의 Motion, Transition Out, Keyframes 패널을 분리했다. motion transform/preset controls, transition type/duration/easing/direction controls, keyframe draft/list editing UI와 표시 helper를 담당하며 실제 timeline mutation은 `page.tsx` callback으로 유지한다.

### `renderer/inspector-sidebar-panels.tsx`

Inspector 하단의 Technical, Markers, Captions 패널을 분리했다. selected clip technical readout, marker list/edit controls, caption list/style/edit/STT summary controls를 담당하며 실제 marker/caption mutation은 `page.tsx` callback으로 유지한다.

### `renderer/inspector-controls.tsx`

Inspector의 caption style, title style, effect numeric parameter controls를 분리했다. `page.tsx`는 clip/effect/caption 상태와 변경 callback만 전달하고, 컨트롤 렌더링과 parameter control 목록은 이 모듈에서 관리한다.

### `renderer/media-cache-client.ts`

Media cache job 조회, queue, cancel, retry API 호출을 `page.tsx`에서 분리했다. 이 모듈은 renderer browser fetch와 API error normalization만 담당하고, cache job map과 asset metadata 반영은 `page.tsx`가 유지한다.

### `renderer/media-cache-workflow-helpers.ts`

Media cache workflow decisions are separated from `page.tsx`. This helper resolves active polling entries, polling interval state, queued/completed/failed cache job project patches, cache job map merging, completed cache status text, filtered/preflight batch queue status text, asset-level queue failure text, and single rebuild/cancel/retry status or failure text without React state or browser I/O.

### `renderer/media-drop-helpers.ts`

브라우저 `DataTransfer` 기반 media drag/drop 판별을 분리했다. 지원 확장자/MIME 판별, drag preview label/duration 계산, imported media kind와 target track 호환성 판단을 담당하며 실제 import/drop commit은 `page.tsx` callback으로 유지한다.

Dropped media cache job entry, timeline/media-bin drop status, unsupported drop status, and drop failure status calculation are handled by `renderer/media-drop-helpers.ts` without React state. Browser `DataTransfer` reading remains in that helper, while actual import/drop timeline mutation stays in the page shell.
Source asset timeline drop planning also lives here: source range normalization, source duration rounding, track compatibility, primary/audio target ids, edit mode ripple flag, and drop commit label are computed without React state or DOM access.
Prepared media file timeline drop orchestration is also separated here: imported asset ids, patched timeline project, cache job entries, next source selection, selected track, next playhead, and status are computed from prepared upload records while `page.tsx` only applies the returned state.
Timeline drop start, asset/media drop preview, edit-guide state, and source asset drop commit state also live here. `page.tsx` now reads DOM coordinates/DataTransfer, applies auto-scroll, and performs the final timeline mutation only.

### `renderer/media-bin-workflow-helpers.ts`

Media bin workflow decisions are separated from `page.tsx`. This helper resolves imported asset ids, import cache job entries, media import status text, Source Monitor asset bin update plans, relink upload input/cache/status plans, relink failure status, single asset removal state, unused asset removal state, and asset-scoped record pruning without React state or browser I/O.
Prepared media bin import orchestration is also separated here: the helper applies prepared upload records to the editor project, returns the next project, imported asset ids, cache job entries, and status so `page.tsx` only applies state and runs hooks.

### `renderer/media-bin-panel.tsx`

Media bin의 import/remove/cache buttons, search/filter/sort controls, drag/drop wrapper, asset card/list 렌더링을 분리했다. asset 선택, insert, relink, delete, cache rebuild, cache job cancel/retry command는 `page.tsx` callback으로 유지한다.

### `renderer/media-health-cache-panels.tsx`

Media Health 요약, asset health badge, media cache job status 표시를 분리했다. asset 선택, relink, cache rebuild, cancel, retry command는 `page.tsx` callback으로 유지해 job polling과 project patch 로직을 UI 표시와 나눴다.

### `renderer/marker-workflow-helpers.ts`

Timeline marker drag start state now lives here as a pure plan: Program Monitor activation, drag session state, marker time preview, and initial edit guide are calculated outside `page.tsx`.
Timeline marker drag move state also lives here: pointer delta, snapped/clamped marker time, preview state, moved flag, and edit-guide tone are calculated outside `page.tsx`.

Timeline marker command 판단을 `page.tsx`에서 분리했다. marker 추가/수정/삭제/drag commit/move-to-playhead/jump/previous-next marker 상태, commit label, patch, status 문구를 React state나 DOM 접근 없이 계산하고, 실제 marker mutation은 기존 `src/lib/editor/timeline.ts` core 함수가 맡는다.

### `renderer/media-workspace-helpers.ts`

Media health report, health map, filtered asset list, active cache job asset ids, filtered media cache batch plan, bin/smart collections 계산을 `page.tsx`에서 분리했다. Media bin UI와 cache command 실행은 page callback에 남기고, 반복되는 media workspace 파생 상태는 이 helper가 담당한다.

### `renderer/selected-clip-capabilities.ts`

Selected clip capability calculation is separated from `page.tsx`. This module resolves visual/audio/effect target clip ids, Inspector button enablement, audio detach/relink/link availability, waveform sync eligibility, waveform-based normalize/silence readiness, and Program Monitor motion edit eligibility without React state or DOM access.

### `renderer/selected-clip-workspace-helpers.ts`

Selected clip workspace state is separated from `page.tsx`. This helper resolves selected clips/captions, selected asset and runtime waveform fallback, ComfyUI binding, editable binding state, keyframes, speed ramp state, motion/canvas/title readouts, and timeline-local selected clip time without React state or DOM access.

### `renderer/playback-workflow-helpers.ts`

Program and Source Monitor playback frame decisions are separated from `page.tsx`. This helper resolves JKL shuttle rates, animation-frame elapsed seconds, next playhead, boundary stop state, and loop playback continuation without React state, DOM access, or requestAnimationFrame ownership.
Program playback rate/toggle state also lives here. `page.tsx` only applies React setters for timeline playback rate, active monitor, and playing state.

### `renderer/program-review-workspace-helpers.ts`

Program monitor and review derived state is separated from `page.tsx`. This helper resolves ComfyUI review items, review selection id, selected review item, STT caption review, speaker diarization report, Program Preview stack, Program audio meter, and Program Monitor preview clip selection status without React state or DOM access.
Program Preview clip selection now includes Program Monitor activation state, so `page.tsx` applies the selected clip and active monitor from the plan instead of hardcoding monitor switching.

### `renderer/program-monitor-overlays.tsx`

Program Monitor의 scopes, audio meter, preview performance, composite stack overlay 컴포넌트를 분리했다. preview 계산이나 편집 상태를 갖지 않고 표시 전용 props만 받는다.

### `renderer/program-audio-graph-controller.tsx`

Program Monitor의 hidden audio element preview와 Web Audio graph를 분리했다. audio source resolve, timeline playback state에 따른 seek/play/pause, clip speed 반영, gain/pan node 연결, shared `AudioContext` 생성/재사용, graph teardown을 이 모듈이 담당한다. `program-composite-preview.tsx`는 `ProgramAudioMixer`를 배치만 한다.

### `renderer/program-caption-title-overlays.tsx`

Program Monitor의 caption, title/text, effect label overlay 표시를 분리했다. caption/title style 계산, text motion draft 반영, speaker caption label format, active effect badge 표시를 이 모듈이 담당한다. `program-composite-preview.tsx`는 overlay를 배치하고 필요한 `stack`, `canvasScale`, `motionDraft`만 전달한다.

### `renderer/program-composite-preview.tsx`

Program Monitor의 timeline composite preview, media layer preview, transform/crop interaction overlay, caption/title/effect overlay, preview worker capability check, preview audio layer playback을 분리했다. `page.tsx`는 선택 상태와 command callback만 전달하고, 실제 preview DOM/worker/audio graph 처리는 이 모듈 내부에서 관리한다.

### `renderer/program-preview-stage.tsx`

Program Monitor의 outer preview shell을 분리했다. active monitor focus, keyboard activation, empty-state preview frame, `ProgramCompositePreview` 배치를 담당하며 motion/crop/select commit은 `page.tsx` callback으로 유지한다.

### `renderer/program-media-layer-preview.tsx`

Program Monitor의 video/image media element preview를 분리했다. media source resolve, clip speed/freeze playback sync, preview CSS filter/crop/object-mask/reframe/canvas layout, dropped-frame telemetry, video scope sample, privacy blur region overlay를 이 모듈이 담당한다. `program-composite-preview.tsx`는 media layer 위치/순서와 callback 연결만 유지한다.

### `renderer/program-transform-crop-overlays.tsx`

Program Monitor의 direct manipulation overlay를 분리했다. layer selection hit target, center snap guides, motion transform drag/scale/rotate, crop mask edge handle drag, shared layer box calculation을 이 모듈이 담당한다. 실제 motion/crop commit은 기존처럼 `program-composite-preview.tsx`가 전달한 callback으로 실행한다.

### `renderer/project-history-controller.ts`

Project save markers, commit/no-op/error result, replacement commit, undo, redo 계산을 `page.tsx`에서 분리했다. React state setter는 여전히 `page.tsx`가 실행하지만, history/future stack 갱신, status 문구, 첫 clip selection 복원 같은 command 결과 계산은 순수 helper가 담당한다.

### `renderer/project-persistence-client.ts`

For project packages, this client now prefers the Electron preload bridge when `window.danbiEditor.projects.exportPackage/importPackage` is available, and uses `window.danbiEditor.dialogs.selectDirectory` for native folder selection. Desktop builds use folder packages with copied media; browser builds keep the existing JSON download/file input fallback.

Saved project 목록/저장/불러오기, autosave 목록/저장/복구/삭제, localStorage fallback, project package export/import 파일 처리를 `page.tsx`에서 분리했다. 이 모듈은 renderer browser I/O와 Next API 호출만 담당하고, 실제 project/history/status state 반영은 `page.tsx`가 수행한다.

### `renderer/project-persistence-workflow-helpers.ts`

Project persistence workflow decisions are separated from `page.tsx`. This helper resolves dirty-project autosave scheduling state, beforeunload warning eligibility, save success markers, database fallback save state, autosave summary updates, local autosave fallback state, autosave delete state, persistence failure status, project load target selection, project package export naming/status, and project session replacement state for autosave restore, database load, local fallback load, and package import without React state or browser I/O.
Local fallback package load and project package import wrapper sessions also live here, so warning counts and package project extraction do not leak back into `page.tsx`.

### `renderer/project-session-workspace-helpers.ts`

Project/session derived state is separated from `page.tsx`. This helper resolves serialized project text, save-state label/class, asset lookup map, asset reference counts, and unused asset count without React state or DOM access.

### `renderer/project-settings-workflow-helpers.ts`

Project settings, export profile update/duplicate/remove, and master audio settings mutation plans are separated from `page.tsx`. The helper returns commit labels, project mutation functions, missing-selection status, and next selected export profile IDs so the page only commits the plan and applies returned view state.

### `renderer/project-workspace-panels.tsx`

좌측 Project workspace의 overview, project settings, saved projects/package import-export, autosave recovery 패널을 분리했다. 프로젝트 저장소/API 호출은 `page.tsx` callback으로 유지하고, project settings/export profile/master audio mutation plan은 `project-settings-workflow-helpers.ts`가 계산한다. 이 모듈은 표시와 사용자 입력 wiring만 담당한다.

### `renderer/preview-worker-controller.ts`

Program Monitor preview worker의 browser capability detect, `/editor-preview-worker.js` 생성/종료, worker benchmark message 처리, `PreviewWorkerPlan` 계산을 분리했다. `program-composite-preview.tsx`는 이 hook에서 반환한 plan을 performance overlay에 전달하고, worker lifecycle 세부 구현은 알지 않는다.

### `renderer/command-palette-helpers.ts`

Command palette 검색 모델을 `page.tsx`에서 분리했다. shared editor command registry를 palette item으로 변환하고, query filtering, score sorting, active index clamping, keyboard navigation을 React state나 DOM 접근 없이 계산한다.

### `renderer/editor-command-dispatcher.ts`

Command palette 실행 dispatch를 `page.tsx`에서 분리했다. palette reset, command id별 toolbar/shortcut handler 라우팅, fps/playhead/edit mode/ripple/preview-cache 상태 기반 기본 payload를 renderer helper가 결정하고, 실제 project mutation과 async 작업은 page shell이 주입한 callback으로 유지한다.

### `renderer/command-palette.tsx`

Command palette modal 표시를 분리했다. `Ctrl+K` 또는 toolbar 버튼으로 열리며, 검색 입력, Arrow/Home/End navigation, Enter 실행, Escape 닫기를 담당한다. 실제 편집 command 실행은 `page.tsx`가 기존 toolbar/shortcut handler로 연결한다.

### `renderer/render-client.ts`

Render client calls prefer the Electron preload bridge for render plan, direct render, queue, job polling, cancel, and retry when `window.danbiEditor.render` is available, while browser mode keeps the Next API fallback. The same module owns native output-path selection through `window.danbiEditor.dialogs.saveFile`, builds container-aware save dialog filters from the active export profile, passes the selected `outputPath` into the render request, and calls `window.danbiEditor.files` to open or reveal completed render outputs.

Render job poll/queue/cancel/retry, server-side render plan fetch, direct render request, caption sidecar download API 호출을 `page.tsx`에서 분리했다. 이 모듈은 renderer browser fetch와 download side effect만 담당하고, preflight 계산과 render status state 반영은 `page.tsx`에 유지한다.

### `renderer/render-status-panel.tsx`

Render job 진행률, 실패 diagnostic, primary Resolve action, stderr tail, FFmpeg command, output link, render plan warning 표시를 분리했다. cancel/retry/diagnostic resolve 실행은 `page.tsx` callback으로 유지해 render queue 상태 변경과 표시 컴포넌트를 분리한다.

### `renderer/render-diagnostic-view.ts`

Render failure diagnostic을 Render Status와 Job History에서 공유하는 표시 모델로 변환한다. Category별 title, primary action, retry/fix label, evidence slice를 여기서 결정하고, raw 실패 분류는 `src/lib/editor/render-diagnostics.ts`에 유지한다.
Render diagnostic Resolve action planning도 여기에서 담당한다. Relink 대상 asset 선택, H.264/MP4 fallback profile 선택, output/retry/timeline/status action 분류를 React state 없이 계산하고, `page.tsx`는 반환된 plan에 따라 side effect만 실행한다.

### `renderer/scene-readout-panel.tsx`

Program Monitor 옆의 Scene readout 표시를 분리했다. 선택 clip start/length/type/tags, selection count, preview layer 수, audio peak, active monitor playback rate를 표시하고, preview stack과 선택 상태만 props로 받는다.
공통 `editor-panel-title.tsx`를 사용하되 기존 Scene readout title 스타일은 유지한다.

### `renderer/sidebar-workflow-panels.tsx`

Inspector/sidebar 하단의 Shortcuts, Queue Settings, Automation Hooks, Plugins 패널을 분리했다. keyboard shortcut 목록, queue concurrency/priority controls, hook plan 실행/요약, plugin contribution list 표시를 담당하며 실제 queue 적용과 hook 실행은 `page.tsx` callback으로 유지한다.

### `renderer/source-asset-range-panel.tsx`

Media bin 안의 선택 source asset range controls를 분리했다. bin 이름, source in/out, V/A patch toggle, subclip, three-point insert/overwrite, replace selected 버튼 표시를 담당하고, 실제 source range patch와 timeline edit command는 `page.tsx` callback으로 유지한다.

### `renderer/source-edit-workflow-helpers.ts`

Match-frame-to-source now includes Source Monitor activation state in its plan, so `page.tsx` applies the selected source asset, source playhead, and active monitor from one workflow result.
Insert-source-asset-at-playhead planning also lives here: missing source asset status, source patch option building, V/A patch target guard, commit label, asset id, and patch options are resolved outside `page.tsx`.
Three-point edit planning now returns the commit asset id, insert/overwrite operation, final patch options, insert ripple flag, commit label, and next playhead so `page.tsx` only dispatches the timeline mutation and applies React state.
Replace-selected-from-source planning now returns the target timeline clip id, source asset id, replace options, commit label, and failure status from the helper, keeping `page.tsx` out of source replacement option assembly.
Source range reset/mark/match planning now returns the target source asset id with the computed range, so `page.tsx` applies the range patch without re-checking selected asset identity.
Source subclip readiness now returns the source asset id and `CreateMediaSubclipOptions`, keeping subclip request assembly out of `page.tsx` while the core project mutation remains in `src/lib/editor/subclip.ts`.
Source range patch planning now wraps asset lookup failure and normalized range calculation into a helper plan, preserving the silent no-op behavior for missing assets while removing range math from `page.tsx`.

Source Monitor 편집 명령 판단을 `page.tsx`에서 분리했다. source range patch/reset/mark, marked timeline range와 source range 매칭, V/A patch option 산출, 3-point insert/overwrite validation, match-frame-to-source, replace-selected-from-source plan을 React state나 DOM 접근 없이 계산한다.
source range reset과 source subclip readiness/result/failure 상태도 여기에서 계산해 `page.tsx`는 project commit과 반환된 view-state plan 적용만 담당한다.

### `renderer/source-monitor.tsx`

Source Monitor의 source asset preview, source range scrubber, shuttle controls, insert/overwrite buttons, subclip source offset overlay를 분리했다. 실제 source range 변경과 timeline 삽입/덮어쓰기 command는 기존 `page.tsx` callback이 수행한다.

### `renderer/stt-client.ts`

STT caption job poll, queue, cancel, retry API 호출을 page에서 분리한다. renderer는 이 모듈을 통해 job lifecycle만 다루고, Next route/추후 preload IPC 경계는 이 파일에서 흡수한다.

### `renderer/timeline-clip-button.tsx`

Timeline clip의 button 렌더링, thumbnail/waveform 표시, drag/move/slip/slide/trim/roll/transition/keyframe pointer interaction을 분리했다. Timeline 전체 상태 변경은 여전히 `page.tsx`가 callback으로 받으므로, 이번 작업은 UI 컴포넌트 분리이며 기능 변경이 아니다.

### `renderer/timeline-clip-list.tsx`

Timeline track 안의 clip button list 렌더링과 `TimelineClipButton` callback wiring을 분리했다. asset/thumbnail/waveform/selected/mute/lock 표시 값을 계산하고, 실제 move/trim/slip/slide/transition/keyframe commit은 `page.tsx` callback으로 유지한다.

### `renderer/timeline-context-menu.tsx`

Timeline 우클릭 메뉴의 표시와 command callback props를 분리했다. 복사, 붙여넣기, 트림, 마커, 링크/언링크, 삭제, 전환 적용 항목의 텍스트와 disabled 조건은 유지하고, 실제 command 실행은 기존 `page.tsx` handler가 담당한다.

### `renderer/timeline-edit-preview-helpers.ts`

Timeline clip drag, target track hit-test, drop preview, trim/slip/slide/roll preview, edit guide 계산을 `page.tsx`에서 분리했다. DOM ref에서 lane bounds를 읽는 얇은 경계와 순수 preview 계산을 제공하며, 실제 clip move/trim commit은 기존 `page.tsx` command handler가 유지한다.
Timeline clip drag pointer/preview/commit state assembly also lives here: target track id, cleared drag preview state, drop preview, drag edit guide, move edit state, and target track for commit are returned as renderer plans while `page.tsx` only applies React setters and timeline mutations.

### `renderer/timeline-gap-workflow-helpers.ts`

Timeline gap command decisions are separated from `page.tsx`. This helper resolves insert-gap duration clamp/rounding, commit labels, target track ids, close-gap target track/playhead, close-all-gaps target track, and next playhead without React state or DOM access. Actual gap mutation stays in `src/lib/editor/timeline.ts`.

### `renderer/timeline-mark-workflow-helpers.ts`

Timeline In/Out mark와 marked range command 판단을 `page.tsx`에서 분리했다. mark set/go/clear, 선택 clip으로 range 생성, marked range copy/cut/delete plan을 React state 없이 계산하고, page는 clipboard/state 적용과 commit 호출만 맡는다.

### `renderer/timeline-selection-helpers.ts`

Implementation note: marked range selection now returns the missing In/Out status from the helper, so `page.tsx` does not branch on a null marked range before selecting ranged clips.

Timeline clip primary selection, add/toggle selection, select all, playhead-relative selection, marked range selection, lane box selection, adjacent edit jump 상태/문구 계산을 `page.tsx`에서 분리했다. core timeline query는 이 helper가 호출하고, React setter와 playhead 이동은 기존 page command handler가 유지한다.
Timeline lane box drag start/move/end state also lives here: pointer-to-time conversion, scroll delta compensation, moved threshold, scoped track fallback, click-to-seek behavior, selection clearing, and box range selection results are calculated outside `page.tsx`.
Timeline clip click selection modifier handling also lives here: meta/ctrl toggle, shift add, default replace/seek, and primary-only selection inside an existing multi-selection are returned as a single selection plan.

### `renderer/timeline-source-helpers.ts`

Source Monitor playback rate and shuttle state planning also live here. `page.tsx` applies the active monitor and playback-rate setters, while source playback decisions stay inside this helper.
Source asset selection now includes Source Monitor activation state, so `page.tsx` no longer hardcodes that selection switches the active monitor.

source asset와 timeline clip의 track kind 판정, source range normalize, Source Monitor asset selection/playhead clamp, source asset id validation/playback guard, editable target track resolve, waveform availability, selected audio/video pair, keyframe sort, safe download name, ComfyUI workflow numeric read helper를 분리했다. timeline edit state와 source monitor glue를 `page.tsx` 내부 구현에서 떼어내며 실제 project mutation은 계속 상위 callback에서 수행한다.

Source Monitor workspace state(asset fallback, normalized range, range duration, bin label, V/A patch availability, active patch tracks) 계산도 이 모듈로 이동했다.

### `renderer/timeline-viewport-helpers.ts`

Timeline viewport controller calculations are separated from `page.tsx`. This helper resolves snapped playhead time, playhead nudge clamping, edit snap options, edge auto-scroll, normalized edit guides, visible scroll position, fit-to-timeline/selection zoom state, ruler scrub time, ruler scrub session state, Program Monitor activation for scrub, and scrub completion status without React state or DOM access.

### `renderer/timeline-workspace-helpers.ts`

Timeline workspace derived state is separated from `page.tsx`. This helper resolves timeline width, selected clip move target kind/options, active timeline clip at the playhead, marked range, loop range, loop playback guard/toggle decisions, and timeline edit snap points without React state or DOM access.

### `renderer/track-workflow-helpers.ts`

Track command decisions are separated from `page.tsx`. This helper resolves track toggle, mixer patch, rename validation/no-op, move labels, remove preflight, selected/source patch target state, and next selected track id without React state or DOM access. Actual track mutation stays in `src/lib/editor/timeline.ts`.

### `renderer/timeline-track-row.tsx`

Timeline track row의 header controls, source patch target, mute/solo/sync/lock toggles, audio gain/pan mixer, lane background, marked range/playhead/edit guide/drag preview overlays를 분리했다. clip button list는 children으로 받고, track rename/move/remove/toggle/mixer/drop/drag command는 `page.tsx` callback으로 유지한다.

### `renderer/timeline-transport-ruler.tsx`

Timeline header, title/adjustment/track add buttons, save/load controls, playback transport, mark readout, zoom/gap controls, ruler ticks, in/out/marker/playhead overlay, timeline scroll container를 분리했다. track row 렌더링은 children으로 받고, 실제 seek, marker drag, track add, save/load, gap insert 같은 command는 `page.tsx` callback으로 유지한다.
Ruler tick 계산도 이 모듈 내부로 이동해 `page.tsx`가 timeline 표시 helper를 직접 소유하지 않게 했다.

### `renderer/timeline-state-adapter.ts`

renderer가 shared timeline snapshot을 직접 재사용하는 얇은 adapter다.

## 기존 코드 연결 변경

- `/api/editor/render`
  - 직접 `spawn`/preflight/plan/output path를 조립하지 않고 `runFfmpegEngineRender()`를 호출한다.
- `/api/editor/render-plan`
  - `buildFfmpegEnginePlan()`을 호출한다.
- `/api/editor/render-preflight`
  - `buildFfmpegEnginePreflight()`을 호출한다.
- `/api/editor/render-jobs`
  - `queueFfmpegEngineRender()`, `listFfmpegEngineJobs()`를 호출한다.
- `/api/editor/render-jobs/[id]`
  - `get/cancel/retryFfmpegEngineJob()`을 호출한다.
- `/api/editor/projects`
  - `shared/project-schema`의 parse/stringify/migrate/summarize를 사용한다.
- `src/app/editor/page.tsx`
  - renderer view model, form controls, keyboard dispatcher, top toolbar, Inspector command panels, Inspector analysis/effects/media/motion/sidebar panels, Inspector controls, ComfyUI result review panel/helpers, media bin panel, media drop helpers, media health/cache panels, export settings/delivery/preflight/job status/workspace panels, media client, Program Monitor overlay/composite/media-layer preview/audio graph/caption-title/preview-stage/transform-crop overlays, Project workspace panels, preview worker controller, render status panel, Scene readout panel, Sidebar workflow panels, Source asset range panel, Source Monitor, Timeline clip button/list, Timeline context menu, Timeline track row, Timeline transport/ruler를 `src/electron/renderer`로 분리해 가져온다.
  - editor time helpers와 timeline source helpers를 추가로 가져와 timecode/clamp, source range, track kind, waveform/link-pair 판정 로직을 page-local helper에서 제거했다.
  - editor system client를 사용해 queue settings와 FFmpeg capability fetch를 page-local 코드에서 제거했다.
  - editor panel title을 공통 renderer 컴포넌트로 가져오고, ruler tick 계산은 timeline transport/ruler 모듈 내부로 이동했다.
  - project history controller를 사용해 commit, replacement commit, undo/redo stack 계산을 page-local imperative 코드에서 제거했다.
  - project persistence client를 사용해 saved project/autosave/package fetch, localStorage fallback, download/read file 처리를 page-local 코드에서 제거했다.

## 경계 규칙

- `shared`는 Node/Electron/DOM API를 직접 사용하지 않는다.
- `main`은 파일 시스템, FFmpeg, job queue 같은 Node 실행 경계를 담당한다.
- `preload`는 renderer에 노출할 typed bridge만 만든다.
- `renderer`는 DOM/browser I/O와 UI view model만 둔다.
- `src/lib/editor`는 순수 editor core로 유지한다. timeline 변환, render plan, media/cache/preview 계산은 이 레이어에 남긴다.
- 기능 추가는 이 구조 작업 범위에 포함하지 않는다.

## 다음 분해 대상

- Remaining page-level state/command orchestration
- Completed in this pass: `renderer/comfyui-client.ts`, `renderer/stt-client.ts`, `renderer/automation-hooks-client.ts`, `renderer/automation-hooks-workflow-helpers.ts`, `renderer/ai-queue-workflow-helpers.ts`, `renderer/timeline-edit-preview-helpers.ts`, `renderer/timeline-selection-helpers.ts`, `renderer/export-workflow-helpers.ts`, `renderer/timeline-source-helpers.ts`, `renderer/media-workspace-helpers.ts`, `renderer/selected-clip-capabilities.ts`, `renderer/timeline-workspace-helpers.ts`, `renderer/selected-clip-workspace-helpers.ts`, `renderer/playback-workflow-helpers.ts`, `renderer/program-review-workspace-helpers.ts`, `renderer/project-session-workspace-helpers.ts`, `renderer/project-settings-workflow-helpers.ts`, `renderer/editor-system-workflow-helpers.ts`, `renderer/timeline-viewport-helpers.ts`, `renderer/preflight-issue-helpers.ts`, `renderer/project-persistence-workflow-helpers.ts`, `renderer/media-cache-workflow-helpers.ts`, `renderer/media-bin-workflow-helpers.ts`, `renderer/source-edit-workflow-helpers.ts`, `renderer/timeline-mark-workflow-helpers.ts`, `renderer/caption-workflow-helpers.ts`, `renderer/effect-workflow-helpers.ts`, `renderer/audio-analysis-workflow-helpers.ts`, `renderer/clip-audio-link-workflow-helpers.ts`, `renderer/clip-clipboard-workflow-helpers.ts`, `renderer/clip-create-workflow-helpers.ts`, `renderer/marker-workflow-helpers.ts`, `renderer/track-workflow-helpers.ts`, `renderer/clip-edit-workflow-helpers.ts`, `renderer/clip-split-trim-workflow-helpers.ts`, `renderer/clip-move-workflow-helpers.ts`, `renderer/clip-precision-edit-workflow-helpers.ts`
- Added in this pass: `renderer/timeline-gap-workflow-helpers.ts`
- Extended in this pass: `renderer/media-drop-helpers.ts` now owns source asset timeline drop option planning.
- Extended in this pass: `renderer/media-drop-helpers.ts` now owns prepared media timeline drop result planning.
- Extended in this pass: `renderer/media-bin-workflow-helpers.ts` now owns prepared media bin import result planning.
- Extended in this pass: `renderer/caption-workflow-helpers.ts` now owns caption sidecar import result planning.
- Extended in this pass: `renderer/project-persistence-workflow-helpers.ts` now owns local fallback/package import session wrappers.
- Extended in this pass: `renderer/automation-hooks-workflow-helpers.ts` now owns before-export hook request planning and prepared export project fallback selection.
- Extended in this pass: `renderer/export-workflow-helpers.ts` now owns render queue request planning.
- Extended in this pass: `renderer/export-workflow-helpers.ts` now owns immediate render request planning.
- Extended in this pass: `renderer/export-workflow-helpers.ts` now owns server render plan request planning, caption sidecar download request planning, and render job polling application state.
- Extended in this pass: `lib/editor/project.ts` now owns the default export profile id, and `renderer/export-workflow-helpers.ts` now owns initial export plan sync state.
- Extended in this pass: `renderer/playback-workflow-helpers.ts` now owns program playback rate/toggle state planning.
- Extended in this pass: `renderer/timeline-source-helpers.ts` now owns Source Monitor playback rate/shuttle state planning.
- Extended in this pass: `renderer/timeline-source-helpers.ts` now owns Source Monitor activation state for source asset selection.
- Extended in this pass: `renderer/program-review-workspace-helpers.ts` now owns Program Monitor activation state for preview clip selection.
- Extended in this pass: `renderer/source-edit-workflow-helpers.ts` now owns Source Monitor activation state for match-frame-to-source.
- Extended in this pass: `renderer/clip-create-workflow-helpers.ts` now owns Program Monitor activation state for created title/adjustment clip selection.
- Extended in this pass: `renderer/marker-workflow-helpers.ts` now owns marker drag start state planning.
- Extended in this pass: `renderer/marker-workflow-helpers.ts` now owns marker drag move preview/edit-guide state planning.
- Extended in this pass: `renderer/timeline-viewport-helpers.ts` now owns timeline ruler scrub start/move/end state planning.
- Extended in this pass: `renderer/timeline-selection-helpers.ts` now owns timeline lane box drag start/move/end state planning.
- Extended in this pass: `renderer/timeline-edit-preview-helpers.ts` now owns clip drag pointer/preview/commit state assembly.
- Extended in this pass: `renderer/timeline-viewport-helpers.ts` now owns playhead nudge clamp planning.
- Extended in this pass: `renderer/timeline-selection-helpers.ts` now owns clip click modifier selection planning.
- Extended in this pass: `renderer/track-workflow-helpers.ts` now owns track selection and source patch target selection planning.
- Extended in this pass: `renderer/media-drop-helpers.ts` now owns timeline drop start, asset/media drop preview, edit-guide, and source asset drop commit state planning.
- Extended in this pass: `renderer/source-edit-workflow-helpers.ts` now owns source asset insert-at-playhead planning.
- Extended in this pass: `renderer/source-edit-workflow-helpers.ts` now owns three-point edit commit target and operation planning.
- Extended in this pass: `renderer/source-edit-workflow-helpers.ts` now owns replace-selected-from-source target and option planning.
- Extended in this pass: `renderer/source-edit-workflow-helpers.ts` now owns source range reset/mark/match target asset planning.
- Extended in this pass: `renderer/source-edit-workflow-helpers.ts` now owns source subclip request option planning.
- Extended in this pass: `renderer/source-edit-workflow-helpers.ts` now owns generic source range patch target and normalized range planning.

이번 단계에서는 실행 안정성을 위해 view model, form controls, keyboard dispatcher, top toolbar, Inspector command panels, Inspector analysis/effects/media/motion/sidebar panels, Inspector controls, ComfyUI result review panel/helpers, media bin panel, media drop helpers, media health/cache panels, export settings/delivery/preflight/job status/workspace panels, media client, Program Monitor overlay/composite/media-layer preview/audio graph/caption-title/preview-stage/transform-crop overlays, Project workspace panels, preview worker controller, render status panel, Scene readout panel, Sidebar workflow panels, Source asset range panel, Source Monitor, Timeline clip button/list, Timeline context menu, Timeline track row, Timeline transport/ruler부터 먼저 분리했다. 다음 분해는 위 순서로 작은 PR 단위로 진행해야 한다.

## 검증

- `npx tsc --noEmit --pretty false`
- `npx vitest run tests/lib/editor-core.test.ts`
- `npm run test:e2e`
- `npm run test:render-smoke`
- `npm run build`
- 개발 서버 재시작 후 확인:
  - `GET http://127.0.0.1:3000/editor` -> 200
  - `GET http://127.0.0.1:3000/editor-preview-worker.js` -> 200
  - `POST /api/editor/render-preflight` -> 현재 샘플 프로젝트 기준 `blocked: 3`, `warnings: 8`

추가된 테스트는 project schema, timeline snapshot, extension API, FFmpeg engine wrapper, preload API, renderer IPC client 계약과 Playwright 기반 editor command palette interaction smoke를 직접 확인한다.
