# S7 업로드·회고 워크플로우 (07_UPLOAD_WORKFLOW_KR)

> Danbi Studio 영상 자동화 파이프라인의 마지막 단계. 최종 MP4를 플랫폼(YouTube Shorts → TikTok → Instagram Reels)에 단계적으로 게시하고, 게시 성과를 회고 노트로 환류해 다음 S1(시나리오)의 입력이 되게 한다.

---

## 1. 목적과 범위

- **목적**: S6에서 렌더된 최종 MP4와 vault 문서(대본·콘티·마커)로부터 ① 플랫폼별 업로드 메타데이터(제목/설명/태그/챕터)를 생성하고, ② 인간 승인 후 플랫폼 API로 게시하며, ③ 게시 후 24h/7d 성과를 수집해 `10-knowledge/retrospectives/` 회고 노트로 축적한다.
- **범위 안**: 메타데이터 생성 규칙, 업로드 모듈(별도 프로세스) 계약, OAuth 토큰 보관·갱신, 플랫폼별 단계적 출시 전략, 성과 수집·회고 환류 루프, `04-publish.md` 기록 규약.
- **범위 밖**: 렌더/최종 MP4 생성(→ [S6 편집·렌더](./06_EDITING_WORKFLOW_KR.md)), 채널 전략 노트 자체의 운영(→ [P3 지식 DB](../platform/10_KNOWLEDGE_DB_KR.md)), 단계 간 승인 게이트의 총괄 규칙(→ [P4 오케스트레이션](../platform/11_ORCHESTRATION_KR.md)).
- **핵심 설계 원칙 2가지**:
  1. [사실] 업로드 모듈은 **Danbi Studio 앱 밖의 별도 프로세스**로 둔다. Danbi의 플러그인·서명·라이선스 체계와 정합하는 결정이며(근거: [플랫폼 아키텍처 분석](../appendix/analysis/04_PLATFORM_ARCH_KR.md)), 클라우드 API 자격증명이 Danbi 코어에 스며들지 않게 격리한다.
  2. [사실] 플랫폼 3사 모두 완전 자동화 전에 심사(YouTube API 감사, TikTok 감사, Meta 앱 리뷰)가 걸려 있으므로 **단계적 출시(Phase A→B→C)** 를 전제로 설계한다(근거: [AI 도구 리서치 §8](../appendix/RESEARCH_AI_TOOLS_KR.md)).

## 2. 입력/출력 계약

### 2-1. 입력

| 입력 | 위치 | 조건 |
|---|---|---|
| 최종 MP4 | Danbi outputs 디렉터리(vault 밖) | S6 렌더 완료, preflight 통과 |
| 렌더 완료 이벤트 | S6 render-jobs의 잡 스냅샷/run report [사실] | 성공 상태 + 출력 파일 경로 포함 — 이것이 S7의 트리거 |
| 챕터 텍스트 | S6 마커→유튜브 챕터 텍스트 export 산출물 [사실] | 타임코드+제목 목록(마커는 1급 데이터) |
| 원천 문서 | `20-productions/<production_id>/00-scenario.md`, `01-script.md`, `02-storyboard.md` | `status: edited` 이상 |
| 채널 규약 | `10-knowledge/channels/<채널>.md` | 제목 어투·태그 세트·설명 푸터 등 채널 고유 규칙 |

### 2-2. 출력

| 출력 | 위치 | 내용 |
|---|---|---|
| 업로드 메타 문서 | `20-productions/<production_id>/04-publish.md` | 제목/설명/태그/챕터 + 플랫폼별 상태·URL·게시시각 |
| 회고 노트 | `10-knowledge/retrospectives/<production_id>-retro.md` | 24h/7d 지표 + verdict(keep/change 교훈) |
| 작업 로그 | vault `log.md` (append-only) | 업로드 시도·결과·쿼터 사용 이력 |
| 업로드 매니페스트/결과 파일 | 업로드 모듈 작업 디렉터리 [제안] | Danbi·vault와 업로드 프로세스 간 파일 기반 인터체인지 |

### 2-3. frontmatter 계약 (P3 지식 DB 스키마를 따름)

`04-publish.md` 필수 필드 [사실 — 공용 스키마 확정]:

