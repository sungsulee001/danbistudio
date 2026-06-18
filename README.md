# DanbiStudio

> Local GPU-based AI Model Platform powered by ComfyUI

DanbiStudio is a Next.js web application that provides a user-friendly interface for AI content generation using your local GPU through ComfyUI.

## Editor Upgrade Documents

- [Editor Completion Definition KR](./docs/EDITOR_COMPLETION_DEFINITION_KR.md)
- [Third Party Source Register KR](./docs/THIRD_PARTY_SOURCE_REGISTER_KR.md)
- [Source Reuse Audit KR](./docs/SOURCE_REUSE_AUDIT_KR.md)
- [Third Party License Policy KR](./docs/THIRD_PARTY_LICENSE_POLICY_KR.md)
- [Third Party License Compliance KR](./docs/THIRD_PARTY_LICENSE_COMPLIANCE_KR.md)
- [License Guardrails KR](./docs/LICENSE_GUARDRAILS_KR.md)
- [Shotcut GPL Boundary KR](./docs/SHOTCUT_GPL_BOUNDARY_KR.md)
- [Editor Product Spec KR](./docs/EDITOR_PRODUCT_SPEC_KR.md)
- [Editor Architecture KR](./docs/EDITOR_ARCHITECTURE_KR.md)
- [Electron Architecture Refactor KR](./docs/ELECTRON_ARCHITECTURE_REFACTOR_KR.md)
- [Electron Boundary Guard KR](./docs/ELECTRON_BOUNDARY_GUARD_KR.md)
- [Electron Media Analyzer Split KR](./docs/ELECTRON_MEDIA_ANALYZER_SPLIT_KR.md)
- [Electron Job Store Split KR](./docs/ELECTRON_JOB_STORE_SPLIT_KR.md)
- [EDL Interchange KR](./docs/EDL_INTERCHANGE_KR.md)
- [FCPXML Interchange KR](./docs/FCPXML_INTERCHANGE_KR.md)
- [Marker Interchange KR](./docs/MARKER_INTERCHANGE_KR.md)
- [Editor Implementation Standard KR](./docs/EDITOR_IMPLEMENTATION_STANDARD_KR.md)
- [ComfyUI Automation KR](./docs/COMFYUI_AUTOMATION_KR.md)
- [Extension Roadmap KR](./docs/EXTENSION_ROADMAP_KR.md)

## Main Workspaces

- `/editor` - AI-native multi-track video editor
- `/generate` - ComfyUI asset generation
- `/library` - Generated asset library
- `/settings` - Local service settings

## Editor APIs

- `GET /api/editor/projects` - List saved editor projects
- `POST /api/editor/projects` - Save or update an editor project
- `GET /api/editor/projects/:id` - Load one editor project
- `PUT /api/editor/projects/:id` - Update one editor project
- `DELETE /api/editor/projects/:id` - Delete one editor project
- `GET /api/editor/autosave` - List local autosave recovery snapshots
- `POST /api/editor/autosave` - Save the current editor project to `.danbi/autosave`
- `GET /api/editor/autosave/:id` - Restore one autosave snapshot
- `DELETE /api/editor/autosave/:id` - Delete one autosave snapshot
- `POST /api/editor/automation` - Build ComfyUI queue payloads from the timeline
- `GET /api/editor/hooks` - List supported editor hook events
- `POST /api/editor/hooks` - Prepare hook actions for `manual`, `on-import`, `before-export`, or `on-gap`; `applyLocalActions=true` applies local caption/loudness/color/object-mask hook edits, `queueComfyUI=true` queues generated ComfyUI jobs, and `executeWebhooks=true` sends allowlisted webhook payloads
- `POST /api/editor/captions` - Export editable captions as SRT or WebVTT sidecar text, optionally clipped to an export range
- `POST /api/editor/edl` - Export/import CMX 3600 EDL cut interchange files
- `POST /api/editor/fcpxml` - Export/import FCPXML cut interchange files with media asset clips, title clips, title style metadata including shadow/box settings, xfade transition metadata, timeline offsets, source ranges, and marker duration/notes
- `POST /api/editor/markers` - Export/import marker CSV or YouTube chapter text, preserving marker duration and notes in CSV
- `GET /api/editor/queue-settings` - Read render/media-cache/ComfyUI worker and default priority settings
- `PUT /api/editor/queue-settings` - Update render/media-cache/ComfyUI concurrency and default queue priorities
- `GET /api/editor/comfyui-jobs` - List ComfyUI batch automation jobs
- `POST /api/editor/comfyui-jobs` - Queue selected clips for ComfyUI automation, with dry-run by default
- `GET /api/editor/comfyui-jobs/:id` - Check ComfyUI batch progress
- `DELETE /api/editor/comfyui-jobs/:id` - Cancel a queued or running ComfyUI batch
- `POST /api/editor/comfyui-jobs/:id` - Retry a completed, failed, or cancelled ComfyUI batch
- `GET /api/editor/stt-jobs` - List local speech-to-text caption jobs
- `POST /api/editor/stt-jobs` - Queue selected audio/video-audio clips for local STT captioning
- `GET /api/editor/stt-jobs/:id` - Check STT caption progress
- `DELETE /api/editor/stt-jobs/:id` - Cancel a queued or running STT job
- `POST /api/editor/stt-jobs/:id` - Retry a failed or cancelled STT job
- `GET /api/editor/ffmpeg-capabilities` - Detect FFmpeg encoders and available hardware acceleration
- `POST /api/editor/render-preflight` - Build a render readiness report from export manifest issues, output path checks, media health, and preview/render parity before queueing FFmpeg
- `POST /api/editor/render-plan` - Build an FFmpeg render command plan
- `POST /api/editor/render` - Execute FFmpeg render and save to `/outputs`
- `GET /api/editor/render-jobs` - List in-memory FFmpeg render jobs
- `POST /api/editor/render-jobs` - Queue an FFmpeg render job
- `GET /api/editor/render-jobs/:id` - Check render progress
- `DELETE /api/editor/render-jobs/:id` - Cancel a running render job
- `POST /api/editor/render-jobs/:id` - Retry a failed or cancelled render job
- `POST /api/editor/media` - Upload imported media to `/imports` for preview and render
- `POST /api/editor/luts` - Upload local `.cube`, `.3dl`, `.dat`, `.m3d`, or `.csp` LUT files to `/luts` for FFmpeg `lut3d` color effects
- `GET /api/editor/media-cache` - List background media cache jobs
- `POST /api/editor/media-cache` - Rebuild thumbnail/proxy/waveform cache for an imported file
- `GET /api/editor/media-cache/:id` - Check one media cache job
- `DELETE /api/editor/media-cache/:id` - Cancel one media cache job
- `POST /api/editor/media-cache/:id` - Retry one media cache job

Set `DANBI_EDITOR_API_TOKEN` to protect `/api/editor/*` automation calls. Tokenized clients can send `Authorization: Bearer <token>`, `X-Danbi-Editor-Api-Token: <token>`, or `X-Danbi-Api-Token: <token>`. The editor sidebar has an API Token panel that stores a local browser/Electron renderer token and attaches it to editor API requests.

## Utility APIs

- `GET /api/storage/cleanup` - Dry-run scan for old generated preview cache and rendered output files, preserving imported source media and LUTs
- `POST /api/storage/cleanup` - Delete old generated preview cache and rendered output files when called with `dryRun: false`

## Editor Renderer Capabilities

