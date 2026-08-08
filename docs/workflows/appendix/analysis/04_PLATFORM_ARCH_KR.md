> 본 문서는 2026-07-05 파이프라인 집중 분석 세션의 서브에이전트 산출물 원본이다.
> 실행용 워크플로우 문서는 [../../README.md](../../README.md) 참고.

# Danbi Studio 플랫폼 아키텍처 분석 보고서

분석일: 2026-07-05. 근거 파일: `E:/ai_tool/Danbi_Studio/docs/` 하위 아키텍처/상호교환/라이선스 문서, `prisma/schema.prisma`, `src/` 디렉터리 실측(2단계 깊이). **[사실]** 표기는 문서·코드에서 직접 확인한 내용, **[추측]** 표기는 문서 기반 추론이다.

---

## 1. Electron 메인/렌더러/서버 구조와 IPC 경계

### 1.1 계층 구조 (사실)

코드는 다음 계층으로 분리되어 있으며, `scripts/check-electron-boundaries.mjs`(`npm run architecture:check`)가 import 그래프를 자동 검사한다 (241개 파일 스캔 통과 기록).

| 계층 | 위치 | 역할 |
|---|---|---|
| Electron main | `src/electron/main/` | 파일시스템, FFmpeg, 잡 큐, 네이티브 다이얼로그/파일/미디어 임포트, 프로젝트 패키지, 렌더 워커, 플러그인 설치 등 Node 실행 경계 |
| preload | `src/electron/preload/` | `contextBridge`로 `window.danbiEditor` typed bridge만 노출. context isolation, node integration 없음 |
| renderer | `src/electron/renderer/` | 약 100개 이상의 UI 패널/워크플로 헬퍼. DOM/브라우저 I/O와 view model만 담당 |
| shared | `src/electron/shared/` | `ipc-contract.ts`(IPC 채널·request/response 타입), `project-schema.ts`(프로젝트 JSON parse/migrate/validate), `timeline-state.ts`(순수 타임라인 스냅샷), `extension-api.ts`(플러그인 계약) |
| 순수 에디터 코어 | `src/lib/editor/` (100+ 모듈) | timeline 변환, render plan, EDL/FCPXML/마커, 미디어 캐시 계산 등. Node/Electron 의존 금지 |
| 서버 서비스 | `src/server/editor/` | `job-store.ts`, `media-analyzer.ts`(ffprobe 실행), `render-output-access.ts`, `render-sidecar-files.ts`, `editor-api-token-auth.ts`, `sample-project-package.ts` — Node child_process/fs 소유 |
| Next 앱 | `src/app/` | `/editor` 렌더러 UI + `/api/editor/*` API 라우트(automation, render, render-jobs, comfyui-jobs, stt-jobs, media-cache, projects, fcpxml, markers, edl, hooks, queue-settings 등 21개), 그 외 ai-studio/automation/extensions/generate/library/render-queue/settings/status 페이지 |

`src/components/`와 `src/types/`는 현재 비어 있다 (사실, 실측).

### 1.2 경계 규칙 (사실)

- renderer·`src/app/editor`·shared는 Node/Electron 네이티브 모듈을 직접 import하지 않는다.
- main/preload/shared는 renderer에 의존하지 않는다. preload는 bridge 역할만 한다.
- 미디어 분석은 파서(`lib/editor/media-analyzer.ts`, 순수)와 실행기(`server/editor/media-analyzer.ts`, ffprobe spawn)로 분리되어 있다.

### 1.3 이중 실행 모드 (사실)

렌더러 클라이언트(`render-client.ts`, `project-persistence-client.ts`, `editor-media-client.ts` 등)는 `window.danbiEditor`(Electron preload bridge)가 있으면 IPC를 쓰고, 없으면 Next API 라우트로 폴백한다. 즉 **같은 기능이 브라우저 모드(Next API)와 데스크톱 모드(IPC) 양쪽으로 열려 있다**. 패키지 모드에서는 `packaged-renderer-server.ts`가 Next standalone 서버를 내부 기동한다.

### 1.4 저장 경로 정책 (사실)

