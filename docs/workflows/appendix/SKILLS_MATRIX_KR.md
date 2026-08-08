# 부록 — 스킬 활용 매트릭스 (Danbi Studio 영상 자동화 파이프라인)

> 파이프라인의 모든 단계(S1~S7)와 플랫폼 과제(P1~P4)에서 "어떤 스킬을, 언제, 왜" 쓰는지를 한 장으로 확정하는 부록.
> 스킬 이름은 공용 브리프 §4 카탈로그의 명칭만 사용한다. 다른 문서는 이 매트릭스를 참조하고 재정의하지 않는다.

---

## 1. 목적과 범위

- **목적**: 파이프라인 관련 스킬을 단일 인벤토리로 관리하고, ① 파이프라인을 *개발할 때* 쓰는 스킬과 ② 파이프라인 *런타임에 콘텐츠 생산이* 쓰는 스킬을 축으로 구분하여 단계별 사용 시점을 확정한다.
- **범위**: 스킬의 분류·설치 위치·도입 절차·신규 제작 목록·라이선스 기록 관행. 각 스킬의 *내부 동작 상세*는 범위 밖(각 단계 문서와 스킬 자체의 SKILL.md가 담당).
- **핵심 구분 축(확정)**:
  - **축 A — 개발 스킬**: Danbi Studio 코드·파이프라인 스킬을 만들고 고칠 때 사용. 콘텐츠 산출물에는 등장하지 않는다. (예: `frontend-design`, `mcp-builder`, `writing-plans`, Serena)
  - **축 B — 런타임 스킬**: 프로덕션 1편을 생산하는 동안 오케스트레이터(Claude Code)가 호출. 산출물(프롬프트·에셋·문서)에 직접 기여한다. (예: `gongnyang-prompt-kit`, `vibe-creating-skill`, `insane-search`, `diffusionstudio/lottie`)
  - [사실] 이 구분은 근거 보고서의 평가와 일치한다 — superpowers는 "파이프라인 런타임 구성요소가 아니라 파이프라인을 개발하는 방법론"(research_github-refs §1).

## 2. 입력/출력 계약

- **이 문서가 규정하는 계약**:
  - 스킬의 정식 명칭과 축(A/B) 분류 — 전 문서 공통 참조 기준.
  - 설치 위치 경로 — 오케스트레이터가 SKILL.md를 찾는 물리 경로.
  - 도입 상태 필드: `설치됨 → 포크예정 → 현지화중 → 등록완료` / 신규 제작은 `미제작 → 초안 → 검증완료`.
- **스킬 인벤토리 (설치 위치·라이선스·상태)**:

| 스킬 | 축 | 설치 위치 | 라이선스 | 상태 |
|---|---|---|---|---|
| `docx` `pptx` `xlsx` `pdf` | B(부산물 산출) | `E:\clude_program\skills\skills-main\skills\<이름>\` | 공식 배포 | 설치됨 [사실] |
| `frontend-design` `canvas-design` `theme-factory` `web-artifacts-builder` `webapp-testing` `mcp-builder` `skill-creator` `brand-guidelines` `doc-coauthoring` | A (`brand-guidelines`·`doc-coauthoring`은 B 겸용) | `E:\clude_program\skills\skills-main\skills\<이름>\` | 공식 배포 | 설치됨 [사실] |
| `feature-planner` | A | `E:\clude_program\skills\코드팩트로만능스킬\` | — | 설치됨 [사실] |
| superpowers 계열(`brainstorming` `writing-plans` `executing-plans` `test-driven-development` `subagent-driven-development` `systematic-debugging` `writing-skills` `verification-before-completion`) | A | Claude Code 플러그인(현 환경 설치 확인) | MIT | 설치됨 [사실] |
| `vibe-creating-skill` | B | [제안] `E:\clude_program\skills\danbi-adopted\vibe-creating-skill\` | MIT [사실] | 포크예정 |
| `gongnyang-prompt-kit` | B | [제안] `E:\clude_program\skills\danbi-adopted\gongnyang-prompt-kit\` | MIT [사실] | 포크예정 |
| `diffusionstudio/lottie` | B | [제안] `E:\clude_program\skills\danbi-adopted\lottie\` (npx 설치본 대신 포크 사본으로 고정) | MIT [사실] | 포크예정 |
| `insane-search` | B | [제안] `E:\clude_program\skills\danbi-adopted\insane-search\` | **확인 필요** | 라이선스 검증 대기 |
| `danbi-scenario` `danbi-script` `danbi-storyboard` `danbi-produce` `danbi-upload` | B | [제안] `E:\clude_program\skills\danbi-pipeline\<이름>\` | 자체 제작 | 미제작 |
| Serena, `WebSearch`/`WebFetch`, Workflow/Agent 병렬 오케스트레이션 | A(Serena) / B(검색·병렬) | Claude Code 내장(MCP/도구) | — | 사용 가능 [사실] |

- **라이선스 기록 산출물**: [제안] `E:\clude_program\skills\SOURCE_REGISTER.md` — 외부 반입 스킬마다 원 저장소 URL, 커밋 해시, 라이선스, 반입일, 수정 요약을 1행씩 기록(브리프 §2-10의 source register 관행을 스킬 폴더에도 동일 적용). 각 포크 폴더에는 원본 LICENSE 파일과 NOTICE(수정 사실 고지)를 동봉.

## 3. 워크플로우

### 3-1. 외부 스킬 도입 절차 (4종: vibe / gongnyang / lottie / insane-search)

1. **라이선스 확인** — GitHub 저장소에서 LICENSE 직접 확인. MIT 확인된 3종은 통과 [사실]. `insane-search`는 라이선스 미확인이므로 확인 전 반입 금지 [제안].
2. **포크·고정** — 원 저장소를 포크하거나 특정 커밋의 스냅숏을 받아 `danbi-adopted\` 아래 배치. 업스트림 자동 추종 금지(프롬프트 변경이 산출물 품질을 흔들 수 있으므로 버전 고정).
3. **한국어화·모델 치환** — SKILL.md와 프롬프트 템플릿을 한국어 콘텐츠 기준으로 손질. 대상 모델 참조를 우리 파이프라인 모델로 치환: 이미지는 ComfyUI 로컬 + Nano Banana 2/GPT Image 2 어댑터, 영상은 WAN 2.1 I2V(브리프 §2-6). `gongnyang-prompt-kit`의 GPT Image-2 지시부, `vibe-creating-skill`의 Seedance/Kling 지시부가 치환 지점 [사실: 원본 대상 모델은 근거 보고서 §6·§10].
4. **등록** — `SOURCE_REGISTER.md`에 기록, NOTICE 동봉, 상태를 `등록완료`로 갱신.
5. **승인 게이트**: 반입·치환 결과는 인간이 검토 후 승인해야 런타임 매트릭스에 편입된다. 에이전트가 임의로 새 외부 스킬을 파이프라인에 추가하지 않는다(상태 머신의 `draft→approved` 게이트와 동일 철학).

### 3-2. 신규 스킬 제작 절차 (danbi-* 5종)

1. `brainstorming`으로 해당 단계 문서(관련 stages 문서)의 요구를 스킬 요건으로 압축.
2. `skill-creator` + `writing-skills`로 SKILL.md 초안 작성(트리거 조건, 입출력 계약, vault 경로 규약 포함).
3. 파일럿 프로덕션 1편에 적용해 검증 → `verification-before-completion` 기준으로 통과 시 `검증완료`.
4. 스킬 간 의존은 `danbi-produce`(오케스트레이션)만이 다른 danbi-* 스킬을 호출하는 단방향으로 제한 [제안].

### 3-3. 런타임에서의 스킬 호출 흐름 (요약)

- 사람이 Claude Code에서 `danbi-produce`를 기동 → 단계별로 `danbi-scenario`→`danbi-script`→`danbi-storyboard`를 순차 호출하며, 각 단계 산출물은 vault(`20-productions/<production_id>/`)에 기록되고 인간 승인 게이트에서 정지한다(브리프 §2-5).
- 프롬프트 품질 게이트: S3~S4에서 `gongnyang-prompt-kit`, S3·S5에서 `vibe-creating-skill`이 프롬프트를 컴파일·검증한 뒤에야 Danbi 잡 큐로 enqueue된다.
- Danbi Studio 자체는 스킬을 모른다 — 스킬은 전부 오케스트레이터(Claude Code) 측 자산이고, Danbi에는 API/CLI/잡 계약으로만 도달한다(브리프 §2-1).

## 4. 구현 기술 (코드 없이)

- **스킬 로딩**: Claude Code의 Skill 도구/SKILL.md 참조 방식. 스킬 = 마크다운 지시문 + (필요 시) 보조 리소스 파일. 설치 위치는 §2 인벤토리 경로가 유일 기준.
- **Danbi 연계 지점**: 스킬이 Danbi를 조작할 때는 `/api/editor/*`(`DANBI_EDITOR_API_TOKEN` 게이트)와 잡 큐 계약만 사용. ComfyUI 직접 호출은 `POST /prompt` + WebSocket 진행률(브리프 §2-6). 스킬 문서에는 이 계약의 이름만 적고 구현은 Danbi 문서가 담당.
- **개발 작업 시 코드 탐색**: Danbi 코드 수정이 필요한 모든 작업(컴파일러, 대시보드, 빌더)은 Serena 심볼 탐색을 우선 사용(사용자 전역 규칙과 일치).
- **모션그래픽 스택 정합성**: [사실] `diffusionstudio/lottie` 산출물은 lottie-web으로 재생 가능 → Electron+Next.js인 Danbi 스택과 호환(근거 보고서 §13). 편집 단계에서 자막·타이틀 오버레이로 타임라인에 얹는다.

## 5. 활용 스킬 — 단계 × 스킬 매트릭스

### 5-1. 매트릭스 본체

| 단계 | 런타임 스킬(축 B) — 무엇을/왜 | 개발 스킬(축 A) — 무엇을/왜 | 시점 |
|---|---|---|---|
| S1 시나리오 | `insane-search`(네이버·유튜브 자막 기반 소재 리서치), `WebSearch`/`WebFetch`(일반 리서치), `danbi-scenario`(시나리오 초안 생성·vault 기록), [제안] `brainstorming`(소재 발산 시 겸용) | `writing-skills`(danbi-scenario 제작), `feature-planner`(단계 기능 기획) | 매 프로덕션 시작 시 |
| S2 대본 | `danbi-script`(승인된 시나리오→나레이션+장면 텍스트), [제안] `doc-coauthoring`(인간 공동 퇴고 시) | `writing-skills` | 시나리오 승인 직후 |
| S3 콘티 | `danbi-storyboard`(컷 목록+프롬프트+오디오 지시 생성), `gongnyang-prompt-kit`(컷별 이미지 프롬프트 컴파일), `vibe-creating-skill`(컷별 영상 프롬프트 정제), [제안] `brand-guidelines`(채널 톤·스타일 일관성 점검) | `writing-skills` | 대본 승인 직후, 프롬프트는 콘티 작성 시점에 함께 |
| S4 이미지 생성 | `gongnyang-prompt-kit`(enqueue 전 프롬프트 최종 검증 게이트), Workflow/Agent 병렬 오케스트레이션(컷 다건 병렬 생성 감시) | `test-driven-development`·`systematic-debugging`(생성 자동화 스크립트 개발·수리) | 콘티 승인 직후, 잡 enqueue 직전 |
| S5 영상·음성·BGM | `vibe-creating-skill`(I2V 프롬프트 품질 게이트 — WAN 2.1 등) | `mcp-builder`(TTS/ComfyUI 래퍼를 MCP로 노출할 경우), `systematic-debugging`(VRAM 경합·큐 직렬화 이슈) | 이미지 확보 직후 |
| S6 편집·렌더 | `diffusionstudio/lottie`(자막 강조·타이틀 카드·트랜지션 모션그래픽 생성→타임라인 오버레이) | `feature-planner`+`writing-plans`(콘티→EditorProject 컴파일러 설계), `test-driven-development`(컴파일러 구현), Serena(Danbi 코드 수정), `webapp-testing`(에디터 UI 검증) | 에셋 완비 후, 렌더 전 |
| S7 업로드·회고 | `danbi-upload`(메타데이터 조립·업로드 계약 호출), `docx`/`pdf`(회고·채널 리포트 산출), `xlsx`(성과 지표 시트) | `writing-plans`·`test-driven-development`(업로드 모듈 — Danbi 밖 별도 프로세스 — 개발) | 렌더 완료 후 / 게시 후 회고 |
| P1 통합 빌더 | (런타임 스킬 없음 — 빌더 자체가 UI) | `frontend-design`(화면 설계·구현 품질), `theme-factory`(테마), `web-artifacts-builder`(프로토타입), `webapp-testing`(E2E 검증), Serena, `feature-planner` | 빌더 개발 기간 |
| P2 ComfyUI 대시보드 | (없음) | `frontend-design`(git-scm 설치 페이지보다 심플한 UI 요구), `theme-factory`, `webapp-testing`, Serena | 대시보드 개발 기간 |
| P3 지식 DB | `docx`/`xlsx`(vault 데이터 기반 채널 리포트 export) | `writing-plans`(vault 스키마·동기화 이벤트 설계), [제안] `doc-coauthoring`(vault `CLAUDE.md` 스키마 문서 작성) | vault 구축 시 / 리포트는 주기 산출 |
| P4 오케스트레이션 | `danbi-produce`(단계 연결·승인 게이트 관리), Workflow/Agent 병렬 오케스트레이션 | `skill-creator`+`writing-skills`(danbi-* 5종 제작), `subagent-driven-development`·`executing-plans`(구현 실행), `verification-before-completion`(완료 판정 규율) | 스킬 제작 기간 / 런타임 상시 |

- **전 단계 공통(축 A)**: `brainstorming`(설계 착수 전), `writing-plans`→`executing-plans`(계획 수립·실행), `verification-before-completion`(모든 "완료" 주장 전), `systematic-debugging`(모든 버그).
- [사실] 단계 매핑의 골격은 근거 보고서 "종합: 파이프라인 단계별 매핑"과 일치하며, danbi-* 스킬과 시점 열은 본 문서의 [제안]이다.

### 5-2. 신규 제작 스킬 5종 [제안]

모두 `skill-creator`+`writing-skills`로 제작, 위치는 `E:\clude_program\skills\danbi-pipeline\`:

| 스킬 | 한 줄 정의 |
|---|---|
| `danbi-scenario` | 채널 전략·소재(vault `10-knowledge/`)를 입력으로 `00-scenario.md`(status: draft)를 생성하는 S1 스킬 |
| `danbi-script` | 승인된 시나리오를 나레이션+장면 텍스트(`01-script.md`)로 전개하는 S2 스킬 |
| `danbi-storyboard` | 대본을 컷 목록+컷별 이미지/영상 프롬프트+오디오 지시(`02-storyboard.md`)로 변환하는 S3 스킬 — gongnyang/vibe 스킬을 내부 게이트로 호출 |
| `danbi-produce` | S1→S7 전 단계를 잇는 오케스트레이션 스킬 — 상태 머신 준수, 승인 게이트에서 반드시 정지, Danbi 잡 큐·vault 동기화 이벤트 2종만 사용 |
| `danbi-upload` | 최종 MP4+메타를 플랫폼 계약(1차 YouTube Data API v3)에 전달하고 `04-publish.md`와 회고 노트를 기록하는 S7 스킬 |

### 5-3. 문서/보고 산출 스킬의 사용 지점

- `xlsx`: S7 게시 후 채널 성과 지표 시트(조회수·클릭률 등 수집치 정리), P3 vault 데이터의 표 형식 export.
- `docx`/`pdf`: 프로덕션 회고 리포트, 월간 채널 운영 보고서(vault `retrospectives/` 내용을 문서화해 외부 공유용으로).
- `pptx`: [제안] 채널 전략 리뷰·투자/협업 제안용 발표자료가 필요할 때만 — 파이프라인 정규 산출물은 아님.
- 원칙: 이 4종은 **부산물(보고물) 전용**이며 파이프라인 본선(에셋·영상)에는 관여하지 않는다.

## 6. 구현 단계 체크리스트

### Phase 1 — 인벤토리·레지스터 구축
- **선행 조건**: 없음(문서 작업만).
- **작업 항목**: ① `E:\clude_program\skills\SOURCE_REGISTER.md` 생성(§2 기록 양식). ② `danbi-adopted\`, `danbi-pipeline\` 폴더 생성. ③ §2 인벤토리 표를 레지스터 초기 내용으로 옮겨 적기.
- **검증 방법**: 레지스터에 공식 스킬 경로 2곳(`skills-main`, `코드팩트로만능스킬`)이 실존 경로로 확인되고, 신규 폴더 2개가 생성되어 있다.

### Phase 2 — 외부 스킬 4종 포크·현지화
- **선행 조건**: Phase 1 완료. `insane-search`는 라이선스 확인 완료가 추가 선행 조건.
- **작업 항목**: ① §3-1 절차대로 `vibe-creating-skill`·`gongnyang-prompt-kit`·`lottie` 3종을 커밋 고정 반입. ② 한국어화 + 모델 참조 치환(gongnyang→ComfyUI/어댑터 모델, vibe→WAN 2.1 계열). ③ 각 폴더에 LICENSE·NOTICE 동봉, 레지스터 기록. ④ `insane-search`는 라이선스 확인 결과에 따라 반입 또는 대체(내장 `WebSearch`/`WebFetch`로 대체) 결정.
- **검증 방법**: 각 스킬을 단독 호출해 샘플 입력 1건(임의 컷 설명)으로 산출 프롬프트가 한국어 파이프라인 모델 기준으로 나오는지 확인. 레지스터에 4행(또는 3행+대체 기록)이 존재.

### Phase 3 — danbi-* 신규 스킬 5종 제작
- **선행 조건**: Phase 2 완료(스토리보드 스킬이 gongnyang/vibe를 게이트로 호출하므로). vault 구조가 [P3 문서](../platform/10_KNOWLEDGE_DB_KR.md) 기준으로 생성되어 있을 것.
- **작업 항목**: ① §3-2 절차로 `danbi-scenario`→`danbi-script`→`danbi-storyboard`→`danbi-upload`→`danbi-produce` 순서로 제작(오케스트레이션은 피호출 스킬이 갖춰진 뒤 마지막). ② 각 SKILL.md에 입출력 vault 경로, frontmatter `status` 전이 규칙, 승인 게이트 정지 규칙을 명기. ③ `danbi-produce`에는 "게이트를 스스로 넘지 않는다"를 불변 조건으로 명시.
- **검증 방법**: 각 스킬 단독 실행으로 대상 vault 파일이 규약 위치·규약 frontmatter로 생성되는지 확인. `danbi-produce` 드라이런에서 `draft` 상태 문서 앞에서 정지하고 인간 승인을 요구하는지 확인.

### Phase 4 — 파일럿 프로덕션으로 매트릭스 검증
- **선행 조건**: Phase 3 완료. Danbi 4대 결손 중 최소 ①(콘티→EditorProject 컴파일러)이 사용 가능 상태(→ [S6 문서](../stages/06_EDITING_WORKFLOW_KR.md)).
- **작업 항목**: ① 실제 소재 1건(예: 문화유산 주제)으로 S1→S7 1회전. ② 각 단계에서 매트릭스가 지정한 스킬이 실제로 호출됐는지 로그(vault `log.md`)로 대조. ③ 불일치·불필요 스킬을 매트릭스에 반영해 본 문서 갱신.
- **검증 방법**: 파일럿 1편의 `20-productions/<production_id>/` 폴더에 5개 규약 파일이 모두 존재하고, 본 문서 §5-1 표와 실제 호출 이력의 차이가 문서에 반영되어 있다.

## 7. 완료 조건

**기계(에이전트) 완료 조건**
- [ ] `SOURCE_REGISTER.md`가 존재하고 반입 스킬 전 건이 기록되어 있다.
- [ ] MIT 3종(vibe/gongnyang/lottie)이 `danbi-adopted\`에 커밋 고정·현지화·NOTICE 동봉 상태로 배치되어 있다.
- [ ] danbi-* 5종이 `danbi-pipeline\`에 존재하고 단독 실행 검증을 통과했다.
- [ ] `danbi-produce` 드라이런이 승인 게이트에서 정지함을 확인했다.
- [ ] 파일럿 1회전 후 매트릭스 표가 실제 호출 이력과 일치하도록 갱신되었다.

**EXTERNAL_PENDING (외부/인간 의존 — 여기서 멈춘다)**
- [ ] EXTERNAL_PENDING: `insane-search` 라이선스 확인 및 반입 승인(인간 판단).
- [ ] EXTERNAL_PENDING: 외부 스킬 현지화 결과물의 인간 검토·승인(§3-1 게이트).
- [ ] EXTERNAL_PENDING: 파일럿 프로덕션의 각 단계 인간 승인(`draft→approved`).

## 8. 리스크와 완화책

| 리스크 | 내용 | 완화책 |
|---|---|---|
| 업스트림 표류 | 외부 스킬 원본이 프롬프트를 바꾸면 산출 품질이 흔들림 | 커밋 고정 반입, 자동 추종 금지, 업데이트는 수동 diff 검토 후 반영 [제안] |
| 소규모 저장소 소멸 | [사실] vibe(93★)·gongnyang(109★)은 소규모라 유지보수 기대 불가(근거 보고서 §6·§10) | 포크 사본을 원본으로 삼아 자체 유지 — "채택(포크 후 자체 유지)" 권고 준수 |
| 라이선스 누락 | 반입 절차 생략 시 라이선스 추적 불가 | `SOURCE_REGISTER.md` 기록을 반입의 필수 관문으로 규정, 미기록 스킬은 매트릭스 편입 금지 |
| 스킬 난립 | 단계마다 스킬이 늘어나 관리 불능 | 신규 편입은 본 문서 갱신 + 인간 승인을 통해서만, danbi-produce만이 단계 스킬을 호출하는 단방향 의존 유지 |
| 축 혼동 | 개발 스킬(A)이 런타임 산출물에 개입해 재현성 훼손 | 매트릭스의 축 표기를 SKILL.md 트리거 조건에 반영(런타임 스킬만 danbi-produce가 호출 가능) [제안] |
| GPL/AGPL 오염 | OpenMontage·palmier-pro의 코드가 스킬 리소스로 유입 | [사실] 코드 편입 금지(브리프 §2-10) — 스킬에는 아키텍처·프롬프트 구조의 재구현만 허용 |

## 9. 관련 문서

- 마스터 보고서: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)
- 단계 문서: [S1 시나리오](../stages/01_SCENARIO_WORKFLOW_KR.md) · [S2 대본](../stages/02_SCRIPT_WORKFLOW_KR.md) · [S3 콘티](../stages/03_STORYBOARD_WORKFLOW_KR.md) · [S4 이미지](../stages/04_IMAGE_GEN_WORKFLOW_KR.md) · [S5 영상·음성](../stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md) · [S6 편집](../stages/06_EDITING_WORKFLOW_KR.md) · [S7 업로드](../stages/07_UPLOAD_WORKFLOW_KR.md)
- 플랫폼 문서: [P1 통합 빌더](../platform/08_UNIFIED_BUILDER_KR.md) · [P2 ComfyUI 대시보드](../platform/09_COMFYUI_DASHBOARD_KR.md) · [P3 지식 DB](../platform/10_KNOWLEDGE_DB_KR.md) · [P4 오케스트레이션](../platform/11_ORCHESTRATION_KR.md)
