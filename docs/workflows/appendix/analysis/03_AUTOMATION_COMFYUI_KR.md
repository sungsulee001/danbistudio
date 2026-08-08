> 본 문서는 2026-07-05 파이프라인 집중 분석 세션의 서브에이전트 산출물 원본이다.
> 실행용 워크플로우 문서는 [../../README.md](../../README.md) 참고.

# Danbi Studio 기존 자동화/ComfyUI 연동 자산 분석 보고서

조사 일자: 2026-07-05
조사 범위: `E:/ai_tool/Danbi_Studio`의 docs 3종, `workflows/*.json` 3종, `scripts/` 렌더 관련 스크립트 및 대응 entry 파일, 관련 lib 파일 존재 확인(Glob). **lib 구현 코드 자체는 읽지 않았으며**, 문서가 기술한 역할은 파일 존재 확인으로만 교차 검증했다. 사실과 추측을 구분해 표기한다.

---

## 1. 문서에 기록된 ComfyUI 자동화 설계/현황

### 1.1 `docs/COMFYUI_AUTOMATION_KR.md` — 구현된 자동화 API (사실)

Danbi에는 이미 편집기 타임라인과 ComfyUI를 잇는 **자동화 API 계층이 구현되어 문서화**되어 있다.

- **편집 이벤트 훅** `GET/POST /api/editor/hooks`: 이벤트 4종(`manual`, `on-import`, `before-export`, `on-gap`)에 automation rule을 매칭. 로컬 훅은 caption burn-in, loudness normalization, color pass 같은 export 준비 작업을 반환하고 `applyLocalActions=true`이면 갱신된 프로젝트까지 반환. webhook은 payload 준비까지가 기본이고 `executeWebhooks=true`일 때만 실행.
- **자동화 계획 생성** `POST /api/editor/automation`: 프로젝트 JSON + 선택 클립 ID를 받아 클립별 ComfyUI job(`workflowName`, `parameters{prompt, steps, fps, duration_seconds}`)과 `generatePayloads[]`(예: `modelName: "wan_i2v"`, `workflowName: "broll_i2v"`)를 생성. `generatePayloads`는 기존 `POST /api/generate`로 재전송 가능.
- **배치 큐** `GET/POST /api/editor/comfyui-jobs`(+ `/:id` GET/DELETE/POST retry): `execute=false`(기본)는 외부 ComfyUI 없이 계획/payload 검증만 하는 dry-run. `execute=true`면 workflow JSON을 load/inject 후 ComfyUI `/prompt`에 실제 큐잉하고 `promptIds`를 기록. 완료 시 출력물을 개발환경 `.danbi/outputs`, Electron 패키지 `userData/outputs`로 복사하고 preview용 `source`와 FFmpeg용 `renderPath`를 result snapshot에 기록.
- **큐 설정** `GET/PUT /api/editor/queue-settings`: `comfyuiConcurrency`(1–4), `defaultComfyUIPriority`(-100~100).
- **보안 경계(2026-06-15 기준)**: ComfyUI 대상은 기본 localhost-only. 원격은 `COMFYUI_ALLOWED_URLS`/`COMFYUI_ALLOWLIST` 명시 필요. URL credential, 비HTTP 프로토콜 거부. 출력 파일명은 `COMFYUI_OUTPUT` 하위로 제한되고 `../` 등 경로 탈출 차단. webhook은 `DANBI_EDITOR_API_TOKEN` gate, allowlist, `tokenSecret` alias(실값은 `DANBI_EDITOR_WEBHOOK_SECRET_*` 환경변수), body redaction 적용.
- **결과 반영**: `src/lib/editor/comfyui-results.ts`가 결과를 asset/clip으로 변환. `AI Result Review` 패널이 원본/결과 side-by-side 비교, 후보 트랙 추가 모드와 undo 가능한 교체 모드 지원. 결과 asset에 `provider=comfyui`, `sourceClipId`, `automationJobId`, `promptId`, `promptLineage` 메타데이터 기록.
- **워크플로우 매핑**: `workflowName` → `workflows/{name}.json`, `src/lib/workflow-loader.ts`가 같은 이름의 input을 찾아 파라미터 주입(단순 key 매칭). `src/lib/editor/comfyui-workflows.ts`가 B-roll I2V, style transfer, upscale restore, background remove, interpolation preset 제공. Inspector의 `ComfyUI Binding` 패널이 클립별 preset/prompt/seed/steps/CFG/해상도를 undo 가능하게 저장. `ai-broll-gap-fill.ts`가 타임라인의 실제 빈 화면 구간을 찾아 `AI Fill` 버튼으로 draft clip 생성. `ai-morph` 전환은 `transition-morph` preset job으로 변환.
- **문서가 명시한 남은 확장**: 리뷰 메타데이터 고도화, webhook credential vault, VRAM/비용 추정 기반 스케줄링, 실패 하위 클립만 재시도, 결과의 타임라인 자동 반영.