```yaml
type: publish
production_id: 2026-07-05-heritage-sokguram
status: draft            # draft → approved → published
schema_version: 1
video_id: ""             # 대표 플랫폼(유튜브) 영상 ID
platforms:
  youtube:  { state: pending, url: "", published_at: "", visibility: private }
  tiktok:   { state: pending, url: "", published_at: "", mode: draft_upload }
  instagram:{ state: pending, url: "", published_at: "" }
```

회고 노트 필수 필드 [사실 — 공용 스키마 확정]: `type: retro`, `production_id`, `publish`(04-publish.md 위키링크), `views_24h`, `retention`, `verdict`. [제안] 추가 필드: `views_7d`, `likes_7d`, `comments_7d`, `hook_type`(시나리오에서 상속 — 훅 유형별 성과 비교용).

### 2-4. 상태 전이

- production 전체 상태: `edited → published` — 이 전이는 **대표 플랫폼(유튜브) 게시 성공 시점**에 S7이 수행한다 [제안].
- `04-publish.md` 자체 상태: `draft`(메타 초안) → `approved`(인간 승인) → 플랫폼별 `platforms.*.state`가 개별 진행(`pending → uploading → published | failed | draft_waiting`). [사실] 인간 승인 게이트(`draft→approved`)는 에이전트가 절대 스스로 넘지 않는다.

## 3. 워크플로우

### 단계 0 — 트리거 수신
S6 렌더 잡이 성공 종료하면 run report(잡 스냅샷)가 생성된다 [사실]. 오케스트레이터(Claude Code 스킬 체계)가 이를 감지해 S7을 개시한다. run report에서 MP4 절대경로·해상도·길이·챕터 export 경로를 취득하고, 없으면 즉시 중단(사람 호출).

### 단계 1 — 메타데이터 생성 (에이전트)
1. 채널 노트 → 최근 회고 노트 N건 → 대본·콘티 순으로 읽는다(전체 vault 스캔 금지 [사실 — vault 읽기 규약]).
2. 플랫폼별 변형을 한 번에 생성: 유튜브(제목 100자·설명·태그·챕터 텍스트), TikTok(캡션+해시태그), Instagram(캡션+해시태그). 챕터는 S6 마커 export 텍스트를 **재사용**하며 새로 쓰지 않는다 [사실].
3. [제안] 초안 생성 주체: 1차는 LM Studio 로컬 LLM(structured output으로 필드 강제), 품질 민감 시 Claude가 직접. 채널 노트의 금칙어·필수 푸터(출처 고지 등)를 항상 병합.
4. [사실 — 라이선스 가드레일] 국가유산 포털 등 수집 소스를 쓴 제작물은 `03-assets.md`의 출처·공공누리 유형을 확인해 설명란에 출처 표기를 자동 삽입하고, 제3·4유형(상업 금지) 소재가 섞였으면 게시를 차단 플래그로 막는다.
5. `04-publish.md`를 `status: draft`로 저장하고 git commit.

### 단계 2 — 인간 승인 게이트 ★
사람이 `04-publish.md`를 검토(제목·설명·썸네일·공개 범위·게시 예약 시각)하고 `status: approved`로 변경한다. 게시는 되돌리기 어려운 대외 행위이므로 이 게이트는 2단계(완전 무인화)에서도 유지를 권장 [제안].

### 단계 3 — 업로드 실행 (별도 프로세스)
오케스트레이터가 승인을 감지하면 **업로드 매니페스트**(MP4 경로, 플랫폼별 메타, 공개 범위, production_id)를 파일로 떨궈 업로드 프로세스를 기동한다. 플랫폼별 동작은 Phase에 따른다(§4-1). 업로드 프로세스는 결과 파일(플랫폼별 성공/실패, URL, 게시시각, 쿼터 사용량)을 남기고 종료한다.

### 단계 4 — 결과 기록 (에이전트)
결과 파일을 읽어 ① `04-publish.md`의 `platforms.*`를 갱신, ② 유튜브 성공 시 production `status: published` 전이, ③ `log.md`에 append(시각·플랫폼·URL·쿼터 소모), ④ git commit. 실패 시 `state: failed`+오류 요약을 기록하고 자동 재시도는 1회로 제한, 이후 사람 호출 [제안].