패키지 Electron은 `userData` 아래에 `logs, crashDumps, projects, packages, renders, temp, imports, cache, autosave, jobs, stt, outputs`를 만들고 `DANBI_ELECTRON_USER_DATA`/`DANBI_LOCAL_DATA_ROOT`를 설정한다. 로컬 개발은 `.danbi/` 사용. Program Files 쓰기는 설치 수락 테스트에서 위반으로 검사한다. FFmpeg/FFprobe는 `ffmpeg-discovery.ts`가 env/리소스/PATH에서 탐색하는 **외부 바이너리**다(동봉 안 함).

### 1.5 파이프라인 관점 시사점 (추측)

파이프라인 오케스트레이터가 Danbi Studio에 접근하는 공식 진입점은 (a) Next API 라우트(HTTP), (b) headless render CLI, (c) Electron IPC(앱 내부) 세 가지다. `editor-api-token-auth.ts`가 존재하므로 API 토큰 인증 경계가 이미 있다(사실: 파일 존재 / 추측: 세부 동작). 외부 자동화는 HTTP API + headless CLI 조합이 가장 안전하다.

---

## 2. 잡(Job) 시스템 — 파이프라인 오케스트레이션 재사용성

### 2.1 현재 구조 (사실)

- **큐 4종**: `render-queue.ts`, `media-cache-queue.ts`, `stt-queue.ts`, `comfyui-queue.ts` — 현재 `src/lib/editor`에 남아 있는 Node-backed 서비스로, boundary guard의 explicit allowlist(구조 부채 목록)에만 허용된 상태. 향후 server/main 경계로 이동 예정.
- **영속화**: `src/server/editor/job-store.ts`가 `savePersistedJob / getPersistedJob / listPersistedJobs / clearTerminalPersistedJobs`를 제공. 로컬 데이터 루트의 `jobs/*.json`에 atomic write. 개발은 `.danbi/jobs`, 패키지는 `userData/jobs`.
- **라이프사이클**: 모든 큐가 queue/poll/cancel/retry를 지원하며 렌더 큐는 priority, queue-settings API는 concurrency/priority 설정을 제공한다. 렌더러는 폴링 기반으로 상태를 갱신한다.
- **분산 렌더**: `electron/main`에 `render-worker-daemon.ts`, `render-worker-discovery.ts`(fleet discovery), `render-worker-handoff.ts`, `render-worker-runner.ts`가 존재한다. OpenCut 검토 문서도 Render Worker/Daemon/Fleet Discovery/Headless Render를 Danbi 핵심 오케스트레이션으로 명시한다.
- **Headless 렌더**: `headless-render-engine.ts`는 raw 프로젝트 JSON 또는 `.danbi-project.json` 패키지를 로드해 export profile 선택, 충돌 없는 출력 경로 생성, dry-run preflight를 지원하고 실제 렌더는 `ffmpeg-render-engine.ts`에 위임한다. **CLI 자동화와 UI가 같은 FFmpeg 엔진·preflight·extension hook 경로를 공유한다.**
- **자동화 훅**: manual / on-import / before-export / on-gap 이벤트가 있고(automation hooks), direct/queued/headless 렌더 모두 extension `before-render` hook을 실행하며 hook 실행 스냅샷을 잡 기록에 남긴다. `webhook-runner.ts`, `ai-broll-gap-fill.ts`, `hooks.ts`도 존재한다.

### 2.2 재사용 가능성 평가

**재사용 가능한 것 (사실 기반)**:
- 잡 패턴(JSON 파일 영속 + queue/poll/cancel/retry/priority + 렌더러 폴링 뷰모델)은 검증된 패턴으로, 파이프라인의 "이미지 생성 잡", "TTS 잡", "업로드 잡" 같은 새 잡 타입을 같은 방식으로 추가하기 좋다.
- headless render CLI는 파이프라인 6단계(편집→렌더)를 무인 실행하는 완성된 진입점이다. dry-run preflight로 렌더 전 검증도 가능하다.
- ComfyUI batch queue와 STT queue는 파이프라인 4단계(이미지 생성)·음성 자막 처리에 이미 대응한다.
- automation hooks(특히 before-export, on-import)는 파이프라인 단계 간 트리거 지점으로 쓸 수 있다.

