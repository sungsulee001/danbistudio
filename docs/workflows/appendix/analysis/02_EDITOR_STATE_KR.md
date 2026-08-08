> 본 문서는 2026-07-05 파이프라인 집중 분석 세션의 서브에이전트 산출물 원본이다.
> 실행용 워크플로우 문서는 [../../README.md](../../README.md) 참고.

# Danbi Studio 편집기(에디터) 현재 상태 분석 보고서

- 분석 대상: `E:/ai_tool/Danbi_Studio/docs/` 하위 편집기 관련 문서 10종 (제품 스펙, 아키텍처, 완성 정의서, 2026-06-19~20 품질 패스, UX 재배치 문서, 2026-06-17 이후 변경 기록)
- 문서상 최신 시점: **2026-06-20** (Practical Quality Pass / Import·Timeline Usability Fix)
- 표기 원칙: 문서에 명시된 내용은 [사실], 문서 기반 해석·제안은 [추측/제안]으로 구분

---

## 1. 에디터 아키텍처 요약 (타임라인 / 프리뷰 / 렌더 구조)

[사실] Electron(main/preload/renderer/shared 경계) + Next.js 기반 로컬 우선 데스크톱 편집기이며, 핵심 설계 원칙은 **"UI·렌더러·자동화 API가 동일한 `EditorProject` JSON을 해석한다"**는 단일 프로젝트 모델 계약이다 (`EDITOR_PRODUCT_SPEC_KR.md` 제품 원칙 4).

### 프로젝트 모델 (단일 소스 오브 트루스)
```
EditorProject {
  assets[]                      // ffprobe 분석 메타 포함
  tracks[].clips[].effects[]    // 멀티트랙, keyframe/transition 포함
  markers[], captions[].words[] // word-level timing 자막
  automation[], plugins[], exportProfiles[]
}
```
- 저장: SQLite 기반 `/api/editor/projects` (CRUD). 포터블 배포용 `.danbi-project.json` 패키지 export/import(asset 경로 manifest, cache reference, relink warning 포함).
- 스키마 검증: `src/electron/shared/project-schema.ts`가 caption word timing, effect, automation rule, plugin manifest, export profile까지 실행 계약 수준으로 검증. 버전/마이그레이션/오류 리포트 존재.

### 타임라인
- 조작 코어는 **순수 함수** (`src/lib/editor/timeline.ts`, `clip-timing.ts`): split/trim/move/slip/roll/slide/duplicate/ripple/range edit/3-point insert·overwrite/linked V/A 동기화/마커·자막 이동까지 전부 프로젝트 JSON 변환 함수로 처리. UI(page.tsx)는 shell로 축소하는 방침.
- 장편 성능: viewport render window로 화면 밖 clip DOM 제외(30분 프로젝트 회귀 테스트 존재).

### 프리뷰
- `src/lib/editor/preview.ts`가 playhead 기준 media/text/effect/audio layer 스택을 계산 → Program Monitor가 합성. proxy 우선 프리뷰, 원본은 export 전용.
- WebCodecs 기반 preview worker(`public/editor-preview-worker.js`): MP4(H.264/H.265/AV1/VP8/VP9), WebM, fragmented MP4 등 광범위한 demux/decode 경로 구현. `requestVideoFrameCallback` 기반 프레임 텔레메트리.
- **Preview/Render Parity 모듈**(`preview-render-parity.ts`): 프리뷰와 FFmpeg 출력의 불일치(미지원 효과, browser-only 소스, AI pass 미리보기 불가)를 export-graph feature matrix로 만들어 preflight issue로 승격.

### 렌더
- `ffmpeg-renderer.ts`가 타임라인+export profile → FFmpeg input/filter graph/command plan 생성 (`/api/editor/render-plan`).
- 실행: 직접 렌더(`/api/editor/render`) + 렌더 큐(`/api/editor/render-jobs`: progress/cancel/retry/priority/concurrency/persistent snapshot). 하드웨어 인코더 자동 감지 및 software fallback.
- Preflight 체계: 출력 경로, container/codec 호환, 짝수 해상도, 자막 타이밍, missing media 등을 렌더 전 blocked/warning으로 차단하고 Resolve 액션으로 연결.
- 분산 렌더: headless CLI → handoff manifest → 렌더 워커 runner/daemon(HTTP+WebSocket+SSE, LAN discovery, Pair token 인증, fleet least-loaded 라우팅)까지 구현.

