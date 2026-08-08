> 본 문서는 2026-07-05 파이프라인 집중 분석 세션의 서브에이전트 산출물 원본이다.
> 실행용 워크플로우 문서는 [../../README.md](../../README.md) 참고.

# Danbi Studio 프로젝트 비전/계획/로드맵 분석 보고서

**분석 대상 파일** (모두 실제 읽음):
- `E:/ai_tool/Danbi_Studio/DANBI_STUDIO_PLAN.md` (초기 개발 계획)
- `E:/ai_tool/Danbi_Studio/DANBI_STUDIO_FEATURE_PLAN.md` (TDD 기반 5단계 실행 계획, MVP 완료 기록)
- `E:/ai_tool/Danbi_Studio/README.md` (현재 기능 전체 목록, API, 환경변수, 테스트)
- `E:/ai_tool/Danbi_Studio/SKILL.md` (feature-planner 스킬 — 제품 문서가 아니라 계획 수립 방법론 문서)
- `E:/ai_tool/Danbi_Studio/UI_UX_SPEC.md` (초기 웹 UI 디자인 스펙)
- `E:/ai_tool/Danbi_Studio/PHASE1_SETUP_GUIDE.md` (StabilityMatrix/ComfyUI 설치 가이드)
- `E:/ai_tool/Danbi_Studio/docs/EXTENSION_ROADMAP_KR.md` (확장 로드맵, 최신 구현 노트 포함)
- `E:/ai_tool/Danbi_Studio/plan-template.md` (계획 문서 템플릿)

---

## 1. 프로젝트 정체성과 최종 비전

### 사실 (문서 근거)

**출발점**: DanbiStudio는 "로컬 GPU 기반 AI 모델 통합 웹 플랫폼"으로 시작했다 (`DANBI_STUDIO_PLAN.md`). 목표는 Kling AI / Pika Labs 같은 사용자 친화 UI를 **로컬**에서 제공하고, 동시에 **n8n / Make / Opal 같은 자동화 도구의 백엔드 엔진** 역할을 하는 것이다.

**하드웨어/스택 전제**:
- Windows 11 + RTX 3090 (24GB VRAM) + RAM 128GB
- 백엔드: StabilityMatrix로 관리되는 ComfyUI (localhost:8188), WAN 2.1 I2V 모델(~14GB)
- 프론트: Next.js(초기 14, 현재 README 기준 Next 16 Webpack 빌드) + TypeScript + Tailwind
- DB: SQLite + Prisma
- 데스크톱: Electron 셸 (`npm run electron:dev`, 패키징된 `Danbi Studio.exe`, typed preload IPC)

**진화 과정**: 2025-12-29에 "생성 웹 UI + 자동화 REST API" MVP가 완료되었고(`DANBI_STUDIO_FEATURE_PLAN.md`, "MVP COMPLETE - PRODUCTION READY"), 이후 프로젝트는 **AI-네이티브 멀티트랙 영상 편집기**(`/editor`)로 대폭 확장되었다. 현재 README의 대부분은 편집기 기능 설명이며, 테스트 414개 통과, FFmpeg 렌더 스모크, Playwright E2E, 패키징 GUI 스모크까지 갖춘 상태다.

**경쟁 포지셔닝** (`EXTENSION_ROADMAP_KR.md`):
- CapCut 대비: 로컬 모델, 무제한 자동화, 워터마크 없는 개인 파이프라인
- Shotcut 대비: AI 생성/보정/자막 자동화, 현대적 타임라인 UI
- Filmora 대비: 템플릿 의존이 아닌 workflow 기반 커스터마이징

**명시된 성공 기준** (로드맵 문서):
1. 10분짜리 영상을 import해서 컷 편집, 자막, B-roll 생성, export까지 **한 화면에서 완료**
2. 선택한 클립 10개를 ComfyUI batch로 보내고 결과를 asset/timeline에 자동 반영
3. **같은 project JSON을 UI, renderer, automation API가 모두 해석** (단일 계약)

### 해석 (추측)
프로젝트의 최종 비전은 "개인 크리에이터의 로컬 제작 파이프라인"이다. 로드맵 Phase 5 제목이 "작업/배포 — 개인 도구에서 제작 파이프라인으로 확장"인 점, 자동화 API·헤드리스 렌더·웹훅이 모두 갖춰진 점에서, 사용자가 목표하는 "시나리오→업로드" 전체 자동화 파이프라인의 **편집·생성·렌더 구간 엔진**으로 설계되어 왔다고 판단된다.

---

## 2. 계획된 기능 목록과 우선순위

