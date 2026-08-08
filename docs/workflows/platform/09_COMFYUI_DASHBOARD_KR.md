# P2. ComfyUI 대시보드 — 큐/진행률/Readiness/갤러리 관리 UI

> Danbi Studio 영상 자동화 파이프라인 플랫폼 문서. 마스터 보고서: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)
> 사용자 요구: **"git-scm.com 설치 페이지보다 심플하고 좋게"** — 설정 나열이 아니라, 상태가 한눈에 보이고 다음 행동이 하나뿐인 화면.

---

## 1. 목적과 범위

### 목적

파이프라인 S4(이미지 생성)·S5(영상/음성/BGM 생성)가 ComfyUI에 잡을 밀어 넣을 때, 사용자가 **한 화면에서** ① ComfyUI가 지금 실행 가능한 상태인지(readiness), ② 큐에 무엇이 있고 어디까지 진행됐는지, ③ 결과물이 무엇인지 확인·회수할 수 있게 하는 관리 UI를 정의한다.

### 이 문서가 다루는 것

- 상태 헤더 / 워크플로우 카탈로그 / 큐 보드 / 갤러리 4구역 화면 설계 [제안]
- 신규 데이터 소스 2종(readiness API, WebSocket 진행률 브리지)의 계약 — 설계는 이미 Danbi 문서에 존재하며 미구현 상태 [사실]
- `/interrupt`·`/free`·`/view` 등 ComfyUI 원시 API의 UI 노출 원칙
- 구현 단계 체크리스트

### 이 문서가 다루지 않는 것

- ComfyUI 설치·업데이트·모델 다운로드 자동화 — **StabilityMatrix에 위임**한다(브리프 §6: ComfyUI는 StabilityMatrix 관리, localhost:8188). 대시보드는 "설치 관리자"가 아니라 "상태 표시기 + 원클릭 진단기"다. 이것이 "심플" 원칙의 핵심 경계다.
- 워크플로우 JSON 자체의 제작 방법 — [../stages/04_IMAGE_GEN_WORKFLOW_KR.md](../stages/04_IMAGE_GEN_WORKFLOW_KR.md), [../stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md](../stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md) 담당.
- 콘티·이미지·영상 통합 제어 — [./08_UNIFIED_BUILDER_KR.md](./08_UNIFIED_BUILDER_KR.md)(P1) 담당. 대시보드는 P1이 내려다보는 "기계실 계기판"이다.

### 핵심 포지셔닝 [사실]

이 대시보드는 **신규 발명이 아니라 기존 API의 프론트엔드 통합**이다. 자동화 분석 보고서의 종합 판단 그대로: 큐잉·주입·결과 회수·보안 경계는 이미 구현·문서화되어 있고, 결손은 (a) readiness 진단, (b) 실시간 진행률, (c) 이 둘을 기존 큐/갤러리와 한 화면에 모으는 UI다.

- 호스트 페이지: 신규 페이지 신설보다 기존 `/ai-studio`(workflow browser·queue·결과 히스토리)와 `/automation`(hook/queue 설정)을 확장하는 것이 Danbi 내부 문서들의 일관된 권고 [사실].
- 청사진: `docs/TOOBUSY_PINGPONG_DANBI_APPLICATION_ANALYSIS_KR.md`의 dashboard 분석이 기능 목록의 사실상 청사진 [사실]. 단, **대상 저장소(toobusy_pingpong)에 LICENSE가 없어 코드·워크플로우 JSON 직접 복사 금지, clean-room 재구현만 허용** [사실].

---

## 2. 입력/출력 계약

대시보드는 vault(지식 계층)를 직접 만지지 않는다. 운영 데이터(SQLite·API 스냅샷)만 소비하고, vault와의 연결은 잡 메타데이터의 `production_id` 표기(§3.3)로 간접 유지한다(브리프 §2-2: 조인 키는 `production_id`와 `comfyui_job_ids` 둘뿐).

### 2.1 기존 데이터 소스 — 재사용 [사실]

