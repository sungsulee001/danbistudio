# P4. 오케스트레이션 — 단계 연결·승인 게이트·헤르메스 판단

- 작성일: 2026-07-05 · 상태: 설계 확정(구현 전) · 근거: 공용 브리프 §2, `research_github-refs.md`, `analyze_platform-arch.md`, `analyze_editor-state.md`
- 표기: [사실] = 분석 보고서·코드에서 검증된 내용, [제안] = 이 문서의 새 설계

---

## 1. 목적과 범위

이 문서는 S1(시나리오)~S7(업로드) 7개 단계를 **하나의 파이프라인으로 연결하는 제어 계층**을 정의한다. 다루는 것:

1. 제어 모델 — vault의 `status` 필드를 게이트로 쓰는 상태 머신과 오케스트레이터 제어 루프.
2. 승인 게이트 4개 — 인간이 반드시 개입하는 지점과 각 게이트의 UI/도구.
3. 단계적 자동화 — 1단계(반자동, Claude Code 스킬 체계, **현행 권고**)와 2단계(무인화, cron+메신저 승인)의 구분, 그리고 hermes-agent 도입 판단.
4. 실패 처리 — 재시도 정책, `EXTERNAL_PENDING` 정지 규약, preflight blocked 대응.
5. 관측성 — `log.md` append-only 이력, Danbi 잡 스냅샷, 주간 Lint 보고.

다루지 않는 것: 각 단계 내부 절차(→ `../stages/` 각 문서), vault 스키마 상세(→ [./10_KNOWLEDGE_DB_KR.md](./10_KNOWLEDGE_DB_KR.md)), 빌더/대시보드 UI(→ [./08_UNIFIED_BUILDER_KR.md](./08_UNIFIED_BUILDER_KR.md), [./09_COMFYUI_DASHBOARD_KR.md](./09_COMFYUI_DASHBOARD_KR.md)).

**설계 대원칙** (브리프 §2-1 확정): Danbi Studio는 실행 엔진이고 오케스트레이터는 외부에 둔다. Danbi 잡 시스템은 잡 타입별 개별 서비스이지 범용 DAG 워크플로 엔진이 아니므로[사실], 전체 파이프라인 제어는 Danbi 위가 아니라 **외부에서 Danbi의 API/CLI/잡을 스텝 단위로 호출**하는 구조가 현실적이다[사실]. 오케스트레이터가 Danbi 내부 큐 구현에 직접 의존하는 것은 금지 — 큐 모듈은 위치 이동 중인 구조 부채이므로 API 라우트/IPC 계약 수준에만 의존한다[사실].

---

## 2. 입력/출력 계약

### 2.1 오케스트레이터가 읽는 것 / 쓰는 것 [제안]

| 방향 | 대상 | 내용 |
|---|---|---|
| 읽기 | `DanbiVault/20-productions/<production_id>/*.md` frontmatter | 각 단계 문서의 `status`, `comfyui_job_ids`, 산출물 경로 |
| 읽기 | Danbi `/api/editor/comfyui-jobs`, `/api/editor/render-jobs` | 잡 진행률·완료·실패 스냅샷 (폴링) — 큐는 queue/poll/cancel/retry 지원[사실] |
| 읽기 | Danbi `jobs/*.json` (로컬 데이터 루트) | 잡 영속 스냅샷의 파일 폴백 확인용[사실] |
| 쓰기 | 각 단계 문서 frontmatter `status` | 단계 완료 시 전이 기록 (단, 승인 전이는 절대 쓰지 않음 — §3.2) |
| 쓰기 | `DanbiVault/log.md` | append-only 이벤트 로그 (§2.4) |
| 쓰기 | `DanbiVault/00-inbox/` | 실패·정지 보고 노트, 주간 Lint 보고 노트 |

조인 키는 브리프 확정대로 `production_id`(형식 `YYYY-MM-DD-topic-slug`)와 `comfyui_job_ids`(SQLite `GenerationJob.id`) 둘뿐이다. 동기화는 단방향 이벤트 2개(잡 완료→vault append, vault 승인→잡 enqueue)만 허용한다.

### 2.2 상태 머신과 게이트 매핑 [제안]

