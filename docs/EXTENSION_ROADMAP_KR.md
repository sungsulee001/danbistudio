# 확장 로드맵

## Phase 1: 편집기 기반 완성

목표: 데모 화면이 아니라 매일 컷 편집을 시작할 수 있는 상태.

완료 또는 기본 완료:

- 실제 파일 import와 metadata 연결
- asset relink: 누락된 source/renderPath를 기존 timeline clip 유지 상태로 교체
- Media Health report: renderPath/source/cache/missing asset 상태를 진단하고 Relink/Cache 복구 액션 제공
- `ffprobe` 기반 video/audio metadata 분석
- 멀티트랙 타임라인
- video/audio/image element 기반 preview
- audio waveform 표시
- timeline thumbnail display for video/image clips
- waveform 기반 silence removal
- waveform 기반 beat marker와 auto beat cut
- undo/redo history
- 키보드 단축키와 context menu
- In/Out mark와 Lift/Extract
- source range 3-point ripple insert/overwrite with V/A source patch targeting
- linked V/A selection, box selection, drag move, delete, paste, overwrite, duplicate, split, trim, slip, roll, and slide sync
- linked V/A range lift/extract tail relink and keyframe slicing
- slip/roll/slide 정밀 트림
- source/program monitor와 JKL/shuttle playback
- insert/overwrite paste 충돌 정책
- program monitor preview stack
- program monitor multi-layer media compositing with opacity/blend/transform
- text/effect/keyframe/caption preview
- marker/caption workflow
- marker duration/note editing, CSV interchange, FCPXML preservation, and timeline range display
- thumbnail/proxy/waveform cache queue
- render/media-cache job snapshot persistence
- media-cache/render retry와 cancel
- render/media-cache/ComfyUI queue priority와 worker concurrency 설정
- render failure diagnostic UI
- preview/render parity checker
- speed-aware preview/render/timeline source math
- split/trim keyframe preservation with boundary values and clip-segment retiming
- embedded video audio mix
- linked/unlinked embedded audio detach/relink
- FFmpeg loudness normalization
- editable FFmpeg xfade transitions: crossfade, dip, push, wipe, duration/easing/direction
- title/text burn-in render
- caption burn-in render
- caption style controls and preview/render parity
- title/caption style packs: Inspector에서 Clean/Boxed/Lower title pack과 Readable/Creator/Top caption pack을 기존 `CaptionStyle` patch 경로로 적용하며 Program Monitor, FFmpeg drawtext, WebVTT style metadata, project JSON 저장 경로와 동일한 스타일 계약을 사용
- free creator templates: Project workspace에서 Short Launch, Tutorial Steps, Review Pass preset을 현재 playhead에 적용해 title clip, styled caption, chapter/review marker, optional ComfyUI B-roll draft clip을 undo 가능한 project transform으로 생성
- track solo controls with independent visual/audio solo domains for preview and render
- position/scale/rotation keyframe render
- opacity/audio volume keyframe render
- Inspector keyframe editing: add/update/delete, easing, and value bounds for position/scale/rotation/opacity/volume
- Inspector Motion transform controls for static position/scale/rotation with preview/render parity
- supported effect filter render: text slide, audio gain, audio cleanup presets, side-chain ducking, crop mask, tracked object mask, smart reframe, stabilize/deshake, Visual FX presets including privacy blur, green-screen chroma key, soft glow, advanced bloom, motion trails, optical-flow motion blur, and film grain, local AI enhancement presets, color eq/curves/lut3d, color match temperature/tint
- supported effect add controls: color, color match, audio gain, stabilize presets, crop mask, smart reframe
- adjustment layers for shared Color/LUT/FX/AI FX effects on lower video/image layers with Program Monitor and FFmpeg parity, including partial-overlap `enable` expressions where FFmpeg supports them
- SRT/WebVTT caption sidecar import/export
- advanced sidecar options: speaker toggle, line wrapping, WebVTT style metadata, word-timing highlight cues
- 프로젝트 SQLite 저장
- 프로젝트 마이그레이션: 기존 저장본에 새 기본 export profile과 plugin manifest 자동 보강
- 프로젝트 패키지 JSON export/import: asset 경로 manifest, cache reference, 재import 경고 포함
- ComfyUI batch queue scheduler: dry-run payload, optional execution, cancel, retry, status polling, persistent snapshot
- ComfyUI result review: output source/renderPath snapshot, side-by-side compare, `AI Results` candidate track import, undoable original clip replacement
- ComfyUI result metadata/waveform review: prompt/model/workflow, ffprobe media analysis, thumbnail/proxy/waveform cache readiness, duration/resolution mismatch warning
- ComfyUI prompt lineage/version compare: source generation prompt/workflow/seed versus result snapshot, changed/missing/same status
- Local STT caption queue: Whisper-compatible command execution, transcript parser, timeline caption import
- STT caption review/cleanup: 낮은 confidence, 짧은 duration, 과도한 읽기 속도, word timing drift를 검수하고 문제 자막 선택/자동 정리/짧은 줄 병합을 제공
- STT word-level timing: Whisper-compatible JSON `words`/`tokens`를 caption metadata로 보존
- STT speaker correction: 선택 자막 speaker label 일괄 수정과 WebVTT word-highlight export
- STT speaker diarization draft and speaker timeline review: transcript/caption speaker metadata, missing-speaker draft labels, speaker turn summaries, and review selections
- STT acoustic embedding extraction: transcript가 `speakerEmbedding`을 제공하지 않는 경우 로컬 waveform cache에서 caption source range별 acoustic feature embedding을 생성해 diarization similarity path에 공급하고, transcript 제공 embedding은 보존
- STT external speaker encoder command integration: `DANBI_STT_SPEAKER_ENCODER_COMMAND`가 설정되면 caption source ranges manifest를 외부 모델 command에 넘기고 JSON speaker embedding output을 적용하며, 실패하거나 누락되면 기존 waveform-backed fallback을 계속 사용
- Preview playback diagnostics: RAF 기반 playhead advance와 Program Monitor decoded/dropped frame 표시