| 소스 | 계약 | 대시보드에서의 용도 |
|---|---|---|
| `GET/POST /api/editor/comfyui-jobs` | 큐 스냅샷(status/progress/priority/promptIds/warnings). `execute=false`(기본)는 dry-run 검증, `execute=true`만 실제 큐잉 | 큐 보드의 데이터 원천. 등록 마법사의 사전 검증 |
| `/api/editor/comfyui-jobs/:id` GET/DELETE/POST(retry) | 잡 단건 조회·취소·재시도 | 큐 카드의 액션 버튼에 1:1 직결 |
| `GET/PUT /api/editor/queue-settings` | `comfyuiConcurrency`(1–4), `defaultComfyUIPriority`(-100~100) | 상태 헤더의 동시성·우선순위 제어 위젯 |
| `src/lib/comfyui-client.ts` | ComfyUI `/prompt`, `/upload/image`, `/history`, `/system_stats` 호출 계층 | 신규 readiness API가 재사용할 하부 클라이언트 |
| `src/lib/editor/comfyui-queue.ts` | priority/동시성/persistent snapshot/cancel/retry | 큐 보드가 표시하는 실체 |
| `src/lib/editor/comfyui-results.ts` | result snapshot → asset 변환. 메타: `provider=comfyui`, `sourceClipId`, `automationJobId`, `promptId`, `promptLineage`, `requestPrompt`/`generatedPrompt`/workflow/seed | 갤러리 카드의 메타데이터 원천 |
| `workflows/*.json` + `src/lib/editor/comfyui-workflows.ts` preset | API-format 워크플로우 템플릿과 preset 목록 | 워크플로우 카탈로그의 목록 원천 |

### 2.2 신규 데이터 소스 — 설계 존재·미구현 [사실]

toobusy_pingpong 적용 분석 문서의 P1 항목. 설계와 제안 경로까지 명시되어 있고 구현만 남았다.

| 신규 소스 | 계약(설계 문서 기준) | 대시보드에서의 용도 |
|---|---|---|
| **Readiness API** (제안 경로: `src/app/api/editor/comfyui-readiness/route.ts`) | ComfyUI `/system_stats` + `/object_info`를 조합해 (a) online/offline, (b) VRAM 총량/사용량, (c) 등록된 워크플로우가 요구하는 custom node·모델 중 **누락된 것**을 실행 전 진단 | 상태 헤더의 신호등 + 워크플로우 카탈로그의 워크플로우별 "실행 가능/누락 있음" 배지. 대시보드의 핵심 차별점 |
| **WebSocket 진행률 브리지** (`ws://localhost:8188/ws?clientId=...`) | 잡별 고유 `client_id`로 노드 단위 실행 상태·sampling %·current node·`executed`·`execution_error` 수신. **CUDA OOM은 HTTP 오류가 아니라 `execution_error` 이벤트로 도착**하므로 이 채널이 오류 감지의 정식 경로 [사실]. polling(`/history`) fallback 유지 | 큐 카드의 실시간 진행 바("KSampler 14/24 · 58%") |
| **`/interrupt`, `/free` 제어** | 현재 실행 중단(interrupt), 모델 언로드·VRAM 해제(free). **명시적 사용자 액션으로만 호출** — 자동 트리거 금지가 확정 원칙 [사실] | 상태 헤더의 위험 구역(danger zone) 버튼 2개 |
| **`/view` 다운로드 fallback** | 출력 경로 불일치(output 디렉터리 매핑 실패) 시 ComfyUI `/view`로 결과 파일을 직접 내려받는 우회로 | 갤러리 썸네일 안정화 — "결과는 있는데 그림이 안 뜨는" 상태 제거 |

### 2.3 보안 경계 — 모든 신규 endpoint가 통과해야 할 조건 [사실]

기존 확정 경계(2026-06-15 기준)를 그대로 상속한다. 대시보드가 이 경계를 우회하는 경로를 새로 만들면 안 된다.

- ComfyUI 대상은 **localhost 기본**. 원격은 `COMFYUI_ALLOWED_URLS`/`COMFYUI_ALLOWLIST` 명시 필요. URL credential·비HTTP 프로토콜 거부.
- 출력 파일명은 `COMFYUI_OUTPUT` 하위로 제한, `../` 등 경로 탈출 차단.
- `/api/editor/*` 신규 route는 `DANBI_EDITOR_API_TOKEN` 게이트 통과.
- readiness API·WS 브리지도 동일: 브라우저(렌더러)가 ComfyUI에 직접 붙지 않고 **Danbi API 계층을 경유**한다(토큰·allowlist 일원화) [제안].