브리프 §2-5 확정 상태 머신 `draft → approved → generated → edited → published`(+`archived`)를 **프로덕션 수준 대표 상태**로 쓰고, 게이트 판정은 **단계 문서별 frontmatter `status`**로 한다. 문서별 필드 정의는 [./10_KNOWLEDGE_DB_KR.md](./10_KNOWLEDGE_DB_KR.md)의 스키마(`CLAUDE.md`)가 최종 기준이다.

| 감시 문서 | 감시 전이 | 게이트 | 통과 시 기동하는 단계 |
|---|---|---|---|
| `00-scenario.md` | `draft → approved` | **G1 시나리오 승인** (인간) | S2 대본 |
| `01-script.md` | 작성 완료 (`draft` 기록) | 게이트 없음 — 자동 연쇄 | S3 콘티 |
| `02-storyboard.md` | `draft → approved` | **G2 콘티 승인** (인간, P1 빌더) | S4 이미지 생성 → S5 영상·음성·BGM |
| `03-assets.md` | 전 컷 에셋 확보 → `generated` | 게이트 없음 — 자동 연쇄 | S6 편집 초안 컴파일 |
| S6 편집 초안 | 인간 검수 → `edited` | **G3 편집본 승인** (인간, Danbi UI) | S6 최종 렌더 → S7 준비 |
| `04-publish.md` | `draft → approved` | **G4 업로드 승인** (인간, 초기 한정) | S7 업로드 실행 |
| `04-publish.md` | 게시 완료 → `published` | — | 회고 노트 생성, 파이프라인 종료 |

- 대본(S2)은 별도 게이트 없이 콘티로 연쇄한다. 대본 품질 이슈는 G2 콘티 승인에서 함께 반려된다(콘티가 대본을 인용하므로 한 화면 검토 가능) [제안].
- 상태 역행(예: `approved → draft` 반려)은 허용하되 반드시 `log.md`에 반려 사유와 함께 기록한다 [제안].

### 2.3 잡 브리지 계약 [사실 기반 제안]

생성·렌더 단계(S4/S5/S6)는 Danbi 잡으로 실행되므로, 오케스트레이터는 다음 절차로 잡을 추적한다.

1. **enqueue**: 승인된 vault 문서(콘티·에셋 목록)를 근거로 Danbi API에 잡 등록 — ComfyUI 생성은 `comfyui-jobs`, 렌더는 `render-jobs`. 모든 `/api/editor/*` 접근은 `DANBI_EDITOR_API_TOKEN` 인증을 거친다[사실].
2. **폴링**: 잡 스냅샷(status: pending/running/completed/failed, promptId, resultPath, error — `GenerationJob` 필드[사실])을 주기 조회. 렌더러 자체도 폴링 기반 상태 갱신 구조이므로[사실] 같은 관행을 따른다.
3. **완료 반영**: `completed` → 산출물 경로를 `03-assets.md`에 append하고 `comfyui_job_ids`에 잡 ID 기록. `failed` → §3.5 재시도 정책.
4. **취소/재시도**: 큐가 제공하는 cancel/retry를 그대로 사용하고[사실], 오케스트레이터가 자체 재실행 로직을 중복 구현하지 않는다.

### 2.4 log.md 기록 규약 [제안]

append-only, 한 이벤트 한 줄. 필수 요소: 타임스탬프(ISO 8601), `production_id`, 단계(S1~S7/게이트명), 이벤트 종류(`start`/`done`/`approved`/`rejected`/`failed`/`retry`/`halt`), 행위자(`human` 또는 에이전트/스킬 이름), 참조(잡 ID·산출물 경로·사유). 수정·삭제 금지 — 정정은 새 줄로 append. 이 파일이 파이프라인의 감사 추적(audit trail) 원본이다.

---

## 3. 워크플로우

### 3.1 오케스트레이터 제어 루프 [제안]

상태 전이 감지 → 단계 기동 → 완료 기록의 5단계 루프. 1단계(반자동)에서는 이 루프를 사람이 Claude Code 세션에서 스킬 호출로 수행하고, 2단계(무인화)에서는 상주 프로세스가 수행한다. **루프의 계약은 두 단계에서 동일**하다 — 이것이 1→2단계 이행 비용을 최소화하는 핵심 설계다.