### 확장 레이어
- ComfyUI: 배치 큐(dry-run/실행), 결과 검수 후 `AI Results` 트랙 반입 또는 undo 가능한 원본 교체, AI B-roll gap fill, ai-morph 트랜지션, clip별 workflow preset binding.
- 자동화 hook: `manual / on-import / before-export / on-gap` 이벤트 → local action / ComfyUI job / generate payload / webhook payload.
- 플러그인: manifest 기반, RSA 서명 검증, 프로세스 격리 sandbox 명령(analyzeTimeline, planExports, writeExports 등). 외부 코드 직접 import는 차단.

---

## 2. 현재 완성도 수준 (2026-06-20 기준)

### 공식 판정 (기본골격 완료정의서, 2026-06-20 기록) [사실]
| 항목 | 판정 |
|---|---|
| 기본골격 (editor-only 로컬 기준) | **LOCAL_BASE_SKELETON_PASS** |
| 상용 편집기 체감 품질 | **IN_PROGRESS** |
| 완성품 전체 기준 | **NOT_COMPLETE** |
| Fresh Windows 외부 QA / 최종 릴리스 승인 | **EXTERNAL_PENDING** (사람 필요) |

### 완료된 것 [사실]
- **편집 기능 자체는 매우 넓게 구현 완료**: 멀티트랙 편집 전체 커맨드 세트, 3-point edit, linked V/A, 자막(SRT/VTT/burn-in/스타일), 로컬 STT 자막+검수+화자 분리, 오디오(파형/게인/믹서/클린업/EQ/미터), 효과(색보정/LUT/크로마키/마스크/스태빌라이즈/객체 추적 리프레임), keyframe(easing 포함), adjustment layer, video scopes, 다중 export profile.
- **패키징/릴리스 파이프라인**: 2026-06-16에 `electron:release:verify` full profile **17/17 게이트 통과** (빌드, 유닛/e2e, 패키지드 GUI smoke, 오프라인 smoke, 인스톨러 smoke, 실제 FFmpeg MP4 렌더 포함).
- **설치앱 blocker 해결(2026-06-18)**: Program Files 쓰기 오류를 userData 경로로 고정, `electron:local-installed-acceptance` 통과 (installer→실행→샘플 로드→media import→preflight→MP4 렌더→ffprobe 검증 전부 passed).
- **2026-06-19~20 집중 작업은 신규 기능이 아니라 상용 편집기형 UX/체감 품질 패스**: CapCut/OpenCut/Shotcut 구조를 참고한 3열 레이아웃(Asset Bay / Edit Workspace / Inspector dock), 상단 모드 바, 타임라인 로컬 툴바, slip/roll/slide 마우스 직접 조작, 멀티선택 그룹 trim, drop ghost preview, 오디오 모니터링 검증 등 20여 개의 소규모 패스가 각각 관련 E2E와 함께 완료됨.

### 미완료 / 남은 것 [사실 — 문서에 명시된 잔여 과제]
- Crop/Transform의 명시적 edit mode 분리, Inspector 밀도 정리(CapCut식 Video/Audio/Speed/Animation/Tracking/Adjust 탭), Media Bin의 batch select·bin grouping, 툴바 그룹핑 축소.
- 긴 실미디어 클립에서 waveform cache/preview 반응성(별도 성능 패스 필요), 실제 OS 오디오 출력의 설치앱 수동 확인.
- GPU 가속 프리뷰, 캘리브레이티드 모니터 출력, 추가 MP4/WebM 변형 코덱 커버리지.
- **외부 사람 개입 항목**: Fresh Windows QA evidence, returned evidence ZIP, 수동 결과 JSON, 최종 릴리스 승인 — 전부 EXTERNAL_PENDING.

[추측] 종합하면 "코어 편집 엔진 + 렌더 + 자동화 계약은 사실상 기능 완성 단계, UI 체감 품질은 상용 대비 다듬는 중, 릴리스는 외부 QA 대기" 상태로 읽는 것이 정확하다. 자동화 파이프라인 관점에서 필요한 백엔드 기능(렌더/큐/헤드리스)은 이미 안정화 검증까지 끝나 있다.

---

## 3. CapCut 등 상용 대비 격차

[사실] 완성 정의서가 벤치마크를 명시: 기본 편집 depth는 Shotcut, creator workflow/UX 속도는 CapCut·Filmora, 확장성은 OpenCut 기준. 콘텐츠/템플릿 라이브러리, 상용 AI 모델, 유료 asset은 **의도적으로 범위 제외**.

