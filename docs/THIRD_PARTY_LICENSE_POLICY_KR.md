# Third Party License Policy KR

작성일: 2026-06-15
상태: OpenCut, OpenCut Classic, Shotcut 소스 사용에 대한 현재 운영 규칙.

이 문서는 법률 자문이 아니라 Danbi Studio 개발 중 오픈소스 코드를 잘못 섞지 않기 위한 프로젝트 규칙이다.

공식 라이선스 근거와 확인 URL은 `docs/THIRD_PARTY_LICENSE_SOURCES_KR.md`에 별도로 기록한다.
FFmpeg/FFprobe binary 동봉 여부와 LGPL/GPL/source-offer 의무는 `docs/FFMPEG_BINARY_LICENSE_BOUNDARY_KR.md`와 `third_party/FFMPEG_BINARY_NOTICE.md`를 따른다.

## 1. 현재 확인한 라이선스

2026-06-15 기준 공식 GitHub 저장소 표기를 다시 확인했다.

| Source | Official repository | License | Danbi decision |
| --- | --- | --- | --- |
| OpenCut | https://github.com/opencut-app/opencut | MIT | 복제, 수정 복제, 구조 참고 가능. 단, 원본 URL, commit, 원본 파일, Danbi 대상 파일, MIT notice를 기록한다. |
| OpenCut Classic | https://github.com/opencut-app/opencut-classic | MIT | 실제 편집기 모듈 재사용 1순위. OpenCut과 같은 notice/register 조건을 따른다. |
| Shotcut | https://github.com/mltframework/shotcut | GPLv3 / GPL-3.0 | Danbi main source에는 직접 복사하지 않는다. Reference Only, Clean-room Reimplementation, External GPL Process 중 하나로만 사용한다. |

## 2. 로컬 미러 규칙

외부 저장소는 다음 위치에만 둔다.

```text
third_party/source-mirrors/opencut
third_party/source-mirrors/opencut-classic
third_party/source-mirrors/shotcut
```

`third_party/source-mirrors/`는 `.gitignore`에 의해 Danbi repository 추적 대상에서 제외된다. 이 위치는 분석과 라이선스 확인용 로컬 미러이며, Electron bundle, Next build, TypeScript compile, Vitest, Playwright runtime, package script 입력으로 연결하지 않는다.

로컬 미러의 license lock은 `third_party/source-mirrors.lock.json`이다. 이 파일은 Git에 추적하며 origin URL, audit commit, license file, allowed use, distribution boundary를 고정한다. 실제 source mirror clone은 계속 Git에 추적하지 않는다.

현재 pinned audit commit:

| Source | Origin | Commit | License file |
| --- | --- | --- | --- |
| OpenCut | `https://github.com/opencut-app/opencut.git` | `a5888e2087c125767a394dc7fe5b919ba503ae57` | `LICENSE` |
| OpenCut Classic | `https://github.com/opencut-app/opencut-classic.git` | `cf5e79e919144200294fb9fed22a222592a0aeea` | `LICENSE` |
| Shotcut | `https://github.com/mltframework/shotcut.git` | `9516f143e5c1e432d2088e91d2657c75bf6710e7` | `COPYING` |

## 3. OpenCut MIT 코드 반입 규칙

OpenCut 또는 OpenCut Classic 코드를 Danbi에 직접 복사하거나 수정 복제할 때는 다음을 반드시 처리한다.

1. `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`에 source URL, commit, original files, imported files, import mode, 수정 내용, 테스트를 기록한다.
2. `third_party/NOTICE.md`에 원본 MIT notice와 대상 Danbi 파일을 기록한다.
3. 반입 파일 상단에 `Adapted from`, source, commit, `License: MIT`, `third_party/NOTICE.md`, source register 경로를 남긴다.
4. `npm run license:check`를 통과시킨다.

## 4. Shotcut GPLv3 처리 규칙

Shotcut 코드는 GPLv3이므로 Danbi 본체를 GPL 호환 배포로 전환하지 않는 한 main source에 직접 복사하지 않는다.

허용:

- Reference Only: 기능 목록, UX 흐름, 모듈 책임, 동작 요구사항만 읽고 Danbi 문서와 자체 구현으로 옮긴다.
- Clean-room Reimplementation: Shotcut 코드를 붙여 넣지 않고 관찰 가능한 동작, 입력/출력, 예외 조건, 테스트만 기준으로 새로 구현한다.
- External GPL Process: 별도 실행 파일, 별도 package, 별도 GPL notice/source 제공 정책을 갖춘 경계에서만 사용한다.

금지:

- Shotcut `.cpp`, `.h`, `.qml`, `.js`, `.ts`, `.rs` 파일을 Danbi `src/`, Electron main/preload/renderer/shared, `public/`에 복사.
- 함수명만 바꾼 Shotcut 구현 붙여넣기.
- `third_party/source-mirrors/shotcut`을 runtime import, build input, Electron bundle input, static public asset으로 연결.
- GPL notice/source 제공 정책 없이 Shotcut 파생 코드를 packaged Danbi 앱에 포함.

Shotcut 경계 세부 규칙은 `docs/SHOTCUT_GPL_BOUNDARY_KR.md`를 우선한다.

## 5. 자동 검증

다음 명령은 외부 소스 경계를 강제한다.

```bash
npm run license:check
```

현재 검사 항목:

- root package는 `private: true`, `license: "UNLICENSED"` 상태를 유지한다.
- `third_party/source-mirrors.lock.json`의 스키마, 허용 사용 방식, GPL 금지 조건을 확인한다.
- `third_party/source-mirrors/`는 Git 추적, `.gitmodules`, package script, TypeScript/Vitest 입력에서 제외된다.
- `third_party/source-mirrors/`는 ESLint 입력과 Electron packaging 입력에서도 제외된다.
- `electron-builder.yml`은 `dist-electron`, packaged Next standalone renderer, license-safe sample pack만 포함하며 source mirror 경로를 포함하지 않는다.
- OpenCut, OpenCut Classic, Shotcut 미러가 존재하면 origin URL, pinned commit, license file marker를 확인한다.
- OpenCut MIT 반입 파일은 source header, NOTICE, source register를 가져야 한다.
- Danbi runtime source roots인 `src/`, `public/`에서 Shotcut/GPL 원본 흔적과 source mirror runtime reference를 차단한다.

## 6. 현재 판정

- OpenCut와 OpenCut Classic은 라이선스 규정에 따라 로컬 미러와 notice/register 기반으로 사용할 수 있다.
- Shotcut은 로컬 미러를 보관하지만 Danbi runtime source에는 복사하지 않는다.
- FFmpeg/FFprobe binary는 현재 동봉하지 않으며 외부 process 경계로 호출한다. 동봉 전에는 `third_party/FFMPEG_BINARY_NOTICE.md`를 먼저 갱신한다.
- 새 기능 구현 중 외부 코드를 가져오려면 구현 전에 register entry와 NOTICE 필요 여부를 먼저 정한다.
- 이번 기준은 `npm run license:check`로 검증했고, 현재 통과 상태다.
