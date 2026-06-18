# Danbi Studio 편집기 기술 구조

> 문서 우선순위: 완성 판정과 단계 진행은 `EDITOR_COMPLETION_DEFINITION_KR.md`를 우선한다. 외부 소스 반입 여부와 라이선스 경계는 `THIRD_PARTY_SOURCE_REGISTER_KR.md`를 우선한다. 이 문서는 현재 기술 구조와 모듈 경계를 설명한다.

## 레이어

1. UI 레이어
   - 위치: `src/app/editor/page.tsx`
   - 역할: 미디어 bin, source/program monitor, timeline, inspector, export panel, queue status를 표시한다.
   - 원칙: UI 상태 변경은 가능한 한 `src/lib/editor`의 순수 함수 또는 API route를 통해 수행한다.

2. 프로젝트 코어
   - 위치: `src/lib/editor/types.ts`, `src/lib/editor/project.ts`, `src/lib/editor/project-store.ts`
   - 역할: 편집기 프로젝트 JSON 스키마, 기본 프로젝트 생성, SQLite 저장/불러오기를 담당한다.
   - 마이그레이션: 저장된 기존 프로젝트를 로드/저장할 때 기본 export profile과 plugin manifest 누락분을 자동 보강한다.
   - 패키지: `.danbi-project.json` export/import는 프로젝트 JSON, asset 경로 manifest, cache reference, reimport warning을 함께 보존한다.
   - 포함: assets, tracks, clips, effects, keyframes, transitions, captions, markers, plugins, exportProfiles

3. 타임라인 조작 코어
   - 위치: `src/lib/editor/timeline.ts`, `src/lib/editor/clip-timing.ts`
   - keyframe policy: clip position/scale/rotation/opacity/volume keyframes are edited through pure timeline functions and surfaced in the Inspector. Easing values include hold, linear, ease in, ease out, ease in/out, and legacy smooth, with shared preview/render interpolation semantics.
   - motion policy: static clip position/scale/rotation is stored as a Motion effect and used as the preview/render fallback under keyframe automation.
   - 역할: split, trim, move, slip, roll, slide, duplicate, delete, range edit, paste, source range insert/overwrite, V/A source patch insert/overwrite, linked clip selection/move/delete/paste/overwrite/duplicate/split/trim/slip/roll/slide/range sync, marker/caption 조작을 순수 함수로 처리한다.
   - speed 정책: timeline delta를 source delta로 변환할 때 playback speed helper를 사용한다.

3-1. 타임라인 renderer workflow
   - 위치: `src/electron/renderer/timeline-workspace-helpers.ts`, `src/electron/renderer/timeline-transport-ruler.tsx`, `src/electron/renderer/timeline-clip-list.tsx`
   - 역할: timeline width, active clip, marked range, loop range, viewport render window, visible clip filtering을 계산한다.
   - 장편 정책: scroll viewport와 zoom에서 visible time range를 만들고 overscan 밖의 clip DOM을 제외한다. 선택 clip은 viewport 밖이어도 유지해 Inspector/edit state를 잃지 않는다.

4. 자동화/렌더 계약
   - 위치: `src/lib/editor/automation.ts`
   - 역할: 타임라인을 ComfyUI automation plan과 export manifest로 변환한다.
   - 출력: automation plan, render graph, export issue, webhook/generate payload의 기반 데이터

5. 편집 이벤트 hook
   - 위치: `src/lib/editor/hooks.ts`, `src/app/api/editor/hooks`
   - 역할: `manual`, `on-import`, `before-export`, `on-gap` 이벤트를 automation rule과 매칭한다.
   - 출력: local action summary, optional updated project, ComfyUI job, generate payload, webhook payload
   - local 적용: `applyLocalActions=true`일 때 caption burn-in style, master loudness/true-peak, color-match effect를 프로젝트에 반영한 `appliedProject`를 반환한다.
   - 현재 정책: 외부 webhook은 기본 hook plan에서는 payload 준비까지만 수행하고, 사용자가 `executeWebhooks=true`를 명시했을 때만 실행한다. 실행 경계는 `/api/editor/*` API token gate, webhook allowlist/localhost guard, timeout, retry, scoped `DANBI_EDITOR_WEBHOOK_SECRET_<NAME>` bearer token, request body redaction으로 분리한다.

6. ComfyUI 브리지
   - 위치: `src/lib/editor/comfyui-bridge.ts`
   - 역할: automation plan을 기존 `/api/generate` 호환 payload로 변환한다.