- FFmpeg render queue with progress polling, cancel, retry, and persistent snapshots
- Export Job History dashboard merges render queue snapshots with active media-cache, ComfyUI, and STT jobs so operators can see active, failed, completed, and cancelled background work from one panel, including render diagnostic action/retryability summaries for failed FFmpeg jobs
- Editable export profiles support custom label, purpose, container, codec, resolution, FPS, bitrate, encoder preset, CRF, duplicate, and delete controls; the selected container drives default render-plan paths, direct render filenames, queued render filenames, output-path preflight, preview parity, render-plan API calls, direct renders, and queued renders
- Export can target the full timeline or the marked In/Out range, with FFmpeg video/audio streams trimmed and retimed to start at zero
- Electron desktop bootstrap starts the Next editor in a native window with typed preload IPC, native file dialogs, render control, media import, project package export/import, and a file-backed Electron project repository
- Electron runtime diagnostics expose packaged/local data paths, logs, crash dump directory, FFmpeg/FFprobe discovery, encoder capability counts, and hardware encoder availability through typed preload IPC
- Generated getting-started sample project pack uses synthetic FFmpeg video/audio, portable media package export, tutorial markdown, packaged resources, and automated import-edit-export smoke coverage
- Electron render/export uses a native save-file dialog, keeps render plan/direct/queue/poll/cancel/retry on the Electron render bridge when available, preserves the selected output path, and can open the rendered file or reveal it in the OS file manager; browser mode keeps the existing API/default output path/link fallback
- Command palette opens from the toolbar or `Ctrl+K`, searches the shared editor command registry, reports total/visible/hidden result counts for capped searches, supports keyboard navigation, and runs the same handlers as toolbar/shortcut editing commands
- Proxy Review 540p render preset for fast local approval exports with H.264 veryfast/CRF settings
- ProRes 422 HQ Master export profile uses MOV, FFmpeg `prores_ks`, 10-bit 4:2:2 pixels, and PCM audio for intermediate/master handoff renders
- Quick export batch selection queues multiple export profiles at once with profile-specific output filenames, so master/social/proxy renders cannot overwrite each other
- Headless batch rendering can read raw project JSON or portable `.danbi-project.json` packages and render selected/all export profiles from the command line with dry-run preflight support
- Headless render can write a local network render-worker handoff manifest with project/profile/output paths, preflight status, FFmpeg command text, extension hook snapshots, and the exact worker CLI command for each profile
- Render worker CLI can claim a handoff manifest, dry-run or execute selected jobs, preserve blocked preflight jobs unless explicitly overridden, and write a JSON run report without importing third-party source mirrors into the app bundle
- External exporter CLI can claim reviewed `danbi.external.writeExports` handoff JSON, dry-run selected profiles, execute a trusted plugin-declared writer or user-supplied writer process with `{manifest}`/`{output}` tokenized args, verify the declared output file was created under safe `exports/` paths, and write a JSON run report
- Render worker daemon exposes local HTTP endpoints for health, status, handoff submission, per-run reports, per-run SSE progress events, daemon-wide `WS /events` fleet status events, `--max-runs` scheduling capacity, and run lease metadata so a controller UI or another local machine can claim render jobs without linking third-party source mirrors into the runtime
- Export workspace includes a render-worker controller panel for daemon/fleet discovery, manual remote worker URL enrollment, worker selection, daemon URL/cwd/executable/auto-route settings, health/status checks, portable project package handoff submission to the least-loaded discovered/enrolled worker, daemon-wide WebSocket fleet status updates, SSE progress updates with polling fallback, job-level progress bars, running/queued/capacity snapshots, and lease visibility from the editor UI
- Saved editor projects are migrated on load/save so new default export profiles and plugin manifests are backfilled without recreating projects
- Project package export/import as `.danbi-project.json`, preserving migrated project JSON, asset path manifest, cache references, and reimport warnings; Electron uses typed IPC and native directory selection to write `project.danbi-project.json` plus copied `media/` files and rewrite imported paths back to the package folder, while browser mode keeps JSON download/import fallback
- Optional local-first cloud sync writes the same portable project package into a user-selected sync folder, plus `danbi-cloud-sync.json` and root `danbi-cloud-sync-index.json` manifests for OneDrive/Google Drive/Dropbox-style folder syncing, and blocks older local projects from overwriting newer remote snapshots unless explicitly forced
- Timeline marker interchange exports marker CSV or YouTube chapter text from the full timeline or marked range, imports CSV/chapter files back into the current project with duplicate-safe undoable merge, and preserves marker duration/notes in CSV; the workflow is documented in `docs/MARKER_INTERCHANGE_KR.md`
- FCPXML interchange exports/imports professional XML cut lists with media asset clips, title/text clips, crossfade/dip/push/wipe transition metadata, timeline offsets, source ranges, Danbi track/clip metadata, and marker duration/notes from the Export panel, with core/API/client tests documented in `docs/FCPXML_INTERCHANGE_KR.md`
- Chapter markers are carried into FFmpeg renders through generated `.ffmetadata` sidecar files and `-map_chapters`, using explicit marker duration when available, so direct and queued exports can preserve editor chapter markers in compatible output containers
- Electron native media import and relink use file dialogs plus main-process copy/analyze/cache-job creation, while browser mode keeps upload/file-input fallback; media import adds assets to the bin, and explicit Insert/drag-drop operations place them onto the timeline with undoable edits
- Media Bin voiceover recording uses browser microphone capture where available, writes the recorded audio through the same `/api/editor/media` upload/analyze/cache path, marks the imported asset as voiceover metadata, and inserts it on the active audio patch track at the playhead
- Project settings panel edits name, canvas width/height, FPS, and duration through validated undoable project changes that cannot trim existing clips, markers, or captions
- Media Bin supports editable asset bins, source-range subclips, smart collections for used/unused/cache/render/source status, one-click cache queueing for the filtered asset set, bin filters, search, asset-kind filters, result counts, and name/type/duration sorting for larger local projects
- Shared Asset Library in the Media Bin adds local reusable text assets such as Title Card, Lower Third, End Card, and Chapter Divider into a dedicated `Shared Library` bin, then reuses the existing source range, timeline insert/overwrite, Program Monitor, project JSON, and FFmpeg title burn-in paths without bundling third-party media
- Render/media-cache/ComfyUI queue settings for worker concurrency and priority-based scheduling
- Media Health report surfaces blocked assets, missing render paths, volatile preview sources, cache gaps, and direct Relink/Cache recovery actions
- FFmpeg hardware encoder detection with auto NVENC/QSV/AMF/VideoToolbox/VAAPI selection and software fallback in render plans/jobs
- ComfyUI batch queue with selected-clip automation plans, dry-run payload preparation, optional `/prompt` execution, cancel, retry, polling, and persistent snapshots
- ComfyUI workflow preset registry and Inspector clip binding for per-clip preset, workflow, prompt, negative prompt, seed, steps, CFG, and output size overrides
- AI B-roll gap fill detects true visual timeline gaps across non-audio tracks, creates editor-ready ComfyUI draft clips on the AI B-roll track, and carries those drafts into the same batch payload path
- AI Morph outgoing transitions create ComfyUI transition jobs with adjacent clip context, transition duration, and transition-morph preset payloads
- ComfyUI result review compares original clips and completed ComfyUI outputs side by side, shows prompt/model/workflow metadata, prompt lineage/version changes, media analysis, cache/waveform readiness, then imports candidates or replaces originals through undoable timeline edits
- Local STT caption queue for selected audio/video-audio clips, Whisper-compatible transcript parsing, word-level timing, optional speaker embedding import, external speaker encoder command integration through caption source-range manifests, waveform-backed acoustic embedding fallback when transcripts/model commands omit embeddings, status polling, cancel/retry, caption review, cleanup, speaker diarization draft labels, embedding similarity margin/threshold review, speaker turn review, and import into the editable subtitle workflow
- Render failure diagnostics with category, retryability, primary action hints, Resolve actions, evidence, stderr tail display, and Job History summaries for failed FFmpeg jobs
- Render preflight combines export manifest issues, selected output path/container/filesystem access checks, timeline media health, audio mono-compatibility/mix warnings, preview/render parity, and FFmpeg plan warnings so blocked renders are caught before queueing, with issue focus, primary Resolve actions, relink, cache-warning queue actions, and compact hidden-issue counts in the Export panel
- Preview/render parity checks for effects, browser-only sources, AI model-pass preview-unavailable paths, and plan warnings, with unsupported effect mismatches promoted once from the export-graph feature matrix instead of duplicated by sample-time preview warnings
- Persistent local job snapshots under `.danbi/jobs` for render and media-cache status recovery
- Persistent editor autosave snapshots under `.danbi/autosave` for crash or database-failure recovery
- Project save state badge distinguishes database-saved, autosaved-only, and unsaved dirty edits, with browser close protection while dirty
- Timeline-aware clip start offsets, black-frame gaps, and audio delay/mix
- Embedded audio from imported video clips is included in the FFmpeg audio mix and runtime waveform analysis when `metadata.hasAudio` is available
- Embedded video audio can be detached to an editable audio clip and relinked without losing render parity
- Waveform Sync aligns a selected external audio clip to a selected video clip by waveform correlation, reports confidence and clamped movement, reuses cached or runtime waveform peaks, and can immediately link the synced pair so later edits preserve sync
- Audio tracks expose mixer gain and pan controls, migrate with saved projects, affect Program Monitor browser audio and preview layer state, and render through FFmpeg volume/stereo balance filters
- Static audio gain and peak-normalize effects use the same gain multiplier in Program Monitor audio, audio meters, and FFmpeg volume filters
- Audio cleanup presets for Voice clean, Noise reduce, Broadcast comp, De-ess, Multi-band EQ, and Spectral repair batch-apply to audio/video-audio clips, expose editable cleanup/compressor/EQ/repair parameters in the Inspector, approximate makeup gain in Program Monitor audio, and render through FFmpeg highpass/lowpass, `afftdn`, `acompressor`, `equalizer`, and `alimiter` filters
- Side-chain ducking detects active dialogue/video-audio sources and applies the same attack/release reduction to Program Monitor audio, meters, and FFmpeg dynamic volume expressions
- Program Monitor shows L/R audio meters, waveform-derived RMS/crest/balance/mono-compatibility analysis, and live Web Audio FFT low/mid/high spectrum capture from the preview audio graph, with clip/keyframe volume, track gain, pan, clipping state, energy bands, and metered/analyzed/captured-layer coverage
- Source Monitor shows source-range audio peak/clipping readouts from persistent or runtime waveform peaks, so editors can catch hot source audio before insert or overwrite
- Selected audio/video-audio clips can be batch peak-normalized from waveform cache, creating or updating renderable audio gain effects with source/target peak metadata while skipping non-audio selections
- Clip speed and reverse playback are reflected in preview source time, FFmpeg video `setpts`/`reverse`, audio `atempo`/`areverse`, speed-aware source trimming, and source-range-preserving retime edits with ripple/collision handling
- Speed ramp presets batch-apply and clear per-clip ramp points across selected clips, update Program Monitor source timing/playback speed, expose ramp source usage in the Inspector, and render variable video timing through FFmpeg `setpts` with audio average-speed warnings
- Freeze frame holds batch-lock selected video clips to their current timeline-local frame in the Inspector, Program Monitor, split/trim math, and FFmpeg frame-loop filters
- Before-export master audio automation is rendered with FFmpeg `loudnorm` and true-peak `alimiter`
- Export plan, direct render, and queued render apply before-export local hooks first, so caption/loudness/color automation is reflected in the FFmpeg plan used for output
- Built-in extension fixtures register plugin commands and `before-render` hooks for the FFmpeg Renderer and ComfyUI Bridge; extension IPC, direct render, queued render, and headless dry-run preserve hook execution snapshots. External plugin manifests are enrolled as sandbox entries with declared APIs, manifest signature fingerprint/signer state, exporter writer trust state, and warnings visible in the Plugins panel, and `npm run editor:extension-sandbox` plus Electron extension IPC provide process-isolated handshake plus reviewed `danbi.external.inspectManifest`, `danbi.external.analyzeTimeline`, `danbi.external.analyzeExports`, `danbi.external.planExports`, `danbi.external.writeExports`, `danbi.external.planEffects`, and `danbi.external.planTransitions` command paths without importing external plugin files. Reviewed analyzer/exporter commands accept custom scoped payloads for selected tracks/clips/profiles and severity filtering, reviewed exporter output planning returns safe relative output manifests, `writeExports` materializes ready exporter handoff JSON files under safe `exports/` paths through Electron main only, `npm run editor:external-exporter` can execute trusted plugin-declared or explicit writer processes from those handoffs with output verification and reports, reviewed external effect and transition plans accept bounded parameter overrides, plugin-authored `parameterSchemas`, fingerprint-only or trusted RSA manifest `signature` declarations, exporter writer declarations, and exporter writer `runtimePackage` file manifests are validated at project JSON/sandbox boundaries, Plugins panel install/update can copy verified local plugin package folders into the Electron package root, approval/review/block controls persist exporter writer trust decisions through project history, approved writer commands store a command/package fingerprint and bounded trustHistory audit trail so changed executable/args/cwd/timeout/package declarations fall back to approval-required, and plans can be applied from the Plugins panel to selected clips through validated undoable timeline transforms
- Same-track transitions batch-apply/remove from selected clips, auto-create overlap, and render crossfade, dip, push, wipe, timeline transition badges with draggable duration, editable duration/easing/direction/audio-transition controls, FFmpeg `xfade`, and matching audio gain curves
- Multi-track compositor policy using project track order, track mute/solo playback state, lock-as-edit-protection state, matching export/preflight playback manifests, and `normal`, `screen`, `multiply`, `overlay`, `add` blend modes
- Text/title clips burned into FFmpeg output with timeline start, duration, opacity, multi-line layout, shadow, background box, and compositor order
- Timeline title clips can be created from the editor, stored as text assets with multi-line text preserved, styled from the Inspector including text shadow controls, previewed in the Program Monitor, saved/loaded, exported through FCPXML style metadata, and burned into FFmpeg output
- Caption segments burned into FFmpeg output with timeline timing and speaker/text formatting
- Built-in title and caption style packs apply reusable Clean/Boxed/Lower and Readable/Creator/Top looks through the existing `CaptionStyle` patch path, so Inspector presets immediately affect Program Monitor preview, FFmpeg drawtext burn-in, WebVTT style metadata, and saved project JSON without adding a separate template format
- Free creator templates in the Project workspace apply editable Short Launch, Tutorial Steps, and Review Pass scaffolds at the playhead, adding title clips, styled captions, chapter/review markers, and optional ComfyUI B-roll draft clips through undoable project transforms without bundling third-party media assets
- Position, scale, and rotation keyframes are editable in the Inspector and rendered with FFmpeg frame-evaluated expressions
- Ken Burns motion presets batch-create editable position/scale keyframes for selected visual clips, giving zoom and pan moves with Program Monitor and FFmpeg parity
- Opacity and audio volume keyframes are editable in the Inspector and rendered with FFmpeg alpha/audio expressions, including one-click batch visual and audio fade in/out generation for selected clips
- Clip canvas layout modes support batch Fit, Fill, and Stretch from the Inspector across selected visual clips, Program Monitor, and FFmpeg scale/crop filter graph
- Static Motion transforms for position, scale, and rotation are editable in the Inspector, shown in preview, and rendered through the same FFmpeg transform path as keyframes
- Crop presets for No crop, Soft center, Square, 9:16, and Letterbox batch-apply from the Inspector to selected video/image clips, Program Monitor crop handles can drag video/image crop edges directly, one crop mask effect is kept per clip, preview updates immediately, and FFmpeg renders matching crop/scale filters
- Subject-tracking smart reframe automation adds tracked start/mid/end focal paths to selected visual clips, previews the interpolated subject focus in Program Monitor, and renders dynamic crop expressions through FFmpeg
- Tracked object masks add start/mid/end mask-center paths to selected visual clips, expose editable mask position/size/feather parameters in the Inspector, preview the moving mask in Program Monitor, and render FFmpeg alpha masks with `geq`
- Tracking paths now expose render-driving start/mid/end focal or mask-center controls plus stable/review quality readouts in the Inspector, store smoothing/quality metadata, and automatically recalculate quality when tracking control points are edited so abrupt jumps can be reviewed before export
- Subject reframe and tracked object mask can now ingest external detector/model tracking hints, reject low-confidence or malformed observations, compress dense observations into the same render-driving start/mid/end controls, and store accepted/rejected hint telemetry plus average confidence for review
- Privacy blur Visual FX stores editable start/mid/end region points, previews the interpolated privacy box in the Program Monitor, and renders the moving hidden area through FFmpeg `delogo` without non-portable options
- Color grading presets include editable Filmic, Matte, and Punch tone-curve looks plus local LUT file effects, preview through Program Monitor filter hints, and render through FFmpeg `eq`, `colorbalance`, `curves`, and `lut3d`
- Completed ComfyUI/model outputs can be applied from the batch status or AI Result Review panels back to the source clip as a renderable AI model-pass effect with Program Monitor pass-media overlay preview, public `renderPath` preview-source normalization, explicit unavailable-state readout for private filesystem-only paths, Inspector blend/opacity controls, model/prompt metadata, and FFmpeg `movie`/`blend` render output
- Adjustment layers can be added at the playhead, selected like timeline clips, receive Color/LUT/FX/AI FX effects, preview those effects on lower video/image layers, and render overlapping clips through the same FFmpeg effect filters with timeline `enable` expressions; partial Pixelate adjustments warn because FFmpeg `scale` is not time-enabled
- Stabilize presets for Light, Standard, Strong, and Action lock batch-apply to selected video clips, update one editable deshake effect per clip, skip non-video selections, and render through FFmpeg `deshake`
- Program Monitor video scopes sample the active video/image frame into luma histogram, waveform, RGB Parade channel waveform, vectorscope, and average/low/peak readouts for exposure and color checks while grading
- Supported clip effects rendered into FFmpeg output: text slide motion, canvas layout, static and peak-normalized audio gain, audio cleanup presets, side-chain ducking, crop mask, tracked object mask, smart reframe, stabilize/deshake, Visual FX presets including privacy blur, green-screen chroma key, soft glow, advanced bloom, motion trails, optical-flow motion blur, and film grain, local AI enhancement presets, ComfyUI/model-backed AI effect passes, color grading presets, color `eq`/`curves`/`lut3d`, and color match temperature/tint filters
- SRT and WebVTT caption sidecar export from the Export Plan panel, including speaker, manual line breaks, wrapping, WebVTT style metadata with text shadow, word-timing highlight cues, and marked-range timing reset options
- Caption burn-in respects per-caption font size, color, manual line breaks, text shadow, box, position, and alignment, and selected captions can share speaker labels, style edits, nudge timing, tighten spacing, or be deleted in one batch operation

