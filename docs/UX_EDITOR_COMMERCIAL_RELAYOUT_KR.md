# Editor Commercial Layout Rearrangement

Date: 2026-06-19

## 목적

Danbi Studio Editor 본문을 CapCut, Filmora, OpenCut 계열의 상용 편집기 구조에 가깝게 재배치한다.

이번 변경은 기능 추가가 아니라 화면 정보 구조 조정이다. 기존 편집, ComfyUI, Automation, Render Worker, Plugin, Export validation 동작 의미는 변경하지 않는다.

## 목표 화면 구조

1. 좌측: Asset Bay
   - Project overview
   - Project settings
   - Templates
   - Saved projects
   - Autosave and recovery
   - Media health
   - Media bin

2. 중앙: Edit Workspace
   - Source Monitor
   - Program Monitor
   - Scene Readout
   - Timeline transport
   - Multi-track timeline

3. 우측: Inspector / Properties
   - Clip inspector
   - Marker and caption panels
   - Shortcuts
   - Queue settings
   - Automation hooks
   - Export workspace
   - Render worker status
   - Plugins panel

## 구현 원칙

- 모든 기존 패널을 유지한다.
- 패널의 props, handler, validation, queue, render semantics를 변경하지 않는다.
- 버튼을 삭제하거나 기능을 숨기지 않는다.
- 레이아웃은 고정 3열 작업대와 각 영역 내부 스크롤로 구성한다.
- 모바일/좁은 폭에서는 단일 열로 쌓이게 유지한다.

## 이번 구현

- `src/app/editor/page.tsx`의 최상위 editor body grid를 3열 작업대로 변경했다.
- 좌측 aside를 `Asset Bay / Project Media` 레일로 정리했다.
- 중앙 section에 `Edit Workspace` 헤더를 추가하고 모니터와 타임라인 영역을 고정했다.
- 우측 aside를 `Inspector / Properties` 레일로 정리했다.
- `SceneReadoutPanel`은 2열 구간에서는 전체 폭, 3열 구간에서는 우측 보조 칸에 배치되도록 조정했다.

## 2026-06-19 참고 소스 기반 UI 재배치

참고한 로컬 소스:

- `third_party/source-mirrors/opencut-classic/apps/web/src/app/editor/[project_id]/page.tsx`
- `third_party/source-mirrors/opencut-classic/apps/web/src/components/editor/panels/assets/index.tsx`
- `third_party/source-mirrors/opencut-classic/apps/web/src/components/editor/panels/assets/tabbar.tsx`
- `third_party/source-mirrors/opencut-classic/apps/web/src/components/editor/panels/properties/index.tsx`
- `third_party/source-mirrors/opencut-classic/apps/web/src/panels/layout.ts`
- `third_party/source-mirrors/shotcut/src/mainwindow.ui`
- `third_party/source-mirrors/shotcut/src/defaultlayouts.h`

반영한 구조:

- OpenCut classic처럼 좌측 자산 영역을 세로 탭 레일과 내용 패널로 분리한다.
- OpenCut classic처럼 중앙은 Preview, 하단은 Timeline이 주 작업 공간이 되게 유지한다.
- OpenCut classic의 Properties panel처럼 우측 패널은 선택 맥락별 탭으로 접근한다.
- Shotcut처럼 Files/Playlist/Filters/Properties/Encode/Jobs/Timeline이 dock 단위로 분리되는 원칙을 Danbi 우측 dock에 반영한다.
- Filmora/CapCut 계열의 Media/Preview/Timeline/Inspector/Export 흐름을 첫 화면 위계에 반영한다.

이번 추가 구현:

- 좌측 `Asset Bay`에 `Media`, `Project`, `Templates`, `Health` 세로 탭을 추가했다.
- 우측 `Inspector`에 `Clip`, `Video`, `Audio`, `Effects`, `Text`, `Jobs`, `Export`, `Plugins` dock 탭을 추가했다.
- Shotcut의 `Properties`, `Filters`, `Encode`, `Jobs` dock 분리를 반영해 Clip 속성, Video 속성, Audio 속성, Effects 속성을 같은 탭에 몰아두지 않고 나눴다.
- 기존 패널과 핸들러는 제거하지 않고 탭 안으로 재배치했다.
- 기본 진입은 `Media`와 `Clip`으로 유지해 import, preview, timeline, clip property 흐름이 먼저 보이게 했다.
- `ExportWorkspacePanel` 안의 ComfyUI batch, STT, Render Worker, Render Status, Preview/Render parity 흐름은 그대로 유지했다.
- `AutomationHooksPanel`과 `PluginsPanel`은 각각 `Jobs`, `Plugins` dock으로 위치만 분리했다.