다음 구현 우선순위:

1. WebCodecs video demux/decode preview worker beyond the current QuickTime-compatible MP4/MOV/M4V/QT extension routing, progressive MP4/H.264 with CTTS/edit-list timing, compact `stz2` sample-size tables, and MP4 orientation metadata, FFmpeg fragmented MP4/H.264 with CTTS/edit-list timing, consecutive `trun` data cursor handling, and MP4 orientation metadata, MP4/H.265 HEVC, WebM/VP8, WebM/VP9, WebM/AV1, Matroska H.264/H.265 `CodecPrivate`, and Xiph/fixed/EBML laced WebM/VP8 paths: more complex MP4/WebM variants and additional browser-exposed codec/profile coverage
2. bundled/on-device CV tracker integration beyond the current model-hint tracking refinement path
3. packaged speaker-encoder preset/model convenience beyond the current external command contract
4. actual bundled model binaries/license packaging for model-backed AI effects beyond the current ComfyUI/model-pass preset/control contract

## Phase 2: 렌더러

목표: 타임라인 결과물을 실제 파일로 안정적으로 출력.

완료 또는 기본 완료:

- FFmpeg render graph 변환
- FFmpeg render plan API
- FFmpeg render execution API
- FFmpeg render queue/progress API
- H.264/H.265/ProRes/AV1 profile contract
- Export profile selector가 parity/render-plan/direct-render/render-queue에 동일하게 반영
- render queue cancel/retry
- failed render diagnostic
- caption burn-in과 sidecar export
- hardware encoder 자동 감지: FFmpeg encoder 목록을 감지하고 H.264/H.265/AV1에서 NVENC/QSV/AMF/VideoToolbox/VAAPI를 자동 선택, 없으면 software encoder로 fallback
- proxy render preset: `Proxy Review 540p` H.264 low-bitrate/veryfast/CRF profile로 빠른 로컬 검수 출력 지원
- intermediate master preset: `ProRes 422 HQ Master` MOV profile을 기본 프로젝트와 기존 프로젝트 마이그레이션에 포함하고, FFmpeg는 `prores_ks`, `yuv422p10le`, ProRes HQ profile, PCM audio로 출력
- quick export batch: Export panel에서 여러 profile을 선택해 한 번에 render queue에 넣고, `project-profile-batch.ext` filename으로 같은 확장자 출력 충돌을 방지

남은 작업:

- 더 많은 effect graph: soft glow, advanced bloom, motion trails, optical-flow motion blur, film grain까지는 Visual FX preset/render graph에 포함됨. 남은 작업은 추가 특수 효과가 실제 사용자 요구로 확정될 때 확장.
- render farm/local worker 확장

## Phase 3: AI 편집 자동화

목표: CapCut/Filmora 템플릿보다 강한 로컬 AI 자동화.

완료 또는 기본 완료:

- ComfyUI workflow payload generation
- ComfyUI workflow preset registry
- clip-to-workflow binding UI
- editor hook event payload
- selected clip batch queue
- priority/concurrency 기반 ComfyUI scheduler
- dry-run으로 external server 없이 automation plan 검증
- optional ComfyUI `/prompt` execution
- ComfyUI output polling과 `AI Results` 후보 트랙 ingest
- undo 가능한 원본 clip replacement 확정
- 원본/결과 side-by-side review UI
- local STT queue and editable caption import
- STT caption review/cleanup and word-level timing metadata
- STT speaker diarization draft and speaker timeline review
- ComfyUI result prompt/model/workflow metadata, media analysis, cache/waveform readiness review
- ComfyUI prompt lineage/version compare
- ComfyUI workflow preset registry and clip-to-workflow binding UI
- AI B-roll gap fill
- AI transition morph
- subject-tracking smart reframe automation
- tracked object mask path with Program Monitor preview and FFmpeg alpha render
- tracking path refinement: subject reframe/object mask start-mid-end controls and stable/review quality readouts are exposed in the Inspector, generated paths store smoothing quality metadata for jump review, and manual control-point edits recalculate quality automatically
- model-hint tracking refinement: external detector/model observations are filtered by confidence, normalized, compressed into render-driving start/mid/end focal or mask-center points, and stored with accepted/rejected hint counts, average confidence, quality score, and review status on subject reframe/object mask effects
- model-backed AI effect pass: completed ComfyUI/model results can be applied from the Export batch status or AI Result Review UI as a timeline `ai` effect on the source clip, preserving model/prompt metadata, previewing pass media in Program Monitor with public renderPath normalization and explicit unavailable states for private filesystem-only paths, exposing Inspector blend/opacity/purpose/strength plus restoration and segmentation controls, and rendering the generated pass through FFmpeg `movie`, purpose filters, and blend modes instead of only importing a replacement candidate clip

남은 작업:

- model-backed AI effect metadata presets and segmentation/restoration-specific controls are implemented for the current model-pass effect contract. 남은 작업은 Danbi가 특정 built-in model을 배포할 때 필요한 실제 model binary/license 번들링과 모델별 inference UX 확장이다.
- STT acoustic embedding extraction from the local STT/audio pipeline: optional transcript/imported `speakerEmbedding` clustering, similarity threshold/margin review, ambiguous/low-similarity warnings, embedding review counts, waveform-backed fallback embedding generation, external speaker encoder command integration, and packaged speaker encoder preset manifest discovery are implemented. 남은 작업은 특정 speaker encoder 모델 binary/license 배포가 필요할 때의 실제 모델 번들링이다.
- bundled/on-device CV detection/tracking model integration if Danbi needs to generate the tracking observations itself instead of consuming model hints

## Phase 4: 플러그인 시스템

목표: 핵심 기능을 직접 수정하지 않고 확장.

완료 또는 기본 완료:

- plugin manifest
- permission model
- 내장 extension fixture runtime: FFmpeg Renderer와 ComfyUI Bridge가 command와 `before-render` render hook을 등록
- Electron IPC `extension:list/invoke` command 실행
- direct render, queued render, headless dry-run의 extension `before-render` hook 실행 결과 snapshot 보존
- ComfyUI workflow plugin manifest: 외부 plugin이 `workflow` contribution과 `comfyui` permission으로 `comfyUIWorkflows` preset을 선언하면 Inspector preset 목록, clip binding, automation payload, project JSON validator, sandbox manifest policy에 반영

남은 작업:

- 외부 plugin reviewed execution APIs. Sandbox policy, Plugins panel 상태 표시, process-isolated handshake runner, reviewed `danbi.external.inspectManifest` command, reviewed `danbi.external.analyzeTimeline` analyzer command, reviewed `danbi.external.analyzeExports` exporter command, reviewed `danbi.external.planExports` exporter output manifest command, reviewed `danbi.external.writeExports` Electron-main handoff writer command, reviewed `danbi.external.planEffects` effect-plan command, reviewed `danbi.external.planTransitions` transition-plan command, reviewed `danbi.external.runCustomCommand` manifest-declared custom command, bounded parameter overrides, Electron IPC routing, and validated Plugins-panel effect/transition-plan application are implemented.
- effect plugin: sanitized timeline snapshot 기반 `danbi.external.planEffects`, 선택 clip 대상 plan 적용 UI/API, intensity/vignetteStrength override, plugin-authored effect `parameterSchemas` project JSON 검증과 plan 적용 전 검증은 구현됨. 남은 작업은 richer custom effect API 확장.
- transition plugin: sanitized adjacency snapshot 기반 `danbi.external.planTransitions`, 선택 clip 대상 plan 적용 UI/API, duration/easing/direction/preserveAudio override, plugin-authored transition `parameterSchemas` project JSON 검증과 plan 적용 전 검증은 구현됨. 남은 작업은 richer custom transition API 확장.
- exporter plugin: sanitized export profile data 기반 `danbi.external.analyzeExports`, profile id/container/purpose/compatibility/severity/throughput threshold payload filter, request/coverage report, manifest-declared custom `export-report` command, `danbi.external.planExports` 기반 안전 상대 경로 output manifest planning, `danbi.external.writeExports` 기반 ready manifest의 `.danbi-export.json`/batch handoff materialization, plugin-authored manifest `signature` fingerprint/RSA signer verification, plugin-authored `exporterWriters.runtimePackage` file manifest/hash verification, plugin-authored `exporterWriters` declaration/trust state validation, Plugins panel readout, project-persisted approval/review/block controls, approved writer command/package fingerprint audit, bounded trustHistory audit trail, `npm run editor:external-exporter` 기반 trusted packaged declaration 또는 명시적 writer process dry-run/execute/report, `danbi-plugin-package.json` 기반 local package install/update IPC와 Plugins panel 설치 버튼, trusted signer key lifecycle/rotation policy, production RSA public key provisioning, `plugin-signing:keygen` rotation material generation, `plugin-signing:rotation-drill` 운영 리허설, `plugin-package:sign` RSA package signing, `plugin-signing:custody-audit` release-bound private-key leak audit, and production release prepare private-key env 금지 gate가 구현됨. 남은 작업은 실제 외부 exporter 코드 실행이 더 필요해질 때의 signed/bounded runtime 확장이다.
- analyzer plugin: sanitized timeline snapshot 기반 `danbi.external.analyzeTimeline`, all/visual/audio/selected scope, track/clip id, muted/locked 포함 여부, severity filter payload API, manifest-declared custom `project-summary`/`timeline-report` command는 구현됨. 남은 작업은 외부 analyzer 코드 실행이 더 필요해질 때의 signed/bounded runtime 확장이다.