### 1.2 `docs/TOOBUSY_PINGPONG_DANBI_APPLICATION_ANALYSIS_KR.md` — 보강 로드맵 (사실: 분석 문서 존재 / 내용은 계획)

toobusy_pingpong(로컬 AI 생성 오케스트레이터: Telegram+LM Studio+ComfyUI+로컬 대시보드)을 분석해 Danbi에 흡수할 항목을 우선순위화한 문서다. **아직 구현이 아니라 적용 제안**이다.

- **P1**: (a) ComfyUI readiness API — `/system_stats`, `/object_info`로 누락 custom node/model을 실행 전 진단, 제안 경로 `src/app/api/editor/comfyui-readiness/route.ts`; (b) WebSocket(`/ws`) 진행률 — sampling %, current node 표시, polling fallback 유지; (c) `/interrupt`, `/free` 제어(사용자 명시 액션으로만); (d) 결과 `/view` 다운로드 fallback(output 경로 불일치 대응).
- **P2**: workflow import/analyzer(API-format JSON에서 prompt/negative/seed/image/output/ratio/model 노드를 추정해 node-specific `ComfyUIWorkflowBindingSpec`으로 등록 — 현재 `injectParameters()`의 이름 기반 전체 치환의 오작동 위험 해소), AI Studio 갤러리/메타데이터 강화, LM Studio 프롬프트 보강(선택 기능).
- **P3/P4**: reference board(face/outfit/style/LoRA 역할 태깅), A/B workflow 비교, Telegram(후순위, 별도 plugin으로).
- **제약**: 대상 저장소에 LICENSE가 없어 코드/워크플로우 JSON 직접 복사 금지, clean-room 재구현만 허용.
- 문서의 매핑 표가 Danbi 현재 자산 위치를 확인해준다: `src/lib/comfyui-client.ts`(`/prompt`, `/upload/image`, `/history`, `/system_stats`), `src/lib/editor/comfyui-queue.ts`(priority/concurrency/persistent snapshot/cancel/retry), `src/app/ai-studio/page.tsx`(workflow browser·queue·결과 히스토리), `src/app/automation/page.tsx`(hook/queue 설정), `src/lib/result-handler.ts`(출력 복사).

### 1.3 `docs/COMFYUI_VIEWER_OPENREEL_EXTENSION_ANALYSIS_KR.xhtml` — 연동 패턴 참고 분석 (사실: 분석 문서 / 내용은 설계 지침)

WASasquatch의 ComfyUI Viewer OpenReel Extension 분석. 결론: 전체 이식은 부적합하고 패턴만 흡수.

- **흡수 권고 패턴**: iframe을 재로딩하지 않는 postMessage 브리지, ComfyUI 생성물(video/image/audio)을 하나의 편집 가능한 **result bundle**로 묶는 방식(`CV OpenReel Bundle *` 노드군), 편집 결과를 다시 워크플로우로 되돌리는 Send-to-Output/Unpack 흐름, panel별 error boundary.
- **복사 금지 항목**: pause node 기반 워크플로우, 전역 output marker(→ Danbi는 job id/asset id/render id 명시 manifest 필요), ComfyUI temp/input 경로 의존(→ Electron `userData` 규칙 우선), JPEG frame 업로드 렌더(→ Render Worker 직접 렌더 우선).
- **유지 원칙**: Render Worker, Render Worker Daemon, Fleet Discovery, Headless Render, Extension/Plugin 보안 모델, export validation 의미론을 유지한 채 적용.

