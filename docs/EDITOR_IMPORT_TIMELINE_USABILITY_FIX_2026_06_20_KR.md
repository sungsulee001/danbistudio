# Editor Import/Timeline Usability Fix - 2026-06-20

## 범위

사용자가 CapCut 화면과 비교해 지적한 편집 기본 UI 문제 중, 이번 패스에서는 다음 항목만 수정했다.

- 미디어 가져오기 영역이 카드별 상태/메타/액션으로 과하게 복잡한 문제
- 편집 명령이 상단 툴바와 타임라인에 중복 노출되는 문제
- 트랙 헤더가 넓고 버튼이 펼쳐져 타임라인 공간을 낭비하는 문제
- 타임라인 현재 시간 표시가 편집 위치와 별도처럼 보이는 문제
- 소스 컨트롤이 기본으로 펼쳐져 미디어 브라우징을 방해하는 문제

## 변경 사항

1. 미디어 패널
   - 미디어 컬럼을 `xl 420px`, `2xl 520px` 구조로 넓혀 그리드 카드가 2열 이상 보이게 조정했다.
   - 기본 그리드 카드는 썸네일, 길이, 파일명, 최소 상태만 보이도록 줄였다.
   - 사용 횟수, 타임라인 상태, 종류, 상세 메타 정보는 리스트 보기에서만 확인하도록 분리했다.
   - 공유 라이브러리와 소스 컨트롤은 기본 접힘 상태로 변경했다.
   - 미디어 quick status는 DOM 데이터만 유지하고 화면에서는 숨겼다.

2. 타임라인 로컬 툴바
   - Undo, Redo, Commands, Cut, Delete를 타임라인 블록 내부 툴바에 배치했다.
   - Ripple, Snap, Loop, Insert/Overwrite 모드도 타임라인 툴바로 이동했다.
   - 현재 playhead와 duration 표시를 타임라인 툴바 중앙에 노출했다.

3. 상단 툴바
   - 상단의 History/Edit/Timeline 중복 그룹은 숨김 처리했다.
   - Import, Commands, Export, Render, AI, 상태 영역은 유지했다.
   - ComfyUI, Render, Automation, Plugin 관련 기능은 제거하거나 우회하지 않았다.

4. 트랙 헤더
   - 트랙 헤더 폭을 128px로 축소했다.
   - Move/Delete 등 보조 명령은 `...` 메뉴로 접었다.
   - Mute/Solo/Sync/Lock은 작은 토글로 축소했다.
   - 오디오 믹서는 `Mix` details로 접었다.

## 확인 결과

- `/editor` 서버 500 원인인 잘못된 `handleOpenCommandPalette` 참조를 `openCommandPalette`로 수정했다.
- 2048x1152 DOM 확인 결과:
  - editor shell hydrated: `true`
  - asset bay actual width: `520px`
  - media list mode: `grid`
  - first media cards: grid mode, 2열 이상 배치
  - timeline local toolbar visible
  - top Edit/Timeline groups: `display: none`
  - source controls default open: `false`

## 실행한 검증

- `npx eslint src\electron\renderer\media-bin-panel.tsx src\electron\renderer\timeline-track-row.tsx src\electron\renderer\timeline-transport-ruler.tsx src\electron\renderer\editor-top-toolbar.tsx src\app\editor\page.tsx tests\e2e\editor-media-import-grid.spec.ts tests\e2e\editor-control-surface-audit.spec.ts`
- `PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test editor-media-import-grid.spec.ts --project=chromium --grep "imports media through the visible media panel import button into the grid"`
- `PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test editor-control-surface-audit.spec.ts --project=chromium --grep "exposes connected top toolbar menus|connects top toolbar cut/delete"`
- `PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test editor-media-import-grid.spec.ts --project=chromium --grep "imports media then routes it through source monitor insert"`

전체 테스트 반복은 실행하지 않았다.

## 남은 UX/UI 과제

- CapCut 수준의 미디어 썸네일 밀도는 더 개선 가능하다. 현재 2xl 기준 2열 이상은 나오지만, 좌측 카테고리 폭과 카드 최소 폭을 더 줄이면 3열 이상도 가능하다.
- 타임라인 트랙 헤더는 축소됐지만, CapCut처럼 아이콘 중심 컨텍스트 메뉴까지 정리하려면 추가 패스가 필요하다.
- Inspector 편집 패널은 아직 상용 편집기처럼 도구별 접힘/검색/즐겨찾기 구조까지 정리되지 않았다.
- 실제 영상/오디오 긴 클립에서 waveform cache와 preview update 반응성은 별도 성능 패스로 봐야 한다.
