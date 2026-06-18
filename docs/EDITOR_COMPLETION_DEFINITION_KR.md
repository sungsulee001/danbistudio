# Danbi Studio Editor 완성품 정의서

작성일: 2026-06-14  
상태: 기준 문서. 이후 편집기 작업은 이 문서의 단계와 완료 게이트에 맞춰 진행한다.

## 1. 목적

Danbi Studio 편집기의 "완성"을 명확히 정의한다. 기능을 끝없이 늘리는 방식은 중단하고, 아래 기준을 만족하는지 여부로 진행 순서와 완료 판정을 결정한다.

이 문서의 원칙:
- 기능 추가보다 먼저 구조, 검증, 완성 기준을 고정한다.
- CapCut, Shotcut, Filmora의 콘텐츠/라이선스/상용 AI 모델/유료 asset library는 범위에서 제외한다.
- 그래도 영상 편집기로서의 기본 조작, 미리보기, 타임라인, 자막, 오디오, 효과, 내보내기 품질은 경쟁 제품급이어야 한다.
- ComfyUI, 자동화, extension API는 기본 편집기를 대체하지 않고 완성된 편집기 위에 붙는 확장 레이어다.

## 2. 벤치마크 기준

2026-06-14 기준 확인한 공식/1차 자료:

- CapCut: 공식 기능 설명은 beginner tools, auto captions, filters, templates, keyframe animation, chroma key, color grading, multi-layer timeline을 강조한다.  
  Source: https://www.capcut.com/resource/capcut-standard-vs-pro
- Shotcut: 공식 feature list는 FFmpeg 기반 wide format support, no-import native timeline, 4K/8K, audio/video filters, multitrack timeline, 3-point editing, keyframes, proxy, markers, scopes, batch/job encode, hardware acceleration을 포함한다.  
  Source: https://www.shotcut.org/features/
- Filmora: 공식 제품 페이지는 timeline editing, silence detection, auto beat sync, audio ducking, sync audio, text/title tools, effects/templates/audio library, AI tools를 제품 기능군으로 제시한다.  
  Source: https://filmora.wondershare.com/video-editor/
- OpenCut: GitHub README는 MIT license, Editor API, plugin-first architecture, MCP server, headless mode, scripting tab 방향을 명시한다.  
  Source: https://github.com/opencut-app/opencut
- Shotcut source: GitHub README는 GPLv3 license와 MLT/Qt/FFmpeg/Frei0r/SDL dependency를 명시한다.  
  Source: https://github.com/mltframework/shotcut

## 3. 완성품 한 문장 정의

Danbi Studio Editor의 완성품은 Windows 로컬 환경에서 실제 미디어를 가져와 멀티트랙 타임라인으로 편집하고, Program/Source Monitor에서 신뢰 가능한 미리보기를 보며, 자막/오디오/효과/색보정/자동화를 적용하고, FFmpeg 기반으로 워터마크 없는 결과물을 안정적으로 내보낼 수 있는 Electron 기반 로컬 영상 편집기다.

## 4. 소스 재사용 원칙

사용자가 명시한 방향: "호환이나 문제가 없으면 Shotcut, OpenCut 소스를 가져다 사용하고, 복제해서 사용 가능한 것은 복제한다."

이를 다음 규칙으로 실행한다.

### 4.1 OpenCut

- OpenCut은 GitHub 기준 MIT license다.
- 호환되는 TypeScript/React/Web editor 구조, UI component, timeline interaction, project API, plugin API 설계는 복제/수정 사용 가능 대상으로 본다.
- 복제 시 필수 조건:
  - 원본 파일/commit/URL/license를 문서에 기록한다.
  - 원본 MIT license notice를 보존한다.
  - Danbi Studio 구조에 맞게 `electron/renderer`, `shared`, `lib/editor` 중 어느 계층에 들어가는지 먼저 결정한다.
  - 가져온 코드는 테스트 없이 병합하지 않는다.

### 4.2 Shotcut

- Shotcut은 GPLv3다.
- GPL 코드를 Danbi Studio 코드베이스에 직접 복사하면 전체 배포 라이선스 의무가 커질 수 있다.
- 따라서 기본 정책은 "구조와 기능 설계 참고"이며, 직접 복사는 다음 중 하나가 결정된 경우에만 허용한다.
  - Danbi Studio 편집기 부분을 GPL 호환 배포로 전환한다.
  - Shotcut/MLT 기반 기능을 별도 GPL process/plugin/submodule로 격리하고 license notice와 source 제공 의무를 충족한다.
  - 동일 기능을 Danbi Studio 쪽에서 clean-room 방식으로 재구현한다.
- Shotcut에서 우선 참고할 대상:
  - MLT/FFmpeg 중심 render pipeline
  - filter catalog와 parameter 노출 방식
  - job queue, proxy, waveform/thumbnail cache
  - multitrack editing command set
  - scopes, monitoring, export preset 구조

### 4.3 공통 source import 절차

어떤 외부 소스도 다음 기록 없이 가져오지 않는다.

1. Source name, URL, commit/tag
2. License
3. 가져온 파일/기능 범위
4. 수정 내용
5. Danbi Studio 내부 위치
6. 테스트 증거
7. 배포 시 notice 필요 여부

이 기록은 `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`에 남긴다. 실제 외부 소스 반입은 해당 등록부에 source, license, commit/tag, import mode, tests, notice 필요 여부를 기록한 뒤 진행한다.

외부 source mirror와 license 운영 규칙은 `docs/THIRD_PARTY_LICENSE_COMPLIANCE_KR.md`를 따른다. 현재 OpenCut/OpenCut Classic/Shotcut mirror의 origin, audit commit, license file, 허용 사용 방식, 배포 경계는 `third_party/source-mirrors.lock.json`에 고정하며, `npm run license:check`가 lock 파일과 문서/NOTICE/register/runtime source 경계를 함께 검사한다.

## 5. 완성품 필수 조건

아래 항목이 모두 충족되어야 "완성품"으로 부른다.

### 5.1 아키텍처

- Electron main/preload/renderer/shared 경계가 실제 파일 구조와 import 규칙으로 지켜진다.
- `src/app/editor/page.tsx`는 shell 수준으로 축소되고, 주요 workflow 판단은 renderer helper 또는 core module에 있다.
- IPC contract는 `shared`에 typed schema로 정의된다.
- project JSON schema는 version/migration/validation/error report를 가진다.
- FFmpeg render engine은 API route 또는 Electron main에서 독립 module로 동작한다.
- extension API는 command, panel, automation hook, render hook을 안정적으로 노출한다.

완료 증거:
- architecture 문서와 실제 import graph가 일치한다.
- circular dependency와 Node API leakage가 없다.
- 타입 검사와 module boundary test가 통과한다.
- Command palette 실행 dispatch는 `renderer/editor-command-dispatcher.ts`로 분리되어 page shell이 command id별 switch를 직접 소유하지 않고, core test가 상태 기반 라우팅을 검증한다.
- Command palette search state tracks total/visible/hidden matches for capped result lists, and the renderer shows the total result count plus hidden command count instead of silently truncating matching commands.

### 5.2 미디어 가져오기와 관리

- video/audio/image/subtitle import가 가능하다.
- media bin은 search, sort, bins, smart collections, used/unused 상태를 제공한다.
- thumbnail, waveform, proxy/cache 상태가 보인다.
- missing media relink와 health warning이 있다.
- 대용량 파일/한글 경로/공백 경로/긴 경로를 처리한다.

