# toobusy_pingpong Danbi 적용 분석

작성일: 2026-07-03  
분석 대상: https://github.com/nicekriss/toobusy_pingpong  
분석 기준 커밋: `7e073584b0bef5a84443897ae8b944a75a19c212` (`2026-06-29 18:10:12 +0900`)  
Danbi 기준 위치: `E:\ai_tool\Danbi_Studio`  
요청 조건: 텔레그램 관련 기능은 후순위

## 결론

`toobusy_pingpong`은 영상 편집기라기보다 로컬 AI 생성 오케스트레이터다. Telegram, LM Studio, ComfyUI, 로컬 대시보드를 하나로 묶고, ComfyUI 워크플로우를 설정 기반으로 주입해 이미지/영상/음악/레퍼런스 보드 생성을 처리한다.

Danbi에는 이미 `src/lib/comfyui-client.ts`, `src/lib/workflow-loader.ts`, `src/lib/editor/comfyui-queue.ts`, `/ai-studio`, `/automation`이 있으므로 프로그램 전체를 이식할 필요는 없다. 적용 가치가 큰 부분은 다음 순서다.

1. ComfyUI 준비 상태 점검과 누락 모델/노드 진단
2. WebSocket 기반 ComfyUI 진행률, interrupt, free memory 처리
3. 워크플로우 등록/분석 도구를 Danbi workflow preset/import 기능으로 재구성
4. 결과 파일 획득 fallback과 AI Studio 갤러리/메타데이터 강화
5. 선택 기능으로 LM Studio 기반 프롬프트 보강
6. Telegram 봇 인터페이스는 후순위

주의: 대상 저장소에는 `LICENSE` 파일이 없다. 따라서 코드나 워크플로우 JSON을 복사해 가져오지 말고, 구조와 동작 패턴만 참고해 Danbi 코드베이스 안에서 clean-room 방식으로 다시 구현해야 한다.

## 대상 프로그램 구조

| 파일 | 역할 | Danbi 적용 관점 |
| --- | --- | --- |
| `pingpong.py` | Telegram 메시지 처리, LM Studio 모델 load/unload, ComfyUI `/prompt` 실행, `/ws` 진행률 수신, `/free`, 결과 파일 수집, 워크플로우 주입 | Telegram은 후순위. ComfyUI 실행 안정성, 진행률, 결과 fallback, 프롬프트 보강 방식은 참고 가치 높음 |
| `dashboard.py` | 로컬 HTTP 대시보드, 갤러리, 생성 요청 큐, 상태 API, 모델 누락 검사, 모델 override, reference preset | Danbi `/ai-studio`와 `/automation`에 적용 가능 |
| `healthcheck.py` | config, ComfyUI 연결, LM Studio, workflow 파일, custom node, model 존재 확인 | Danbi ComfyUI readiness API로 재구성 가능 |
| `register_workflow.py` | ComfyUI API-format JSON에서 prompt/seed/image/output/ratio/dimension 노드를 추정하고 `config.json.custom_workflows`에 등록 | Danbi workflow import wizard와 manifest-only workflow preset 보강에 매우 유용 |
| `config.example.json` | ComfyUI/LM Studio/Telegram/API 경로, 모델명, custom workflow spec | Danbi workflow binding spec 설계 참고 |
| `workflows/` | ComfyUI API workflow JSON | 라이선스 불명확. 직접 복사 금지 |
| `*.bat`, `setup.py` | Windows 설치/실행 보조 | Danbi Electron 배포 구조와는 직접 호환 낮음 |

## 핵심 실행 흐름

1. 사용자 입력이 들어오면 mode를 결정한다.
2. 필요 시 ComfyUI `/free`로 VRAM을 비운다.
3. LM Studio CLI/API로 로컬 LLM을 올려 프롬프트를 정리한다.
4. LLM을 unload한다.
5. 선택된 ComfyUI workflow JSON에 prompt, seed, image input, filename prefix, model override, ratio/size 옵션을 주입한다.
6. ComfyUI `/prompt`로 실행하고 `/ws` 또는 `/queue` polling으로 완료를 기다린다.
7. `/history/{prompt_id}`에서 output reference를 얻는다.
8. output/input/temp 경로를 찾고, 실패하면 ComfyUI `/view`로 결과를 다운로드한다.
9. 결과 파일과 요청/생성 프롬프트 메타데이터를 갤러리에 기록한다.

Danbi의 현재 ComfyUI queue는 5~8번을 이미 일부 수행하지만, Ping-Pong 쪽이 더 강한 부분은 `/ws` 진행률, `/interrupt`, `/free`, `/view` fallback, workflow readiness 진단이다.

## Danbi 현재 구조와 매칭