1. **감지**: vault의 `20-productions/` 하위 frontmatter `status`를 스캔해 전이를 발견한다. 1단계는 세션 시작 시 일괄 스캔(폴링)으로 충분하고, 2단계는 파일워처 또는 주기 폴링(분 단위)으로 상시화한다.
2. **판정**: §2.2 게이트 표를 참조해 "실행 가능한 다음 단계"를 결정한다. 조건: 선행 단계 산출물 존재 + 해당 게이트 통과(승인 전이는 인간만 기록 가능).
3. **기동**: 해당 단계의 스킬/에이전트를 실행한다(S1~S3·S7 = LLM 작성 작업, S4~S6 = Danbi 잡 enqueue).
4. **브리지**: S4~S6은 §2.3 잡 브리지로 완료를 추적한다.
5. **기록**: 완료 시 단계 문서 `status` 갱신 + `log.md` append. 실패 시 §3.5.

### 3.2 승인 게이트 4개 — 인간 개입 지점

브리프 §2-5 확정: **인간 승인 게이트(`draft→approved`)는 에이전트가 절대 스스로 넘지 않는다.** Danbi의 "기본 dry-run, 명시적 옵트인" 원칙과 동일 철학이다. OpenMontage가 실시간 제작 보드(Backlot)에 승인 게이트를 두는 구조[사실]를 아키텍처 참고로 삼되, AGPL-3.0이므로 코드 편입은 금지하고 개념만 재구현한다[사실].

| 게이트 | 검토 대상 | 검토 장소 | 반려 시 |
|---|---|---|---|
| G1 시나리오 승인 | 소재·기획 방향·공공누리 유형 확인 | Obsidian(또는 텍스트 에디터)에서 `00-scenario.md` 직접 검토 | `draft` 유지, 피드백을 문서에 코멘트로 남기고 S1 재실행 |
| G2 콘티 승인 | 컷 목록·프롬프트·오디오 지시 | **P1 통합 빌더** ([./08_UNIFIED_BUILDER_KR.md](./08_UNIFIED_BUILDER_KR.md)) — 콘티·이미지·영상 한 화면 | 반려 컷만 표시해 S3 부분 재작성 |
| G3 편집본 승인 | 타임라인 초안·프리뷰 | **Danbi UI** — ComfyUI 결과 반영도 side-by-side 검수 후 승인이 기본 설계[사실] | Danbi UI에서 직접 수정 후 승인, 또는 콘티 수정으로 회귀 |
| G4 업로드 승인 | 제목·설명·챕터·썸네일·공개 설정 | `04-publish.md` 검토 (초기 운영 한정) | 메타데이터 수정 후 재승인 |

- G4는 채널 운영이 안정화되고 업로드 자동화 신뢰가 쌓이면 축소·폐지 후보다(2단계에서 메신저 원버튼 승인으로 대체) [제안].
- 승인 행위 자체는 frontmatter `status`를 사람이(또는 사람 지시를 받은 세션이 명시 확인 후) `approved`로 바꾸는 것이다. 빌더/대시보드 UI가 이 필드를 쓰는 경우에도 기록 주체는 인간 조작이어야 한다 [제안].

### 3.3 1단계 — 반자동 (현행 권고) [제안]

**형태**: 각 파이프라인 단계를 Claude Code **스킬 문서**로 작성하고, 사용자가 세션에서 단계를 실행·승인한다. 오케스트레이션의 두뇌는 Claude Code + 스킬 체계이고, Danbi에는 API/CLI/잡 계약으로만 접근한다(브리프 §2-1 확정).

- **스킬 세트** (superpowers:`writing-skills`와 skill-creator로 제작 — §5):
  - `danbi-scenario` (S1), `danbi-script` (S2), `danbi-storyboard` (S3), `danbi-imagegen` (S4), `danbi-avgen` (S5), `danbi-edit` (S6), `danbi-publish` (S7) — 각 스킬은 대응하는 `../stages/` 문서를 절차 명세로 삼는다.
  - `danbi-pipeline-status` — vault를 스캔해 프로덕션별 현재 상태·다음 액션·정지 사유를 요약하는 관제 스킬. 사용자가 세션을 열면 가장 먼저 실행하는 진입점.