**한계 (추측, 문서 기반)**:
- 잡 시스템은 잡 타입별 개별 서비스이지 범용 잡 프레임워크가 아니다. 잡 간 의존성(DAG), 다단계 워크플로 체이닝, 재개 가능한 파이프라인 상태 머신은 문서상 확인되지 않는다. "시나리오→대본→콘티→생성→편집→업로드" 전체 오케스트레이션은 Danbi 잡 시스템 위가 아니라 **외부 오케스트레이터가 Danbi의 API/CLI/잡을 스텝 단위로 호출**하는 구조가 현실적이다. OpenCut 검토 문서의 "Job bridge contract"(status/event/cancel/retry/update payload) 개념이 그대로 파이프라인 브리지 설계에 적용된다.
- 큐 모듈의 위치가 이동 중(구조 부채)이므로 파이프라인이 큐 내부 구현에 직접 의존하면 안 되고, API 라우트/IPC 계약 수준에 의존해야 한다.

---

## 3. Prisma DB 스키마 — 현재 저장 내용

**(사실)** SQLite(`DATABASE_URL`), 모델 단 2개:

1. **GenerationJob** — ComfyUI 생성 잡: `status`(pending/running/completed/failed), `modelName`, `workflowName`, `parameters`(JSON 문자열), `promptId`(ComfyUI prompt ID), `resultPath`, `error`, 타임스탬프.
2. **EditorProjectRecord** — 에디터 프로젝트: `id`, `name`, `data`(프로젝트 JSON 전체를 문자열로), `thumbnailPath`, 타임스탬프.

**(사실)** DB는 매우 얇다. 실질 상태의 대부분은 파일시스템에 있다: 잡은 `jobs/*.json`, autosave는 `autosave-store.ts`/localStorage 폴백, 패키지 Electron은 Prisma 대신 `native-project-repository.ts`(userData 아래 파일 기반 프로젝트 저장소)를 쓴다. `project-store-adapter.ts`가 Next/Prisma 저장소와 로컬 파일 저장소를 같은 repository 인터페이스로 교체 가능하게 추상화한다.

**(추측) 파이프라인 시사점**: 시나리오/대본/콘티/씬/생성 lineage 같은 파이프라인 엔티티는 현재 스키마에 존재하지 않는다. 설계 시 (a) 파이프라인 전용 저장소(별도 SQLite/파일)를 두고 Danbi에는 최종 산출물(미디어, 프로젝트 JSON)만 넘기거나, (b) GenerationJob 패턴을 따라 새 모델을 추가하는 두 갈래가 있다. 패키지 Electron 모드는 Prisma를 우회하므로 (a)가 결합도가 낮다.

---

## 4. EDL / FCPXML / 마커 상호교환 — 자동 편집 초안 생성 활용성

### 4.1 지원 현황 (사실)

| 포맷 | 모듈 | export | import | 보존 범위 | 제외 |
|---|---|---|---|---|---|
| **CMX 3600 EDL** | `lib/editor/edl.ts` | O | O (offline placeholder asset + V/A 트랙 프로젝트 생성, validator 통과) | 컷 리스트, sourceIn/Out, record TC, clip/asset/track id를 comment로 | 효과, 키프레임, 전환, 자막, 마커, 속도 |
| **FCPXML** | `lib/editor/fcpxml.ts` + `/api/editor/fcpxml` + Export 패널 UI | O | O (validator 통과) | video/audio/image/ai asset-clip, **title(텍스트·줄바꿈·폰트/색/배경/그림자/위치 스타일)**, **전환 4종(crossfade/dip/push/wipe → 재import 시 FFmpeg xfade 렌더 경로 복원)**, offset/sourceIn/duration, **마커(kind/color/duration/note)** — Danbi 고유 값은 `data-danbi-*` 속성으로 왕복 | effect stack, 키프레임, 스피드램프, 캡션 스타일, ComfyUI 자동화 메타데이터 |
| **마커** | `lib/editor/marker-interchange.ts` + `/api/editor/markers` | CSV, YouTube chapters | CSV, chapters (중복 스킵 merge, undo 가능) | timecode/label/kind(chapter·beat·warning·todo)/color/duration/note | Premiere/Resolve marker XML |