문서에 기록된 실제 격차:
1. **UX 밀도/속도** — CapCut 대비 미디어 썸네일 밀도(현재 2열, 3열+ 가능), 트랙 헤더 아이콘화, Inspector 접힘/검색/즐겨찾기 구조 미비, "added state" 등 CapCut식 상태 피드백 부족 (`EDITOR_IMPORT_TIMELINE_USABILITY_FIX`, `EDITOR_CORE_COMMERCIAL_BASELINE_PASS` 잔여 과제).
2. **콘텐츠 생태계** — CapCut의 템플릿/스티커/폰트/음원 라이브러리, 클라우드 템플릿에 해당하는 것 없음. 대신 로컬 title/caption style pack, free creator template scaffold(Short Launch/Tutorial Steps/Review Pass), Shared Asset Library로 대체 [사실].
3. **상용 AI 모델 내장 없음** — 자동자막(STT)은 로컬 Whisper 호환 명령 의존, 화자 embedding·CV tracker는 외부 명령/observation hint 주입 구조. 모델 바이너리 배포는 미결 [사실].
4. **성능** — GPU 프리뷰 가속 없음(CSS/CPU 근사), 장시간 클립 캐시 반응성 과제 [사실].
5. **강점(역격차)** — 무워터마크 로컬 export, 프로젝트 파일 소유권, ComfyUI/스크립트 자동화, headless 렌더, 분산 렌더 워커, 플러그인 서명 체계는 CapCut에 없는 차별점으로 문서가 명시 [사실].

[추측] 요약: "편집 기능의 깊이"는 이미 Shotcut급에 근접하나, "손에 붙는 속도감·마감 품질"이 CapCut 대비 가장 큰 격차이며 현재 패스들이 정확히 그 지점을 공략 중이다. 자동화 파이프라인 용도로는 이 UX 격차가 크게 문제되지 않는다(사람 개입 구간에만 영향).

---

## 4. 자동화 파이프라인의 "편집" 단계 진입점

문서에서 확인되는 기계 진입점이 매우 풍부하다. 전부 [사실]:

### 4.1 프로젝트 파일 포맷 (핵심 진입점)
- `EditorProject` JSON이 UI/렌더러/API 공통 계약이며 **"외부 자동화 payload는 버전 관리 대상"**으로 명시됨.
- `.danbi-project.json` 포터블 패키지: 프로젝트 JSON + asset manifest + cache reference를 한 파일로 이동 가능. headless 렌더가 이 패키지를 직접 읽음.
- 강력한 스키마 검증이 있어 외부에서 생성한 JSON도 저장/로드 경계에서 안전하게 걸러짐 → **파이프라인이 프로젝트 JSON을 직접 생성하는 방식이 공식적으로 지지되는 구조**.

### 4.2 REST API 서피스 (`/api/editor/*`, `DANBI_EDITOR_API_TOKEN` 게이트)
- `projects`(CRUD), `media`(파일 업로드→ffprobe 분석→render path 생성), `media-cache`(썸네일/proxy/waveform), `render-plan`, `render`(직접 렌더), `render-jobs`(큐/진행률/취소/재시도), `ffmpeg-capabilities`, `queue-settings`, `hooks`, `comfyui-jobs`, `stt-jobs`, `luts`.
- 제품 원칙에 "n8n, Make, 자체 스크립트가 사용할 수 있는 JSON payload를 안정적으로 유지"가 명시됨.

### 4.3 자동화 hook
- `manual / on-import / before-export / on-gap` 이벤트 → local action(자막 스타일, loudness 등 프로젝트 자동 적용: `applyLocalActions=true`), ComfyUI job, generate payload, webhook payload. webhook은 `executeWebhooks=true` 명시 시에만 실행(allowlist/secret/timeout/retry 경계).

### 4.4 헤드리스 렌더 / 분산 렌더 (편집→출력 자동화의 완성 경로)
- `npm run editor:headless-render`: raw 프로젝트 JSON 또는 포터블 패키지 입력, 전체/선택 profile dry-run/실제 렌더.
- `--handoff` → `editor:render-worker`(CLI) / `editor:render-worker-daemon`(HTTP `POST /runs`, SSE progress, WebSocket fleet status, `--max-runs` capacity, LAN discovery, 토큰 인증) — **원격 머신 렌더팜 구성이 이미 가능**.

### 4.5 AI 생성 연동 (이미지/영상 생성 단계와의 접점)
- ComfyUI 배치 큐: 선택 클립→job→결과를 `AI Results` 후보 트랙 반입 또는 원본 교체. AI B-roll gap fill(빈 구간 자동 탐지→draft clip 생성), ai-morph transition, clip별 workflow preset override.
- 로컬 STT(`DANBI_STT_COMMAND`)로 음성→word-level 자막 자동 생성 + 검수 지표.