## Editor Timeline Capabilities

- Playhead-based single-clip, multi-selected, and all-unlocked-track cut, trim in/out, close gap, delete, toolbar/context/`Shift+Del` ripple delete, duplicate, and frame nudge
- Undo/Redo history stack with toolbar disabled state, history counters, and Ctrl+Z/Ctrl+Y/Shift+Ctrl+Z shortcuts
- Speed-aware split, trim, ripple trim, roll, slide, and range edits keep `sourceIn` aligned with playback speed and reverse playback direction
- Split and trim edits preserve clip keyframe automation by inserting boundary keyframes and retiming the edited clip segment
- Precision slip, roll, and slide edits from the inspector, with slide keyboard nudging
- J-cut/L-cut linked audio split edits from the Inspector adjust detached audio heads/tails independently while preserving V/A links, source timing, keyframes, and collision limits
- Split source/program monitors with source scrubbing, source In/Out marking, and JKL shuttle playback
- Match Frame sends the selected timeline clip's current source frame to the Source monitor, Source Monitor ranges can be promoted to reusable subclips, and Replace Edit swaps the selected clip to the current source range while preserving timing, effects, keyframes, and linked V/A safety
- Source Monitor surfaces source video scopes and source-range audio metering before media is committed to the timeline
- Program monitor can loop the marked In/Out range for repeated cut review, with `Shift+L` and toolbar control
- Program and Source monitor playback advances on `requestAnimationFrame` timing instead of coarse intervals, and the Program Monitor reads browser video playback quality plus preview-worker capability/frame-budget telemetry while previewing layered timelines
- Program Monitor displays live Video Scopes for the selected or top active visual layer, including luma histogram, waveform, RGB Parade, vectorscope, and average/low/peak luma values
- Previous/Next Edit jumps move the playhead to neighboring clip start/end boundaries on the active track, or all tracks with Alt+Up/Down, while skipping locked tracks/clips by default
- Mark Selection sets the timeline In/Out range to selected clips, includes linked V/A counterparts, and feeds the same range into loop playback, Lift/Extract, and marked-range export
- In/Out navigation supports `Shift+I`/`Shift+O` to jump to marks and `Shift+X` or toolbar/context actions to clear marks, disabling marked export/loop state when the range is cleared
- Program monitor preview stack based on the playhead, track order, mute/solo/lock state, active audio, opacity, and blend mode metadata
- Program monitor composites active video/image/text layers together with opacity, blend mode, canvas layout, Motion/keyframe transforms, click-to-select active visual layers, direct selected-layer drag positioning with center snap guides, Arrow/Shift+Arrow nudge, corner-handle scaling, and rotation-handle adjustment instead of showing only the top clip
- Adjustment layer tracks sit above video tracks and apply supported color/filter/AI effects to lower video/image layers in Program Monitor and FFmpeg render plans
- Text, active caption, enabled effect, and keyframe opacity/position/scale/rotation preview overlays in the Program Monitor
- Add title control creates editable text clips at the playhead and selects the new clip for immediate Inspector text/style editing
- Inspector keyframe controls for adding, updating, easing, and deleting position, scale, rotation, opacity, and volume automation
- Inspector effect buttons can batch-add or preset-apply eligible color, match, FX, AI FX, gain, clean, stabilize, crop, object mask, and reframe effects across selected clips, while effect cards can batch-toggle, reorder, batch-remove matching effects, and batch-parameter-edit matching effects through undoable timeline edits
- Timeline clips display draggable keyframe dots so automated clips are visible and timing can be adjusted before opening the Inspector
- Export panel parity report showing unsupported preview features and effect filters not yet represented in FFmpeg output
- Export profile selector for master and short-form render targets
- Export panel range controls switch between full timeline and marked In/Out output for focused review renders
- Clip drag move with non-overlap collision stops, plus edge drag trim with neighbor collision stops, optional snap, Ripple mode downstream shifting, and live drag/trim previews that show the actual snapped or constrained commit position
- Selected group drag and Alt+Arrow clip nudging
- Persistent Group/Ungroup keeps selected clips as one selectable and movable unit across click selection, box selection, playhead/range selection, delete, drag, and nudge through `Ctrl+G` / `Ctrl+Shift+G`
- Clip mute/lock toggles apply to the full selected linked/grouped set, so disabling or protecting a multi-clip edit does not silently affect only the primary clip
- Inspector color, volume, opacity, blend, and reverse edits apply to the selected linked/grouped clip set, with mixed-value display for multi-selection so common values and divergent values are visible before batch look, mix, and playback-direction adjustments
- Insert Gap adds adjustable empty timeline space at the playhead on the selected track, splits spanning clips, shifts downstream clips, follows sync-lock tracks, and moves markers/captions with `Shift+G`
- Move Selection to Playhead aligns the earliest selected clip or linked V/A group member to the playhead through the same non-overlap clamp as keyboard and pointer moves
- Duplicate copies the selected linked/grouped clip set from the toolbar, Inspector, context menu, or `Ctrl+D`, keeps relative timing across tracks, relinks copied V/A pairs to each other, and places the copy at the next non-overlapping timeline position
- Arrange selected same-track clips packs them together from the toolbar or `Alt+P`, applies the Inspector gap with `Shift+Alt+P`, and preserves clip duration, source timing, effects, keyframes, and unrelated track content
- Copy, cut, paste, close gap, delete left, and delete right editing actions, with close-gap shortcuts on `Alt+G` and `Shift+Alt+G`
- Copy/Paste Attributes copies clip volume, opacity, blend mode, mute state, effects, and duration-scaled keyframes to one or more selected target clips with `Ctrl+Shift+C/V`
- Paste at In Point uses the current paste mode to insert or overwrite clipboard clips at the timeline In mark with `Shift+V`, without manually moving the playhead first
- Close All Gaps compacts the selected track in one command while reusing the same linked V/A, sync-lock, marker, and caption timing rules as single-gap closing
- Select Clip at Playhead selects the active-track clip under the playhead with `D`, expands to all tracks with `Alt+D`, and keeps linked V/A counterparts selected while skipping locked tracks/clips
- Select All with `Ctrl+A` selects editable clips only, skips locked tracks/clips by default, and expands linked/grouped counterparts so follow-up edits act on whole sync units
- Select Marked Range selects clips intersecting the timeline In/Out range with `Shift+D`, expands to all tracks with `Shift+Alt+D`, and preserves linked V/A selection while respecting locked tracks/clips
- Copy Marked Range slices clips at the In/Out boundaries into clipboard-ready relative clips with `Alt+C`, can copy all tracks with `Shift+Alt+C`, and keeps linked V/A, source timing, keyframes, and paste compatibility intact
- Cut Marked Range copies the In/Out slice into the clipboard, removes it from the source timeline, respects the Ripple toggle for extract-style cuts, and preserves linked V/A tail references after the cut
- Track Select Left/Right selects every selectable clip before or after the playhead on the active track, can expand to all tracks with Alt+A, and keeps linked V/A pairs selected together while respecting locked tracks and clips
- Multi-select, box select, append, ripple insert paste, and overwrite paste modes
- Expanded keyboard map for selection, trim, marker navigation, caption split/merge, shuttle, export, render, and timeline navigation
- Right-click timeline context menu for split, trim, side delete, duplicate, marker, mute/lock, detach/relink/unlink/link V/A audio, range, delete, and transition actions
- Editable markers with add, jump, previous/next navigation, direct timeline drag movement, update, duration, note, kind/color, range display, and delete controls
- In/out marks with Lift and Extract range editing
- Lift/Extract range edits preserve linked V/A tail references, `sourceIn`, and sliced keyframes
- 3-point ripple insert/overwrite from source In/Out ranges to timeline marks or playhead, with V/A source patch targets
- Match Frame and Replace Edit connect selected timeline clips back to the Source Monitor, then replace the selected clip from the active source range while preserving the timeline edit slot and undo path
- Linked V/A clips from source patch edits are selected, box-selected across one or more tracks, dragged, deleted, pasted, overwritten, duplicated, split, trimmed, slipped, rolled, slid, unlinked, and manually linked together to preserve sync
- Keyboard and pointer clip moves use the same non-overlap clamp so ordinary timeline moves stop at neighboring clips without breaking linked V/A sync
- Timeline edge trim uses the same group resize core clamp so non-ripple trim stops at neighboring clips/source bounds, while Ripple mode keeps downstream shifting
- Transition apply/remove/update can operate on the selected linked/grouped clip set, auto-overlap the next same-track clip, skip clips that cannot receive or remove a transition, and move linked V/A media together so Program Monitor audio transitions and FFmpeg `xfade`/audio gain curves render without manual overlap prep
- Inspector Start/Duration fields reuse the timeline move/trim core so numeric edits preserve linked V/A sync and neighbor collision limits
- Track Sync toggles opt tracks into ripple insert/extract/delete/close-gap movement so multi-track edits stay aligned when desired
- Ripple insert, paste, source patch insert, trim, extract, ripple delete, and close-gap edits keep timeline markers and captions aligned by shifting later annotations, extending captions across inserted time, and trimming/removing annotations inside removed ranges
- Timeline zoom, real viewport Fit/Fit Selection zoom, ruler click-drag scrubbing, playhead auto-follow, edge auto-scroll while moving, trimming, roll-trimming, slipping, or sliding clips, snap to clip edges, markers, playhead, and In/Out marks during pointer edits, visible move/trim/roll/slip/slide/drop snap guides, snap toggle, ripple mode, track sync-lock toggles, and frame-accurate timecode display
- Track rename, empty-track delete, track order move, selected-clip drag/drop or Inspector track reassignment with target-lane drop preview, mute/solo/sync-lock/lock controls, lock-as-edit-protection without hiding preview/render output, V/A source patch targeting, media-bin insertion by playhead button or direct timeline drag/drop, OS media-file drops into Assets or directly onto timeline lanes, and safe media-bin cleanup for unused assets
- Clip rename and label color controls keep dense timelines readable and update timeline clip cards through the same undoable edit path
- Browser-decoded audio peak waveform display for audio clips with visual fallback
- Video and image clips show cached thumbnails or image sources directly in the timeline
- Server-side `ffprobe` media analysis for durable duration, display resolution, coded resolution, sample/display aspect ratio, video rotation metadata, JPEG EXIF image orientation, FPS, codec, and audio metadata
- Background media cache queue for thumbnails, preview proxies, and waveform peaks with persistent job snapshots, with Source Monitor, Program Monitor, AI review, audio waveform, and timeline thumbnail paths resolved through one proxy-first preview policy
- Preview worker runtime detection benchmarks WebCodecs, VideoDecoder/VideoFrame/EncodedVideoChunk, OffscreenCanvas, ImageBitmap, requestVideoFrameCallback, and frame-budget support, sends timestamp-aware still/video-source/video-thumbnail frame requests, decodes image/thumbnail frames through transferable ImageBitmap delivery, can attempt progressive/common FFmpeg fragmented MP4/MOV/M4V/QT H.264 with CTTS/edit-list timing and orientation metadata, MP4/MOV/M4V/QT H.265 when the browser exposes HEVC WebCodecs support, plus WebM VP8/VP9/AV1 worker decode, including no-lacing and Xiph/fixed/EBML laced WebM blocks, through WebCodecs with cached-thumbnail fallback, displays the latest matching decoded worker frame in the Program Monitor while paused/scrubbing, uses actual HTMLVideoElement frame callbacks for playing video telemetry when available, and shows worker mode, frame budget, and frame-delivery status in the Program Monitor performance overlay
- Asset relink keeps timeline clips intact while replacing missing source/render paths through the media upload pipeline
- Numeric clip inspector for linked-safe start and duration edits, source in, speed, reverse playback, freeze frame holds, volume, opacity, blend mode, clip name/color, canvas Fit/Fill/Stretch, Program Monitor drag positioning/scaling/rotation, Motion transform, Ken Burns motion presets, visual/audio fade controls, batch color grading presets with curve/LUT controls, Visual FX presets with tracked privacy-region, soft-glow, motion-trail, and film-grain controls, local AI enhancement presets, audio cleanup presets, embedded audio detach/relink/unlink/link V/A controls, supported effect add/remove/reorder buttons, toggles, and effect parameters
- Waveform-based peak normalize, silence analysis, and linked-safe ripple removal for selected audio/video-audio clips without cutting overlapping bed audio
- Waveform-based beat detection with beat markers and linked-safe selected-clip beat cuts that keep detached V/A pairs split and relinked together
- Editable captions with add, update, delete, speaker batch correction, speaker diarization draft labels, speaker embedding review counts, speaker turn review, playhead alignment that preserves duration/word timing, draft generation, SRT/WebVTT import, jump, split/merge workflow, style controls, sidecar options, preview overlay, and export-manifest integration
- Editor event hooks for import, export preparation, manual automation, local caption/loudness/color/object-mask action application, gap-based ComfyUI jobs, and an Automation Hooks panel that previews matched rules, applies local actions, queues hook-generated ComfyUI jobs, explicitly executes allowlisted webhooks, retries transient failures, and shows delivery results
- Webhook execution is guarded by `DANBI_EDITOR_WEBHOOK_ALLOWLIST`, `DANBI_EDITOR_WEBHOOK_ALLOW_LOCALHOST`, `DANBI_EDITOR_WEBHOOK_TIMEOUT_MS`, retry limits, scoped `DANBI_EDITOR_WEBHOOK_SECRET_<NAME>` bearer tokens, and the `/api/editor/*` API token gate, so local n8n/Make-style automations can run without opening arbitrary public request targets or storing webhook secrets in project JSON by default
- Render worker central trust policy allows localhost workers, requires remote workers to be enrolled with Trust and protected by Pair token by default, supports worker/origin allowlists and blocklists, filters auto-route candidates, and blocks handoff Submit before package export when the selected worker fails policy
- Queue settings panel for render/cache/ComfyUI/STT worker concurrency and default job priority
- Project panel package controls for exporting/importing portable project JSON outside the SQLite database, plus a Sync folder action for local-first cloud-drive folders
- Project panel autosave recovery with debounced snapshots, manual save-now, restore, and delete controls