추가로 chapter 마커는 렌더 시 FFmpeg `.ffmetadata` sidecar로 변환되어 `-map_chapters`로 결과 MP4에 챕터가 박힌다 (사실).

### 4.2 자동 편집 초안 생성 활용 판단

**(사실 기반 결론)** 가능하다. 세 가지 경로가 있다:

1. **Danbi 프로젝트 JSON 직접 생성 — 최선.** `shared/project-schema.ts`가 parse/migrate/validate 경계를 공개하고, EDL/FCPXML import도 이 validator를 통과해야 하므로 스키마 계약이 안정적이다. 콘티(씬 리스트)→클립/트랙/타이틀/마커/전환을 가진 `EditorProject` JSON을 생성해 `.danbi-project.json` 패키지(미디어 동봉)로 만들면 headless render까지 무인으로 이어진다. 효과/키프레임/캡션/ComfyUI 바인딩 등 전체 충실도는 이 경로만 보존한다.
2. **FCPXML 생성 — 차선.** 타이틀·전환·마커까지 표현 가능하고 `/api/editor/fcpxml`로 import할 수 있어, 파이프라인이 Danbi 스키마에 직접 결합되기 싫을 때 중립 포맷으로 쓸 수 있다. 단 effect stack·키프레임·캡션은 못 담는다.
3. **EDL — 컷 전용.** 콘티가 순수 컷 나열일 때만 유효. import 시 offline placeholder가 생기므로 relink 워크플로가 뒤따라야 한다(문서상 relink 자동 안내는 "다음 확장" 항목).

**(추측)** 콘티→초안 자동 생성에서 마커 CSV는 씬 경계/검수 포인트 주입에, chapter 마커는 업로드 단계(유튜브 챕터)와 직결되므로 파이프라인 산출물 스키마에 마커를 1급 데이터로 포함시키는 것이 좋다.

---

## 5. 플러그인/확장 시스템과 서명 체계

### 5.1 확장 시스템 (사실)

- `shared/extension-api.ts`가 plugin manifest, **permission**(문서상 filesystem/network/comfyui/render/project 권한 축), contribution, extension context, invocation 계약을 정의한다.
- 내장 extension fixture runtime에 `plugin-ffmpeg-renderer`, `plugin-comfyui-bridge`가 command와 `before-render` hook을 등록한다. Electron IPC `extension:list/invoke`가 manifest 권한을 확인하고 command를 실행한다.
- **외부 plugin 파일 로더는 닫혀 있다.** 동적 코드 실행 전 sandbox policy와 process-isolated handshake, reviewed command runner로 경계를 검증하는 단계다.
- 설치 가능한 것은 서명된 plugin package뿐: `plugin-package-installer.ts`가 로컬 `danbi-plugin-package.json` 폴더를 읽어 manifest 서명과 파일 해시를 검증한 뒤 `plugins/`/`tools/` 파일만 복사한다. 외부 exporter writer 실행은 `external-exporter-runner.ts`가 package root 격리, entry 멤버십, 바이트 수, `sha256-` digest를 검증하고 변조 패키지를 차단한 뒤에만 spawn한다. 실행은 reviewed sandbox command와 신뢰된 packaged writer handoff로만 가능하다.

### 5.2 서명 체계 (사실)

- RSA-SHA256 manifest 서명. trusted key는 `src/lib/editor/plugin-signature.ts`에 공개키만 반영: production `danbi-production-plugin-rsa-2026`(active, 2026-06-01~), dev `danbi-local-plugin-dev-rsa-2026`.
- 키 라이프사이클: active/retiring/revoked/expired + `replacementKeyId`. 회전 리허설(`plugin-signing:rotation-drill`), custody audit(`plugin-signing:custody-audit`, private key 본문/경로 누출 검사), release gate가 npm 스크립트로 자동화되어 있고, production `electron:release:prepare`는 private-key env 금지 모드 audit 통과를 manifest에 기록해야 한다. revoked/expired 키로 서명된 패키지는 설치 단계에서 차단된다.

### 5.3 파이프라인 시사점 (추측 포함)