### 4.6 상호 교환 포맷
- SRT/WebVTT 자막 import/export, EDL/FCPXML import·relink(코어 테스트 존재). Free template scaffold가 타이틀/자막/마커를 프로그램적으로 생성하는 선례.

[추측] 파이프라인 설계 관점 권장 진입 방식: **(1) 생성 산출물(이미지/영상/음성)을 `/api/editor/media`로 반입 → (2) 콘티 데이터를 EditorProject JSON으로 컴파일(트랙/클립/자막/마커 배치) → (3) `/api/editor/projects` 저장 또는 포터블 패키지 작성 → (4) preflight 확인 후 headless 렌더 또는 render-jobs 큐 → (5) 출력 MP4 수령**. 주의점(문서 명시): FFmpeg는 browser blob URL을 못 읽으므로 미디어는 반드시 import API를 거쳐 서버 파일 경로(renderPath)를 얻어야 하고, export 해상도는 짝수여야 하며(쇼츠용 1080x1920은 통과), API 토큰 설정이 필요하다.

---

## 5. 파이프라인 연동을 위해 추가로 필요해 보이는 것

전부 [추측/제안] (문서에 없는 공백에 대한 판단):

1. **"콘티→타임라인" 컴파일러**: 타임라인 조작 함수는 순수 라이브러리(`src/lib/editor/timeline.ts`)로만 존재하고 REST로 노출된 것은 프로젝트 전체 CRUD다. 샷 리스트/콘티(장면, 길이, 이미지·영상 asset, 나레이션, 자막)를 받아 검증된 EditorProject JSON을 생성하는 별도 빌더 모듈(Node 스크립트 또는 신규 API)이 필요하다. 기존 free template scaffold 코드가 좋은 출발점.
2. **프로젝트 JSON 스키마의 외부 공개 문서/버전 태그**: 스키마 검증기는 존재하나, 외부 생성기가 참조할 필드 사전·버전 정책 문서가 확인되지 않음. 자동화 계약으로 고정 필요.
3. **TTS(음성 생성) 연동 계약**: STT(음성→자막)는 있으나 대본→음성 생성 경로는 문서에 없음. 외부 TTS 산출물을 media import로 넣고, 음성 길이에 맞춰 클립 duration을 산출하는 규칙이 컴파일러에 필요.
4. **업로드 단계 부재**: 유튜브 쇼츠/릴스/틱톡 업로드 관련 기능은 어떤 문서에도 없음. headless 렌더 완료 이벤트(렌더 job snapshot / worker run report)를 트리거로 삼는 별도 업로더 모듈이 신규로 필요.
5. **쇼츠 전용 export profile 프리셋**: profile 체계는 유연하나(사용자 정의 가능) 9:16 소셜 프리셋이 기본 포함인지 불명확. 파이프라인 표준 profile(1080x1920 H.264, 플랫폼별 비트레이트) 정의 권장.
6. **파이프라인 오케스트레이터에서의 preflight 자동 처리**: preflight blocked issue(missing media, caption timing 등)는 현재 UI Resolve 버튼 중심. 무인 파이프라인에서는 blocked 발생 시 자동 재시도/알림 정책을 오케스트레이터 쪽에 설계해야 함.
7. **ComfyUI 결과 자동 확정 정책**: 현재 AI 결과 반영은 "사람 검수 후 승인(side-by-side review)"이 기본 설계. 완전 자동화 시 품질 기준(duration/resolution mismatch, ffprobe warning) 기반 자동 승인 임계값을 정의하거나, 검수 단계를 human-in-the-loop 지점으로 명시해야 함.
8. **MCP/에이전트 명령 서피스 확장**: 완성 정의서 Phase 5에 "MCP/automation command surface"가 있고 현재는 API 토큰 게이트까지 구현된 상태. LLM 에이전트가 직접 편집을 지시하려면 OpenCut이 지향하는 MCP 서버형 노출을 검토할 가치가 있음.

### 결론
편집 단계는 자동화 파이프라인의 병목이 아니다. 프로젝트 JSON 계약 + import API + headless/분산 렌더가 이미 검증돼 있어, 실질적으로 새로 만들 것은 **콘티→프로젝트 JSON 컴파일러, TTS 연동 규칙, 업로드 모듈, 무인 운영 정책** 4가지로 좁혀진다.