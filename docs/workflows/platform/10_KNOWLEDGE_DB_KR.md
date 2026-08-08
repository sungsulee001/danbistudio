# P3. 지식 DB — 카파시 LLM Wiki + Obsidian 운영 설계서

> ⚠ **개정 공지 (2026-07-06, 결정 D6)**: vault가 schema_version 2로 개정됨 — `05-sources/`(불변 자료 계층: texts/web/youtube) 및 `10-knowledge/entities/`(people/events/eras) 신설, type에 `source`·`entity` 추가. **현행 운영 규약의 원천은 vault의 `E:\ai_tool\DanbiVault\CLAUDE.md`(v2)이며, 본 문서의 폴더 트리·type 목록은 v1 기준이다.** 상세: [../appendix/DECISION_LOG_KR.md](../appendix/DECISION_LOG_KR.md) #D6

> 작성일: 2026-07-05 | 파이프라인 전 단계(S1~S7)가 공유하는 지식/창작물 저장 계층(DanbiVault)의 구축·운영 설계.
> 근거: [../appendix/RESEARCH_KNOWLEDGE_DB_KR.md](../appendix/RESEARCH_KNOWLEDGE_DB_KR.md) (카파시 원문·Obsidian·SQLite 하이브리드 리서치),
> [../appendix/analysis/04_PLATFORM_ARCH_KR.md](../appendix/analysis/04_PLATFORM_ARCH_KR.md) (Danbi Prisma/잡 시스템 실측).
> 표기: **[사실]** = 1차 출처/코드로 확인, **[제안]** = 본 문서의 설계 결정.

---

## 1. 목적과 범위

### 1-1. 목적

시나리오·대본·콘티·프롬프트·회고 같은 **지식/창작물**을, 에이전트가 읽고 쓰고 인간이 검토·승인할 수 있는 단일 저장소(Obsidian vault)로 운영한다. 설계의 뼈대는 안드레 카파시의 **LLM Wiki 패턴**이다 **[사실]**:

- **3계층 구조**: `raw`(불변 소스, 인간 소유, LLM은 읽기만) / `wiki`(LLM 전유 — 요약·엔티티·교차참조를 LLM이 전부 쓰고 유지) / `CLAUDE.md`(스키마 문서, 공동 진화 — "LLM을 규율 있는 위키 관리자로 만드는 열쇠").
- **3대 워크플로우**: ① **Ingest**(소스 추가 시 기존 위키 페이지들에 통합·모순 플래그) ② **Query**(위키 검색·인용 답변, 좋은 답은 새 페이지로 환류 → 지식 복리 축적) ③ **Lint**(주기적 건강검진 — 모순·낡은 주장·고아 페이지 탐지).
- 원칙: 플레인 마크다운 + git + 위키링크(`[[ ]]`) + YAML frontmatter, 불변 소스/파생 위키 분리, 유지보수(bookkeeping)는 LLM의 일.

여기에 카파시의 append-and-review 노트 철학(캡처는 마찰 0, 정리는 나중에) **[사실]** 을 `00-inbox/`로 결합해, "인간은 아이디어·소스·승인만 담당하고 에이전트가 구조화를 유지"하는 운영 모델을 만든다 **[제안]**.

### 1-2. 범위

- **포함**: vault 폴더 구조와 초기 구축 절차, frontmatter 스키마, 에이전트 읽기/쓰기 규약, SQLite(Prisma) 연동 규약, Obsidian 앱 구성, git 운영.
- **제외**: 각 단계 문서의 내용 규격(→ 각 stages 문서), 단계 연결·승인 게이트의 오케스트레이션 로직(→ [./11_ORCHESTRATION_KR.md](./11_ORCHESTRATION_KR.md)), Danbi 에디터 자체의 프로젝트 저장(EditorProjectRecord는 그대로 유지).

### 1-3. 데이터 이중 구조 원칙 (전 문서 공통 확정)

**운영/기계 상태는 SQLite, 지식/창작물은 vault.** 두 세계는 조인 키 2개와 단방향 이벤트 2개로만 연결한다(§4-2). 같은 사실을 양쪽에 쓰지 않는다(단일 진실 원천) **[제안, 브리프 확정]**.

---

## 2. 입력/출력 계약

### 2-1. vault 위치와 폴더 구조