완료 증거:
- 샘플 프로젝트 import/relink/cache 테스트 통과.
- EDL offline placeholder relink core test: 수동 relink 후 stale `offlinePlaceholder` metadata를 false로 정리하고 실제 `edlSourceFile`/`edlRelinkHint`를 갱신해 Media Health blocked 상태가 남지 않는지 검증한다. EDL import는 뒤쪽 event에서 늦게 발견된 source file도 기존 placeholder의 `renderPath`/metadata에 반영하고, `file:////server/share/...` UNC file URL을 Windows render path로 복원한다.
- FCPXML offline/local media health/relink core test: source path가 없는 FCPXML asset은 `fcpxmlRelinkHint`를 보존하고 generic missing-source 대신 FCPXML relink 문맥의 preview/export blocked issue를 표시하며, 로컬 `src`/`file://` asset은 `renderPath`와 `fcpxmlAutoRelinked` metadata로 자동 복원되고, 수동 relink 후 실제 `fcpxmlSourceFile`/`fcpxmlRelinkHint`로 갱신되어 blocked issue가 남지 않는지 검증한다. `file:////server/share/...` UNC file URL과 `src` render path + `data-danbi-source` preview cache 조합도 import 후 render/preview 경계를 유지한다.
- 실제 로컬 파일 10개 이상 혼합 import 시 UI가 멈추지 않는다. 현재 Playwright e2e는 임시 audio/video/image 파일 10개를 생성해 브라우저 import 후 Media Bin 삽입/덮어쓰기 버튼과 Command Palette 반응성을 검증한다.
- 한글/공백/긴 로컬 경로 import Playwright e2e는 한글 폴더, 공백 포함 폴더, 120자 이상 경로의 wav 파일을 생성해 브라우저 import, Media Bin 표시, timeline insert, undo 복구를 검증한다.
- Import routing core test는 video/audio/image media와 SRT/WebVTT caption sidecar를 구분하고, Electron native import가 sidecar를 FFmpeg 분석이 아닌 caption import content로 반환하는지 검증한다.

### 5.3 타임라인 기본 편집

- multitrack video/audio/image/text/adjustment/caption clip을 지원한다.
- append, insert, overwrite, lift, ripple delete, split, trim, slip, slide, roll, move, nudge, duplicate, group, lock, mute, solo가 동작한다.
- source monitor와 program monitor 기반 3-point editing이 가능하다.
- Match Frame으로 선택한 타임라인 클립의 현재 소스 프레임을 Source Monitor에 로드하고, Replace Edit으로 active source range를 선택 클립에 교체 적용할 수 있다.
- markers, in/out range, selection box, snapping, zoom, scroll, keyboard shortcuts가 안정적이다.
- undo/redo와 autosave가 모든 주요 편집 명령에 적용된다.

완료 증거:
- timeline command unit test와 Playwright interaction test 통과.
- Match Frame/Replace Edit command palette e2e는 타임라인 클립의 source time match, Source Monitor 이동, 외부 media source range 기반 선택 클립 교체, undo 복구를 검증한다.
- Precision slide keyboard e2e는 같은 트랙의 이전/선택/다음 클립 조건에서 `Shift+Alt+ArrowRight` 슬라이드 편집, 선택 클립 시작점 이동, undo 복구를 검증한다.
- Precision slip/roll Inspector e2e는 `Slip +1f`, `Roll head +1f`, `Roll tail +1f`가 선택 클립의 `Source In`, `Start`, `Duration` 값을 프레임 단위로 바꾸고 undo 후 선택 클립과 값이 복구되는지 검증한다.
- Clip lock e2e는 Inspector `Clip lock`이 선택 clip의 Start 편집을 차단하고, unlock 후 같은 편집이 적용되며 undo로 원위치 복구되는지 검증한다.
- Track mute/solo/lock Program Monitor e2e는 `A-roll mute`가 visual layer와 embedded audio layer를 제거하고, `Music solo`가 audio domain에서 음악 layer만 남기며, `A-roll lock`은 편집 보호 상태만 바꾸고 preview layer를 유지하는지 검증한다.
- Track mute/solo/lock FFmpeg render plan core test는 muted A-roll이 final render input에서 제외되고, locked A-roll은 final render input/audio filter를 유지하며, Music solo가 video output은 유지하면서 embedded video audio filter를 제외하는지 검증한다.
- Track playback export manifest/preflight core test는 muted/solo로 실제 렌더되지 않는 track/clip이 export manifest와 preflight manifest issue에서 제외되고, locked track은 편집 보호 상태로만 남아 final export 대상에 포함되는지 검증한다.
- 30-minute long-form core regression은 60개 video 컷, 12개 audio bed, title/caption/marker가 있는 30분 프로젝트에서 split, trim, sync-locked gap insert, range selection/copy, project JSON validation, FFmpeg ranged render plan, clean preflight를 검증한다.
- 30-minute long-form core regression은 timeline viewport render window가 현재 화면과 overscan 안의 clip만 렌더 대상으로 고르고 선택 clip은 viewport 밖이어도 유지하는지 검증한다.
- 30-minute long-form Playwright e2e는 같은 fixture를 DB API로 저장한 뒤 실제 편집기 UI에서 Projects 패널 로드, 301초 Program Monitor composite, timeline gap edit, undo 복구를 검증한다.
- 최소 30분 길이 프로젝트에서 기본 편집이 가능한 수동 검증 기록.

### 5.4 미리보기와 모니터

- Program Monitor는 timeline composite를 최대한 render result와 일치하게 보여준다.
- Source Monitor는 source range, subclip, mark in/out, insert/overwrite 흐름을 지원한다.
- playback, scrub, frame step, shuttle, loop가 끊김 없이 동작한다.
- preview worker/WebCodecs/Canvas fallback 전략이 있고, requestVideoFrameCallback 기반 실제 video element frame telemetry와 worker still/video-source/video-thumbnail frame request/frame delivery 상태가 Program Monitor overlay에 표시된다.
- preview와 final render 차이가 있는 기능은 preflight warning으로 표시된다.

완료 증거:
- preview/render parity test.
- canvas nonblank/frame update test.
- Program Monitor frame telemetry core test: requestVideoFrameCallback metadata의 presented frame count, media time, expected display time, processing duration을 frame drop telemetry로 변환하는지 검증한다.
- Preview worker frame request core test: 실제 video source는 media timestamp를 가진 `decodeSourceKind: "video"` 요청으로 분류하고, cached thumbnail은 같은 video layer를 `decodeSourceKind: "image"` ImageBitmap delivery로 처리하는지 검증한다.
- Preview worker decoded-frame e2e: Playwright가 browser worker frame message를 mock해 transferable `ImageBitmap`이 renderer object URL로 변환되고 정지/스크럽 상태의 Program Monitor video layer에 실제 `<img>` frame으로 표시되는지 검증한다.
- Preview worker real WebCodecs e2e: 브라우저 worker가 `VideoDecoder`, `EncodedVideoChunk`, `OffscreenCanvas`, 관련 codec config를 지원한다고 보고하는 경우, 임시 progressive MP4/H.264 avc1/avc3, QuickTime-compatible QT/H.264, FFmpeg fragmented MP4/H.264, MP4 edit-list timing, rotated MP4 orientation metadata, MP4/H.265 HEVC, MP4/AV1 av01, MP4/VP8/VP9 vp08/vp09, Matroska H.264/H.265, WebM/VP8, WebM/VP9, WebM/AV1, Xiph/fixed/EBML laced WebM/VP8을 import한 뒤 실제 `public/editor-preview-worker.js` 경로가 decoded `ImageBitmap` frame을 Program Monitor에 표시하는지 검증한다. QuickTime-compatible MP4/MOV/M4V/QT extension routing, MP4 CTTS/edit-list timeline correction, compact `stz2` sample-size expansion, fragmented MP4 consecutive `trun` data cursor continuity, MP4 `mdhd`/`mvhd`/`stsd` metadata truncation guard, Matroska H.264/H.265 `CodecPrivate` track parsing, WebM SimpleBlock/lacing truncation guard, orientation draw planning은 worker internals Vitest로 직접 검증한다. 미지원 Chromium build 또는 HEVC encoder/decoder 미지원 환경에서는 capability-gated skip으로 처리한다.
- Program Monitor composite e2e: 기본 프로젝트의 media/audio layer summary, monitor frame size, title/caption layer update를 검증한다.
- Program/Source Monitor video scopes test: sampled RGBA frame이 luma histogram, waveform, RGB Parade, vectorscope뿐 아니라 Balanced/Clipping/Dark/Bright/Flat readout과 shadow/highlight share warning으로 변환되어 Program Monitor scopes overlay, Scene readout, Source Monitor source-clip scope overlay에서 색/노출 판단을 숨기지 않는지 검증한다.
- Program Monitor track playback e2e: track mute/solo 상태가 visual/audio domain에 따로 적용되고, track lock은 preview를 끄지 않는 편집 보호 상태로만 처리되는지 Program Monitor composite stack summary와 layer list로 검증한다.
- FFmpeg render plan parity test: track mute/solo/lock 상태가 최종 render input, audio filter graph, export manifest, render preflight manifest에도 Program Monitor와 같은 visual/audio domain 정책으로 적용되는지 검증한다.
- Marked range preview/render parity core test: render preflight가 marked range 밖의 browser-only media 문제를 export 차단 사유로 오판하지 않고, 같은 문제가 range 안에 들어오면 preview-render blocked issue로 잡는지 검증한다.
- Output path/container/filesystem preflight core test: 선택한 output 확장자가 export profile container와 맞지 않거나 확장자가 없거나 실제 output target이 디렉터리이면 render queue/direct engine preflight가 blocked issue로 멈추는지 검증한다.
- Preflight primary action core test: preflight issue actionKind가 cache/relink/output/profile/render/review/timeline 등 사용자 조치 label과 Resolve action kind로 변환되는지 검증한다.
- Render diagnostic action summary core test: FFmpeg 실패 category가 Render Status/Job History에서 사용자 조치 label, retry 가능 여부, evidence, Resolve action kind로 변환되는지 검증한다. Browser-only source는 plan warning이 축약되어도 input source 기준으로 unsupported-source 진단과 relink/import 조치로 분류되는지 검증하고, missing-media Resolve는 evidence/stderr의 input path를 매칭해 올바른 asset relink 대상으로 연결되는지 검증한다.
- desktop/mobile viewport screenshot test: Playwright가 1280x720과 390x844에서 editor를 열고 Source/Program Monitor, Command Palette, composite stack 접근성을 확인하며 스크린샷 artifact를 첨부한다.

