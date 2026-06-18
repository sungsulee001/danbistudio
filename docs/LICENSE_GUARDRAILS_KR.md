# License Guardrails KR

작성일: 2026-06-14  
갱신일: 2026-06-15  
상태: Danbi Studio 외부 소스 반입 가드레일.

이 문서는 OpenCut, OpenCut Classic, Shotcut 같은 외부 편집기 소스를 사용할 때 Danbi Studio가 지켜야 할 실무 규칙이다. 법률 자문이 아니라 개발 중 실수를 막기 위한 프로젝트 운영 기준이다.

공식 라이선스 근거와 확인 URL은 [Third Party License Sources KR](./THIRD_PARTY_LICENSE_SOURCES_KR.md)를 기준으로 한다.

## 1. 현재 결론

- OpenCut / OpenCut Classic: MIT. Danbi 구조에 맞게 직접 복제 또는 수정 복제 가능. 단, 원본 URL, commit, 원본 파일, 수정 내용, NOTICE 보존이 필요하다.
- Shotcut: GPLv3. Danbi runtime source(`src/`, Electron main/preload/renderer/shared, 정적 런타임 `public/`)에 직접 복사하지 않는다.
- Danbi Studio 본체: 아직 공개 배포 라이선스를 정하지 않았으므로 root package는 `private: true`, `license: "UNLICENSED"`로 유지한다.
- Shotcut은 구조, 기능, UX, MLT/FFmpeg 운용 방식만 참고한다.
- Shotcut 코드를 실제로 포함하려면 별도 GPL 배포 경계, GPL 호환 배포 전환, 또는 clean-room 재구현 중 하나를 먼저 문서로 결정한다.
- Shotcut 세부 경계는 [Shotcut GPL Boundary KR](./SHOTCUT_GPL_BOUNDARY_KR.md)를 따른다.
- FFmpeg/FFprobe binary 동봉 여부와 LGPL/GPL/source-offer 의무는 [FFmpeg Binary License Boundary KR](./FFMPEG_BINARY_LICENSE_BOUNDARY_KR.md)를 따른다.
- 2026-06-15 재확인 기준: OpenCut/OpenCut Classic은 MIT, Shotcut은 GPLv3/GPL-3.0로 처리한다.
- `third_party/source-mirrors.lock.json`을 라이선스 lock 파일로 둔다. 외부 mirror의 origin, audit commit, license file, 허용 사용 방식, 배포 경계는 이 파일과 문서가 동시에 맞아야 한다.

## 2. 허용되는 반입 방식

| 방식 | 허용 대상 | 조건 |
| --- | --- | --- |
| Direct Copy | MIT 계열 파일 | register entry, NOTICE, 원본 commit, 테스트 증거 필수 |
| Adapted Copy | MIT 계열 알고리즘/모듈 | 파일 헤더에 source/commit/license 표시 |
| Reference Only | Shotcut GPLv3 | 코드 복사 없이 구조와 동작만 참고 |
| Clean-room | Shotcut GPLv3 기능 | Shotcut 코드를 붙여넣지 않고 Danbi 타입/테스트 기준으로 새 구현 |
| External GPL Process | Shotcut/MLT 기반 별도 실행 경계 | GPL notice/source 제공 정책을 먼저 문서화 |

## 3. 금지되는 작업

- Shotcut `.cpp`, `.h`, `.qml`, `.js` 원본을 Danbi main source로 복사.
- GPL header나 `GNU General Public License` 문구가 들어간 파일을 `src/` 또는 정적 런타임 `public/`에 추가.
- Shotcut 함수/클래스 구현을 이름만 바꿔 붙여넣기.
- source register와 NOTICE 없이 OpenCut MIT 코드를 반입.
- `third_party/source-mirrors/`를 Git 추적 대상으로 추가.
- `third_party/source-mirrors/`를 `.gitmodules`, package script, Electron bundle, TypeScript/Vitest 입력으로 연결.
- FFmpeg/FFprobe binary를 notice, checksum, configure line, source offer 없이 Electron package에 동봉.
- `--enable-nonfree` FFmpeg build를 Danbi 배포물에 포함.

## 4. 반입 전 체크리스트

1. 원본 repository, commit/tag, license를 확인한다.
2. Danbi에 필요한 파일과 dependency graph를 먼저 좁힌다.
3. 외부 source mirror에서 코드를 가져오는 경우 작업 시작 전에 `third_party/source-mirrors.lock.json`, `docs/THIRD_PARTY_LICENSE_DECISION_LOG_KR.md`의 audit commit, 현재 mirror HEAD를 맞춘다.
4. `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`에 entry를 추가한다.
5. MIT 반입이면 `third_party/NOTICE.md`에 원본 notice와 Danbi 대상 파일을 추가한다.
6. Shotcut/GPL이면 직접 복사가 아니라 reference-only 또는 clean-room으로 작업 범위를 쪼갠다.
7. FFmpeg/FFprobe binary를 동봉하는 작업이면 `third_party/FFMPEG_BINARY_NOTICE.md`를 먼저 `Bundled status: present`로 바꾸고 version, checksum, configure line, license mode, source offer를 기록한다.
8. 구현 전 테스트 항목을 먼저 정한다.

## 5. 반입 후 체크리스트

다음 명령을 통과해야 한다.