## 사용자가 제공하면 가장 도움이 되는 자료

1. 목표 화면 스크린샷 3장
   - 시작 직후 편집 화면
   - 클립 선택 후 우측 속성 화면
   - export/render 화면

2. 짧은 녹화 영상
   - `파일 import -> timeline 배치 -> clip 선택 -> 효과 조정 -> export` 흐름을 30~90초로 녹화한다.

3. 우선순위 표시
   - 항상 보여야 하는 것
   - 탭 뒤로 넣어도 되는 것
   - 별도 화면으로 빼야 하는 것

4. 메뉴 언어 표
   - Korean label
   - English label
   - 같은 기능의 현재 Danbi 버튼/패널 이름

5. 디자인 파일 또는 플러그인 정보
   - Figma URL 또는 file key
   - OpenDesign이 특정 플러그인이라면 설치 URL, npm 패키지명, GitHub URL 중 하나

현재 이 세션에 노출된 디자인 연동은 Figma/Canva이며, `OpenDesign`이라는 이름의 도구는 확인되지 않았다.

## 2026-06-19 OpenDesign 설치 및 편집기 적용 기록

제공 URL:

- `https://github.com/nexu-io/open-design`

확인한 OpenDesign 성격:

- OpenDesign은 Figma 플러그인이 아니라 local-first 디자인 workspace다.
- repo는 `od` CLI, MCP server, skills, design systems, plugins를 제공한다.
- Codex 연동은 `od mcp install codex` 계열로 구성된다.

설치/연동 상태:

- source clone: `E:\ai_tool\open-design`
- dependency install: `corepack pnpm install`
- daemon CLI build: postinstall에서 `@open-design/daemon` build 완료
- Codex MCP 등록: `open-design`
- 등록 명령: `codex mcp add open-design -- node E:\ai_tool\open-design\apps\daemon\bin\od.mjs mcp --daemon-url http://127.0.0.1:7456`
- daemon process: `node E:\ai_tool\open-design\apps\daemon\bin\od.mjs --port 7456 --host 127.0.0.1 --no-open`
- health check: `http://127.0.0.1:7456/api/health` -> `200 {"ok":true,"version":"0.11.0"}`

참고한 OpenDesign 원칙:

- `design-systems/default/DESIGN.md`
- content-first, chrome-second
- no ornament
- calm, functional, quietly confident
- B2B tools and dashboards에 적합한 Neutral Modern 기준

Danbi Editor 반영:

- 중앙 `Edit Workspace` header에 `Edit`, `Effects`, `Audio`, `Text`, `Export`, `Plugins` workspace preset strip을 추가했다.
- 각 preset은 새 기능이 아니라 기존 좌측 Asset Bay 탭과 우측 Inspector dock 탭 조합을 빠르게 전환한다.
- `Edit` -> `Media` + `Clip`
- `Effects` -> `Templates` + `Effects`
- `Audio` -> `Media` + `Audio`
- `Text` -> `Templates` + `Text`
- `Export` -> `Media` + `Export`
- `Plugins` -> `Project` + `Plugins`

## 건드리지 않은 범위

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Existing export validation semantics

## 검증 결과

- `git diff --check`
- `npm run build`
- `/editor` route 200 OK
- Playwright smoke: `Asset Bay`, `Edit Workspace`, `Properties` visible
- Playwright smoke: `Media`, `Project`, `Templates`, `Health`, `Clip`, `Video`, `Audio`, `Effects`, `Text`, `Jobs`, `Export`, `Plugins` dock tabs visible/clickable
- Playwright smoke: `editor-shotcut-opencut-docks passed`
- Playwright smoke: `editor-opendesign-presets passed`
- 기존 shell KOR/ENG toggle smoke는 이전 Phase 1 검증 결과 유지

## 2026-06-19 CapCut style editor UI application

`uisample/`의 CapCut 참고 화면 구조를 실제 Editor 레이아웃에 적용했다.
상세 적용 기록은 `docs/UX_CAPCUT_STYLE_EDITOR_IMPLEMENTATION_KR.md`에 남긴다.
