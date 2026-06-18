# EDL Interchange KR

작성일: 2026-06-15
상태: CMX 3600 EDL 기반 1차 interchange 기능 기록.

## 목적

Danbi Studio는 프로젝트 저장 포맷만 닫힌 구조로 유지하지 않고, 다른 편집기나 후반 작업 도구로 컷 리스트를 넘길 수 있어야 한다. 1차 범위로 CMX 3600 EDL export/import core를 추가했다.

이 작업은 완성품 정의서의 "OpenCut/MLT/EDL/FCPXML/AAF 중 최소 1개 이상의 interchange format 도입" 항목을 실제 코드로 연결한다.

## 구현 위치

- Core module: `src/lib/editor/edl.ts`
- Core test: `tests/lib/editor-core.test.ts`

## 지원 범위

- CMX 3600 EDL non-drop frame 형식 생성
- `TITLE`, `FCM: NON-DROP FRAME`, `DANBI FPS` metadata 출력
- video/image/ai clip은 video event(`V`)로 export
- audio clip은 audio event(`A`)로 export
- timeline export range를 EDL record time 0부터 재기준화
- sourceIn/sourceOut, recordIn/recordOut timecode 계산
- clip name, asset name, source path, Danbi clip id, track id를 comment로 보존
- EDL text parse 후 event list 복구
- EDL import 시 offline placeholder asset과 video/audio track을 가진 Danbi project 생성
- import project는 기존 project JSON validator를 통과해야 한다

## 의도적으로 제외한 범위

CMX 3600 EDL은 효과 전체를 담는 포맷이 아니다. 다음 정보는 export 시 warning으로 남기고 컷 리스트에는 넣지 않는다.

- text/effect clip
- clip effect stack
- keyframe
- transition
- speed ramp
- reverse playback semantics
- caption, marker, automation metadata

이 정보까지 교환하려면 FCPXML 또는 자체 Danbi package format을 사용해야 한다.

## 검증 기준

현재 테스트는 다음을 증명한다.

- 기본 Danbi project를 CMX 3600 EDL로 export할 수 있다.
- export된 EDL을 다시 parse할 수 있다.
- parse/import한 project가 video/audio track, offline media placeholder, sourceIn/start/duration을 가진다.
- import된 project가 shared project JSON validator를 통과한다.
- marked/export range에 해당하는 EDL은 record timecode를 0초부터 시작한다.
- 0초 길이 export range는 거부한다.

## 다음 확장

- UI export/import 버튼 연결
- EDL import 후 relink workflow 자동 안내
- reel name 사용자 지정
- drop-frame timecode 표시 옵션
- FCPXML export/import 연구
- EDL 이벤트와 project package media manifest 연결
