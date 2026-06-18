# 2026-06-17 23:00 이후 변경 기록

작성일: 2026-06-18

이 문서는 2026-06-17 23:00 KST 이후 반영된 변경사항 중 기존 문서에 누락되었던 내용을 정리한다.

기준:

- 기준 시각: 2026-06-17 23:00 KST
- 확인 대상: 현재 worktree, `git diff`, 로컬 acceptance report
- 관련 커밋: `798f9fb Codex release candidate`
- 현재 추가 변경: packaged Electron 설치앱 blocker 수정 및 Local Installed-App Acceptance 경로

## 1. 완료 기준 변경

기존 Fresh Windows final gate는 유지한다.

다만 이 agent가 직접 만들 수 없는 외부 산출물은 현재 작업 완료를 막지 않는다.

외부 pending 항목:

- Fresh Windows QA evidence
- returned evidence ZIP
- external manual result JSON
- final release approval

위 항목은 `EXTERNAL_PENDING`으로 남긴다.

금지 사항:

- 외부 evidence를 가짜로 만들지 않는다.
- Fresh Windows evidence JSON 또는 ZIP을 생성하지 않는다.
- final gate를 우회하거나 조작하지 않는다.

새 로컬 완료 기준:

- Local Installed-App Acceptance가 통과하면 이번 packaged Electron blocker 작업은 로컬 기준 완료로 본다.
- 최종 제품 release approval은 여전히 사람이 수행해야 한다.

상세 기준은 `docs/ELECTRON_LOCAL_INSTALLED_ACCEPTANCE_KR.md`를 따른다.

## 2. Program Files 쓰기 버그 수정

설치된 Electron 앱에서 media import가 다음 오류로 실패하던 blocker를 수정했다.

```text
EPERM: operation not permitted, mkdir
C:\Program Files\Danbi Studio\.danbi
```

수정 방향:

- packaged Electron runtime은 Electron `app.getPath("userData")` 아래에 로컬 데이터를 저장한다.
- 개발 모드에서만 project root `.danbi` 경로를 사용한다.
- packaged renderer child process에도 같은 userData root를 환경변수로 전달한다.

관련 경로:

- `imports`
- `cache`
- `projects`
- `packages`
- `jobs`
- `stt`
- `autosave`
- `renders`
- `outputs`
- `temp`
- `logs`
- `crashDumps`

관련 파일:

- `src/electron/main/runtime-diagnostics.ts`
- `src/electron/shared/runtime-diagnostics.ts`
- `src/electron/main/packaged-renderer-server.ts`
- `src/electron/main/electron-app.ts`
- `src/electron/main/ipc-handlers.ts`
- `src/electron/main/native-media-import-engine.ts`
- `src/server/import-storage.ts`
- `src/server/local-data-root.ts`

## 3. userData 저장 경로 정리

`initializeDanbiDesktopRuntime`가 runtime path를 만든 뒤 다음 환경변수를 설정한다.

```text
DANBI_ELECTRON_USER_DATA=<Electron userData>
DANBI_LOCAL_DATA_ROOT=<Electron userData>
```

이로 인해 packaged renderer/API route가 `.danbi`를 Program Files 아래에 만들지 않고 Electron userData 아래 storage root를 사용한다.

Runtime diagnostics snapshot도 다음 경로를 노출하도록 확장됐다.

- `importsPath`
- `cachePath`
- `autosavePath`
- `projectsPath`
- `packagesPath`
- `rendersPath`
- `tempPath`
- `jobsPath`
- `sttPath`
- `outputsPath`

## 4. 영상 import 실패 수정

Electron native media import는 설치앱에서도 userData 아래 `imports`에 media를 복사한다.

설치앱 smoke는 자동 import source를 사용해 native dialog 없이 import를 검증한다.

관련 변경:

- `DANBI_ELECTRON_AUTOMATION_MEDIA_FILE_PATHS` 환경변수로 install smoke import 파일을 주입한다.
- imported media의 `renderPath`가 실제 filesystem path로 기록된다.
- import 결과가 userData 내부인지 검사한다.