- **운영 시나리오**: 사용자가 세션 시작 → `danbi-pipeline-status`로 관제판 확인 → 대기 중 게이트가 있으면 검토·승인 → 다음 단계 스킬 실행 → 스킬이 완료 시 status 갱신+`log.md` append → 세션 종료. 하루 1~2회 세션으로 여러 프로덕션을 병렬 진행할 수 있다.
- **잡 브리지**: 세션이 Danbi API를 폴링해 `comfyui-jobs`/`render-jobs` 스냅샷을 확인한다[사실]. 세션이 닫혀 있는 동안 잡이 끝나도 스냅샷은 `jobs/*.json`에 영속되므로[사실] 다음 세션에서 안전하게 수거된다 — **상주 프로세스 없이도 상태 유실이 없는 이유**이며 1단계가 현행 권고인 근거다.
- 이 단계에서 병렬화가 필요하면 Claude Code 내장 Workflow/Agent 병렬 오케스트레이션으로 단계 내부 작업(예: 컷 20개 프롬프트 생성)을 분산한다. codex-fleet의 워커 풀·출력 수집 패턴은 참고만 한다[사실: MIT, 20★ 소규모].

### 3.4 2단계 — 무인화와 헤르메스 판단

**형태** [제안]: cron 스케줄 생산("매일 오전 소재 리서치→시나리오 초안 생성") + 메신저 승인 게이트(텔레그램 등으로 콘티·편집본 승인 버튼) + 자동 업로드. 이 시점에 상주 오케스트레이터 데몬이 필요해지며, hermes-agent 도입을 재검토한다.

**헤르메스 판단 요약** [사실 — `research_github-refs.md` §2의 검증된 평가]:

- **정체**: NousResearch/hermes-agent — 자기개선형 범용 에이전트. MIT, 209,393★, v0.18.0(2026-07-01), 최상위권 활성도. 내장 cron 스케줄러, Telegram/Discord/Slack/WhatsApp/Signal/CLI 멀티 게이트웨이, 병렬 서브에이전트, 40+ 내장 도구, agentskills.io 스킬 표준 호환(Claude 스킬과 유사해 자산 이식 가능).
- **지금 도입하지 않는 근거 3가지**:
  1. **도메인 특화 기능 전무** — 범용 개인 비서 지향이라 콘티·타임라인·렌더링 등 영상 도메인 기능이 없어, 결국 도구·스킬은 직접 작성해야 한다.
  2. **스택 분리** — Python 상주 프로세스라 Electron+Next.js인 Danbi Studio와 스택이 분리된다.
  3. **역할 중복** — 현재 사용자 환경은 이미 Claude Code + 스킬 + MCP 오케스트레이션 체계를 갖추고 있어 역할이 겹친다.
- **도입 조건**: 2단계 무인화 요건(cron 스케줄 생산 + 메신저 승인 + 자동 업로드)이 실제로 필요해지는 시점에 **상시 데몬 오케스트레이터의 최우선 후보**로 재평가한다. 도입하더라도 Danbi Studio와는 CLI/MCP/파일 프로토콜로 느슨하게 연결한다.

**대안 경로** [제안]: hermes-agent 재평가 시 비교 기준선으로 "자체 경량 데몬"(파일워처 + Danbi API 폴링 + 메신저 봇)도 함께 평가한다. §3.1의 제어 루프 계약이 동일하므로, 1단계 스킬 자산은 어느 쪽을 택해도 재사용된다. gajae-code의 "장시간 목표 추적+메신저 알림" 패턴은 무인 감시 설계 참고 자료다(tmux 의존으로 Windows 궁합은 나쁨)[사실].

### 3.5 실패 처리 [제안]

| 실패 유형 | 정책 |
|---|---|
| 생성 잡 실패 (S4/S5, ComfyUI) | Danbi 큐의 retry를 사용해 **컷 단위 최대 2회 재시도**. 3회째 실패 시 해당 컷을 `03-assets.md`에 `failed`로 표시하고 프로덕션은 계속 진행(부분 실패 허용) — 실패 컷만 G2 재승인 루프로 회귀. VRAM 경합 의심 시(단일 RTX 3090) 재시도 전 큐 직렬화·모델 언로드 상태를 먼저 확인 |
| 렌더 preflight `blocked` | **무인 자동 해결 금지.** preflight는 missing media·자막 타이밍·경로 문제를 blocked/warning으로 차단하고 UI Resolve 액션 중심으로 설계돼 있으므로[사실], blocked 발생 즉시 정지 → `00-inbox/`에 보고 노트 생성 → 사람이 Danbi UI Resolve로 처리. `warning`은 로그 기록 후 진행(프로덕션별 엄격 모드 플래그로 정지 전환 가능) |
| LLM 작성 단계 실패 (S1~S3, S7 메타) | 자동 무한 재생성 금지. 1회 재시도 후 실패 사유를 문서에 남기고 정지 — 품질 문제는 게이트 반려 루프가 담당 |
| 업로드 실패 (S7) | YouTube 쿼터(1,600유닛/편, 일 ~6편) 초과는 실패가 아니라 **대기** — 다음 쿼터 창으로 이월. 인증·심사류 실패는 아래 규약 적용 |
| 외부 의존 도달 | **`EXTERNAL_PENDING` 정지 규약** (사용자 확립 관행): 플랫폼 심사, OAuth 검증, 인간 QA 등 기계가 해결할 수 없는 의존에 도달하면 해당 항목을 `EXTERNAL_PENDING`으로 표기하고 **멈춘다**. 반복 재시도 금지, 해당 프로덕션은 대기 상태로 표시하고 다른 프로덕션 진행은 막지 않음 |

