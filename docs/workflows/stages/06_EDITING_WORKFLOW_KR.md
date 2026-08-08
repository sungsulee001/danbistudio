# S6. 편집·렌더 워크플로우 (에셋+콘티 → EditorProject → 인간 검수 → 최종 MP4)

> 파이프라인 6단계. 생성 단계(S4·S5)의 산출물과 승인된 콘티(S3)를 받아 Danbi Studio 타임라인 초안을 자동 조립하고,
> 인간 검수 게이트를 거쳐 headless 렌더로 최종 MP4를 출력한다.
> 본 문서의 핵심은 **4대 결손 ① "콘티→EditorProject 컴파일러"** 의 설계 계약이다.

---

## 1. 목적과 범위

### 목적
- [사실] Danbi Studio의 편집·렌더 백엔드(프로젝트 JSON 계약, `/api/editor/*`, headless render CLI, render-jobs 큐, 분산 렌더 워커)는 이미 구현·안정화 검증이 끝나 있어 파이프라인의 병목이 아니다. 실제로 새로 만들어야 하는 것은 **콘티 데이터를 검증된 `EditorProject` JSON으로 변환하는 컴파일러**와 **무인 운영 정책**이다.
- 이 문서는 (a) 컴파일러의 입력/출력 계약과 트랙 배치 규칙, (b) 미디어 반입 절차, (c) 자막·모션그래픽 자동화, (d) 인간 검수 게이트, (e) 렌더 실행 경로를 "어떤 에이전트가 봐도 구현 착수 가능"한 수준으로 확정한다.

### 범위
- 포함: 미디어 반입(`/api/editor/media`), 콘티→EditorProject 컴파일, 자막(word-level 캡션) 생성, Lottie 모션그래픽 오버레이, preflight·검수·렌더, 쇼츠/가로/상세페이지 export 프로파일, 중기 danbi-editor MCP 서버 방향.
- 제외: 에셋 생성 자체(S4 [이미지](./04_IMAGE_GEN_WORKFLOW_KR.md), S5 [영상·음성·BGM](./05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md)), 업로드·메타데이터(S7 [업로드](./07_UPLOAD_WORKFLOW_KR.md)), 편집 UI 자체의 개선(P1 [통합 빌더](../platform/08_UNIFIED_BUILDER_KR.md)).

---

## 2. 입력/출력 계약

### 2.1 입력 (Obsidian vault, `DanbiVault/20-productions/<production_id>/`)

| 파일 | 요구 상태 | S6가 소비하는 내용 |
|---|---|---|
| `02-storyboard.md` | `status: approved` 이상 | 컷 목록(컷 id, 목표 길이, 에셋 참조, 나레이션 세그먼트, 자막 텍스트, 챕터 경계, 전환·오버레이 지시) |
| `03-assets.md` | S5 완료로 `status: generated` | 에셋 레지스트리(에셋 id, 유형, **Danbi outputs 디렉터리의 파일 경로**, ffprobe 길이, 컷 매핑, 출처/라이선스, `comfyui_job_ids`) |

[제안] S6가 의존하는 `03-assets.md` 에셋 레지스트리 필드(행 단위):

```yaml
# 03-assets.md 에셋 행의 필드 사전 (데이터 구조 표기)
asset_id: CUT-03-i2v         # 컷 id + 유형 파생
type: image | i2v | tts | bgm
path: <Danbi outputs 절대 경로>   # vault 밖, 경로 참조만
duration_sec: 4.2            # ffprobe 실측 (S5가 기록)
cut_id: CUT-03               # S3 콘티 표의 CUT-연번 규약
source_license: <출처·사용조건>
comfyui_job_id: <GenerationJob.id>   # 조인 키
```

### 2.1a 전환·자막 프리셋 어휘 사전 (S6 소유 — S3는 참조만)

[제안] S3 콘티의 `transition`·`subtitle` 필드가 사용할 수 있는 값은 아래로 한정한다. 컴파일러는 사전에 없는 값을 blocked로 반려한다.

