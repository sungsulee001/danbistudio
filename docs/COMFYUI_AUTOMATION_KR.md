# ComfyUI 자동화 연결 설계

## 목표

편집자가 타임라인에서 선택한 클립을 별도 복사 작업 없이 ComfyUI 생성 작업으로 보낼 수 있어야 한다. 자동화는 수동 버튼, 빈 구간 감지, 내보내기 전 처리, 외부 webhook 호출, batch queue를 모두 지원해야 한다.

## 현재 API

### 편집 이벤트 hook

```http
GET /api/editor/hooks
```

지원 이벤트:

- `manual`
- `on-import`
- `before-export`
- `on-gap`

```http
POST /api/editor/hooks
Content-Type: application/json
```

요청:

```json
{
  "event": "before-export",
  "project": "<EditorProject JSON>",
  "selectedClipIds": ["clip-ai-city"],
  "assetIds": [],
  "applyLocalActions": true
}
```

응답:

```json
{
  "projectId": "danbi-demo-project",
  "event": "before-export",
  "matchedRuleCount": 1,
  "actionCount": 1,
  "actions": [
    {
      "provider": "local",
      "trigger": "before-export",
      "status": "prepared",
      "description": "Local hook prepared for Caption, loudness, color pass"
    }
  ],
  "warnings": [],
  "appliedLocalActions": {
    "changed": true,
    "appliedActionIds": ["rule-before-export-caption-burn-in"],
    "appliedClipIds": ["clip-interview-1"],
    "warnings": []
  },
  "appliedProject": "<updated EditorProject JSON>"
}
```

현재 webhook은 기본 준비 단계에서는 payload만 만들고, 사용자가 Automation Hooks panel 또는 `/api/editor/hooks`에서 `executeWebhooks=true`를 명시했을 때만 실행한다. 실행은 `/api/editor/*`의 `DANBI_EDITOR_API_TOKEN` gate, `DANBI_EDITOR_WEBHOOK_ALLOWLIST`, `DANBI_EDITOR_WEBHOOK_ALLOW_LOCALHOST`, timeout, retry 한도, scoped env secret 정책을 통과해야 한다. bearer token은 automation rule에 직접 넣는 legacy 방식도 호환되지만, 권장 방식은 rule parameter에 `tokenSecret: "LOCAL_N8N"`처럼 alias만 저장하고 실제 값은 `DANBI_EDITOR_WEBHOOK_SECRET_LOCAL_N8N` 환경 변수에 둔다. runner는 token/secret 계열 parameter를 webhook body에서 `[redacted]`로 치환한다. local hook은 caption burn-in, loudness normalization, color pass 같은 export 준비 작업을 구조화된 action summary로 반환하고, `applyLocalActions=true`일 때 updated project까지 반환한다.

### 자동화 계획 생성

```http
POST /api/editor/automation
Content-Type: application/json
```

요청:

```json
{
  "project": "<EditorProject JSON>",
  "selectedClipIds": ["clip-ai-city"]
}
```

응답:

```json
{
  "projectId": "danbi-demo-project",
  "jobs": [
    {
      "id": "comfyui-clip-ai-city",
      "clipId": "clip-ai-city",
      "workflowName": "broll_i2v",
      "parameters": {
        "prompt": "cinematic Seoul studio...",
        "steps": 24,
        "fps": 30,
        "duration_seconds": 8
      }
    }
  ],
  "generatePayloads": [
    {
      "modelName": "wan_i2v",
      "workflowName": "broll_i2v",
      "parameters": {}
    }
  ],
  "webhookPayloads": []
}
```

### ComfyUI batch queue

```http
GET /api/editor/comfyui-jobs
```

최근 ComfyUI queue job snapshot을 조회한다.

```http
POST /api/editor/comfyui-jobs
Content-Type: application/json
```

요청:

```json
{
  "project": "<EditorProject JSON>",
  "selectedClipIds": ["clip-ai-city"],
  "priority": 25,
  "modelName": "wan_i2v",
  "execute": false
}
```

응답:

```json
{
  "job": {
    "id": "queue-job-id",
    "projectId": "danbi-demo-project",
    "status": "queued",
    "progress": 0,
    "priority": 25,
    "modelName": "wan_i2v",
    "execute": false,
    "totalJobs": 1,
    "completedJobs": 0,
    "failedJobs": 0,
    "promptIds": {},
    "warnings": [],
    "plan": {},
    "payloads": []
  }
}
```

`execute=false`가 기본값이다. 이 모드는 외부 ComfyUI 서버 없이 automation plan과 generate payload를 검증하고 completed 상태로 끝난다. `execute=true`일 때는 workflow JSON을 load/inject한 뒤 ComfyUI `/prompt`에 실제 queue를 넣고 `promptIds`를 기록한다. prompt가 success 상태가 되면 output 파일을 로컬 개발에서는 `.danbi/outputs`, Electron 패키지에서는 `userData/outputs`로 복사하고 `/outputs/...` route를 통해 result snapshot에 preview용 `source`와 FFmpeg용 `renderPath`를 기록한다.

