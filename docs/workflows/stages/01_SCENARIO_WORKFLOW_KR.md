# S1 시나리오 워크플로우 — 리서치·기획 단계

> Danbi Studio 영상 자동화 파이프라인의 첫 단계. 채널 전략과 과거 성과를 근거로 소재를 발굴·선정하고,
> 인간 승인을 기다리는 시나리오 초안(`00-scenario.md`, `status: draft`)을 산출한다.
> 상위 설계: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)

---

## 1. 목적과 범위

### 1-1. 목적

S1은 "무엇을 만들 것인가"를 결정하는 단계다. 산출물은 코드도 미디어도 아닌 **의사결정 문서** 하나 —
`DanbiVault/20-productions/<production_id>/00-scenario.md` — 이며, 이 문서가 `approved`로 전이되기 전에는
파이프라인의 어떤 후속 단계(S2 대본 이후)도 시작될 수 없다.

### 1-2. 범위 (포함)

- 채널 전략 노트·최근 회고 판독(과거 성과 기반 방향 설정)
- 트렌드·소재 리서치(웹 검색, 콘텐츠 소스 포털 탐색)
- 소재 후보 생성과 스코어링(정량 기준으로 후보 비교)
- production 폴더 생성과 `00-scenario.md`(draft) 작성
- 리서치 부산물의 지식 환류(`10-knowledge/topics/`에 소재 노트 저장)

### 1-3. 범위 (제외)

- 나레이션 문장·장면 텍스트 작성 → S2 [./02_SCRIPT_WORKFLOW_KR.md](./02_SCRIPT_WORKFLOW_KR.md)
- 컷 분할·프롬프트 설계 → S3 [./03_STORYBOARD_WORKFLOW_KR.md](./03_STORYBOARD_WORKFLOW_KR.md)
- 승인 게이트 감지·후속 잡 enqueue 메커니즘 자체의 구현 → P4 [../platform/11_ORCHESTRATION_KR.md](../platform/11_ORCHESTRATION_KR.md)
- vault 스키마·동기화 규약의 전체 정의 → P3 [../platform/10_KNOWLEDGE_DB_KR.md](../platform/10_KNOWLEDGE_DB_KR.md)

---

## 2. 입력/출력 계약

### 2-1. 입력

| 입력 | 위치 | 성격 |
|---|---|---|
| 채널 전략 노트 | `DanbiVault/10-knowledge/channels/<채널명>.md` | [사실 기반 제안] 카파시 위키 계층(LLM이 유지, 인간이 감사). 채널 정체성·타깃·금지 소재·성공 공식 기록 |
| 최근 회고 | `DanbiVault/10-knowledge/retrospectives/` (백링크 추적) | S7이 남긴 영상별/주간 성과 회고. `verdict`(keep/change) 필드가 핵심 입력 |
| 소재/트렌드 노트 | `DanbiVault/10-knowledge/topics/` | 이전 리서치의 누적물. 재사용·갱신 대상 |
| 인박스 아이디어 | `DanbiVault/00-inbox/` | [사실] 카파시 append-and-review 방식 — 인간이 던져둔 아이디어. 에이전트는 읽기+승격만, 수정 금지 |
| 외부 리서치 결과 | 웹 검색·콘텐츠 소스 포털 (§4) | 세션 중 수집, vault에 노트로 환류 |

### 2-2. 출력

**주 산출물**: `DanbiVault/20-productions/<production_id>/00-scenario.md`

- `production_id` 형식(확정): `YYYY-MM-DD-topic-slug` (예: `2026-07-05-heritage-sokguram`)
- production 폴더는 S1이 생성한다. 이후 단계 파일(01-script.md 등)은 각 단계 담당이 만든다.

**frontmatter 필수 필드** (브리프 확정 스키마 — 데이터 구조 표기):

```yaml
type: scenario
production_id: 2026-07-05-heritage-sokguram
status: draft                 # S1은 draft로만 생성. approved 전이는 인간 전용
channel: "[[channels/문화유산채널]]"   # 위키링크 — 채널 노트와 계보 연결
topic: "[[topics/석굴암]]"             # 위키링크 — 소재 노트와 계보 연결
target_duration: 55           # 초 단위 목표 길이 (쇼츠·릴스 기준)
hook_type: question           # 첫 3초 훅 유형 (question/shock/visual/story 등 — 채널 노트에 정의된 어휘 사용)
created: 2026-07-05
updated: 2026-07-05
agent: scenario-agent
schema_version: 1
```