- **(사실)** OpenCut 검토 문서의 결론: extension/plugin 실행은 Danbi host가 authoritative해야 하고, 외부 편집 shell은 bridge client로 제한한다. Danbi를 다른 시스템의 플러그인으로 축소하는 방향은 금지선이다.
- **(추측)** 파이프라인의 커스텀 단계(예: 업로드 도구, 자막 후처리)를 Danbi 안에 넣으려면 ① 서명된 plugin package로 배포하거나 ② extension command/hook을 IPC/API로 호출하는 외부 프로세스로 두는 두 경로만 정당하다. 임의 코드 로딩 경로는 없으며 만들려 하면 서명·sandbox 게이트와 충돌한다. 파이프라인 오케스트레이터는 Danbi 외부 서비스로 두고 Job bridge 계약으로 통신하는 편이 서명 체계와 정합적이다.

---

## 6. 라이선스 가드레일 중 파이프라인 설계가 지켜야 할 것

**(사실, 핵심 원칙만)**

1. **Danbi 본체는 `private: true`, `license: "UNLICENSED"`** — 파이프라인 산출물/도구를 공개 배포 대상으로 섞지 않는다.
2. **GPL 격리**: Shotcut(GPLv3) 코드는 `src/`, `public/`, Electron 번들에 절대 복사 금지. Reference-only / clean-room / 별도 GPL 실행 경계만 허용. 파이프라인이 GPL 도구를 쓰려면 **외부 프로세스 경계**로만 호출해야 한다.
3. **FFmpeg는 현재 동봉하지 않고 외부 process로 호출**한다. 동봉하려면 `third_party/FFMPEG_BINARY_NOTICE.md`에 version/checksum/configure line/source offer를 먼저 기록해야 하고, `--enable-nonfree` 빌드는 금지다. 파이프라인이 FFmpeg를 직접 부르는 스텝을 추가해도 같은 규칙이 적용된다.
4. **MIT 반입 절차**: OpenCut 계열 코드 복사 시 source register(`docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`) + `third_party/NOTICE.md` + 파일 헤더(Adapted from/commit/License: MIT) 필수. `npm run license:check`가 CI 게이트다. 파이프라인 구현 중 외부 코드(예: 업로드 SDK 샘플, 자막 파서)를 가져올 때도 동일 절차를 밟아야 한다.
5. **source mirror(`third_party/source-mirrors/`)는 빌드/테스트/번들 입력으로 연결 금지** — 파이프라인 스크립트가 이 경로를 import하면 안 된다.
6. **(추측) 미디어 라이선스**: 릴리즈 샘플 팩이 "license-safe synthetic FFmpeg media"를 생성해 쓰는 관행을 볼 때, 파이프라인이 생성·수집하는 이미지/음성/BGM도 출처와 사용 조건을 기록하는 동일한 규율을 파이프라인 설계 문서에 포함해야 한다.

---

## 종합: 파이프라인 설계에 대한 결론

**(사실 종합)** Danbi Studio는 이미 "무인 실행"을 전제로 만들어진 부분이 많다: typed IPC 계약, 브라우저/데스크톱 이중 진입점, 파일 기반 잡 영속화 + queue/poll/cancel/retry, headless render CLI(프로젝트 패키지 입력, dry-run preflight, UI와 동일 엔진), automation hooks, ComfyUI/STT 큐, FCPXML/EDL/마커 상호교환, 서명 기반 플러그인 설치.

**(추측 종합)** 따라서 파이프라인 설계의 골격은 다음이 자연스럽다: ① 시나리오/대본/콘티는 Danbi 밖 별도 저장소에서 관리, ② 콘티→`EditorProject` JSON(또는 FCPXML) 자동 생성 후 `.danbi-project.json` 패키지로 조립, ③ 이미지/음성 생성은 ComfyUI 큐(GenerationJob) 패턴 재사용 또는 동형 잡 추가, ④ 편집 초안은 마커/타이틀/전환 포함 프로젝트로 주입하고 사람 검수는 Danbi UI에서, ⑤ 렌더는 headless engine + preflight, ⑥ 업로드는 서명 플러그인 또는 외부 서비스 스텝으로. 전 과정에서 Danbi의 preflight/스토리지(userData)/서명/라이선스 게이트 의미론을 약화시키지 않는 것이 문서 전반에 걸친 불변 원칙이다.