### 5.5 오디오

- waveform, gain, pan, mute/solo, detach audio, linked audio/video edit가 안정적이다.
- fade, crossfade, normalize, denoise, compressor/EQ/limiter 계열 효과가 render된다.
- voiceover 또는 외부 음성 녹음 import workflow가 있다. 현재 Media Bin에서 브라우저 `MediaRecorder` 기반 voiceover 녹음을 시작/정지하고, 녹음 파일을 기존 media upload/cache/import 경로에 태운 뒤 playhead의 audio patch track에 삽입한다.
- loudness/peak meter와 clipping warning이 있다. Program Monitor는 timeline mix를, Source Monitor는 insert/overwrite 전 source range audio peak/clipping을 표시한다.

완료 증거:
- FFmpeg audio filter render test.
- waveform cache와 linked edit test.
- Program Monitor audio meter/analyzer runtime waveform fallback test: persistent cache가 아직 project JSON에 저장되지 않은 imported audio와 새 subclip도 renderer runtime waveform map을 통해 peak meter, analyzer, clipping warning 대상이 되며, subclip은 parent asset runtime waveform을 재사용한 뒤 원본 source in/out 범위로 잘린다.
- Source Monitor audio meter test: source range waveform peak가 pending/hot/clipping readout으로 변환되고, runtime waveform fallback이 새 subclip의 parent asset runtime waveform map을 재사용한 뒤 subclip 원본 source in/out에 맞게 잘린 채 metering/export preflight/project-cache persistence까지 이어지며, Playwright가 `source-audio-meter` overlay를 실제 Source Monitor에서 확인한다.
- voiceover helper unit test와 imported audio timeline placement test.

### 5.6 자막과 텍스트

- SRT/VTT import/export, timeline caption edit, subtitle burn-in, sidecar export가 가능하다.
- text/title clip은 font, size, position, opacity, shadow/background, multi-line text, animation/keyframe 기본값을 가지며 Program Monitor preview와 FFmpeg drawtext render가 같은 line break/shadow/box style을 사용한다.
- local STT는 optional layer이며, 모델이 없어도 수동 자막 workflow가 완성되어야 한다.

완료 증거:
- subtitle round-trip test.
- burn-in render test, including real FFmpeg smoke coverage for multi-line title/caption drawtext output.
- caption sidecar export/import test, manual line break preservation test, WebVTT shadow style metadata test, FCPXML multi-line title style metadata round-trip test, FCPXML Danbi clip effect/keyframe/transition metadata round-trip test.
- Import 버튼과 Media Bin drop은 `.srt/.vtt` 파일을 Media Bin asset으로 오인하지 않고 caption sidecar import workflow로 보낸다.

### 5.7 효과, 색보정, 모션

- 기본 transform: position, scale, rotate, crop, opacity, blend.
- color: exposure/contrast/saturation/temperature/tint, curves, LUT.
- FX: blur, sharpen, vignette, pixelate, chroma key, mask, stabilize, speed, reverse, freeze frame.
- keyframe editor는 최소 linear/ease in/ease out을 지원한다.
- Implementation note 2026-06-15: Keyframe editor easing is implemented for `hold`, `linear`, `easeIn`, `easeOut`, `easeInOut`, and legacy `smooth`; schema validation rejects unknown easing values and FFmpeg render expressions use matching easing math for transform, opacity, and volume keyframes.
- adjustment layer 효과가 하위 clip에 적용되고 render와 맞아야 한다.
- Implementation note 2026-06-15: Subject tracking reframe과 tracked object mask는 generated start/mid/end path를 deterministic smoothing/quality report로 보강하고, render에 실제 사용되는 focal/mask start-mid-end 좌표와 tracking mid/end time을 Inspector parameter controls에서 직접 조정할 수 있으며 stable/review quality readout으로 급격한 tracking jump를 검수할 수 있다. Tracking control point parameter를 수정하면 quality score, max jump, review 상태가 자동 재계산된다.
- Implementation note 2026-06-16: Subject tracking reframe과 tracked object mask는 외부 detector/model observation hint를 받아 confidence filtering, malformed rejection, start/mid/end 압축, average confidence와 accepted/rejected hint telemetry 저장을 수행하며, 결과는 기존 Program Monitor/FFmpeg render-driving focal 또는 mask-center parameter에 그대로 반영된다.

완료 증거:
- effect parameter unit test.
- preview/render parity test.
- sample export visual review.

### 5.8 내보내기와 렌더

- full timeline과 marked range export가 가능하다.
- H.264/H.265/ProRes 또는 동등한 intermediate export profile을 지원한다.
- 현재 기본 프로젝트는 `ProRes 422 HQ Master` MOV profile을 포함하고, FFmpeg render plan은 `prores_ks`, `yuv422p10le`, ProRes HQ profile, PCM audio를 사용한다.
- hardware encoder detection과 software fallback이 있다.
- render queue, progress, cancel, retry, failure log, output open 기능이 있다.
- render preflight는 missing media, unsupported effect, cache gap, caption issue, preview/render mismatch를 알려준다.
- caption issue preflight는 invalid timing을 blocked로 차단하고, empty/overlapping/project-duration overflow caption을 warning으로 표시하며 caption focus plan으로 연결한다.
- export profile dimension preflight는 FFmpeg pixel format과 codec 실패를 막기 위해 홀수 width/height를 blocked issue로 차단한다.

완료 증거:
- render plan snapshot test.
- 실제 FFmpeg output 생성 test.
- 실패/취소/retry test.
- marked range export preflight test: preview/render parity sampleTimes가 exportRange 안으로 제한되고 range 밖 media-health/preview-render issue는 제외된다.
- caption preflight core test: invalid timing, empty caption, overlapping captions, project-duration overflow가 source `caption` preflight issue로 합쳐지고 관련 caption/time focus plan을 생성하는지 검증한다.
- export profile preflight test: container/codec 불일치가 source `profile` blocked issue로 잡히고 Review profile primary action을 생성하는지 검증한다.
- export profile dimension test: profile 편집 helper는 홀수 해상도를 가장 가까운 짝수값으로 정규화하고, 저장된 프로젝트 JSON과 render preflight는 홀수 export width/height를 오류로 차단한다.

### 5.9 프로젝트 저장과 호환성

- `.danbi-project.json` 저장/열기/마이그레이션이 안정적이다.
- autosave recovery와 package export/import가 가능하다.
- optional cloud sync는 외부 provider SDK 없이 사용자가 선택한 sync folder에 portable package와 `danbi-cloud-sync.json`/`danbi-cloud-sync-index.json` manifest를 쓰고, 더 최신 원격 snapshot overwrite를 기본 차단한다.
- schema validation error는 사용자가 복구 가능한 메시지로 보인다.
- 향후 OpenCut/MLT/EDL/FCPXML/AAF 중 최소 1개 이상의 interchange format을 연구/도입한다.