---

## 2. 루트 `workflows/*.json` 분석 (사실 — JSON 직접 확인)

세 파일 모두 ComfyUI **API-format**(노드 ID → inputs/class_type) 워크플로우다. 중요한 발견: **이름과 달리 실제 영상(I2V) 워크플로우가 아니다.**

| 파일 | 실제 내용 | 모델 | 입력 | 출력 |
| --- | --- | --- | --- | --- |
| `broll_i2v.json` | **SD1.5 text-to-image 정지 이미지** 생성. `CheckpointLoaderSimple` → `EmptyLatentImage`(1024×576) → `CLIPTextEncode` ±프롬프트 → `KSampler`(24 steps, cfg 6, euler/normal, denoise 1.0) → `VAEDecode` → `SaveImage`(`Danbi_Broll`) | `v1-5-pruned-emaonly-fp16.safetensors` | 텍스트 프롬프트, seed, steps | PNG 정지 이미지 1장 |
| `broll_reference_i2v.json` | **SD1.5 image-to-image(레퍼런스 유도) 정지 이미지**. `LoadImage`(`reference.png`) → `ImageScale`(1024×576 lanczos) → `VAEEncode` → `KSampler`(denoise 0.58) → `VAEDecode` → `SaveImage`(`Danbi_Reference_Broll`) | 동일 SD1.5 | 레퍼런스 이미지 + 프롬프트 | PNG 정지 이미지 1장 |
| `test_workflow.json` | `TestNode` 1개(seed, steps)뿐인 최소 픽스처. 파라미터 주입/큐 테스트용으로 추정(추측) | 없음 | seed/steps | 없음 |

**사실**: 어느 파일에도 비디오 노드(WAN, AnimateDiff, VHS 계열 등)나 오디오 노드가 없다. 즉 자동화 문서의 `modelName: "wan_i2v"`나 "B-roll I2V" preset 이름은 설계 의도이고, **현재 워크플로우 자산은 이미지 생성용 스켈레톤/플레이스홀더 수준**이다. `duration_seconds`, `fps` 같은 파라미터는 타임라인 배치용 메타이지 워크플로우 안에서 소비되지 않는다(주입은 이름 매칭이므로 대응 input이 없으면 무시될 것 — 이 부분은 loader 미확인이므로 추측).

---

## 3. 헤드리스 렌더 / 렌더 워커 역량 (사실 — entry 코드 확인)

`scripts/headless-render.mjs`, `render-worker.mjs`, `render-worker-daemon.mjs` 세 파일은 모두 동일 패턴의 **esbuild 래퍼**다: 대응하는 `scripts/*-entry.ts`를 `.danbi/<이름>/bundle/*.cjs`로 번들 후 Node로 실행. 실제 로직은 `src/electron/main/`의 엔진 모듈에 있다(entry의 import로 확인).

- **`headless-render-entry.ts`** (`src/electron/main/headless-render-engine` 사용): CLI로 `--project <project.json>`을 받아 export profile 기반 렌더 요청 배치를 구성(`profileIds`/`allProfiles`, `outputDir`, `batchId`, `exportRange`, `encoderPreference`). 두 가지 모드: (a) 직접 배치 렌더 실행(`dryRun` 지원), (b) `--handoff` 지정 시 렌더를 실행하지 않고 **handoff manifest**를 파일로 기록.
- **`render-worker-entry.ts`** (`render-worker-runner` 사용): `--manifest <handoff.json>`을 받아 manifest의 job들을 실행. `workerId`, 특정 `jobIds`만 선택 실행, `dryRun`, `executeBlocked`(차단된 job 강제 실행 플래그로 추정), run report 파일 출력 지원.
- **`render-worker-daemon-entry.ts`** (`render-worker-daemon` 사용): 장기 실행 데몬. `host/port`, `workerId`, `maxConcurrentRuns`, `runLeaseSeconds`(job lease — 분산 워커 실행 임대), `authToken`, `discovery`/`discoveryPort`(OpenReel 문서의 "Fleet Discovery"와 부합 — LAN 워커 발견 기능으로 추정), SIGINT/SIGTERM graceful shutdown.