| Danbi 현재 위치 | 현재 역할 | Ping-Pong에서 보강할 수 있는 점 |
| --- | --- | --- |
| `src/lib/comfyui-client.ts` | `/prompt`, `/upload/image`, `/history`, `/system_stats` health | `/queue`, `/interrupt`, `/free`, `/object_info`, `/view`, `/ws` 진행 이벤트 추가 |
| `src/lib/workflow-loader.ts` | `workflows/*.json` 로드와 단순 parameter key 주입 | 노드 ID 기반 prompt/negative/seed/image/output/ratio/dimension spec 지원 |
| `src/lib/editor/comfyui-queue.ts` | priority/concurrency/persistent snapshot/cancel/retry | 실행 중 node, sampling percent, prompt stage, ComfyUI interrupt/free memory, result fallback |
| `src/app/ai-studio/page.tsx` | workflow browser, queue, AI result history | readiness badge, missing node/model list, live progress, interrupt/free controls, gallery preview |
| `src/lib/result-handler.ts` | ComfyUI output reference를 로컬 output storage로 복사 | 파일이 없을 때 `/view` 다운로드 fallback 추가 |
| `src/lib/editor/comfyui-workflows.ts` | clip binding과 preset 해석 | custom workflow spec, required node/model metadata, import wizard 산출물 연결 |
| `src/app/automation/page.tsx` | hook/queue settings 표시 | workflow mode readiness와 dry-run validation을 더 명확하게 노출 |

## 적용 후보 우선순위

| 우선순위 | 적용 항목 | 기대 효과 | 구현 난이도 | 비고 |
| --- | --- | --- | --- | --- |
| P1 | ComfyUI readiness API | 사용자가 workflow 실행 전에 누락 custom node/model/경로를 알 수 있음 | 중 | `healthcheck.py`, `dashboard.py`의 `object_info` 검사 패턴 참고 |
| P1 | WebSocket 진행률 | AI Studio queue가 `queued/running` 이상으로 sampling %, current node를 보여줄 수 있음 | 중 | `/ws?clientId=...` 이벤트를 TypeScript로 재구현 |
| P1 | `/interrupt`, `/free` 제어 | 긴 생성 중단과 VRAM 해제 가능 | 낮음~중 | 사용자 명시 액션으로만 제공해야 함 |
| P1 | 결과 `/view` fallback | `COMFYUI_OUTPUT` 경로가 맞지 않아도 결과 회수 가능 | 중 | Danbi의 path safety 유지 필수 |
| P2 | workflow import/analyzer | API-format workflow를 Danbi preset으로 등록하기 쉬워짐 | 중~상 | `register_workflow.py`의 추정 알고리즘을 TS로 clean-room 구현 |
| P2 | workflow binding spec | 단순 key injection보다 안정적인 node-specific injection 가능 | 상 | `workflow-loader.ts`, preset schema, UI 변경 필요 |
| P2 | AI Studio gallery/metadata | 생성 결과의 요청 프롬프트, 실제 프롬프트, workflow, seed 비교가 쉬워짐 | 중 | Danbi AI Results와 연결 |
| P2 | LM Studio 프롬프트 보강 | 짧은 사용자 문장을 production prompt로 정리 | 중 | 선택 기능. VRAM 충돌 정책 필요 |
| P3 | reference board/preset | 이미지/영상/LoRA 레퍼런스 워크플로우 UX 개선 | 상 | Danbi media bin과 timeline selection에 맞춰 설계 |
| P3 | A/B workflow compare, VLM scoring | workflow/model 후보 품질 비교 가능 | 상 | 운영 기능 안정화 뒤 적용 |
| P4 | Telegram 봇 | 모바일 원격 생성/알림 | 중 | 요청 조건상 후순위 |

## 세부 적용 제안

### 1. ComfyUI readiness API

Ping-Pong은 `healthcheck.py`와 `dashboard.py`에서 다음을 검사한다.

- `config.json` 존재와 주요 값
- ComfyUI `/system_stats` 연결
- `/object_info/{class}`로 custom node 존재 여부
- loader node의 combo option에서 model filename 존재 여부
- workflow JSON 내부 class/model reference 검증
- Comfy Desktop input/output 자동 감지

Danbi 적용안:

- `src/app/api/editor/comfyui-readiness/route.ts` 추가
- `src/lib/comfyui-client.ts`에 `getSystemStats`, `getObjectInfo`, `getQueueStatus` 추가
- `src/lib/workflow-loader.ts` 또는 새 `src/lib/comfyui-workflow-analyzer.ts`에서 workflow class/model reference 추출
- `/ai-studio`에 workflow별 `Ready / Missing node / Missing model / ComfyUI offline` 표시

효과:

- 현재는 workflow list가 보이더라도 실제 실행 가능 여부를 사용자가 미리 알기 어렵다.
- 모델 파일명 불일치, custom node 누락, ComfyUI 미실행을 실행 전에 차단할 수 있다.

