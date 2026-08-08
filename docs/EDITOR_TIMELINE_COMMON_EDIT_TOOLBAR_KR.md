# Editor Timeline Common Edit Toolbar - 2026-06-21

## 목적

사용자가 지적한 타임라인 toolbar 영역은 `+ / Cmd / Undo / Redo / Cut / Del` 정도만 보여서 상용 편집기에서 반복적으로 쓰는 편집 동작이 바로 보이지 않았다.

## 참고 소스 기준

- Shotcut `src/mainwindow.cpp`: timeline menu에 ripple 관련 action을 별도로 둔다.
- Shotcut `src/player.cpp`: `Trim Clip In`, `Trim Clip Out` action을 플레이어/타임라인 편집 흐름에 둔다.
- OpenCut Classic `apps/web/src/ripple`: ripple diff/apply를 별도 편집 모델로 유지한다.
- OpenCut Classic `timeline/controllers/*`: selection, resize/trim, drag interaction을 timeline 주변 컨트롤과 직접 연결한다.

## 적용 원칙

- 새 편집 엔진을 만들지 않는다.
- 이미 구현된 Danbi editor command를 timeline toolbar에 연결한다.
- 버튼을 무작정 펼치지 않고, 반복 빈도가 높은 action은 직접 버튼, 나머지는 메뉴에 묶는다.
- ComfyUI, automation, render worker, plugin 구조는 건드리지 않는다.

## 변경 내용

직접 노출:

- Split at playhead
- Trim head to playhead
- Trim tail to playhead
- Ripple delete
- Delete selected

Edit 메뉴:

- Split at playhead
- Split all at playhead
- Trim head/tail to playhead
- Ripple delete
- Duplicate
- Group / Ungroup
- Previous / Next edit point

Marks 메뉴:

- Set In / Out point
- Mark selected clips
- Select marked range
- Add marker
- Clear In/Out

## 완료 기준

- 타임라인 toolbar에서 반복 편집 명령을 바로 실행할 수 있어야 한다.
- 선택이 필요한 명령은 선택 없을 때 비활성화되어야 한다.
- 기존 context menu, inspector command panel, command palette의 의미는 유지되어야 한다.