**본문 필수 섹션** [제안]:

1. **소재 요약** — 한 단락. 왜 이 소재인가(회고·트렌드 근거 인용, 위키링크 포함)
2. **후보 스코어링 표** — 검토한 후보 전체와 점수(§3-3). 인간 승인자가 "왜 이것이 뽑혔나"를 검증하는 근거
3. **콘텐츠 소스 목록** — 사용할 원천 자료(URL·제목·**공공누리 유형·상업 이용 가부**). 라이선스 가드레일의 시작점
4. **스토리 아크 개요** — 훅 → 전개 → 반전/절정 → 마무리(CTA)의 4~6줄 뼈대. 문장 단위 대본은 쓰지 않는다(S2 소관)
5. **제작 파라미터** — 예상 컷 수 범위, 비주얼 스타일 방향, 참조할 프롬프트 템플릿(`10-knowledge/prompts/` 위키링크)
6. **승인 요청 메모** — 인간 승인자가 판단할 때 주의할 점(예: "이 소재는 3D 데이터가 공공누리 2유형이라 변경 금지 조건 있음")

**부 산출물**:

- `10-knowledge/topics/`에 신규/갱신 소재 노트(리서치 결과의 지식 환류 — [사실] 카파시 Query 환류 원칙)
- `log.md`에 append-only 작업 기록 1건 (`agent(s1): <production_id> 시나리오 초안 생성`)
- git commit (메시지 규약: `agent(s1): <production_id> 요약`)

### 2-3. 상태 전이

```
(없음) ──S1 에이전트──▶ draft ──인간 승인──▶ approved ──▶ (S2 시작 가능)
                          │
                          └─인간 반려──▶ draft 유지(피드백 반영 재작성) 또는 archived
```

- [사실 — 브리프 확정] 상태 머신: `draft → approved → generated → edited → published` (+`archived`). S1이 만지는 구간은 `(없음)→draft`뿐이다.
- **인간 승인 게이트(`draft→approved`)는 에이전트가 절대 스스로 넘지 않는다.** Danbi의 "기본 dry-run, 명시적 옵트인" 원칙과 동일 철학.
- `status`의 진실 원천은 vault다(SQLite가 아님). 승인 감지와 S2 트리거는 P4 오케스트레이션이 파일워처/폴링로 수행한다.

---

## 3. 워크플로우

### 3-1. 단계 0 — 컨텍스트 로딩 (읽기 경로 고정)

[사실 — 지식 DB 보고서의 규약] 에이전트는 정해진 순서로만 읽는다. **전체 vault 스캔 금지**(컨텍스트 낭비 방지).

1. `DanbiVault/CLAUDE.md` — 스키마·규약 확인
2. 대상 채널 노트(`10-knowledge/channels/`) — 채널 정체성, 금지 소재, 성공 공식
3. 최근 회고 N건(기본 5건, 채널 노트에서 백링크 추적) — `verdict` 필드 중심으로 "유지할 것/바꿀 것" 추출
4. 관련 소재 노트(`10-knowledge/topics/`)와 `00-inbox/`의 미처리 아이디어

### 3-2. 단계 1 — 트렌드·소재 리서치

- [사실] Claude Code 세션에서 구동할 때: `insane-search` 플러그인(네이버·유튜브 자막·Reddit 등 지원, API 키 불필요)과 내장 `WebSearch`/`WebFetch`를 병용한다. insane-search는 **Claude Code 세션용 플러그인**이므로 Danbi 앱 내장 검색 엔진으로는 쓸 수 없다.
- [제안] 향후 앱 내장(무인 배치) 경로가 필요해지면 Tavily Search API(에이전트 특화, 무료 티어) 또는 Exa(시맨틱 검색)를 어댑터로 붙인다. 스크레이핑은 대상 사이트 ToS·robots 준수.
- 콘텐츠 소스 포털 탐색 (§4-2): 국가유산 디지털 서비스에서 소재 후보별 비주얼 소스(사진·3D·다큐 푸티지) 존재 여부와 **공공누리 유형**을 함께 조사한다. 소스가 없는 소재는 스코어링에서 감점.
- 리서치 중 얻은 유의미한 발견은 채팅에 버리지 말고 `10-knowledge/topics/`에 노트로 저장한다(지식 복리 축적).

### 3-3. 단계 2 — 소재 후보 스코어링

[제안] 후보 3~7개를 만들어 아래 5개 축(각 0~5점)으로 표를 작성한다. 기준 가중치는 채널 노트에 정의하고, 채널마다 다르게 둘 수 있다.

