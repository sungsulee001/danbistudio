# Third Party License Decision Log KR

작성일: 2026-06-14
상태: Shotcut/OpenCut/OpenCut Classic 소스 복제와 재사용에 대한 라이선스 판정 기록.

이 문서는 법률 자문이 아니라 Danbi Studio 개발 중 외부 편집기 소스를 잘못 섞지 않기 위한 운영 기록이다.

공식 라이선스 근거 URL과 audit commit은 `docs/THIRD_PARTY_LICENSE_SOURCES_KR.md`를 기준으로 대조한다.

## 1. 공식 라이선스 확인

2026-06-15에 공식 GitHub 저장소 기준으로 다시 확인했다.

- OpenCut 공식 저장소는 MIT license로 표시된다.
- OpenCut Classic 공식 저장소는 MIT license로 표시되고 archived/read-only 상태지만 license 조건은 그대로 보존된다.
- Shotcut 공식 저장소는 GPLv3/GPL-3.0 license로 표시되며 README에도 GPLv3와 COPYING 참조가 명시되어 있다.

| Source | 공식 저장소 | 확인한 라이선스 | Danbi 판정 |
| --- | --- | --- | --- |
| OpenCut | https://github.com/opencut-app/opencut | MIT | 직접 복제 또는 수정 복제 가능. 반입 시 원본 URL, commit, 원본 파일, Danbi 대상 파일, MIT notice를 기록한다. |
| OpenCut Classic | https://github.com/opencut-app/opencut-classic | MIT | 실제 편집기 모듈 반입 1순위. 저장소가 archived/read-only 상태여도 MIT 조건은 유지되므로 notice 보존 조건으로 사용 가능하다. |
| Shotcut | https://github.com/mltframework/shotcut | GPLv3 / GPL-3.0 | Danbi main source 직접 복사 금지. reference only, clean-room reimplementation, external GPL process 중 하나로만 사용한다. |

## 2. 로컬 소스 복제 처리

로컬 분석용 mirror는 아래 위치에 둔다.

```text
third_party/source-mirrors/opencut
third_party/source-mirrors/opencut-classic
third_party/source-mirrors/shotcut
```

이 디렉터리는 `.gitignore`로 제외되어 Danbi repository에 포함되지 않는다. mirror가 존재할 때 `npm run license:check`는 origin URL, 고정 commit, license 파일 핵심 문구를 확인한다.

mirror별 origin, audit commit, license file, 허용 사용 방식, 배포 경계는 `third_party/source-mirrors.lock.json`에도 고정한다. 문서와 lock 파일이 어긋나면 `npm run license:check`가 실패해야 한다.

현재 audit commit:

| Source | Origin | Audit commit | License file |
| --- | --- | --- | --- |
| OpenCut | `https://github.com/opencut-app/opencut.git` | `a5888e2087c125767a394dc7fe5b919ba503ae57` | `LICENSE` |
| OpenCut Classic | `https://github.com/opencut-app/opencut-classic.git` | `cf5e79e919144200294fb9fed22a222592a0aeea` | `LICENSE` |
| Shotcut | `https://github.com/mltframework/shotcut.git` | `9516f143e5c1e432d2088e91d2657c75bf6710e7` | `COPYING` |

## 3. 반입 가능/불가 결정

### OpenCut / OpenCut Classic

허용:

- Direct Copy
- Adapted Copy
- Clean-room
- Reference Only

필수 조건:

- `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`에 반입 entry를 추가한다.
- `third_party/NOTICE.md`에 원본 notice와 Danbi 대상 파일을 기록한다.
- 반입 파일 상단에는 `Adapted from`, source, commit, license, NOTICE/register 경로를 남긴다.
- 반입 후 `npm run license:check`를 통과시킨다.

### Shotcut

허용:

- Reference Only
- Clean-room Reimplementation
- External GPL Process

금지:

- Shotcut 원본 `.cpp`, `.h`, `.qml`, `.js`, `.ts`, `.rs` 파일을 Danbi `src/`, Electron main/preload/renderer/shared, `packages/` 안으로 복사.
- Shotcut 함수/클래스 구현을 이름만 바꿔 붙여넣기.
- `third_party/source-mirrors/shotcut`을 런타임 import, build input, Electron bundle input으로 연결.
- GPL notice/source 제공 정책 없이 Shotcut 파생 코드를 packaged Danbi 앱에 포함.

## 4. 현재 프로젝트 판정

2026-06-14 기준:

- Danbi root package는 `private: true`, `license: "UNLICENSED"`로 유지한다.
- OpenCut Classic에서 반입한 MIT adapted copy는 register와 NOTICE에 기록되어 있다.
- Shotcut source file은 Danbi main source에 직접 반입하지 않았다.
- Shotcut은 multitrack, markers, keyframes, filter/job/proxy 구조를 읽고 Danbi 명세와 테스트로 새로 구현하는 clean-room/reference-only 대상으로만 쓴다.
- Shotcut GPL 코드를 실제 실행 경계에 포함해야 하는 경우에는 Danbi 본체와 분리된 external GPL process 문서, 소스 제공 정책, notice 배포 정책을 먼저 작성한다.
- OpenCut/OpenCut Classic MIT 코드를 추가로 복제하거나 수정 복제할 때는 작업 전 register entry를 만들고, 작업 후 `third_party/NOTICE.md`와 file header를 갱신한다.

## 5. 필수 검증 명령

```bash
npm run license:check
git diff --check
```

기능 구현까지 포함된 작업에서는 아래도 같이 통과시킨다.

```bash
npm test
npx tsc --noEmit --pretty false
npm run lint -- --quiet
```

## 6. 2026-06-15 검증 결과

이번 라이선스 처리 기준으로 아래 항목을 재확인했다.

- `npm run license:check`: 통과.
- `third_party/source-mirrors/`는 `.gitignore`로 제외되어 있고 Git 추적 파일이 없다.
- OpenCut, OpenCut Classic, Shotcut mirror의 `HEAD`가 문서화된 audit commit과 일치한다.
- `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `electron-builder.yml` 경계 검사를 `license:check`에 포함했다.
- Electron 배포 입력은 `dist-electron`, packaged Next standalone renderer, license-safe sample pack으로 제한하고 source mirror 경로는 포함하지 않는다.
- Shotcut GPL 소스는 Danbi main source에 직접 복사하지 않고 reference only, clean-room, external GPL process 중 하나로만 다룬다.
- Danbi runtime source roots(`src/`, `public/`)에 Shotcut/GPL 원본 흔적이 없는지 자동 검사했다.
- OpenCut/OpenCut Classic MIT 반입 파일은 source register, NOTICE, source commit, license header가 있어야 자동 검사를 통과한다.

## 7. FFmpeg/FFprobe binary 배포 결정

2026-06-15 기준:

- Danbi repository와 Electron package input에는 FFmpeg/FFprobe binary를 동봉하지 않는다.
- 현재 FFmpeg/FFprobe는 `FFMPEG_PATH`, `FFPROBE_PATH`, packaged resource 후보, app/cwd `bin`, 시스템 `PATH`에서 발견한 외부 실행 파일을 process 경계로 호출한다.
- `third_party/FFMPEG_BINARY_NOTICE.md`의 현재 상태는 `Bundled status: none`이다.
- 향후 FFmpeg/FFprobe binary를 동봉하려면 `docs/FFMPEG_BINARY_LICENSE_BOUNDARY_KR.md`에 따라 version, checksum, configure line, LGPL/GPL mode, source offer, `--enable-gpl`, `--enable-nonfree` 상태를 먼저 기록한다.
- `--enable-nonfree` FFmpeg build는 Danbi installer/Electron package에 포함하지 않는다.