## 🎯 Features

- **Web-based UI** for AI generation (no command line needed)
- **Real-time status tracking** with automatic polling
- **Job management** with SQLite database
- **REST API** for automation (n8n, Make, Opal compatible)
- **Local GPU execution** via ComfyUI
- **Workflow management** with parameter injection

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │ ───> │  Next.js App │ ───> │   ComfyUI   │
│   (User)    │ <─── │   (API)      │ <─── │ (localhost) │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │    SQLite    │
                     │  (Database)  │
                     └──────────────┘
```

## 📋 Prerequisites

- **Node.js** 18+
- **StabilityMatrix** with ComfyUI package
- **ComfyUI** running on `localhost:8188`
- **GPU** (NVIDIA recommended)

## 🚀 Quick Start

### 1. Setup ComfyUI (via StabilityMatrix)

See [PHASE1_SETUP_GUIDE.md](./PHASE1_SETUP_GUIDE.md) for detailed ComfyUI setup instructions.

**Quick version:**
```bash
# Install StabilityMatrix to E:\ai_tool\StabilityMatrix
# Create ComfyUI package: "DanbiStudio-ComfyUI"
# Set launch args: --listen 127.0.0.1 --port 8188
# Start ComfyUI
```

### 2. Install Dependencies

```bash
cd E:\ai_tool\Danbi_Studio
npm install
```

### 3. Setup Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Configure Environment

The `.env` file is already configured:
```env
COMFYUI_URL=http://localhost:8188
DATABASE_URL=file:./prisma/dev.db
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For the desktop shell, run:

```bash
npm run electron:dev
```

This starts the Next editor, bundles the Electron main/preload entries into `dist-electron`, and opens `/editor` in a native window with `window.danbiEditor` IPC enabled.

## 📖 Usage

### Web Interface

1. **Home** (`/`) - System status and quick start
2. **Generate** (`/generate`) - Create new AI generation
   - Select model and workflow
   - Enter prompt and parameters
   - Submit to queue
3. **Status** (`/status/[id]`) - Track generation progress
   - Real-time polling
   - Download results
4. **Library** (`/library`) - View all generations

### API Endpoints

#### Create Generation Job
```bash
POST /api/generate
Content-Type: application/json

{
  "modelName": "wan_i2v",
  "workflowName": "test_workflow",
  "parameters": {
    "prompt": "A person talking",
    "seed": 12345,
    "steps": 20
  }
}
```

Response:
```json
{
  "id": "job-uuid",
  "status": "pending",
  "promptId": "prompt-123",
  "createdAt": "2025-12-29T..."
}
```

#### Check Job Status
```bash
GET /api/status/:jobId
```

Response:
```json
{
  "id": "job-uuid",
  "status": "completed",
  "resultPath": "/outputs/result.mp4",
  "modelName": "wan_i2v",
  "workflowName": "test_workflow"
}
```