**의미**: GUI 없이 `프로젝트 JSON → 렌더 배치/매니페스트 → 워커(단발 CLI 또는 상주 데몬) → 리포트`로 이어지는 **무인 렌더 파이프라인이 이미 존재**한다. 자동화 파이프라인의 "편집 → 최종 출력물" 단계를 스크립트로 구동할 수 있는 핵심 자산이다. (엔진 내부의 FFmpeg 처리 세부는 미확인 — `src/lib/editor/ffmpeg-renderer.ts`, `render-queue.ts`, `render-preflight.ts` 존재는 확인.)

---

## 4. 파이프라인 단계별 재사용 가능 자산

### 이미지 생성 단계 — 즉시 재사용 가능 (사실)

- `workflows/broll_i2v.json`(t2i), `broll_reference_i2v.json`(레퍼런스 i2i): 콘티 기반 이미지 생성의 출발점. 단, SD1.5라 품질 목표에 따라 상위 모델 워크플로우 교체 필요(판단).
- `src/lib/comfyui-client.ts`: `/prompt`, `/upload/image`(레퍼런스 이미지 업로드), `/history`, `/system_stats`.
- `src/lib/workflow-loader.ts`: 파라미터 주입(단, 이름 기반이라 복잡 워크플로우에서 취약 — pingpong 문서가 지적).
- `src/lib/editor/comfyui-queue.ts`: priority/동시성/스냅샷 영속/취소/재시도 배치 큐.
- `POST /api/generate`, `POST /api/editor/comfyui-jobs`: 실행 진입점. dry-run 검증 모드 내장.
- 출력 저장 규약(`.danbi/outputs`/`userData/outputs` + `/outputs` route)과 경로 보안 가드.
- `src/lib/editor/comfyui-results.ts` + AI Result Review: 생성 결과의 프로젝트 자산화·메타데이터 계보(promptLineage) 추적.

### 동영상 생성 단계 — 배관은 있고 워크플로우 실체는 없음 (사실+판단)

- 배관(큐, 주입, 결과 수집, 타임라인 반영, `duration_seconds`/`timeline_start_seconds` 파라미터 규약, `broll-i2v`/`transition-morph` preset, `ai-broll-gap-fill`의 갭 채우기)은 모두 존재.
- **실제 I2V 워크플로우 JSON(WAN 등)은 리포지토리에 없다.** 파이프라인 구축 시 "콘티 이미지 → I2V 영상" 워크플로우 JSON을 새로 제작·등록하는 것이 첫 결손 보충 작업이다. pingpong 문서의 workflow import/analyzer(P2)가 이 등록 작업을 안전하게 만든다.

### 음성 생성 단계 — 자산 없음 (조사 범위 내 사실)

- 이번 조사 범위에서 TTS/음성 생성 자산은 확인되지 않았다. STT 계열(`stt-transcript.ts`, `stt-queue.ts` 등)과 오디오 편집 유틸은 다수 존재하므로, 음성은 ComfyUI 오디오 워크플로우 또는 외부 TTS를 새로 붙이되 기존 comfyui-jobs 큐 경로를 그대로 태울 수 있다(판단).

### 편집/출력 단계 (사실)

- 편집 이벤트 훅(`on-import`/`on-gap`/`before-export`) + webhook(allowlist/secret 관리 포함): 외부 오케스트레이터(n8n 등 — 문서에 `LOCAL_N8N` alias 예시 존재)와의 연결 고리.
- headless-render → handoff manifest → render-worker/daemon: 업로드 직전 산출물 자동 렌더.

---

## 5. ComfyUI 대시보드 구축 시 기존 자산과의 연결점

사용자가 원하는 "심플하고 좋은 관리 UI"는 pingpong 문서의 `dashboard.py` 분석이 사실상 청사진이다(단, clean-room 재구현 필수).