7. ComfyUI 배치 큐
   - 위치: `src/lib/editor/comfyui-queue.ts`, `src/app/api/editor/comfyui-jobs`
   - 역할: 선택 클립 기반 ComfyUI automation batch를 queued/running/completed/failed/cancelled 상태로 관리한다.
   - 실행 모드: 기본은 `execute=false` dry-run으로 payload와 plan을 검증한다. `execute=true`일 때 workflow를 load/inject한 뒤 ComfyUI `/prompt`로 보낸다.
   - queue 정책: `src/lib/editor/queue-settings.ts`의 `comfyuiConcurrency`와 `defaultComfyUIPriority`를 사용한다.
   - 상태 저장: 로컬 개발은 `.danbi/jobs/comfyui.json`, Electron 패키지는 `userData/jobs/comfyui.json`에 snapshot을 저장하고 서버 재시작 중 queued/running이던 job은 interrupted failed 상태로 복구한다.
   - 결과 처리: 실제 실행 job은 ComfyUI history를 polling하고 output을 로컬 개발에서는 `.danbi/outputs`, Electron 패키지에서는 `userData/outputs`로 복사한 뒤 `/outputs/...` route를 통해 preview용 `source`, FFmpeg용 `renderPath`, prompt/model/workflow metadata, `ffprobe` media analysis, thumbnail/proxy/waveform cache manifest를 snapshot에 기록한다.
   - job 제어: list, get, cancel, retry API를 제공한다.

8. ComfyUI 결과 적용
   - 위치: `src/lib/editor/comfyui-results.ts`, `src/app/editor/page.tsx`
   - 역할: completed ComfyUI result snapshot을 프로젝트 asset과 `AI Results` 후보 트랙 clip으로 변환하고, 편집 화면에서 원본/결과를 side-by-side로 검수한다.
   - review 기준: prompt/model/workflow, prompt lineage/version compare, duration/resolution mismatch, cache/proxy/waveform readiness, ffprobe/cache warning을 표시한다.
   - 정책: 기본은 원본 clip을 유지하고 같은 시간대에 후보 clip을 올린다. 사용자가 승인하면 undo 가능한 `replace-source` 모드로 원본 clip의 asset을 결과 asset으로 교체한다.

9. ComfyUI workflow preset/binding
   - 위치: `src/lib/editor/comfyui-workflows.ts`, Inspector `ComfyUI Binding`
   - 역할: 내장 workflow preset을 제공하고 선택 clip의 generation binding에 preset/workflow/prompt/negative prompt/seed/parameters를 저장한다.
   - payload 정책: preset 기본값, project automation rule parameters, clip generation parameters 순서로 병합해 clip별 override가 최종 ComfyUI job에 반영된다.

10. AI B-roll gap fill
   - 위치: `src/lib/editor/ai-broll-gap-fill.ts`, timeline `AI Fill`
   - 역할: non-audio 트랙의 visual coverage를 병합해 실제 빈 화면 구간을 찾고, `AI B-roll` 트랙에 ComfyUI draft clip을 배치한다.
   - 정책: 이미 채워진 draft도 visual coverage에 포함해 중복 생성하지 않고, 생성 clip은 기존 ComfyUI batch automation path를 그대로 사용한다.

11. AI transition morph
   - 위치: `src/lib/editor/timeline.ts`, `src/lib/editor/automation.ts`, Inspector `Transition Out`
   - 역할: outgoing `ai-morph` transition을 ComfyUI `transition-morph` job으로 변환한다.
   - payload 정책: source clip, adjacent next clip, transition duration, preset id를 payload에 포함하고 FFmpeg는 생성 결과가 없을 때 warning/fallback을 유지한다.

12. Subject-tracking smart reframe
   - 위치: `src/lib/editor/subject-tracking-reframe.ts`, Inspector Effects `Track`, `src/lib/editor/ffmpeg-renderer.ts`
   - 역할: 선택 visual clip에 tracked reframe effect를 upsert하고 start/mid/end focal path를 저장한다.
   - preview/render 정책: Program Monitor는 clip local time으로 focal point를 보간하고 FFmpeg는 같은 값을 dynamic crop expression으로 렌더한다.

13. 미디어 import/cache
   - 위치: `src/lib/editor/media-import.ts`, `src/lib/editor/media-analyzer.ts`, `src/lib/editor/media-cache.ts`, `src/lib/editor/media-cache-queue.ts`, `src/lib/editor/job-store.ts`, `src/app/api/editor/media`, `src/app/api/editor/media-cache`, `src/electron/renderer/import-file-routing-helpers.ts`, `src/electron/main/native-media-import-engine.ts`
   - 역할: 업로드 파일 저장, `ffprobe` 분석(duration/display resolution/coded resolution/sample-display aspect ratio/video rotation/JPEG EXIF orientation/FPS/codec/audio), thumbnail/proxy/waveform cache job 생성, asset/clip 연결
   - routing 정책: video/audio/image media는 Media Bin asset/cache 경로로 보내고, `.srt/.vtt` caption sidecar는 FFmpeg 분석 없이 caption parser/import workflow로 보낸다.
   - relink 정책: 패키지 import 뒤 누락된 source/renderPath는 기존 asset id와 timeline clip을 유지한 채 같은 media kind 파일로 교체한다.
   - health 정책: Media Health report가 volatile source, missing renderPath, thumbnail/proxy/waveform cache gap, missing asset reference를 blocked/warning으로 분류한다.
   - queue 정책: `mediaCacheConcurrency`와 priority 기반 pending 정렬을 사용한다.
   - preview 정책: program monitor는 proxy가 있으면 proxy를 우선 사용하고 export는 원본 `renderPath`를 사용한다.