#### Health Check
```bash
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "services": {
    "database": true,
    "comfyui": true
  },
  "version": "0.1.0"
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Build check
npm run build

# Electron desktop bundle smoke without opening a window
npm run electron:smoke

# Generate the license-safe sample project pack and verify import/edit/export
npm run sample:smoke

# Prepare, package, and smoke-test the Windows unpacked desktop app
npm run electron:package:smoke

# Package and run the real GUI smoke, including sample open and FFmpeg render
npm run electron:gui-smoke

# Browser editor interaction smoke
npm run test:e2e

# Real FFmpeg render smoke using generated local media
npm run test:render-smoke

# Headless render CLI dry-run or render
npm run editor:headless-render -- --project .danbi/render-smoke/portable-package/project.danbi-project.json --profile profile-render-smoke-h264 --dry-run

# Write a local network render worker handoff manifest
npm run editor:headless-render -- --project .danbi/render-smoke/portable-package/project.danbi-project.json --profile profile-render-smoke-h264 --handoff .danbi/render-worker/handoff.json

# Validate or execute a local render worker handoff
npm run editor:render-worker -- --manifest .danbi/render-worker/handoff.json --dry-run --report .danbi/render-worker/report.json

# Validate or execute reviewed external exporter handoffs with an explicit writer process
npm run editor:external-exporter -- --handoff .danbi/external-exporter/exports/reviewed/danbi-external-export-handoff.json --dry-run --report .danbi/external-exporter/report.json
npm run editor:external-exporter -- --handoff .danbi/external-exporter/exports/reviewed/danbi-external-export-handoff.json --writer node --writer-arg scripts/my-export-writer.js --writer-arg "{manifest}" --writer-arg "{output}" --report .danbi/external-exporter/report.json

# Start the local HTTP render worker daemon
npm run editor:render-worker-daemon -- --host 127.0.0.1 --port 47683 --dry-run

# Optional: require a local pair token for status/run/SSE/WebSocket endpoints
npm run editor:render-worker-daemon -- --host 0.0.0.0 --port 47683 --auth-token <pair-token>
$env:DANBI_RENDER_WORKER_AUTH_TOKEN='<pair-token>'; npm run editor:render-worker-daemon

# Optional: let packaged Electron controllers find the worker over the LAN
npm run editor:render-worker-daemon -- --host 0.0.0.0 --port 47683 --discovery --discovery-port 47684

# Then open /editor, use Export Plan > Render worker, enter the same Pair token, click Check, then Submit.
# Use Trust/Forget to persist non-secret worker URL/ID enrollment locally; Pair tokens are not stored.
# Submit exports a portable project package and posts the selected export profiles to the daemon.

# Third-party source/license boundary check
npm run license:check

# Plugin signing readiness summary and production signer generation
npm run plugin-signing:check
$env:DANBI_RELEASE_CHANNEL='production'; npm run plugin-signing:check
npm run plugin-signing:keygen -- --key-id danbi-production-plugin-rsa-2027 --valid-from 2027-01-01T00:00:00.000Z
npm run plugin-signing:rotation-drill
npm run plugin-signing:custody-audit
$env:DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH='.danbi/plugin-signing/danbi-production-plugin-rsa-2026.private.pem'; npm run plugin-package:sign -- --package-dir path\to\plugin-package --key-id danbi-production-plugin-rsa-2026

# Run live ComfyUI integration checks when a local ComfyUI server is available
$env:RUN_COMFYUI_INTEGRATION='1'; npm test
```