### 단계 5 — 회고 수집 (게시 +24h / +7d, 스케줄 실행)
1. 게시시각 기준 24h/7d 후 성과 수집 잡이 실행된다(스케줄드 태스크). 유튜브는 통계 조회 API(쿼터 저비용)로 조회수·좋아요 등을, 가능하면 애널리틱스 API로 유지율을 수집 [제안 — 유지율 API 가용 범위는 구현 시 확인].
2. `10-knowledge/retrospectives/<production_id>-retro.md`를 생성/갱신: 지표 + **verdict**(예: "질문형 훅이 평서형 대비 유지율 우위 — 유지", "태그 15개는 과다 — 8개로 축소").
3. 회고 노트는 `[[04-publish]]`→`[[02-storyboard]]`→…→`[[채널 노트]]`로 위키링크 계보를 완성한다.

### 단계 6 — 환류 (카파시 Query 환류 패턴 [사실])
"좋은 답은 위키에 다시 저장"되므로, 다음 S1 실행 시 에이전트는 채널 노트→최근 회고 N건을 반드시 읽는다. 여러 회고에서 반복 검증된 교훈은 에이전트가 채널 노트 본문으로 승격시켜 지식이 복리로 축적되게 한다. 이 환류가 파이프라인을 닫힌 학습 루프로 만든다.

## 4. 구현 기술 (코드 없이)

### 4-1. 플랫폼별 단계적 출시 [사실 — 리서치 §8 근거]

| Phase | 플랫폼/모드 | 제약과 근거 |
|---|---|---|
| **A (즉시)** | YouTube Data API v3 `videos.insert` | 쿼터 1,600유닛/편, 기본 일 10,000유닛 → **하루 약 6편**. Shorts 전용 API 없음 — 세로 규격 충족 시 자동 Shorts 판정. `youtube.upload`는 민감 스코프라 OAuth 동의화면 검증 필요. **미감사 API 프로젝트로 올린 영상은 private 잠금 처리될 수 있음** → 초기엔 private/unlisted 업로드로 운용하며 API 컴플라이언스 감사를 신청, 통과 후 공개 자동화 |
| **B (반자동)** | TikTok Content Posting API — **Upload(초안) 모드** | 미감사 클라이언트는 SELF_ONLY(본인만 보기) + 24시간당 최대 5명 사용자 + 게시 시점 계정 비공개 요건. 따라서 초안 업로드까지만 자동, **최종 게시는 사용자가 TikTok 앱에서** 수행. 스코프 `video.upload`(초안)/`video.publish` |
| **C (심사 후 완전 자동)** | TikTok Direct Post + Instagram Reels Graph API | TikTok 감사 통과(보고 기준 1~2주, 데모 영상 요구) 후 Direct Post. Instagram은 비즈니스 계정 필수 + Meta 앱 리뷰(스크린캐스트, 2~4주) + **video_url이 공개 접근 가능한 URL이어야 함**(로컬 우선 앱은 임시 호스팅 필요) + 24시간당 100건, 9:16·권장 90초 이내·H.264+AAC |

[제안] Phase 판단은 설정 파일의 플랫폼별 `phase` 값으로 명시하고, 업로드 프로세스는 자기 Phase에서 허용된 동작만 수행한다(예: Phase A에서 TikTok 매니페스트가 오면 "초안 모드만 가능" 안내 후 스킵).

### 4-2. 업로드 모듈 구조 [제안]

