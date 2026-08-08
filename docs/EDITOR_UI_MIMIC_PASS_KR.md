# Editor UI Mimic Pass

작성일: 2026-06-19

## 기준

사용자 지시에 따라 UI 모방은 허용한다. 다만 이번 패스는 새 기능 추가가 아니라 기존 편집 기능의 노출 방식과 조작 밀도를 상용 편집기형으로 정리하는 범위다.

참고 방향:

- CapCut 계열: 상단 기능 카테고리 탭, 좌측 미디어, 중앙 플레이어, 우측 속성, 하단 타임라인
- OpenCut 계열: asset panel, preview, properties panel, timeline의 명확한 구획
- Shotcut 계열: dock 단위 분리와 작업 영역별 패널 전환

## 이번 변경

### 1. 상단 기능 탭

`src/app/editor/page.tsx`

- `Media`, `Audio`, `Text`, `Effects`, `Transitions`, `Captions`, `Filters`, `Adjust`, `Templates`, `AI`를 CapCut식 카테고리 탭처럼 더 좁고 일정한 폭으로 재배치했다.
- 기존 `assetPanel` / `dockPanel` 전환 로직은 그대로 둔다.
- 기능 추가, 삭제, 우회 없음.

### 2. Timeline Toolbar

`src/electron/renderer/timeline-transport-ruler.tsx`

- 타임라인 위에 펼쳐져 있던 `Add title`, `Add adjustment`, `Add video`, `Add audio`, `Captions`, `Save`, `Load` 버튼을 `Insert` / `Project` 메뉴로 접었다.
- 플레이, 프레임 nudge, playhead slider, timecode, I/O marks, zoom, fit 조작을 타임라인 중심 컨트롤로 재배치했다.
- `Insert Gap`, `AI Fill`은 `Gap` 메뉴로 접어 타임라인 조작 영역의 시각적 혼잡을 줄였다.
- 기존 handler와 command path는 유지한다.

## 변경하지 않은 것

- ComfyUI integration
- ComfyUI batch queue
- AI Results workflow
- Automation hooks
- Render Worker
- Render Worker Daemon
- Fleet Discovery
- Headless Render
- Plugin / Extension system
- Export validation semantics

## 현재 판단

이번 변경은 편집기의 기능을 늘리는 작업이 아니라 “기존 기능이 한 화면에 다 펼쳐져 보여 산만한 문제”를 줄이는 UI 밀도 정리다.

다음 UI 품질 우선순위:

1. Media bin 카드 크기와 썸네일 밀도 조정
2. Inspector 기본 탭을 CapCut의 `Video / Audio / Speed / Animation / Tracking / Adjust` 느낌으로 재배열
3. Timeline track header와 clip body의 시각 계층 강화
4. Program Monitor transform handle 시각 품질 정리