**Default test suite:** `npm test` passes 414 tests with 3 integration tests skipped unless their runtime prerequisites are enabled.
**Focused editor core check:** `npx vitest run tests/lib/editor-core.test.ts` passes 198 tests, including FFmpeg render-plan, export-manifest, renderer command dispatcher, video scopes with RGB Parade channel sampling, 30-minute long-form timeline edit/ranged-render stability, range-scoped preview/render preflight parity, output path/container/filesystem access preflight, audio mono-compatibility preflight warnings, deduplicated unsupported-effect parity warnings, compact issue-list hidden-count summaries, render diagnostic action summaries, preflight primary action routing, and preflight parity for track mute/solo visual and audio domains plus locked-track render continuity.
**Playwright editor smoke:** `npm run test:e2e` passes Chromium tests covering root-to-editor entry, desktop/mobile viewport screenshots with reachable Source/Program monitors, Program Monitor composite layer/frame updates, mocked preview-worker decoded frame display in the paused Program Monitor, capability-gated real WebCodecs preview-worker progressive MP4, QuickTime-compatible QT, fragmented MP4, MP4 with edit-list timing, rotated MP4 orientation metadata, MP4 H.265/HEVC, WebM VP8, WebM VP9, WebM AV1, and Xiph/fixed/EBML laced WebM VP8 frame display for imported media when the browser exposes worker decode support, with Vitest coverage for QuickTime-compatible extension routing, MP4 edit-list timeline correction, track mute/solo visual and audio layer updates, locked-track preview continuity, Command Palette search, timeline edits, 30-minute long-form project load/Program Monitor review/gap edit/undo, single-file browser media import/insert/overwrite, Korean/spaced/long-path browser media import with timeline insert/undo, 10-file mixed audio/video/image browser import responsiveness, 3-point overwrite, Match Frame and Replace Edit with undo, precision slide keyboard edit with undo, precision slip/roll Inspector edits with undo selection preservation, clip lock edit rejection/unlock recovery, marked range lift/extract, source monitor marks/playback/loop controls, and empty search results.
**FFmpeg render smoke:** `npm run test:render-smoke` generates local test video/audio under `.danbi/render-smoke`, imports them through the Electron native media import engine, verifies ffprobe-derived metadata and durable source/render paths, builds thumbnail/proxy/waveform media cache, exports/imports a portable project package with copied media and cache files, renders the imported package project through the Electron FFmpeg engine with a clean preflight plus multi-line title and caption layers, verifies the MP4 with `ffprobe`, asserts the FFmpeg `drawtext` plan preserves line breaks, and samples an output frame to confirm editable layers reached the pixels.
**Headless/render worker smoke:** `npm run editor:headless-render -- --project .danbi/render-smoke/portable-package/project.danbi-project.json --profile profile-render-smoke-h264 --dry-run` validates CLI project-package loading, preflight, and FFmpeg command planning; the same command without `--dry-run` renders through the Electron FFmpeg engine. Add `--handoff .danbi/render-worker/handoff.json` to write the local network render-worker manifest, then `npm run editor:render-worker -- --manifest .danbi/render-worker/handoff.json --dry-run --report .danbi/render-worker/report.json` to validate worker claim/report handling. `npm run editor:render-worker-daemon -- --help` validates the daemon bundle; the daemon itself serves `GET /health`, `GET /status`, `POST /runs`, `GET /runs/:id`, `GET /runs/:id/events`, and WebSocket `/events`, with `/runs/:id`, the SSE event stream, and daemon-wide WebSocket events returning live job progress before the final report is complete. Add `--auth-token <pair-token>` or `DANBI_RENDER_WORKER_AUTH_TOKEN` to require the controller's Pair token for `/status`, run endpoints, SSE, and WebSocket events while keeping `/health` open with `authRequired`. Add `--discovery` to answer UDP LAN probes on `--discovery-port` so packaged Electron controllers can find the worker before the usual authenticated `/status` probe. The Export workspace controller applies central trust governance before submission: localhost workers are allowed, remote workers must be trusted and Pair-token protected by default, and blocked workers are excluded from auto-route.
**Electron desktop smoke:** `npm run electron:smoke` bundles Electron main/preload, verifies the generated files and third-party source boundaries, then starts Electron with `DANBI_ELECTRON_SMOKE=1` to register IPC and verify the preload path without opening a window.
**Sample project smoke:** `npm run sample:smoke` generates synthetic FFmpeg media, imports/analyzes/cache-builds it, exports a portable `project.danbi-project.json` with `tutorial.md`, imports the package back, applies a title edit, and renders the edited package with the sample H.264 profile.
**Packaged Electron smoke:** `npm run electron:package:smoke` builds the Next standalone renderer, generates Danbi Studio icon assets, copies static/public release assets, bundles Electron main/preload, writes plugin signing readiness into the release manifest, starts the standalone renderer through Electron's packaged server path, builds `release/electron/win-unpacked` with electron-builder, verifies `resources/renderer/standalone/node_modules/next` and `resources/samples/getting-started`, renders the packaged sample project through import-edit-export smoke, then runs the generated `Danbi Studio.exe` in smoke mode and reads the smoke result JSON, including local data/log/crash paths and FFmpeg discovery diagnostics. The package metadata includes an author, the Windows build uses `build/icon.ico` instead of Electron's default icon, and the smoke fails if those metadata/icon warnings return.
**Packaged Electron GUI smoke:** `npm run electron:gui-smoke` builds `win-unpacked`, launches the packaged `Danbi Studio.exe` with a fresh Electron userData profile, opens the built-in getting-started sample through the Projects panel, verifies Program Monitor timeline layers, edits the project name, builds the Export Plan, clicks the GUI `Render` button, waits for the queued FFmpeg job to complete, and verifies the rendered MP4 under `.danbi/electron-gui-smoke/renders`. Use `npm run electron:gui-smoke -- --skip-package` only when reusing an existing `release/electron/win-unpacked` build that already contains the current source changes.
**Production build:** `npm run build` uses Next 16 with Webpack to avoid Turbopack/NFT false-positive tracing warnings around Node-based FFmpeg/ffprobe routes.

## 📁 Project Structure