### 2.4 상태 모델 [제안]

대시보드가 다루는 상태는 두 층이다. 파이프라인 문서의 frontmatter `status`(draft→approved→…)와 혼동하지 않는다 — 그것은 vault의 창작물 상태이고, 아래는 운영 상태다.

- **서버 상태**: `online / offline / degraded`(응답은 하나 VRAM 임계 초과 또는 필수 노드 누락).
- **잡 상태**: 기존 comfyui-jobs의 status 값을 그대로 표시(대시보드가 새 상태를 발명하지 않는다). 진행률은 WS 이벤트로 보강, WS 끊김 시 polling 값으로 대체.
- **워크플로우 readiness**: `ready / missing-nodes / missing-models / unknown`(ComfyUI offline 시).

---

## 3. 워크플로우 (사용자 흐름)

### 3.0 화면 구성 4구역 [제안]

한 페이지, 세로 4구역. git-scm.com 설치 페이지의 실패(선택지·문단·링크가 병렬 나열되어 "내가 뭘 하면 되는지"가 안 보임)를 뒤집어, **각 구역은 "현재 상태 + 단 하나의 주요 행동"만 노출**한다.

```
┌ ① 상태 헤더 ─ ComfyUI ●online │ VRAM 18.2/24GB │ 동시성 1 │ [진단 실행] ┐
├ ② 워크플로우 카탈로그 ─ 등록된 템플릿 카드 + readiness 배지 + [+ 등록]   ┤
├ ③ 큐 보드 ─ 실행 중/대기/실패 카드, 진행 바, 취소·재시도·우선순위        ┤
└ ④ 갤러리 ─ 결과 카드(promptLineage 메타), 타임라인 보내기, undo 삭제     ┘
```

### 3.1 상태 확인 흐름 (① 상태 헤더)

1. 페이지 진입 시 readiness API 1회 호출 → 신호등(●online/●offline/●degraded)·VRAM 게이지·동시성 표시.
2. **offline이면**: 설치·구동 안내를 늘어놓지 않는다. 한 줄 안내 "ComfyUI가 꺼져 있습니다 — StabilityMatrix에서 실행하세요"와 재확인 버튼만 노출 [제안]. StabilityMatrix 프로세스 직접 기동/딥링크는 외부 앱 제어 API 확인 전까지 범위 밖(§8 리스크, 미결 사항).
3. **[진단 실행]** 버튼: readiness API를 등록된 전체 워크플로우 대상으로 재실행 → 누락 custom node/모델을 워크플로우별 배지로 갱신. 진단 결과는 "무엇이 없는지 + 어느 워크플로우가 막히는지"만 보여주고, 설치 행위 자체는 StabilityMatrix/ComfyUI Manager 몫으로 남긴다.
4. 위험 구역(접힌 상태 기본): **[실행 중단(/interrupt)]**, **[VRAM 해제(/free)]**. 각각 확인 다이얼로그 필수 — 명시적 사용자 액션 원칙 [사실]. `/free`는 실행 중 잡이 있으면 경고 후 진행 여부를 다시 묻는다 [제안].

### 3.2 워크플로우 등록 흐름 (② 카탈로그 + 등록 마법사)

배경 [사실]: 현재 `workflows/*.json` 3종은 이름과 달리 **모두 이미지 생성용**(broll_i2v.json은 SD1.5 t2i)이고, 파라미터 주입(`injectParameters`)은 이름 기반 전체 치환이라 복잡 워크플로우에서 오작동 위험이 있다. 이를 해소하는 **workflow import/analyzer가 pingpong 적용 문서의 P2 설계로 존재**한다(API-format JSON에서 prompt/negative/seed/image/output/ratio/model 노드를 추정해 node-specific `ComfyUIWorkflowBindingSpec`으로 등록).

마법사 4단계 [제안]:

1. **드롭**: 사용자가 ComfyUI에서 "Export (API Format)"한 JSON을 드래그 앤 드롭.
2. **분석**: analyzer가 노드 역할 추정 결과를 표로 제시 — "프롬프트는 노드 6번 `CLIPTextEncode`, seed는 노드 3번 `KSampler`…". 사용자가 오추정을 드롭다운으로 교정(인간 확인 게이트 — 자동 등록 금지).
3. **사전 검증**: `POST /api/editor/comfyui-jobs`의 `execute=false` dry-run으로 주입 payload 검증 + readiness API로 요구 노드/모델 충족 확인.
4. **등록**: `workflows/` 폴더에 버전 관리 대상으로 저장 + binding spec 등록 → 카탈로그 카드 생성(이름·용도 태그·요구 모델·readiness 배지).

카탈로그 카드는 "이 워크플로우가 실제로 무엇을 하는가"(t2i/i2i/I2V/오디오)를 analyzer 추정 기반으로 정직하게 표기한다 — 현 자산처럼 이름(`broll_i2v`)과 실체(t2i)가 어긋나는 상태를 UI가 드러내 교정 유도 [제안].

### 3.3 잡 실행·모니터링 흐름 (③ 큐 보드)

1. 잡 유입 경로는 둘: (a) 파이프라인 S4/S5·통합 빌더(P1)가 API로 enqueue, (b) 카탈로그 카드에서 수동 [실행]. 어느 쪽이든 같은 comfyui-jobs 큐에 쌓인다 [사실: 큐 경로 / 제안: 카드 실행 버튼].
2. 큐 카드 표시: 워크플로우명, 상태, 진행 바(WS: current node + sampling %), 우선순위, `production_id`(잡 파라미터에 있을 때 — 파이프라인 유입 잡을 프로덕션별로 묶어 보는 그룹 뷰 제공) [제안].
3. 카드 액션: [취소](DELETE), [재시도](retry POST), 우선순위 조절(queue-settings 범위 -100~100 내) — 전부 기존 API 1:1 매핑 [사실].
4. 실패 카드: `execution_error` 이벤트 요약(특히 CUDA OOM은 "VRAM 부족 — 해제 후 재시도" 안내로 번역)과 [재시도]·[VRAM 해제 후 재시도] 제안 버튼. 후자도 사용자 클릭으로만 실행 [제안].
5. WS 끊김 시: 진행 바를 "폴링 모드" 표시로 강등하고 `/history` 폴링 값으로 유지 — 화면이 죽지 않는 것이 우선 [사실: fallback 설계 존재].

### 3.4 결과 검토 흐름 (④ 갤러리)

1. 완료 잡의 result snapshot·asset 메타데이터를 카드화: 썸네일, `requestPrompt`/`generatedPrompt`, workflow, seed, `sourceClipId`, `promptId`, `promptLineage` [사실: 메타 필드 존재].
2. 썸네일 로드 실패 시 `/view` fallback으로 재시도 [사실: 설계 존재].
3. 카드 액션 [제안]: [타임라인으로](기존 AI Result Review 경로 재사용), [프롬프트 복사], [같은 설정으로 재생성](seed만 변경), [삭제].
4. **삭제는 undo 가능한 asset state action** — destructive 즉시 삭제 금지가 pingpong 적용 문서의 권고 [사실]. 휴지통 상태 + 되돌리기 토스트 [제안].

### 3.5 승인 게이트 정리

- 파이프라인의 인간 승인 게이트(`draft→approved`)는 vault에서 일어나며 대시보드 소관이 아니다. 대시보드의 게이트는 **파괴적 행위 3종**: `/interrupt`·`/free`·갤러리 삭제 — 전부 명시적 사용자 액션 + 확인 단계, 자동 트리거 금지.
- 등록 마법사 2단계(노드 역할 확인)도 인간 확인 게이트다 — analyzer 추정을 무검토 자동 등록하지 않는다.

---

## 4. 구현 기술 (코드 없음)

