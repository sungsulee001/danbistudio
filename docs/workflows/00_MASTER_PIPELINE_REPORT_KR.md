# Danbi Studio 영상 자동화 파이프라인 — 마스터 보고서

- 작성일: 2026-07-05
- 작성 방식: 멀티 에이전트 집중 분석(프로젝트 문서 4개 클러스터 병렬 분석 + 외부 기술 리서치 3종) 후 종합
- 근거 원본: [appendix/analysis/](appendix/analysis/) (프로젝트 분석 4종), [appendix/](appendix/) (리서치 3종)
- 시각화: [PIPELINE_VISUALIZATION_KR.html](PIPELINE_VISUALIZATION_KR.html) (브라우저로 열기)

---

## 1. 한 줄 결론

**Danbi Studio는 이미 파이프라인의 "실행 엔진"으로서 준비가 끝나 있다.** 시나리오→대본→콘티→이미지→영상/음성→편집→업로드 전체 자동화에서 실제로 새로 만들어야 할 것은 (①) 콘티→EditorProject 컴파일러, (②) 실제 I2V 영상 워크플로우, (③) TTS 연동, (④) 업로드 모듈 — 4가지로 좁혀지며, 나머지는 기존 자산의 연결 문제다.

---

## 2. 요구사항 정리 (2026-07-05 사용자 메모 기준)

| 요구 | 대응 문서 |
|---|---|
| 시나리오→업로드 전체 자동화 | [stages/](stages/) 01~07 워크플로우 7종 |
| 콘티·이미지·동영상 한 화면 제어 빌더 | [platform/08_UNIFIED_BUILDER_KR.md](platform/08_UNIFIED_BUILDER_KR.md) |
| 헤르메스 에이전트 필요 여부 | [platform/11_ORCHESTRATION_KR.md](platform/11_ORCHESTRATION_KR.md) — **결론: 지금은 불필요, 무인화 2단계에서 재검토** |
| ComfyUI 대시보드 (심플하게) | [platform/09_COMFYUI_DASHBOARD_KR.md](platform/09_COMFYUI_DASHBOARD_KR.md) |
| DB: 카파시 wiki + 옵시디언 | [platform/10_KNOWLEDGE_DB_KR.md](platform/10_KNOWLEDGE_DB_KR.md) |
| 어떤 스킬을 쓸지 | [appendix/SKILLS_MATRIX_KR.md](appendix/SKILLS_MATRIX_KR.md) |

---

## 3. 프로젝트 현황 진단 (집중 분석 결과)

### 3.1 지금 갖고 있는 것 [사실]

- **편집 엔진**: 멀티트랙 타임라인 전체 커맨드, `EditorProject` JSON 단일 계약(UI·렌더러·자동화 API가 동일 스키마 해석), 스키마 검증기, 로컬 STT 자막(word-level), FFmpeg 렌더 큐 + preflight, 하드웨어 인코더 자동 감지. 2026-06-16 릴리스 검증 17/17 게이트 통과, 설치앱 수락 테스트 통과.
- **자동화 API**: `/api/editor/*` 21개 라우트(API 토큰 게이트), 자동화 훅 4종(manual/on-import/before-export/on-gap), allowlist 웹훅, **헤드리스 렌더 CLI + 렌더 워커 데몬(LAN 플릿)** — 무인 렌더 파이프라인이 이미 검증돼 있음.
- **ComfyUI 연동**: 배치 큐(기본 dry-run), 워크플로우 JSON 파라미터 주입, 결과 검수(side-by-side)→undo 가능한 반영, AI B-roll gap fill, promptLineage 메타데이터. 보안 경계(localhost 기본, 경로 탈출 차단) 확립.
- **상호교환**: EDL/FCPXML/마커 CSV/유튜브 챕터 텍스트 import·export. 챕터 마커는 렌더 시 MP4에 실제로 박힘.
- **플러그인 체계**: manifest 권한 모델 + RSA 서명 + 프로세스 격리. 커스텀 워크플로우를 플러그인으로 배포하는 공식 경로 존재.

### 3.2 없는 것 — 4대 결손 [사실]