| 분류 | 어휘 | 근거 |
|---|---|---|
| 전환 | `cut`(기본, 전환 없음) · `dissolve`(=crossfade) · `dip` · `push` · `wipe` | [사실] Danbi FCPXML 왕복이 보존하는 전환 4종 + 기본 컷 |
| 전환(AI) | `ai-morph` | [사실] ComfyUI `transition-morph` 프리셋 잡으로 변환되는 기존 기능 |
| 자막 스타일 | `caption-default` · `caption-emphasis` · 채널 스타일 팩 이름(채널 노트에 등록된 것만) | [사실] 로컬 타이틀/캡션 스타일 팩 체계 재사용 |
| 오버레이 | `lottie:<프리셋명>` (타이틀 카드·강조·인포그래픽) | [제안] diffusionstudio/lottie로 제작한 프리셋을 채널 노트에 등록 후 사용 |

어휘 추가 절차: 새 값이 필요하면 S6 문서의 이 표를 먼저 갱신하고(스키마 버전 +1), 컴파일러 검증 사전과 S3 lint를 함께 갱신한다.

### 2.2 출력

| 산출물 | 위치 | 설명 |
|---|---|---|
| `EditorProject` JSON | Danbi `/api/editor/projects` 저장 또는 `.danbi-project.json` 포터블 패키지 | [사실] UI·렌더러·자동화 API가 동일하게 해석하는 단일 계약. 스키마 검증(`project-schema`) 통과가 필수 |
| 최종 MP4(+사이드카) | Danbi 렌더 출력 디렉터리 | 챕터 메타데이터 포함. 자막은 번인 또는 SRT/VTT 사이드카 |
| `03-assets.md` 갱신 | vault | [제안] `editor_project_id`(또는 패키지 경로), 미디어 반입 매핑, `final_render`(경로·프로파일·렌더 잡 id) 추가 |
| `log.md` append | vault | 컴파일·preflight·검수·렌더 이벤트 기록 (append-only) |

### 2.3 상태 전이

- 진입 조건: production `status: generated` (S5 완료).
- 전이: **`generated → edited`** — 인간 검수 게이트를 통과해야만 전이한다. 에이전트가 스스로 넘지 않는다(브리프 §2.5 철학 동일 적용).
- [제안] vault↔Danbi 동기화는 브리프가 허용한 단방향 이벤트 2개에 정확히 대응시킨다: ① 검수 승인(vault `status: edited`) → 렌더 잡 enqueue, ② 렌더 잡 완료 → vault에 `final_render` append. 이 외의 동기화 경로를 추가하지 않는다.

---

## 3. 워크플로우

```
[S5 완료: generated]
  → (1) 입력 검증        : 콘티 컷 ↔ 에셋 레지스트리 대조 (누락 에셋 즉시 반려)
  → (2) 미디어 반입      : POST /api/editor/media (renderPath 확보) → 반입 매핑 기록
  → (3) 오버레이 사전 제작 : Lottie 타이틀/강조 → 알파 영상·이미지 시퀀스로 래스터화 → (2)로 반입
  → (4) 컴파일           : 콘티+에셋 → EditorProject JSON → 스키마 검증
  → (5) preflight (dry-run): blocked/warning 분류 → 자동 처리 정책 적용
  → (6) 인간 검수 게이트   : Danbi UI에서 초안 열어 확인·수정 → 승인 시 status: edited  ◀ 승인 게이트
  → (7) 렌더             : headless render CLI 또는 render-jobs 큐, 프로파일별 출력
  → (8) 결과 기록         : ffprobe 검증 → 03-assets.md final_render + log.md append → S7 인계
```

### (1) 입력 검증
- 콘티의 모든 컷이 참조하는 에셋이 `03-assets.md`에 존재하고 파일 경로가 실재하는지 대조한다. 누락 시 S6를 시작하지 않고 결손 목록을 log.md에 남긴 뒤 S4/S5로 반려한다.

### (2) 미디어 반입 — 필수 경로
- [사실] FFmpeg는 브라우저 blob URL을 읽지 못하므로, 모든 미디어는 반드시 `/api/editor/media`(파일 업로드 → ffprobe 분석 → renderPath 생성)를 거쳐 **서버 파일 경로(renderPath)** 를 얻어야 한다. `DANBI_EDITOR_API_TOKEN` 인증이 필요하다.
- [제안] 반입 결과(`asset_id → Danbi media id/renderPath/ffprobe 메타`)를 반입 매핑으로 `03-assets.md`에 기록해 재실행 시 중복 반입을 건너뛴다(멱등성).

