# CapCut Style Editor UI 적용 기록

Date: 2026-06-19

## 적용 목적

`uisample/`의 CapCut 계열 화면 구조를 기준으로 Editor 첫 화면의 정보 밀도를 다시 배치했다. 이번 변경은 새 편집 기능 추가가 아니라 기존 기능 패널의 위치와 접근 구조를 재배치한 것이다.

## 실제 적용 구조

1. 상단 1차 모드 바
   - `Media`, `Audio`, `Text`, `Effects`, `Transitions`, `Captions`, `Filters`, `Adjust`, `Templates`, `AI`
   - 각 모드는 기존 좌측 Asset 패널과 우측 Inspector dock 조합을 전환한다.
   - 새 기능, 새 workflow, 새 validation을 만들지 않는다.

2. 상단 도구막대
   - 기존 모든 편집 버튼을 여러 줄로 펼치던 `flex-wrap` 구조를 한 줄 가로 스크롤 구조로 바꿨다.
   - 버튼과 handler는 제거하지 않았다.
   - Editor 본문이 toolbar 때문에 아래로 밀리는 문제를 줄인다.

3. 좌측 Asset Bay
   - CapCut/OpenCut 계열처럼 좌측을 더 넓은 source/browser 영역으로 조정했다.
   - 기존 `Media`, `Project`, `Templates`, `Health` 패널은 유지했다.
   - import, saved project, autosave, media health, source range 기능은 기존 컴포넌트를 그대로 사용한다.

4. 중앙 Edit Workspace
   - Program Monitor가 더 큰 중심 영역을 차지하도록 monitor grid를 조정했다.
   - Source Monitor와 Scene Readout은 유지했다.
   - 기존 workspace preset strip은 상단 1차 모드 바로 흡수했다.

5. 우측 Inspector
   - 기존 `Clip`, `Video`, `Audio`, `Effects`, `Text`, `Jobs`, `Export`, `Plugins` dock은 유지했다.
   - ComfyUI Binding, Automation Hooks, Export Workspace, Render Worker, Plugins Panel 호출은 유지했다.

6. 하단 Timeline
   - Timeline transport/ruler와 multi-track timeline을 Editor 하단 전체 폭 grid row로 이동했다.
   - Timeline props, track row 렌더링, clip edit handlers는 변경하지 않았다.

## 건드리지 않은 영역

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

## 변경 파일

- `src/app/editor/page.tsx`
- `src/electron/renderer/editor-top-toolbar.tsx`

## 검증 범위

이번 변경은 Editor UI 배치 변경이므로 관련 검증만 수행한다.

- `git diff --check`
- `npm run build`
- `/editor` route smoke
- `/editor` Playwright UI smoke

전체 테스트 반복은 수행하지 않는다.