완료 증거:
- schema migration test.
- caption word timing schema validation test: word object, start/end ordering, caption range, text, confidence, 단어 순서 역전과 겹침 오류가 project JSON validation error로 보고된다. STT caption review/cleanup core test는 caption 범위 밖 word timing뿐 아니라 겹치거나 역순인 word timing을 `word-timing-drift`로 보고하고 cleanup이 정렬된 비겹침 timing으로 복구하는지 검증한다.
- caption style schema validation test: font size, hex color, box/shadow boolean, opacity, shadow offset, position, align 오류가 project JSON validation error로 보고된다.
- clip effect schema validation test: effect id/type/label/enabled/parameters 공통 오류와 text clip title-style effect parameter 오류가 project JSON validation error로 보고된다.
- automation/plugin/export profile schema validation test: provider, trigger, targetTrackIds, plugin permission/contribution, export container/codec/dimension/fps/bitrate/preset/CRF 오류가 project JSON validation error로 보고된다.
- export profile compatibility test: container/codec 불일치가 project JSON validation error와 render preflight blocked issue로 보고되고, WebM export profile은 AV1 codec option과 Opus audio FFmpeg command를 생성한다.
- export profile dimension schema validation test: export profile width/height는 16~8192 범위의 짝수 정수여야 하며, 홀수 해상도는 project JSON validation error와 render preflight blocked issue로 보고된다.
- corrupted project recovery test.
- package round-trip test: render media가 있는 asset은 `source`가 `offline://...` preview placeholder여도 portable package export를 막지 않고, placeholder source는 비복사 preview 재캐시 대상으로 남기며 `renderPath`만 package media path로 rewrite되는지 검증한다. External preview URL은 `externalCount`로 별도 집계되어 로컬 완결성과 외부 참조를 구분하고, legacy package처럼 `externalCount`가 없거나 오래된 count가 저장된 manifest도 import 시 entries 기준으로 재계산한다. Readiness summary도 저장된 count가 아니라 valid entry 기준으로 계산해 tampered count/unsafe path가 ready 상태로 보이지 않게 한다. Package import rewrite는 manifest의 `packagePath`가 절대 경로이거나 `../` traversal이면 해당 entry를 rewrite하지 않고 warning으로 남기며, unsafe `packagePath`, invalid role/status 또는 객체가 아닌 entry는 manifest count와 rewrite count에 넣지 않고 skip한다. Generated sample package는 missing/volatile/external/copy-failed media reference가 있으면 실패한다. Electron package folder export는 `file://server/share/...`와 `file:////server/share/...` UNC file URL을 같은 Windows source path로 해석해 FCPXML/EDL에서 복원된 네트워크 원본을 portable package copy 경로에서도 유지하며, copy 결과로 missing/copy-failed 상태가 생기면 저장된 `mediaManifest.warnings`와 package `warnings`를 entries 기준으로 다시 계산한다.

### 5.10 자동화, ComfyUI, extension API

- editor command를 script/API/hook에서 호출할 수 있다.
- ComfyUI는 selected clip, range, batch, before-export hook과 연결된다.
- headless render/batch mode가 가능하다. 현재 `npm run editor:headless-render`는 raw project JSON과 portable `.danbi-project.json`을 읽고, 선택 profile 또는 all profile dry-run/render를 수행한다. `--handoff <path>`를 주면 local network render worker가 가져갈 manifest를 생성한다. `npm run editor:render-worker -- --manifest <handoff.json>`는 해당 manifest를 읽어 dry-run/선택 job 실행/report 생성을 수행한다. `npm run editor:render-worker-daemon`는 local HTTP worker endpoint와 WebSocket `/events`를 열어 controller가 handoff를 제출하고 run report, SSE progress event, daemon-wide fleet status event를 조회할 수 있게 하며 `--max-runs` capacity와 run lease metadata로 queued/running run을 관리한다. `--auth-token <token>` 또는 `DANBI_RENDER_WORKER_AUTH_TOKEN`을 쓰면 `/status`, run endpoint, SSE, WebSocket fleet stream은 Pair token이 있어야 접근되고 `/health`는 `authRequired` 상태만 공개한다. `--discovery`를 쓰면 daemon이 UDP LAN probe에 worker URL/authRequired/discovery port를 응답하고, packaged Electron controller는 preload IPC로 LAN 후보를 받은 뒤 기존 authenticated `/status` probe에 합친다. Export workspace의 Render worker panel은 daemon/fleet discovery, zero-config LAN discovery, manual remote daemon enrollment, worker selection, Pair token 입력, 비밀을 저장하지 않는 Trust/Forget 로컬 worker enrollment, 중앙 trust policy summary와 per-worker allow/block reason, daemon 상태 확인, package export 기반 handoff 제출, WebSocket fleet status update, SSE progress update, polling fallback, job-level progress snapshot, running/queued/capacity, lease 표시를 제공한다. Submit/auto-route는 기본 중앙 정책에 따라 localhost worker는 허용하고 원격 worker는 Trust 등록과 Pair token 요구를 통과해야 사용한다.
- extension은 UI panel, command, automation hook, render hook을 등록할 수 있다.
- Implementation note 2026-06-16: 외부 plugin exporter writer는 `runtimePackage` 파일 manifest를 선언할 수 있다. Project JSON/sandbox 경계는 package root, entry, file path, sha256, bytes를 검증하고, Plugins panel은 package 상태를 표시하며, approved writer fingerprint는 package metadata 변경 시 stale 처리된다. Reviewed handoff JSON은 package metadata를 보존하고, `npm run editor:external-exporter`는 trusted declared writer 실행 전에 package root containment, entry listing, regular file, bytes, SHA-256 digest를 검증한다. `danbi-plugin-package.json` 기반 local plugin package install/update channel은 manifest signature와 파일 hash를 검증하고 safe `plugins/`/`tools/` 경로만 Electron package root로 복사한 뒤 project JSON을 저장한다. 외부 plugin file import 자체는 계속 닫혀 있고, 설치 채널은 manifest 등록과 packaged writer file 배포 경계만 담당한다.
- 외부 자동화는 allowlist/security boundary를 가진다.

완료 증거:
- extension fixture test.
- hook execution test.
- headless render smoke test.

### 5.11 패키징과 운영

- Windows desktop app으로 설치/실행 가능하다.
- FFmpeg dependency 탐지와 설정 UI가 있다.
- 로그, crash report, render diagnostics가 사용자에게 노출된다.
- Export workspace에 render queue, media-cache, ComfyUI, STT 작업을 합친 Job History dashboard가 있어 active/failed/completed/cancelled 작업 상태를 한 화면에서 확인할 수 있다.
- Local network render worker의 1차 경계로 headless handoff manifest, manifest runner CLI, HTTP daemon endpoint, daemon/fleet discovery, zero-config UDP LAN discovery, manual remote daemon enrollment, worker selection, optional Pair token authentication, local trusted-worker registry, 중앙 trust policy/governance, daemon-wide WebSocket fleet event stream, SSE progress stream, capacity scheduling, run lease metadata, automatic least-loaded worker routing, Export workspace controller panel, job-level progress snapshot이 있다. 중앙 정책은 localhost worker 허용, 원격 worker Trust 등록 요구, 원격 Pair token 요구, worker/origin allowlist/blocklist, fleet summary, per-worker reason, Submit 전 차단, auto-route candidate filtering을 포함한다.
- sample project와 tutorial project가 포함된다.
- offline/local-first 동작이 기본이다.

완료 증거:
- packaged app smoke test.
- fresh Windows user profile에서 실행 test.
- offline mode test.

## 6. "CapCut, Shotcut, Filmora보다 좋다"의 판정

모든 면에서 동일한 콘텐츠 라이브러리나 상용 AI 모델을 복제한다는 뜻이 아니다. 다음 조건을 만족하면 Danbi Studio의 목표 문장에 부합한다.

- CapCut 대비: cloud/template 의존보다 로컬 파일 소유권, 무워터마크 export, ComfyUI/local automation, scriptable workflow가 강하다.
- Shotcut 대비: FFmpeg/MLT급 기본 편집 안정성에 더해 현대적인 Electron UI, AI/automation hooks, extension API가 있다.
- Filmora 대비: 사용 편의성과 creator workflow를 제공하되 유료 asset/AI credit 의존 없이 local pipeline과 커스텀 자동화가 가능하다.

판정 방식:
- 기본 편집 depth는 Shotcut feature class를 기준으로 한다.
- creator workflow와 UX 속도는 CapCut/Filmora를 기준으로 한다.
- 확장성과 자동화는 OpenCut rewrite 방향과 Danbi Studio의 ComfyUI integration을 기준으로 한다.