### 2. WebSocket progress, interrupt, free memory

Ping-Pong의 `comfy_run()`은 `/prompt` 실행 전 `/ws`에 연결하고 `progress`, `executing`, `execution_error` 이벤트를 받아 `dashboard_comfy_progress.json`에 기록한다.

Danbi 적용안:

- `ComfyUIClient.queuePromptWithProgress()` 또는 queue 내부 helper 추가
- `ComfyUIQueueJobSnapshot`에 `stage`, `currentNode`, `promptProgress`, `lastComfyUIMessage` 추가
- `src/lib/editor/comfyui-queue.ts`의 `waitForPromptCompletion()` polling을 WebSocket 우선, polling fallback으로 변경
- `src/app/api/editor/comfyui-jobs/[id]/interrupt` 또는 기존 DELETE에서 running job일 때 ComfyUI `/interrupt` 호출 옵션 검토
- `freeMemory()`는 자동 호출보다 AI Studio의 명시적 버튼으로 제공

주의:

- `/free`는 사용자가 열어둔 다른 ComfyUI 작업에도 영향을 줄 수 있다.
- Danbi는 이미 allowlist/localhost guard가 있으므로 새 endpoint도 같은 검증을 통과해야 한다.

### 3. workflow import/analyzer

Ping-Pong의 `register_workflow.py`는 API-format JSON을 분석해 다음 노드를 추정한다.

- positive prompt node
- negative prompt node
- seed node
- image input node
- filename prefix node
- output node
- aspect ratio node
- width/height 또는 megapixels node
- workflow 내부 prompt enhancer bypass switch

Danbi 적용안:

- `src/lib/comfyui-workflow-analyzer.ts` 추가
- API: `POST /api/workflows/analyze` 또는 `POST /api/editor/workflow-import`
- 결과 schema 예시:

```ts
interface ComfyUIWorkflowBindingSpec {
  workflowName: string;
  promptNodes: Array<{ nodeId: string; field: string }>;
  negativeNodes: Array<{ nodeId: string; field: string }>;
  seedNodes: Array<{ nodeId: string; field: string }>;
  imageNodes: Array<{ nodeId: string; field: string }>;
  outputNodeId?: string;
  ratioNode?: { nodeId: string; field: string; options?: Record<string, string> };
  widthNodes?: Array<{ nodeId: string; field: string }>;
  heightNodes?: Array<{ nodeId: string; field: string }>;
  modelFields?: Array<{ nodeId: string; classType: string; field: string; defaultValue: string }>;
}
```

효과:

- 현재 `injectParameters()`는 같은 이름의 field 전체를 바꾸는 방식이라 workflow가 복잡해질수록 오작동 가능성이 있다.
- node-specific spec을 쓰면 사용자가 가져온 workflow를 Danbi preset으로 안정적으로 등록할 수 있다.

### 4. 결과 파일 fallback

Danbi의 `result-handler.ts`는 output filename을 `COMFYUI_OUTPUT` 기준 상대 경로로 해석한다. Ping-Pong은 경로가 맞지 않으면 output/input/temp 후보를 찾고 마지막으로 ComfyUI `/view`에서 결과 bytes를 받아 저장한다.

Danbi 적용안:

- `extractOutputReference()` 결과에 `filename`, `subfolder`, `type`을 유지
- `saveResultFileFromComfyReference(reference, jobId)` 추가
- 우선 로컬 path safety 검증 후 복사
- 복사 실패 시 `ComfyUIClient.viewOutput(reference)`로 다운로드하고 Danbi output storage에 저장

효과:

- ComfyUI Desktop, StabilityMatrix, 독립 ComfyUI 설치 간 output 경로 차이로 실패하는 상황을 줄인다.

### 5. AI Studio 갤러리와 메타데이터

Ping-Pong 대시보드는 갤러리를 페이지 단위로 스캔하고, 이미지 PNG text chunk와 sidecar metadata에서 요청/생성 프롬프트를 표시한다.

Danbi 적용안:

- AI Results 카드에 `requestPrompt`, `generatedPrompt`, `workflowName`, `seed`, `duration/resolution`, `source clip`을 더 명확히 표시
- 결과 비교/교체/효과 패스 적용 경로와 연결
- delete는 실제 삭제보다 `.trash` 또는 Danbi undo 가능한 asset state action으로 제한

### 6. LM Studio 프롬프트 보강

Ping-Pong은 LM Studio CLI `lms load/unload`와 OpenAI 호환 `/v1/chat/completions`를 사용해 이미지/영상/음악 프롬프트를 만든다.

Danbi 적용안:

- 선택 기능으로 `src/lib/local-llm-client.ts` 또는 `src/lib/editor/prompt-enhancer.ts` 추가
- 사용자 문장을 image/video prompt로 정리하는 버튼을 Generate/AI Studio/Inspector에 제공
- 모델 load/unload는 자동화보다 사용자가 켜는 설정으로 둔다.