| 축 | 판단 근거 |
|---|---|
| 채널 적합도 | 채널 전략 노트의 정체성·타깃과 일치하는가 |
| 회고 정합성 | 최근 회고의 keep/change 교훈을 반영하는가 (예: "질문형 훅 유지율 +15%" 같은 축적 교훈) |
| 트렌드 시의성 | 검색·시즌·이슈와의 연결 강도 |
| 소스 확보성 | 상업 이용 가능한(공공누리 1·2유형 등) 비주얼·텍스트 소스가 실재하는가 |
| 제작 난도 | 목표 길이·컷 수 내에서 표현 가능한가 (컷 20개 초과 예상이면 감점) |

최고점 후보 1개를 선정하되, **표 전체를 00-scenario.md에 남긴다** — 인간 승인자와 미래 회고가 "탈락 후보"까지 볼 수 있어야 스코어링 기준 자체를 개선할 수 있다.

### 3-4. 단계 3 — 시나리오 초안 작성

1. `production_id` 발급(`YYYY-MM-DD-topic-slug`)과 폴더 생성. slug 중복 시 접미사로 구분.
2. `90-templates/`의 시나리오 템플릿을 기반으로 `00-scenario.md` 작성 — frontmatter 필수 필드(§2-2) + 본문 6개 섹션.
3. [제안] LLM 실행 전략: LM Studio(로컬)로 초안 생성 → 자체 품질 점검(훅 강도, 아크 완결성, 채널 톤 일치) → 미달 시 클라우드 프런티어 모델로 1회 재작성. §4-1 참조.
4. frontmatter 유효성 자체 검증(필수 필드 존재, `status: draft`, 위키링크 대상 실재) 후 원자적 쓰기(temp 파일→rename).
5. `log.md` append + git commit.

### 3-5. 단계 4 — 인간 승인 게이트 (S1의 종점)

- 에이전트는 여기서 **멈춘다**. 승인 대기 알림만 남긴다(1단계 반자동에서는 Claude Code 세션 응답으로, 이후 무인화 시 메신저 알림 — P4 소관).
- 인간은 Obsidian(또는 임의 편집기)에서 `00-scenario.md`를 읽고:
  - 승인: frontmatter `status`를 `approved`로 변경 → P4가 감지해 S2 트리거
  - 반려: 본문에 피드백 코멘트를 남기고 `status: draft` 유지 → 에이전트가 다음 세션에서 반영해 재작성
  - 폐기: `status: archived` (삭제하지 않는다 — 파괴적 편집 금지 규약)
- **S2의 선행 조건 = `00-scenario.md`의 `status: approved`.** 이 게이트를 우회하는 어떤 자동화도 만들지 않는다.

---

## 4. 구현 기술 (코드 없이 — 도구·API·연계 지점)

### 4-1. LLM 계층

- [사실] **LM Studio**: OpenAI 호환 서버(`localhost:1234/v1`), structured output(JSON 스키마 강제) 지원, CLI/헤드리스 데몬(llmster)으로 GUI 없이 기동 가능. 앱 무료(업무 사용 포함).
- [사실] 한국어 모델 후보: **Kakao Kanana(Apache-2.0, 1순위)**, **Upstage SOLAR(Apache-2.0)**. LG EXAONE은 한국어 성능은 좋으나 비상업 라이선스라 **수익화 콘텐츠엔 부적합** — 사용 금지 목록에 올린다.
- [제안] **하이브리드 전략**: 스코어링 표·소재 요약 같은 구조적 작업은 로컬(비용 0, structured output으로 frontmatter·표를 기계 판독 가능 형식으로 강제). 스토리 아크·훅처럼 창작 품질이 승부처인 부분은 로컬 초안이 자체 점검 기준에 미달할 때만 클라우드 모델로 승급. 로컬 7B~14B급의 한국어 창작 품질은 프런티어 대비 열세라는 점이 근거.

### 4-2. 리서치·콘텐츠 소스