| # | 결손 | 내용 | 해결 문서 |
|---|---|---|---|
| ① | **콘티→EditorProject 컴파일러** | 콘티(컷 목록)를 받아 검증된 프로젝트 JSON(트랙/클립/자막/마커)을 생성하는 모듈이 없음. 타임라인 조작 함수는 순수 라이브러리로 존재하므로 재료는 충분 | [stages/06](stages/06_EDITING_WORKFLOW_KR.md) |
| ② | **실제 I2V 영상 워크플로우** | `workflows/broll_i2v.json`은 이름과 달리 **SD1.5 정지 이미지** 생성용 플레이스홀더. WAN 2.1 등 진짜 영상 워크플로우 JSON이 저장소에 없음 | [stages/05](stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md) |
| ③ | **TTS(음성 생성)** | STT(음성→자막)는 강력하나 대본→음성 경로가 전무. 보이스오버는 마이크 녹음 기반 | [stages/05](stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md) |
| ④ | **업로드 모듈** | 유튜브/틱톡/릴스 업로드 기능·계획 모두 없음(로드맵에서 "별도 제품 범위"로 명시적 제외) | [stages/07](stages/07_UPLOAD_WORKFLOW_KR.md) |

부가 결손: 시나리오/대본/콘티라는 "상위 산출물" 개념 자체가 프로젝트에 없음(→ 지식 DB가 담당), ComfyUI readiness 진단·WebSocket 진행률(설계 문서는 이미 존재, 미구현).

### 3.3 설계 철학 [사실 — 전 문서 일관]

Danbi는 처음부터 **"n8n/Make/Opal의 백엔드 엔진"**으로 포지셔닝됐다. 로컬 우선(localhost 기본+allowlist), 기본 dry-run+명시적 옵트인, 라이선스 경계(GPL 격리, `license:check` CI 게이트), 사람 검수 후 반영. **파이프라인도 이 철학을 그대로 따른다: 오케스트레이터는 밖에, 실행은 Danbi가, 승인은 사람이.**

---

## 4. 목표 파이프라인 아키텍처

### 4.1 계층 구조 [제안]

