# Danbi Studio UX Structure Design

작성일: 2026-06-19

## 1. 목적

이 문서는 Danbi Studio의 원페이지 기능 나열 문제를 해결하기 위한 UX 구조 설계 문서다.

현재 설치 앱은 editor, media, ComfyUI, AI Results, automation, render worker, plugin, diagnostics, release status가 한 화면에 많이 노출되어 사용자가 다음 행동을 판단하기 어렵다. 기능을 줄이는 것이 아니라, 제품 성격에 맞는 정보구조와 화면 분리를 설계한다.

이번 문서는 구현 지시가 아니라 구조 설계 기준이다. 이후 구현 작업은 이 문서를 기준으로 작은 단계로 나누어 진행한다.

## 2. 설계 원칙

1. 첫 화면은 기능 목록이 아니라 시작 지점이어야 한다.
2. 편집 화면은 import, preview, timeline, inspector, export에 집중한다.
3. ComfyUI와 AI Results는 숨기지 않고 AI Studio로 격상한다.
4. Automation, Render Worker, Headless Render, Fleet Discovery, Plugin/Extension은 제거하지 않고 전용 운영 화면으로 분리한다.
5. Settings와 Diagnostics는 작업 화면이 아니라 운영/문제해결 화면이다.
6. Export preflight는 blockers, warnings, info를 분리해 사용자가 해결 가능한 상태로 보여준다.
7. 사용자가 외부 서비스 없이도 기본 sample project를 열고 MP4를 렌더할 수 있어야 한다.
8. ComfyUI가 꺼져 있어도 editor는 깨지지 않아야 한다.
9. 고급 기능은 progressive disclosure로 노출한다.
10. UX 단순화는 제품 아키텍처 단순화가 아니다.

## 3. 절대 변경하지 않는 제품 정체성

Danbi Studio는 단순 컷 편집기가 아니다.

계속 유지해야 하는 1급 기능:

- local-first packaged Electron video editor
- FFmpeg 기반 import, analysis, preflight, render
- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- existing export validation semantics for ComfyUI generation

UX 재구조화는 위 기능을 제거, 우회, 비활성화, 격하, mock, optional 처리하지 않는다.

## 4. 대상 사용자 모델

### 4.1 일반 편집 사용자

목표:

- 프로젝트 열기
- 미디어 import
- 타임라인 편집
- preview 확인
- MP4 export

필요한 화면:

- Project Hub
- Editor Workspace
- Export Preflight

기본 화면에서 숨겨도 되는 것:

- render worker daemon 상세
- fleet discovery
- plugin signing
- automation hook payload
- raw diagnostics

### 4.2 AI 생성 사용자

목표:

- 선택 clip 또는 빈 구간을 ComfyUI workflow로 생성
- 생성 상태 확인
- 결과를 원본과 비교
- 결과를 import, replace, effect pass로 적용

필요한 화면:

- Editor Workspace의 AI Results 요약
- AI Studio
- Export Preflight의 generated asset 상태

필수 상태:

- pending generation
- generating
- generated
- failed

필수 액션:

- generate now
- skip this asset
- replace with local media
- exclude from current export

### 4.3 운영/자동화 사용자

목표:

- automation hook 실행 상태 확인
- batch queue 관리
- render worker/fleet/headless render 상태 확인
- 실패 job 재시도

필요한 화면:

- Automation
- Render Queue
- Settings and Diagnostics

### 4.4 확장 개발/관리 사용자

목표:

- plugin package 설치
- permission, signing, sandbox 상태 확인
- extension command/hook 확인

필요한 화면:

- Extensions
- Settings and Diagnostics

## 5. 최상위 정보구조

Danbi Studio의 top-level navigation은 다음 7개 영역으로 나눈다.

```text
Project Hub
Editor
AI Studio
Automation
Render Queue
Extensions
Settings
```

각 영역의 역할:

| 영역 | 역할 | 기본 노출 여부 |
| --- | --- | --- |
| Project Hub | 시작/재개/샘플/최근 프로젝트 | 첫 화면 |
| Editor | 편집, preview, timeline, inspector | 프로젝트 열림 후 기본 |
| AI Studio | ComfyUI, AI Results, generation queue | 필요 시 진입 |
| Automation | hooks, workflow triggers, integration jobs | 고급 |
| Render Queue | render jobs, workers, headless render | export/render 중 강조 |
| Extensions | plugin/package/signing/permission | 고급 |
| Settings | storage, FFmpeg, ComfyUI endpoint, diagnostics | 문제 해결 |