주의:

- VRAM을 공유하는 환경에서는 ComfyUI와 LLM 동시 상주가 OOM을 만들 수 있다.
- `/free`와 LLM unload는 사용자의 다른 작업 상태를 바꿀 수 있으므로 자동 실행은 위험하다.

### 7. Reference board/preset

Ping-Pong은 reference image, face, outfit, background, pose, style, LoRA를 board item으로 묶어 workflow에 JSON으로 주입한다.

Danbi 적용안:

- Media Bin 선택 항목을 ComfyUI reference role로 태깅
- clip binding에 reference role/preset 저장
- image-to-video, face swap, style reference preset을 UI에서 선택

이 항목은 유용하지만 workflow spec, readiness, progress가 먼저 안정화된 뒤 진행하는 것이 좋다.

### 8. Telegram 기능 후순위

후순위로 둬도 되는 항목:

- Telegram keyboard menu
- Telegram photo upload state machine
- Telegram file send
- Telegram long polling loop

나중에 고려할 경우에도 Danbi 본체에 직접 넣기보다 `webhook` 또는 별도 remote-control plugin으로 분리하는 편이 맞다. Danbi는 데스크톱 편집기와 로컬 workflow host가 중심이므로 Telegram을 핵심 UX로 삼으면 제품 방향이 흐려진다.

## 구현 로드맵

### 1단계: 안전성/가시성

- `ComfyUIClient`에 `/object_info`, `/queue`, `/interrupt`, `/free`, `/view` 메서드 추가
- readiness API 추가
- AI Studio에 ComfyUI online, missing node/model, queue running/pending 표시
- `result-handler.ts`에 `/view` fallback 설계

### 2단계: 실행 진행률

- queue 실행 시 WebSocket progress 수신
- `ComfyUIQueueJobSnapshot`에 stage/progress/current node 추가
- AI Studio queue card에 node/progress/error 표시
- polling fallback 유지

### 3단계: workflow import/analyzer

- workflow JSON 분석 유틸 추가
- prompt/negative/seed/output/model/ratio 후보 추정 테스트 작성
- 분석 결과를 Danbi workflow preset metadata로 저장하는 경로 추가

### 4단계: AI Studio UX 강화

- workflow별 readiness badge
- model override UI
- result prompt metadata 비교
- generated asset hide/delete는 destructive delete가 아니라 asset state action으로 처리

### 5단계: 선택형 LLM/Telegram

- LM Studio 프롬프트 보강은 optional feature flag로 제공
- Telegram은 remote-control plugin 후보로 남김

## 테스트 제안

| 영역 | 테스트 |
| --- | --- |
| ComfyUI client | `/object_info`, `/queue`, `/interrupt`, `/free`, `/view` mock 테스트 |
| workflow analyzer | prompt/negative/seed/image/output/ratio/model field 추정 fixture 테스트 |
| queue progress | WebSocket progress 이벤트 수신, polling fallback, abort 처리 테스트 |
| result fallback | local output copy 실패 후 `/view` 다운로드 성공/실패 테스트 |
| API | readiness route가 offline/missing/ready 상태를 구분하는 테스트 |
| UI | AI Studio가 missing model, running progress, failed job action을 표시하는 Playwright 테스트 |

## 라이선스/소스 경계

- 대상 저장소에 `LICENSE`가 없으므로 직접 복사 금지
- Python 구현을 TypeScript로 그대로 번역하지 말고, 요구사항과 동작만 Danbi 구조에 맞춰 재구현
- 외부 workflow JSON, custom node snapshot, 모델 다운로드 링크도 직접 번들링하지 않음
- 실제 구현 단계에서 이 분석을 계속 참조한다면 `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md` 또는 관련 source reuse audit에 reference-only 항목을 추가하는 것이 안전함

## 최종 판단

가장 먼저 가져올 부분은 Telegram 봇이 아니라 운영 안정성이다. Danbi의 ComfyUI 기능은 이미 제품 구조 안에 들어와 있으므로 Ping-Pong의 장점은 다음처럼 흡수하는 것이 좋다.

- 실행 전 진단: missing node/model을 미리 보여준다.
- 실행 중 가시성: WebSocket progress와 current node를 보여준다.
- 실행 실패 복구: `/view` fallback으로 결과를 회수한다.
- workflow 확장성: API-format JSON을 분석해 Danbi preset으로 등록한다.
- 프롬프트 품질: LM Studio 연동은 선택 기능으로 둔다.

Telegram은 Danbi 본체 적용 우선순위가 낮고, 필요해지면 별도 원격 제어 plugin 또는 webhook adapter로 다루는 것이 적합하다.