## 7. 단계별 진행 계획

### Phase 0. 완성 기준 고정

목표: 이 문서와 기존 spec/architecture 문서를 맞추고, 더 이상 무작정 기능을 추가하지 않는다.

해야 할 일:
- 이 문서를 README 문서 목록에 연결한다.
- 기존 `EDITOR_PRODUCT_SPEC_KR.md`, `EDITOR_ARCHITECTURE_KR.md`, `ELECTRON_ARCHITECTURE_REFACTOR_KR.md`와 중복/충돌 항목을 정리한다.
- source reuse register 문서를 만든다.

완료 게이트:
- 문서 간 우선순위가 명확하다.
- 다음 구현 task가 이 문서의 항목과 연결된다.

### Phase 1. 소스 재사용 감사와 아키텍처 동결

목표: OpenCut/Shotcut에서 가져올 수 있는 것과 직접 구현할 것을 분류한다.

해야 할 일:
- OpenCut MIT source 중 복제 가능한 editor API, plugin, timeline UI 후보 조사.
- Shotcut GPL source 중 직접 복사 금지/격리 가능/clean-room 재구현 대상 분류.
- Electron main/preload/renderer/shared boundary final pass.
- `page.tsx` shell 축소 기준 확정.

완료 게이트:
- `THIRD_PARTY_SOURCE_REGISTER_KR.md` 존재.
- source import 후보마다 license decision이 있다.
- no new feature without mapped requirement.

### Phase 2. 편집기 기본기 완성

목표: Shotcut급 non-linear editing 기본기를 먼저 완성한다.

해야 할 일:
- timeline commands missing gap audit.
- source/program monitor workflow 완성.
- Implementation note 2026-06-17: `src/electron/renderer/timeline-source-helpers.ts` now includes `auditSourceMonitorConsistency`, which audits Source Monitor selected asset fallback, clamped source range, playhead normalization, loop-range validity, editable primary/audio patch targets, and no-enabled-patch states. `src/app/editor/page.tsx` uses that audit as the single Source Monitor self-heal path for asset/range/playhead/loop/patch state while preserving explicit user navigation to source start/end. Source loop enablement also resets non-finite playheads to source in, and `tests/lib/editor-core.test.ts` covers clean, repaired, no-source failure, explicit start, and non-finite playhead normalization reports.
- undo/redo/autosave consistency audit.

Implementation note 2026-06-17: `src/electron/renderer/project-persistence-workflow-helpers.ts` now includes `auditProjectPersistenceConsistency`, which audits undo/redo stack bounds, no-op history/future duplicates, saved/autosaved marker shape, derived save state, and whether dirty projects schedule autosave and before-unload warnings. Persistence sessions also avoid adding an undo entry when loading the same serialized project, so reload/restore no-ops do not create history churn. `tests/lib/editor-core.test.ts` covers saved, autosaved, dirty, invalid-marker, duplicate-history, and same-project load cases.
- Implementation note 2026-06-17: `resolveProjectPersistenceConsistencyState` now repairs recoverable editor session metadata by trimming over-limit undo/redo stacks, dropping current-project no-op history/future entries, and clearing invalid saved/autosaved marker text before the editor page derives save/autosave state. `src/app/editor/page.tsx` runs this resolver as the runtime session self-heal path, and core tests prove the repaired session passes the persistence audit.
- Implementation note 2026-06-17: The Project workspace now wires `resolveProjectRecoveryIndexState` into a Recovery panel that ranks database saves, autosaves, local fallback snapshots, and the most recent package import in one visible candidate list. The panel reuses the existing database load, autosave restore, local fallback restore, and package import session flows, while invalid browser fallback JSON is excluded from passive UI indexing and surfaced as a status error only when explicitly restored.
- Implementation note 2026-06-17: Recovery UI has Playwright coverage for visible database/autosave/local-fallback/package-import candidates and explicit fallback/autosave/package reopen actions. Browser local fallback indexing now runs after mount instead of in the initial React state, avoiding SSR/client hydration mismatches when a clean browser profile already contains a fallback snapshot.
- keyboard shortcut and command palette audit.

Implementation note 2026-06-17: `src/lib/editor/command-registry.ts` now includes `auditEditorCommandSurface`, a required command/shortcut coverage audit for project/view, playback, core clip editing, clipboard/append, marked range/gap, precision trim/delete-side, transitions, timeline annotations/navigation, Source Monitor/3-point editing, media cache, and export. `tests/lib/editor-core.test.ts` runs the audit and explicitly covers the formerly missing palette-visible commands for ungroup, cut, paste, paste attributes, append, delete-left/right, transition presets, and close-all-gaps.
- Playwright editor interaction tests 추가.

완료 게이트:
- 10분짜리 샘플 프로젝트를 import부터 export까지 편집 가능.
- 주요 timeline command e2e test 통과.

### Phase 3. preview/render parity

목표: 보이는 것과 나가는 파일을 맞춘다.

해야 할 일:
- preview worker 실제 video demux/WebCodecs frame decode 경로 보강. 현재 requestVideoFrameCallback 기반 실제 video element telemetry, still image, video source timestamp-aware request, video layer cached thumbnail ImageBitmap worker delivery, QuickTime-compatible MP4/MOV/M4V/QT extension routing, progressive MP4/H.264 avc1/avc3 CTTS/edit-list timing, compact `stz2` sample-size table, 64-bit `co64` chunk offset table 및 `mdhd`/`mvhd`/`stsd`/`stsz`/`stz2`/`stts`/`ctts`/`stss`/`stsc` 안전 범위/truncation guard, MP4 orientation metadata, FFmpeg fragmented MP4/H.264 CTTS/edit-list timing과 `tfhd`/`tfdt`/`trun` 안전 범위/truncation guard, 연속 `trun` data cursor 처리 및 MP4 orientation metadata, MP4/H.265 HEVC, MP4/AV1 av01, MP4/VP8/VP9 vp08/vp09, WebM/VP8, WebM/VP9, WebM/AV1, Matroska H.264/H.265 `CodecPrivate`, Xiph/fixed/EBML laced WebM/VP8 worker decode attempt, WebM SimpleBlock/lacing 안전 범위/truncation guard와 cached-thumbnail fallback, 정지/스크럽 상태의 timestamp-matching decoded worker frame 표시, capability-gated browser smoke가 구현되어 있다. 남은 작업은 더 복잡한 MP4/WebM 변형과 브라우저가 노출하는 추가 codec/profile coverage다.
- FFmpeg render engine parity matrix 작성.
- Implementation note 2026-06-16: `src/lib/editor/preview-render-parity.ts` now builds an export-graph feature matrix for media sources, enabled effects, outgoing transitions, and captions. Warning/blocked matrix rows are promoted into render preflight `preview-render` issues, partial Program Monitor previews such as stabilize approximation are warning rows instead of matched rows, `PreviewRenderParityPanel` shows matched/warning/blocked matrix counts, and core tests cover unsupported effect matrix warnings plus partial-preview warnings.
- Implementation note 2026-06-17: unsupported preview/render mismatch warnings are cleaned up by treating the export-graph feature matrix as the single source for unsupported effects, browser-only render inputs, effect-layer render gaps, and AI model-pass preview gaps; sample-time preview scans keep only Program Preview warnings, and core tests assert unsupported-effect preflight warnings are not duplicated.
- sample exports 자동 생성 test.
- Implementation note 2026-06-16: The sample export path now has a fast core regression in `tests/lib/editor-core.test.ts`: it builds the generated getting-started sample project from imported synthetic media descriptors, applies the verification title edit, validates project JSON, confirms clean media/preflight/parity matrix state, builds the FFmpeg plan with the edited drawtext, creates headless render requests, and emits a render-worker handoff without invoking FFmpeg.

완료 게이트:
- 핵심 effect/text/caption/audio/render parity test 통과.
- render preflight가 known mismatch를 모두 잡는다.

### Phase 4. creator workflow polish

목표: CapCut/Filmora급 속도와 편의성을 만든다.