## 6. App Shell 구조

### 6.1 Shell 레이아웃

```text
+--------------------------------------------------------------------------------+
| Top Bar: project name, save state, render status, global command/search         |
+------------+-------------------------------------------------------------------+
| Left Rail  | Main Workspace                                                    |
|            |                                                                   |
| Project    | selected top-level screen                                          |
| Editor     |                                                                   |
| AI Studio  |                                                                   |
| Automation |                                                                   |
| Render     |                                                                   |
| Extensions |                                                                   |
| Settings   |                                                                   |
+------------+-------------------------------------------------------------------+
| Status Bar: FFmpeg, storage, ComfyUI, render worker, local acceptance summary   |
+--------------------------------------------------------------------------------+
```

### 6.2 Top Bar

항상 보여줄 정보:

- active project name
- save state
- autosave/recovery state
- current render state
- global search / command palette
- export button when project is open

숨길 정보:

- full diagnostics logs
- full worker table
- full plugin manifest
- full ComfyUI workflow list

### 6.3 Left Rail

좌측 navigation은 아이콘+짧은 라벨 기반으로 구성한다.

항목:

- Home
- Editor
- AI
- Automation
- Render
- Extensions
- Settings

상태 badge:

- AI: pending/generating/failed count
- Automation: active/failed count
- Render: queued/rendering/failed count
- Extensions: blocked/update/signing issue count
- Settings: runtime warning count

### 6.4 Status Bar

하단 status bar는 문제를 빨리 인지하는 용도다.

표시 항목:

- FFmpeg ready / missing
- storage root: userData / warning
- ComfyUI connected / unavailable / running jobs
- Render Worker idle / active / unavailable
- Local Installed-App Acceptance: passed / missing / stale

Status bar는 상세 설정 화면을 대체하지 않는다. 각 항목 클릭 시 해당 화면으로 이동한다.

## 7. 화면별 상세 설계

## 7.1 Project Hub

목적:

사용자가 "무엇을 시작할지" 바로 선택하게 한다.

주요 영역:

- Recent Projects
- Create New Project
- Open Project
- Open Sample Project
- Import Media into New Project
- Last Render Output

우측 상태 요약:

- storage path health
- FFmpeg status
- ComfyUI status
- Render Worker status
- Plugin system status
- Local Installed-App Acceptance summary

빈 상태:

- 최근 프로젝트가 없으면 sample project와 import action을 우선 노출
- FFmpeg가 없으면 Settings로 이동하는 action 제공
- Local acceptance report가 없으면 "not checked locally"로 표시

표시하지 않을 것:

- full ComfyUI workflow list
- automation hook payload
- plugin package file list
- render worker daemon logs

## 7.2 Editor Workspace

목적:

실제 영상 편집의 기본 작업 화면.

구조:

```text
+--------------------------------------------------------------------------------+
| Editor Toolbar: import, save, undo, redo, marker, export, render status         |
+----------------------+--------------------------------+------------------------+
| Left Panel           | Program / Source Monitor       | Inspector              |
| - Media Bin          | - Preview                      | - selected clip        |
| - Project Assets     | - source range                 | - selected asset       |
| - AI Results summary | - scopes/meter overlays        | - effects/motion/audio |
+----------------------+--------------------------------+------------------------+
| Timeline: tracks, ruler, clips, captions, markers, transport                    |
+--------------------------------------------------------------------------------+
```

Left Panel tabs:

- Media
- Assets
- AI Results
- Project

Inspector tabs:

- Clip
- Media
- Motion
- Effects
- Audio
- Captions
- ComfyUI Binding

Editor에서 항상 가능한 작업:

- import media
- drag to timeline
- trim/split/move
- preview
- inspect selected item
- save
- export

Editor에서 접어서 보여줄 작업:

- AI generation details
- automation hook execution
- render worker/fleet controls
- plugin internals

## 7.3 AI Studio