- 위치 **[제안]**: `E:\ai_tool\DanbiVault\` — Danbi Studio 저장소(`private/UNLICENSED`) **밖**의 독립 폴더·독립 git 저장소. 코드와 창작물의 라이선스·백업 정책을 분리하기 위함.
- 구조(확정, 브리프 §2-3):

```
DanbiVault/
├── CLAUDE.md                  ← 스키마 문서(§2-4 항목 목록)
├── index.md                   ← 전체 카탈로그(링크 + 한 줄 요약)
├── log.md                     ← append-only 작업 로그(ingest/생성/업로드/lint 이력)
├── 00-inbox/                  ← 인간 캡처 전용(아이디어·급메모·소스 URL)
├── 10-knowledge/              ← wiki 계층(에이전트가 유지)
│   ├── channels/              ← 채널 전략 노트(채널당 1파일)
│   ├── topics/                ← 소재/트렌드 리서치
│   ├── prompts/               ← 검증된 이미지/영상/음성 프롬프트 템플릿
│   └── retrospectives/        ← 업로드 성과 회고(영상별/주간)
├── 20-productions/            ← 콘텐츠 계층(영상 1편 = 폴더 1개)
│   └── <production_id>/       ← 형식: YYYY-MM-DD-topic-slug
│       ├── 00-scenario.md
│       ├── 01-script.md
│       ├── 02-storyboard.md
│       ├── 03-assets.md
│       └── 04-publish.md
├── 90-templates/              ← 문서 템플릿(§2-5 목록)
└── _attachments/              ← 썸네일 등 소형 첨부만
```

- **대용량 미디어(생성 이미지/영상/음성)는 vault에 넣지 않는다.** Danbi outputs 디렉터리에 두고 `03-assets.md`에 경로+메타데이터로만 참조한다(git·Obsidian 인덱스 비대화 방지, 브리프 확정).
- 카파시 3계층 매핑 **[제안]**: `00-inbox/`와 외부 원본(유튜브 자막, 수집 자료) = raw 성격(에이전트는 읽기+승격만), `10-knowledge/` = wiki(에이전트 소유), `20-productions/` = 창작물(단계별 담당 에이전트 소유), `CLAUDE.md` = 스키마.

### 2-2. 공통 frontmatter 스키마 (모든 문서 필수) **[제안]**

| 필드 | 타입/값 | 설명 |
|---|---|---|
| `type` | scenario / script / storyboard / assets / publish / retro / channel / topic / prompt | 문서 유형. 파서와 Bases 뷰의 1차 분기 키 |
| `production_id` | `YYYY-MM-DD-topic-slug` | SQLite와의 조인 키. knowledge 계층 문서(channel/topic/prompt)는 생략 가능 |
| `status` | draft / approved / generated / edited / published / archived | §2-6 상태 머신. 삭제 대신 `archived` |
| `created` / `updated` | ISO 날짜 | 생성/최종 수정 시각 |
| `agent` | 문자열 | 마지막 작성 주체(예: scenario-agent, human) |
| `schema_version` | 정수 | 스키마 드리프트 방어. CLAUDE.md의 현행 버전과 일치해야 함 |

### 2-3. 유형별 추가 필드 **[제안]**

| type | 추가 필드 | 비고 |
|---|---|---|
| scenario | `channel`(위키링크), `topic`(위키링크), `target_duration`, `hook_type` | 채널 노트·소재 노트로 계보 시작 |
| script | `scenario`(상위 문서 위키링크), `word_count`, `tts_voice` | tts_voice는 S5의 Fun-CosyVoice 보이스 프리셋 명 |
| storyboard | `script`(위키링크), `cut_count`, `aspect_ratio`(예: 9:16) | 컷 목록 규격은 [../stages/03_STORYBOARD_WORKFLOW_KR.md](../stages/03_STORYBOARD_WORKFLOW_KR.md) |
| assets | `storyboard`(위키링크), `comfyui_job_ids`(SQLite `GenerationJob.id` 배열) | 두 저장소의 연결고리 ② |
| publish | `platforms`(youtube/reels/tiktok별 상태·URL·게시시각 맵), `video_id` | 업로드 규격은 [../stages/07_UPLOAD_WORKFLOW_KR.md](../stages/07_UPLOAD_WORKFLOW_KR.md) |
| retro | `publish`(위키링크), `views_24h`, `retention`, `verdict`(keep/change) | 교훈은 본문에, 수치는 frontmatter에 |
| channel / topic / prompt | `aliases`, `related`(위키링크 배열) 등 최소한만 | wiki 계층은 구조화 과잉 금지 |

**위키링크 계보 [제안]**: scenario ← script ← storyboard ← assets ← publish ← retro가 `[[ ]]` 사슬을 이루면, 백링크/그래프 뷰로 "이 채널 전략이 낳은 영상과 성과"를 역추적할 수 있고, 에이전트에게는 "다음 시나리오를 쓸 때 과거 회고를 따라 읽는" 탐색 경로가 된다.

### 2-4. CLAUDE.md(스키마 문서)에 담을 항목 **[제안]**

1. vault의 목적과 카파시 3계층 매핑(§2-1) — 어떤 폴더가 raw/wiki/창작물인지.
2. 폴더별 소유권 표(§3-4 제1조).
3. 문서 유형 정의와 필수 frontmatter(§2-2, §2-3) + 현행 `schema_version` 선언.
4. 상태 머신과 전이 권한 표(§2-6) — 누가 어떤 전이를 할 수 있는지.
5. **진실 원천 선언**: `status`는 vault가 원천, 잡 진행률·promptId는 SQLite가 원천. 서로 복제 금지.
6. 에이전트 읽기/쓰기 규약 8조 전문(§3-4).
7. git 커밋 메시지 규약: `agent(step): production_id 요약` (예: `storyboard-agent(S3): 2026-07-05-heritage-sokguram 콘티 12컷 초안`).
8. 명명 규칙: production_id 형식, 파일명 고정(00~04 접두), 위키링크는 파일명 기준.
9. 대용량 미디어 정책(vault 밖, 경로 참조만)과 `_attachments/` 허용 기준(예: 1MB 미만).
10. Lint 체크 목록(§3-3)과 실행 주기.

### 2-5. 90-templates 템플릿 목록 **[제안]**

`tpl-scenario.md`, `tpl-script.md`, `tpl-storyboard.md`, `tpl-assets.md`, `tpl-publish.md`, `tpl-retro.md`, `tpl-channel.md`, `tpl-topic.md`, `tpl-prompt.md` — 총 9종. 각 템플릿은 해당 유형의 필수 frontmatter(placeholder 값)와 본문 섹션 뼈대를 담는다. Templater 플러그인에 의존하지 않고 **에이전트가 템플릿 파일을 복사해 채우는 방식**을 표준으로 한다(Obsidian 미실행 시에도 동작) **[제안]**.

### 2-6. 상태 전이 계약 (확정)

`draft → approved → generated → edited → published` (+ 어느 상태에서든 `archived`).

- **인간 승인 게이트(`draft → approved`)는 에이전트가 절대 스스로 넘지 않는다**(브리프 확정 — Danbi의 "기본 dry-run, 명시적 옵트인" 철학과 동일).
- 에이전트는 자기 단계가 정의한 전이만 수행한다(예: 대본 에이전트는 scenario가 `approved`일 때만 script 생성 시작). 전이 권한 표는 CLAUDE.md 4항에 명문화.
- 상태 전이는 곧 파이프라인 게이트다: 오케스트레이터([./11_ORCHESTRATION_KR.md](./11_ORCHESTRATION_KR.md))는 frontmatter `status`만 보고 다음 단계 진행 여부를 판정한다.

---

## 3. 워크플로우

### 3-1. Ingest — 소스가 vault에 들어오는 길 **[제안, 패턴은 사실]**

1. 인간이 `00-inbox/`에 아이디어·URL·메모를 던진다(append-and-review — 형식 자유, 마찰 0).
2. Ingest 담당 에이전트(수동 트리거 또는 주기 실행)가 inbox 미처리 항목을 읽고: (a) 소재라면 `10-knowledge/topics/`에 리서치 노트로 승격(WebSearch/insane-search로 보강), (b) 채널 전략이라면 `channels/` 해당 노트에 통합, (c) 기존 위키와 모순되면 본문에 모순 플래그를 남긴다 — 카파시 Ingest의 "기존 10~15개 페이지에 통합·모순 플래그" 방식 **[사실]**.
3. 처리한 inbox 항목은 삭제하지 않고 처리 표시 후 보존(또는 `archived`), 처리 이력을 `log.md`에 append.

### 3-2. Query — 에이전트의 읽기 경로와 환류 **[제안]**

- 새 시나리오 작성 시 표준 읽기 순서: ① 해당 채널 노트 → ② 최근 회고 N건(백링크 추적) → ③ 관련 프롬프트 템플릿. **전체 vault 스캔 금지**(컨텍스트 낭비).
- **환류(카파시 Query의 핵심 [사실])**: 에이전트가 조사·판단한 유의미한 결론(예: "이 채널은 첫 3초 질문형 훅이 유지율 +15%")은 채팅에 버리지 말고 `10-knowledge/`에 페이지로 저장한다. 지식이 복리로 쌓이는 유일한 경로다.

### 3-3. Lint — 주간 건강검진 **[제안, 패턴은 사실]**

주 1회 Lint 에이전트가 점검하고 결과 보고를 `log.md`에 append한다. 체크 목록:

1. frontmatter 스키마 위반(필수 필드 누락, `schema_version` 불일치, 오타 필드명).
2. 깨진 위키링크·고아 문서(어디서도 링크되지 않는 페이지).
3. `status` 정합성: vault의 `comfyui_job_ids`와 SQLite `GenerationJob` 상태 대조(예: assets가 `generated`인데 잡이 failed).
4. 낡은 전략 노트·모순 플래그 미해결 건.
5. `index.md` 카탈로그 누락 항목.

### 3-4. 에이전트 읽기/쓰기 규약 8조 (CLAUDE.md에 전문 수록) **[제안]**

1. **소유권 구역**: `00-inbox/`는 인간 전용(에이전트는 읽기+위키 승격만), `10-knowledge/`는 에이전트가 쓰되 인간이 감사, `20-productions/`는 단계별 담당 에이전트만 자기 파일에 쓴다. raw 성격 원본은 불변.
2. **frontmatter 필수화**: 모든 문서는 `type`·`production_id`·`status`·`schema_version` 필수. 위반 문서는 Lint 대상. 본문을 고칠 때도 frontmatter 계약을 깨지 않는다.
3. **상태 머신으로만 진행**: `status`가 파이프라인 게이트. 에이전트는 자신에게 허용된 전이만 수행하며, 인간 승인 게이트(`draft→approved`)는 절대 넘지 않는다.
4. **append 우선, 파괴적 편집 금지**: `log.md`·에셋 결과 등 로그성 정보는 append-only. 기존 문서 수정은 섹션 단위 patch, 삭제 대신 `status: archived`. 모든 쓰기 후 git commit(`agent(step): production_id 요약`) — 롤백 가능성 확보.
5. **읽기 경로 준수**: §3-2의 채널 노트→회고→템플릿 순서. 전체 vault 스캔 금지.
6. **Query 환류**: 유의미한 결론은 `10-knowledge/` 페이지로 저장(§3-2).
7. **주간 Lint**: §3-3 체크 후 `log.md`에 보고.
8. **원자적 쓰기와 접근 방식**: 쓰기 전 대상 파일 mtime 확인 → temp 파일에 쓰고 rename하는 원자적 쓰기 채택(인간 동시 편집과의 충돌 완화). 배치 파이프라인은 파일시스템 직접 I/O(Obsidian 불필요), 대화형 세션(Claude Code)은 vault를 작업 디렉터리로 열어 작업, Obsidian 실행 중 세밀 조작이 필요할 때만 Local REST API/MCP 사용.

---

## 4. 구현 기술 (코드 없이)

### 4-1. 접근 계층

- **1순위 — 파일시스템 직접 I/O [제안, 근거 사실]**: Obsidian vault는 폴더 안의 마크다운 뭉치이므로 앱 실행 여부와 무관하게 에이전트가 직접 읽고 쓸 수 있다 **[사실]**. 배치 파이프라인·오케스트레이터는 이 방식만 사용.
- **대화형**: Claude Code 세션이 vault를 cwd로 열어 작업(널리 쓰이는 패턴 **[사실]**).
- **선택 — Local REST API 플러그인(coddingtonbear)**: `https://127.0.0.1:27124`에 vault CRUD·검색·frontmatter 패치 엔드포인트 제공, mcp-obsidian 계열 MCP 서버가 이를 Claude 도구로 노출 **[사실]**. Obsidian이 켜진 상태에서 미저장 버퍼와의 충돌 없이 세밀 조작이 필요할 때만 도입한다.

