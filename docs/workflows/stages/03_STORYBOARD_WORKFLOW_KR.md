# S3. 콘티(스토리보드) 워크플로우

> Danbi Studio 영상 자동화 파이프라인 3단계. 승인된 대본(`01-script.md`)을 컷 단위 실행 명세(`02-storyboard.md`)로 변환한다.
> 이 문서의 산출물은 S4(이미지 생성)·S5(영상·음성·BGM)·S6(편집 컴파일러)의 **입력 계약**이다.
> 표기: [사실] = 근거 보고서에서 검증된 내용, [제안] = 본 문서의 신규 설계.

---

## 1. 목적과 범위

- **목적**: 나레이션 중심의 대본을 "컷"이라는 기계 실행 단위로 분해하고, 각 컷에 생성 지시(이미지 프롬프트, I2V 모션 지시, 오디오·자막·전환 지시)를 결합해, 이후 전 단계가 추가 해석 없이 소비할 수 있는 단일 문서를 만든다.
- **범위(포함)**: 컷 분해 규칙, `02-storyboard.md` 스키마, 캐릭터·스타일 일관성 전략(레퍼런스 시트 선렌더링), 프롬프트 품질 게이트, 인간 승인 게이트, S6 컴파일러와의 입력 계약.
- **범위(제외)**: 실제 이미지/영상 생성 실행(S4/S5), 타임라인 조립·렌더(S6), 승인 UI 구현 자체(P1 문서 담당).
- **핵심 설계 원칙** [제안]: 콘티는 "그림 참고 자료"가 아니라 **컴파일 가능한 명세**다. S6의 콘티→EditorProject JSON 컴파일러(Danbi 신규 개발 1순위 [사실 — 브리프 §2-11, 에디터 분석 §5-1])가 이 문서를 파싱해 트랙/클립/자막/마커를 배치하므로, 모든 필드는 기계 파싱 가능한 고정 키로 기술한다.

## 2. 입력/출력 계약

### 2-1. 입력

| 항목 | 위치 | 조건 |
|---|---|---|
| 승인된 대본 | `DanbiVault/20-productions/<production_id>/01-script.md` | frontmatter `status: approved` 필수. 나레이션 세그먼트 ID(N01, N02, …)가 부여되어 있어야 함 [제안 — S2 문서와 규약 공유] |
| 시나리오 메타 | 같은 폴더 `00-scenario.md` | `target_duration`(초), `channel`, `aspect_ratio` 상속 |
| 채널 스타일 가이드 | `DanbiVault/10-knowledge/prompts/` 내 채널별 프롬프트 템플릿 노트 | 위키링크로 참조. 없으면 S3 착수 전 생성 요구 [제안] |
| 과거 회고 | `DanbiVault/10-knowledge/retrospectives/` | 컷 구성 교훈(훅 타입, 유지율) 참조 — 백링크 추적 읽기 경로 [사실 — 지식 DB 보고서 §4-5] |

### 2-2. 출력: `02-storyboard.md`

위치: `DanbiVault/20-productions/<production_id>/02-storyboard.md` (vault 구조는 브리프 §2-3 확정 [사실]).

**frontmatter 필드** [제안 — 지식 DB 보고서 §2-2의 공통 필드 규약 준수]:

| 필드 | 형식 | 설명 |
|---|---|---|
| `type` | `storyboard` 고정 | 문서 유형 |
| `production_id` | `YYYY-MM-DD-topic-slug` | SQLite 조인 키 |
| `status` | `draft → approved` (이후 `generated` 이상은 S4~S6이 전이) | 상태 머신, §3-6 참조 |
| `schema_version` | 정수 | 스키마 드리프트 방어 |
| `created` / `updated` / `agent` | 날짜 / 날짜 / 문자열 | 공통 감사 필드 |
| `script` | `[[01-script]]` 위키링크 | 상위 문서 계보 |
| `cut_count` | 정수 | 본문 컷 수와 일치해야 함(lint 대상) |
| `aspect_ratio` | `9:16` 등 | 쇼츠 기본. 상세페이지·웹페이지 파생 시 별도 프로덕션으로 분리 [제안] |
| `target_duration` | 초 | 시나리오에서 상속. 컷 duration 합계 검증 기준 |
| `reference_sheets` | 경로 배열 | 선렌더링된 레퍼런스 시트 파일 경로(vault 밖 Danbi outputs 디렉터리) [제안] |
| `style_guide` | 위키링크 | 적용한 `10-knowledge/prompts/` 스타일 가이드 노트 |