목적:

ComfyUI와 AI Results를 제품의 1급 workflow로 유지하면서 editor를 복잡하게 만들지 않는다.

구조:

```text
+--------------------------------------------------------------------------------+
| AI Studio Toolbar: generate, queue status, ComfyUI connection                   |
+----------------------+--------------------------------+------------------------+
| Workflow Browser     | Generation Queue               | Result Inspector       |
| - presets            | - pending                      | - source/result compare|
| - plugin workflows   | - generating                   | - prompt metadata      |
| - parameters         | - generated                    | - media analysis       |
|                      | - failed                       | - actions              |
+----------------------+--------------------------------+------------------------+
```

AI asset states:

| 상태 | 의미 | 사용자 액션 |
| --- | --- | --- |
| pending generation | 아직 생성되지 않음 | generate now, skip, replace, exclude |
| generating | queue 실행 중 | view progress, cancel when supported |
| generated | 결과 있음 | review, import, replace, apply as effect pass |
| failed | 생성 실패 | retry, replace, exclude, inspect error |

ComfyUI unavailable 상태:

- editor는 계속 사용 가능
- AI Studio는 unavailable banner 표시
- pending asset은 pending generation 상태 유지
- export preflight는 기존 validation semantics에 따라 blocker/warning을 표시
- 사용자는 replace with local media 또는 exclude from current export를 선택 가능

## 7.4 Automation

목적:

자동화와 orchestration을 전용 운영 화면으로 분리한다.

구조:

- Hook Rules
- Manual Actions
- Before Export Hooks
- Gap Fill Hooks
- Webhook Integrations
- Job History
- Execution Logs

화면 원칙:

- editor event payload를 숨기지 않고 검토 가능하게 표시
- 실행은 명시적 action으로 수행
- webhook/API token/allowlist 상태를 분명히 표시
- ComfyUI jobs와 local actions는 같은 automation result summary에 묶어 보여줌

Editor와의 연결:

- Editor에는 "Automation active/failed count"만 표시
- 상세 수정은 Automation 화면에서 수행

## 7.5 Render Queue

목적:

render 실행, queue, worker, headless render 상태를 한곳에서 관리한다.

구조:

- Current Render
- Queued Renders
- Completed Renders
- Failed Renders
- Render Worker Status
- Render Worker Daemon
- Fleet Discovery
- Headless Render Jobs
- Output Files

상태:

- idle
- queued
- rendering
- completed
- failed
- canceled
- worker unavailable
- waiting for external resource

Render Queue는 Export Preflight를 대체하지 않는다.

흐름:

1. Editor에서 Export 클릭
2. Export Preflight 확인
3. Render 실행
4. Render Queue에서 진행/완료/실패 확인

## 7.6 Extensions

목적:

Plugin/Extension system을 전용 관리 화면으로 분리한다.

구조:

- Installed Plugins
- Available Built-in Extensions
- Package Install
- Manifest and Permissions
- Signing State
- Sandbox Status
- Commands and Hooks

상태:

- trusted built-in
- reviewed external
- manifest-only
- blocked
- unsigned
- signature invalid
- missing permission

원칙:

- plugin architecture를 숨기지 않는다.
- 기본 편집 사용자가 plugin internals를 보지 않아도 된다.
- 위험 action은 confirmable action으로 처리한다.

## 7.7 Settings and Diagnostics

목적:

환경, 경로, runtime 문제를 편집 화면 밖에서 해결한다.

구조:

- Runtime
- Storage
- FFmpeg / FFprobe
- ComfyUI Endpoint
- Render Worker
- Fleet Discovery
- Plugins
- Logs
- Crash Diagnostics
- Local Installed-App Acceptance
- Fresh Windows / External QA Status
- License / Third-party Notices

Storage 화면에 표시할 경로:

- userData
- imports
- cache
- projects
- packages
- jobs
- stt
- autosave
- renders
- outputs
- temp
- logs
- crashDumps

주의:

- packaged Electron에서 Program Files 내부 storage write가 보이면 blocker로 표시
- Local Installed-App Acceptance는 local status로 표시
- Fresh Windows QA와 final approval은 external pending으로 표시

## 8. Export Preflight 구조