모든 실패·정지 이벤트는 `log.md`에 append하고, 정지 건은 `00-inbox/`에 사유·복구 절차를 담은 노트를 만들어 다음 세션의 `danbi-pipeline-status`가 첫 화면에 띄우게 한다.

### 3.6 관측성 [제안]

1. **`log.md` append-only 이력** — §2.4 규약. 파이프라인의 유일한 시계열 원본.
2. **Danbi 잡 스냅샷** — `comfyui-jobs`/`render-jobs` API와 `jobs/*.json` 영속 스냅샷[사실]이 기계 상태의 원본. vault에는 결과 요약만 append하고 원본을 복제하지 않는다(데이터 이중 구조 원칙).
3. **주간 Lint 보고** — 주 1회 vault 정합성 검사를 실행해 `00-inbox/`에 보고 노트 생성: (a) status 역행·고아 프로덕션(선행 산출물 없는 문서), (b) 조인 키 무결성(`comfyui_job_ids`가 실제 `GenerationJob`에 존재하는지), (c) 깨진 위키링크·vault 밖 미디어 경로 유효성, (d) `_attachments/` 대용량 위반, (e) 장기 `EXTERNAL_PENDING` 방치 항목. 카파시 위키의 "LLM이 위키를 소유하고 유지한다" 원칙의 운영 루틴이다.

---

## 4. 구현 기술 (코드 없이)

| 구성요소 | 기술/도구 | Danbi 연계 지점 |
|---|---|---|
| 상태 저장 | Obsidian vault 마크다운 + YAML frontmatter + git | 없음(vault는 Danbi 밖) — 조인 키로만 연결 |
| 상태 감지 | 1단계: 세션 폴링(스킬이 frontmatter 스캔) / 2단계: 파일워처 또는 주기 폴링 | 없음 |
| 단계 실행 (작성계 S1~S3·S7) | Claude Code 스킬 + LM Studio(OpenAI 호환, localhost:1234) 보조 | 없음 |
| 단계 실행 (생성계 S4~S5) | ComfyUI API(localhost:8188, `POST /prompt`+WebSocket 진행률) — Danbi ComfyUI 배치 큐 경유 | `/api/editor/comfyui-jobs` [사실] |
| 단계 실행 (편집·렌더 S6) | 콘티→EditorProject 컴파일러(신규 개발 1순위) → headless render CLI(dry-run preflight 지원[사실]) | `/api/editor/media`, `/api/editor/projects`, `/api/editor/render-jobs`, headless CLI [사실] |
| 단계 실행 (업로드 S7) | Danbi 밖 별도 프로세스(YouTube Data API v3 우선) — 라이선스·서명 체계와 정합 | 렌더 잡 완료 스냅샷을 트리거로 사용 |
| 인증 | `DANBI_EDITOR_API_TOKEN` (모든 `/api/editor/*` 게이트) [사실] | 토큰 관리: 환경 변수, vault에 기록 금지 |
| 승인 UI | G1 Obsidian, G2 P1 빌더, G3 Danbi UI, G4 문서 검토(→2단계에서 메신저) | G3는 Danbi의 side-by-side 검수 UI 재사용[사실] |
| 무인화(2단계) | cron + 메신저 봇, hermes-agent 재평가(§3.4) | CLI/MCP/파일 프로토콜로 느슨 결합 |

