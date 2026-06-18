# Marker Interchange KR

작성일: 2026-06-15
상태: Timeline marker CSV / YouTube chapter 교환 기능 기록.

## 목적

마커는 편집 검수, 챕터 구성, 렌더 범위 확인, 협업 메모에 쓰이는 기본 편집 데이터다. Danbi Studio가 로컬 편집기로서 닫힌 프로젝트 파일에만 의존하지 않도록, 타임라인 마커를 CSV와 YouTube chapter 텍스트로 내보내고 다시 가져올 수 있게 했다.

이 작업은 완성품 정의서의 `프로젝트 저장과 호환성`, `타임라인 기본 편집`, `마커/In-Out/검수 workflow` 요구에 매핑된다.

## 구현 위치

- Core module: `src/lib/editor/marker-interchange.ts`
- API route: `src/app/api/editor/markers/route.ts`
- Renderer client: `src/electron/renderer/interchange-client.ts`
- Export UI: `src/electron/renderer/export-delivery-settings-panel.tsx`
- Editor wiring: `src/app/editor/page.tsx`
- Tests:
  - `tests/lib/editor-core.test.ts`
  - `tests/api/editor-markers.test.ts`

## 지원 범위

- CSV export/import
  - columns: `timecode,seconds,label,kind,color,duration,note`
  - quoted CSV cell 처리
  - `chapter`, `beat`, `warning`, `todo` marker kind 보존
  - 색상 hex 보존
  - marker duration과 note/comment 보존
- YouTube chapters export/import
  - `0:00 Intro`, `1:15 Demo`, `1:02:03 Long section` 형태 지원
  - export 시 `chapter` marker만 chapter 텍스트로 출력
  - non-chapter marker는 warning으로 보고
- Export range
  - 전체 타임라인 또는 marked In/Out range 기준 export
  - range export 시 marker 시간이 range 시작점 기준 0초로 rebase됨
- Import apply
  - 현재 프로젝트에 merge
  - 기존 marker를 삭제하지 않음
  - 같은 time/label/kind marker는 duplicate로 건너뜀
  - undo 가능한 단일 프로젝트 편집으로 반영
- Marker edit
  - Marker 패널에서 label, time, duration, kind, color, note를 편집
  - duration이 있는 marker는 timeline ruler에서 range bar로 표시
- Render chapter metadata
  - `chapter` marker는 FFmpeg render plan의 `.ffmetadata` sidecar로 변환
  - marker duration이 있으면 chapter `END` 시간을 duration 기준으로 계산
  - direct render와 queued render는 실행 전에 sidecar 파일을 쓰고 `-map_chapters`로 결과 파일에 연결
  - marked range export에서는 range 안의 chapter marker만 포함하고 range 시작점 기준으로 시간을 rebase

## 의도적으로 제외한 범위

- Adobe Premiere/FCPXML/Resolve marker XML
- color name palette 변환
- YouTube chapter 최소 개수/최소 길이 정책 강제
- 플레이어별 chapter 표시 UI 검증

이 범위는 이후 FCPXML 또는 자체 `.danbi-project` package 확장 단계에서 다룬다.

## 검증 기준

현재 테스트는 다음을 검증한다.

- 기본 프로젝트 marker를 CSV로 export할 수 있다.
- CSV export/import가 marker duration과 note를 보존한다.
- chapter marker만 YouTube chapter text로 export하고, non-chapter marker는 warning 처리한다.
- CSV와 chapter text를 다시 parse할 수 있다.
- 가져온 marker를 현재 프로젝트에 merge하면서 중복을 건너뛴다.
- `/api/editor/markers` export/import가 성공/실패 응답을 반환한다.
- renderer client가 marker 파일 다운로드와 import 요청을 `/api/editor/markers`로 보낸다.
- FFmpeg render plan이 chapter marker를 `.ffmetadata` 입력으로 포함한다.
- render engine/queue가 실행 전에 chapter metadata sidecar 파일을 쓴다.

## 다음 확장

- FCPXML marker native template 호환성 조사
- marker list bulk import preview UI
- YouTube chapter 검증 report
- 렌더 결과 파일의 chapter metadata를 `ffprobe`로 검사하는 smoke test