10. 프로젝트 API
   - 위치: `src/app/api/editor/projects`
   - 역할: SQLite에 편집 프로젝트 JSON 저장, 목록 조회, 단건 로드/수정/삭제

11. FFmpeg render plan
   - 위치: `src/lib/editor/ffmpeg-renderer.ts`, `src/lib/editor/ffmpeg-capabilities.ts`, `src/app/api/editor/render-plan`, `src/app/api/editor/ffmpeg-capabilities`
   - 역할: timeline asset과 export profile을 FFmpeg input, filter graph, command argument로 변환한다.
   - transition 정책: same-track overlap은 FFmpeg `xfade`로 crossfade/dip/push/wipe를 렌더하고, push/wipe direction과 duration을 transition metadata에서 읽는다.
   - keyframe render policy: transform, opacity, and audio-volume keyframes are converted into FFmpeg frame/audio expressions.
   - motion render policy: static Motion transforms use the same FFmpeg transform filter path as animated keyframes.
   - 지원 효과: text motion, audio gain/cleanup/ducking, crop mask, tracked object mask, smart reframe, stabilize/deshake, Visual FX presets including privacy blur, green-screen chroma key, soft glow, advanced bloom, motion trails, optical-flow motion blur, and film grain, local AI enhancement presets, ComfyUI/model-backed AI effect passes with purpose-specific restoration/segmentation controls, color eq/curves/lut3d, color match temperature/tint를 filter graph로 변환한다.
   - encoder 정책: 서버 API는 `ffmpeg -encoders` 결과를 파싱해 H.264/H.265/AV1 hardware encoder를 자동 선택하고, 없으면 profile codec에 맞는 software encoder로 fallback한다.
   - profile 정책: master/social/proxy 목적을 구분하고, `Proxy Review 540p`는 low-bitrate H.264 `veryfast`/CRF 옵션으로 빠른 검수 파일을 만든다.
   - output path 정책: `src/lib/editor/render-output.ts`가 profile container별 기본 파일명/확장자와 선택 output path 검증을 담당하고, `src/lib/editor/render-preflight.ts`가 mismatch/no-extension/directory/empty path를 `output` blocked issue로 병합한다. Node 실행 경계에서는 `src/server/editor/render-output-access.ts`가 실제 target file/directory 접근성을 probe해 direct, queued, headless render preflight에 같은 `output` issue로 붙인다.
   - 주의: browser `blob:` URL은 FFmpeg CLI에서 직접 접근할 수 없으므로 import 단계에서 서버 파일 경로로 매핑해야 한다.

12. FFmpeg render execution/queue
   - 위치: `src/app/api/editor/render`, `src/app/api/editor/render-jobs`, `src/lib/editor/render-queue.ts`
   - 역할: direct render, queued render, progress, cancel, retry, persistent snapshot을 제공한다.
   - queue 정책: `renderConcurrency`와 priority 기반 pending 정렬을 사용한다.
   - 진단: `src/lib/editor/render-diagnostics.ts`가 stderr/plan warning/error를 category, retryable, action hint로 변환하고, `src/electron/renderer/render-diagnostic-view.ts`가 Render Status/Job History용 primary action, retry label, evidence 표시 모델로 변환한다.

13. Program preview stack
   - 위치: `src/lib/editor/preview.ts`
   - 역할: playhead 기준 media/text/effect/audio layer를 track order, mute/solo/lock, clip mute, keyframe, speed에 맞춰 계산한다.
   - UI 사용: program monitor가 active video/image media layers를 opacity/blend/transform 기준으로 합성하고 text/caption/effect/keyframe/audio metadata overlay를 표시한다.

14. Preview/render parity
   - 위치: `src/lib/editor/preview-render-parity.ts`
   - 역할: preview stack과 FFmpeg render plan 사이의 unsupported effect, browser-only source, AI model-pass preview-unavailable path, plan warning 차이를 보고한다.
   - UI 사용: Export Plan panel이 선택 export profile 기준 blocked/warning count와 issue를 표시한다.

