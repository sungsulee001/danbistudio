# Danbi Studio 영상 자동화 파이프라인 문서

> 생성: 2026-07-05 · 멀티 에이전트 집중 분석(분석 7 + 작성 12 + 검증)
> 목표: **시나리오 → 대본 → 콘티 → 이미지 → 영상·음성 → 편집 → 업로드** 전 구간 자동화

## 읽는 순서

1. **[PIPELINE_VISUALIZATION_KR.html](PIPELINE_VISUALIZATION_KR.html)** — 브라우저로 열기. 전체 구조를 5분 안에 파악
2. **[ARCHITECTURE_DECISION_KR.html](ARCHITECTURE_DECISION_KR.html)** — 아키텍처 결정 도식화: 올인원(A) vs 엔진 분리(B, 추천 하이브리드)
3. **[00_MASTER_PIPELINE_REPORT_KR.md](00_MASTER_PIPELINE_REPORT_KR.md)** — 총괄 보고서(진단·아키텍처·로드맵·헤르메스 판단)
4. 구현할 단계의 stages/ 문서 → 관련 platform/ 문서 순

## 문서 맵

### 단계 워크플로우 (stages/)

| 문서 | 내용 | 신규 개발 |
|---|---|---|
| [01 시나리오](stages/01_SCENARIO_WORKFLOW_KR.md) | 채널 노트·회고 환류 → 리서치 → 소재 스코어링 → 시나리오 초안 | danbi-scenario 스킬 |
| [02 대본](stages/02_SCRIPT_WORKFLOW_KR.md) | 장면 블록 대본(N01 나레이션 ID), TTS 친화 글쓰기, 길이 검증 | danbi-script 스킬 |
| [03 콘티](stages/03_STORYBOARD_WORKFLOW_KR.md) | 컷 스키마(CUT-01), 레퍼런스 시트 일관성, 프롬프트 게이트 | danbi-storyboard 스킬 |
| [04 이미지 생성](stages/04_IMAGE_GEN_WORKFLOW_KR.md) | 로컬(ComfyUI)/클라우드 어댑터, 기존 comfyui-jobs 큐 재사용 | 슬롯 라우터 |
| [05 영상·음성·BGM](stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md) | WAN I2V(결손②)·CosyVoice TTS(결손③)·SenseVoice 정렬·ACE-Step | I2V 워크플로우 + TTS 러너 |
| [06 편집·렌더](stages/06_EDITING_WORKFLOW_KR.md) | **콘티→EditorProject 컴파일러(결손① — 1순위)**, headless 렌더 | 컴파일러 |
| [07 업로드·회고](stages/07_UPLOAD_WORKFLOW_KR.md) | YouTube→TikTok 초안→IG 단계적 출시, 회고 환류(결손④) | danbi-uploader |

### 플랫폼 설계 (platform/)

| 문서 | 내용 |
|---|---|
| [08 통합 빌더](platform/08_UNIFIED_BUILDER_KR.md) | 콘티·이미지·영상 **한 화면 제어** — Danbi 내 /builder 페이지, 컷 카드 상태 머신, 승인 UI |
| [09 ComfyUI 대시보드](platform/09_COMFYUI_DASHBOARD_KR.md) | readiness 진단·WS 진행률·큐 보드·갤러리 — 기존 API 위 프론트엔드 통합 |
| [10 지식 DB](platform/10_KNOWLEDGE_DB_KR.md) | **카파시 LLM Wiki × Obsidian** — vault 스키마·에이전트 규약·SQLite 역할 분담 |
| [11 오케스트레이션](platform/11_ORCHESTRATION_KR.md) | status 상태 머신 게이트·단계 연결·**헤르메스 판단(지금 불필요, 무인화 시 재검토)** |
| [12 UX 컨트롤 센터](platform/12_UX_CONTROL_CENTER_KR.md) | **"한 곳 제어" 화면 구조(IA)** — /production 워크스페이스 6탭, 화면별 데이터 매핑, 게이트 인터랙션. 와이어프레임: [UX_CONTROL_CENTER_WIREFRAME_KR.html](UX_CONTROL_CENTER_WIREFRAME_KR.html) |
| [13 인프라 토폴로지](platform/13_INFRA_TOPOLOGY_KR.md) | **3대 구성(v2)** — 메인컴(컴퓨트+30TB 아카이브 1차)·서브컴(30TB 미러+렌더 플릿)·미니PC(상시 두뇌, 미디어 비접촉), "이동 금지·복사만" 원칙, Tailscale·WoL |