- **위치**: Danbi 저장소 밖 독립 폴더(예: `E:\ai_tool\danbi-uploader\`)의 자체 CLI 프로세스. Danbi 코어와는 파일 기반 인터체인지(매니페스트 in / 결과 out)로만 통신 — Danbi의 플러그인 서명·라이선스 격리 체계와 정합 [사실].
- **구성 요소**: ① OAuth 인증기(플랫폼별 로컬 브라우저 위임 + loopback 콜백; TikTok은 https 콜백 요구 관행으로 개발자 웹 콜백 브리지 필요 가능 [추정 — 리서치 표기 유지]), ② 플랫폼 어댑터(YouTube/TikTok/IG 공통 인터페이스: 업로드·상태조회·통계조회), ③ 쿼터 장부(일일 유닛 사용량 기록, 잔여 쿼터 부족 시 게시 예약을 다음 날로 이월), ④ 결과 리포터.
- **Instagram 공개 URL 요건 대응**: 임시 호스팅(사전 서명 URL을 주는 오브젝트 스토리지 등)에 올렸다가 게시 확인 후 즉시 삭제하는 "일회용 게시 버킷" 패턴. 상세 설계는 Phase C 착수 시 확정(Reels resumable upload 지원 여부 공식 문서 재확인 [추정 — 리서치 표기 유지]).

### 4-3. 토큰 보관·갱신 [제안]

- **보관**: refresh token은 **OS 키체인**(Windows 자격 증명 관리자)에 플랫폼·계정 단위로 저장. 매니페스트·vault·git·SQLite에는 토큰을 절대 기록하지 않는다(vault는 git 이력이 남으므로 특히 금지).
- **갱신 규칙**: ① access token은 매 실행 시 refresh token으로 재발급(디스크 캐시 안 함), ② refresh 실패(invalid_grant 등) 시 해당 플랫폼을 `auth_required` 상태로 표시하고 업로드 큐를 정지, 사람에게 재인증을 요청, ③ 회전형 refresh token(플랫폼에 따라 갱신 시 새 토큰 반환)은 수신 즉시 키체인 덮어쓰기, ④ Google OAuth 앱이 "테스트" 게시 상태면 refresh token이 단기 만료될 수 있으므로 동의화면을 "프로덕션" 상태로 올리는 것을 선행 조건에 포함.
- SQLite에는 토큰 자체가 아니라 **토큰 상태 메타**(만료 추정 시각, 마지막 갱신, auth_required 여부)만 둔다(지식 DB 역할 분담 원칙 [사실]).

### 4-4. Danbi 연계 지점

- **입력 연계**: S6 headless render CLI/render-jobs 큐의 완료 산출물(run report)과 마커 챕터 export [사실 — 에디터 분석 근거]. 업로드 모듈은 Danbi `/api/editor/*`를 호출하지 않는다 — 필요한 것은 전부 run report와 vault에서 얻는다 [제안].
- **기록 연계**: vault 쓰기(04-publish.md, retro, log.md)는 오케스트레이터(에이전트) 몫, 업로드 프로세스는 결과 파일까지만. 쓰기 주체를 한쪽으로 고정해 동시 쓰기 충돌을 차단 [제안].

## 5. 활용 스킬 (§4 카탈로그)

| 단계 | 스킬 | 이유 |
|---|---|---|
| 업로드 모듈 기획 | `feature-planner`, `superpowers:writing-plans` | OAuth·쿼터·Phase 분기가 얽힌 모듈이라 착수 전 계획 문서가 필수 |
| 모듈 구현 | `superpowers:test-driven-development`, `superpowers:subagent-driven-development` | 플랫폼 어댑터별 독립 구현·테스트에 적합 |
| 정책 최신화 | `WebSearch`/`WebFetch` | 플랫폼 API 정책(쿼터·심사 요건)은 수시 변경 — 구현 착수 시점에 재확인 |
| OAuth·쿼터 오류 진단 | `superpowers:systematic-debugging` | 401/403/쿼터 초과의 원인 분리(토큰 vs 스코프 vs 쿼터) |
| 게시 전 최종 점검 | `superpowers:verification-before-completion` | "업로드됐다" 주장 전 URL 실접속 확인 강제 |
| 업로더의 에이전트 노출 | `mcp-builder` | 업로드 프로세스를 MCP 도구로 감싸 Claude Code에서 승인→게시를 지시하는 선택지 [제안] |

## 6. 구현 단계 체크리스트

### 선행 조건
- [ ] S6 완료: headless render CLI 산출물 + run report + 마커 챕터 export가 실제로 생성됨(→ [S6 문서](./06_EDITING_WORKFLOW_KR.md)의 완료 조건)
- [ ] vault 구조 및 `90-templates/`에 publish·retro 템플릿 존재(→ [P3 문서](../platform/10_KNOWLEDGE_DB_KR.md))
- [ ] Google Cloud 프로젝트 생성, YouTube Data API 활성화, OAuth 동의화면(데스크톱) 구성 — 사용자 본인 계정
- [ ] TikTok 개발자 앱 등록(Phase B 착수 시), Meta 개발자 앱+비즈니스 계정 전환(Phase C 착수 시)

### 작업 항목

| # | 작업 | 산출물과 위치 | 검증 방법 |
|---|---|---|---|
| W1 | 인터체인지 계약 정의: 업로드 매니페스트·결과 파일의 필드 명세(경로, 플랫폼별 메타, Phase, 공개 범위)를 문서로 고정 | 업로더 폴더의 계약 문서(스키마 표) | 샘플 매니페스트 3종(YT/TikTok/IG)이 명세의 필수 필드를 모두 담는지 상호 검토 |
| W2 | publish/retro 문서 템플릿 제작(frontmatter §2-3 준수) | `DanbiVault/90-templates/` | 템플릿으로 만든 문서가 vault lint(frontmatter 검증)를 통과 |
| W3 | 메타데이터 생성 규칙 구현: 채널 노트+회고+대본 읽기 순서, 플랫폼별 변형 규칙, 출처 표기·차단 플래그 로직 | 오케스트레이터 스킬 정의(→ P4) + `04-publish.md` 초안 생성 | 테스트 production 1건에서 초안 생성 → 사람이 항목별(제목 길이, 챕터 타임코드, 출처 문구) 점검 |
| W4 | YouTube 어댑터: OAuth loopback 인증, 키체인 저장, `videos.insert`(+썸네일 설정), 쿼터 장부 | 업로더 폴더의 YT 어댑터 | **private 공개 범위로 실업로드** → URL 접속, Shorts 판정, 쿼터 장부에 1,600유닛 기록 확인 |
| W5 | 토큰 관리 모듈: §4-3 규칙(키체인, 갱신, auth_required 정지) | 업로더 공통 모듈 | 키체인의 토큰을 고의로 무효화 → 업로드 시도가 정지되고 재인증 안내가 발생하는지 확인 |
| W6 | 결과 기록기: 결과 파일 → `04-publish.md` patch + `status: published` 전이 + `log.md` append + git commit | 오케스트레이터 측 | W4 실업로드 후 04-publish.md의 URL·게시시각·플랫폼 상태가 자동 갱신되고 커밋이 남는지 확인 |
| W7 | 회고 수집기: 게시시각 기준 +24h/+7d 스케줄, 통계 수집, retro 노트 생성 | 스케줄드 태스크 + retro 노트 | 게시 24h 후 retro 노트가 자동 생성되고 `views_24h`·위키링크 계보가 채워지는지 확인 |
| W8 | TikTok 어댑터(Upload 초안 모드): SELF_ONLY 제약 표기, 초안 업로드 후 "앱에서 게시" 안내를 결과 파일에 기록 | 업로더 폴더의 TikTok 어댑터 | 본인 계정에 초안 업로드 → TikTok 앱 받은편지함에서 초안 확인 후 수동 게시 |
| W9 | (Phase C) IG 어댑터 + 일회용 게시 버킷, TikTok Direct Post 전환 | 업로더 폴더 | 심사 통과 후: 컨테이너 생성→media_publish 성공, 임시 URL이 게시 후 삭제되는지 확인 |
| W10 | S1 환류 확인: S1 읽기 경로에 retrospectives가 포함돼 있고 실제로 참조되는지 점검 | S1 스킬 정의 검토(→ [S1 문서](./01_SCENARIO_WORKFLOW_KR.md)) | retro 노트에 심은 검증 문구가 다음 시나리오 초안 근거에 반영되는지 1회 추적 |

## 7. 완료 조건

### 기계(에이전트) 완료 조건
- [ ] 렌더 완료 이벤트 → 메타 초안 → (승인 대기) → 업로드 → 결과 기록의 전 구간이 테스트 production 1건에서 무결 통과
- [ ] YouTube private 업로드 성공 + `04-publish.md` 자동 갱신 + production `status: published` 전이 + git 이력 존재
- [ ] 쿼터 장부가 일일 6편 한도를 인지하고 초과분을 이월 예약함
- [ ] 토큰이 키체인 외 어디에도(vault/git/SQLite/로그) 존재하지 않음을 점검으로 확인
- [ ] 24h 회고 노트 자동 생성 + verdict 필드 작성 + S1 읽기 경로에서 조회됨
- [ ] TikTok 초안 모드 업로드 1회 성공(반자동 확인)

### EXTERNAL_PENDING (외부 대기 — 여기서 멈추고 표기)
- [ ] `EXTERNAL_PENDING` — **YouTube OAuth 동의화면 검증 + API 컴플라이언스 감사**: 통과 전까지 공개(public) 자동 게시 금지, private/unlisted로만 운용 [사실]
- [ ] `EXTERNAL_PENDING` — **TikTok 앱 감사**: 통과 전 SELF_ONLY·초안 모드 제약 유지, Direct Post 전환 불가 [사실]
- [ ] `EXTERNAL_PENDING` — **Meta 앱 리뷰 + Instagram 비즈니스 계정 전환**: 통과 전 IG 자동 게시 착수 불가 [사실]
- [ ] `EXTERNAL_PENDING` — **인간 승인 게이트**: `04-publish.md` draft→approved는 항상 사람 몫

## 8. 리스크와 완화책

| 리스크 | 심각도 | 완화책 |
|---|---|---|
| [사실] 미감사 YT 프로젝트 업로드 영상의 private 잠금 | 높음 | 감사 통과 전 공개 자동화 금지(Phase A는 private 업로드 + 사람이 공개 전환), 감사 신청을 프로젝트 초기에 병행 |
| [사실] 쿼터 1,600유닛/편 → 일 ~6편 상한 | 중간 | 쿼터 장부+이월 예약, 증량 필요 시 감사 신청(기간 보장 없음을 일정에 반영), 다채널 확장 시 채널 수를 쿼터에 맞춰 설계 |
| [사실] TikTok/IG 심사 전 완전 자동화 불가 | 중간 | Phase B 반자동(초안 모드)을 정식 운용 모드로 설계 — 심사는 개선이지 전제 아님 |
| 토큰 유출(vault·git에 기록) | 높음 | 키체인 단일 보관 원칙 + 완료 조건에 부재 점검 포함 + 결과 파일에는 토큰 필드 자체를 두지 않음 [제안] |
| refresh token 만료·회수로 무인 파이프라인 정지 | 중간 | auth_required 정지+알림 규칙(§4-3), 동의화면 프로덕션 상태 선행, 갱신 실패를 log.md에 기록 [제안] |
| 게시 실패의 어중간한 상태(업로드됨/메타 미반영) | 중간 | 업로드 프로세스는 멱등 설계(같은 매니페스트 재실행 시 기존 영상 ID 감지), 재시도 1회 후 사람 호출 [제안] |
| 잘못된 메타(제목 오탈자, 출처 누락)로 공개 게시 | 중간 | 인간 승인 게이트 상시 유지 + 공공누리 3·4유형 차단 플래그 [사실 — 라이선스 가드레일] |
| IG 임시 호스팅 URL 노출 | 낮음 | 사전 서명 URL 단기 만료 + 게시 확인 즉시 삭제 [제안] |
| 회고 지표 편향(24h 조회수만으로 성급한 결론) | 낮음 | verdict는 7d 데이터 확보 후 확정, 단발 회고가 아닌 반복 검증된 교훈만 채널 노트로 승격 [제안] |

## 9. 관련 문서

- [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md) — 마스터 파이프라인 보고서
- [./06_EDITING_WORKFLOW_KR.md](./06_EDITING_WORKFLOW_KR.md) — S6 편집·렌더(입력 공급자: 최종 MP4·run report·챕터 export)
- [./01_SCENARIO_WORKFLOW_KR.md](./01_SCENARIO_WORKFLOW_KR.md) — S1 시나리오(회고 환류의 수신자)
- [../platform/10_KNOWLEDGE_DB_KR.md](../platform/10_KNOWLEDGE_DB_KR.md) — P3 지식 DB(vault 스키마·retrospectives 운영)
- [../platform/11_ORCHESTRATION_KR.md](../platform/11_ORCHESTRATION_KR.md) — P4 오케스트레이션(승인 게이트·스케줄 실행 총괄)
- [../appendix/RESEARCH_AI_TOOLS_KR.md](../appendix/RESEARCH_AI_TOOLS_KR.md) — 업로드 API 3사 제약 근거(§8)
- [../appendix/RESEARCH_KNOWLEDGE_DB_KR.md](../appendix/RESEARCH_KNOWLEDGE_DB_KR.md) — 카파시 Query 환류 패턴·frontmatter 스키마 근거
- [../appendix/analysis/04_PLATFORM_ARCH_KR.md](../appendix/analysis/04_PLATFORM_ARCH_KR.md) — 별도 프로세스·플러그인 서명 체계 정합 근거