- [사실] **insane-search**(fivetaku, Claude Code 플러그인): 공개 API 리더→신디케이션→TLS 임퍼서네이션→헤드리스 브라우저의 적응형 에스컬레이션. 네이버·유튜브 자막 지원이 국내 소재 리서치에 유효. **Claude Code 세션 한정** — Danbi 앱 내장 불가.
- [제안] 앱 내장 대안: Tavily / Exa / Brave Search API. 무인화(2단계) 전에는 도입하지 않는다(1단계는 Claude Code 세션이 리서치 주체).
- [사실] **국가유산 디지털 서비스(digital.khs.go.kr)**: 약 68만 건 국가유산 디지털 데이터(사진·도면·3D·보고서·다큐 영상). 공공누리 체계 적용 — **제1·2유형만 상업 이용 가능, 제3·4유형은 상업 금지**. "무료 개방" 문구만 믿고 수익형 쇼츠에 쓰면 안 된다.
  - [제안] S1에서는 소재별로 "유형 확인된 소스 목록"을 00-scenario.md에 기록하는 것으로 시작하고, 반복이 확인되면 "소스 수집기(공공누리 유형 필터 내장)" 모듈로 승격한다. 포털 자체 공개 API는 미확인 — 국가유산청 기존 OpenAPI 병행 조사 필요.
- [사실] **Unlimited-OCR**(Baidu, MIT): 스캔 보고서→텍스트 변환 후보이나 **한국어 지원이 문서에 미명시** → **보류**. 한국어 벤치마크 검증 통과 전에는 파이프라인에 넣지 않는다. 대안: 네이버 클로바 OCR 또는 멀티모달 LLM 직접 파싱.

### 4-3. Vault 접근

- [사실 기반 제안] 접근 방식은 **파일시스템 직접 I/O가 1순위**(Obsidian 실행 여부 무관). Obsidian은 인간 승인자의 뷰어/편집기. Local REST API/MCP는 Obsidian이 켜진 상태의 세밀 조작이 필요할 때만.
- 쓰기 규약: 쓰기 전 mtime 확인 → temp 파일 작성 → rename(원자적 쓰기). `log.md`는 append-only. 모든 쓰기 후 파이프라인이 직접 git commit(obsidian-git의 외부 수정 미감지 이슈 때문에 의존하지 않음).

### 4-4. Danbi Studio 연계 지점

- S1은 **Danbi 앱을 호출하지 않는다.** 생성 잡도, 에디터 API도 쓰지 않는다. SQLite와의 접점도 없다(조인 키 `production_id`는 이 단계에서 발급만 되고, SQLite 측 레코드는 S4 이후 생성 잡이 만들어질 때 처음 사용된다).
- 따라서 S1은 vault + LLM + 웹만으로 완결되는, 파이프라인에서 가장 의존성이 가벼운 단계다. 구현 착수 순서상 첫 번째로 만들기 적합하다 [제안].

---

## 5. 활용 스킬

| 단계 | 스킬 | 용도 |
|---|---|---|
| 리서치(3-2) | `insane-search` (외부 채택, Claude Code 플러그인) | 네이버·유튜브 자막 등 국내 소스 트렌드 수집 |
| 리서치(3-2) | `WebSearch`/`WebFetch` (Claude Code 내장) | 일반 웹 리서치, 국가유산 포털 페이지 확인 |
| 소재 발굴 반복 구조 | superpowers `brainstorming` | 후보 생성 시 발산적 탐색(스코어링 전 단계) |
| 시나리오 스킬 자체 제작 | superpowers `writing-skills` | S1 절차를 재사용 가능한 Claude Code 스킬 문서로 정착 |
| S1 구현 계획 | `feature-planner`, superpowers `writing-plans` | 구현 체크리스트(§6)를 실행 계획으로 전개할 때 |
| 구현 검증 | superpowers `verification-before-completion` | "초안 생성됨" 주장 전 frontmatter·링크 실검증 |

[사실] webtoon-harness(MIT)의 "트렌드 리서치→시나리오" 팀 구조와 loopy의 반복 루프 문서화 형식은 S1 스킬 문서 작성 시 구조 참고 대상이다(의존성 아님, 참고만).

---

## 6. 구현 단계 체크리스트

어떤 에이전트든 이 순서로 착수할 수 있도록 선행 조건·작업·검증을 명시한다. **코드는 이 문서에 쓰지 않는다 — 무엇을 만들고 어디에 두는지만 정의한다.**

### 6-1. 선행 조건