### 2-3. 컷 스키마 (본문 구조)

본문은 ① 요약 표 + ② 컷별 상세 블록의 2부 구성 [제안]. 요약 표는 인간 검토용, 상세 블록은 기계 파싱용이다.

**① 요약 표** — 한 행 = 한 컷:

| 컷 | 길이(초) | 샷 타입 | 나레이션 | 챕터 | 전환 |
|---|---|---|---|---|---|
| CUT-01 | 3.0 | CU(훅) | N01 | ◎ "석굴암의 비밀" | cut |
| CUT-02 | 5.5 | WS | N02 | — | dissolve |

**② 컷 상세 블록** — 컷마다 `### CUT-NN` 제목 아래 고정 키-값 목록. 필드 정의:

| 필드 키 | 필수 | 내용 | 주 소비자 |
|---|---|---|---|
| `duration_plan` | 필수 | 계획 길이(초, 소수 1자리). TTS 실측 길이에 따라 S6 컴파일러가 조정 규칙 적용(§3-5) | S5, S6 |
| `shot_type` | 필수 | EWS/WS/MS/CU/ECU/인서트/자료화면 중 택1 + 보조 설명 | S4, 인간 검토 |
| `image_prompt` | 필수 | 이미지 생성 프롬프트. `의도(한국어 1~2문장)` + `컴파일본(gongnyang 게이트 통과 최종 프롬프트)` 2계층 기록 [제안] | S4 |
| `reference` | 조건부 | 참조할 레퍼런스 시트 경로 또는 기존 에셋 경로. 캐릭터/반복 등장 소재 컷은 필수 | S4 |
| `motion` | 필수 | I2V 모션 지시: 카메라 무브(줌/팬/고정) + 피사체 동작 + 지속감. vibe-creating-skill 게이트 통과본 병기 | S5(WAN 2.1 등 I2V [사실 — 브리프 §2-11②]) |
| `narration_ref` | 필수 | `01-script.md`의 나레이션 세그먼트 ID(예: N03) + 해당 텍스트 발췌(대조 검증용) | S5(TTS), S6(자막 타이밍) |
| `subtitle` | 선택 | 화면 표시 자막/타이틀 텍스트, 스타일 프리셋명, Lottie 오버레이 지정 여부(diffusionstudio/lottie 소비 [사실 — 저장소 조사 §13 채택]) | S6 |
| `transition` | 필수 | 다음 컷으로의 전환: `cut` / `dissolve` / `ai-morph`(Danbi ComfyUI 트랜지션 [사실 — 에디터 분석 §1]) 등 | S6 |
| `bgm_cue` | 조건부 | `start` / `continue` / `change` / `stop` + 무드·템포 키워드. `start`/`change` 시 ACE-Step 프롬프트 힌트 포함 | S5(ACE-Step 1.5 [사실 — 브리프 §2-7]) |
| `chapter` | 선택 | 챕터 시작 컷이면 챕터 제목 기입 → S6 마커 생성 → 유튜브 챕터 직결(마커는 1급 데이터 [사실 — 브리프 §2-8]) | S6, S7 |
| `gates` | 자동 | 프롬프트 게이트 결과(`image: pass/fail`, `motion: pass/fail`) — 게이트 실행기가 기록 [제안] | 승인 전 lint |
| `approval` | 자동 | `pending` / `approved` / `rejected` — P1 통합 빌더의 컷 단위 승인 상태 [제안] | 승인 게이트 |