**자동화 훅 연계** [사실 기반 제안]: Danbi에는 `manual / on-import / before-export / on-gap` 자동화 훅과 webhook payload가 이미 있다[사실]. 오케스트레이터는 이를 대체하지 말고, 훅은 "프로젝트 내부 자동화"(자막 스타일 자동 적용 등)에 쓰고 **단계 간 연결은 vault 상태 머신이 전담**하는 역할 분리를 유지한다. webhook 실행은 `executeWebhooks=true` 명시 옵트인·allowlist 경계가 있으므로[사실] 무인화 단계에서 렌더 완료→업로더 통지 경로로 활용을 검토한다.

**라이선스 가드레일**: OpenMontage(AGPL-3.0)의 승인 게이트·프로바이더 스코어링(품질·비용 기준 자동 선택)은 아키텍처 참고만 하고 코드 편입은 금지한다[사실]. 프로바이더 스코어링 개념은 후일 "컷별 로컬/클라우드 생성 슬롯 선택" 설계에 재구현 후보로만 기록해 둔다 [제안].

---

## 5. 활용 스킬

| 작업 | 스킬 | 이유 |
|---|---|---|
| 단계 스킬 7종 + 관제 스킬 제작 | superpowers:`writing-skills`, `skill-creator` | 스킬 문서의 구조·트리거 조건·검증 규약을 표준대로 작성 — 파이프라인 두뇌가 스킬 체계이므로 스킬 품질이 곧 오케스트레이션 품질 |
| 오케스트레이션 설계 확정 전 검토 | superpowers:`brainstorming` | 게이트 배치·상태 전이의 대안 탐색(예: G4 폐지 시점) |
| 구현 계획 수립 | `feature-planner`, superpowers:`writing-plans` | §6 체크리스트를 실행 계획으로 전개 |
| 컴파일러·브리지 구현(Danbi 코드 수정 시) | Serena + superpowers:`test-driven-development` | 심볼 수준 탐색으로 API 계약 파악, 회귀 방지 |
| 병렬 단계 실행 | Claude Code 내장 Workflow/Agent 병렬 오케스트레이션, superpowers:`subagent-driven-development` | 컷 단위 대량 작업 분산, 프로덕션 간 병렬 진행 |
| 실패 원인 추적 | superpowers:`systematic-debugging` | preflight blocked·잡 실패의 근본 원인 규명 |
| 완료 선언 전 검증 | superpowers:`verification-before-completion` | "status 갱신 전 산출물 실재 확인" 관행을 스킬 수준에서 강제 |

---

## 6. 구현 단계 체크리스트

> 각 항목: **선행 조건 / 작업 항목 / 검증 방법**. 어떤 에이전트든 이 순서대로 착수 가능해야 한다.

### A. 상태 머신·게이트 규약 확정
- 선행: vault 스캐폴드 존재([./10_KNOWLEDGE_DB_KR.md](./10_KNOWLEDGE_DB_KR.md) 구현 선행), `../stages/` 7개 문서의 입출력 계약 확정.
- 작업: §2.2 게이트 표를 `DanbiVault/CLAUDE.md`(스키마 문서)에 반영 — 문서별 `status` 허용값, 전이 권한(인간 전용 전이 명시), `log.md` 기록 규약(§2.4)을 스키마 문서의 한 절로 기술. `90-templates/`의 단계 문서 템플릿에 frontmatter 필드(`status`, `production_id`, `comfyui_job_ids`) 기본값 포함.
- 검증: 샘플 프로덕션 1건(예: `2026-07-05-heritage-sokguram`)의 문서 5종을 템플릿에서 생성해 모든 전이를 수기로 시뮬레이션 — 게이트 표와 모순되는 경로(승인 없이 다음 단계 도달)가 없음을 확인.