- **호스트**: 기존 `/ai-studio` 페이지를 대시보드 셸로 확장(워크플로우 browser·queue·히스토리가 이미 있으므로 4구역 재배치가 본질). 큐 동시성·우선순위 설정 위젯은 `/automation`의 queue-settings UI를 상태 헤더로 인라인 [사실: 권고 / 제안: 배치].
- **readiness API**: Danbi 서버 측 신규 route(제안 경로 `src/app/api/editor/comfyui-readiness/route.ts`)가 `comfyui-client.ts`를 통해 `/system_stats`·`/object_info`를 조회하고, 등록된 binding spec의 요구 노드/모델 목록과 대조해 진단 결과를 반환. 렌더러는 ComfyUI에 직접 접속하지 않는다.
- **WS 브리지**: Danbi 메인 프로세스(또는 서버 계층)가 잡별 고유 `client_id`로 ComfyUI WS를 구독하고, 진행 이벤트를 잡 스냅샷에 병합해 UI로 중계. UI 쪽 실시간 전달 방식(스트리밍 응답/내부 이벤트 채널)은 기존 Danbi 이벤트 인프라를 따른다 [제안].
- **임베드 안정성 패턴** [사실: OpenReel 분석 권고]: 대시보드를 편집기 내부 패널로 임베드할 경우 iframe 재로딩 없는 postMessage 브리지 + panel별 error boundary 패턴 재사용. 한 구역(예: 갤러리)의 오류가 큐 보드를 죽이지 않게 구역별 오류 격리.
- **clean-room 절차**: pingpong 문서에서 가져오는 것은 "기능 목록과 화면 아이디어"까지다. 구현자는 원 저장소 코드를 열람하지 않고 이 문서 + Danbi 내부 문서만 보고 작성한다. 라이선스 가드레일(브리프 §2-10)의 source register에 참고 사실만 기록.
- **"심플" 측정 기준** [제안]: (a) 첫 화면에서 스크롤 없이 서버 상태·실행 중 잡·최근 결과가 보인다, (b) 정상 상태에서 사용자가 읽어야 할 텍스트 20줄 미만, (c) 모든 문제 상태는 "진단 결과 + 다음 행동 버튼 1개" 형식, (d) 설정 항목은 접힌 상태 기본.

---

## 5. 활용 스킬

| 단계 | 스킬 | 용도 |
|---|---|---|
| 화면 설계·시안 | `frontend-design` | 4구역 레이아웃, 상태 신호등·배지·진행 바의 시각 언어. "git-scm보다 심플" 요구의 직접 담당 |
| 구현 계획 수립 | `feature-planner`, `writing-plans` | §6 체크리스트를 실행 플랜으로 전개, 단계별 산출물 정의 |
| 구현 | `test-driven-development`, `subagent-driven-development` | readiness 진단 로직·analyzer 추정 규칙은 픽스처(API-format JSON 샘플) 기반 테스트 선행. 구역별 병렬 구현 |
| 코드 탐색·수정 | Serena (`find_symbol`, `find_referencing_symbols`) | `comfyui-client.ts`·`comfyui-queue.ts`·`comfyui-results.ts` 심볼 단위 파악, 기존 호출부 영향 분석 |
| UI 검증 | `webapp-testing` | 4구역 렌더·액션 버튼·오류 격리(error boundary) 시나리오 테스트 |
| 디버깅 | `systematic-debugging` | WS 이벤트 유실·OOM 이벤트 처리 등 비동기 결함 추적 |
| 완료 검증 | `verification-before-completion` | §7 기계 완료조건을 증거와 함께 확인 후 종료 |

---

## 6. 구현 단계 체크리스트

> 어떤 에이전트가 봐도 착수 가능하도록 선행 조건·작업 항목·검증 방법을 명시한다. 순서 = 의존 순서. 코드는 쓰지 않는다.

### 0단계 — 선행 확인 (모든 단계의 공통 선행 조건)