### (3) 모션그래픽 오버레이 — diffusionstudio/lottie
- [사실] diffusionstudio/lottie(MIT, v1.0.0)는 AI 에이전트가 자연어로 프로덕션급 Lottie 애니메이션을 생성하는 프레임워크로 **채택** 확정. 타이틀 카드, 자막 강조, 인포그래픽 오버레이에 사용한다.
- [사실] Danbi의 Preview/Render Parity 모듈은 browser-only 소스를 preflight issue로 승격시키고, 렌더는 FFmpeg 기반이다. → [제안] 따라서 Lottie를 타임라인에 직접 올리지 않고, **사전 래스터화**(알파 채널 영상 또는 투명 PNG 시퀀스)한 뒤 (2)의 미디어 반입을 거쳐 일반 영상 에셋으로 취급한다. 래스터화 도구는 lottie-web 기반 헤드리스 캡처 계열로 하고 선정 결과를 본 문서에 추기한다.
- [사실] MIT 반입 절차 준수: source register + `third_party/NOTICE.md` + 파일 헤더 기록, `npm run license:check` 통과.

### (4) 콘티→EditorProject 컴파일 — 상세는 §4.1

### (5) preflight 자동 처리 정책 (무인 구간)
- [사실] preflight는 출력 경로, container/codec 호환, **짝수 해상도**, 자막 타이밍, missing media 등을 렌더 전에 blocked/warning으로 차단하며, 현재 해결 수단은 UI Resolve 버튼 중심이다.
- [제안] 무인 정책(오케스트레이터 측 구현):

| 이슈 유형 | 자동 처리 | 실패 시 |
|---|---|---|
| missing media | 반입 매핑 재확인 후 재반입 1회 | 알림 + 파이프라인 중단 |
| 자막 타이밍 위반 | 캡션 경계 자동 보정(겹침 제거, 최소 표시시간 보장) 1회 | warning 강등 불가 시 중단 |
| 홀수 해상도 | 표준 프로파일 강제(§4.4 프로파일은 전부 짝수) | 발생 자체가 컴파일러 버그 → 중단 |
| 미지원 효과/browser-only 소스 | 해당 효과 제거 또는 래스터화 대체 | 중단 |
- 재시도 상한은 이슈당 1회, 전체 2회. 초과 시 log.md 기록 + 사용자 알림 후 정지(브리프의 "기본 dry-run, 명시적 옵트인" 철학).

### (6) 인간 검수 게이트 ◀
- 검수자는 Danbi Studio UI(브라우저 또는 데스크톱 모드)에서 초안 프로젝트를 열어 프리뷰로 확인하고, 필요한 미세 조정(컷 길이, 자막 오탈자, 오버레이 위치)을 UI에서 직접 수행한다. [사실] UI와 자동화가 같은 프로젝트 JSON을 해석하므로 수정 사항은 그대로 렌더에 반영된다.
- 승인 행위 = vault에서 production `status: edited`로 변경. 이 변경이 렌더 잡 enqueue 이벤트가 된다. [제안] 반자동(1단계) 모드에서 이 게이트는 생략 불가. 완전 무인(2단계)에서도 기본은 "알림 후 대기"이며, 게이트 생략은 명시적 정책 플래그로만 허용한다 — 정책 소유는 [P4 오케스트레이션](../platform/11_ORCHESTRATION_KR.md).

### (7) 렌더
- [사실] 두 경로가 이미 존재한다: ① headless render CLI(raw 프로젝트 JSON 또는 `.danbi-project.json` 패키지 입력, dry-run preflight, UI와 동일한 FFmpeg 엔진·extension hook 공유), ② `/api/editor/render-jobs` 큐(진행률/취소/재시도/우선순위/동시성/영속 스냅샷).
- [제안] 파이프라인 기본은 **render-jobs 큐**(진행률 폴링과 잡 영속화가 오케스트레이터 감시에 유리). 배치·야간 대량 렌더 시 headless CLI + `--handoff` → 렌더 워커 데몬(HTTP/SSE/WebSocket, LAN discovery, 토큰 인증)으로 확장한다 — [사실] 원격 렌더팜 구성이 이미 가능하다.
- [사실] 하드웨어 인코더 자동 감지 + 소프트웨어 폴백이 구현되어 있다. [제안] NVENC 사용 시 ComfyUI(S4/S5)와 RTX 3090을 공유하므로, 오케스트레이터는 생성 잡과 렌더 잡을 동시 실행하지 않도록 직렬화한다.

