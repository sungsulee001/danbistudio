# Editor Mouse/Playhead Edit Binding - 2026-06-21

## 문제

Timeline toolbar에 `Trim In`, `Trim Out`, `RDel`, `Del` 버튼이 추가되었지만, 기존 실행 기준은 대부분 `selectedClip`에만 묶여 있었다.

사용자가 마우스로 timeline ruler/playhead를 클립 위에 놓은 상태에서도 클립을 별도로 선택하지 않으면 편집 버튼이 비활성화되어 보였고, 이는 상용 편집기의 사용 흐름과 맞지 않았다.

## 참고 소스에서 본 기준

- Shotcut은 timeline/player action을 `Trim Clip In`, `Trim Clip Out`, ripple, marker action으로 분리하고 현재 timeline/player context에 연결한다.
- OpenCut Classic은 timeline element interaction controller에서 selection이 없거나 지연된 경우에도 pointer 대상 element를 interaction anchor로 삼는다.
- OpenCut ripple 모듈은 ripple edit을 별도 모델로 유지하되, UI 동작은 timeline selection/context와 연결한다.

## Danbi 적용

새 편집 기능을 추가하지 않고 기존 Danbi 명령을 다음 우선순위로 연결했다.

1. 선택된 클립이 있고 playhead가 그 클립 안에 있으면 선택 클립을 편집 대상으로 사용한다.
2. 선택된 클립이 없거나 playhead와 맞지 않으면 `activeTimelineClip`, 즉 playhead 아래 클립을 편집 대상으로 사용한다.
3. 그래도 대상이 없으면 기존처럼 status로 안내하고 실행하지 않는다.

## 연결된 명령

- Trim head to playhead
- Trim tail to playhead
- Delete timeline target
- Ripple delete timeline target

Split은 이미 `activeTimelineClip` fallback을 갖고 있었으므로 유지했다.

## 검증 기준

- 클립을 선택하지 않아도 playhead가 클립 안에 있으면 timeline toolbar의 trim/delete 계열 버튼이 활성화되어야 한다.
- 실행 시 선택 클립이 없으면 playhead 아래 클립을 대상으로 처리해야 한다.
- 기존 선택 기반 context menu와 inspector command semantics는 유지한다.
- ComfyUI, automation, render worker, plugin 계층은 변경하지 않는다.