### B. 단계 스킬 7종 + 관제 스킬 작성
- 선행: A 완료, `../stages/01`~`07` 문서(각 스킬의 절차 명세).
- 작업: `danbi-scenario`~`danbi-publish` 7종과 `danbi-pipeline-status`를 superpowers:`writing-skills` 규약으로 작성. 각 스킬에 포함할 것: (a) 트리거 조건(어떤 status에서 실행 가능한지), (b) 입력 문서와 출력 문서 경로, (c) 완료 시 status 갱신+`log.md` append 의무, (d) 승인 전이 금지 조항, (e) 실패 시 §3.5 정책 참조. 저장 위치: 사용자 스킬 디렉터리(`E:\clude_program\skills\` 하위 신규 폴더 `danbi-pipeline\`) — Claude Code 인식 경로 등록 방식은 구현 시 확정.
- 검증: 샘플 프로덕션으로 S1→S7 전 구간 드라이런(생성 잡은 dry-run, 업로드는 미실행). 각 단계 후 frontmatter·`log.md`가 규약대로 갱신됐는지, 승인 게이트에서 스킬이 스스로 멈추는지 확인.

### C. 잡 브리지 절차 확립
- 선행: `DANBI_EDITOR_API_TOKEN` 발급·환경 변수 설정, ComfyUI(localhost:8188)·Danbi 기동.
- 작업: §2.3 절차(등록→폴링→반영→재시도)를 `danbi-imagegen`/`danbi-avgen`/`danbi-edit` 스킬 본문에 기술. 폴링 주기·타임아웃(장시간 잡 대비)·세션 부재 중 완료 잡의 수거 절차(다음 세션 시작 시 `jobs/*.json` 대조)를 명시.
- 검증: 실제 ComfyUI 잡 1건을 등록해 completed 스냅샷의 `resultPath`가 `03-assets.md`에 기록되고 `comfyui_job_ids`가 SQLite 잡 ID와 일치하는지 확인. 의도적 실패 잡 1건으로 retry→표기 경로 확인.

### D. 실패·정지 운영 규정 문서화
- 선행: B 완료.
- 작업: §3.5 표를 vault `CLAUDE.md` 운영 절 또는 `90-templates/` 실패 보고 노트 템플릿으로 반영. `EXTERNAL_PENDING` 항목의 표기 위치(해당 단계 문서 frontmatter + `00-inbox/` 노트)와 해제 절차(사람이 해소 확인 후 status 복귀)를 명시.
- 검증: preflight blocked 시나리오(의도적 missing media)로 드라이런 — 정지·보고 노트 생성·`danbi-pipeline-status` 첫 화면 노출을 확인.

### E. 주간 Lint 보고 루틴
- 선행: A~D 완료, 실제 프로덕션 1건 이상 존재.
- 작업: §3.6-3의 검사 5종을 절차서(스킬 또는 체크리스트 문서)로 작성, 주 1회 실행 관행 수립(1단계는 수동 실행, 2단계에서 cron 이관).
- 검증: 의도적 결함(깨진 링크, 존재하지 않는 잡 ID) 심은 vault로 실행해 보고 노트가 결함을 전부 잡아내는지 확인.

### F. 2단계 진입 판단 (후행, 조건부)
- 선행: 1단계로 주간 N편 생산이 안정화(연속 4주, 게이트 반려율·실패율 데이터 축적), 업로드 모듈 가동.
- 작업: 무인화 요건 명세(cron 생산 빈도, 메신저 승인 UX, 자동 업로드 범위) 작성 → hermes-agent vs 자체 경량 데몬 비교 평가(§3.4 기준: 도메인 기능·스택 정합·운영 부담) → 선택안으로 파일럿.
- 검증: 파일럿 1주간 무인 사이클(생산→메신저 승인→업로드)이 `log.md` 기준 인간 개입 없이(승인 제외) 완주하는지 확인.

---

## 7. 완료 조건

### 기계(에이전트) 완료 조건
- [ ] vault `CLAUDE.md`에 상태 머신·게이트·`log.md` 규약이 반영되고 샘플 프로덕션 시뮬레이션 통과 (A)
- [ ] 단계 스킬 7종 + `danbi-pipeline-status`가 존재하고 S1→S7 드라이런 통과 (B)
- [ ] 실 잡 1건으로 잡 브리지 왕복(등록→완료→vault 반영→조인 키 일치) 검증 (C)
- [ ] 실패·정지 규정이 문서화되고 blocked 시나리오 드라이런 통과 (D)
- [ ] 주간 Lint 절차가 결함 검출 테스트 통과 (E)
- [ ] 모든 상태 전이가 `log.md`에 누락 없이 기록됨을 드라이런 로그 대조로 확인

### EXTERNAL_PENDING (사람/외부 의존 — 도달 시 표기하고 정지)
- [ ] `EXTERNAL_PENDING` — 승인 게이트 4개의 실제 승인 행위(G1~G4)는 항상 인간 몫: 자동화 대상 아님
- [ ] `EXTERNAL_PENDING` — YouTube OAuth 앱 검증, TikTok 감사, Instagram 앱 리뷰(→ [../stages/07_UPLOAD_WORKFLOW_KR.md](../stages/07_UPLOAD_WORKFLOW_KR.md))
- [ ] `EXTERNAL_PENDING` — 2단계 진입 결정(주간 생산 안정화 데이터 확인 후 사용자 판단)과 메신저 봇 계정 개설
- [ ] `EXTERNAL_PENDING` — Danbi 자체의 Fresh Windows QA·최종 릴리스 승인[사실: 에디터 완성 정의서 기준 EXTERNAL_PENDING 상태]

---

## 8. 리스크와 완화책

| 리스크 | 영향 | 완화책 |
|---|---|---|
| 에이전트가 승인 전이를 스스로 기록 | 인간 게이트 무력화 — 파이프라인 신뢰 붕괴 | 스킬 본문에 금지 조항 명문화(B) + 주간 Lint가 "승인 이벤트의 행위자=human" 여부를 `log.md`에서 검사 |
| frontmatter 수기 편집 오류(오탈자 status) | 오케스트레이터 오판·단계 미기동 | 허용값을 `CLAUDE.md`에 열거, Lint가 비정상 값 검출, `danbi-pipeline-status`가 파싱 불가 문서를 즉시 보고 |
| 세션 간 상태 불일치(잡은 끝났는데 vault 미반영) | 중복 enqueue·에셋 누락 | 잡 스냅샷 영속(`jobs/*.json`)[사실]을 신뢰 원본으로 삼고 세션 시작 시 대조 수거 절차(C) 의무화. enqueue 전 `comfyui_job_ids` 중복 확인 |
| 큐 내부 구현 의존 | Danbi 큐 모듈 위치 이동(구조 부채)[사실] 시 파손 | API 라우트 계약에만 의존, 내부 모듈 경로 참조 금지 |
| preflight blocked 무인 방치 | 프로덕션 장기 정체 | blocked 즉시 보고 노트 + 관제 스킬 첫 화면 노출(D), 장기 방치는 주간 Lint의 `EXTERNAL_PENDING` 방치 검사로 재부상 |
| 단일 GPU VRAM 경합(S4/S5/S6 동시) | 잡 실패 연쇄 | 생성·렌더 잡 직렬화 원칙 + 모델 언로드 전략(브리프 §2-6), 오케스트레이터는 프로덕션 병렬이어도 GPU 잡은 큐 순차 처리 |
| hermes-agent 조기 도입 유혹 | 스택 분리·역할 중복으로 유지비만 증가[사실 근거] | §3.4 판단 요약을 문서로 고정 — 재평가는 F 단계 진입 조건 충족 후에만 |
| AGPL 코드 유입(OpenMontage) | Danbi 코드베이스 라이선스 오염[사실] | 아키텍처 참고만, 코드 열람 결과물의 직접 이식 금지, 반입 시 source register 절차 준수 |

---

## 9. 관련 문서

- 마스터 보고서: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)
- 플랫폼: [./08_UNIFIED_BUILDER_KR.md](./08_UNIFIED_BUILDER_KR.md) (G2 콘티 승인 UI) · [./09_COMFYUI_DASHBOARD_KR.md](./09_COMFYUI_DASHBOARD_KR.md) (잡 관측 UI) · [./10_KNOWLEDGE_DB_KR.md](./10_KNOWLEDGE_DB_KR.md) (vault 스키마 — 상태 필드의 최종 정의처)
- 단계 문서: [../stages/01_SCENARIO_WORKFLOW_KR.md](../stages/01_SCENARIO_WORKFLOW_KR.md) · [../stages/02_SCRIPT_WORKFLOW_KR.md](../stages/02_SCRIPT_WORKFLOW_KR.md) · [../stages/03_STORYBOARD_WORKFLOW_KR.md](../stages/03_STORYBOARD_WORKFLOW_KR.md) · [../stages/04_IMAGE_GEN_WORKFLOW_KR.md](../stages/04_IMAGE_GEN_WORKFLOW_KR.md) · [../stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md](../stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md) · [../stages/06_EDITING_WORKFLOW_KR.md](../stages/06_EDITING_WORKFLOW_KR.md) · [../stages/07_UPLOAD_WORKFLOW_KR.md](../stages/07_UPLOAD_WORKFLOW_KR.md)
