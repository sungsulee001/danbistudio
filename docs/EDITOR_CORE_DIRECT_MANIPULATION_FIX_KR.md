# Editor Core Direct Manipulation Fix

작성일: 2026-06-19

## 범위

편집기 우선 개선 작업 중 Program Monitor 직접 조작 결함만 수정했다.

- 대상: Program Monitor transform overlay
- 기준: CapCut/OpenCut/Filmora식 마우스 직접 조작
- 제외: ComfyUI, Automation, Render Worker, Plugin/Extension, export validation 의미 변경

## 발견된 문제

| 항목 | 상태 | 원인 |
| --- | --- | --- |
| 영상 위치 이동 | 구현됨 | overlay drag commit 정상 |
| 영상 크기 조절 | 결함 | 실제 media layer는 scale되지만 선택 박스가 canvas 크기로 clamp되어 갱신되지 않음 |
| 회전 핸들 | 결함 | rotate handle이 canvas stage overflow에 잘려 hit-test가 Program Monitor frame으로 떨어짐 |
| 스케일/이동 후 회전 | 결함 | 커진 overlay의 rotate handle이 stage overflow 밖으로 나가 클릭 불가 |

## 수정 내용

| 파일 | 변경 |
| --- | --- |
| `src/electron/renderer/program-composite-preview.tsx` | media preview와 selection/transform overlay가 같은 displayed layer 상태를 사용하도록 정리 |
| `src/electron/renderer/program-composite-preview.tsx` | media 내용은 내부 래퍼에서 clip하고, 조작 overlay는 stage 밖 hit-test가 가능하도록 stage overflow 조정 |
| `src/electron/renderer/program-transform-crop-overlays.tsx` | selection box clamp를 motion scale 기준으로 보정 |
| `src/electron/renderer/program-transform-crop-overlays.tsx` | rotate handle 위치를 Program Monitor 안쪽으로 보정 |
| `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts` | scale, move, rotate 직접 조작 Playwright 회귀 테스트 추가 |

## 검증 기준

직접 조작 기준으로 다음을 확인한다.

1. Program Monitor에서 활성 영상 clip 선택 시 transform overlay가 보인다.
2. bottom-right scale handle drag로 overlay 크기가 즉시 커진다.
3. overlay body drag로 위치가 이동한다.
4. rotate handle이 실제 hit-test 대상이다.
5. rotate handle drag로 rotation 값과 overlay transform이 갱신된다.

## 아키텍처 영향

이번 변경은 편집기 UI 직접 조작 레이어에 한정된다.

- ComfyUI integration: 변경 없음
- ComfyUI batch queue: 변경 없음
- AI Results workflow: 변경 없음
- Automation hooks: 변경 없음
- Render Worker / Daemon / Fleet / Headless Render: 변경 없음
- Plugin / Extension system: 변경 없음
- Existing export validation semantics for ComfyUI generation: 변경 없음

