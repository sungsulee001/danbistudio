# Editor Interaction Connection Fix

작성일: 2026-06-19

## 배경

편집기 화면을 CapCut/OpenCut/Filmora에 가까운 구조로 재배치했지만, 사용자가 지적한 문제는 UI 배치가 아니라 실제 마우스 조작이 편집 상태와 프리뷰에 즉시 연결되는지였다.

특히 Inspector Transform 패널은 보이지만, scale/rotation 슬라이더를 마우스로 드래그할 때 이전 렌더의 선택 상태를 기준으로 Motion 효과를 판단할 수 있었다. 이 경우 첫 입력 뒤의 연속 입력이 현재 프로젝트의 Motion 효과를 다시 찾지 못해 새 효과를 반복 추가하거나, 사용자가 보기에는 슬라이더가 껍데기처럼 반응하지 않는 상태가 될 수 있었다.

## 수정 내용

- `src/app/editor/page.tsx`
  - Inspector Transform 패치 처리에서 커밋 내부의 최신 프로젝트 상태를 기준으로 현재 클립을 다시 찾도록 변경했다.
  - 현재 클립의 Motion 효과도 커밋 내부에서 `findMotionTransformEffect`로 다시 확인한다.
  - 기존 Motion 효과가 있으면 그 효과를 갱신하고, 없을 때만 새 Motion 효과를 추가한다.
  - 연속 마우스 드래그 입력이 stale `selectedMotionEffect`에 묶이지 않도록 했다.

- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
  - 숫자 입력 한 번만 확인하던 Inspector Transform 테스트를 실제 마우스 슬라이더 드래그 검증으로 바꿨다.
  - Program Monitor transform handle 드래그 후 Inspector scale 입력 값도 함께 갱신되는지 확인한다.

- `src/electron/renderer/program-media-layer-preview.tsx`
  - 브라우저에서 media source를 열 수 없을 때 검은 화면만 보이지 않도록 missing media placeholder frame을 렌더한다.
  - placeholder도 기존 미디어 레이어와 같은 transform/crop/filter 표시 경로 안에 렌더되므로 Program Monitor 조작 피드백이 보인다.

- `src/lib/editor/preview-source.ts`
  - 패키지/샘플 프로젝트의 proxy path가 Windows filesystem path로 rewrite된 경우 `/sample-pack/...` browser preview URL로 변환한다.
  - video proxy source도 raw path를 그대로 반환하지 않고 preview source resolver를 통과시킨다.

- `src/app/media/[...path]/route.ts`
  - 기본 데모 프로젝트가 참조하는 `/media/interview-master.mp4`, `/media/soft-pulse.wav`가 `public/media`에 없을 때 generated sample pack media로 fallback한다.

- `src/app/sample-pack/[...path]/route.ts`
  - sample pack 내부 media/proxy/thumbnail/waveform 파일을 읽기 전용으로 range streaming한다.

- `src/server/editor/sample-project-package.ts`
  - packaged Electron server가 전달하는 `DANBI_ELECTRON_RESOURCES_PATH`, `DANBI_ELECTRON_APP_PATH` 환경변수를 sample package lookup 기본 후보로 사용한다.

- `tests/api/media-preview-routes.test.ts`
  - `/media` fallback route와 `/sample-pack` route가 range 응답을 반환하는지 검증한다.

## 검증한 실제 상호작용

- Program Monitor transform scale handle drag
- Program Monitor transform body drag
- Program Monitor rotate handle drag
- Inspector Transform scale slider mouse drag
- Inspector Transform rotation slider mouse drag
- Timeline waveform volume drag
- Timeline clip edge trim drag
- Timeline zoom/scrub/playhead drag
- Timeline box selection/context action
- Media Bin asset drag/drop to timeline
- Program Monitor player controls to timeline state sync
- Media panel visible import button to grid import
- Missing default demo media fallback preview route
- Rewritten sample-pack preview path serving

## 실행한 검증

```text
npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "program monitor transform|transform controls"
npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium
npx vitest run tests/lib/editor-core.test.ts -t "resolves cached preview media sources consistently"
npx vitest run tests/lib/sample-project-package.test.ts
npx vitest run tests/api/media-preview-routes.test.ts
npm run build
git diff --check
```

결과:

- Program Monitor/Inspector Transform 실제 마우스 조작 통과
- 관련 Program Monitor transform / Inspector transform / Media Bin drag E2E 통과
- Media import grid E2E 통과
- preview source sample-pack 변환 unit 통과
- sample package lookup unit 통과
- media preview route API unit 통과
- Next production build 통과
- diff whitespace check 통과

## 건드리지 않은 영역

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Extension / Plugin system
- 기존 ComfyUI export validation semantics