Export Preflight는 modal 또는 오른쪽 drawer로 열린다.

섹션:

- Output Profile
- Timeline Range
- Media Availability
- Generated Asset State
- ComfyUI Requirements
- FFmpeg Readiness
- Output Path
- Worker / Queue Target
- Blockers
- Warnings
- Info

Severity:

| 구분 | 의미 | 예시 |
| --- | --- | --- |
| blocker | export 불가 | missing renderPath, invalid output path |
| warning | export 가능하지만 주의 | ComfyUI unavailable but asset excluded |
| info | 참고 정보 | selected profile, output location |

ComfyUI asset action:

- generate now
- skip this asset
- replace with local media
- exclude from current export

Validation rule:

- 기존 ComfyUI export validation semantics를 조용히 우회하지 않는다.
- 사용자가 어떤 action을 선택했는지 manifest/preflight state에 남긴다.

## 9. 주요 사용자 흐름

### 9.1 첫 실행 후 sample project 열기

1. Project Hub 진입
2. Open Sample Project 클릭
3. Editor Workspace로 이동
4. Program Monitor에서 preview 확인
5. Export 클릭
6. Preflight 통과
7. Render 실행
8. Render Queue에서 완료 확인
9. output MP4 열기

### 9.2 로컬 미디어 import 후 편집

1. Project Hub 또는 Editor에서 Import Media
2. media bin에 asset 추가
3. asset card를 timeline에 배치
4. Inspector에서 metadata/renderPath/cache 상태 확인
5. timeline 편집
6. export preflight
7. render

### 9.3 ComfyUI 생성 결과 적용

1. Editor에서 clip 선택
2. Inspector의 ComfyUI Binding 또는 AI Studio 진입
3. workflow preset 선택
4. generate now
5. AI Studio queue에서 generating 상태 확인
6. generated result review
7. import, replace, apply as effect pass 중 선택
8. Editor에서 결과 확인

### 9.4 ComfyUI unavailable 상태에서 편집 지속

1. ComfyUI status가 unavailable
2. pending generated asset은 pending generation 상태로 남음
3. Editor preview/timeline은 계속 사용 가능
4. Export Preflight에서 해당 asset 상태를 표시
5. 사용자는 generate now, replace, exclude, skip 중 선택

### 9.5 Render Worker 기반 export

1. Editor에서 Export 클릭
2. Preflight 통과
3. Render target을 local 또는 worker로 선택
4. Render Queue에서 job 진행 확인
5. worker 실패 시 retry 또는 local fallback action 표시

### 9.6 문제 해결

1. Status Bar에서 storage/FFmpeg/ComfyUI warning 클릭
2. Settings and Diagnostics로 이동
3. 관련 섹션이 자동 focus
4. copy path, reveal path, open logs, rerun diagnostics 제공

## 10. 상태 모델

### 10.1 Project state

- no project
- loading
- loaded
- dirty
- autosaved
- saved
- recoverable
- invalid

### 10.2 Media state

- imported
- analyzing
- ready
- missing
- unsupported
- cache pending
- cache ready
- relink required

### 10.3 AI asset state

- pending generation
- generating
- generated
- failed
- skipped for current export
- replaced with local media
- excluded from current export

### 10.4 Render state

- preflight pending
- blocked
- ready
- queued
- rendering
- completed
- failed
- canceled

### 10.5 Runtime state

- healthy
- warning
- blocked
- external pending
- stale evidence

## 11. 시각적 구조 규칙

Danbi Studio는 운영형 창작 도구이므로 UI는 조용하고 밀도 있게 구성한다.

규칙:

- landing page 같은 hero layout 금지
- 기능 설명 카드 남발 금지
- 중첩 card 금지
- 작업 화면은 panel, toolbar, table, inspector 중심
- 고급 기능은 drawer/tab/screen으로 분리
- status는 badge와 compact summary로 표시
- text button보다 icon+tooltip 사용
- destructive action은 명시적 confirm
- diagnostics는 Settings로 이동

## 12. 현재 원페이지에서 분리할 항목

Editor에 남길 것:

- media bin
- preview monitor
- source monitor
- timeline
- inspector
- export button
- compact AI Results tab
- compact render status

AI Studio로 이동:

- full ComfyUI workflow browser
- generation queue
- generated result history
- prompt/model/workflow metadata comparison
- result review detail

Automation으로 이동:

- automation hook rules
- before-export hooks
- webhook execution
- batch orchestration detail

Render Queue로 이동:

- render job list
- worker status table
- daemon/fleet/headless render controls
- output history

Extensions로 이동:

- plugin manifests
- signing status
- permission matrix
- package install

Settings로 이동:

- FFmpeg diagnostics
- storage diagnostics
- userData paths
- ComfyUI endpoint
- release/local acceptance status
- logs/crash dumps

## 13. 단계별 전환 계획

### Phase 0: Inventory

목표:

- 현재 editor page에 노출된 모든 panel/action/status를 분류한다.

산출물:

- screen inventory
- 이동 대상 screen
- 유지/이동/삭제 금지 결정

삭제 금지:

- ComfyUI
- Automation
- Render Worker
- Plugin/Extension

### Phase 1: App Shell

목표:

- Project Hub와 left rail 기반 top-level navigation을 만든다.
- 상용 편집기처럼 top application menu, workspace tabs, compact tool rail을 사용한다.

구현 범위:

- shell layout
- top bar
- status bar
- screen routing state
- KOR/ENG menu language toggle

### Phase 2: Editor 정리

목표:

- Editor 화면에서 핵심 편집 workflow만 남긴다.

구현 범위:

- Media/Assets/AI Results left tabs
- Program/Source monitor center
- Inspector right panel
- Timeline bottom
- Export action 정리

### Phase 3: AI Studio 분리

목표:

- ComfyUI와 AI Results를 전용 화면으로 분리한다.

구현 범위:

- workflow browser
- queue
- result review
- asset state actions

### Phase 4: Automation / Render Queue 분리

목표:

- orchestration 운영 기능을 editor 밖으로 이동한다.

구현 범위:

- Automation screen
- Render Queue screen
- worker/fleet/headless status

### Phase 5: Extensions / Settings 정리

목표:

- plugin 관리와 runtime diagnostics를 전용 화면으로 분리한다.

구현 범위:

- Extensions screen
- Settings and Diagnostics screen
- Local Installed-App Acceptance status
- External QA pending status

## 14. UX Acceptance Criteria

UX 구조 개선은 다음 기준을 만족해야 한다.

- 앱 첫 화면에서 최근 프로젝트, 새 프로젝트, 샘플 프로젝트, import 시작이 바로 보인다.
- Editor 화면에서 사용자가 편집과 export에 필요한 핵심 컨트롤만 먼저 본다.
- ComfyUI는 AI Studio에서 1급 workflow로 접근 가능하다.
- ComfyUI unavailable 상태에서도 editor가 사용 가능하다.
- pending/generated/failed AI asset 상태가 명확하다.
- 사용자는 pending asset에 대해 generate now, skip, replace, exclude를 선택할 수 있다.
- Automation, Render Queue, Extensions, Settings가 별도 화면으로 접근 가능하다.
- Export Preflight가 blockers/warnings/info를 분리한다.
- Program Files storage write blocker는 Settings/Diagnostics에서 확인 가능하다.
- Local Installed-App Acceptance와 external QA pending 상태가 구분된다.
- 어떤 UX 단순화도 core orchestration architecture를 제거하지 않는다.

## 15. 문서화 규칙

UX 구조 변경을 진행할 때는 다음 문서를 같이 갱신한다.

- `docs/UX_STRUCTURE_DESIGN_KR.md`: 구조 설계 기준
- `docs/UX_UI_SCREEN_STRUCTURE_KR.md`: 화면 구조 요약
- `docs/EDITOR_COMPLETION_DEFINITION_KR.md`: 완료 기준 영향
- `docs/ELECTRON_ARCHITECTURE_REFACTOR_KR.md`: Electron screen/module boundary 영향
- `docs/POST_2026_06_17_23_CHANGELOG_KR.md`: 날짜별 변경 기록

구현 PR 또는 작업 단위마다 남길 기록:

- 변경한 화면
- 이동한 기능
- 제거하지 않은 core system
- 새 navigation 위치
- 사용자 흐름 영향
- 실행한 관련 테스트
- 실행하지 않은 테스트
- 남은 UX debt