### 4-2. SQLite(Prisma) 연동 규약

Danbi는 현재 SQLite에 `GenerationJob`(status/modelName/workflowName/promptId/resultPath)과 `EditorProjectRecord` 단 2개 모델만 갖고 있으며, 파이프라인 엔티티(시나리오·콘티·계보)는 존재하지 않는다 **[사실]**.

**역할 분담 [제안, 브리프 확정]**:

| 구분 | SQLite (Prisma) | 마크다운 Vault |
|---|---|---|
| 성격 | 운영/기계 상태 | 지식/창작물 |
| 데이터 | 잡 큐·상태, ComfyUI promptId, 렌더 큐, 재시도 카운트, 경로 캐시 | 시나리오·대본·콘티·프롬프트 템플릿·채널 전략·회고 |
| 쓰기 패턴 | 고빈도·트랜잭션·동시성 | 저빈도·문서 단위·인간 검토 |
| 조회 | 정확한 상태 질의, 큐 폴링 | LLM 컨텍스트 로딩, 백링크 탐색, Bases 뷰 |
| 버전관리 | 불필요(현재 상태만 의미) | git |

**조인 키는 2개뿐 (확정)**: ① vault frontmatter `production_id` ↔ SQLite production 테이블, ② `03-assets.md`의 `comfyui_job_ids` ↔ `GenerationJob.id`. 방향 규칙: SQLite→vault 참조는 파일 경로로, vault→SQLite 참조는 ID로. 내용 복제 금지.