```bash
npm run license:check
npx vitest run tests/lib/editor-core.test.ts
npx tsc --noEmit --pretty false
git diff --check
```

`npm run license:check`는 다음을 검사한다.

- `third_party/source-mirrors/`가 `.gitignore`에 있고 Git 추적 대상이 아닌지.
- `third_party/source-mirrors.lock.json`의 스키마, origin, audit commit, license, 허용 사용 방식, GPL 금지 조건이 맞는지.
- 각 source mirror 경로가 실제 `git check-ignore` 기준으로 무시되고 `.gitmodules`에 등록되지 않았는지.
- root package가 accidental publish 방지 상태(`private: true`, `UNLICENSED`)인지.
- 로컬 mirror가 있으면 문서에 기록된 commit과 일치하는지.
- `package.json` scripts가 `third_party/source-mirrors/`를 build/run/import/bundle 경로로 직접 참조하지 않는지.
- `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`가 `third_party/source-mirrors/`를 compile/test/lint 입력에서 제외하는지.
- `electron-builder.yml`이 source mirror 경로를 package 입력으로 포함하지 않고, `dist-electron`, packaged Next standalone renderer, license-safe sample pack만 배포 입력으로 쓰는지.
- Danbi runtime source(`src/`, `public/`)에 Shotcut/GPL 원본 흔적이 들어오지 않았는지.
- Danbi runtime source(`src/`, `public/`)에서 `OpenCut`을 언급하는 파일은 `Adapted from`, source commit, `License: MIT`, `third_party/NOTICE.md`, source register 경로를 모두 갖는지.
- MIT adapted copy 파일에 source, commit, license header가 있는지.
- 실제 외부 구현을 품은 MIT adapted-source 파일은 헤더가 강제되고, 단순 호출/통합 파일은 NOTICE/register 기록으로 추적되는지.
- `third_party/NOTICE.md`와 source register에 필수 entry가 있는지.
- OpenCut/OpenCut Classic/Shotcut mirror가 존재하면 origin URL, pinned audit commit, license file 핵심 문구가 문서와 일치하는지.
- FFmpeg/FFprobe binary가 tracked project tree에 들어오면 `third_party/FFMPEG_BINARY_NOTICE.md`에 동봉 기록과 source offer가 있는지.

## 6. 현재 등록된 MIT 반입

- `OPCUT-CLASSIC-ACTIONS-001`
  - Danbi target: `src/lib/editor/command-registry.ts`, `src/lib/editor/keyboard-map.ts`
  - 목적: command registry / keyboard map 구조화.
- `OPCUT-CLASSIC-TIMELINE-SNAP-PLACE-001`
  - Danbi target: `src/lib/editor/timeline-snapping.ts`, `src/lib/editor/timeline-placement.ts`, 관련 renderer helper.
  - 목적: timeline snapping / placement / collision 정책 분리.
- `OPCUT-CLASSIC-ANIMATION-001`
  - Danbi target: `src/lib/editor/keyframe-interpolation.ts`, `src/lib/editor/preview.ts`, `src/lib/editor/timeline.ts`
  - 목적: preview와 split/trim boundary keyframe의 numeric interpolation 통합.
- `OPCUT-CLASSIC-GROUP-MOVE-001`
  - Danbi target: `src/lib/editor/timeline-group-move.ts`, `src/lib/editor/timeline.ts`, `src/electron/renderer/timeline-edit-preview-helpers.ts`
  - 목적: grouped/linked clip move의 anchor offset, collision clamp, target track overlap validation 통합.
- `OPCUT-CLASSIC-GROUP-RESIZE-001`
  - Danbi target: `src/lib/editor/timeline-group-resize.ts`, `src/lib/editor/timeline.ts`
  - 목적: grouped/linked clip trim resize의 minimum duration, source extent, neighbor collision clamp 통합.
- `OPCUT-CLASSIC-WAVEFORM-CACHE-001`
  - Danbi target: `src/lib/editor/waveform-cache.ts`, media cache/preview/audio-analysis helpers.
  - 목적: persistent/runtime waveform source selection, embedded video audio waveform readiness, promise de-duplication 통합.
- `OPCUT-CLASSIC-VIDEO-CACHE-001`
  - Danbi target: `src/lib/editor/preview-frame-cache.ts`, preview worker plan/test.
  - 목적: Program Monitor preview frame seek generation, next-frame prefetch, stale request protection 통합.
- `OPCUT-CLASSIC-TIMELINE-TRANSACTION-001`
  - Danbi target: `src/lib/editor/timeline-transaction.ts`, `src/electron/renderer/project-history-controller.ts`.
  - 목적: undoable timeline transaction, serialized no-op detection, changed clip diff, renderer history delegation 통합.
- `OPCUT-CLASSIC-STORAGE-RECOVERY-001`
  - Danbi target: `src/lib/editor/project-recovery.ts`, `src/electron/renderer/project-persistence-workflow-helpers.ts`.
  - 목적: database/autosave/local fallback/package import recovery candidate ordering, project JSON storage capacity check 통합.

## 7. 참고한 원본 기준

- OpenCut: https://github.com/opencut-app/opencut
- OpenCut Classic: https://github.com/opencut-app/opencut-classic
- Shotcut: https://github.com/mltframework/shotcut
- GPL-3.0-only SPDX text: https://spdx.org/licenses/GPL-3.0-only.html