### (8) 결과 기록
- 출력 MP4를 ffprobe로 검증(해상도·프레임레이트·오디오 트랙 수·챕터 존재)한 뒤 `03-assets.md`의 `final_render`와 log.md에 기록하고 S7로 인계한다.

---

## 4. 구현 기술 (코드 없이)

### 4.1 콘티→EditorProject 컴파일러 (4대 결손 ① — 신규 개발 1순위)

- **형태**: [제안] 독립 CLI 도구(가칭 `storyboard-compiler`). Danbi 저장소 안에 두되 순수 에디터 코어처럼 Node 실행 경계와 분리된 순수 변환 모듈 + 얇은 CLI 래퍼로 구성한다. 오케스트레이터(Claude Code 스킬)가 스텝 단위로 호출한다. Danbi 큐 내부 구현에는 의존하지 않고 API/스키마 계약 수준에만 의존한다([사실] 큐 모듈은 위치 이동 중인 구조 부채이므로 직접 의존 금지).
- **입력**: `02-storyboard.md`(컷 목록) + `03-assets.md`(에셋 레지스트리 + 반입 매핑) + 대상 export 프로파일 이름.
- **출력**: `project-schema` 검증을 통과한 `EditorProject` JSON(또는 미디어 manifest를 동봉한 `.danbi-project.json` 패키지). [사실] 스키마 검증기는 caption word timing, effect, export profile까지 실행 계약 수준으로 검증하므로, 검증 통과 = Danbi가 열고 렌더할 수 있음이 보장된다.
- **코드 출발점**: [사실] free creator template scaffold(Short Launch / Tutorial Steps / Review Pass)가 타이틀·자막·마커를 프로그램적으로 생성하는 선례로 문서에 명시되어 있다. 컴파일러는 이 scaffold의 생성 패턴을 확장하는 방식으로 시작한다.

**트랙 배치 규칙** [제안]:

| 트랙 | 내용 | 규칙 |
|---|---|---|
| V1 | 메인 클립(I2V 영상, 정지 이미지) | 컷 순서대로 갭 없이 배치. 컷 duration의 기준은 아래 duration 규칙 |
| V2 | 타이틀/오버레이(래스터화된 Lottie, 자막 강조) | 콘티의 오버레이 지시 구간에만 배치. V1과 독립적으로 겹침 허용 |
| A1 | TTS 나레이션(Fun-CosyVoice 3.0 산출물) | 컷별 세그먼트를 V1 클립 시작점에 정렬 |
| A2 | BGM(ACE-Step 산출물) | 전체 길이로 1클립. 나레이션 구간 게인 감소(더킹)를 오디오 게인 설정으로 표현 |

**duration 규칙(4대 결손 ③ TTS 연동 규칙의 소비처)** [제안]:
- 컷 길이 = 해당 나레이션 오디오 실측 길이(ffprobe) + 앞뒤 패딩(기본 0.3초 내외, 콘티에서 컷별 재정의 가능).
- I2V 클립이 컷 길이보다 짧으면: 마지막 프레임 홀드(freeze) → 그래도 부족하면 콘티에 반려. 길면 트림. 정지 이미지는 컷 길이만큼 늘린다.
- 콘티의 `duration_target`은 참고치이며 나레이션 실측이 우선한다(오디오-영상 싱크가 1순위).

**마커 — 유튜브 챕터 1급 데이터**:
- [사실] chapter 마커는 렌더 시 FFmpeg `.ffmetadata` 사이드카로 변환되어 결과 MP4에 챕터로 박히고, 마커 상호교환은 CSV·YouTube chapters 형식 export를 지원한다.
- [제안] 컴파일러는 콘티의 챕터 경계 필드를 `kind: chapter` 마커로 필수 생성한다. S7이 이 마커를 유튜브 챕터 설명문으로 직결 사용한다. 검수 포인트는 `kind: todo` 마커로 병기해 검수자가 UI에서 바로 찾게 한다.