### 부록 (appendix/)

| 문서 | 내용 |
|---|---|
| [DECISION_LOG_KR.md](appendix/DECISION_LOG_KR.md) | **결정 기록** — D1 아키텍처(B안 하이브리드) · D2 컨트롤 센터 · D3 인프라 · D4 첫 채널(역사 드라마) |
| [SKILLS_MATRIX_KR.md](appendix/SKILLS_MATRIX_KR.md) | 스킬 활용 매트릭스 — 개발용(A) vs 런타임용(B), 도입 절차, 신규 스킬 5종 |
| [RESEARCH_AI_TOOLS_KR.md](appendix/RESEARCH_AI_TOOLS_KR.md) | AI 도구 리서치(ACE-Step·CosyVoice·나노바나나2·업로드 API 등) |
| [RESEARCH_REFERENCE_REPOS_KR.md](appendix/RESEARCH_REFERENCE_REPOS_KR.md) | 참고 저장소 16종 평가(라이선스·채택 판정) |
| [RESEARCH_KNOWLEDGE_DB_KR.md](appendix/RESEARCH_KNOWLEDGE_DB_KR.md) | 카파시 위키·Obsidian 리서치 원본 |
| [analysis/](appendix/analysis/) | 프로젝트 분석 원본 4종(비전·에디터·자동화·아키텍처) |

## 전 문서 공통 핵심 규약

- **production_id**: `YYYY-MM-DD-topic-slug` — vault와 SQLite의 조인 키
- **상태 머신**: `draft → approved → generated → edited → published` (+`archived`). **draft→approved는 인간만 전이**
- **승인 게이트 4개**: 시나리오 승인 · 콘티 승인(빌더) · 편집본 검수(Danbi UI) · 게시 승인(초기)
- **완료 조건 분리**: 기계(에이전트) 완료조건 vs 외부 의존(`EXTERNAL_PENDING` — 플랫폼 심사, 인간 QA)
- **동기화**: vault↔SQLite는 단방향 이벤트 2개만(잡 완료→vault append / 승인→잡 enqueue)
- **라이선스**: AGPL/GPL 코드 편입 금지, MIT 반입 시 register+NOTICE, 미디어 출처 기록

## 사용자 확인 필요 사항 (작성 중 발견된 미결)

- [ ] **"오픈이미지2" 실체 확인** — GPT Image 2가 유력 후보(2026-04 공개, 한글 텍스트 강점). 어느 모델인지 확정 필요
- [x] ~~첫 채널 확정~~ → **확정: 퍼블릭 도메인 역사 자료 기반 5~10분 단편 드라마(팟캐스트+드라마)** — 계약 조정 사항은 [결정 기록 D4](appendix/DECISION_LOG_KR.md) 참조. 번역본 저작권 주의
- [ ] WAN 2.1 변형(14B 원본 vs 양자화판)과 쇼츠 표준 해상도/fps — 3090 실측 후 확정
- [ ] Fun-CosyVoice 3.0 가중치의 상업 이용 조건 — HF 모델 카드 최종 확인
- [ ] 음성 클로닝에 쓸 목소리(본인 목소리 권장)와 동의 기록 방식
- [ ] 콘티→프로젝트 컴파일러 저장 위치 — Danbi 저장소 내 도구 영역(제안) vs 별도 저장소
- [ ] 업로더 모듈 위치 — `E:\ai_tool\danbi-uploader\` 독립 폴더(제안)
- [ ] insane-search 라이선스 확인(미확인 시 내장 WebSearch로 대체하는 분기 있음)