## 16. 이번 설계 작업 기록

2026-06-19:

- 원페이지 기능 나열 문제를 UX 구조 문제로 정의했다.
- top-level navigation을 Project Hub, Editor, AI Studio, Automation, Render Queue, Extensions, Settings로 확정했다.
- ComfyUI/Automation/Render Worker/Plugin architecture를 유지하는 것을 명시했다.
- screen별 역할, 표시 항목, 숨길 항목, 상태 모델, 사용자 흐름, 단계별 전환 계획을 문서화했다.
- 이번 작업은 문서 작업만 수행했다.

## 17. Phase 1 구현 기록

2026-06-19:

- 기존 `/` -> `/editor` redirect를 제거하고 Project Hub를 첫 화면으로 구현했다.
- `src/app/danbi-app-shell.tsx`에 공통 app shell, left rail, top bar, status bar, workspace panel primitives를 추가했다.
- 다음 top-level route를 추가했다.
  - `/`
  - `/ai-studio`
  - `/automation`
  - `/render-queue`
  - `/extensions`
- 기존 `/editor`는 그대로 유지하고 Project Hub와 shell navigation에서 연결했다.
- 기존 `/settings`, `/generate`, `/library`도 새 top-level 화면의 entry action으로 연결했다.
- ComfyUI, AI Results, Automation, Render Worker, Render Worker Daemon, Fleet Discovery, Headless Render, Plugin/Extension system은 제거하거나 우회하지 않았다.

이번 구현 범위:

- Phase 1 app shell
- Project Hub first screen
- top-level workspace routing
- 운영 화면 skeleton
- KOR/ENG menu language toggle
- commercial editor style top menu and workspace tabs

검증:

- `npm run build` 통과
- `/`, `/ai-studio`, `/automation`, `/render-queue`, `/extensions` route 200 OK 확인
- local dev server: `http://127.0.0.1:3000`

아직 남은 UX 구현:

- Editor 본문을 app shell 내부로 통합
- 실제 saved/recent project list를 Project Hub에 연결
- AI Studio가 실제 ComfyUI queue와 AI Results state를 직접 읽도록 연결
- Automation 화면이 실제 hook/job state를 직접 읽도록 연결
- Render Queue 화면이 실제 render jobs/worker/fleet state를 직접 읽도록 연결
- Extensions 화면이 실제 plugin manifest/signing/sandbox state를 직접 읽도록 연결
- Settings 화면을 app shell 구조로 통합
- Playwright screenshot 기반 desktop/mobile layout 검증

## 18. Phase 1 UX 재조정 기록

2026-06-19:

- 단순 좌측 workspace 버튼 나열 방식이 상용 편집기 UX와 맞지 않아 shell 구조를 다시 잡았다.
- app shell을 상단 application menu, workspace tab bar, compact tool rail, status bar 구조로 바꿨다.
- 메뉴 언어 토글을 추가했다.
  - `ENG`
  - `KOR`
- 언어 토글은 shell menu, workspace tab, status bar label에 적용된다.
- Project Hub의 workspace list table을 제거했다.
- Project Hub는 시작 action, 상용 편집기형 레이아웃 설명, runtime/release 상태 요약 중심으로 정리했다.

구현 파일:

- `src/app/danbi-app-shell.tsx`
- `src/app/page.tsx`

아직 남은 UX 구현:

- 실제 Editor 화면 본문을 상용 편집기형 layout으로 재배치
- Media Bin / Source Monitor / Program Monitor / Inspector / Timeline 영역을 고정 workspace grid로 정리
- Editor 내부에 산재한 버튼을 menu group, toolbar group, contextual inspector action으로 재분류
- KOR/ENG 범위를 shell menu에서 editor toolbar/inspector/action label까지 확장
- Project Hub에 실제 recent project data 연결

검증:

- `git diff --check` 통과
- `npm run build` 통과
- `/`, `/ai-studio`, `/automation`, `/render-queue`, `/extensions` route 200 OK 확인
- Playwright로 `KOR` 클릭 후 `파일` menu와 `편집` workspace tab 표시 확인
- Playwright로 `ENG` 클릭 후 `File` menu 복귀 확인
