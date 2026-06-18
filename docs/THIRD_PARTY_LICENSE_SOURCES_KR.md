# Third Party License Sources KR

작성일: 2026-06-15  
상태: OpenCut, OpenCut Classic, Shotcut 라이선스 공식 근거 기록.

이 문서는 법률 자문이 아니라 Danbi Studio 개발 중 외부 편집기 소스의 사용 범위를 결정하기 위한 근거 기록이다. 실제 배포 전에는 최종 배포 형태, 포함 binary, FFmpeg build option, 외부 asset까지 다시 감사한다.

## 1. 2026-06-15 공식 확인 결과

| Source | 공식 근거 | 확인한 라이선스 | Danbi 처리 |
| --- | --- | --- | --- |
| OpenCut | https://github.com/opencut-app/opencut, https://github.com/opencut-app/opencut/blob/main/LICENSE | MIT | 직접 복제, 수정 복제, 구조 참고 가능. 반입 시 source register와 MIT notice 보존 필수. |
| OpenCut Classic | https://github.com/opencut-app/opencut-classic, https://github.com/opencut-app/opencut-classic/blob/main/LICENSE | MIT | 실제 편집기 모듈 재사용 1순위. archived/read-only 여부와 무관하게 MIT notice 조건을 지킨다. |
| Shotcut | https://github.com/mltframework/shotcut, https://github.com/mltframework/shotcut/blob/master/COPYING | GPLv3 / GPL-3.0 | Danbi main source 직접 복사 금지. Reference Only, Clean-room Reimplementation, External GPL Process 중 하나로만 사용한다. |

## 2. 소스 복제 위치와 배포 경계

로컬 분석용 mirror는 아래 위치에만 둔다.

```text
third_party/source-mirrors/opencut
third_party/source-mirrors/opencut-classic
third_party/source-mirrors/shotcut
```

이 mirror는 Danbi repository에 추적하지 않는다. Electron bundle, Next build, TypeScript compile, Vitest, Playwright, package script, runtime import, 정적 `public/` asset으로 연결하지 않는다.

## 3. 현재 audit commit

현재 source mirror lock 파일은 `third_party/source-mirrors.lock.json`이다. 이 파일은 아래 표의 origin, audit commit, license file, 허용 사용 방식, 배포 경계를 기계가 읽을 수 있게 고정한다.

| Source | Origin | Audit commit | License file |
| --- | --- | --- | --- |
| OpenCut | `https://github.com/opencut-app/opencut.git` | `a5888e2087c125767a394dc7fe5b919ba503ae57` | `LICENSE` |
| OpenCut Classic | `https://github.com/opencut-app/opencut-classic.git` | `cf5e79e919144200294fb9fed22a222592a0aeea` | `LICENSE` |
| Shotcut | `https://github.com/mltframework/shotcut.git` | `9516f143e5c1e432d2088e91d2657c75bf6710e7` | `COPYING` |

## 4. 적용 규칙

- OpenCut/OpenCut Classic MIT 코드는 가져올 수 있지만, `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`와 `third_party/NOTICE.md`를 먼저 또는 동시에 갱신한다.
- MIT adapted source 파일에는 `Adapted from`, source URL, commit, `License: MIT`, `third_party/NOTICE.md`, source register 경로를 남긴다.
- Shotcut GPLv3 코드는 본체 source에 복사하지 않는다.
- Shotcut 기능을 구현할 때는 관찰 가능한 동작, 입력/출력, 테스트만 Danbi 명세로 옮기고 코드는 새로 작성한다.
- Shotcut/MLT 기반 코드를 실제로 포함해야 하면 별도 GPL process/plugin/submodule 경계를 먼저 문서화하고, GPL notice와 source 제공 방식을 결정한다.

## 5. 자동 검사

아래 명령이 이 문서와 다른 라이선스 경계 문서를 함께 검사한다.

```bash
npm run license:check
```