해야 할 일:
- media bin, templates/free presets, title/caption style packs. 현재 built-in title/caption style packs는 `CaptionStyle` patch registry로 구현되어 Inspector에서 Clean/Boxed/Lower title pack과 Readable/Creator/Top caption pack을 적용할 수 있고, 기존 Program Monitor preview, FFmpeg drawtext burn-in, WebVTT style metadata, project JSON 저장 경로를 그대로 사용한다. Free creator templates는 Project workspace에서 Short Launch, Tutorial Steps, Review Pass scaffold를 playhead에 undo 가능하게 적용하며 title clip, styled caption, chapter/review marker, optional ComfyUI B-roll draft clip을 외부 media asset 없이 생성한다. Shared Asset Library는 Media Bin에서 Title Card, Lower Third, End Card, Chapter Divider 같은 reusable local text asset을 `Shared Library` bin에 추가하고 기존 source range, timeline insert/overwrite, Program Monitor, FFmpeg title burn-in 경로를 그대로 재사용한다.
- batch apply, smart actions, quick export profiles. 현재 Export panel은 여러 export profile을 선택해 한 번에 render queue에 넣고, profile별 output filename으로 충돌을 막는다.
- UX density, shortcut discoverability, empty/error/loading states.
- Implementation note 2026-06-17: Export Preflight, Preview/Render Parity, and Media Health compact issue lists now show hidden issue counts through a shared renderer helper. Core coverage proves top-row slicing, singular/plural hidden labels, no-hidden state, and invalid-limit handling.
- Implementation note 2026-06-17: Command Palette capped search results now preserve total/visible/hidden match counts in the shared state resolver and show hidden command counts in the palette UI. Core coverage proves total-vs-visible counting, hidden labels, no-match state, and invalid-limit handling.
- responsive layout and visual QA.
- Implementation note 2026-06-16: The desktop/mobile viewport Playwright screenshot smoke now also records a JSON layout audit and fails on horizontal document overflow, clipped header/Source Monitor/Program Monitor text, critical header/overlay collisions, and Program Monitor frame/overlay boxes escaping the viewport. This caught the renderer Tailwind content-scan gap that left hidden file inputs and icon sizing unstyled; `tailwind.config.ts` now scans `src/electron/**/*`, and Source Monitor controls use responsive 3/4/6-column tracks so labels such as `Overwrite` are not clipped.

완료 게이트:
- 신규 사용자가 sample media로 5분 안에 짧은 영상을 완성할 수 있다.
- Implementation note 2026-06-16: Playwright e2e는 로컬 sample MP4를 생성해 DB 저장 프로젝트로 열고, Projects 패널에서 로드한 뒤 무료 `Tutorial Steps` template을 적용한다. Timeline title/caption/marker 생성, Program Monitor title+caption composite, FFmpeg export plan의 preflight ready 상태와 command preview를 검증하고 workflow 시간이 5분 미만인지 확인한다.
- UI overlap/text clipping screenshot test 통과.

### Phase 5. automation and extension

목표: Danbi Studio 고유 강점인 local automation을 완성한다.

해야 할 일:
- ComfyUI hook pipeline 안정화.
- STT acoustic embedding path. 현재 transcript가 `speakerEmbedding`을 제공하면 보존하고, `DANBI_STT_SPEAKER_ENCODER_COMMAND`가 설정되면 caption source-range manifest를 외부 speaker encoder command에 넘겨 JSON speaker embedding output을 적용한다. command가 실패하거나 누락한 caption은 STT task가 asset waveform cache 또는 queue 직전에 반영된 renderer runtime waveform을 사용해 caption source range별 waveform-backed acoustic embedding을 생성한다. 새 subclip은 parent asset runtime waveform을 재사용한 뒤 subclip source in/out으로 잘린 waveform을 STT task에 전달한다. 생성된 embedding은 기존 speaker diarization similarity threshold/margin/review 경로에 바로 연결된다.
- extension API fixture, external plugin sandbox policy, process-isolated handshake runner, reviewed manifest inspect command, scoped-payload timeline analyzer command, profile-filtered export analyzer command, safe-output export manifest planning command, reviewed effect-plan and transition-plan commands with validated Plugins-panel application, manifest-declared custom project/timeline/export report commands, and later richer custom effect/transition or signed bounded plugin-code runtime APIs.
- headless batch render.
- MCP/automation command surface. 현재 `DANBI_EDITOR_API_TOKEN` 기반 `/api/editor/*` automation token gate가 구현되어 있고, bearer token과 Danbi 전용 header를 허용하며 editor UI는 sidebar API Token panel에 저장된 local browser/Electron renderer token을 공통 API client wrapper로 붙인다. Webhook automation은 명시 실행, allowlist/local guard, scoped env secret bearer token, request body redaction, timeout/retry, per-hook delivery summary를 갖는다. Optional cloud sync는 Electron main에서 portable package export를 재사용하는 local-first sync folder manifest 경계로 구현되어 있다.

완료 게이트:
- extension fixture가 UI command와 render hook을 등록하고 테스트에서 실행된다.
- headless mode로 sample project render가 가능하다.

### Phase 6. packaged release

목표: 개발 서버가 아니라 설치 가능한 완성품으로 만든다.