```
E:\ai_tool\Danbi_Studio\
├── src/
│   ├── app/                       # Next.js App Router shell
│   │   ├── editor/                # Current browser renderer for the editor
│   │   ├── generate/              # Generation form
│   │   ├── status/[id]/           # Status tracking
│   │   ├── library/               # Results gallery
│   │   └── api/
│   │       ├── editor/            # Editor render, media, hooks, STT, ComfyUI routes
│   │       ├── generate/          # Create generation job
│   │       ├── status/[id]/       # Get job status
│   │       └── health/            # Health check
│   ├── electron/
│   │   ├── main/                  # Desktop-only orchestration, IPC handlers, FFmpeg engine
│   │   ├── preload/               # Typed renderer bridge
│   │   ├── renderer/              # Editor UI panels, clients, view models, workflow helpers
│   │   │   ├── ai-queue-workflow-helpers.ts
│   │   │   ├── automation-hooks-workflow-helpers.ts
│   │   │   ├── audio-analysis-workflow-helpers.ts
│   │   │   ├── caption-workflow-helpers.ts
│   │   │   ├── clip-audio-link-workflow-helpers.ts
│   │   │   ├── clip-clipboard-workflow-helpers.ts
│   │   │   ├── clip-create-workflow-helpers.ts
│   │   │   ├── clip-edit-workflow-helpers.ts
│   │   │   ├── clip-move-workflow-helpers.ts
│   │   │   ├── clip-precision-edit-workflow-helpers.ts
│   │   │   ├── clip-split-trim-workflow-helpers.ts
│   │   │   ├── effect-workflow-helpers.ts
│   │   │   ├── export-workflow-helpers.ts
│   │   │   ├── marker-workflow-helpers.ts
│   │   │   ├── source-edit-workflow-helpers.ts
│   │   │   ├── timeline-mark-workflow-helpers.ts
│   │   │   └── track-workflow-helpers.ts
│   │   └── shared/                # IPC contract, project schema, timeline snapshot, extension API
│   └── lib/
│       ├── editor/                # Pure editor core: timeline, project, render, media, automation
│       ├── comfyui-client.ts      # ComfyUI API client
│       ├── workflow-loader.ts     # Workflow management
│       ├── polling.ts            # Status polling
│       ├── result-handler.ts      # File management
│       └── db.ts                 # Prisma client
├── docs/
│   └── ELECTRON_ARCHITECTURE_REFACTOR_KR.md
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── dev.db                 # SQLite database
├── workflows/
│   └── test_workflow.json     # Workflow definitions
├── public/
│   └── outputs/               # Generated results
└── tests/
    └── lib/editor-core.test.ts # Focused editor core and renderer workflow coverage
```

## 🛠️ Development

### Database Management

```bash
# Open Prisma Studio
npx prisma studio

# Reset database
rm prisma/dev.db
npx prisma db push
```

### Adding New Workflows

1. Create workflow JSON in `workflows/`
2. Test in ComfyUI first
3. Reference by filename (without .json)

Example:
```json
{
  "1": {
    "inputs": {
      "seed": 0,
      "steps": 20
    },
    "class_type": "KSampler"
  }
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMFYUI_URL` | `http://localhost:8188` | ComfyUI server URL |
| `COMFYUI_ALLOWED_URLS` | unset | Comma/space separated remote ComfyUI origins allowed for explicit non-local execution |
| `COMFYUI_ALLOW_LOCALHOST` | `true` | Allows localhost/127.0.0.1/::1 ComfyUI targets by default |
| `DATABASE_URL` | `file:./prisma/dev.db` | SQLite database path |
| `COMFYUI_OUTPUT` | `E:/ai_tool/StabilityMatrix/.../output` | ComfyUI output directory |
| `DANBI_STT_BINARY` | `whisper` | Default local STT executable |
| `DANBI_STT_COMMAND` | unset | Optional command template with `{input}`, `{outputDir}`, `{language}` |
| `DANBI_STT_LANGUAGE` | `auto` | Default STT language |
| `DANBI_STT_SPEAKER_ENCODER_COMMAND` | unset | Optional speaker encoder command template with `{input}`, `{manifest}`, `{outputDir}`, `{language}`, and `{clipId}`; outputs JSON speaker embeddings keyed by caption id |
| `DANBI_EDITOR_API_TOKEN` | unset | Optional token for `/api/editor/*` automation clients and token-gated editor UI sessions; send it as `Authorization: Bearer <token>`, `X-Danbi-Editor-Api-Token`, or `X-Danbi-Api-Token` |
| `DANBI_EDITOR_WEBHOOK_ALLOWLIST` | unset | Comma/space separated public webhook origins, hosts, wildcard hosts, or URL prefixes allowed for explicit webhook execution |
| `DANBI_EDITOR_WEBHOOK_ALLOW_LOCALHOST` | `true` | Allows localhost/127.0.0.1/::1 webhook targets for local automation |
| `DANBI_EDITOR_WEBHOOK_TIMEOUT_MS` | `5000` | Per-attempt webhook request timeout, clamped to 250-30000 ms |
| `DANBI_EDITOR_WEBHOOK_RETRY_COUNT` | `0` | Retry count for transient webhook failures, clamped to 0-3 |
| `DANBI_EDITOR_WEBHOOK_RETRY_DELAY_MS` | `500` | Delay between webhook retries, clamped to 0-10000 ms |
| `DANBI_EDITOR_WEBHOOK_SECRET_<NAME>` | unset | Scoped bearer token secret referenced by automation rule parameter `tokenSecret: "<NAME>"`; the secret is sent as Authorization and redacted from webhook body payloads |
| `FFMPEG_PATH` | `ffmpeg` | Optional FFmpeg executable override; Electron also checks packaged `resources/ffmpeg` and `bin` candidates |
| `FFPROBE_PATH` | `ffprobe` | Optional FFprobe executable override for media analysis |
| `DANBI_FFMPEG_ENCODER` | `software` | `software`, `auto`, or an explicit FFmpeg encoder such as `h264_nvenc` |
| `DANBI_ELECTRON_RESOURCES_PATH` | unset | Packaged renderer/server hint used by FFmpeg discovery in standalone Electron builds |
| `DANBI_ELECTRON_AUTOMATION_SAVE_FILE_PATH` | unset | Test-only save-file dialog override used by packaged GUI smoke; leave unset for normal desktop use |
| `PORT` | `3000` | Next.js server port |

### Job Processing

- **Max Concurrent Jobs:** 1 (configurable)
- **Polling Interval:** 3 seconds (client-side)
- **Timeout:** 5 minutes (server-side)
- **Status Updates:** Automatic via polling

## 📊 Phase Progress

- ✅ **Phase 1:** Environment Setup (90%)
- ✅ **Phase 2:** Next.js Foundation (95%)
- ✅ **Phase 3:** Core Logic (95%)
- ✅ **Phase 4:** Web UI (90%)
- 🚧 **Phase 5:** Polish & Production (in progress)

## 🐛 Troubleshooting

### ComfyUI Connection Failed
```bash
# Check if ComfyUI is running
curl http://localhost:8188/system_stats

# Start ComfyUI via StabilityMatrix
# Or check launch arguments
```

### Database Errors
```bash
# Regenerate Prisma client
npx prisma generate

# Reset database
rm prisma/dev.db
npx prisma db push
```

### Build Errors
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## 📝 License

This project is for personal use. See project documentation for details.

## 🙏 Credits

- **ComfyUI** - AI workflow execution
- **StabilityMatrix** - Model and package management
- **Next.js** - Web framework
- **Prisma** - Database ORM
- **Tailwind CSS** - Styling

## 📚 Documentation

- [Phase 1 Setup Guide](./PHASE1_SETUP_GUIDE.md) - ComfyUI installation
- [Feature Plan](./DANBI_STUDIO_FEATURE_PLAN.md) - Development roadmap
- [API Documentation](./DANBI_STUDIO_FEATURE_PLAN.md#automation-api-specification)
- [Plugin Signing Operations](./docs/PLUGIN_SIGNING_OPERATIONS_KR.md) - production plugin signer key generation, custody, and rotation

## 🚀 Future Features

- [ ] WebSocket real-time updates
- [ ] Image upload support
- [ ] Multiple model support
- [ ] Batch processing
- [ ] Result library with pagination
- [ ] Advanced workflow editor
- [x] External API webhooks with allowlist, localhost guard, timeout, and per-hook delivery reporting

---

**Built with TDD methodology** 🧪 | **Phase 4 Complete** ✅ | **92% Test Coverage** 📊
