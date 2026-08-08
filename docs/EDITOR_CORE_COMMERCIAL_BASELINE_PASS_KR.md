# Editor Core Commercial Baseline Pass

작성일: 2026-06-19

## 목적

상용 편집기형 기본 사용성을 우선 개선했다. 이번 작업은 새 AI/Automation/Render 기능을 추가하지 않고, 편집 화면의 기본 상태와 직접 조작 편의성을 높이는 데만 집중했다.

## 변경 요약

1. Program Monitor 기본 면적 확대
   - Source Monitor와 Scene Readout을 기본 상시 노출에서 토글 노출로 변경했다.
   - 기본 편집 화면은 Program Monitor 중심으로 보이도록 했다.
   - Source Monitor는 Source 버튼으로 열 수 있고, Source 작업이 활성화되면 자동으로 보인다.
   - Scene Readout은 Info 버튼으로 열 수 있다.

2. Media Bin 카드 정리
   - 반복 노출되던 카드별 Actions 영역을 `...` 더보기 메뉴로 이동했다.
   - Import, Record, Manage만 상단에 남겨 media grid가 더 읽히도록 정리했다.
   - Insert / Overwrite / Source는 카드 hover/focus 시 빠르게 접근하도록 유지했다.

3. Program Monitor overlay 충돌 수정
   - Program Monitor의 diagnostics Info 버튼을 영상 위에서 하단 컨트롤바로 이동했다.
   - crop handle과 diagnostics 버튼이 겹쳐 crop corner가 클릭되지 않던 문제를 제거했다.
   - crop overlay 부모를 0x0 좌표계로 바꿔 전체 박스가 transform 조작을 막지 않도록 했다.
   - 확대된 clip에서 rotate handle이 화면 밖으로 빠지지 않도록 clamp 계산을 수정했다.

4. 테스트 기준 보강
   - transform overlay에 raw motion 값과 화면 렌더 좌표를 분리한 data attribute를 추가했다.
   - crop drag 검증은 절대값이 아니라 드래그 전후 증가량으로 확인하도록 변경했다.
   - Source Monitor 기본 숨김 상태에 맞춰 e2e를 갱신했다.

## 수정 파일

- `src/app/editor/page.tsx`
- `src/electron/renderer/media-bin-panel.tsx`
- `src/electron/renderer/program-composite-preview.tsx`
- `src/electron/renderer/program-transform-crop-overlays.tsx`
- `tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `tests/e2e/editor-media-import-grid.spec.ts`

## 검증

- `npx eslint src/app/editor/page.tsx src/electron/renderer/media-bin-panel.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts tests/e2e/editor-media-import-grid.spec.ts`
- `npx eslint src/electron/renderer/program-composite-preview.tsx src/electron/renderer/program-transform-crop-overlays.tsx tests/e2e/editor-program-monitor-direct-manipulation.spec.ts`
- `npx playwright test tests/e2e/editor-program-monitor-direct-manipulation.spec.ts --project=chromium`
- `npx playwright test tests/e2e/editor-media-import-grid.spec.ts --project=chromium`

## 결과

- Program Monitor 직접 조작 e2e: 10 passed
- Media import grid e2e: 1 passed
- 전체 테스트는 실행하지 않았다. 이번 변경과 직접 연결된 editor interaction / media grid 범위만 확인했다.

## 남은 편집기 기본기 과제

- Crop과 Transform을 상용 편집기처럼 명시적 edit mode로 분리해야 한다.
- Timeline clip move/trim은 존재하지만 상태 피드백과 snap guide를 더 선명하게 해야 한다.
- Media Bin drag/drop은 동작하지만 CapCut식 added state, batch select, bin grouping은 아직 부족하다.
- Inspector는 여전히 기능량이 많아 clip/video/audio/effects 탭 내부의 밀도 정리가 필요하다.
