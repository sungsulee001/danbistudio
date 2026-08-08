# Editor Timeline Fixed Controls / Audio Separate Edit / Settings Pass

Date: 2026-06-22

## Scope

이번 작업은 편집기 기본 사용성 문제만 다룬다.

- 타임라인을 세로 스크롤해도 편집 조작부와 룰러가 사라지지 않게 한다.
- 트랙 잠금 상태가 화면에서 명확히 보이게 한다.
- 링크된 비디오/오디오 클립을 기본적으로 따로 선택, 이동, 트림할 수 있게 한다.
- 필요하면 설정에서 다시 링크 동시 편집으로 전환할 수 있게 한다.
- 설정 화면에 편집기 전용 설정과 단축키 검색/사용자 단축키 추가 UI를 둔다.

## Reference Notes

외부 레퍼런스는 방향 확인용으로만 사용했고, 소스 이식이나 구조 변경은 하지 않았다.

- OpenShot 문서는 타임라인 툴바, 줌, 트랙 잠금이 타임라인 조작의 핵심 표면이라고 설명한다.
  - https://cdn.openshot.org/static/files/user-guide/timeline.html
  - https://www.openshot.org/static/files/user-guide/main_window.html
- Shotcut 단축키 문서는 컷, 리플 삭제, 삽입/덮어쓰기, 트랙 추가, 트림 단축키가 편집 표면에 있어야 하는 기본 작업임을 보여준다.
  - https://www.shotcut.org/howtos/keyboard-shortcuts/
- CapCut 계열 단축키 자료는 타임라인 확대/축소, 맞춤, 컷/선택 도구가 빠른 편집의 기본 동선임을 보여준다.
  - https://www.skillademia.com/shortcuts/capcut-shortcuts

## Implemented

1. Timeline fixed controls
   - `TimelineTransportRulerPanel` 상단 조작부가 타임라인 트랙 세로 스크롤과 분리된다.
   - 룰러 행과 왼쪽 트랙 헤더 영역이 스크롤 중에도 보이도록 sticky 처리했다.

2. Track lock visibility
   - 잠긴 트랙은 lane에 `data-track-locked="true"`가 붙는다.
   - 잠긴 트랙 위에 locked overlay를 표시한다.
   - 트랙 잠금 토글에 테스트 식별자를 부여했다.

3. Separate video/audio edit mode
   - 새 기본값은 `separate`다.
   - 링크된 비디오/오디오라도 선택, 이동, 수치 start/duration 편집, edge trim, split에서 단일 클립 편집이 가능하다.
   - 설정에서 `linked`로 바꾸면 기존 링크 동시 편집 흐름을 사용할 수 있다.

4. Editor settings
   - 설정 화면에 `Editor Settings / 편집기 설정` 섹션을 추가했다.
   - 타임라인 조작부 고정, 마우스 휠 줌, 링크 편집 방식, 단축키 검색, 사용자 단축키 추가/삭제를 제공한다.
   - 사용자 단축키는 기본 단축키와 충돌하면 추가하지 않는다.

## Verification

Targeted only.

- `npx eslint src/lib/editor/editor-settings.ts src/app/settings/page.tsx src/app/editor/page.tsx src/electron/renderer/timeline-selection-helpers.ts src/electron/renderer/timeline-interaction-adapter.ts src/electron/renderer/timeline-edit-preview-helpers.ts src/electron/renderer/clip-move-workflow-helpers.ts src/electron/renderer/clip-precision-edit-workflow-helpers.ts src/electron/renderer/editor-keyboard-dispatcher.ts src/electron/renderer/timeline-transport-ruler.tsx src/electron/renderer/timeline-track-row.tsx tests/lib/timeline-interaction-adapter.test.ts`
- `npx vitest run tests/lib/timeline-interaction-adapter.test.ts`

## Not Changed

- ComfyUI integration, queue, AI Results workflow
- Automation hooks
- Render Worker / Daemon
- Fleet Discovery
- Headless Render
- Extension / Plugin architecture
- Existing export validation semantics
