# Editor Core Crop Corner Interaction Fix

작성일: 2026-06-19

## 범위

Program Monitor에서 crop 조작을 상용 편집기 방식에 가깝게 개선했다.

- 대상: Program Monitor crop overlay
- 목적: edge crop만 가능한 상태에서 corner crop 직접 조작 추가
- 제외: export validation, FFmpeg render semantics, ComfyUI, Automation, Render Worker, Plugin/Extension 변경

## 이전 상태

| 항목 | 상태 |
| --- | --- |
| Crop left/right/top/bottom edge drag | 구현됨 |
| Crop corner drag | 미구현 |
| Transform scale handle와 crop corner 동시 노출 | 충돌 가능 |
| Crop drag 회귀 테스트 | 부족 |

## 수정 내용

| 파일 | 변경 |
| --- | --- |
| `src/lib/editor/crop-mask.ts` | `CropMaskHandle`에 `top-left`, `top-right`, `bottom-left`, `bottom-right` 추가 |
| `src/electron/renderer/program-transform-crop-overlays.tsx` | Program Monitor crop overlay에 네 모서리 crop handle 추가 |
| `src/electron/renderer/program-transform-crop-overlays.tsx` | crop corner를 박스 안쪽으로 배치해 transform scale handle과 hit-test 충돌 제거 |
| `tests/lib/editor-core.test.ts` | corner crop drag가 두 축을 동시에 갱신하는 단위 테스트 추가 |
| `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts` | Program Monitor crop corner direct manipulation E2E 추가 |

## 동작 기준

1. Program Monitor에서 visual clip 선택 시 crop edge와 crop corner가 보인다.
2. crop top-left corner를 오른쪽/아래로 드래그하면 `left`와 `top` crop 값이 함께 증가한다.
3. crop bottom-right corner를 왼쪽/위로 드래그하면 `right`와 `bottom` crop 값이 함께 증가한다.
4. transform scale handle과 crop corner handle이 같은 좌표에서 서로 막지 않는다.
5. 저장은 기존 crop mask effect parameters를 사용한다.

## 검증

실행한 관련 테스트:

```bash
npx vitest run tests/lib/editor-core.test.ts -t "resolves Program Monitor crop handle drags"
npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium
```

결과:

- Program Monitor crop handle 계산 단위 테스트: 통과
- Program Monitor transform direct manipulation: 통과
- Timeline waveform volume direct manipulation: 통과
- Program Monitor crop corner direct manipulation: 통과

## 아키텍처 영향

이번 변경은 editor direct manipulation 계층에만 한정된다.

- ComfyUI integration: 변경 없음
- ComfyUI batch queue: 변경 없음
- AI Results workflow: 변경 없음
- Automation hooks: 변경 없음
- Render Worker / Daemon / Fleet / Headless Render: 변경 없음
- Plugin / Extension system: 변경 없음
- Existing export validation semantics for ComfyUI generation: 변경 없음