14-1. Caption render preflight
   - 위치: `src/lib/editor/caption-preflight.ts`, `src/lib/editor/render-preflight.ts`, `src/electron/renderer/preflight-issue-helpers.ts`
   - 역할: caption timing, empty text, overlap, project-duration overflow를 렌더 전 검토 issue로 변환한다.
   - UI 사용: caption issue는 `captionId`와 `time`을 포함해 Export Preflight에서 관련 caption/time으로 focus할 수 있다.

15. Queue settings
   - 위치: `src/lib/editor/queue-settings.ts`, `src/app/api/editor/queue-settings`
   - 역할: render, media-cache, ComfyUI worker concurrency와 기본 priority를 중앙에서 관리한다.

16. Keyboard/context command map
   - 위치: `src/lib/editor/keyboard-map.ts`, `src/app/editor/page.tsx`
   - 역할: playback, edit, trim, timeline, export command 목록을 UI와 help/context 동작에 공유한다.

17. Local STT caption queue/review
   - 위치: `src/lib/editor/stt-transcript.ts`, `src/lib/editor/stt-queue.ts`, `src/lib/editor/stt-caption-review.ts`, `src/app/api/editor/stt-jobs`
   - 역할: 선택한 audio/video-audio clip을 로컬 STT 엔진으로 보내고 transcript를 editable caption segment로 변환한다.
   - 엔진: 기본은 `DANBI_STT_BINARY` 또는 `whisper` CLI이며, `DANBI_STT_COMMAND` 템플릿으로 whisper.cpp/faster-whisper 같은 도구를 연결할 수 있다.
   - speaker encoder: transcript가 embedding을 제공하지 않는 경우 `DANBI_STT_SPEAKER_ENCODER_COMMAND`가 `{manifest}` caption source-range JSON을 받아 voiceprint embedding을 돌려줄 수 있고, 실패/누락 시 waveform-backed embedding fallback으로 이어진다.
   - 출력: JSON/SRT/VTT/plain transcript를 parser가 정규화하고, clip의 `sourceIn`, speed, timeline start에 맞춰 caption timing과 word-level timing을 보정한다.
   - queue 정책: `sttConcurrency`와 `defaultSttPriority`를 사용하고 로컬 개발은 `.danbi/jobs/stt.json`, Electron 패키지는 `userData/jobs/stt.json`에 snapshot을 저장한다. Transcript/encoder 작업 파일은 로컬 개발 `.danbi/stt`, Electron 패키지 `userData/stt`에 저장한다.
   - review 정책: 낮은 confidence, 짧거나 긴 duration, 과도한 읽기 속도, word timing drift를 순수 함수로 계산하고 UI는 문제 선택/정리/병합 액션만 호출한다.
   - schema 정책: `src/electron/shared/project-schema.ts`는 caption word timing object의 start/end/text/confidence, caption range 포함 여부, 단어 순서와 겹침 여부를 검증하고, caption style 및 text clip title-style effect의 font size/color/box/shadow/position/align 범위를 검증한다. Clip effect, automation rule, plugin manifest, export profile의 공통 필드와 parameter primitive 계약도 함께 검사해 STT review/preflight/render/extension 이전 단계에서 구조적으로 깨진 project data를 차단한다.

## 프로젝트 JSON 핵심 구조

```ts
EditorProject {
  assets[]
  tracks[].clips[]
  tracks[].clips[].effects[]
  markers[]
  captions[].words[]
  automation[]
  plugins[]
  exportProfiles[]
}
```

## 확장 원칙

- 렌더 여부를 UI에 직접 묶지 않는다. 코어 함수와 API route가 먼저 계약을 가진다.
- FFmpeg, ComfyUI, STT, plugin은 모두 프로젝트 JSON과 manifest를 통해 연결한다.
- Export profile helper는 container별 codec compatibility를 소유하고 schema validator, settings UI, render preflight, FFmpeg render plan이 같은 규칙을 사용한다. WebM은 AV1 video와 Opus audio를 사용해 FFmpeg mux 호환성을 유지한다.
- 외부 자동화 payload는 버전 관리 대상이다.
- queue job은 실행 중 상태, 취소/재시도, 서버 재시작 후 복구 정책을 반드시 가진다.
- ComfyUI workflow plugin은 외부 코드를 import하지 않는다. `EditorPluginManifest.comfyUIWorkflows`는 manifest-only preset metadata이며, `workflow` contribution과 `comfyui` permission을 통과한 경우에만 Inspector preset 목록과 automation payload에 병합한다.
- Model-backed AI effect presets are Danbi-owned metadata on top of the existing `model-effect-pass` effect contract. They do not bundle inference code or model binaries; `ai-effects.ts` resolves preset defaults, Inspector exposes editable purpose/strength/restoration/segmentation controls, and `ffmpeg-renderer.ts` maps the stored pass media to purpose-specific post-filters plus blend output.
- Shotcut 같은 오픈소스 프로젝트는 구조와 기능 설계는 참고할 수 있지만 GPL 코드 직접 복사는 피한다.

