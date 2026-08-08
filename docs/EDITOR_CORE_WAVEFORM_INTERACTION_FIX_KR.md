# Editor Core Waveform Interaction Fix

작성일: 2026-06-19

## 범위

이 문서는 편집기 코어 우선 개선 중 timeline waveform 직접 조작 개선 내용을 기록한다.

- 대상: audio timeline clip waveform
- 목적: 표시 전용 waveform을 마우스로 조작 가능한 편집 요소로 개선
- 제외: ComfyUI, Automation, Render Worker, Plugin/Extension, export validation 의미 변경

## 이전 상태

| 항목 | 상태 |
| --- | --- |
| waveform 표시 | 구현됨 |
| waveform 위 volume envelope 표시 | 부분 구현 |
| waveform/volume line 마우스 직접 조작 | 미구현 |
| clip 이동/trim/keyframe 시간 드래그 | 기존 구현 유지 |

## 수정 내용

| 파일 | 변경 |
| --- | --- |
| `src/electron/renderer/timeline-clip-button.tsx` | waveform 위에 직접 드래그 가능한 volume line 추가 |
| `src/electron/renderer/timeline-clip-button.tsx` | drag 중 로컬 preview로 line 위치 갱신, pointer up에서 commit |
| `src/electron/renderer/timeline-clip-list.tsx` | clip volume drag callback 전달 |
| `src/app/editor/page.tsx` | 기존 `updateClip(..., { volume })` 경로로 timeline volume commit |
| `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts` | waveform volume direct manipulation 회귀 테스트 추가 |

## 동작 기준

1. 오디오 clip waveform 위에 `Timeline volume {clipName}` slider line이 보인다.
2. line을 위로 드래그하면 clip volume이 증가한다.
3. line을 아래로 드래그하면 clip volume이 감소한다.
4. waveform 전체가 clip move 영역을 빼앗지 않도록 얇은 line만 pointer를 받는다.
5. 저장은 기존 `clip.volume` 필드와 `updateClip` 로직을 사용한다.

## 검증

실행한 관련 테스트:

```bash
npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium
```

결과:

- Program Monitor transform direct manipulation: 통과
- Timeline waveform volume direct manipulation: 통과

## 아키텍처 영향

이번 변경은 timeline editor interaction에만 한정된다.

- ComfyUI integration: 변경 없음
- ComfyUI batch queue: 변경 없음
- AI Results workflow: 변경 없음
- Automation hooks: 변경 없음
- Render Worker / Daemon / Fleet / Headless Render: 변경 없음
- Plugin / Extension system: 변경 없음
- Existing export validation semantics for ComfyUI generation: 변경 없음