- [ ] `DanbiVault/`가 브리프 §3 구조로 초기화되어 있고 `CLAUDE.md`(스키마 문서)가 존재한다 → 없으면 P3 [../platform/10_KNOWLEDGE_DB_KR.md](../platform/10_KNOWLEDGE_DB_KR.md)의 vault 초기화를 먼저 수행
- [ ] 대상 채널의 전략 노트가 `10-knowledge/channels/`에 최소 1개 존재한다(채널 정체성·타깃·금지 소재·훅 유형 어휘 정의 포함). 최초 1회는 인간이 초안 작성
- [ ] LM Studio 설치 + Kanana 또는 SOLAR 모델 다운로드 + 로컬 서버 기동 확인(`localhost:1234`)
- [ ] Claude Code에 insane-search 플러그인 설치(마켓플레이스 등록→install, 선택이지만 국내 리서치 품질에 권장)

### 6-2. 작업 항목

1. **시나리오 템플릿 작성** — 위치: `DanbiVault/90-templates/scenario-template.md`. 내용: §2-2의 frontmatter 필수 필드(placeholder 포함) + 본문 6개 섹션 골격. 검증: 템플릿을 복사해 필드를 채우면 §2-2 계약을 자동으로 충족하는지 대조.
2. **S1 스킬 문서 작성** — 위치: 사용자 스킬 디렉터리(예: `E:\clude_program\skills\danbi-pipeline\s1-scenario\SKILL.md`). 내용: §3의 단계 0~4 절차를 superpowers `writing-skills` 규약으로 기술 — 읽기 경로 고정, 스코어링 5축, 승인 게이트에서 멈추기, git commit 메시지 규약(`agent(s1): <production_id> 요약`) 포함. 검증: 신규 Claude Code 세션에서 스킬만 보고 모의 실행(dry-run) 시 절차 누락 없이 진행되는지.
3. **frontmatter 검증 절차 정의** — 위치: 스킬 문서 내 검증 섹션 또는 P4의 공용 검증기에 위임. 내용: 필수 필드 존재, `type: scenario`, `status` 허용값, `production_id` 형식, 위키링크 대상 실재 확인 기준. 검증: 필드 하나를 고의로 누락시킨 문서가 거부되는지.
4. **채널 노트·회고 초기 데이터 준비** — 위치: `10-knowledge/channels/`, `10-knowledge/retrospectives/`. 내용: 운영할 첫 채널의 전략 노트(인간 작성)와, 회고가 아직 없는 초기 상태에서의 대체 규칙(스킬 문서에 "회고 0건이면 채널 노트만으로 진행" 명시). 검증: 회고 0건 상태에서 S1이 오류 없이 완주하는지.
5. **국가유산 포털 소스 조사 절차 문서화** — 위치: `10-knowledge/topics/` 하위에 소스 노트 형식 정의(URL, 자료 유형, 공공누리 유형, 상업 가부, 확인 일자 필드). 검증: 샘플 소재 1건에 대해 유형 1·2와 3·4 자료가 올바르게 분리 기록되는지.
6. **엔드투엔드 시범 실행** — 실제 채널 노트로 S1 전체(§3 단계 0~4)를 1회 실행해 `00-scenario.md`(draft) 산출. 검증: §7-1 기계 완료 조건 전 항목 통과.

### 6-3. 검증 방법 (공통)

- 산출된 `00-scenario.md`를 Obsidian에서 열어 Bases/Dataview가 frontmatter를 정상 인식하는지 확인(속성 테이블에 표시)
- git log에 규약대로 된 커밋이 존재하는지, `log.md`에 append 기록이 있는지 확인
- 에이전트가 `status`를 `approved`로 바꾼 이력이 **없는지** git diff로 확인(게이트 준수의 반증 검사)

---

## 7. 완료 조건

### 7-1. 기계(에이전트) 완료 조건 — S1 1회 실행 기준

- [ ] `20-productions/<production_id>/` 폴더와 `00-scenario.md`가 존재하고 `status: draft`
- [ ] frontmatter 필수 필드 7종(type/production_id/status/channel/topic/target_duration/hook_type) + 공통 필드(created/updated/agent/schema_version) 전부 유효
- [ ] 본문에 6개 필수 섹션(소재 요약/스코어링 표/콘텐츠 소스 목록/스토리 아크/제작 파라미터/승인 요청 메모)이 존재
- [ ] 스코어링 표에 후보 3개 이상과 5축 점수·선정 근거가 기록됨
- [ ] 콘텐츠 소스 목록의 모든 항목에 공공누리 유형(또는 라이선스)과 상업 이용 가부가 명시됨 — 3·4유형만 있는 소재는 선정 불가
- [ ] `10-knowledge/topics/` 소재 노트 신규/갱신 + `log.md` append + git commit 완료
- [ ] 에이전트가 `status`를 `draft` 이외 값으로 변경한 이력 없음