### 2-4. 상태 전이

```
(01-script.md: approved 확인)
  → 02-storyboard.md 생성: status: draft, 전 컷 approval: pending
  → 게이트·lint 통과 → 인간 검토 요청
  → P1에서 컷 단위 승인 → 전 컷 approved 시 문서 status: draft → approved  [인간 전용 전이]
  → approved 이후 내용 수정 발생 시: status를 draft로 되돌리고 수정 컷 approval 재설정(재승인) [제안]
```

`draft → approved` 전이는 인간만 수행한다 — 에이전트는 절대 스스로 넘지 않는다 [사실 — 브리프 §2-5 확정].

## 3. 워크플로우

### 3-1. 준비: 컨텍스트 로딩
에이전트는 ① 채널 스타일 가이드(`10-knowledge/prompts/`) → ② 최근 회고 N건 → ③ 승인된 `01-script.md` 순으로 읽는다. 전체 vault 스캔 금지 [사실 — 지식 DB 보고서 §4-5 규약].

### 3-2. 컷 분해 [제안]
1. 나레이션 세그먼트를 의미 단위로 묶어 컷 후보를 만든다. 쇼츠 기준 컷당 2~6초, 첫 컷(훅)은 3초 이내를 기본 규칙으로 한다.
2. 각 컷에 샷 타입을 배정하고, 동일 샷 타입 3연속 금지·훅 컷 강조 등 리듬 규칙을 적용한다(회고에서 학습한 규칙이 있으면 우선).
3. `duration_plan` 합계가 `target_duration` ±10% 이내가 되도록 배분한다(허용 오차는 lint 파라미터).
4. 챕터 경계(주제 전환점)에 `chapter` 제목을 지정하고, BGM 큐(`start`/`change`/`stop`)를 챕터 경계와 정합시킨다.

### 3-3. 일관성 전략: 레퍼런스 시트 선렌더링
- **구조 차용 근거** [사실]: revfactory/webtoon-harness(MIT)는 캐릭터 일관성을 위해 레퍼런스 시트를 본 생성 전에 선렌더링하고, 이후 모든 작화가 이를 참조하는 구조를 검증했다(저장소 조사 §5). 단 커밋 2개의 일회성 공개물이므로 의존성이 아닌 구조만 차용한다 [사실].
- **적용** [제안]:
  1. 콘티 초안에서 2회 이상 등장하는 인물·소재·배경을 추출해 "레퍼런스 시트 요구 명세"(대상, 앵글 세트, 스타일 키워드)를 콘티 문서의 부속 섹션으로 작성한다.
  2. 이 명세로 **S4에 소규모 선행 생성 잡을 요청**한다(본 생성과 동일한 ComfyUI 경로, 소량). 결과 이미지는 Danbi outputs 디렉터리에 두고 frontmatter `reference_sheets`에 경로를 기록한다 — 대용량 미디어는 vault 밖 원칙 [사실 — 브리프 §2-3].
  3. 인간이 P1(또는 폴백으로 Obsidian)에서 시트를 확정하면, 해당 컷들의 `reference` 필드에 확정 시트 경로를 기입한다. S4는 이 경로를 이미지 참조 조건(IPAdapter류 참조 입력)으로 사용한다 [제안].
  4. 채널 차원에서 재사용 가치가 있는 시트(마스코트, 고정 스타일)는 `10-knowledge/prompts/`의 채널 스타일 가이드 노트에 경로·사용 조건을 등재해 다음 프로덕션이 재사용한다 [제안].