관련 테스트:

- `tests/lib/native-media-import-engine.test.ts`

## 5. 패키지 샘플 프로젝트 renderPath 수정

packaged sample project가 설치 후 FFmpeg에서 읽을 수 있는 filesystem renderPath를 가져야 하는 blocker를 검증 경로에 포함했다.

현재 install smoke는 packaged sample package를 열고 다음을 확인한다.

- packaged sample directory 존재
- sample media manifest 기준 render media 존재
- 각 render media의 filesystem path와 byte evidence 기록
- export preflight 통과
- Sample H.264 360p MP4 render 통과
- ffprobe가 output MP4를 읽음

ComfyUI placeholder 또는 ComfyUI workflow semantics는 제거하거나 우회하지 않았다.

## 6. Local Installed-App Acceptance 추가

새 스크립트:

```text
scripts/electron-local-installed-acceptance.mjs
```

새 npm script:

```text
npm run electron:local-installed-acceptance
```

Acceptance report:

```text
.danbi/electron-release/local-installed-acceptance.json
```

검증 항목:

- installer exists
- installed app launches
- project loads
- media import works
- import path is under Electron userData
- packaged sample renderPath evidence exists
- export preflight runs
- MP4 render executes
- output MP4 exists
- ffprobe reads output MP4
- Program Files/install directory write violations are absent
- external release gates remain `EXTERNAL_PENDING`

## 7. 설치앱 smoke 확장

`scripts/electron-install-smoke.mjs`가 단순 실행 smoke에서 local installed-app acceptance evidence producer로 확장됐다.

추가 확인:

- silent installer execution
- installed app launch
- renderer port and userData diagnostics
- sample project load
- automated local media import
- export preflight readiness
- actual MP4 render
- ffprobe stream metadata
- Program Files/install directory forbidden write check

Forbidden write names:

- `.danbi`
- `imports`
- `cache`
- `autosave`
- `projects`
- `packages`
- `renders`
- `temp`
- `jobs`
- `stt`
- `outputs`

## 8. Packaging smoke 중 발견된 runtime/type blocker 보정

패키징 smoke에서 드러난 runtime/type blocker도 제품 architecture를 바꾸지 않는 범위에서 보정했다.

관련 파일:

- `src/app/settings/page.tsx`
- `src/electron/main/external-exporter-handoff-writer.ts`
- `src/electron/renderer/command-palette-helpers.ts`
- `src/electron/renderer/editor-api-client.ts`
- `src/electron/renderer/media-drop-helpers.ts`
- `src/lib/browser-api-fetch.ts`
- `src/server/editor/media-analyzer.ts`

성격:

- event object가 `AbortSignal` 자리에 전달되는 문제 보정
- `AbortSignal | null`을 API boundary에서 `undefined`로 정규화
- external exporter handoff writer의 atomic write call type 보정
- command palette readonly union type narrowing
- media drop type guard 정밀화
- media analyzer timeout guard 보정

이 변경은 ComfyUI, render worker, automation, plugin architecture를 단순화하거나 제거하지 않는다.

## 9. 검증 결과

실행한 최소 검증:

```text
npm test -- --run tests/lib/native-media-import-engine.test.ts tests/lib/electron-ipc-storage.test.ts tests/lib/electron-local-installed-acceptance.test.ts
```

결과:

```text
3 files passed
10 tests passed
```

실행한 acceptance:

```text
npm run electron:local-installed-acceptance
```

결과:

```text
status: passed
failureCount: 0
```

Whitespace check:

```text
git diff --check
```

결과:

```text
passed
CRLF warnings only
```

전체 테스트 반복은 사용자의 제한에 따라 실행하지 않았다.

## 10. 현재 local result

Local Installed-App Acceptance report 기준:

- installer: present
- install smoke: passed
- install: passed
- launch: passed
- sample project: passed
- media import: passed
- export preflight: passed
- MP4 render: passed
- ffprobe: passed
- storage: passed
- Program Files/install write violations: none

Evidence files:

- `.danbi/electron-install-smoke/result.json`
- `.danbi/electron-release/local-installed-acceptance.json`