## Phase 5: 작업/배포

목표: 개인 도구에서 제작 파이프라인으로 확장.

완료 또는 기본 완료:

- project package media bundle export/import
- headless batch render CLI: raw project JSON 또는 portable `.danbi-project.json`을 입력으로 받아 selected/all export profile을 dry-run 또는 실제 FFmpeg render로 실행
- local network render worker handoff manifest: headless CLI가 `--handoff <path>`로 profile별 preflight, FFmpeg command, extension hook snapshot, worker CLI command를 담은 JSON manifest를 생성
- local network render worker CLI: `npm run editor:render-worker -- --manifest <handoff.json>`가 handoff를 읽고, blocked preflight job은 기본 보호하며, 선택 job dry-run/실행과 JSON report 작성을 지원. `third_party/source-mirrors`는 앱 번들에 연결하지 않음
- local network render worker daemon: `npm run editor:render-worker-daemon`가 `GET /health`, `GET /status`, `POST /runs`, `GET /runs/:id`, `GET /runs/:id/events`, WebSocket `/events`를 제공하고, controller UI 또는 다른 로컬 머신이 handoff를 제출하고 report, SSE progress event, daemon-wide fleet status event를 조회할 수 있음
- Export workspace render worker controller: editor UI에서 daemon/fleet discovery, manual remote daemon URL enrollment, worker selection, daemon URL/cwd/executable/dry-run/blocked/auto-route 옵션을 설정하고, portable project package를 export한 뒤 선택된 export profile handoff를 least-loaded discovered/enrolled daemon에 제출하며 WebSocket fleet status stream, SSE progress stream, polling fallback으로 run report와 job-level progress snapshot을 갱신
- job history dashboard: Export panel이 render job list, media-cache job, ComfyUI batch, STT job을 하나의 운영 요약으로 합쳐 active/failed/completed/cancelled 상태와 최근 작업을 표시
- shared asset library: Media Bin에서 Title Card, Lower Third, End Card, Chapter Divider reusable local text asset을 `Shared Library` bin에 추가하고 기존 source range, timeline insert/overwrite, Program Monitor, FFmpeg title burn-in 경로로 사용
- API token: `DANBI_EDITOR_API_TOKEN`이 설정되면 `/api/editor/*` 호출은 `Authorization: Bearer <token>`, `X-Danbi-Editor-Api-Token`, 또는 `X-Danbi-Api-Token`이 필요하다. 편집기 UI는 sidebar API Token panel에 저장된 local browser/Electron renderer token을 공통 client wrapper가 붙인다.
- webhook automation: Automation Hooks panel과 `/api/editor/hooks`는 명시적 `executeWebhooks=true`일 때 allowlist/local guard/API token gate를 통과한 webhook만 실행하고, scoped `DANBI_EDITOR_WEBHOOK_SECRET_<NAME>` bearer token, body redaction, timeout, 429/5xx/network retry, per-hook delivery summary를 제공한다.
- optional cloud sync: Electron Project panel의 Sync folder가 OneDrive/Google Drive/Dropbox 같은 사용자가 관리하는 동기화 폴더에 portable `project.danbi-project.json`, media bundle, `danbi-cloud-sync.json`, root `danbi-cloud-sync-index.json`을 쓴다. 같은 project의 원격 manifest가 더 최신이면 기본 overwrite를 차단하고 conflict 상태를 반환한다.
- render worker central trust governance: controller helper가 중앙 trust policy를 평가해 localhost worker는 허용하되 원격 worker는 Trust 등록과 Pair token 요구를 기본값으로 강제하고, worker/origin allowlist/blocklist, fleet summary, per-worker reason을 제공한다. Export workspace Submit/auto-route는 이 정책을 통과한 worker만 사용한다.

남은 작업:

- Phase 5 필수 항목은 현재 코드 기준 완료. 이후는 운영 규모가 커질 때의 provider 연동/관리 서버화 같은 별도 제품 범위다.

## CapCut/Shotcut/Filmora 대비 차별점