1. **호스트 페이지**: 신규 페이지를 만들기보다 기존 `/ai-studio`(workflow browser·queue·결과 히스토리)와 `/automation`(hook/queue 설정)을 확장하는 것이 문서들의 일관된 권고다.
2. **데이터 소스(이미 존재)**: `GET /api/editor/comfyui-jobs`(큐 스냅샷: status/progress/priority/promptIds/warnings), `GET/PUT /api/editor/queue-settings`(동시성·우선순위 제어 위젯), job별 GET/DELETE/retry POST(카드 액션 버튼에 직결).
3. **추가 필요 데이터 소스(문서에 설계 존재, 미구현)**: readiness API(ComfyUI online/offline, 누락 custom node/model 배지 — 대시보드의 핵심 차별점), WebSocket 진행률(stage/current node/sampling % 실시간 표시), `/interrupt`·`/free` 버튼(명시적 사용자 액션 원칙), `/view` fallback(갤러리 썸네일 안정화).
4. **갤러리**: `comfyui-results.ts`의 result snapshot과 asset 메타데이터(`requestPrompt`/`generatedPrompt`/workflow/seed/sourceClipId)를 그대로 카드화. 삭제는 destructive가 아닌 undo 가능한 asset state action으로(pingpong 문서 권고).
5. **워크플로우 관리 탭**: `workflows/*.json` 목록 + `comfyui-workflows.ts` preset + import/analyzer 마법사(P2)를 붙이면 사용자가 자기 워크플로우를 대시보드에서 직접 등록·진단 가능.
6. **보안 제약 준수**: 대시보드가 호출하는 모든 신규 endpoint는 기존 localhost-only 기본값, allowlist, `DANBI_EDITOR_API_TOKEN` gate를 통과해야 한다(자동화 문서의 확정된 경계).
7. **UI 패턴**: OpenReel 분석의 iframe 미재로딩 postMessage 브리지와 panel별 error boundary는, 대시보드를 편집기 내부 패널이나 plugin panel로 임베드할 경우의 안정성 패턴으로 재사용 가능.

### 종합 판단

Danbi에는 "큐잉·주입·결과 회수·타임라인 반영·보안 경계·무인 렌더"라는 파이프라인 하부 구조가 이미 상당히 갖춰져 있다. 전체 자동화 파이프라인 관점의 실제 결손은 (a) 진짜 영상 생성 워크플로우 JSON, (b) 음성 생성 자산, (c) 실행 전 진단(readiness)과 실시간 진행률 — 그리고 이 셋을 한 화면에서 관리하는 대시보드다. (a)(c)는 기존 설계 문서에 구현 경로까지 명시되어 있어, 대시보드는 신규 발명이 아니라 기존 API의 프론트엔드 통합에 가깝다.

### 참조 파일 경로

- `E:\ai_tool\Danbi_Studio\docs\COMFYUI_AUTOMATION_KR.md`
- `E:\ai_tool\Danbi_Studio\docs\TOOBUSY_PINGPONG_DANBI_APPLICATION_ANALYSIS_KR.md`
- `E:\ai_tool\Danbi_Studio\docs\COMFYUI_VIEWER_OPENREEL_EXTENSION_ANALYSIS_KR.xhtml`
- `E:\ai_tool\Danbi_Studio\workflows\broll_i2v.json`, `broll_reference_i2v.json`, `test_workflow.json`
- `E:\ai_tool\Danbi_Studio\scripts\headless-render-entry.ts`, `render-worker-entry.ts`, `render-worker-daemon-entry.ts` (`.mjs`는 esbuild 래퍼)
- 존재 확인된 핵심 lib: `E:\ai_tool\Danbi_Studio\src\lib\comfyui-client.ts`, `workflow-loader.ts`, `comfyui-workflow-defaults.ts`, `src\lib\editor\comfyui-queue.ts`, `comfyui-results.ts`, `comfyui-workflows.ts`, `comfyui-bridge.ts`, `ai-broll-gap-fill.ts`, `automation.ts`, `hooks.ts`, `webhook-runner.ts`, `render-queue.ts`, `ffmpeg-renderer.ts`