- [ ] 읽기: `docs/COMFYUI_AUTOMATION_KR.md`, `docs/TOOBUSY_PINGPONG_DANBI_APPLICATION_ANALYSIS_KR.md`, 본 문서, [../appendix/analysis/03_AUTOMATION_COMFYUI_KR.md](../appendix/analysis/03_AUTOMATION_COMFYUI_KR.md)
- [ ] 동작 확인: StabilityMatrix로 ComfyUI 기동 후 `GET /system_stats` 응답 수신, `GET /api/editor/comfyui-jobs`(토큰 포함) 스냅샷 수신, `execute=false` dry-run 1회 성공
- [ ] 검증: 위 3개 호출의 실제 응답 필드를 기록해 §2.1 표와 대조 — 불일치 발견 시 본 문서를 먼저 갱신

### 1단계 — Readiness API (신규 데이터 소스, UI 선행)

- 선행: 0단계. `comfyui-client.ts`에 `/system_stats` 호출 존재 확인(있음 [사실]), `/object_info` 호출 유무 확인(없으면 클라이언트에 추가).
- 작업: ① `src/app/api/editor/comfyui-readiness/route.ts` 신설(제안 경로 [사실: 설계 문서 명시]) — 토큰 게이트·localhost 기본 상속. ② 응답 계약 정의: 서버 상태, VRAM 수치, 워크플로우별 `ready/missing-nodes/missing-models` 목록. ③ 등록 워크플로우의 요구 노드/모델 추출은 우선 단순 규칙(class_type 대조)으로 시작, analyzer(5단계)와 이후 통합.
- 검증: ComfyUI on/off 각각에서 호출해 상태 구분 확인. 존재하지 않는 custom node를 쓰는 테스트용 워크플로우 JSON을 등록해 `missing-nodes` 검출 확인. 토큰 없는 호출이 거부되는지 확인.

### 2단계 — WebSocket 진행률 브리지

- 선행: 0단계. 잡 enqueue 시 `client_id` 발급 지점(`comfyui-queue.ts` 경로) 파악.
- 작업: ① 잡별 고유 `client_id`로 WS 구독, `progress`·`executed`·`execution_error` 이벤트를 잡 스냅샷에 병합. ② OOM(`execution_error`) 전용 분류 — 재시도 가능 오류로 태깅. ③ WS 단절 시 `/history` 폴링 fallback과 "폴링 모드" 플래그.
- 검증: 실제 이미지 잡 1건 실행 중 진행률 수치가 단조 증가하며 스냅샷에 반영되는지 확인. 실행 중 ComfyUI 프로세스를 강제 종료해 fallback 전환 확인. 두 잡 동시 실행 시 이벤트가 잡별로 올바르게 귀속되는지(client_id 분리) 확인.

### 3단계 — 대시보드 셸 + ① 상태 헤더

- 선행: 1단계 완료.
- 작업: ① `/ai-studio`를 4구역 레이아웃으로 재구성(기존 기능 제거 없이 재배치). ② 상태 헤더: 신호등·VRAM 게이지·동시성 표시(queue-settings GET/PUT 연결)·[진단 실행] 버튼. ③ offline 상태의 한 줄 안내 + 재확인 버튼. ④ 구역별 error boundary.
- 검증: ComfyUI off 상태에서 페이지가 오류 없이 뜨고 offline 안내가 보이는지. 동시성 변경이 PUT 후 재조회로 반영되는지. 한 구역 강제 오류 시 다른 구역 생존 확인.

### 4단계 — ③ 큐 보드

- 선행: 2·3단계 완료.
- 작업: ① comfyui-jobs 스냅샷 카드화(상태·진행 바·우선순위·경고). ② [취소]/[재시도]/우선순위 조절을 기존 :id API에 연결. ③ 실패 카드의 오류 요약 + OOM 전용 안내. ④ `production_id` 그룹 뷰(메타 존재 시).
- 검증: dry-run 잡·실제 잡·강제 실패 잡 3종을 만들어 카드 상태 전이 확인. 취소·재시도가 큐 스냅샷에 반영되는지. 진행 바가 2단계 이벤트와 동기화되는지.

### 5단계 — ② 워크플로우 카탈로그 + 등록 마법사 (import/analyzer)

