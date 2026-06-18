# Source Reuse Intake Checklist KR

작성일: 2026-06-15  
상태: OpenCut, OpenCut Classic, Shotcut, FFmpeg/MLT 계열 외부 소스를 Danbi Studio에 반입하기 전 적용하는 작업 체크리스트.

## 1. 원칙

외부 소스는 기능 구현보다 먼저 라이선스와 배포 경계를 판정한다. 로컬 mirror가 있어도 Danbi runtime source에 바로 복사하지 않는다.

기준 파일:

- `third_party/source-mirrors.lock.json`
- `docs/THIRD_PARTY_LICENSE_SOURCES_KR.md`
- `docs/THIRD_PARTY_LICENSE_COMPLIANCE_KR.md`
- `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`
- `third_party/NOTICE.md`

## 2. Source별 즉시 판정

| Source | License | 허용 방식 | 금지/주의 |
| --- | --- | --- | --- |
| OpenCut | MIT | Direct Copy, Adapted Copy, Reference Only, Clean-room Reimplementation | 반입 시 source register와 MIT notice 누락 금지 |
| OpenCut Classic | MIT | Direct Copy, Adapted Copy, Reference Only, Clean-room Reimplementation | 실제 편집기 모듈 반입 1순위지만 기록 없이 복사 금지 |
| Shotcut | GPLv3 | Reference Only, Clean-room Reimplementation, External GPL Process | Danbi main source로 Direct Copy 또는 Adapted Copy 금지 |

## 3. MIT 코드 반입 절차

OpenCut 또는 OpenCut Classic 코드를 직접 복제하거나 Danbi 구조에 맞춰 수정 복제할 때는 아래 순서를 지킨다.

1. `third_party/source-mirrors.lock.json`의 source, origin URL, audit commit, license file을 확인한다.
2. `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`에 ID, 원본 파일, Danbi 대상 파일, Import mode, 수정 내용, 테스트 계획을 먼저 기록한다.
3. 실제 구현을 품은 Direct Copy 또는 Adapted Copy 파일 상단에 `Adapted from`, source, commit, `License: MIT`, `third_party/NOTICE.md`, source register 경로를 남긴다.
4. `third_party/NOTICE.md`에 원본 MIT notice와 반입 파일 목록을 갱신한다.
5. 관련 unit/e2e test, `git diff --check`, `npm run license:check`를 통과시킨다.

단순 호출/통합 파일은 NOTICE/register에 연결 파일로 기록할 수 있지만, 외부 구현이 없는 파일을 adapted-source처럼 과표시하지 않는다.

## 4. Shotcut GPLv3 처리 절차

Shotcut은 오픈소스지만 GPLv3이므로 Danbi 본체에 직접 복사하지 않는다.

허용:

- Reference Only: 기능 목록, 모듈 책임, 입력/출력, UX 흐름만 문서화한다.
- Clean-room Reimplementation: Shotcut 코드를 붙여 넣지 않고 Danbi 타입, 테스트, 동작 명세 기준으로 새로 작성한다.
- External GPL Process: 별도 실행 파일, 별도 패키지, 별도 GPL source 제공 정책을 문서화한 뒤 본체와 IPC/CLI 경계로만 연결한다.

금지:

- Shotcut `.cpp`, `.h`, `.qml`, `.js`, `.ts`, `.rs` 원본 파일을 `src/`, `public/`, Electron main/preload/renderer/shared에 복사.
- 함수명과 타입명만 바꾼 Shotcut 구현 붙여넣기.
- `third_party/source-mirrors/shotcut`을 runtime import, build input, package input으로 연결.
- GPL notice와 source 제공 정책 없이 Shotcut 파생 코드를 packaged Danbi 앱에 포함.

## 5. FFmpeg/MLT 계열

현재 Danbi는 FFmpeg/FFprobe binary를 repository나 Electron package input에 동봉하지 않고 외부 process로 호출한다. binary를 동봉하거나 MLT/Frei0r 같은 native dependency를 포함하려면 먼저 별도 license boundary 문서를 갱신한다.

필수 확인:

- version
- checksum
- configure line
- LGPL/GPL mode
- `--enable-gpl`
- `--enable-nonfree`
- source offer 또는 재배포 경로

## 6. 완료 조건

외부 소스 관련 작업은 아래가 모두 끝나야 완료로 본다.

- source register 기록 존재.
- NOTICE 또는 GPL boundary 기록 존재.
- source mirror는 Git 추적 대상이 아님.
- Danbi runtime source가 source mirror를 직접 참조하지 않음.
- Shotcut/GPL 원본 흔적이 Danbi runtime source에 없음.
- `npm run license:check` 통과.
- `git diff --check` 통과.