### 4.2 자막 — SenseVoice 타임스탬프 → word-level 캡션
- [사실] `EditorProject`는 `captions[].words`로 word-level 타이밍 자막을 1급 지원하고, 로컬 title/caption 스타일 팩과 SRT/VTT import/export·번인이 구현되어 있다.
- [제안] S5에서 SenseVoice-Small(Apache-2.0)이 TTS 산출물을 정렬해 만든 word-level 타임스탬프를 `03-assets.md` 경유로 받아, 컴파일러가 `captions[].words`로 직접 주입한다. Danbi 내장 STT 큐를 다시 돌리지 않는다(이중 처리 방지). 스타일은 채널별 캡션 스타일 팩 이름을 콘티 frontmatter에서 지정한다.
- [제안] 출력 정책: 쇼츠·릴스 = 번인(스타일 팩 적용), 유튜브 일반 = 번인 + SRT 사이드카 동시 출력(S7에서 자막 트랙 업로드용).

### 4.3 Danbi 연계 지점 요약
- HTTP: `/api/editor/media`(반입), `/api/editor/projects`(저장), `/api/editor/render-plan`·`/render-jobs`(렌더), `/api/editor/markers`(챕터 CSV/YouTube 형식 교환). 전부 `DANBI_EDITOR_API_TOKEN` 게이트. [사실]
- CLI: headless render(패키지 입력·dry-run), render-worker daemon(확장). [사실]
- FCPXML(`/api/editor/fcpxml`)은 타이틀·전환 4종·마커까지 담는 **중립 포맷 차선책**으로 유지 — effect stack·키프레임·캡션 스타일을 못 담으므로 기본 경로가 아니다. [사실]

### 4.4 Export 프로파일 표준 [제안]
| 프로파일 | 해상도 | 용도 |
|---|---|---|
| `shorts-vertical` | 1080x1920 (H.264 + AAC) | 유튜브 쇼츠·릴스·틱톡. [사실] 짝수 해상도 preflight 통과 |
| `landscape-hd` | 1920x1080 | 유튜브 일반·웹페이지 임베드 |
| `detail-page` | 1080x1080 또는 1080x1350 | 상세페이지 (무음/루프 변형 허용) |

프로파일은 `exportProfiles`에 등록해 프로젝트와 함께 버전 관리한다.

### 4.5 중기: danbi-editor MCP 서버
- [사실] palmier-pro(GPL-3.0)는 "에이전트가 MCP로 편집기를 직접 조작"하는 인터페이스의 1순위 벤치마크이며(코드 편입 금지, 인터페이스 설계만 참고), Danbi 완성 정의서 Phase 5에도 "MCP/automation command surface"가 명시되어 있다.
- [제안] `mcp-builder` 스킬로 danbi-editor MCP 서버를 개발한다. 노출 도구 후보: 프로젝트 열기/저장, 클립 배치·트림, 자막 수정, 마커 조작, preflight 실행, 렌더 enqueue·상태 조회. 내부적으로는 기존 `/api/editor/*`를 감싸는 래퍼로 시작한다(신규 서피스 최소화). 이것이 완성되면 컴파일러의 "일괄 생성" 방식에 더해 에이전트의 "대화형 미세 편집"이 가능해진다. 착수 시점은 컴파일러 v1 안정화 이후.

---

## 5. 활용 스킬 (브리프 §4 카탈로그)

| 단계 | 스킬 | 용도 |
|---|---|---|
| 컴파일러 설계 | `feature-planner`, `writing-plans` | 입력/출력 계약과 구현 계획 문서화 |
| 컴파일러 구현 | `test-driven-development`, `subagent-driven-development` | 순수 변환 모듈이라 TDD 적합(콘티 fixture → 기대 JSON). 컷 배치/자막/마커 규칙을 서브에이전트로 병렬 구현 |
| 오버레이 제작 | `diffusionstudio/lottie`(포크 채택) | 타이틀·자막 강조·인포그래픽 Lottie 생성 |
| 검증 | `verification-before-completion`, `webapp-testing` | 렌더 산출물 ffprobe 검증 절차 강제, Danbi UI 스모크(초안이 열리는지) 자동화 |
| 렌더 실패 진단 | `systematic-debugging` | preflight blocked·FFmpeg 오류의 원인 계통 추적 |
| MCP 서버(중기) | `mcp-builder`, `skill-creator` | danbi-editor MCP 개발, 편집 지시용 스킬 문서화 |

---

## 6. 구현 단계 체크리스트