- 선행: 1단계 완료. pingpong P2 설계(`ComfyUIWorkflowBindingSpec`) 숙지.
- 작업: ① analyzer: API-format JSON에서 prompt/negative/seed/image/output/ratio/model 노드 추정 규칙 구현(clean-room — 원 저장소 코드 열람 금지). ② 마법사 4단계 UI(§3.2): 드롭→추정 확인(인간 게이트)→dry-run+readiness 검증→등록. ③ 기존 `workflows/*.json` 3종을 마법사로 재등록해 카탈로그 초기 데이터화 — 이때 `broll_i2v`가 t2i임이 카드에 정직하게 표기되는지가 시금석.
- 검증: 픽스처 JSON(단순 t2i, i2i, 노드 누락본) 3종에 대한 analyzer 추정 결과를 기대값과 대조하는 테스트. 오추정을 마법사에서 수동 교정 후 등록한 binding으로 dry-run payload가 올바른 노드에 주입되는지 확인.

### 6단계 — ④ 갤러리

- 선행: 3단계 완료.
- 작업: ① result snapshot·asset 메타 카드화(promptLineage 포함). ② `/view` fallback 썸네일 로더. ③ [타임라인으로](AI Result Review 경로 재사용)·[프롬프트 복사]·[재생성] 액션. ④ undo 가능한 삭제(상태 전환 + 되돌리기).
- 검증: 출력 파일을 의도적으로 이동시켜 `/view` fallback 발동 확인. 삭제→되돌리기 후 asset 메타 무손실 확인. 카드의 seed·workflow 메타가 원 잡과 일치하는지 확인.

### 7단계 — 제어 버튼과 마감

- 선행: 3·4단계 완료.
- 작업: ① 위험 구역에 [실행 중단]·[VRAM 해제] + 확인 다이얼로그(자동 트리거 코드 경로가 없음을 리뷰로 보장). ② 실패 카드의 [VRAM 해제 후 재시도] 복합 액션(역시 클릭 필수). ③ 보안 점검: 신규 route 전부 토큰 게이트·allowlist·경로 가드 통과 확인. ④ "심플" 기준(§4) 4항목 자체 점검.
- 검증: 실행 중 잡에 interrupt 후 큐 카드가 실패/중단 상태로 정리되는지. `/free` 후 `/system_stats` VRAM 감소 확인. 토큰 없는 접근·allowlist 밖 URL 설정이 거부되는지 확인.

---

## 7. 완료 조건

### 기계(에이전트) 완료조건

- [ ] readiness API가 online/offline/누락 노드·모델을 구분해 반환하고 토큰 게이트를 통과한다 (1단계 검증 통과)
- [ ] 실제 잡 실행 중 WS 진행률이 큐 카드에 표시되고, WS 단절 시 폴링으로 강등된다 (2·4단계 검증 통과)
- [ ] 4구역 화면이 ComfyUI off 상태에서도 오류 없이 렌더되고 구역별 오류가 격리된다 (3단계 검증 통과)
- [ ] 등록 마법사로 픽스처 3종이 등록되고 analyzer 추정 테스트가 통과한다 (5단계 검증 통과)
- [ ] 갤러리 삭제가 undo 가능하고 `/view` fallback이 동작한다 (6단계 검증 통과)
- [ ] `/interrupt`·`/free`가 사용자 확인 없이는 호출되지 않음을 코드 리뷰로 확인 (7단계)
- [ ] 원 저장소(toobusy_pingpong) 코드 미열람으로 구현했음을 source register에 기록 (clean-room 증빙)

### EXTERNAL_PENDING (사람/외부 의존 — 여기서 멈추고 보고)

- [ ] `EXTERNAL_PENDING` — **사용자 UX 수용 판정**: "git-scm.com 설치 페이지보다 심플하고 좋다"는 최종 판단은 사용자 몫. §4의 심플 기준 4항목 충족 증거를 제시하고 판정 대기
- [ ] `EXTERNAL_PENDING` — **실사용 부하 검증**: RTX 3090 실기에서 S4/S5 파이프라인 잡을 흘리며 장시간(수 시간) 관찰하는 인간 QA — VRAM 게이지 정확도, WS 안정성, OOM 안내 적절성
- [ ] `EXTERNAL_PENDING` — **StabilityMatrix 연동 심화 여부 결정**: 프로세스 기동/딥링크 등 외부 제어 수단 존재 여부 확인 후 사용자와 범위 협의(§8 리스크 5)