### 3-4. 프롬프트 품질 게이트
- **이미지 프롬프트 게이트** [사실 기반]: kimsh-1/gongnyang-prompt-kit(MIT, 한국형 12카테고리 C1–C12, 장면/카메라/조명/HEX/텍스처 컴파일)를 포크해 대상 이미지 모델을 우리 파이프라인 모델(로컬 ComfyUI 체크포인트, Nano Banana 2/GPT Image 2 어댑터)로 치환하고 한국어화한다(저장소 조사 §10 — "채택(포크 후 치환)"). 각 컷의 `image_prompt.의도`를 입력으로 컴파일본을 생성하고 결과를 `gates.image`에 기록한다.
- **모션(I2V) 프롬프트 게이트** [사실 기반]: Alisa0808/vibe-creating-skill(MIT, 시각 앵커/액션·상태/톤/테마 4개 검증 레이어)을 포크·한국어화해 `motion` 필드를 검증·정제한다(저장소 조사 §6 — "채택(포크 후 자체 유지)").
- **게이트 실패 처리** [제안]: fail 컷은 승인 요청 대상에서 제외하고 에이전트가 프롬프트를 재작성해 재게이트한다. 3회 실패 시 해당 컷을 `rejected` 표기하고 인간 판단으로 넘긴다.

### 3-5. S6 컴파일러 입력 계약 (이 단계가 보증할 것) [제안]
콘티→EditorProject JSON 컴파일러(S6, Danbi 신규 개발 1순위 [사실])가 전제하는 불변 조건을 S3의 lint가 보증한다:
1. `duration_plan` 합계 = `target_duration` ±허용 오차. 실제 클립 길이는 S5의 TTS 실측 길이(나레이션 세그먼트별)에 따라 컴파일러가 조정하되, 조정 기준선이 되는 계획값은 콘티가 소유한다(TTS 연동 규칙 = Danbi 4대 결손 ③ [사실]).
2. 모든 `narration_ref`는 `01-script.md`에 실존하는 세그먼트 ID이고, 전 세그먼트가 최소 1개 컷에 매핑된다(누락·중복 검출).
3. `chapter` 지정 컷의 제목은 마커로 변환 가능해야 한다(빈 문자열 금지) — 마커는 유튜브 챕터에 직결되는 1급 데이터 [사실].
4. `transition`·`subtitle` 값은 S6이 지원하는 프리셋 어휘 내에 있어야 한다(어휘 사전은 S6 문서가 소유, 본 문서는 참조만).
5. 컷 번호는 연속·무결(결번 없음), `cut_count`와 본문 컷 수 일치.

### 3-6. 승인 게이트 (인간)
- P1 통합 빌더에서 인간이 컷 카드(이미지 프롬프트·모션·나레이션·길이)를 컷 단위로 검토·승인한다(`approval: approved/rejected`) [제안 — P1 문서와 인터페이스 공유].
- 전 컷 approved가 되면 인간이 문서 `status: approved`로 전이한다. vault 파일워처가 이를 감지해 S4 잡을 enqueue한다 — "vault 승인→잡 enqueue" 단방향 이벤트 [사실 — 브리프 §2-2].
- **폴백** [제안]: P1 미가동 시 Obsidian에서 frontmatter와 `approval` 필드를 직접 편집하는 것으로 동일 효과를 낸다(계약이 파일 기반이므로 UI는 편의 계층일 뿐).

## 4. 구현 기술 (코드 없이)