## 11. 아키텍처 보존 조건

이번 변경은 다음 기능을 제거, 우회, 비활성화, 격하, mock, optional 처리하지 않는다.

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

## 12. UX/UI 문서 추가

설치앱을 직접 열어본 결과, 원페이지에 너무 많은 기능이 노출되어 알아보기 어렵다는 문제가 확인됐다.

이에 따라 다음 문서를 추가했다.

```text
docs/UX_UI_SCREEN_STRUCTURE_KR.md
```

핵심 방향:

- Project Hub를 첫 화면으로 둔다.
- Editor Workspace는 편집, preview, timeline, import, export 중심으로 정리한다.
- ComfyUI/AI는 AI Studio로 분리하되 1급 workflow로 유지한다.
- Automation, Render Queue, Extensions, Settings/Diagnostics를 별도 화면으로 분리한다.
- 기능 제거가 아니라 workflow별 progressive disclosure를 적용한다.

## 13. 아직 사람이 해야 하는 부분

다음은 agent가 완료할 수 없으므로 문서와 report에서 `EXTERNAL_PENDING`으로 남긴다.

- Fresh Windows QA evidence
- returned evidence ZIP
- external manual result JSON
- final release approval

이 항목들은 최종 release approval에는 필요하지만, 현재 local installed-app acceptance 완료 판정에는 포함하지 않는다.

## 14. 2026-06-19 UX 구조 설계

설치 앱이 원페이지에 너무 많은 기능을 노출해 알아보기 어렵다는 문제를 UX 구조 문제로 분리했다.

새 문서:

```text
docs/UX_STRUCTURE_DESIGN_KR.md
```

설계 결정:

- 첫 화면은 Project Hub로 둔다.
- Editor는 import, preview, timeline, inspector, export 중심으로 정리한다.
- ComfyUI와 AI Results는 AI Studio로 분리하되 1급 workflow로 유지한다.
- Automation, Render Queue, Extensions, Settings를 별도 top-level screen으로 둔다.
- Render Worker, Render Worker Daemon, Fleet Discovery, Headless Render, Plugin/Extension system은 제거하지 않고 운영 화면으로 이동한다.
- Export Preflight는 blockers, warnings, info를 분리한다.
- Local Installed-App Acceptance와 external Fresh Windows QA pending 상태를 Settings/Diagnostics에서 구분한다.

이번 UX 작업은 문서 작업만 수행했다. 코드 구현, 테스트 실행, 화면 변경은 하지 않았다.

## 15. 2026-06-19 UX Phase 1 구현

UX 구조 설계의 첫 구현 단계로 Project Hub와 top-level app shell을 추가했다.

변경 파일:

- `src/app/danbi-app-shell.tsx`
- `src/app/page.tsx`
- `src/app/ai-studio/page.tsx`
- `src/app/automation/page.tsx`
- `src/app/render-queue/page.tsx`
- `src/app/extensions/page.tsx`
- `src/app/layout.tsx`
- `docs/UX_STRUCTURE_DESIGN_KR.md`

구현 내용:

- 기존 `/` -> `/editor` redirect 제거
- `/`를 Project Hub 첫 화면으로 변경
- left rail, top bar, status bar, workspace panel primitive 추가
- `/ai-studio`, `/automation`, `/render-queue`, `/extensions` route 추가
- 기존 `/editor`, `/settings`, `/generate`, `/library`와 연결

보존 조건:

- ComfyUI integration 제거 없음
- ComfyUI batch queue 제거 없음
- AI Results workflow 제거 없음
- Automation hooks 제거 없음
- Render Worker / Daemon / Fleet Discovery / Headless Render 제거 없음
- Plugin / Extension system 제거 없음
- 기존 export validation semantics 변경 없음

검증:

```text
npm run build
```

결과:

```text
passed
```

route 확인:

```text
/ 200 OK
/ai-studio 200 OK
/automation 200 OK
/render-queue 200 OK
/extensions 200 OK
```

local dev server:

```text
http://127.0.0.1:3000
```