Security boundary 2026-06-15: ComfyUI execution defaults to localhost-only targets. `COMFYUI_URL` may point at `localhost`, `127.0.0.1`, or `::1`; remote ComfyUI servers require an explicit origin in `COMFYUI_ALLOWED_URLS`/`COMFYUI_ALLOWLIST`. The client rejects URL credentials, non-HTTP protocols, and unlisted remote targets before `fetch`. Completed output filenames are resolved under `COMFYUI_OUTPUT` and blocked if they contain null bytes, absolute paths, URL/protocol strings, or `../` escapes.

```http
GET /api/editor/comfyui-jobs/:id
DELETE /api/editor/comfyui-jobs/:id
POST /api/editor/comfyui-jobs/:id
```

- `GET`: 단일 job status 조회
- `DELETE`: queued/running job 취소
- `POST`: failed/cancelled/completed job을 새 job으로 retry

루트 `DELETE /api/editor/comfyui-jobs`도 `{ "id": "queue-job-id" }` body로 취소를 지원한다.

### 기존 생성 API 재사용

자동화 응답의 `generatePayloads[]`는 기존 생성 엔드포인트에 보낼 수 있다.

```http
POST /api/generate
Content-Type: application/json
```

## Queue 설정

```http
GET /api/editor/queue-settings
PUT /api/editor/queue-settings
```

ComfyUI 관련 설정:

- `comfyuiConcurrency`: 동시에 실행할 ComfyUI batch job 수, 현재 1-4 범위
- `defaultComfyUIPriority`: 기본 priority, 현재 -100에서 100 범위

priority가 높을수록 먼저 실행된다. priority가 같으면 먼저 생성된 job이 먼저 실행된다.

## 결과 반영

`src/lib/editor/comfyui-results.ts`는 completed result snapshot을 프로젝트 asset과 timeline clip으로 변환한다.

- 편집 화면의 `AI Result Review` 패널은 원본 clip과 ComfyUI 결과를 side-by-side로 보여준다.
- 기본 모드: `AI Results` 후보 트랙에 원본 clip과 같은 start/duration으로 결과 clip을 추가한다.
- 교체 모드: 사용자가 승인하면 원본 clip의 asset을 결과 asset으로 바꾼다. 이 편집은 undo/redo history에 들어간다.
- 결과 asset은 `metadata.generated = true`, `provider = comfyui`, `sourceClipId`, `automationJobId`, `promptId`, `promptLineage`를 기록한다.
- `source`는 browser preview용 public path이고 `renderPath`는 FFmpeg 렌더용 파일 시스템 경로다.

## ComfyUI workflow 매핑

현재 구조는 `workflowName`과 `parameters`를 분리한다.

- `workflowName`: `workflows/{name}.json`
- `parameters.prompt`: 프롬프트
- `parameters.seed`: 시드
- `parameters.steps`: 샘플링 step
- `parameters.duration_seconds`: 타임라인 clip 길이
- `parameters.timeline_start_seconds`: 타임라인 시작 위치

`src/lib/workflow-loader.ts`가 workflow JSON에서 같은 이름의 input을 찾아 주입한다.

`src/lib/editor/comfyui-workflows.ts`는 B-roll I2V, style transfer, upscale restore, background remove, interpolation preset을 제공한다. Inspector의 `ComfyUI Binding` 패널은 선택 clip의 preset, workflowName, prompt, negative prompt, seed, steps, CFG, width, height를 undo 가능한 generation binding으로 저장한다. `buildComfyUIAutomationPlan`은 이 binding을 읽어 최종 ComfyUI payload에 `workflow_preset`과 clip별 override를 포함한다.

`src/lib/editor/ai-broll-gap-fill.ts`는 non-audio 트랙의 visual coverage를 병합해 실제 빈 화면 구간을 찾는다. 편집기 타임라인의 `AI Fill` 버튼은 해당 gap에 `broll-i2v` preset 기반 ComfyUI draft clip을 `AI B-roll` 트랙에 만들고, 생성된 clip은 일반 ComfyUI batch와 같은 payload 경로를 사용한다.

`ai-morph` outgoing transition은 `transition-morph` preset 기반 ComfyUI job으로 변환된다. payload에는 `transition_type`, `transition_duration_seconds`, `transition_to_clip_id`, `transition_to_clip_name`이 포함되어 adjacent clip 사이의 morph 생성에 사용할 수 있다.

## 남은 자동화 확장

1. 원본/결과 review metadata 고도화
   - waveform, duration, resolution, prompt metadata를 더 촘촘하게 보여준다.

2. Webhook 운영 고도화
   - allowlist/API token gate/env secret/retry/redaction은 구현되어 있다.
   - 남은 작업은 조직 단위 credential vault 연동이나 배포별 webhook preset 관리가 필요할 때 별도 범위로 둔다.

3. Batch 품질 향상
   - workflow cost와 VRAM 추정 기반 scheduling
   - 실패한 하위 clip만 재시도
   - 결과 ingest 후 timeline에 자동 반영
