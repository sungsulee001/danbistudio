# UX 전용 화면 구현 기록

작성일: 2026-06-19

## 목적

`UX_STRUCTURE_DESIGN_KR.md`와 `UX_UI_SCREEN_STRUCTURE_KR.md`에서 정의한 다음 전용 화면 분리 기준을 실제 UI에 반영한다.

- AI Studio
- Automation
- Render Queue
- Extensions
- Settings and Diagnostics

이번 작업은 새 편집 기능 추가가 아니라 기존 orchestration 기능을 전용 화면에서 찾고 확인할 수 있게 하는 UI 재배치 작업이다.

## 구현 반영

### AI Studio

- `/ai-studio`가 실제 `/api/editor/comfyui-jobs`를 읽어 ComfyUI batch queue 상태를 표시한다.
- `/api/library`를 읽어 AI Results history를 표시한다.
- `/api/workflows`를 읽어 ComfyUI workflow browser를 표시한다.
- pending generation, generating, generated, failed 상태 요약을 status bar와 본문에 표시한다.
- 기존 ComfyUI queue job의 cancel, retry queue, retry execute 액션을 연결했다.
- generate now, skip this asset, replace with local media, exclude from current export 진입점을 AI Studio에 배치했다.

### Automation

- `/automation`이 실제 `/api/editor/hooks` 상태를 읽는다.
- `/api/editor/queue-settings`를 읽고 queue concurrency/priority 설정을 표시 및 적용할 수 있다.
- hook event별 prepare 액션을 분리했다.
- ComfyUI queue/execute와 webhook run은 명시적 버튼으로만 실행된다.
- local action 적용은 현재 project session 저장 구조와 충돌하지 않도록 이번 화면에서는 자동 적용하지 않는다.

### Render Queue

- `/render-queue`가 실제 `/api/editor/render-jobs` 상태를 읽는다.
- render job list, queued/running/completed/failed 상태, progress, error/diagnostic, output path를 표시한다.
- cancel, retry, output open, output reveal 액션을 기존 render job API/IPC에 연결했다.
- Render Worker daemon URL probe를 기존 daemon status client에 연결했다.
- Render Worker, Daemon, Fleet Discovery, Headless Render 상태를 전용 화면에 표시한다.

### Extensions

- `/extensions`가 현재 project 또는 local fallback project의 plugin manifest를 읽는다.
- extension sandbox/signing snapshot을 `buildExtensionHostSnapshot`으로 표시한다.
- installed plugins, blocked plugins, signing issues, commands, render hooks, warnings를 전용 화면에 표시한다.
- plugin package install은 Electron project context가 필요한 작업이므로 Editor의 기존 installer 진입점으로 연결했다.

### Settings and Diagnostics

- `/settings`를 App Shell 내부 화면으로 통합했다.
- FFmpeg, storage/userData, ComfyUI connection, runtime warnings를 Shell status bar에 표시한다.
- 기존 runtime diagnostics, storage cleanup, ComfyUI endpoint/default parameter 설정은 유지했다.

### Editor

- Editor Inspector의 기존 `Jobs`와 `Plugins` contextual access는 유지했다.
- 아직 active project shared session이 전용 화면 전체에 완성되지 않았으므로 기존 Automation hooks, Render Worker, Plugin/Extension 조작 경로를 숨기지 않았다.
- 기존 export validation semantics와 ComfyUI generation semantics는 변경하지 않았다.

## 남은 UX 정리

- active project를 모든 전용 화면이 동일한 shared session으로 읽고 쓰는 구조는 아직 남아 있다.
- Editor Jobs/Plugins/Export 패널 내부의 운영 상세 일부는 기존 workflow 안정성과 기능 접근성 유지를 위해 아직 남아 있다.
- desktop/mobile screenshot 기반 시각 검증은 별도 검증 작업으로 남아 있다.

## 금지 조건 준수

이번 작업은 다음 시스템을 제거, 우회, 비활성화, mock, downgrade하지 않았다.

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- 기존 ComfyUI export validation semantics