### Phase A — 계약 고정 (선행: S3·S4·S5 문서의 콘티/에셋 필드 확정)
- [ ] `EditorProject` 스키마의 **외부 생성기용 필드 사전 + 버전 태그 문서** 작성 (위치: `E:/ai_tool/Danbi_Studio/docs/` 하위 에디터 문서 옆). [사실] 검증기는 존재하나 외부 공개 필드 사전이 없음이 결손으로 확인됨.
- [ ] `02-storyboard.md` 컷 필드·`03-assets.md` 에셋 레지스트리 필드(§2.1)를 S3/S4/S5 문서와 상호 대조해 확정하고 `DanbiVault/90-templates/`에 템플릿 반영.
- 검증: 필드 사전의 모든 필드가 실제 스키마 검증기 규칙과 1:1 대응하는지 대조표 작성.

### Phase B — 미디어 반입 스텝 (선행: A, `DANBI_EDITOR_API_TOKEN` 설정)
- [ ] 오케스트레이터 스텝 "에셋 반입" 작성: 레지스트리의 각 경로를 `/api/editor/media`로 전송, 응답(renderPath·ffprobe 메타)을 반입 매핑으로 `03-assets.md`에 기록. 멱등(재실행 시 기존 매핑 재사용).
- 검증: 샘플 production 1건의 이미지/I2V/TTS/BGM 전 유형 반입 후, 모든 renderPath가 실재 파일인지 확인.

### Phase C — 컴파일러 v1 (선행: A·B)
- [ ] 순수 변환 모듈 + CLI 래퍼(가칭 `storyboard-compiler`)를 Danbi 저장소 내 도구 영역에 신설. 범위: V1+A1 배치, duration 규칙(나레이션 실측 우선, freeze/trim), chapter·todo 마커, `captions[].words` 주입, 스키마 검증 호출, `/api/editor/projects` 저장과 `.danbi-project.json` 패키지 양쪽 출력. free template scaffold 생성 패턴을 출발점으로 사용.
- 검증: ① 콘티 fixture → 기대 JSON 회귀 테스트, ② 스키마 검증 오류 0, ③ headless render dry-run preflight 통과, ④ Danbi UI에서 초안이 열리고 프리뷰 재생됨.

### Phase D — 오버레이·스타일 (선행: C)
- [ ] Lottie 스킬 포크 + 래스터화 절차(알파 영상/PNG 시퀀스) 확립, MIT 반입 절차(source register·NOTICE·헤더) 이행.
- [ ] V2 타이틀/강조 배치, A2 BGM + 나레이션 구간 게인 감소 규칙, 채널별 캡션 스타일 팩 지정을 컴파일러에 추가.
- 검증: parity preflight에서 browser-only 소스 경고 0건, 프리뷰와 dry-run 결과 일치.

### Phase E — 렌더 자동화 (선행: C)
- [ ] 표준 export 프로파일 3종(§4.4) 등록. render-jobs 큐 제출→진행률 폴링→완료 수신 스텝 작성. preflight 무인 정책(§3-(5)) 구현(재시도 상한 포함). 생성 잡과의 GPU 직렬화 규칙을 P4에 위임 명시.
- 검증: 렌더 완료 MP4를 ffprobe로 검사 — 1080x1920, 오디오 2트랙 믹스다운 정상, **챕터 메타데이터 존재**, 재생 길이가 콘티 총합 ±0.5초.

### Phase F — 검수 게이트 통합 (선행: C·E)
- [ ] 검수 절차 문서화: 초안을 여는 방법(프로젝트 id/패키지 경로), 확인 항목 체크리스트(싱크·자막 오탈자·오버레이·todo 마커 소진), 승인 = vault `status: edited` 변경, 승인 이벤트 → 렌더 enqueue 연결.
- 검증: 승인 전 렌더가 절대 시작되지 않음을 시나리오 테스트로 확인(게이트 우회 없음).

### Phase G — danbi-editor MCP 서버 (중기, 선행: C~F 안정화)
- [ ] `mcp-builder` 스킬로 `/api/editor/*` 래퍼형 MCP 서버 설계·구현. palmier-pro의 도구 노출 목록을 벤치마크(인터페이스만, 코드 금지).
- 검증: Claude Code에서 MCP로 "컷 3 자막 수정 → preflight → 렌더 enqueue" 시나리오 완주.

---

## 7. 완료 조건