## 다음 구조 작업

- 프로젝트 마이그레이션 범위 확대
- preview/render parity 검증 확대
- WebCodecs preview worker 분리
- STT model-backed acoustic embedding extraction. Caption-level embedding clustering, threshold/margin quality review, external speaker encoder command ingestion, waveform fallback embedding generation, and speaker timeline review are implemented.
- External plugin reviewed execution APIs for effect/transition/exporter/analyzer plugins. Built-in fixture registry now enforces entry, permission, and contribution contracts before commands or render hooks are registered, external manifests are classified as sandbox entries, and a process-isolated runner validates manifests plus executes the reviewed `danbi.external.inspectManifest`, scoped-payload `danbi.external.analyzeTimeline`, profile-filtered `danbi.external.analyzeExports`, safe-output `danbi.external.planExports`, Electron-main materialized `danbi.external.writeExports`, CLI-claimed `editor:external-exporter` writer runs, `danbi.external.planEffects`, and `danbi.external.planTransitions` commands without importing plugin files. ComfyUI workflow plugins are manifest-only: project schema and sandbox validation verify `comfyUIWorkflows`, while `src/lib/editor/comfyui-workflows.ts` resolves the presets for clip binding and dry-run/execution payloads.
- Implementation note 2026-06-13: `src/lib/editor/timeline.ts` owns V/A unlink/link operations as pure project transforms, alongside linked V/A selection, move, delete, paste, overwrite, duplicate, split, trim, slip, roll, slide, and range-edit sync.
- Implementation note 2026-06-13: Ripple trim is implemented in `trimLinkedClipToTime` as a pure transform, so UI Trim In/Out and edge-drag trim share the same downstream-shift behavior.
- Implementation note 2026-06-13: Close Gap is a pure `closeGapAtTime` timeline transform that detects the selected-track gap and shifts linked moving clips as a group.
- Implementation note 2026-06-13: `moveClips` accepts `preventOverlap` and shares `clampClipMoveDelta` with the UI so drag and keyboard movement use one collision policy.
- Implementation note 2026-06-13: `trimLinkedClipToTime` accepts `preventOverlap` and shares `clampClipTrimTime` with the UI so edge trim, linked V/A trim, source math, and neighbor collision limits stay consistent.
- Implementation note 2026-06-13: Transition edits accept `autoOverlap`, create exact same-track overlap for FFmpeg xfade, and expand downstream movement through linked V/A references.
- Implementation note 2026-06-13: Inspector numeric Start/Duration controls route through `moveClips`, `clampClipMoveDelta`, `trimLinkedClipToTime`, and `clampClipTrimTime` instead of direct clip patching.
- Implementation note 2026-06-13: `TimelineTrack.syncLocked` opt-in tracks are included by ripple insert, ripple range extract, ripple delete, and close-gap transforms to preserve multi-track alignment.
- Implementation note 2026-06-13: Tracked object mask is split across `src/lib/editor/object-mask.ts` for pure project transforms, Inspector Effects `Object` for UI entry, Program Monitor mask preview for local-time interpolation, and `src/lib/editor/ffmpeg-renderer.ts` for FFmpeg `geq` alpha-mask render parity.
- Implementation note 2026-06-13: Local AI enhancement effects are split across `src/lib/editor/ai-effects.ts` for preset/upsert project transforms, Inspector Effects `AI FX` for UI entry, Program Monitor CSS filter hints for immediate review, and `src/lib/editor/ffmpeg-renderer.ts` for FFmpeg `hqdn3d`, `unsharp`, `eq`, `deband`, and `vignette` output parity. Implementation note 2026-06-16: model-backed enhancement and ComfyUI effect generation now extend the same contract through `model-effect-pass` AI effects. `src/lib/editor/comfyui-results.ts` can apply a completed result as an effect pass on the source clip, `src/electron/renderer/ai-queue-workflow-helpers.ts` and the Export/AI Result Review panels expose that action beside import/replace, Inspector effect controls expose pass blend/opacity, `program-media-layer-preview.tsx` previews pass media as opacity/blend overlays in Program Monitor, `preview-source.ts` maps browser-served public render paths back to preview URLs while surfacing private filesystem-only paths as unavailable, and `ffmpeg-renderer` uses FFmpeg `movie` plus `blend` so the generated pass is part of render output rather than only an imported candidate clip. Implementation note 2026-06-17: `ai-effects.ts` adds built-in metadata presets for restoration detail, segmentation matte, and beauty retouch, `inspector-controls.tsx` exposes pass purpose/strength and restoration/segmentation tuning controls, `comfyui-results.ts` can apply a completed result with a preset id, and `ffmpeg-renderer.ts` applies strength-scaled blend opacity plus purpose filters such as segmentation edge feather blur and restoration detail unsharp.
- Implementation note 2026-06-13: Color grading presets live in the timeline core as one replaceable `color` effect per visual clip, while uploaded LUTs are separate `Color LUT` color effects from `src/lib/editor/color-lut.ts`; Inspector controls expose base grade, tone-curve points, and LUT effect cards, Program Monitor approximates the look with CSS filters, `/api/editor/luts` stores local LUT files under `public/luts`, and `src/lib/editor/ffmpeg-renderer.ts` maps the same effects to FFmpeg `eq`, `colorbalance`, `curves`, and `lut3d`.
- Implementation note 2026-06-13: Adjustment layer behavior is centralized in `src/lib/editor/adjustment-layer.ts`; `src/lib/editor/preview.ts` applies active point-in-time adjustment effects to lower media layers for Program Monitor, `src/lib/editor/ffmpeg-renderer.ts` applies overlapping adjustment effects to lower visual clips with FFmpeg timeline `enable` expressions, unsupported partial Pixelate adjustments become render warnings, and `src/lib/editor/preview-render-parity.ts` no longer treats supported adjustment layers as render-missing metadata.
- Implementation note 2026-06-13: Video scope analysis is split into `src/lib/editor/video-scopes.ts` for deterministic RGBA-to-scope math and Program Monitor canvas sampling in `src/app/editor/page.tsx`; the UI reads the selected or top active visual layer and displays luma histogram, waveform, vectorscope, and average/low/peak luma without changing render output.
- Implementation note 2026-06-13: Visual FX presets are split across `src/lib/editor/visual-effects.ts` for preset project transforms and privacy-region interpolation, Inspector Effects `FX` for UI entry, Program Monitor CSS/pixelated/tracked-region preview hints, and `src/lib/editor/ffmpeg-renderer.ts` for FFmpeg `boxblur`, `unsharp`, `vignette`, pixelate scale, expression-driven `delogo`, and `chromakey` filters. Implementation note 2026-06-17: soft glow, advanced bloom, motion trails, optical-flow motion blur, and film grain extend the same `filter` contract with glow/bloom radius/intensity/saturation/threshold, trail frames/decay, flow blur/search parameters, and grain strength/seed parameters, Program Monitor approximations, and FFmpeg `gblur`/`eq`/`curves`/`unsharp`, `tmix`, `minterpolate`, plus `noise` output. Additional renderable editor effects should extend this `filter` effect contract.
- Implementation note 2026-06-13: Stabilize presets are split into `src/lib/editor/stabilize-effects.ts` for preset/upsert project transforms, Inspector Effects `Stabilize` for batch application, editable effect cards for radius/block-size/contrast, and `src/lib/editor/ffmpeg-renderer.ts` for FFmpeg `deshake` output parity.
- Implementation note 2026-06-13: Audio cleanup presets are split across `src/lib/editor/audio-cleanup-effects.ts` for preset project transforms, Inspector Effects `Clean` for UI entry, Program Monitor makeup-gain preview approximation through `buildStaticAudioEffectGain`, and `src/lib/editor/ffmpeg-renderer.ts` for FFmpeg `highpass`, `lowpass`, `afftdn`, `acompressor`, `equalizer`, and `alimiter` filters. Additional renderable audio effects should extend this `audioEffect` contract.
- Implementation note 2026-06-15: Multi-band EQ extends the same `audioEffect` contract. `audio-cleanup-effects.ts` defines the preset and FFmpeg equalizer band chain, `inspector-controls.tsx` exposes low/body/presence/air frequency/gain/Q controls, and core tests prove no-duplicate application plus render parity.
- Implementation note 2026-06-15: Spectral repair also extends the `audioEffect` contract. `audio-cleanup-effects.ts` defines repair highpass, denoise, hum harmonic notch, and hiss lowpass filter generation; `inspector-controls.tsx` exposes editable repair parameters; and core tests cover render parity plus no-duplicate application.
- Implementation note 2026-06-15: Program audio analyzer preview is split into `src/lib/editor/audio-analyzer.ts` for deterministic waveform-derived peak/RMS/crest/balance/energy-band analysis and live FFT aggregation, `program-audio-graph-controller.tsx` for Web Audio `AnalyserNode` capture, `program-monitor-overlays.tsx` for the Program Monitor overlay, and `scene-readout-panel.tsx` for matching Scene readout summaries. The live FFT path extends the waveform/meter contract instead of replacing it.
- Implementation note 2026-06-13: STT speaker diarization draft is split into `src/lib/editor/stt-speaker-diarization.ts` for deterministic caption-based assignments and speaker turn reports, Captions/STT review UI controls for undoable application, and core tests covering draft labels, speaker summaries, turn timeline, and no-op reapplication. Model-backed acoustic embedding extraction from the local STT/audio pipeline is now covered by transcript/imported embeddings, external speaker encoder command ingestion, and waveform-backed fallback embeddings.
- Implementation note 2026-06-15: STT speaker diarization now has an embedding-backed refinement path. JSON transcripts can carry caption-level `speakerEmbedding`/`speaker_embedding` arrays, project schema validates optional `captions[].speakerEmbedding`, and `src/lib/editor/stt-speaker-diarization.ts` uses normalized cosine-similarity centroids plus threshold/margin quality checks to assign distant turns before falling back to time-gap/known-neighbor draft labels. Ambiguous and low-similarity embedding matches are counted, warned, and included in the review caption set exposed by the STT/Captions panels.
- Implementation note 2026-06-16: External plugin exporter writer packages now carry `runtimePackage` metadata. `src/electron/shared/project-schema.ts` and `src/electron/shared/extension-api.ts` validate safe package roots/entries/file manifests, `src/lib/editor/plugin-trust.ts` folds package metadata into approval fingerprints, reviewed handoff JSON preserves package metadata, and `src/electron/main/external-exporter-runner.ts` verifies packaged writer files and SHA-256 digests before executing trusted declared writers. `src/electron/main/plugin-package-installer.ts` adds the user-facing install/update channel: Electron IPC reads a local `danbi-plugin-package.json`, verifies manifest signatures and package file hashes, copies safe package files under the Electron package root, saves the updated project, and the Plugins panel exposes the flow. `src/lib/editor/plugin-signature.ts` now includes production RSA public-key material, while `scripts/plugin-signing-keygen.mjs`, `scripts/plugin-signing-readiness.mjs`, `scripts/plugin-signing-rotation-drill.mjs`, `scripts/plugin-package-sign.mjs`, `scripts/plugin-signing-custody-audit.mjs`, and `scripts/prepare-electron-release.mjs` make signer generation/readiness/rotation/package-signing/custody-audit visible and gate production builds on real non-development RSA public-key material with no private-key leaks in release-bound outputs. External plugin file imports remain closed; installed packages are used through reviewed sandbox commands and trusted packaged writer execution.
- Implementation note 2026-06-15: Preview worker capability, budget, still/thumbnail frame delivery, and raw video decode paths are split into `src/lib/editor/preview-worker.ts` for deterministic planning/readiness/frame-delivery summaries plus timestamp-match display policy, `public/editor-preview-worker.js` for browser worker detection/benchmarking/ImageBitmap decode/QuickTime-compatible MP4/MOV/M4V/QT extension routing, progressive MP4 H.264 with CTTS/edit-list timing and MP4 orientation metadata, fragmented MP4 H.264 with CTTS/edit-list timing and MP4 orientation metadata, MP4 H.265 HEVC through `hvc1`/`hev1` sample descriptions, WebM VP8/VP9/AV1, and Xiph/fixed/EBML laced WebM VP8 demux plus WebCodecs decode, `src/electron/renderer/preview-worker-controller.ts` for worker lifecycle, frame requests, and decoded-frame object URL lifecycle, and Program Monitor overlay state for visible worker/fallback/frame-delivery mode. Frame requests distinguish video-layer identity from image decode sources, carry the active media timestamp, and keep the worker alive while playhead changes post new frame requests. Cached video thumbnails can be delivered as video-layer worker frames without requiring raw video demux; when WebCodecs decode primitives are available the renderer can prefer a fetchable original video source for the worker while keeping proxy playback in the HTML preview path and cached thumbnail as fallback. Program Monitor video layers display the latest timestamp-matching decoded worker frame while paused/scrubbing and keep the HTMLVideoElement path for playing telemetry.
- Implementation note 2026-06-15: Program Monitor frame telemetry is split so `src/lib/editor/preview-performance.ts` normalizes both `getVideoPlaybackQuality` samples and `requestVideoFrameCallback` metadata, while `src/electron/renderer/program-media-layer-preview.tsx` uses requestVideoFrameCallback when available and falls back to polling. This gives actual displayed-video frame timing and drop diagnostics today, while worker-side raw video decode now has QuickTime-compatible MP4/MOV/M4V/QT extension routing, progressive MP4/H.264 with CTTS/edit-list timing and MP4 orientation metadata, common FFmpeg fragmented MP4/H.264 with CTTS/edit-list timing and MP4 orientation metadata, MP4/H.265 HEVC, WebM/VP8, WebM/VP9, WebM/AV1, and Xiph/fixed/EBML laced WebM/VP8 paths. Remaining preview-worker coverage means more complex MP4/WebM variants and additional browser-exposed codec/profile support.
- Implementation note 2026-06-15: Render output validation is split so `src/lib/editor/render-output.ts` owns profile-container extension rules, `src/lib/editor/render-preflight.ts` turns invalid selected output paths into `output` blocked issues, and `src/server/editor/render-output-access.ts` performs Node-side filesystem access probes without creating the final target directory during dry-run checks. Renderer queue planning, Electron IPC, Next API preflight, direct render, queued render, and headless render reuse the same contract before FFmpeg starts.
- Implementation note 2026-06-15: Render worker daemon/fleet discovery and live fleet status are split so `render-worker-controller-helpers.ts` builds deterministic candidate URLs, parses manually enrolled remote daemon URLs, produces fleet summaries, and selects least-loaded worker routing from the current setting and app host, `render-worker-client.ts` probes `/status` with short timeouts and subscribes to WebSocket `/events`, `render-worker-daemon.ts` broadcasts daemon-wide status/run updates over WebSocket without adding a third-party server dependency, and `render-worker-controller-panel.tsx` exposes Discover plus selectable worker rows before handoff submission. The daemon now also owns local run scheduling through `--max-runs`, keeps queued/running counts in `/status`, and attaches `RenderWorkerDaemonRunLease` metadata while a run holds capacity. Optional Pair token authentication is available through `--auth-token` or `DANBI_RENDER_WORKER_AUTH_TOKEN`; `/health` remains open with `authRequired`, while `/status`, run endpoints, SSE, and WebSocket fleet events require the controller token. Optional `--discovery` starts a Node UDP responder in `render-worker-discovery.ts`; Electron main probes the LAN through IPC/preload and the renderer merges those zero-config worker URLs with manual candidates before the authenticated status probe. The controller now also keeps a local trusted-worker registry with worker ID, URL, authRequired, discovery port, firstSeen/lastSeen metadata, and explicit Trust/Forget controls; Pair tokens are intentionally not persisted. This keeps local-network worker discovery, zero-config LAN discovery, manual remote enrollment, local trusted enrollment, manual fleet selection, authenticated pairing, automatic submission routing, live status streaming, and single-daemon capacity/lease policy inside the renderer/controller boundary; remaining worker-fleet work is central trust policy/governance only if multi-user operations require it.
- Implementation note 2026-06-15: Render output path safety now also blocks null-byte paths and URL/protocol outputs before filesystem probes. Electron main direct render and queued render apply the same safety guard before extension hooks or FFmpeg job creation, so unsafe renderer-provided output paths cannot reach FFmpeg execution.
- Implementation note 2026-06-15: Preflight issue actions are split so `src/electron/renderer/preflight-issue-helpers.ts` owns focus/relink plans and actionKind-to-primary-action mapping, `export-preflight-panel.tsx` renders Focus plus primary Resolve controls, and `src/app/editor/page.tsx` maps Resolve to cache, relink, output, profile, or timeline/review workflows.
- Implementation note 2026-06-15: Render failure display is split so `src/lib/editor/render-diagnostics.ts` owns failure classification and `src/electron/renderer/render-diagnostic-view.ts` owns UI labels/actions. `render-status-panel.tsx` shows primary actions/evidence and exposes a Resolve callback, `job-history-workflow-helpers.ts` carries the same diagnostic problem/action/retryability into the Job History list, and `src/app/editor/page.tsx` maps action kinds to relink/profile/output/retry workflows.
- Implementation note 2026-06-15: Import file routing is split so `src/electron/renderer/import-file-routing-helpers.ts` classifies media files versus SRT/WebVTT sidecars, browser Import/Media Bin drop applies sidecars through the caption import workflow, and `src/electron/main/native-media-import-engine.ts` reads native subtitle files as sidecar content instead of sending them to FFmpeg media analysis.
- Implementation note 2026-06-15: Timeline long-form rendering is split so `src/electron/renderer/timeline-workspace-helpers.ts` calculates clip render windows, `TimelineTransportRulerPanel` reports horizontal viewport changes, and `TimelineClipList` filters offscreen clips while preserving selected clip rendering.
- Implementation note 2026-06-15: Caption render preflight is split into `src/lib/editor/caption-preflight.ts` for pure issue generation, `src/lib/editor/render-preflight.ts` for report aggregation under source `caption`, and `src/electron/renderer/preflight-issue-helpers.ts` for caption/time focus state.