---

## 8. 리스크와 완화책

| # | 리스크 | 완화책 |
|---|---|---|
| 1 | **이름 기반 파라미터 주입 오작동** [사실: 기존 `injectParameters` 한계] — 복잡 워크플로우에서 엉뚱한 노드에 값 주입 | 5단계 analyzer의 node-specific binding으로 대체. 마법사의 인간 확인 게이트 + dry-run 필수화 |
| 2 | **ComfyUI 버전 드리프트** [사실: 노드 스키마 변경으로 템플릿 파손 가능] — `/object_info` 스키마·custom node class_type 변경 시 readiness 오진 | ComfyUI 버전 고정(StabilityMatrix 프로필) + 등록 워크플로우 대상 스모크 테스트(dry-run 일괄 실행)를 진단 버튼에 포함 [제안] |
| 3 | **clean-room 위반** [사실: toobusy_pingpong LICENSE 부재 → 복사 금지] | 구현자는 원 저장소 열람 금지, 본 문서·Danbi 내부 문서만 참조. source register 기록. 리뷰 시 유사 코드 검사 |
| 4 | **`/free` 오남용으로 실행 중 잡 파괴** — VRAM 해제가 진행 중 샘플링과 충돌 | 실행 중 잡 존재 시 2중 확인. 자동 트리거 금지 원칙을 코드 리뷰 항목으로 고정 [사실: 명시적 액션 원칙] |
| 5 | **StabilityMatrix 외부 제어 불확실** [추정] — 공식 제어 API 부재 시 "원클릭 기동" 불가 | 1차 출시는 안내 문구 + 재확인 버튼까지만. 심화는 EXTERNAL_PENDING으로 분리 |
| 6 | **범위 팽창으로 "심플" 훼손** — 기능이 늘며 git-scm형 나열 UI로 회귀 | §4 심플 기준 4항목을 완료 조건에 포함. reference board·A/B 비교·Telegram 등 pingpong P3/P4 항목은 명시적으로 이번 범위 제외 [사실: 우선순위 문서] |
| 7 | **WS 이벤트 유실·귀속 오류** — 진행률이 다른 잡에 표시 | 잡별 고유 client_id 강제 [사실: 관행], 2단계 검증에 동시 실행 귀속 테스트 포함 |
| 8 | **단일 GPU VRAM 경합** [사실: 브리프 §2-6] — 대시보드에서 수동 실행한 잡이 파이프라인 잡과 충돌 | 수동 실행도 동일 comfyui-jobs 큐 경유(우회 경로 금지) → 기존 직렬화·동시성 설정이 일괄 적용 |

---

## 9. 관련 문서

- 마스터 보고서: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)
- 이 대시보드를 소비하는 단계: [../stages/04_IMAGE_GEN_WORKFLOW_KR.md](../stages/04_IMAGE_GEN_WORKFLOW_KR.md), [../stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md](../stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md)
- 상위 UI(P1 통합 빌더): [./08_UNIFIED_BUILDER_KR.md](./08_UNIFIED_BUILDER_KR.md) — 대시보드는 P1의 기계실 계기판
- 오케스트레이션·승인 게이트: [./11_ORCHESTRATION_KR.md](./11_ORCHESTRATION_KR.md)
- 지식 DB(`production_id` 조인의 반대편): [./10_KNOWLEDGE_DB_KR.md](./10_KNOWLEDGE_DB_KR.md)
- 근거 분석: [../appendix/analysis/03_AUTOMATION_COMFYUI_KR.md](../appendix/analysis/03_AUTOMATION_COMFYUI_KR.md), [../appendix/RESEARCH_AI_TOOLS_KR.md](../appendix/RESEARCH_AI_TOOLS_KR.md)
- Danbi 내부 원 문서: [../../COMFYUI_AUTOMATION_KR.md](../../COMFYUI_AUTOMATION_KR.md), [../../TOOBUSY_PINGPONG_DANBI_APPLICATION_ANALYSIS_KR.md](../../TOOBUSY_PINGPONG_DANBI_APPLICATION_ANALYSIS_KR.md)
