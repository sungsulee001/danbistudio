# Shotcut GPL Boundary KR

작성일: 2026-06-14  
상태: Danbi Studio 본체와 Shotcut GPLv3 소스의 경계 결정 문서.

이 문서는 법률 자문이 아니라 개발 중 GPL 코드를 잘못 섞는 실수를 막기 위한 프로젝트 운영 기준이다.

## 1. 현재 결정

Danbi Studio 본체는 현재 Shotcut 소스 코드를 직접 포함하지 않는다. Shotcut은 GPLv3이므로, Danbi가 전체 앱을 GPL 호환 배포로 전환하지 않는 한 Shotcut 원본 파일이나 원본 구현을 `src/`, Electron main/preload/renderer/shared, `packages/` 같은 본체 코드에 넣지 않는다.

허용되는 방식은 다음 세 가지뿐이다.

| 방식 | 허용 범위 | 본체 포함 여부 |
| --- | --- | --- |
| Reference Only | Shotcut의 기능 목록, 모듈 책임, UX 흐름, MLT/FFmpeg 운용 방식을 읽고 Danbi 설계 문서에 반영 | 소스 코드 포함 금지 |
| Clean-room Reimplementation | Shotcut 코드를 붙여넣지 않고 Danbi 타입, 테스트, 동작 명세 기준으로 새로 구현 | 새로 작성한 Danbi 코드만 포함 |
| External GPL Process | Shotcut/MLT 기반 코드를 별도 실행 파일, 별도 패키지, 별도 GPL 배포 경계로 둠 | 본체에는 IPC/CLI 프로토콜만 포함 |

## 2. 로컬 mirror의 지위

Shotcut mirror 위치:

```text
third_party/source-mirrors/shotcut
```

이 디렉터리는 로컬 분석과 clean-room 명세 작성을 위한 source mirror다. `.gitignore`에 의해 Danbi repository 추적 대상에서 제외된다. 앱 빌드, 테스트, TypeScript compile, Electron bundle, 배포 산출물은 이 디렉터리를 참조하거나 포함하면 안 된다.

## 3. 직접 복사 금지

다음 작업은 금지한다.

- Shotcut `.cpp`, `.h`, `.qml`, `.js`, `.ts`, `.rs` 원본을 Danbi main source로 복사.
- Shotcut 함수나 클래스 구현을 이름만 바꿔 붙여넣기.
- GPL header, `GNU General Public License`, `Mlt::`, Shotcut QML namespace 같은 원본 흔적이 있는 파일을 본체 코드에 추가.
- `third_party/source-mirrors/shotcut`을 런타임 import, require, dynamic import, build input으로 연결.
- Shotcut 원본 UI 문구, preset, filter metadata를 라이선스 검토 없이 그대로 가져오기.

## 4. Clean-room 절차

Shotcut 기능을 Danbi에 구현하려면 다음 순서를 지킨다.

1. Shotcut 코드를 복사하지 않고 기능 요구사항을 Danbi 문서에 한국어 명세로 작성한다.
2. 명세에는 observable behavior, 입력/출력, 예외 상황, 필요한 테스트만 적고 원본 코드 조각은 넣지 않는다.
3. Danbi 구현 파일은 Danbi 타입과 기존 테스트 기준으로 새로 작성한다.
4. `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`에는 Import mode를 `Clean-room` 또는 `Reference Only`로 기록한다.
5. `npm run license:check`를 통과시킨다.

Clean-room으로 작성한 Danbi 코드는 MIT 반입 코드가 아니므로 `third_party/NOTICE.md`에 Shotcut MIT notice처럼 등록하지 않는다. 대신 source register와 구현 문서에 “Shotcut reference only, no source copied”를 남긴다.

## 5. External GPL Process 절차

Shotcut 또는 Shotcut GPL 파생 코드를 실제로 실행 경계 안에 넣어야 한다면, 본체에 섞지 않고 별도 GPL process로 분리한다.

필수 조건:

- 별도 디렉터리, 별도 package, 별도 license notice.
- GPL 소스 제공 정책과 배포 산출물 문서화.
- Danbi 본체와는 CLI, IPC, HTTP 같은 프로세스 경계로만 통신.
- 본체 repository의 `src/` 또는 Electron renderer bundle에 GPL source file을 포함하지 않음.
- 사용자가 설치하거나 교체할 수 있는 외부 도구 형태를 우선 검토.

이 방식을 선택하기 전에는 `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`에 별도 entry를 만들고, 배포 방식과 source 제공 방식을 먼저 결정한다.

## 6. 검사 기준

`npm run license:check`는 다음을 검사한다.

- `third_party/source-mirrors/shotcut`이 Git 추적 대상이 아닌지.
- Danbi main source에 `Shotcut`, `mltframework/shotcut`, `GNU General Public License`, `Mlt::`, Shotcut QML namespace, source mirror runtime reference가 없는지.
- source register에 Shotcut이 `Direct Copy`, `Adapted Copy`, `Submodule/Package`로 등록되지 않았는지.
- 이 문서와 license compliance 문서가 존재하고 서로 연결되어 있는지.

## 7. 현재 판정

2026-06-14 기준:

- Shotcut mirror는 로컬에 복제되어 있다.
- Shotcut 코드는 Danbi main source에 직접 복사하지 않는다.
- Shotcut은 multitrack model, marker model, keyframe model, filter attachment, render/job queue, proxy/transcode 구조를 Reference Only 또는 Clean-room 기준으로만 참고한다.
- OpenCut/OpenCut Classic MIT 코드는 별도 source register와 NOTICE를 남기는 조건에서만 복제 또는 수정 복제한다.