| 구성 요소 | 기술/도구 | 연계 지점 |
|---|---|---|
| 콘티 작성 주체 | Claude Code 에이전트(콘티 스킬) | vault를 파일시스템 직접 I/O로 읽고 씀(Obsidian 불필요) [사실 — 지식 DB 보고서 §2-3] |
| 문서 저장/승인 감지 | Obsidian vault + git + 파이프라인 파일워처/폴링 | `status: approved` 감지 → SQLite 잡 enqueue [사실 — 브리프 §2-2] |
| 프롬프트 게이트 | gongnyang-prompt-kit 포크(이미지), vibe-creating-skill 포크(영상) — 모두 MIT [사실] | 스킬 형태로 `E:\clude_program\skills\` 하위에 유지, MIT 반입 절차(source register + NOTICE + 파일 헤더) 준수 [사실 — 브리프 §2-10] |
| 레퍼런스 시트 선렌더링 | S4 경로 재사용: ComfyUI API(`POST /prompt` + WebSocket 진행률) [사실 — 브리프 §2-6] | 결과 경로를 frontmatter `reference_sheets`에 기록, `GenerationJob.id`는 `03-assets.md`의 `comfyui_job_ids`로 추적 |
| 컷 분해 보조 모델 | 로컬 LM Studio(OpenAI 호환, localhost:1234) 또는 Claude — 단계별 모델 선택 원칙 [사실 — 브리프 §2-6] | 프롬프트 변환류 저비용 작업은 로컬 모델로 위임 가능 [제안] |
| lint/검증 | 파이프라인 측 frontmatter·본문 검증기(스키마 검증 개념은 Danbi `project-schema.ts`의 실행 계약 수준 검증과 동일 철학 [사실 — 에디터 분석 §1]) | 검증 실패 시 승인 요청 차단 |
| 승인 UI | P1 통합 빌더(콘티·이미지·영상 한 화면 제어) | 컷 카드 뷰 + approval 토글, 문서 status 전이 버튼 |

## 5. 활용 스킬 (§4 카탈로그)

| 단계 | 스킬 | 용도 |
|---|---|---|
| 컷 분해 설계 | `brainstorming` (superpowers) | 훅 구성·컷 리듬 대안을 발산 후 수렴. 특히 신규 채널 첫 프로덕션에서 |
| 이미지 프롬프트 | `gongnyang-prompt-kit` (포크) | 컷 의도 → 완성 이미지 프롬프트 컴파일(§3-4) |
| I2V 모션 프롬프트 | `vibe-creating-skill` (포크) | 모션 지시 정제·4레이어 검증(§3-4) |
| 자막/타이틀 지정 | `diffusionstudio/lottie` | `subtitle` 필드의 Lottie 오버레이 지정 어휘 근거(실행은 S6) |
| 콘티 스킬 제작(구축기) | `writing-skills`, `writing-plans` (superpowers) | 콘티 작성 절차 자체를 재사용 가능한 스킬 문서로 정착 |
| 완료 검증(구축기) | `verification-before-completion` (superpowers) | 체크리스트 항목의 증거 기반 완료 판정 |

## 6. 구현 단계 체크리스트

> 어떤 에이전트든 아래 순서로 착수 가능하다. 각 항목: **선행 조건 → 작업 → 검증**.

- [ ] **1. vault 스키마 등록**
  - 선행: P3 문서 기준 `DanbiVault/` 골격과 vault `CLAUDE.md` 존재.
  - 작업: vault `CLAUDE.md`에 `type: storyboard` 페이지 유형(§2-2 frontmatter 필드, §2-3 컷 필드 사전, 상태 전이 규칙)을 등재.
  - 검증: 스키마 문서만 읽은 별도 에이전트가 §2 계약과 동일한 필드 목록을 재구성할 수 있는지 대조.
- [ ] **2. 콘티 템플릿 제작**
  - 선행: 항목 1 완료.
  - 작업: `DanbiVault/90-templates/`에 storyboard 템플릿(frontmatter 골격 + 요약 표 + 컷 상세 블록 3개 예시 + 레퍼런스 시트 요구 명세 섹션) 작성.
  - 검증: 템플릿으로 샘플 문서를 생성해 필수 필드 누락 없음을 lint(항목 5)로 확인.
- [ ] **3. 프롬프트 게이트 스킬 포크·한국어화**
  - 선행: 없음(독립 작업). MIT 반입 절차 문서(브리프 §2-10) 숙지.
  - 작업: gongnyang-prompt-kit·vibe-creating-skill을 `E:\clude_program\skills\` 하위로 포크, 대상 모델을 파이프라인 모델(ComfyUI 로컬 + 클라우드 어댑터 슬롯)로 치환, 지시문 한국어화, source register/NOTICE/파일 헤더 기입.
  - 검증: 한국어 컷 의도 5건을 넣어 컴파일본이 생성되고 4레이어(영상)/카테고리(이미지) 검증이 동작하는지 입출력 확인.
- [ ] **4. 콘티 작성 스킬(운영 절차) 문서화**
  - 선행: 항목 1~3 완료.
  - 작업: §3-1~3-4의 절차(읽기 경로, 컷 분해 규칙, 리듬 규칙, 게이트 호출, 실패 처리)를 Claude Code 스킬 문서로 작성해 스킬 카탈로그에 등록.
  - 검증: 스킬만 참조한 에이전트가 샘플 대본으로 draft 콘티를 처음부터 끝까지 생성하는 드라이런.
- [ ] **5. 콘티 lint(검증기) 구축**
  - 선행: 항목 1 완료. Danbi 저장소 접근(구현 위치: 파이프라인 스크립트 계층 — Danbi 코드 수정 시 Serena로 심볼 탐색).
  - 작업: §3-5의 5개 불변 조건 + frontmatter 필수 필드 + `schema_version` 검사를 수행하고 위반 목록을 반환하는 검증 절차를 파이프라인에 추가. 승인 요청 전 필수 통과 관문으로 배선.
  - 검증: 정상 1건·위반 유형별 오류 케이스(합계 초과, 결번, 나레이션 누락, 빈 챕터 제목, cut_count 불일치) 각 1건으로 판정 정확성 확인.
- [ ] **6. 레퍼런스 시트 선렌더링 규약 연결**
  - 선행: S4 문서의 ComfyUI 잡 요청 계약 확정, 항목 2 완료.
  - 작업: 레퍼런스 시트 요구 명세 → S4 선행 잡 요청 → 결과 경로를 frontmatter `reference_sheets`와 컷 `reference`에 기입하는 왕복 절차를 S4 문서와 상호 참조로 고정. 재사용 시트의 `10-knowledge/prompts/` 등재 규칙 포함.
  - 검증: 샘플 명세 1건으로 선행 잡 → 경로 기입까지 왕복 드라이런(생성 자체는 S4 검증 범위).
- [ ] **7. P1 승인 인터페이스 계약 합의**
  - 선행: P1 문서 초안 존재.
  - 작업: 컷 카드에 노출할 필드 목록, `approval` 필드 편집 규칙, 전 컷 승인 시 `status` 전이 버튼, 재승인 흐름(§2-4)을 P1 문서와 양측에 동일하게 명기.
  - 검증: 두 문서의 계약 서술 diff 대조(불일치 0).
- [ ] **8. 파일럿 프로덕션**
  - 선행: 항목 1~7 완료, S2 산출물(승인된 샘플 대본) 1건.
  - 작업: 예시 `production_id`(예: `2026-07-05-heritage-sokguram`)로 전 절차 1회 완주: 컨텍스트 로딩 → 컷 분해 → 게이트 → lint → 승인 요청 상태 도달.
  - 검증: lint 전 항목 pass + S6 컴파일러(또는 그 스텁)가 콘티를 파싱해 오류 없이 컷 목록을 읽어내는 드라이런.

## 7. 완료 조건

### 기계(에이전트) 완료 조건
- vault `CLAUDE.md`에 storyboard 스키마 등재, 템플릿 존재.
- 포크 스킬 2종이 한국어 입력으로 동작하고 라이선스 절차(NOTICE 등) 완료.
- 샘플 콘티 1건이 lint 전 항목을 통과하고 `status: draft`·전 컷 `approval: pending` 상태로 승인 대기에 도달.
- S6 컴파일러(또는 파서 스텁)가 해당 콘티를 무오류 파싱.
- 승인 감지 → S4 enqueue 단방향 이벤트가 모의 승인으로 발화됨을 확인(실제 승인은 아래 항목).

### EXTERNAL_PENDING (인간/외부 — 여기서 멈추고 대기)
- `EXTERNAL_PENDING`: 파일럿 콘티에 대한 **인간의 컷 단위 승인 및 `draft → approved` 전이** (P1 또는 Obsidian 폴백). 에이전트 대행 불가 [사실 — 브리프 §2-5].
- `EXTERNAL_PENDING`: 채널 스타일 가이드의 초기 내용 확정(채널 운영자의 취향·전략 판단 필요).
- `EXTERNAL_PENDING`: 레퍼런스 시트 확정 선택(후보 중 인간 픽).

## 8. 리스크와 완화책

| # | 리스크 | 완화책 |
|---|---|---|
| 1 | 포크 원본 2종의 유지보수 기대 불가(gongnyang 109★·커밋 24, vibe 93★·커밋 20 [사실]) | 처음부터 "포크 후 자체 유지" 전제. 원본 추종 갱신을 계획하지 않고 우리 스킬로 완전 흡수 |
| 2 | `duration_plan`(계획)과 TTS 실측 길이 불일치로 총 길이 이탈 | 계획값은 기준선일 뿐임을 계약에 명시(§3-5-1). S6 컴파일러의 조정 규칙(4대 결손 ③)이 흡수. 콘티 단계에선 나레이션 글자수 기반 추정 계수를 회고로 보정 [제안] |
| 3 | 스타일 드리프트(컷 간 화풍·인물 불일치) | 레퍼런스 시트 선렌더링 필수화(§3-3), 반복 소재 컷의 `reference` 필드 필수, 시트 미확정 시 lint 경고 |
| 4 | frontmatter/컷 필드 스키마 드리프트(필드명 변형) | `schema_version` + lint 필수 통과 + vault `CLAUDE.md` 단일 정의 — 지식 DB 보고서 §5-5의 방어책과 동일 [사실 기반] |
| 5 | 게이트가 한국어 의도 입력에서 품질 저하 | 포크 시 한국어화가 전제 조건(체크리스트 3). 파일럿에서 한국어 입출력 검증을 완료 조건에 포함 |
| 6 | P1 미완성으로 승인 병목 | 파일 기반 폴백(Obsidian 직접 편집, §3-6)으로 P1 없이도 파이프라인 성립. P1은 편의 계층 |
| 7 | 에이전트가 approved 문서를 무단 수정 | 재승인 규칙(§2-4) + git commit 이력으로 롤백 가능 + 소유권 구역 규약(지식 DB 보고서 §4-1 [사실 기반]) |
| 8 | 자료화면 컷의 출처·사용조건 누락(공공누리 3·4유형 상업 금지 [사실 — 브리프 §2-10]) | 자료화면 샷 타입 컷은 `reference`에 출처·누리유형 기입을 lint 필수 항목으로 승격 [제안] |

## 9. 관련 문서

- 마스터 보고서: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)
- 이전 단계(입력 생산자): [./02_SCRIPT_WORKFLOW_KR.md](./02_SCRIPT_WORKFLOW_KR.md) — 나레이션 세그먼트 ID 규약 공유
- 다음 단계(소비자): [./04_IMAGE_GEN_WORKFLOW_KR.md](./04_IMAGE_GEN_WORKFLOW_KR.md) — `image_prompt`/`reference` 소비, 레퍼런스 시트 선행 잡
- 다음 단계(소비자): [./05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md](./05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md) — `motion`/`narration_ref`/`bgm_cue` 소비
- 컴파일러(핵심 소비자): [./06_EDITING_WORKFLOW_KR.md](./06_EDITING_WORKFLOW_KR.md) — §3-5 입력 계약의 상대방
- 승인 UI: [../platform/08_UNIFIED_BUILDER_KR.md](../platform/08_UNIFIED_BUILDER_KR.md) — 컷 단위 승인 인터페이스
- 저장 계층: [../platform/10_KNOWLEDGE_DB_KR.md](../platform/10_KNOWLEDGE_DB_KR.md) — vault 스키마·상태 머신·동기화 이벤트
- 게이트·전이 총괄: [../platform/11_ORCHESTRATION_KR.md](../platform/11_ORCHESTRATION_KR.md)