**단방향 이벤트 2개만 허용 (확정)**:

- (a) **잡 완료 → vault append**: 파이프라인 워커가 GenerationJob 완료를 감지하면 `03-assets.md`에 결과(경로·파라미터·job id)를 append.
- (b) **vault 승인 → 잡 enqueue**: 인간이 `status: approved`로 바꾸면 파일워처/폴링이 감지해 다음 단계 잡을 SQLite에 enqueue.
- 양방향 실시간 동기화는 만들지 않는다.

**production 테이블 신설 [제안]**: 조인 편의를 위해 Prisma에 production 모델을 추가하되 최소 필드만 둔다 — `production_id`(PK), `vaultPath`(vault 폴더 경로), 타임스탬프. 아울러 `GenerationJob`에 `productionId` 참조 컬럼 추가를 제안한다. `status` 캐시 컬럼을 두더라도 **원천은 vault**이며 캐시는 파생물임을 CLAUDE.md에 못박는다. 패키지 Electron 모드는 Prisma를 우회하므로(파일 기반 저장소 **[사실]**) 파이프라인 오케스트레이터는 이 테이블에 Danbi API 계약을 통해서만 접근하고 DB 파일에 직접 붙지 않는다.

**전문 검색(FTS5)은 파생물 [제안, 카파시 권고 사실]**: 소스 ~100+ 규모가 되면 SQLite FTS5(+임베딩 하이브리드)로 vault 전문 인덱스를 추가하되, 인덱스는 언제든 마크다운에서 재생성 가능한 파생물로만 취급한다(memweave의 cascade index 패턴과 동형 **[사실]**). 초기(월 수십 편 이하)에는 도입하지 않는다.