해야 할 일:
- Electron packaged app.
- FFmpeg discovery/setup. 현재 Electron main은 `FFMPEG_PATH`/`FFPROBE_PATH`, packaged `resources/ffmpeg`, app/cwd `bin`, PATH 후보를 탐색하고 선택된 경로를 render engine/process env에 반영한다.
- local data directory, logs, crash diagnostics. 현재 Electron runtime은 userData 아래 `logs`, `crashDumps`, `projects`, `packages`, `imports`, `cache`, `autosave`, `renders`, `temp`, `jobs`, `stt`, `outputs`를 만들고 `window.danbiEditor.system.diagnostics()` IPC와 smoke result JSON으로 노출한다. Settings Runtime Diagnostics panel also displays app/runtime/FFmpeg status and exposes userData, logs, crash dump, project, package, import, cache, autosave, render, temp, job, STT, and output paths with native copy/open/reveal actions.
- sample project/tutorial pack. 현재 `npm run sample:smoke`는 합성 FFmpeg 영상/오디오로 `getting-started` portable package와 `tutorial.md`를 생성하고, package import 후 title edit를 적용해 sample H.264 profile로 실제 export한다. `npm run electron:package:smoke`는 이 sample pack을 `resources/samples/getting-started`에 포함하고 packaged copy에서도 import/edit/export smoke를 수행한다. `npm run electron:gui-smoke`는 패키징된 실제 창에서 Projects 패널의 Open sample을 눌러 샘플을 열고 Program Monitor/Export Plan을 확인한 뒤, GUI `Render` 버튼으로 queued FFmpeg job을 완료시켜 MP4 출력 파일까지 검증한다.
- release metadata/icon. `package.json`은 author와 desktop editor description을 포함하고, `scripts/generate-app-icon.mjs`가 `build/icon.ico`, `build/icon.png`, `build/icon.svg`를 생성한다. `electron-builder.yml`은 이 icon을 Windows package에 적용한다.
- plugin signing release readiness. `npm run plugin-signing:check`는 현재 trusted plugin signer 목록, RSA public-key material readiness, development-only key 잔존 여부를 JSON summary로 출력한다. `DANBI_RELEASE_CHANNEL=production` 또는 `--require-production`에서는 active/retiring non-development production signer와 실제 RSA 공개키 재료가 있어야 통과한다. `npm run plugin-signing:keygen`은 git에서 제외되는 private/public rotation material을 생성하고, `npm run plugin-signing:rotation-drill`은 retiring/active overlap, revoked old key, expired-without-replacement negative control을 private key 없이 리허설한다. `npm run plugin-package:sign`은 `danbi-plugin-package.json`을 RSA로 서명하고 package/runtimePackage file hash를 갱신하며 private key가 package 폴더나 추적 소스/릴리스 디렉터리에 있는 경우를 차단한다. `npm run plugin-signing:custody-audit`는 release-bound source/build/output에서 private key 본문과 `.private.pem` 경로 누수를 검사하고 production release 모드에서는 private-key env가 남아 있는지도 차단한다. `npm run electron:release:prepare`는 readiness와 custody audit summary를 `.danbi/electron-release/manifest.json`에 기록하며 production channel에서 같은 gate와 `DANBI_PLUGIN_SIGNING_PRIVATE_KEY_PATH` 금지를 적용한다.
- offline smoke test.
- Implementation note 2026-06-16: packaged GUI/offline/installed-app smoke scripts now wait for the hydrated editor shell (`data-testid="editor-shell"`, `data-hydrated="true"`) and the actual Program Monitor surface (`data-testid="program-monitor"`) before opening the sample or rendering, so release smoke no longer depends on a pre-hydration shell or a placeholder label that disappears when the composite preview is active.
- Implementation note 2026-06-16: Next standalone release pruning now removes `.nft.json` trace entries that escape the packaged renderer tree into blocked custody paths such as `.danbi`, `scripts`, `tests`, and source mirrors. The regression covers private-key trace entries like `../../../../.danbi/plugin-signing/*.private.pem` while still failing if a private key trace remains in an unexpected release path.
- Implementation note 2026-06-16: Next standalone release pruning now also strips development/source artifacts such as `.git`, `.env`, `.logs`, `.next/dev`, `.next/diagnostics`, `.next/types`, `src`, `third_party`, `dist-electron`, `package-lock.json`, generated dev logs, and release config files from renderer standalone output. The prune step sanitizes standalone `package.json` to a runtime-only `server.js` start entry and scrubs build-root paths from `server.js`; package/installer/install smoke and `npm run license:check` now assert those release hygiene rules when the artifacts exist.
- Implementation note 2026-06-16: Electron release preparation now deletes stale root `.next/dev`, `.next/types`, and `.next/diagnostics` before running `next build --webpack`, while preserving `.next/cache`. This prevents corrupted dev validator output from being typechecked during a production release build.
- Implementation note 2026-06-16: Electron release preparation, package scripts, and packaged GUI/offline/installer/install smoke scripts now share an atomic `.danbi/locks/electron-release-output.lock` guard while they touch `release/electron` and packaged renderer resources. Concurrent release jobs wait instead of deleting or rebuilding the shared output underneath another smoke run.
- Implementation note 2026-06-16: `npm run electron:release:verify` now provides a single full-release verification entrypoint that records profile-specific JSON reports under `.danbi/electron-release`. `--profile core` covers TypeScript, unit tests, `git diff --check`, warning-free ESLint, architecture/license checks, and plugin signing custody; `--profile packaged` adds packaged GUI/offline release smoke; `--profile full` adds Chromium e2e, installer artifact smoke, and installed-app smoke. `--production` runs the same plan with production signer readiness and private-key-env custody enforcement.
- Implementation note 2026-06-16: `npm run electron:release:acceptance` validates the latest full verification report against the actual NSIS installer, blockmap, `latest.yml`, unpacked executable, packaged sample project/tutorial, standalone runtime metadata, release manifest, package/gui/offline/installed render outputs, `ffprobe` media metadata, and current `license:check`. It writes `.danbi/electron-release/release-acceptance.json` with artifact sizes and SHA-256 hashes so a release candidate has a single auditable acceptance record.
- Implementation note 2026-06-16: `npm run electron:release:handoff` creates `.danbi/electron-release/handoff` for the remaining fresh-Windows manual pass. The handoff contains the installer, blockmap, `latest.yml`, verification and acceptance reports, release manifest, render evidence MP4 files, `SHA256SUMS.txt`, a PowerShell checksum verifier, a fresh-Windows result recorder, a Korean fresh-Windows checklist, a manual result JSON template, and `package-handoff-for-qa.ps1` for producing a single QA-transfer ZIP plus SHA-256 sidecar after verifying the handoff contents.
- Implementation note 2026-06-16: `npm run electron:release:manual-acceptance` validates a completed `.danbi/electron-release/handoff/fresh-windows-result.json` against the handoff manifest and file checksums. It requires artifact verification, fresh Windows profile install, app launch, packaged sample open, Program Monitor render, export plan readiness, GUI render completion, output MP4 playback, output MP4 path/byte/video/audio evidence, no-external-network confirmation, tester/machine metadata, and `result: "passed"`.
- Implementation note 2026-06-16: `npm run electron:release:import-evidence -- --evidence-zip <returned-zip> --run-final-gate` imports a returned fresh-Windows evidence ZIP from an external QA/download location into `.danbi/electron-release/returned` only after verifying its SHA-256 sidecar and then re-reading the imported copy plus rewritten sidecar for byte/SHA-256 copy verification. It then immediately stages the local handoff, expands the returned ZIP in an isolated extraction directory, rejects unexpected ZIP entries, rejects ZIP copies of `handoff-manifest.json` or `SHA256SUMS.txt` that differ from the local handoff reference, and runs `electron:release:final-gate` against the staged fresh-Windows evidence. The final gate also validates `fresh-windows-evidence-summary.json` inside the ZIP against the release product/version/installer, required file list, Fresh Windows result JSON byte/SHA-256 fingerprints, fresh-Windows manual result tester/checkedAt/output metadata, `packagedAt` timestamp order, handoff reference byte/SHA-256 fingerprints, packaged MP4 byte count, and SHA-256 before accepting the staged evidence. Without `--run-final-gate`, the import report still writes the exact `npm run electron:release:final-gate -- --evidence-zip ... --evidence-zip-sha256 ...` command for a separate approval step.
- Implementation note 2026-06-17: `package-fresh-windows-evidence.ps1` now writes `fresh-windows-evidence.zip.report.json` beside the return ZIP and checksum sidecar, capturing archive bytes/SHA-256 plus the summary, MP4, evidence JSON, handoff manifest, and checksum fingerprints used by final gate import. `electron:release:import-evidence` and `electron:release:final-gate` require the report by default, check archive bytes/SHA-256, report filename, summary fingerprint inside the ZIP, and imported report copy integrity, and reserve `--allow-missing-evidence-report` for legacy ZIP-only QA returns.
- Implementation note 2026-06-17: Returned fresh-Windows evidence ZIPs are now inspected through the ZIP central directory before any copy or extraction step. `electron:release:import-evidence` and `electron:release:final-gate` reject unreadable archives, unsafe entry names such as absolute paths, drive-letter paths, backslashes, NUL bytes, `.`/`..` path segments, duplicate entries, unexpected entries, and missing required files before `Expand-Archive` can touch the staging or returned-evidence directories.
- Implementation note 2026-06-17: The generated `package-fresh-windows-evidence.ps1` also self-inspects the ZIP it just wrote before emitting the checksum sidecar and package report. It opens the archive central directory, requires the exact evidence file set, rejects unsafe/duplicate/unexpected/missing entries, and records `zipEntryInspection` in `fresh-windows-evidence.zip.report.json` so QA return packages carry their own entry-level audit before local import repeats the same checks.
- Implementation note 2026-06-17: Local evidence import and final gate now also compare `fresh-windows-evidence.zip.report.json`'s `zipEntryInspection` section against their own freshly-read ZIP central directory. A package report that claims different entries, files, unsafe entries, duplicate entries, missing files, or unexpected entries fails with `zipEntryInspectionMatchesArchive` before the evidence ZIP is copied or accepted.
- Implementation note 2026-06-17: The same report/archive comparison now includes explicit ZIP directory entries. Import/final-gate reports preserve them as `archiveDirectories`, release status exposes them, and a report that omits or invents directory entries fails `zipEntryInspectionMatchesArchive`.
- Implementation note 2026-06-17: The QA handoff ZIP itself is now entry-audited before it is sent to a fresh Windows machine. `package-handoff-for-qa.ps1` copies `SHA256SUMS.txt` into the archive, checks the generated ZIP for unsafe, duplicate, unexpected, and missing entries, writes the passing `zipEntryInspection` into the handoff package report, and `npm run electron:release:status` rechecks the current ZIP against that report.
- Implementation note 2026-06-16: `npm run electron:release:status` summarizes the current release state from the core/full verification, acceptance, handoff package, evidence import, and final gate reports. It explicitly distinguishes approved releases from the expected pre-approval state where full verification and acceptance have passed, the QA handoff ZIP plus `.sha256` sidecar is present/current, and only returned fresh-Windows evidence is blocking final approval. It reports returned evidence import/copy-verification state when present, separates failed evidence imports into an `evidence-import` blocker with a re-import action, separates missing/stale QA handoff packages into a `handoff-package` blocker, detects stale acceptance reports when the latest full verification ended later than acceptance, and reports dirty-worktree freshness warnings so final approval is not confused with stale reports from an earlier source tree. `--strict` makes the command exit non-zero unless the final gate is approved, while `--require-clean` also fails on a dirty workspace for CI/release-script use.
- Implementation note 2026-06-17: `npm run electron:release:status` now surfaces Fresh Windows evidence package report checks directly under both `checks.evidencePackage` and `checks.evidenceImport`, including `packageReportChecks` and `packageReportFailedChecks`. Operators can now see failures such as `zipEntryInspectionMatchesArchive` from the status JSON without opening the full import or final-gate report first.
- Implementation note 2026-06-18: 2026-06-17 23:00 이후 packaged Electron 설치앱 blocker는 Local Installed-App Acceptance 경로로 분리해 문서화했다. `docs/POST_2026_06_17_23_CHANGELOG_KR.md`와 `docs/ELECTRON_LOCAL_INSTALLED_ACCEPTANCE_KR.md`가 기준 문서다. Fresh Windows QA evidence, returned evidence ZIP, external manual result JSON, final release approval은 계속 `EXTERNAL_PENDING`이며 최종 release approval에는 필요하지만 agent-side local completion을 막지 않는다.
- Implementation note 2026-06-18: 설치앱 media import가 `C:\Program Files\Danbi Studio\.danbi` 생성을 시도하던 blocker를 막기 위해 packaged Electron runtime, packaged renderer server, import/cache/autosave/jobs/stt/output storage, project package relative directory resolution을 Electron `userData` 아래로 고정했다. `npm run electron:local-installed-acceptance`는 installer, installed app launch, sample project load, media import, export preflight, MP4 render, ffprobe, Program Files/install directory no-write check를 검증하고 `.danbi/electron-release/local-installed-acceptance.json`을 쓴다.
- Verification note 2026-06-16: `npm run electron:release:verify` passed the full profile on Windows with 17/17 gates passed: TypeScript, Vitest, `git diff --check`, warning-free ESLint, architecture/license checks, plugin signer readiness/production readiness/rotation drill/custody audit, Electron smoke, Chromium Playwright e2e, package smoke, packaged GUI smoke, offline smoke, installer artifact smoke, and installed-app smoke. The run generated the NSIS installer, opened the packaged and installed apps, loaded the getting-started sample, rendered MP4 output through FFmpeg from the GUI, and verified standalone release hygiene through `license:check`.
- Verification note 2026-06-16: `npm run electron:release:acceptance` passed against the same release candidate and wrote `.danbi/electron-release/release-acceptance.json`. The acceptance record includes the NSIS installer size/hash, blockmap/latest metadata, standalone runtime hygiene, release manifest status, four MP4 render outputs with `ffprobe` stream/duration evidence, and the current license boundary check.
- `npm run electron:smoke`로 Electron main/preload bundle, preload path, IPC registration, third-party source boundary를 GUI 없이 검증한다.
- `npm run electron:package:smoke`로 Next standalone renderer, Electron packaged renderer server, electron-builder `win-unpacked` 산출물, packaged sample project import/edit/export, 실제 `Danbi Studio.exe` smoke result, local data/log/crash paths, FFmpeg discovery diagnostics를 검증한다.
- `npm run electron:installer:smoke`로 NSIS Windows installer exe와 blockmap 산출물, `win-unpacked` 런타임 리소스, sample pack 포함 여부, standalone 개발 artifact 차단, release-bound private key custody audit를 검증한다.
- `npm run electron:gui-smoke`로 fresh Electron userData profile에서 패키징된 GUI가 샘플 프로젝트를 열고 기본 편집/Export Plan 화면에 도달한 뒤, GUI 렌더 버튼에서 실제 FFmpeg 렌더 job 완료와 출력 MP4 파일 생성을 검증한다.
- `npm run electron:offline-smoke`로 패키징된 GUI가 renderer 외부 네트워크 요청 없이 local renderer/sample/FFmpeg만으로 샘플 프로젝트를 열고 Export Plan과 실제 MP4 렌더를 완료하는지 검증한다.
- `npm run electron:install-smoke`로 NSIS installer를 workspace 내부 임시 설치 디렉터리에 silent install하고, 설치된 앱을 fresh userData로 실행해 sample project open, automated media import, export preflight, localhost-only renderer request, FFmpeg MP4 render, ffprobe metadata, Program Files/install directory no-write check, silent uninstall cleanup을 검증한다.
- `npm run electron:local-installed-acceptance`로 설치앱 smoke 결과를 Local Installed-App Acceptance report로 승격하고 Fresh Windows 외부 증거 항목은 `EXTERNAL_PENDING`으로 남긴다.
- Verification note 2026-06-16: `npm run electron:install-smoke`가 NSIS installer 생성 후 `.danbi/electron-install-smoke/app`에 silent install하고, 설치된 `Danbi Studio.exe`에서 sample project open과 Sample H.264 360p FFmpeg render를 완료했으며 renderer request 41개와 WebSocket 0개가 모두 local임을 확인하고 uninstall cleanup까지 통과했다.
- Verification note 2026-06-16: `npm run electron:offline-smoke`가 release prepare와 `win-unpacked` packaging 후 fresh userData로 packaged GUI를 실행하고, renderer request/WebSocket을 localhost/file/blob/data 계열로 제한한 상태에서 sample project open, Export Plan, Sample H.264 360p FFmpeg render를 통과했다.
- Verification note 2026-06-16: `npm run electron:installer:smoke`가 `release/electron/Danbi Studio-0.1.0-win-x64.exe` NSIS installer와 `.blockmap`을 생성하고, packaged standalone renderer에 `.danbi`, `scripts`, `tests`, `test-results`, source mirror가 포함되지 않으며, release-bound custody audit가 위반 0개로 통과하는지 검증했다.
- Verification note 2026-06-15: 현재 워크트리에서 `npm run build`, `npm run electron:smoke`, `npm run electron:package:smoke`, `npm run electron:gui-smoke`가 통과했다. GUI smoke는 packaged app에서 샘플 프로젝트를 열고 Program Monitor/Export Plan 확인 후 GUI Render 버튼으로 실제 FFmpeg MP4 출력을 생성했다.
- Verification note 2026-06-15: `npm run electron:package:smoke`와 `npm run electron:gui-smoke`에서 electron-builder의 missing author 경고와 default Electron icon 경고가 사라졌다. 두 smoke는 해당 경고가 재발하면 실패한다. 남아 있는 duplicate dependency references 경고는 node_modules 중복 참조 탐색 경고이며 앱 메타데이터/icon 적용 실패는 아니다.

