# Editor Timeline Ruler Origin Alignment - 2026-06-21

## 배경

사용자가 캡처에서 타임라인 시간 눈금 영역이 클립/트랙 영역과 맞지 않아 정상적인 편집기 상태로 보이지 않는다고 지적했다.

## 소스 기준 확인

- Shotcut `Ruler.qml`: ruler는 트랙 리스트 헤더가 아니라 시간 콘텐츠 좌표계에서만 tick/label을 배치한다.
- OpenCut Classic `TrackLabelsPanel`: 트랙 라벨/헤더는 별도 왼쪽 컬럼이고, ruler와 clip lane은 오른쪽 timeline content 좌표계를 공유한다.

## 원인

Danbi Editor는 트랙 헤더 영역과 실제 timeline lane 영역을 한 scroll content 안에 두면서도, ruler/scroll/zoom/render window 계산 일부가 전체 scroll container 기준으로 남아 있었다.

이 상태에서는 다음 현상이 생긴다.

- `0s` label이 실제 클립 시작점보다 왼쪽에서 시작한다.
- 마커와 playhead가 트랙 헤더 gutter까지 시간 영역처럼 포함해서 보일 수 있다.
- wheel zoom anchor, playhead auto-scroll, virtual clip render window가 화면 기준과 어긋날 수 있다.

## 수정 범위

- `TIMELINE_TRACK_HEADER_WIDTH = 128` 공통 상수를 추가했다.
- ruler row를 `track gutter + timeline scrubber` grid로 분리했다.
- track row도 같은 상수로 header/lane grid를 구성했다.
- scroll visibility, fit zoom, wheel zoom, virtual render window 계산에 `timelineStartOffsetPixels`를 추가했다.
- `/editor`에서는 실제 track header width를 helper에 전달한다.

## 완료 기준

- ruler scrubber의 left 좌표와 첫 timeline lane의 left 좌표가 일치해야 한다.
- `0s`, marker, playhead, clips가 같은 timeline lane origin을 기준으로 배치되어야 한다.
- header gutter는 시간으로 계산되지 않아야 한다.
- 기존 offset 없는 helper 호출은 기존 동작을 유지해야 한다.

## 관련 검증

- unit: timeline visible scroll, fit zoom, render window header-offset case
- unit: wheel zoom cursor anchor with header offset
- e2e: ruler row/track stack header width attribute and ruler-to-lane geometry

전체 테스트 반복은 수행하지 않고, 변경된 editor/timeline 관련 테스트만 실행 대상으로 둔다.
