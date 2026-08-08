> 본 문서는 2026-07-05 파이프라인 집중 분석 세션의 리서치 산출물 원본이다.

# 지식/콘텐츠 DB 전략 리서치: 카파시 위키 + Obsidian 하이브리드

> 조사일: 2026-07-05 | 대상: Danbi Studio 자동화 파이프라인(시나리오→대본→콘티→이미지→영상/음성→편집→업로드)의 지식/콘텐츠 저장 계층 설계 근거 자료.
> 표기 원칙: **[사실]** = 1차 출처 확인됨, **[2차]** = 2차 출처만 확인(교차검증 필요), **[제안]** = 본 보고서의 설계 제안(추측/판단).

---

## 1. 안드레 카파시(Andrej Karpathy)의 위키/노트 철학

### 1-1. Append-and-review note (2025-03) **[사실]**

카파시는 개인 블로그 글 "The append-and-review note"(2025-03-19, [karpathy.bearblog.dev](https://karpathy.bearblog.dev/the-append-and-review-note/))에서 자신의 노트 방식을 공개했다:

- **단일 텍스트 노트 하나**만 유지. "여러 노트를 폴더로 분류·관리하는 것은 인지적 비용(cognitive bloat)이 너무 크다"고 명시.
- **Append**: 아이디어/할 일이 떠오르면 무조건 노트 맨 위에 텍스트로 추가.
- **Review**: 새 항목이 쌓이면 오래된 것이 "중력처럼" 아래로 가라앉고, 주기적으로 스크롤하며 살릴 항목만 맨 위로 복사해 끌어올림.
- 태그는 `watch:`, `read:` 같은 **인라인 플레인텍스트 접두어**만 사용. 날짜·링크·개념 태깅은 "별로 유용하지 않다"며 거부.
- 이 글 자체에는 LLM/에이전트 언급이 없음. 핵심은 **"구조화 비용 최소화, 캡처 우선"** 철학.

### 1-2. "콘텐츠는 LLM을 위해 써야 한다" (2025-03) **[사실]**

카파시는 X 포스트([x.com/karpathy/status/1899876370492383450](https://x.com/karpathy/status/1899876370492383450))에서 "2025년인데 대부분의 콘텐츠가 여전히 인간용으로 작성된다. 곧 99.9%의 attention은 LLM attention이 될 것"이라며, 문서는 사람이 클릭해 다니는 HTML이 아니라 **LLM 컨텍스트 윈도에 통째로 들어갈 수 있는 단일 마크다운 파일**이어야 한다고 주장했다. Jeremy Howard의 `llms.txt` 표준과 같은 흐름이다.

### 1-3. LLM Wiki (2026-04) **[사실 — 핵심 근거]**

카파시는 2026년 4월 X 포스트와 GitHub Gist([gist.github.com/karpathy/442a6bf...](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f))로 **"LLM Wiki"** 패턴을 공개했다. (포스트가 1,600만+ 조회, gist 5,000+ 스타라는 수치는 [MindStudio 블로그](https://www.mindstudio.ai/blog/andrej-karpathy-llm-wiki-knowledge-base-claude-code) 등 **[2차]** 출처.) Gist에서 확인한 핵심:

**3계층 구조:**
| 계층 | 소유자 | 내용 |
|---|---|---|
| `raw/` | 인간 (불변) | 원본 문서·자료. LLM은 읽기만, 절대 수정 안 함 |
| `wiki/` | **LLM 전유** | 요약·엔티티 페이지·개념 페이지·교차참조. "당신이 직접 쓰지 않는다 — LLM이 전부 쓰고 유지한다" |
| `CLAUDE.md`(스키마) | 공동 진화 | 페이지 유형·규약·워크플로 정의. "LLM을 규율 있는 위키 관리자로 만드는 열쇠" |

**3대 워크플로:** ① **Ingest**(소스 추가 시 LLM이 읽고 기존 위키 10~15개 페이지에 통합·모순 플래그), ② **Query**(위키를 검색해 인용과 함께 답변, "좋은 답은 새 페이지로 위키에 다시 저장" → 지식이 복리로 축적), ③ **Lint**(주기적 건강검진: 모순·낡은 주장·고아 페이지·데이터 공백 탐지).

**추출한 핵심 원칙:**
1. **플레인 마크다운** — 이식성·미래보장, LLM이 네이티브로 읽고 씀.
2. **git 버전관리** — "위키는 그냥 마크다운 git repo. 버전 이력·브랜치·협업이 공짜."
3. **위키링크(`[[페이지명]]`) + YAML frontmatter** — 상호연결과 메타데이터.
4. **불변 소스 / 파생 위키 분리** — 환각 드리프트 방지.
5. **RAG의 대안** — 매 쿼리마다 청크를 재조립하는 대신 사전 가공된 지식이 누적. ~100+ 소스 규모가 되면 벡터DB가 아니라 **SQLite FTS5 + 임베딩 하이브리드 검색** 추가를 권장.
6. **유지보수는 LLM의 일** — "위키를 죽이는 건 읽기·사고가 아니라 장부정리(bookkeeping). LLM은 지루해하지 않고 15개 파일을 한 번에 고친다." 인간은 소스 큐레이션과 좋은 질문만 담당.
7. Vannevar Bush의 Memex(1945)에서 "누가 유지보수하나"라는 미해결 문제를 LLM이 푼 것이라 자평.

**파이프라인 시사점 [제안]:** append-and-review(캡처는 마찰 0) + LLM Wiki(정리는 에이전트 몫)를 합치면 "인간은 아이디어·소스만 던지고, 에이전트가 시나리오/콘티/회고를 구조화된 위키로 유지"하는 우리 목표와 정확히 일치한다.

---

## 2. Obsidian Vault 스키마 제안

Obsidian vault는 결국 **폴더 안의 마크다운 파일 뭉치**이므로, Obsidian 앱이 꺼져 있어도 에이전트가 파일시스템으로 직접 읽고 쓸 수 있다 **[사실]**. Obsidian은 뷰어/편집기/쿼리 UI 역할.

### 2-1. 폴더 구조 (카파시 3계층을 파이프라인에 매핑) **[제안]**

```
DanbiVault/
├── CLAUDE.md                  ← 스키마 문서(에이전트 규약, 페이지 유형, 필수 frontmatter 정의)
├── index.md                   ← 전체 카탈로그(링크+한 줄 요약)
├── log.md                     ← append-only 작업 로그(ingest/생성/업로드 이력)
├── 00-inbox/                  ← append-and-review식 캡처(아이디어, 급메모)
├── 10-knowledge/              ← "위키" 계층(LLM이 유지)
│   ├── channels/              ← 채널 전략 노트(채널별 1파일)
│   ├── topics/                ← 소재/트렌드 리서치
│   ├── prompts/               ← 검증된 이미지/영상/음성 프롬프트 템플릿
│   └── retrospectives/        ← 업로드 성과 회고(영상별/주간)
├── 20-productions/            ← 콘텐츠 계층(영상 1편 = 폴더 1개)
│   └── 2026-07-05-topic-slug/
│       ├── 00-scenario.md     ← 시나리오
│       ├── 01-script.md       ← 대본(내레이션+타임코드)
│       ├── 02-storyboard.md   ← 콘티(컷 목록, 컷별 이미지 프롬프트)
│       ├── 03-assets.md       ← 생성 에셋 목록(파일 경로+생성 파라미터)
│       └── 04-publish.md      ← 업로드 메타(제목/설명/태그/플랫폼별 상태)
├── 90-templates/              ← Templater/에이전트용 문서 템플릿
└── _attachments/              ← 썸네일 등 소형 첨부(대용량 미디어는 vault 밖!)
```

핵심 판단: **대용량 미디어(생성 이미지/영상/음성)는 vault에 넣지 않고** Danbi Studio의 기존 출력 디렉터리에 두고, `03-assets.md`에 절대경로+메타데이터로만 링크한다. git과 Obsidian 인덱싱이 무거워지는 것을 방지 **[제안]**.

### 2-2. Frontmatter를 메타데이터 스키마로 **[제안, 근거는 사실]**

Obsidian의 Properties(YAML frontmatter)는 이제 코어 플러그인 **Bases**의 데이터 원천이다. Bases는 쿼리 언어 없이 frontmatter 속성으로 테이블/카드 뷰를 만들고, **셀을 편집하면 해당 노트의 YAML이 자동 갱신**된다 **[사실]** ([Obsidian Help](https://obsidian.md/help/bases), [Practical PKM](https://practicalpkm.com/bases-plugin-overview/)). 기존 Dataview 플러그인도 같은 frontmatter를 쿼리한다.

각 문서 유형별 필수 필드(구조 설명):

- **공통**: `type`(scenario/script/storyboard/assets/publish/retro), `production_id`(SQLite와 조인하는 키), `status`(draft→approved→generated→edited→published), `created`/`updated`, `agent`(마지막 작성 주체), `schema_version`
- **시나리오**: `channel`(위키링크로 채널 노트 연결), `topic`(위키링크), `target_duration`, `hook_type`
- **대본**: `scenario`(상위 문서 위키링크), `word_count`, `tts_voice`
- **콘티**: `script` 링크, `cut_count`, `aspect_ratio`(9:16 등)
- **에셋 목록**: `storyboard` 링크, `comfyui_job_ids`(SQLite `GenerationJob.id` 배열 — 두 저장소의 연결고리)
- **업로드**: `platforms`(youtube/reels/tiktok별 상태·URL·게시시각), `video_id`
- **회고**: `publish` 링크, `views_24h`, `retention`, `verdict`(keep/change 교훈)

**위키링크로 계보 형성**: 시나리오←대본←콘티←에셋←업로드←회고가 `[[ ]]` 링크로 사슬을 이루면, Obsidian 백링크/그래프 뷰에서 "이 채널 전략이 어떤 영상을 낳았고 성과가 어땠는지"를 즉시 역추적할 수 있다. 이것이 에이전트에게는 "다음 시나리오를 쓸 때 과거 회고를 따라가 읽는" 탐색 경로가 된다.

### 2-3. 자동화 접점 플러그인 **[사실]**

- **Local REST API**(coddingtonbear): `https://127.0.0.1:27124`에 vault CRUD·검색·frontmatter 패치 엔드포인트 제공. mcp-obsidian 등 MCP 서버가 이를 통해 Claude에 read/patch/append 도구를 노출 ([Obsidian Forum](https://forum.obsidian.md/t/claude-mcp-for-obsidian-using-rest-api/93284)).
- **파일시스템 직접 접근**: Obsidian 실행 여부와 무관하게 동작하며 설정이 단순 — 자동화 파이프라인에는 이 방식이 1순위 **[제안]**. Claude Code가 vault 폴더를 작업 디렉터리로 삼는 패턴이 이미 널리 쓰임 ([Awesome Claude](https://awesomeclaude.ai/how-to/use-obsidian-with-claude)).
- **obsidian-git**(Vinzent03): 자동 commit-and-sync(간격/편집중단 트리거). 단, **외부(에이전트) 수정은 이벤트 트리거를 발화시키지 못하는 알려진 한계**가 있음 → §5 리스크 참조.

### 2-4. 유사 사례 **[사실]**

- Obsidian을 Hugo/Astro/Jekyll의 headless CMS로 쓰는 사례 다수: [VaultCMS](https://github.com/davidvkimball/vaultcms)(Astro용), [Nick Gracilla의 Hugo CMS](https://www.nickgracilla.com/posts/obsidian-is-my-hugo-cms/), Obsidian CEO의 Obsidian→Jekyll→GitHub 배포 워크플로.
- [obsidian-content-pipeline](https://github.com/peritus/obsidian-content-pipeline): vault 파일을 **설정 가능한 다단계 LLM 파이프라인**으로 처리, 분석 결과에 따라 다른 출력 폴더로 라우팅 — 우리 "시나리오→대본→콘티" 단계 라우팅과 동형.
- Web Clipper로 YouTube 자막을 `/raw`에 frontmatter와 함께 저장하고 에이전트가 매시간 미처리 파일을 위키화하는 사례 ([MindStudio](https://www.mindstudio.ai/blog/auto-process-youtube-transcripts-obsidian-codex-wiki)).
- 에이전트 메모리 분야에서 "마크다운=진실의 원천, SQLite=상태/큐/인덱스" 조합이 사실상 표준으로 수렴 중: [memweave](https://towardsdatascience.com/memweave-zero-infra-ai-agent-memory-with-markdown-and-sqlite-no-vector-database-required/), [sqlite-memory](https://github.com/sqliteai/sqlite-memory), EverOS 등.

---

## 3. SQLite vs 마크다운 역할 분담 권고

Danbi Studio는 이미 Prisma+SQLite를 사용 중이다(**[사실]** — `E:\ai_tool\Danbi_Studio\prisma\schema.prisma` 확인: `GenerationJob`(status/modelName/workflowName/promptId/resultPath), `EditorProjectRecord`). 이를 그대로 살린 이중 구조를 권고한다 **[제안]**:

| 구분 | SQLite (Prisma) | 마크다운 Vault |
|---|---|---|
| 성격 | **운영/기계 상태** (Machine State) | **지식/창작물** (Human+LLM Knowledge) |
| 데이터 | 잡 큐·상태, ComfyUI promptId, 렌더 큐, 재시도 카운트, 파일 경로 캐시, 업로드 API 토큰 상태 | 시나리오·대본·콘티·프롬프트 템플릿·채널 전략·성과 회고 |
| 쓰기 패턴 | 고빈도·트랜잭션·동시성 | 저빈도·문서 단위·사람이 검토 |
| 조회 | 정확한 상태 질의, 큐 폴링 | LLM 컨텍스트 로딩, 백링크 탐색, Bases 뷰 |
| 버전관리 | 불필요(현재 상태만 의미) | git (obsidian-git 또는 파이프라인이 직접 commit) |
| 이유 | 잡 상태를 md로 쓰면 파싱·락·레이스 지옥 | 창작물을 DB BLOB로 넣으면 LLM·인간 모두 접근성 상실, diff 불가 |

**연결 규약 [제안]:** 조인 키는 두 개만 유지한다. ① vault 문서의 frontmatter `production_id` ↔ SQLite의 production 테이블(신설 권장), ② `03-assets.md`의 `comfyui_job_ids` ↔ `GenerationJob.id`. **방향 규칙: SQLite→vault 참조는 파일 경로로, vault→SQLite 참조는 ID로.** 서로의 내용을 복제하지 않는다(단일 진실 원천 유지).

**동기화 전략 [제안]:** 양방향 실시간 동기화는 만들지 않는다. 대신 (a) 잡 완료 시 파이프라인 워커가 `03-assets.md`에 결과를 **append**(SQLite→md, 단방향 이벤트), (b) 사람이 vault에서 `status: approved`로 바꾸면 파이프라인이 파일워처/폴링으로 감지해 다음 단계 잡을 SQLite에 enqueue(md→SQLite, 단방향 이벤트). 이벤트 기반 단방향 2개가 양방향 sync보다 훨씬 안전하다. 규모가 커지면 카파시 권고대로 SQLite FTS5로 vault 전문 인덱스를 만들되, **인덱스는 언제든 md에서 재생성 가능한 파생물**로 취급한다(memweave의 cascade index sync 패턴과 동일).

---

## 4. 에이전트 읽기/쓰기 규약 제안 **[제안]**

vault 루트의 `CLAUDE.md`(카파시의 "스키마 문서")에 다음을 명문화한다:

1. **소유권 구역**: `00-inbox/`는 인간 전용(에이전트는 읽기+위키로 승격만), `10-knowledge/`는 에이전트가 쓰되 인간이 감사, `20-productions/`는 단계별 담당 에이전트만 자기 파일에 씀, `raw/` 성격 자료는 불변.
2. **frontmatter 필수화**: 모든 문서는 `type`·`production_id`·`status`·`schema_version` 필수. 스키마 위반 문서는 lint 대상. 에이전트는 본문을 고칠 때도 frontmatter 계약을 깨지 않는다.
3. **상태 머신으로만 진행**: `status` 필드가 파이프라인 게이트. 에이전트는 자신이 전이시킬 수 있는 상태만 변경(예: 대본 에이전트는 scenario가 `approved`일 때만 script 생성 시작). 인간 승인 게이트(`draft→approved`)는 에이전트가 절대 넘지 않는다.
4. **append 우선, 파괴적 편집 금지**: 로그성 정보(`log.md`, 에셋 결과)는 append-only. 기존 문서 수정은 섹션 단위 patch로 하고, 삭제 대신 `status: archived`. 모든 쓰기 후 git commit(메시지 규약: `agent(step): production_id 요약`) — 롤백 가능성 확보.
5. **읽기 경로**: 새 시나리오 작성 시 에이전트는 ①해당 채널 노트 → ②최근 회고 N건(백링크 추적) → ③프롬프트 템플릿 순으로 읽는다. 전체 vault 스캔 금지(컨텍스트 낭비·비용).
6. **Query 결과의 환류**: 카파시 패턴대로, 에이전트가 조사·판단한 유의미한 결론(예: "이 채널은 첫 3초 질문형 훅이 유지율 +15%")은 채팅에 버리지 말고 `10-knowledge/`에 페이지로 저장.
7. **주기적 Lint**: 주 1회 에이전트가 고아 문서, 깨진 위키링크, `status` 불일치(SQLite와 대조), 낡은 전략 노트를 점검해 보고서를 `log.md`에 남긴다.
8. **접근 방식**: 배치 파이프라인은 파일시스템 직접 I/O(Obsidian 불필요), 대화형 세션(Claude Code)은 vault를 cwd로 열어 작업, Obsidian 앱이 켜진 상태에서 세밀한 조작이 필요하면 Local REST API/MCP 사용.

---

## 5. 리스크와 완화책

1. **동기화 충돌 (md ↔ SQLite)** **[제안]**: 같은 사실을 양쪽에 쓰면 반드시 어긋난다. → §3의 "단일 진실 원천 + 단방향 이벤트 2개" 원칙으로 원천 차단. `status`는 vault가 원천, 잡 진행률은 SQLite가 원천임을 CLAUDE.md에 못박는다.
2. **Obsidian 열림 중 외부 수정** **[사실+제안]**: Obsidian은 외부 파일 변경을 대체로 잘 리로드하지만, 사용자가 미저장 편집 중인 파일을 에이전트가 동시에 덮어쓰면 한쪽이 유실될 수 있다. 또한 obsidian-git은 **외부 수정이 자동 커밋 트리거를 깨우지 못하는 알려진 이슈**가 있다 ([obsidian-git #1088](https://github.com/Vinzent03/obsidian-git/issues/1088)). → 완화: 에이전트 쓰기는 파이프라인 프로세스가 직접 `git commit`(obsidian-git에 의존 X), 에이전트는 "쓰기 전 mtime 확인 후 원자적 쓰기(temp 파일→rename)" 채택.
3. **git 충돌** **[사실+제안]**: obsidian-git은 rebase 충돌 시 경고만 하고 수동 해결을 요구한다. → 완화: 단일 PC 로컬 운영이면 원격 push를 백업 용도로만 사용, 다기기 동기화(Obsidian Sync/클라우드 드라이브)와 git을 **병용하지 않는다**(이중 동기화는 충돌 증폭기).
4. **Windows 파일 잠금** **[제안]**: Windows에서는 열린 파일 핸들이 rename/delete를 막을 수 있다(Electron 앱·인덱서·백신이 원인 제공 가능). SQLite 쪽도 WAL 모드가 아니면 동시 접근 시 `database is locked` 가능. → 완화: SQLite WAL 활성화, vault 쓰기는 재시도 백오프 포함, `_attachments/`·미디어를 vault 밖에 두어 Obsidian 인덱싱 부하 축소.
5. **frontmatter 스키마 드리프트** **[제안]**: 에이전트가 필드명을 미묘하게 바꿔 쓰면(예: `channel` vs `channels`) Bases 뷰와 파이프라인 파서가 조용히 깨진다. → `schema_version` 필드 + lint 워크플로 + 파이프라인 측 frontmatter 검증기(zod 등)로 방어.
6. **vault 비대화** **[제안]**: 생성 미디어를 vault에 넣으면 git repo와 Obsidian 인덱스가 수 GB로 폭증. → 미디어는 경로 참조만, `.gitignore`로 `_attachments/` 대형 파일 제외.
7. **2차 출처 의존 주의** **[사실 구분]**: "LLM Wiki 포스트 1,600만 조회" 등 반향 수치는 2차 블로그 기반이므로 설계 근거로는 gist 원문의 구조·원칙만 사용할 것.

---

## 결론 (한 줄 요약)

카파시가 검증한 "불변 소스 / LLM 소유 위키 / 스키마 문서 + Ingest·Query·Lint" 패턴을 Obsidian vault로 구현하고(창작·지식·회고 = 마크다운+frontmatter+위키링크+git), 잡·큐·렌더 상태는 기존 Prisma SQLite에 남기며, 두 세계를 `production_id`/`job_id` 조인 키와 단방향 이벤트 2개로만 연결하는 것이 Danbi Studio 파이프라인에 가장 위험이 낮고 에이전트 친화적인 DB 전략이다.

### 주요 출처
- [Karpathy — The append-and-review note (2025-03)](https://karpathy.bearblog.dev/the-append-and-review-note/)
- [Karpathy — llm-wiki Gist (2026-04)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Karpathy — X: 콘텐츠는 LLM용으로 (2025-03)](https://x.com/karpathy/status/1899876370492383450)
- [Obsidian Help — Bases](https://obsidian.md/help/bases) / [Practical PKM — Bases 개요](https://practicalpkm.com/bases-plugin-overview/)
- [obsidian-git (Vinzent03)](https://github.com/Vinzent03/obsidian-git) / [외부 수정 트리거 이슈 #1088](https://github.com/Vinzent03/obsidian-git/issues/1088)
- [Obsidian Forum — Local REST API 기반 Claude MCP](https://forum.obsidian.md/t/claude-mcp-for-obsidian-using-rest-api/93284)
- [obsidian-content-pipeline](https://github.com/peritus/obsidian-content-pipeline) / [VaultCMS](https://github.com/davidvkimball/vaultcms) / [Obsidian is the perfect Hugo CMS](https://www.nickgracilla.com/posts/obsidian-is-my-hugo-cms/)
- [memweave — Markdown+SQLite 에이전트 메모리](https://towardsdatascience.com/memweave-zero-infra-ai-agent-memory-with-markdown-and-sqlite-no-vector-database-required/) / [sqlite-memory](https://github.com/sqliteai/sqlite-memory)
- 로컬 확인: `E:\ai_tool\Danbi_Studio\prisma\schema.prisma` (SQLite + `GenerationJob`, `EditorProjectRecord`)