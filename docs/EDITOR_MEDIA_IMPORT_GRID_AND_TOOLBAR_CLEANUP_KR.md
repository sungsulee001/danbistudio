# Editor Media Import Grid And Toolbar Cleanup

작성일: 2026-06-19

## 배경

설치/사용 확인 중 미디어 import 후 파일이 눈에 잘 들어오지 않고, 편집 화면의 버튼과 진단 정보가 과하게 노출되어 CapCut 같은 상용 편집기 기준의 편집 편의성이 부족하다는 문제가 제기되었다.

## 확인 결과

- 브라우저 파일 input import 경로는 정상 동작한다.
- 사용자가 누르는 실제 `+ Import` 버튼 경로로 file chooser를 열고 미디어가 프로젝트에 추가되는 것을 확인했다.
- 문제의 핵심은 import 자체보다, 들어온 미디어가 편집기식 썸네일 그리드로 보이지 않고 액션 버튼과 진단 정보가 화면에 과하게 노출되는 UI 문제였다.
- Source Monitor의 영상 preview 요소가 `muted`로 고정되어 있어 소스 영상의 오디오가 들릴 수 없는 상태였다.
- Media Bin의 작은 `DRAG` 라벨만으로는 실제 사용자가 타임라인으로 끌어 놓기 어렵다.
- Program Monitor와 Source Monitor에 스코프, 오디오 분석, 성능, 컴포지트 스택 정보가 기본 노출되어 preview 화면을 가렸다.

## 변경 내용

- Media Bin 상단 버튼을 `+ Import`, `Record`, `Manage` 중심으로 정리했다.
- Relink, Remove unused, Cache filtered는 `Manage` 메뉴로 묶었다.
- Source controls는 접힌 영역으로 이동해 기본 화면의 버튼 밀도를 줄였다.
- Media Bin asset 목록을 목록형 카드에서 썸네일 그리드로 변경했다.
- 각 asset card에 duration badge, drag handle, kind/reference metadata를 표시했다.
- Insert/Overwrite/Source quick actions는 카드 hover/focus 시 노출되도록 정리했다.
- 내부 Cache/Relink/Delete는 `Actions` 접힌 영역으로 이동했다.
- 상단 editor toolbar는 핵심 버튼만 직접 노출하고 나머지는 `Edit`, `Source`, `Marks`, `AI` 메뉴로 묶었다.
- Media Bin `+ Import` 버튼을 통한 실제 file chooser import E2E를 추가했다.
- Media Bin 썸네일 영역 전체를 마우스로 끌어 타임라인에 drop할 수 있도록 pointer drag fallback을 보강했다.
- Source Monitor 영상 preview의 고정 `muted` 속성을 제거했다.
- Program Monitor/Source Monitor의 진단 오버레이는 기본 숨김으로 전환하고, `Info` 버튼을 눌렀을 때만 보이도록 했다.
- Program Monitor 하단에 상용 편집기식 player control bar를 추가했다.
- Program Monitor control bar에서 현재 playhead / 전체 duration을 표시하고, 타임라인 playhead와 같은 상태로 연동했다.
- Program Monitor control bar에서 play/pause, playhead scrub, monitor zoom, proxy/cache, canvas aspect ratio, fullscreen 버튼을 노출했다.
- Monitor zoom은 실제 clip transform이 아니라 preview 표시 배율만 조정하도록 분리했다.
- Control bar가 transform/crop handle을 가리지 않도록 캔버스 영역과 하단 컨트롤 영역을 분리했다.
- Program Monitor의 transform handle이 장식처럼 보이지 않도록, 우측 기본 `Clip` Inspector 최상단에 Transform 패널을 노출했다.
- Transform 패널은 기존 motion transform 값과 연결되어 `Scale`, `Position X/Y`, `Rotation`을 즉시 편집한다.
- Transform 패널의 scale/rotation은 slider와 숫자 입력을 함께 제공한다.
- Program Monitor handle 드래그와 Inspector Transform 입력은 같은 `positionX / positionY / scale / rotation` 값을 수정한다.

## 수정 파일

- `src/electron/renderer/media-bin-panel.tsx`
- `src/electron/renderer/editor-top-toolbar.tsx`
- `src/electron/renderer/program-composite-preview.tsx`
- `src/electron/renderer/program-preview-stage.tsx`
- `src/electron/renderer/source-monitor.tsx`
- `src/electron/renderer/inspector-motion-panels.tsx`
- `src/app/editor/page.tsx`
- `tests/e2e/editor-media-import-grid.spec.ts`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`

## 검증

실행한 관련 검증:

- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium -g "direct media bin|monitor diagnostics"`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`
- `npm run build`

결과:

- 썸네일 drag/drop E2E 통과
- Program/Source Monitor 진단 오버레이 기본 숨김 E2E 통과
- Source Monitor 영상 `muted` 제거 확인 E2E 통과
- Media Bin `+ Import` file chooser import E2E 통과
- Program Monitor player control bar 노출 및 타임라인 playhead 연동 E2E 통과
- Program Monitor zoom control이 preview 표시 배율만 바꾸는지 E2E 통과
- 기본 Clip Inspector의 Transform 패널 노출 및 Program Monitor transform 값 연동 E2E 통과
- build 통과

## 별도 관찰

다음 기존 E2E는 이전 확인 중 실패가 관찰되었으나 이번 import/grid/preview 정리 범위와 직접 관련이 없어 수정하지 않았다.

- `opens the real editor from the app root`: `/`가 `/editor`로 redirect되지 않음
- `queues the current export from a failed saved render plan`: 현재 화면에서 `Refresh` 버튼을 찾지 못함

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