- CapCut보다 나아야 하는 부분: 로컬 모델, 무제한 자동화, 워터마크 없는 개인 파이프라인
- Shotcut보다 나아야 하는 부분: AI 생성/보정/자막 자동화, 현대적인 타임라인 UI
- Filmora보다 나아야 하는 부분: 템플릿 의존이 아닌 workflow 기반 커스터마이징

## 성공 기준

- 10분짜리 영상을 import해서 컷 편집, 자막, B-roll 생성, export까지 한 화면에서 완료
- 선택한 클립 10개를 ComfyUI batch로 보내고 결과를 asset/timeline에 자동 반영
- 같은 project JSON을 UI, renderer, automation API가 모두 해석
- Implementation note 2026-06-13: Phase 1 linked V/A editing includes manual unlink/link in addition to patch targeting, synced selection, movement, destructive edits, paste/overwrite/duplicate, split/trim/slip/roll/slide, and range lift/extract tail relinking.
- Implementation note 2026-06-13: Phase 1 timeline editing includes ripple Trim In/Out and ripple edge trim, with downstream clips shifted on affected tracks.
- Implementation note 2026-06-13: Phase 1 timeline editing includes Close Gap on the selected track, including linked V/A movement preservation.
- Implementation note 2026-06-13: Phase 1 timeline editing includes non-overlap clip movement for drag and nudge operations, with linked V/A groups moving as one unit.
- Implementation note 2026-06-13: Phase 1 timeline editing includes non-overlap edge trim for ordinary trim mode and downstream-shifting edge trim for Ripple mode.
- Implementation note 2026-06-13: Phase 1 transition editing includes auto-overlap creation for FFmpeg xfade transitions, including linked V/A downstream movement.
- Implementation note 2026-06-13: Phase 1 inspector editing includes linked-safe numeric Start/Duration controls backed by the same timeline move/trim core as pointer edits.
- Implementation note 2026-06-13: Phase 1 track editing includes opt-in sync-lock for ripple insert/extract/delete/close-gap multi-track alignment.
- Implementation note 2026-06-16: Timeline group move now supports drag-to-new-track creation. The shared group move resolver emits deterministic new track insert plans for lane-above/lane-below drops, rejects mixed-kind or overlapping collapsed groups, renderer drag preview/commit plans expose the new target, and `moveClipsToNewTrackAtTime` inserts the track while preserving the same anchor-time move semantics as existing-track drops.
- Implementation note 2026-06-16: Timeline media file drop now performs track compatibility routing for mixed batches. Dragging video and pure audio files together onto a visual lane remains a valid drop: visual files commit to the requested lane, pure audio files route to the active editable audio patch track, preview validity reflects that routing, and insert/overwrite commits keep the sequential drop cursor and cache job mapping intact.
- Implementation note 2026-06-13: Tracked object mask is implemented as a renderable mask effect with start/mid/end center paths, Program Monitor preview, Inspector parameters, and FFmpeg `geq` alpha output. Remaining motion/object-mask roadmap work now means bundled/on-device CV detection only if Danbi must produce tracking observations itself.
- Implementation note 2026-06-15: Tracking path refinement now exposes render-driving start/mid/end focal and mask-center controls plus stable/review quality readouts in the Inspector, applies deterministic smoothing to generated tracking points, stores quality score/max-jump/review-needed metadata on subject reframe and object mask effects, and recalculates that metadata when effect parameter edits move the tracking control points. Remaining work is no longer editable-path refinement; it is bundled/on-device CV detection/tracking execution beyond consuming external model hints.
- Implementation note 2026-06-16: `src/lib/editor/tracking-path.ts` now accepts external detector/model tracking observations with optional confidence and box size, rejects low-confidence or malformed hints, compresses dense observations into start/mid/end control points, records hint telemetry, and feeds the same render-driving parameters used by subject reframe and object mask effects. `applySubjectTrackingReframe` and `applyTrackedObjectMask` can consume these model hints directly. Remaining work is only bundled/on-device CV detection/tracking model execution when Danbi must create the observations locally.
- Implementation note 2026-06-15: Preview worker still/thumbnail frame delivery is implemented with a browser worker at `public/editor-preview-worker.js`, tested request/result planning in `src/lib/editor/preview-worker.ts`, renderer lifecycle wiring in `src/electron/renderer/preview-worker-controller.ts`, and Program Monitor overlay telemetry for frame-delivery success/failure/unsupported states. Video layer frame requests now carry a separate decode source kind, allowing cached thumbnails to decode through the ImageBitmap path while remaining counted as video-layer delivery. The worker now also has raw video paths for QuickTime-compatible MP4/MOV/M4V/QT extension routing, progressive MP4/H.264 with CTTS/edit-list timing, compact `stz2` sample-size tables, 64-bit `co64` chunk offset tables with safe-integer/truncation guards, and MP4 orientation metadata, common FFmpeg fragmented MP4/H.264 with CTTS/edit-list timing, consecutive `trun` data cursor handling, and MP4 orientation metadata, MP4/H.265 HEVC, WebM/VP8, WebM/VP9, WebM/AV1, Matroska H.264/H.265 `CodecPrivate`, and Xiph/fixed/EBML laced WebM/VP8: it demuxes MP4 sample tables, `moof/traf/trun` fragments, H.265 `hvcC` sample descriptions, MP4 `edts/elst` timeline offsets, MP4 `tkhd` display matrices, WebM EBML `Cluster` blocks, or Matroska AVC/HEVC track private data, expands laced WebM blocks into individual frame chunks, decodes from the prior keyframe through WebCodecs `VideoDecoder`, transfers the chosen frame as `ImageBitmap`, and falls back to the cached thumbnail when unsupported or failed. The renderer keeps the latest decoded worker frame as an object URL and displays it for paused/scrubbed video layers when the timestamp matches the media time. Playwright covers mocked transferable `ImageBitmap` delivery plus capability-gated real browser worker smoke for imported progressive MP4, QuickTime-compatible QT/H.264, fragmented MP4, MP4 with edit-list timing, rotated MP4 orientation metadata, MP4/H.265 HEVC, Matroska H.264/H.265, WebM/VP8, WebM/VP9, WebM/AV1, and Xiph/fixed/EBML laced WebM/VP8 when worker WebCodecs support is exposed; Vitest covers QuickTime-compatible extension routing, MP4 edit-list timeline correction, compact `stz2` sample-size expansion, MP4 `co64` chunk offset handling, fragmented MP4 consecutive `trun` data cursor continuity, Matroska H.264/H.265 track parsing, and orientation draw planning directly against worker internals. Remaining preview-worker roadmap work means more complex MP4/WebM variants and additional browser-exposed codec/profile coverage.
- Implementation note 2026-06-13: Local AI enhancement presets now apply as real timeline `ai` effects, upsert one effect per visual clip, expose Inspector parameters, preview in Program Monitor, and render through FFmpeg `hqdn3d`, `unsharp`, `eq`, `deband`, and `vignette`. Implementation note 2026-06-16: model-backed effect passes are now represented as renderable timeline `ai` effects. `applyComfyUIResultAsAiEffectPass` stores a completed ComfyUI/model result on the source clip with model/prompt metadata, Export/AI Result Review actions apply those passes beside import/replace, Program Monitor previews pass media overlays with opacity/blend and public renderPath source normalization, Inspector controls tune pass blend/opacity, and `ffmpeg-renderer` renders the external pass through FFmpeg `movie`, scale/pad, and `blend` filters with opacity and blend mode. Implementation note 2026-06-17: model-backed effect passes now have Danbi-owned metadata presets for restoration detail, segmentation matte, and beauty retouch. Presets set default blend/opacity/purpose/strength and expose Inspector controls for purpose, pass strength, restoration detail/texture guard, segmentation edge feather/foreground mix/spill cleanup; FFmpeg render uses strength-scaled blend opacity plus purpose filters such as matte feather blur and restoration detail unsharp. Remaining AI-effect roadmap work is actual model binary/license bundling only if Danbi ships built-in model bundles.
- Implementation note 2026-06-13: Color grading presets now include Filmic curve, Matte fade, Punch curve, and uploaded local LUT looks as real timeline `color` effects. Reapplying a preset replaces stale color-preset parameters, LUT upload stores `.cube`/`.3dl`/`.dat`/`.m3d`/`.csp` files under `public/luts`, Inspector can tune brightness/contrast/saturation/gamma/temperature/tint and curve shadow/mid/high points, Program Monitor approximates the look, and FFmpeg renders `eq`, `colorbalance`, `curves`, and `lut3d`. Remaining color roadmap work means GPU preview acceleration and calibrated external monitor output.
- Implementation note 2026-06-13: Adjustment layers are implemented as effect clips on effect tracks. Color/LUT/FX/AI FX effects on an adjustment layer apply to lower video/image layers in Program Monitor and to overlapping lower clips in FFmpeg render plans through `enable` expressions, with partial Pixelate warnings and parity tests covering the old effect-layer warning removal.
- Implementation note 2026-06-13: Program Monitor video scopes are implemented with RGBA frame sampling, deterministic luma histogram, waveform, RGB Parade channel waveform, vectorscope, average/low/peak readouts, selected-layer targeting, and core tests in `src/lib/editor/video-scopes.ts`.
- Implementation note 2026-06-13: Stabilize presets now apply Light/Standard/Strong/Action lock as real timeline `stabilize` effects, upsert one deshake effect per selected video clip, skip non-video selections, expose Inspector parameters, and render through FFmpeg `deshake`.
- Implementation note 2026-06-13: Visual FX presets now apply as real timeline `filter` effects for soft blur, crisp sharpen, vignette, pixelate, privacy blur, and green-screen chroma key. The UI can batch-apply them, Inspector parameters can tune them, Privacy blur stores start/mid/end region points, Program Monitor shows interpolated preview hints including privacy-region overlays, and FFmpeg renders `boxblur`, `unsharp`, `vignette`, pixelate scale, expression-driven `delogo`, and `chromakey` filters. Implementation note 2026-06-17: Soft glow, advanced bloom, motion trails, optical-flow motion blur, and film grain are also renderable Visual FX presets. Soft glow exposes glow radius/intensity/saturation controls and renders through FFmpeg `gblur` plus `eq`; advanced bloom exposes bloom radius/intensity/threshold/saturation controls and renders through FFmpeg `curves`, `gblur`, `eq`, and `unsharp`; motion trails exposes trail frame/decay controls and renders through FFmpeg `tmix`; optical-flow motion blur exposes flow frame/strength/search controls and renders through FFmpeg `minterpolate` plus `tmix`; film grain exposes grain strength/seed controls and renders through FFmpeg `noise`. Remaining Visual FX roadmap work means GPU preview acceleration and model-assisted tracking/refinement.
- Implementation note 2026-06-13: Audio cleanup presets now apply as real timeline `audio` effects for Voice clean, Noise reduce, Broadcast comp, and De-ess. The UI can batch-apply them to audio/video-audio clips, Inspector parameters can tune them, Program Monitor approximates makeup gain, and FFmpeg renders `highpass`, `lowpass`, `afftdn`, `acompressor`, `equalizer`, and `alimiter` filters. Remaining audio roadmap work after the 2026-06-15 EQ, spectral repair, waveform-derived analyzer, and live Web Audio FFT passes means finer-grained spectrum tooling only if needed.
- Implementation note 2026-06-15: Multi-band EQ is implemented through the existing audio cleanup preset workflow. The preset exposes editable low/body/presence/air band frequency, gain, and Q parameters in the Inspector and renders those bands through FFmpeg `equalizer` filters without adding external dependencies.
- Implementation note 2026-06-15: Spectral repair is implemented through the existing audio cleanup preset workflow. The preset exposes editable rumble highpass, hum notch, denoise, and hiss lowpass parameters in the Inspector and renders those repairs through built-in FFmpeg filters without adding external DSP dependencies.
- Implementation note 2026-06-15: Program audio analyzer preview is implemented through `src/lib/editor/audio-analyzer.ts`, `program-audio-graph-controller.tsx`, Program Monitor overlay wiring, Scene readout summaries, and core tests. It shows peak, RMS, crest factor, stereo balance, mono compatibility, density, and local energy bands from waveform-backed active audio layers while live playback adds Web Audio FFT low/mid/high spectrum bands from the preview audio graph.
- Implementation note 2026-06-17: Render preflight reuses that Program audio analyzer without adding extension runtime dependencies, samples playhead/requested/export-range points, and raises `audio` warning issues for channel imbalance, dense compression, and low mono compatibility before queued, direct, worker, or headless renders proceed.
- Implementation note 2026-06-15: FCPXML cut interchange is implemented through `src/lib/editor/fcpxml.ts`, `/api/editor/fcpxml`, renderer download/import wiring, and Export panel buttons. It exports media asset clips, title/text clips, crossfade/dip/push/wipe transition metadata, timeline offsets, source starts, durations, Danbi track/clip metadata, and marker duration/notes, and imports that subset back into validated project JSON. Imported overlapping transition timelines reconnect to the existing FFmpeg `xfade` render path. Implementation note 2026-06-16: Danbi-to-Danbi FCPXML round trips now preserve regular clip effects, keyframes, incoming transitions, and Danbi-only outgoing transitions such as match-cut/AI morph as sanitized `data-danbi-*` metadata that external NLEs can ignore while Danbi can restore on import. Remaining FCPXML work means NLE-specific title templates/generators, native transition templates, and external-NLE-native effect mapping beyond the Danbi metadata contract.
- Implementation note 2026-06-15: Job History dashboard is implemented through `src/electron/renderer/job-history-workflow-helpers.ts`, `src/electron/renderer/job-history-panel.tsx`, render job list polling in `/editor`, and Export panel wiring. It deduplicates render job snapshots, keeps active queue updates visible, and summarizes media-cache, ComfyUI, and STT background jobs in one production operations panel.
- Implementation note 2026-06-15: Local network render-worker handoff is implemented through `src/electron/main/render-worker-handoff.ts`, `src/electron/main/headless-render-engine.ts`, and `scripts/headless-render-entry.ts`. `npm run editor:headless-render -- --project <project> --profile <id> --handoff <manifest.json>` writes a JSON manifest with project summary, per-profile preflight status, FFmpeg command, extension hook snapshot, output path, and exact headless worker command. `src/electron/main/render-worker-runner.ts` and `scripts/render-worker-entry.ts` add the first worker boundary: `npm run editor:render-worker -- --manifest <manifest.json> --dry-run --report <report.json>` claims selected jobs, preserves blocked preflight jobs unless overridden, executes via the generated headless command, and writes a report. `src/electron/main/render-worker-daemon.ts` and `scripts/render-worker-daemon-entry.ts` add the HTTP/WebSocket daemon boundary with health/status/run submission/report endpoints, `GET /runs/:id/events` SSE streaming, WebSocket `/events` daemon-wide fleet status events, `--max-runs` capacity scheduling, run lease metadata, optional `--auth-token`/`DANBI_RENDER_WORKER_AUTH_TOKEN` Pair token protection for status, run, SSE, and WebSocket endpoints, and optional `--discovery` UDP LAN announcements for zero-config worker discovery. `src/electron/main/render-worker-discovery.ts`, `src/electron/shared/editor-api.ts`, `src/electron/shared/ipc-contract.ts`, and `src/electron/renderer/render-worker-client.ts` expose Electron main-side LAN probes through preload IPC so the renderer can merge discovered worker URLs with manual candidates before the authenticated `/status` probe. `src/electron/renderer/render-worker-controller-helpers.ts` and `src/electron/renderer/render-worker-controller-panel.tsx` connect the Export workspace to that daemon: the UI discovers local/LAN daemon candidates as a selectable fleet, enrolls manual remote daemon URLs, persists non-secret trusted worker URL/ID records with Trust/Forget, sends the Pair token without saving it, checks status, exports a portable project package, builds a license-safe handoff from selected export profiles, auto-routes submission to the least-loaded live daemon when enabled, listens for WebSocket fleet status events and SSE progress events, shows running/queued/capacity/lease state, and keeps polling as a fallback. `src/electron/shared/render-worker-contract.ts` now carries live progress snapshots/events, daemon fleet events, run leases, `authRequired`, and discovery announcements, and the daemon updates pending/running/planned/completed/blocked/skipped/failed counts plus visible job statuses while a run is still active. Implementation note 2026-06-16: `src/electron/renderer/render-worker-controller-helpers.ts` now provides central trust policy/governance decisions and summaries. The default policy allows localhost workers, requires remote workers to be enrolled in the Trust registry, requires remote Pair token protection, supports worker/origin allowlists and blocklists, filters auto-route candidates, and blocks Submit before package export when the selected worker fails policy. `src/electron/renderer/render-worker-controller-panel.tsx` shows the fleet policy summary and per-worker allow/block reason.
- Implementation note 2026-06-16: External exporter writer package distribution now has a verified execution and install boundary. `runtimePackage` metadata is validated at project JSON/sandbox boundaries, included in Plugins panel and reviewed handoff JSON, folded into writer approval fingerprints, and checked by `src/electron/main/external-exporter-runner.ts` before trusted declared writer execution. The runner validates package root containment, entry listing, regular-file status, declared byte size, and `sha256-` digest; mismatches block execution before spawn. `src/electron/main/plugin-package-installer.ts` reads `danbi-plugin-package.json`, verifies manifest signatures and package file hashes, copies safe `plugins/`/`tools/` paths into the Electron package root, saves the updated project through typed IPC, and the Plugins panel exposes install/update. `src/lib/editor/plugin-signature.ts` now evaluates trusted RSA key lifecycle metadata so revoked/expired keys block otherwise valid signatures and retiring keys remain visible but accepted, and now includes a production RSA public key generated by `scripts/plugin-signing-keygen.mjs`. `scripts/plugin-signing-readiness.mjs` exposes release readiness, validates RSA public-key material, `scripts/plugin-signing-rotation-drill.mjs` rehearses rotation scenarios without writing private keys, `scripts/plugin-package-sign.mjs` signs package manifests and refreshes package/runtimePackage hashes while enforcing private-key custody boundaries, `scripts/plugin-signing-custody-audit.mjs` blocks private-key body/path leaks from release-bound outputs and supports production release private-key env prohibition, and `electron:release:prepare` records readiness plus custody audit status in the release manifest while forbidding plugin signing private-key env in production channel.
- Implementation note 2026-06-16: ComfyUI workflow plugin manifests are now supported without importing external plugin files. `EditorPluginManifest.comfyUIWorkflows` declares workflow preset id/label/workflowName/prompt metadata/required node types/primitive parameters behind `workflow` contribution and `comfyui` permission. `src/lib/editor/comfyui-workflows.ts` merges those plugin presets with built-ins using collision-safe `plugin:<pluginId>:<presetId>` ids, the Inspector preset select is project-aware, clip binding and `buildComfyUIAutomationPlan` preserve plugin source metadata in dry-run/execution payloads, and both project JSON validation and sandbox handshake validation reject malformed workflow preset declarations.
- Implementation note 2026-06-15: Voiceover recording is implemented as a renderer workflow helper and Media Bin control. It uses browser `MediaRecorder` support detection, creates deterministic voiceover take filenames, imports recorded audio through the same media upload/cache path, marks assets with `voiceover` metadata, and inserts the result onto the active audio patch track at the playhead with undo/history, selection, cache jobs, and on-import hooks preserved.