### 7-2. EXTERNAL_PENDING — 사람/외부 의존 (에이전트는 여기서 멈춘다)

- [ ] `EXTERNAL_PENDING` **인간 승인**: `00-scenario.md`의 `draft→approved` 전이. 인간 승인자만 수행. 승인 전까지 S2는 시작 금지
- [ ] `EXTERNAL_PENDING` **채널 전략 노트 최초 작성**: 첫 실행 전 인간이 채널 정체성 확정(6-1 선행 조건)
- [ ] `EXTERNAL_PENDING` **"오픈이미지2" 실체 확인**: 사용자 확인 대기(GPT Image 2 유력) — S1 산출물의 "제작 파라미터" 섹션에서 이미지 모델을 특정할 때 영향
- [ ] `EXTERNAL_PENDING` **Unlimited-OCR 한국어 검증**: 국내 스캔 자료(발굴 보고서 등)를 소재 원천으로 쓰려면 한국어 벤치마크 통과 필요. 통과 전까지 OCR 의존 소재는 후보에서 제외하거나 클로바 OCR 대안 사용

---

## 8. 리스크와 완화책

| # | 리스크 | 완화책 |
|---|---|---|
| 1 | **공공누리 3·4유형 자료의 수익형 쇼츠 사용**(저작권 사고) | [사실 기반] 소스 목록에 유형 명시를 기계 완료 조건으로 강제(§7-1). 유형 미확인 자료는 "확인 필요"로 표시하고 선정 근거에서 배제 |
| 2 | 로컬 LLM의 한국어 창작 품질 열세 → 밋밋한 시나리오 양산 | [제안] 하이브리드 승급 규칙(§4-1) + 회고 환류로 훅 유형·아크 패턴을 채널 노트에 축적해 프롬프트 품질 자체를 개선 |
| 3 | 에이전트가 승인 게이트를 우회(status 임의 변경) | 스킬 문서에 금지 명문화 + git diff 반증 검사(§6-3) + P4 오케스트레이터가 전이 주체를 로그로 대조 |
| 4 | frontmatter 스키마 드리프트(필드명 변형)로 파서·Bases 조용히 파손 | [사실 기반] `schema_version` 필드 + 검증 절차(§6-2 작업 3) + 주기적 lint(P3 소관)로 방어 |
| 5 | insane-search 의존 리서치가 무인화 단계에서 단절(Claude Code 한정 도구) | [제안] 1단계에서는 문제 없음. 2단계 진입 시 Tavily/Exa 어댑터로 교체하는 마이그레이션 항목을 P4 문서에 예약 |
| 6 | 트렌드 리서치의 스크레이핑이 대상 사이트 ToS 위반 | 공개 콘텐츠만, 로그인·페이월 우회 금지(insane-search 자체 원칙과 동일). 문제 소지 소스는 소스 목록에 기록하지 않는다 |
| 7 | 소재 중복(과거 제작물과 유사 소재 재선정) | 스코어링 전 `20-productions/` 폴더명(production_id에 topic-slug 포함)과 topics 노트 백링크로 중복 검사. 유사 소재는 "차별화 근거"를 소재 요약에 필수 기재 |
| 8 | Windows 파일 잠금·Obsidian 동시 편집으로 쓰기 유실 | 원자적 쓰기(temp→rename) + 쓰기 전 mtime 확인 + 재시도 백오프. 인간이 편집 중일 가능성이 높은 파일(승인 대기 문서)은 S1이 재수정하지 않는다 |

---

## 9. 관련 문서

- 마스터 보고서: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)
- 다음 단계(S2 대본): [./02_SCRIPT_WORKFLOW_KR.md](./02_SCRIPT_WORKFLOW_KR.md) — 선행 조건이 본 문서의 `approved` 게이트
- 콘티(S3): [./03_STORYBOARD_WORKFLOW_KR.md](./03_STORYBOARD_WORKFLOW_KR.md)
- 지식 DB(vault 스키마·동기화 규약 전체): [../platform/10_KNOWLEDGE_DB_KR.md](../platform/10_KNOWLEDGE_DB_KR.md)
- 오케스트레이션(승인 게이트 감지·단계 연결·헤르메스 판단): [../platform/11_ORCHESTRATION_KR.md](../platform/11_ORCHESTRATION_KR.md)
- 회고를 생산하는 단계(S1의 입력 공급원): [./07_UPLOAD_WORKFLOW_KR.md](./07_UPLOAD_WORKFLOW_KR.md)