### 기계(에이전트) 완료 조건
- [ ] 샘플 production 1건 기준: `02-storyboard.md`+`03-assets.md` → 반입 → 컴파일 → 스키마 검증 통과 → dry-run preflight 통과까지 무인 완주.
- [ ] (검수 승인 후) render-jobs 렌더 완료 → ffprobe 검증(해상도·챕터·오디오·길이) 통과 → `03-assets.md` `final_render` 기록 + log.md append.
- [ ] preflight blocked 강제 주입 테스트에서 무인 정책이 규정대로 재시도·중단·알림함.
- [ ] 컴파일러 회귀 테스트(콘티 fixture) 전건 통과, `npm run license:check` 통과(Lottie 반입분 포함).

### EXTERNAL_PENDING (사람/외부)
- [ ] **인간 검수 게이트**: Danbi UI에서 초안 확인·수정 후 `status: edited` 승인 — 사람만 수행.
- [ ] 최종 MP4의 주관적 화질/싱크 QA(스피커 실청취 포함) — 사람만 수행.
- [ ] (참고) Danbi Studio 자체의 Fresh Windows QA·최종 릴리스 승인은 별도 트랙의 EXTERNAL_PENDING이며 본 워크플로우의 전제 조건은 아니다. [사실]

---

## 8. 리스크와 완화책

| 리스크 | 내용 | 완화책 |
|---|---|---|
| 스키마 드리프트 | Danbi 에디터 개발이 진행되며 `EditorProject` 스키마 변경 시 컴파일러 산출물이 거부됨 | Phase A의 필드 사전에 버전 태그를 두고, 컴파일러는 항상 저장 전 스키마 검증을 호출해 조기 실패. [사실] 스키마에 버전/마이그레이션 체계 존재 |
| blob URL 함정 | 반입 없이 경로만 참조하면 프리뷰는 되는데 렌더가 실패 | §3-(2) 반입 필수 규칙 고정. preflight missing media가 2차 방어선 [사실] |
| Lottie 렌더 불일치 | 브라우저 전용 소스는 FFmpeg 렌더에 못 들어감 | 사전 래스터화 규칙(§3-(3)) + parity preflight로 검출 [사실] |
| GPU 경합 | 렌더(NVENC)와 ComfyUI 생성이 RTX 3090을 동시 점유 | 오케스트레이터 수준 직렬화(P4), 렌더는 소프트웨어 인코딩 폴백 가용 [사실] |
| 무인 재시도 폭주 | blocked 이슈 자동 처리의 무한 루프 | 이슈당 1회·전체 2회 상한, 초과 시 정지+알림(§3-(5)) |
| 게이트 우회 | 자동화가 검수 없이 렌더·업로드로 직행 | 승인 이벤트(status: edited)만이 렌더 enqueue를 트리거하는 단방향 이벤트 설계(§2.3). 시나리오 테스트로 상시 검증(Phase F) |
| 라이선스 오염 | palmier-pro(GPL)·OpenMontage(AGPL) 코드 편입 | 인터페이스/아키텍처 참고만. MIT 반입은 register+NOTICE+헤더 절차 [사실] |
| 큐 내부 의존 | 큐 모듈이 구조 부채로 위치 이동 예정 | API 라우트/CLI 계약에만 의존, 내부 모듈 import 금지 [사실] |

---

## 9. 관련 문서

- [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md) — 마스터 파이프라인 보고서
- [./03_STORYBOARD_WORKFLOW_KR.md](./03_STORYBOARD_WORKFLOW_KR.md) — S3 콘티 (컴파일러 입력 계약의 생산자)
- [./04_IMAGE_GEN_WORKFLOW_KR.md](./04_IMAGE_GEN_WORKFLOW_KR.md) — S4 이미지 생성
- [./05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md](./05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md) — S5 영상·음성·BGM (duration/word-timestamp의 생산자)
- [./07_UPLOAD_WORKFLOW_KR.md](./07_UPLOAD_WORKFLOW_KR.md) — S7 업로드 (챕터 마커·SRT 사이드카의 소비자)
- [../platform/08_UNIFIED_BUILDER_KR.md](../platform/08_UNIFIED_BUILDER_KR.md) — P1 통합 빌더 (검수 UI 접점)
- [../platform/11_ORCHESTRATION_KR.md](../platform/11_ORCHESTRATION_KR.md) — P4 오케스트레이션 (승인 게이트·GPU 직렬화·무인 정책 소유)
- [../platform/10_KNOWLEDGE_DB_KR.md](../platform/10_KNOWLEDGE_DB_KR.md) — P3 지식 DB (vault 스키마·동기화 이벤트)