### 초기 계획 (DANBI_STUDIO_PLAN.md / FEATURE_PLAN.md) — 사실
- **Must Have (MVP, 완료)**: ComfyUI 연동, WAN I2V 워크플로우, 생성/조회 웹 UI, 잡 큐, 실시간 진행률(폴링)
- **Should Have (V1.0, 완료)**: 다중 워크플로우, 파라미터 프리셋, 라이브러리, 에러 처리
- **Nice to Have (V2.0)**: 모델 자동 다운로드, 비주얼 워크플로우 에디터, 배치 처리, 외부 API — 이 중 배치 처리·외부 API는 이후 편집기 확장에서 사실상 구현됨
- **자동화 API 스펙**: `POST /api/automation/generate`(webhook_url 옵션), `GET /api/automation/status/:job_id`, webhook 알림 — n8n/Make/Opal 연동 전제

### 현재 구현 완료된 주요 기능군 (README 기준) — 사실
- **편집기 코어**: 멀티트랙 타임라인, linked V/A, ripple/slip/roll/slide, 3-point edit, 마커/캡션, undo/redo, 커맨드 팔레트, 그룹, In/Out 범위 편집
- **렌더**: FFmpeg 렌더 플랜/큐/재시도/진단, HW 인코더 자동 감지(NVENC 등), H.264/H.265/ProRes/AV1 프로파일, 숏폼 export 프로파일, 배치 export, 헤드리스 렌더 CLI, 렌더 워커 데몬/플릿(HTTP+SSE+WebSocket, Pair token, LAN discovery)
- **AI 자동화**: ComfyUI batch queue(기본 dry-run), 워크플로우 프리셋 레지스트리, clip-to-workflow 바인딩, AI B-roll gap fill, AI morph 트랜지션, 결과 side-by-side 리뷰 후 undo 가능한 교체, AI model-pass 이펙트
- **자막/음성**: 로컬 STT(Whisper 호환) 큐, word-level timing, speaker diarization, SRT/WebVTT 사이드카/번인, 보이스오버 마이크 녹음
- **자동화 훅**: `manual / on-import / before-export / on-gap` 이벤트 훅, 로컬 액션 적용, ComfyUI 잡 큐잉, allowlist 기반 웹훅 실행
- **인터체인지**: EDL, FCPXML, 마커 CSV/**유튜브 챕터 텍스트** export/import
- **플러그인**: manifest/권한 모델, 샌드박스 reviewed command, RSA 서명/키 로테이션/custody 감사

### 남은 우선순위 (EXTENSION_ROADMAP_KR.md "다음 구현 우선순위") — 사실
1. WebCodecs preview worker의 코덱/컨테이너 커버리지 확장
2. 번들형/온디바이스 CV 트래커 통합 (현재는 외부 model-hint 소비만)
3. 패키징된 speaker-encoder 프리셋/모델 편의성
4. model-backed AI 이펙트용 실제 모델 바이너리/라이선스 번들링
5. (Phase 2 잔여) render farm/local worker 확장, 추가 특수효과는 수요 확정 시

---

## 3. 확장(플러그인/확장) 로드맵 요약

`docs/EXTENSION_ROADMAP_KR.md`는 5단계 로드맵이며, **현재 시점에서 대부분 "완료 또는 기본 완료"** 상태다 (사실):

| Phase | 목표 | 상태 |
|---|---|---|
| 1. 편집기 기반 완성 | 매일 컷 편집 가능한 상태 | 사실상 완료. 잔여: preview worker 코덱 확장, 온디바이스 CV, 모델 번들링 |
| 2. 렌더러 | 타임라인을 실제 파일로 안정 출력 | 완료. 잔여: 추가 이펙트(수요 기반), render farm 확장 |
| 3. AI 편집 자동화 | CapCut/Filmora 템플릿보다 강한 로컬 AI 자동화 | 완료. 잔여: 모델 바이너리/라이선스 번들링, 온디바이스 CV 실행 |
| 4. 플러그인 시스템 | 핵심 수정 없이 확장 | reviewed API(`danbi.external.inspectManifest/analyzeTimeline/analyzeExports/planExports/writeExports/planEffects/planTransitions` 등), 서명/신뢰 체계까지 구현. 잔여: "실제 외부 코드 실행이 더 필요해질 때"의 signed/bounded runtime 확장 |
| 5. 작업/배포 | 개인 도구 → 제작 파이프라인 | **필수 항목 완료** 선언. 이후 provider 연동/관리 서버화는 "별도 제품 범위" |

플러그인 아키텍처의 핵심 특징: 외부 플러그인 파일을 직접 import하지 않고 **manifest 선언 + 프로세스 격리 핸드셰이크 + reviewed command** 방식. exporter writer는 신뢰 승인·fingerprint 감사·RSA 서명 검증을 거쳐야 실행된다. ComfyUI 워크플로우도 플러그인 manifest(`comfyUIWorkflows`)로 프리셋을 기여할 수 있다 — **파이프라인 설계 시 커스텀 생성 워크플로우를 플러그인으로 배포할 수 있는 공식 경로**가 이미 존재한다는 뜻이다.

---

## 4. 자동화 파이프라인 관점: 이미 계획에 있는 것 vs 빠진 것

목표 파이프라인: **시나리오 → 대본 → 콘티 → 이미지 생성 → 동영상/음성 생성 → 편집 → 업로드**

### 이미 계획/구현에 포함된 것 (사실)

| 파이프라인 단계 | Danbi Studio가 제공하는 것 |
|---|---|
| 이미지 생성 | `/generate` + ComfyUI 큐 API, 워크플로우 JSON + 파라미터 주입(prompt/seed/steps), 워크플로우 프리셋 레지스트리 |
| 이미지→동영상 | WAN 2.1 I2V가 1급 시민 (초기 계획의 핵심 시나리오), ComfyUI batch 자동화, AI B-roll gap fill, AI morph 트랜지션 |
| 편집 | 완성도 높은 편집기 전체 + **크리에이터 템플릿(Short Launch / Tutorial Steps / Review Pass)** + 타이틀/캡션 스타일 팩 |
| 자막 | 로컬 STT → 편집 가능한 캡션 → 번인/사이드카 |
| 렌더/출력 | 숏폼 export 프로파일, 9:16 crop 프리셋, loudnorm 마스터링, 헤드리스 배치 렌더 CLI, 렌더 워커 데몬 |
| 파이프라인 오케스트레이션 접점 | `/api/editor/*` 전체 자동화 API(+토큰 게이트), editor hooks(on-import/before-export/on-gap), allowlist 웹훅(n8n/Make 연동 명시), FEATURE_PLAN의 automation API 스펙(webhook 알림) |
| 배포 준비물 | 유튜브 챕터 텍스트 export (마커 인터체인지) |

### 빠진 것 (사실 — 8개 문서 어디에도 언급 없음)

1. **시나리오/대본 작성 (LLM 텍스트 생성)**: 텍스트 생성 단계 자체가 계획에 없다. Danbi는 "prompt를 받는" 쪽이지 "대본을 만드는" 쪽이 아니다.
2. **콘티(스토리보드) 단계**: 대본→샷 분해→씬별 프롬프트 매핑 개념이 없다. clip 단위 ComfyUI 프리셋 바인딩은 있으나, "콘티 문서"라는 상위 산출물은 존재하지 않는다.
3. **TTS(음성 합성)**: STT(음성→자막)는 강력하지만 **TTS는 전혀 없다**. 보이스오버는 마이크 녹음 기반이다. 목표 파이프라인의 "음성 생성"은 외부(예: ComfyUI 오디오 워크플로우 또는 별도 TTS 엔진)로 채워야 한다.
4. **업로드/배포(YouTube Shorts / Reels / TikTok)**: 업로드 API 연동 계획이 전무하다. Phase 5 "남은 작업"에서 "provider 연동/관리 서버화는 별도 제품 범위"라고 명시적으로 선을 그었다. cloud sync는 프로젝트 백업용(OneDrive류 폴더 동기화)이지 배포가 아니다.
5. **파이프라인 전체 오케스트레이터**: 설계 철학상 Danbi는 오케스트레이터가 아니라 **엔진**이다. 초기 문서부터 "n8n/Make/Opal의 백엔드"로 포지셔닝했다.

### 파이프라인 설계에 대한 시사점 (추측/제안)
- 시나리오·대본·콘티·TTS·업로드는 Danbi 외부(오케스트레이션 계층)에서 담당하고, Danbi에는 (a) ComfyUI 잡 API로 이미지/영상 생성, (b) project JSON 생성·주입, (c) 헤드리스 렌더 CLI 또는 렌더 워커 데몬으로 출력, (d) before-export 훅/웹훅으로 다음 단계 트리거 — 이 4개 접점으로 연결하는 것이 문서상 설계 의도와 정합한다.
- "같은 project JSON을 UI/renderer/automation API가 모두 해석"한다는 성공 기준은, **콘티→타임라인 자동 생성기가 project JSON을 직접 생성**하면 된다는 것을 의미한다 (프로젝트 스키마는 `src/electron/shared/`에 존재한다고 README에 기재).

---

## 5. 파이프라인 설계 시 반드시 지켜야 할 프로젝트 원칙

문서에서 반복적으로 강제되는 원칙들 (사실):

### 5.1 로컬 우선 (Local-First)
- 모든 실행은 로컬 GPU/로컬 서비스: ComfyUI는 기본 localhost만 허용(`COMFYUI_ALLOW_LOCALHOST=true`, 원격은 `COMFYUI_ALLOWED_URLS` 명시 필요)
- SQLite 로컬 DB, `.danbi/jobs`·`.danbi/autosave` 로컬 스냅샷, cloud sync조차 "사용자가 관리하는 동기화 폴더"에 쓰는 local-first 방식
- 파이프라인이 원격 서비스를 부를 경우 반드시 명시적 allowlist를 통과해야 한다.

### 5.2 명시적 옵트인 + 기본 dry-run
- ComfyUI batch는 **기본 dry-run**, 실제 실행은 옵트인
- 웹훅은 `executeWebhooks=true` 명시 + `DANBI_EDITOR_WEBHOOK_ALLOWLIST` + localhost 가드 + timeout/retry 클램프 + scoped secret(`DANBI_EDITOR_WEBHOOK_SECRET_<NAME>`, 프로젝트 JSON에 비밀 저장 금지)
- 자동화 클라이언트는 `DANBI_EDITOR_API_TOKEN` 게이트를 통과해야 함
- 파이프라인 설계도 "계획 생성 → 검토 → 실행" 2단계 구조를 따라야 한다.

### 5.3 라이선스 경계 (매우 강한 원칙)
- README 상단에 라이선스 문서 9종 링크: Third Party Source Register, Source Reuse Audit, License Guardrails, **Shotcut GPL Boundary** 등
- `npm run license:check`가 서드파티 소스/라이선스 경계를 CI 수준에서 검사
- `third_party/source-mirrors`는 앱 번들에 절대 연결하지 않음 (렌더 워커 문서에 반복 명시)
- 샘플/템플릿/공유 에셋은 서드파티 미디어를 번들하지 않고 합성 FFmpeg 미디어로 생성
- 모델 바이너리 번들링은 "라이선스 패키징이 해결될 때만"으로 유보
- README 라이선스: "This project is for personal use"
- 파이프라인이 외부 모델/에셋을 쓸 경우 라이선스 등록·감사 절차를 따라야 한다.

### 5.4 신뢰/서명 체계
- 원격 렌더 워커는 Trust 등록 + Pair token 필수(localhost만 예외), 플러그인은 RSA 서명 + 키 로테이션 + custody 감사, exporter writer는 fingerprint 승인 + trustHistory 감사 추적
- 파이프라인에서 외부 실행 컴포넌트를 추가하면 이 신뢰 모델에 편입시켜야 한다.

### 5.5 단일 프로젝트 계약 + undo 가능성
- project JSON이 UI/렌더러/자동화 API의 단일 계약이며, 저장본 마이그레이션이 자동 보강됨
- 모든 자동 편집(템플릿, B-roll, AI 결과 교체, 훅 액션)은 **undo 가능한 timeline transform**으로 적용 — 파이프라인의 자동 편집도 이 경로를 써야 한다.

### 5.6 TDD/품질 게이트 방법론
- `SKILL.md`(feature-planner)와 `plan-template.md`가 프로젝트의 공식 계획 방법론: 1~4시간 단위 phase, RED→GREEN→REFACTOR, phase별 품질 게이트(빌드/테스트/커버리지/린트) 통과 전 다음 단계 진행 금지, 계획 문서는 `docs/plans/PLAN_<feature-name>.md`
- 파이프라인 설계 문서도 이 템플릿 구조(개요/아키텍처 결정/phase별 체크박스/품질 게이트/리스크/롤백)를 따르는 것이 프로젝트 관례다.

---

## 요약

Danbi Studio는 "로컬 GPU ComfyUI 생성 플랫폼"에서 출발해 현재는 **편집·렌더·AI 자동화·플러그인·분산 렌더 워커까지 갖춘 로컬 우선 데스크톱 영상 편집기**로 완성 단계에 있다. 목표 파이프라인 7단계 중 **이미지/영상 생성, 편집, 렌더(숏폼 포함)와 자동화 접점(API/훅/웹훅/헤드리스 CLI)**은 계획·구현이 충실하다. 반면 **시나리오/대본/콘티(텍스트·기획 단계), TTS, 플랫폼 업로드**는 계획 문서 어디에도 없으며, 특히 업로드는 "별도 제품 범위"로 명시적으로 제외되어 있다. 따라서 파이프라인 설계는 Danbi를 오케스트레이터가 아닌 엔진으로 두고, 빠진 단계를 외부 계층에서 채우되, 로컬 우선·allowlist 옵트인·dry-run 기본·라이선스 경계·단일 project JSON 계약·undo 가능한 편집이라는 6대 원칙을 준수해야 한다.