### 4-3. Obsidian 앱 구성

- **Bases(코어 플러그인) [사실]**: frontmatter 속성으로 쿼리 언어 없이 테이블/카드 뷰를 만들고, 셀 편집 시 해당 노트의 YAML이 자동 갱신된다. **[제안]** 이를 승인 대시보드로 쓴다 — "type=scenario, status=draft" 뷰에서 인간이 status 셀을 approved로 바꾸면 그 자체가 단방향 이벤트 (b)의 트리거가 된다. 기본 뷰 3종: 승인 대기(draft), 진행 중 production(approved~edited), 성과 회고(retro).
- **obsidian-git의 한계 [사실]**: 외부(에이전트) 수정은 자동 commit-and-sync 트리거를 발화시키지 못하는 알려진 이슈가 있다(obsidian-git #1088). → **대응 [제안]**: vault의 git commit은 obsidian-git에 맡기지 않고 **파이프라인 프로세스가 쓰기 직후 직접 commit**한다(규약 제4조). obsidian-git은 설치하지 않거나 인간 수동 편집분의 보조 커밋용으로만 둔다.
- **Local REST API**: §4-1의 선택 항목. 미도입이 기본값.
- 커뮤니티 플러그인 최소주의 **[제안]**: Bases(코어) 외 필수 플러그인 없음. Dataview·Templater는 도입하지 않아도 파이프라인이 성립하도록 설계돼 있다.

### 4-4. git 운영

- vault 루트에서 git 저장소 초기화(단일 저장소, Danbi 코드 repo와 분리).
- `.gitignore`: `_attachments/` 대형 파일, Obsidian 워크스페이스 캐시(`.obsidian/workspace*` 등).
- 커밋 규약: `agent(step): production_id 요약` — step은 S1~S7/ingest/lint. 인간 커밋은 `human: 요약`.
- 원격 push는 **백업 용도로만** 사용. 다기기 동기화(Obsidian Sync/클라우드 드라이브)와 git을 병용하지 않는다(이중 동기화는 충돌 증폭기) **[제안]**.

---

## 5. 활용 스킬

| 단계/작업 | 스킬 | 용도 |
|---|---|---|
| vault 스키마 설계 검토 | `brainstorming` (superpowers) | CLAUDE.md 항목·frontmatter 필드 확정 전 요구 탐색 |
| 구축 계획 수립 | `feature-planner`, `writing-plans` (superpowers) | Phase 1~4 작업 계획서 작성 |
| Ingest 리서치 보강 | `WebSearch`/`WebFetch`, `insane-search` | inbox 소재를 topics 노트로 승격할 때 근거 수집(네이버·유튜브 자막 지원) |
| 검증기·이벤트 워커 구현 | Serena (`find_symbol`, `insert_after_symbol` 등) | Danbi 코드(Prisma 스키마, 워커) 수정 시 심볼 단위 탐색·편집 |
| 검증기 개발 방법론 | `test-driven-development` (superpowers) | frontmatter 검증기·상태 전이 게이트는 테스트 먼저 |
| 구축 검증 | `verification-before-completion` (superpowers) | 각 Phase 완료 선언 전 실제 파일·커밋·이벤트 동작 확인 |
| 스키마 문서 자체의 품질 | `doc-coauthoring` | CLAUDE.md·템플릿 9종의 공동 작성·다듬기 |

---

## 6. 구현 단계 체크리스트

### Phase 1 — vault 골격 생성 (선행 조건: 없음. 코드 불필요, 파일 작업만)

- [ ] `E:\ai_tool\DanbiVault\` 생성, §2-1 폴더 트리 그대로 생성(빈 폴더 포함).
- [ ] `CLAUDE.md` 작성 — §2-4의 10개 항목을 모두 포함. `schema_version: 1` 선언.
- [ ] `index.md`(빈 카탈로그 뼈대), `log.md`(append-only 선언 헤더) 생성.
- [ ] `90-templates/`에 §2-5 템플릿 9종 작성 — 각각 해당 유형의 필수 frontmatter placeholder + 본문 섹션 뼈대.
- [ ] `10-knowledge/channels/`에 첫 채널 노트 1건(한국 문화유산 채널) 생성 — 이후 S1 문서의 입력이 된다.
- [ ] git 초기화, `.gitignore`(§4-4) 작성, 최초 커밋 `human: vault 골격 생성`.
- **검증**: 폴더 트리가 §2-1과 일치하는지 목록 대조. 템플릿 9종 각각의 frontmatter가 §2-2·§2-3 표와 필드명까지 일치하는지 대조. git log에 최초 커밋 확인. Obsidian으로 vault를 열어 인덱싱 오류 없음 확인.

### Phase 2 — 검증기와 단방향 이벤트 2개 (선행 조건: Phase 1 완료, Danbi 개발 환경)

- [ ] **frontmatter 검증기**: vault 문서를 읽어 §2-2·§2-3 스키마(필수 필드·값 도메인·`schema_version`)를 검사하는 도구를 파이프라인 저장소(오케스트레이션 계층, [./11_ORCHESTRATION_KR.md](./11_ORCHESTRATION_KR.md)의 스킬/스크립트 위치)에 둔다. 검증 라이브러리는 zod 계열 **[제안]**.
- [ ] **이벤트 (a) 잡 완료→append 워커**: GenerationJob 완료를 폴링/훅으로 감지해 해당 production의 `03-assets.md`에 결과를 append하고 git commit하는 워커. mtime 확인+원자적 쓰기(규약 제8조) 준수.
- [ ] **이벤트 (b) 승인 감지→enqueue 워처**: `20-productions/**` frontmatter의 `status` 변경을 파일워처/폴링으로 감지, `approved` 전이 시 다음 단계 잡을 Danbi API로 enqueue.
- [ ] **production 테이블 신설**: Prisma 스키마에 §4-2 최소 필드 모델 추가 + `GenerationJob.productionId` 참조. Danbi API 계약(라우트) 경유 접근만 허용.
- **검증**: 필드명 오타·필수 필드 누락·잘못된 status 값을 가진 표본 문서로 검증기가 전부 실패 판정하는지 확인. 더미 잡 완료→`03-assets.md` append+커밋 발생 확인. 표본 문서의 status를 approved로 수동 변경→enqueue 호출 발생 확인(dry-run 모드). Windows 파일 잠금 상황(파일을 열어둔 채)에서 재시도 백오프가 동작하는지 확인.

### Phase 3 — Obsidian 구성 (선행 조건: Phase 1 완료, Obsidian 설치)

- [ ] vault를 Obsidian으로 열고 Bases 뷰 3종(§4-3: 승인 대기/진행 중/회고) 구성.
- [ ] obsidian-git 미설치(또는 수동 보조용) 정책 적용, 커뮤니티 플러그인 최소주의 확인.
- [ ] (선택) Local REST API 도입 여부 판단 — 미도입이 기본.
- **검증**: Bases 승인 대기 뷰에서 status 셀을 approved로 편집 → 파일 YAML이 갱신되고 Phase 2의 워처가 감지하는지 end-to-end 확인.

### Phase 4 — Lint 워크플로우 (선행 조건: Phase 2 완료, production 표본 1건 이상)

- [ ] §3-3 체크 목록 5종을 수행하는 Lint 에이전트 절차(스킬 또는 주기 잡)를 오케스트레이션 계층에 등록. 주 1회.
- [ ] Lint 결과를 `log.md`에 append하는 보고 형식 확정.
- **검증**: 고의로 깨뜨린 표본(깨진 위키링크, 고아 문서, SQLite와 어긋난 status)을 심고 Lint가 전부 검출해 `log.md`에 보고하는지 확인.

---

## 7. 완료 조건

### 기계(에이전트) 완료 조건

- [ ] §2-1 폴더 트리·CLAUDE.md·템플릿 9종·git 저장소가 존재하고 최초 커밋이 있다.
- [ ] frontmatter 검증기가 표본 위반 문서를 100% 검출한다.
- [ ] 단방향 이벤트 2개가 각각 dry-run으로 동작 확인됐다(잡 완료→append+커밋, approved→enqueue 호출).
- [ ] production 테이블과 `GenerationJob.productionId`가 스키마에 반영되고 API 경유 접근이 확인됐다.
- [ ] Lint 절차가 표본 결함을 검출해 `log.md`에 보고했다.
- [ ] 커밋 로그가 `agent(step): production_id 요약` 규약을 따른다.

### EXTERNAL_PENDING (사람/외부 의존 — 여기서 멈추고 보고)

- [ ] **인간 QA**: 실제 production 1편이 S1~S7을 거치며 vault 왕복(작성→승인→에셋 append→회고)을 완주하는 파일럿 검수 — 사용자 승인 필요.
- [ ] **vault 위치·원격 백업 확정**: `E:\ai_tool\DanbiVault\` 위치와 원격 git 저장소(백업용) 개설은 사용자 결정 사항.
- [ ] **Obsidian 사용 습관 정합**: Bases 승인 대시보드가 사용자의 실제 검토 동선과 맞는지 사용 후 피드백 필요.

---

## 8. 리스크와 완화책

| # | 리스크 | 완화책 |
|---|---|---|
| 1 | **md↔SQLite 동기화 충돌 [제안]** — 같은 사실을 양쪽에 쓰면 반드시 어긋남 | 단일 진실 원천 + 단방향 이벤트 2개(§4-2)로 원천 차단. `status`=vault 원천, 잡 진행률=SQLite 원천을 CLAUDE.md에 명문화 |
| 2 | **Obsidian 열림 중 외부 수정 [사실+제안]** — 인간 미저장 편집과 에이전트 쓰기 충돌 시 한쪽 유실 가능. obsidian-git은 외부 수정이 자동 커밋 트리거를 깨우지 못함(#1088 **[사실]**) | 에이전트 쓰기는 파이프라인이 직접 git commit(obsidian-git 비의존). 쓰기 전 mtime 확인 후 temp→rename 원자적 쓰기(규약 제8조) |
| 3 | **git 충돌 [사실+제안]** — obsidian-git은 rebase 충돌 시 수동 해결 요구 | 단일 PC 로컬 운영, 원격 push는 백업 전용. Obsidian Sync/클라우드 드라이브와 git 병용 금지 |
| 4 | **Windows 파일 잠금 [제안]** — 열린 핸들이 rename/delete 차단, SQLite `database is locked` 가능 | SQLite WAL 모드 활성화, vault 쓰기에 재시도 백오프, 미디어·대형 첨부를 vault 밖에 두어 인덱싱 부하 축소 |
| 5 | **frontmatter 스키마 드리프트 [제안]** — 필드명 미묘 변형(`channel` vs `channels`)으로 Bases·파서가 조용히 깨짐 | `schema_version` 필드 + 주간 Lint + 파이프라인 측 frontmatter 검증기(Phase 2)로 3중 방어 |
| 6 | **vault 비대화 [제안]** — 생성 미디어 유입 시 git repo·Obsidian 인덱스 수 GB 폭증 | 미디어는 경로 참조만(브리프 확정), `.gitignore`로 `_attachments/` 대형 파일 제외, Lint에서 크기 감시 항목 추가 가능 |
| 7 | **2차 출처 의존 [사실]** — "LLM Wiki 1,600만 조회" 등 반향 수치는 2차 블로그 기반 | 설계 근거로는 카파시 gist 원문의 구조·원칙만 사용(본 문서도 그렇게 함). 상세 출처 구분은 [../appendix/RESEARCH_KNOWLEDGE_DB_KR.md](../appendix/RESEARCH_KNOWLEDGE_DB_KR.md) 참조 |

---

## 9. 관련 문서

- 마스터 보고서: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)
- 상세 근거(리서치 전문): [../appendix/RESEARCH_KNOWLEDGE_DB_KR.md](../appendix/RESEARCH_KNOWLEDGE_DB_KR.md)
- 플랫폼 아키텍처 실측(Prisma/잡/경계): [../appendix/analysis/04_PLATFORM_ARCH_KR.md](../appendix/analysis/04_PLATFORM_ARCH_KR.md)
- 단계 문서(각 vault 파일의 내용 규격 소유자):
  [../stages/01_SCENARIO_WORKFLOW_KR.md](../stages/01_SCENARIO_WORKFLOW_KR.md) ·
  [../stages/02_SCRIPT_WORKFLOW_KR.md](../stages/02_SCRIPT_WORKFLOW_KR.md) ·
  [../stages/03_STORYBOARD_WORKFLOW_KR.md](../stages/03_STORYBOARD_WORKFLOW_KR.md) ·
  [../stages/04_IMAGE_GEN_WORKFLOW_KR.md](../stages/04_IMAGE_GEN_WORKFLOW_KR.md) ·
  [../stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md](../stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md) ·
  [../stages/06_EDITING_WORKFLOW_KR.md](../stages/06_EDITING_WORKFLOW_KR.md) ·
  [../stages/07_UPLOAD_WORKFLOW_KR.md](../stages/07_UPLOAD_WORKFLOW_KR.md)
- 플랫폼 문서: [./08_UNIFIED_BUILDER_KR.md](./08_UNIFIED_BUILDER_KR.md)(콘티·에셋 한 화면 제어 — vault를 읽음) ·
  [./09_COMFYUI_DASHBOARD_KR.md](./09_COMFYUI_DASHBOARD_KR.md)(GenerationJob 큐 — 이벤트 (a)의 원천) ·
  [./11_ORCHESTRATION_KR.md](./11_ORCHESTRATION_KR.md)(상태 머신 게이트의 소비자, 검증기·워커의 소유자)