```
┌─────────────────────────────────────────────────────────────┐
│  오케스트레이션 계층 (Danbi 밖)                                  │
│  1단계: Claude Code 스킬 체계(반자동) → 2단계: 무인화(hermes 재검토) │
├─────────────────────────────────────────────────────────────┤
│  지식/콘텐츠 DB (Obsidian vault — 카파시 LLM Wiki 3계층)          │
│  시나리오·대본·콘티·프롬프트·회고 = 마크다운 + frontmatter + git     │
├──────────────────────────┬──────────────────────────────────┤
│  생성 엔진 (로컬 GPU)        │  클라우드 어댑터 (선택 슬롯)          │
│  ComfyUI: 이미지·I2V·BGM   │  Nano Banana 2 / GPT Image 2     │
│  CosyVoice TTS·SenseVoice │  클라우드 LLM (품질 중요 단계)        │
├──────────────────────────┴──────────────────────────────────┤
│  편집·렌더 엔진 (Danbi Studio)                                  │
│  media import → EditorProject JSON → preflight → headless 렌더 │
├─────────────────────────────────────────────────────────────┤
│  배포 계층 (Danbi 밖 별도 프로세스)                               │
│  YouTube → TikTok(초안) → IG Reels (단계적 출시)                │
├─────────────────────────────────────────────────────────────┤
│  운영 상태 DB (기존 Prisma SQLite): 잡 큐·promptId·렌더 상태       │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 7단계 워크플로우 요약

| 단계 | 산출물 (vault) | 핵심 기술 | 승인 게이트 |
|---|---|---|---|
| **S1 시나리오** | `00-scenario.md` | 채널 노트+회고 환류 읽기 → 리서치(Tavily/insane-search, 국가유산 포털) → LM Studio(Kanana/SOLAR) 초안 | ✅ 인간 승인 |
| **S2 대본** | `01-script.md` | LM Studio structured output(장면 블록 JSON), TTS 친화 글쓰기 규칙, 길이 검증 | 자동 검증 |
| **S3 콘티** | `02-storyboard.md` | 컷 스키마(프롬프트·모션·나레이션·전환), 레퍼런스 시트 일관성(webtoon-harness 구조), gongnyang/vibe 프롬프트 게이트 | ✅ 인간 승인 (P1 빌더) |
| **S4 이미지** | 이미지 파일 + `03-assets.md` | ComfyUI(Qwen-Image/FLUX.2) 로컬 슬롯 + Nano Banana 2/GPT Image 2 클라우드 슬롯, 기존 comfyui-jobs 큐 재사용 | P1 빌더 검수 |
| **S5 영상·음성·BGM** | 클립·음성·BGM + `03-assets.md` | WAN 2.1 I2V(신규 워크플로우), CosyVoice 3.0 TTS, SenseVoice 정렬, ACE-Step 1.5 BGM, VRAM 직렬화 | P1 빌더 검수 |
| **S6 편집·렌더** | EditorProject JSON → MP4 | **콘티→프로젝트 컴파일러(신규)**, media import API, lottie 오버레이, preflight, headless 렌더 | ✅ 인간 검수 (Danbi UI) |
| **S7 업로드·회고** | `04-publish.md` + 회고 노트 | YouTube Data API(일 ~6편) → TikTok 초안 → IG, 마커→챕터 재사용, 성과 회고 환류 | ✅ 인간 승인 (초기) |

데이터 흐름의 뼈대: **vault 문서의 `status` 필드가 파이프라인 게이트다** (`draft → approved → generated → edited → published`). 에이전트는 인간 승인(`draft→approved`)을 절대 스스로 넘지 않는다 — Danbi의 dry-run 철학과 동일.

---

## 5. DB 전략: 카파시 LLM Wiki + Obsidian [핵심 요구 대응]

카파시가 2026-04 공개한 LLM Wiki 패턴(원문 gist 확인)을 Obsidian vault로 구현한다. 상세: [platform/10_KNOWLEDGE_DB_KR.md](platform/10_KNOWLEDGE_DB_KR.md)

- **3계층**: 불변 소스(`raw` 성격) / LLM이 소유·유지하는 위키(`10-knowledge/`) / 스키마 문서(vault의 `CLAUDE.md`)
- **3대 워크플로우**: Ingest(소스 위키화) · Query(답을 위키에 환류 — "좋은 답은 새 페이지로") · Lint(주간 건강검진)
- **영상 1편 = 폴더 1개** (`20-productions/2026-07-05-topic-slug/`에 시나리오~게시 기록 5개 파일)
- **SQLite와 역할 분담**: 잡·큐·상태 = SQLite(기존 Prisma), 지식·창작물 = 마크다운. 조인 키는 `production_id`와 `comfyui_job_ids` 둘뿐. 동기화는 단방향 이벤트 2개만(잡 완료→vault append / vault 승인→잡 enqueue) — 양방향 sync 금지.
- **Obsidian은 뷰어/승인 UI**: Bases로 frontmatter 테이블 뷰(제작 현황판), 그래프 뷰로 채널전략→영상→회고 계보 추적. 에이전트는 파일시스템 직접 I/O(앱 꺼져 있어도 동작).
- **대용량 미디어는 vault 밖** — Danbi outputs에 두고 경로 참조만.

---

## 6. 헤르메스 에이전트 판단 [핵심 질문 대응]

**결론: 지금은 도입하지 않는다. 완전 무인화(2단계) 시점에 1순위로 재검토한다.** [사실 기반 판단]

| 관점 | 평가 |
|---|---|
| 정체 | NousResearch의 자기개선형 범용 에이전트 (MIT, 209k★, 매우 활발) |
| 강점 | cron 스케줄러, 텔레그램 등 메신저 승인 루프, 병렬 서브에이전트, 이미지/TTS 도구 내장 |
| 지금 불필요한 이유 | ① 영상 도메인 기능 전무(콘티·타임라인·렌더 없음 — 결국 직접 작성) ② Python 상주 프로세스로 스택 분리 ③ 현행 Claude Code 스킬+MCP 체계와 역할 중복 |
| 도입 조건 | "매일 새벽 자동 생산 + 텔레그램으로 콘티 승인 + 자동 업로드" 수준의 무인 운영이 필요해질 때 |

---

## 7. 구현 로드맵 [제안]

| Phase | 내용 | 결손 해소 |
|---|---|---|
| **0. 지식 DB 구축** (선행) | DanbiVault 생성, CLAUDE.md 스키마, 템플릿, git 초기화. 첫 채널 전략 노트 작성 | — |
| **1. 반자동 MVP** | S1~S3 스킬 제작(시나리오·대본·콘티) → S4 이미지(기존 큐 재사용) → **콘티→프로젝트 컴파일러** → headless 렌더 → 수동 업로드. 1편을 끝까지 통과시키는 것이 목표 | ①  |
| **2. 생성 완성** | WAN I2V 워크플로우 제작·등록, CosyVoice TTS + SenseVoice 정렬, ACE-Step BGM, VRAM 직렬화 정책 | ②③ |
| **3. 빌더·대시보드** | P1 통합 빌더(/builder), P2 ComfyUI 대시보드(readiness+WS 진행률) | 부가 |
| **4. 배포 자동화** | YouTube 업로더(OAuth 검증 신청 병행) → TikTok 초안 모드 → 회고 환류 루프 | ④ |
| **5. 무인화 (선택)** | cron 생산 + 메신저 승인 + hermes-agent 재검토 | — |

Phase 1이 끝나면 "이미지 슬라이드형 쇼츠"는 이미 자동 생산 가능하다(I2V 없이도 정지 이미지+Ken Burns+TTS로 성립). Phase 2부터 진짜 영상 생성이 붙는다.

---

## 8. 스킬 활용 요약

상세 매트릭스: [appendix/SKILLS_MATRIX_KR.md](appendix/SKILLS_MATRIX_KR.md)

- **개발 시**: `feature-planner`(기능 계획) · superpowers `writing-plans`/`test-driven-development`/`subagent-driven-development`(구현 규율) · `frontend-design`+`theme-factory`(빌더·대시보드 UI) · `mcp-builder`(danbi-editor MCP 서버) · `webapp-testing`(E2E) · Serena(코드 심볼 탐색)
- **런타임(콘텐츠 생산)**: `insane-search`(리서치, 네이버·유튜브 자막) · `gongnyang-prompt-kit`(이미지 프롬프트 컴파일, 한국형) · `vibe-creating-skill`(영상 프롬프트 정제) · `diffusionstudio/lottie`(자막·타이틀 모션그래픽) — 전부 MIT, 포크 후 자체 유지
- **신규 제작할 스킬**: `danbi-scenario`, `danbi-script`, `danbi-storyboard`, `danbi-produce`, `danbi-upload` — `skill-creator`/`writing-skills`로 제작

---

## 9. 라이선스·보안 가드레일 [사실]

1. **코드 편입 금지**: OpenMontage(AGPL-3.0), palmier-pro(GPL-3.0), Shotcut(GPL) — 아키텍처/UX 참고만. toobusy_pingpong은 LICENSE 없음 — clean-room 재구현만.
2. **MIT 반입 절차**: source register + NOTICE + 파일 헤더 + `npm run license:check` 통과.
3. **미디어 출처 기록**: 국가유산 포털은 공공누리 유형 확인 필수(제3·4유형 상업 금지). 생성 미디어도 파라미터·계보(promptLineage) 기록.
4. **보안 경계 유지**: ComfyUI localhost 기본, 웹훅 allowlist+scoped secret, API 토큰 게이트, 업로드 토큰은 OS 키체인. 파이프라인이 이 게이트를 약화시키지 않는다.
5. **음성 클로닝**: 본인/허락받은 목소리만.

---

## 10. 리스크 톱 5

| 리스크 | 완화 |
|---|---|
| TikTok/IG 완전 자동화는 플랫폼 심사 통과 전 불가 | 단계적 출시 + 초안 모드 반자동 폴백. `EXTERNAL_PENDING`으로 관리 |
| 단일 RTX 3090에서 이미지·영상·음악·렌더 VRAM 경합 | 큐 직렬화 + 모델 언로드(`/free`) + 야간 배치 |
| ComfyUI 업데이트로 워크플로우 템플릿 파손 | 버전 고정 + 템플릿 스모크 테스트 + readiness 진단 |
| vault↔SQLite 동기화 어긋남 | 단일 진실 원천 + 단방향 이벤트 2개 원칙 (양방향 sync 금지) |
| AI 결과 자동 확정의 품질 사고 | 승인 게이트 4개 유지, 완전 자동화는 품질 임계값 정의 후에만 |

---

## 11. 문서 맵

```
docs/workflows/
├── 00_MASTER_PIPELINE_REPORT_KR.md   ← 이 문서 (총괄)
├── PIPELINE_VISUALIZATION_KR.html    ← 시각화 (브라우저로 열기)
├── README.md                         ← 인덱스·읽는 순서
├── stages/    01~07 단계별 워크플로우 (구현 기술·스킬·체크리스트·완료조건)
├── platform/  08 통합 빌더 · 09 ComfyUI 대시보드 · 10 지식 DB · 11 오케스트레이션
└── appendix/  스킬 매트릭스 · 리서치 원본 3종 · 프로젝트 분석 원본 4종
```

각 단계 문서는 "어떤 에이전트가 봐도 구현 착수 가능"을 기준으로 입출력 계약, 구현 단계 체크리스트, 기계/외부 완료 조건(`EXTERNAL_PENDING` 분리 — 사용자 확립 관행)을 포함한다.
