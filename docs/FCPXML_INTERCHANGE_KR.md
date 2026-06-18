# FCPXML Interchange KR

작성일: 2026-06-15
상태: FCPXML 기반 1차 컷 편집 interchange 기능 기록.

## 목적

Danbi Studio가 자체 프로젝트 JSON 안에만 갇히지 않고 Final Cut Pro 계열 XML 교환 흐름과 연결될 수 있도록 FCPXML export/import를 추가했다.

이번 범위는 완성형 편집기의 기본기인 "타임라인 컷 교환"이다. 효과 전체 호환보다 먼저 영상/오디오 asset clip, track/lane, source in, timeline offset, duration, marker를 안정적으로 왕복시키는 것을 목표로 한다.

## 구현 위치

- Core module: `src/lib/editor/fcpxml.ts`
- API route: `src/app/api/editor/fcpxml/route.ts`
- Renderer client: `src/electron/renderer/interchange-client.ts`
- Export UI: `src/electron/renderer/export-delivery-settings-panel.tsx`
- Editor wiring: `src/app/editor/page.tsx`
- Tests:
  - `tests/lib/editor-core.test.ts`
  - `tests/api/editor-fcpxml.test.ts`

## 지원 범위

- FCPXML `fcpxml`, `resources`, `format`, `asset`, `library/event/project/sequence/spine`, `asset-clip`, `marker` subset 생성
- Danbi project FPS, width, height를 FCPXML `format` resource로 출력
- video/audio/image/ai media asset clip export
- text/title clip을 FCPXML `title` element로 export/import
- title text와 line breaks, 기본 font size/color/background/shadow/position/align style을 `data-danbi-*` metadata로 보존
- crossfade/dip/push/wipe `transitionOut`을 `data-danbi-transition-out-*` metadata로 export/import
- import된 전환 메타데이터는 Danbi timeline transition으로 복원되어 겹침 구간이 있는 경우 FFmpeg `xfade` 렌더 경로에 다시 연결된다
- timeline offset, source start, duration 보존
- export range를 기준으로 timeline time을 0초부터 rebase
- track id, clip id, asset id, marker id, marker kind/color를 `data-danbi-*` attribute로 보존
- marker duration과 note를 FCPXML `marker` duration 및 `data-danbi-marker-*` metadata로 보존
- FCPXML import 시 asset, track, clip, marker를 Danbi project JSON으로 재구성
- import 결과는 shared project JSON validator를 통과해야 한다
- Export 패널에서 FCPXML 다운로드와 파일 import 실행

## 의도적으로 제외한 범위

FCPXML은 효과와 generator 표현이 넓고 NLE마다 해석 차이가 크다. 이번 단계에서는 다음 항목을 "컷 교환 경고"로 처리한다.

- FCPXML title template/generator effect의 NLE별 완전 변환
- clip effect stack
- keyframe
- FCPXML native transition template/effect의 NLE별 완전 변환
- match-cut, ai-morph 같은 생성형/분석형 Danbi 전환
- speed ramp
- reverse playback semantics
- caption burn-in/style metadata
- ComfyUI automation metadata

이 정보까지 완전 보존해야 하는 경우에는 `.danbi-project.json` 패키지를 사용한다. 이후 FCPXML generator/title/effect mapping은 별도 단계에서 확장한다.

## 검증 기준

현재 테스트는 다음을 검증한다.

- 기본 Danbi project를 FCPXML로 export할 수 있다.
- export한 XML을 다시 parse할 수 있다.
- parse/import한 project가 media asset, video/audio track, sourceIn/start/duration, marker를 가진다.
- FCPXML marker duration/note가 export/import 후 project JSON에 보존된다.
- crossfade/dip/push/wipe 전환 메타데이터가 export/import 후 project JSON에 보존된다.
- title shadow/background style metadata가 export/import 후 title style effect에 보존된다.
- multi-line title text가 `data-danbi-text`와 title text body를 통해 export/import 후 보존된다.
- import된 겹침 전환 timeline이 FFmpeg render plan에서 `xfade` 필터로 연결된다.
- import project가 project JSON validator를 통과한다.
- marked/export range에서 source start와 duration이 올바르게 rebase된다.
- `/api/editor/fcpxml` export/import가 성공/실패 응답을 반환한다.
- renderer client가 FCPXML 다운로드와 import 요청을 `/api/editor/fcpxml`로 보낸다.

## 다음 확장

- FCPXML title template/generator effect 호환성 확대
- FCPXML native transition template 호환성 확대
- match-cut/ai-morph 전환은 generated media 또는 Danbi project package 경로로 보존
- FCPXML marker native template 호환성 확대
- Resolve/Premiere XML 호환성 샘플 추가
- FCPXML import 후 media relink 안내 UI 강화