완료 게이트:
- fresh Windows machine/profile에서 설치 후 sample project를 열고 export할 수 있다.
- release checklist 전 항목 통과.

## 8. 완료 판정 체크리스트

완성 선언 전에 아래가 모두 `PASS`여야 한다.

- `npm run build`
- `npx tsc --noEmit --pretty false`
- core unit tests
- renderer workflow tests
- Playwright interaction/screenshot tests
- FFmpeg render smoke tests
- packaged Electron smoke test
- `npm run electron:package:smoke`
- `npm run electron:installer:smoke`
- `npm run electron:gui-smoke`
- `npm run electron:offline-smoke`
- `npm run electron:install-smoke`
- `npm run electron:release:acceptance`
- `npm run electron:release:handoff`
- `npm run electron:release:status`
- `npm run electron:release:status -- --strict --require-clean`
- `npm run electron:release:import-evidence -- --evidence-zip <returned-fresh-windows-evidence.zip> --run-final-gate`
- `npm run electron:release:manual-acceptance` with a completed fresh-Windows result JSON
- sample project import/edit/export manual verification. 자동 검증은 `npm run sample:smoke`와 packaged sample smoke가 담당하고, 최종 완성 전에는 fresh Windows profile에서 수동 확인도 남아 있다.
- source reuse register 검토
- license notice 검토
- architecture boundary audit
- preview/render parity matrix 검토
- user-facing docs 검토

하나라도 빠지면 완성품이 아니라 진행 중인 빌드다.

## 9. 이후 작업 운영 규칙

- 모든 작업은 이 문서의 Phase와 필수 조건 중 하나에 매핑한다.
- 매핑되지 않는 기능 추가는 보류한다.
- 구현 전에 재사용 후보를 먼저 확인한다.
- OpenCut MIT 코드는 복제 가능 후보로 적극 검토한다.
- Shotcut GPL 코드는 직접 복사 전 license/격리 결정을 먼저 한다.
- 큰 파일을 키우지 않고 module boundary를 유지한다.
- 완료 보고에는 항상 어떤 완성 조건을 진전시켰는지 적는다.
