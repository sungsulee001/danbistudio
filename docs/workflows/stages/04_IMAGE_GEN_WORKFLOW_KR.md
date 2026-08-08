# S4. 이미지 생성 워크플로우 (콘티 → 컷별 이미지)

> Danbi Studio 영상 자동화 파이프라인 4단계. 승인된 콘티(`02-storyboard.md`)의 컷 목록을 받아
> 컷별 이미지를 생성하고, 결과를 `03-assets.md`에 기록한다.
> 상위 설계: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)

---

## 1. 목적과 범위

**목적**: 인간이 승인한 콘티의 각 컷을 "이미지 파일 + 재현 가능한 생성 파라미터 기록"으로 변환한다. 이 단계의 산출 이미지는 S5(I2V 영상 생성)의 입력이자, 상세페이지·웹페이지 등 정지 이미지 용도의 최종 산출물이기도 하다.

**범위에 포함**:
- 로컬(ComfyUI)/클라우드(Nano Banana 2, GPT Image 2) 이미지 생성 실행과 슬롯 라우팅
- 레퍼런스 유도 i2i를 통한 캐릭터·스타일 일관성 유지
- 컷 N장 배치 실행, 오류(CUDA OOM 등) 처리와 재시도
- 생성 결과의 `03-assets.md` 기록(파일 경로 + 파라미터 + 잡 ID 조인)

**범위에서 제외**:
- 컷별 이미지 프롬프트의 작성 자체 — S3 콘티 단계 소관 ([./03_STORYBOARD_WORKFLOW_KR.md](./03_STORYBOARD_WORKFLOW_KR.md))
- 이미지→영상(I2V)·음성·BGM — S5 소관 ([./05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md](./05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md))
- 이미지 검수 UI — P1 통합 빌더 소관 ([../platform/08_UNIFIED_BUILDER_KR.md](../platform/08_UNIFIED_BUILDER_KR.md)). S4는 검수 "게이트"만 정의한다.

---

## 2. 입력/출력 계약

### 2.1 입력: 승인된 콘티

- 위치: `DanbiVault/20-productions/<production_id>/02-storyboard.md`
- 전제 상태: frontmatter `status: approved` — **인간 승인 게이트를 통과한 문서만 S4가 소비한다.** [사실: 브리프 확정 결정 — 승인 게이트는 에이전트가 스스로 넘지 않음]
- S4가 소비하는 컷별 필드 [제안 — 세부 스키마는 S3 문서가 확정]:

| 필드 | 용도 |
|---|---|
| `cut_id` | 컷 식별자(생산물 내 유일). 형식은 S3 콘티 표의 `CUT-01` 연번 규약을 그대로 사용. 모든 기록의 조인 키 |
| `image_prompt` / `negative_prompt` | 생성 프롬프트(영문 권장 — §8 리스크 참조) |
| `aspect` / 해상도 | 쇼츠·릴스는 9:16 세로 기본 |
| `slot` | `local` / `cloud-nb2` / `cloud-gpti2` / `auto`(라우팅 규칙 위임) |
| `reference` | 레퍼런스 이미지 지정(파일 경로 또는 선행 컷의 `cut_id`) — 있으면 i2i 경로 |
| `text_in_image` | 이미지 안에 한글 텍스트(타이틀 카드 등) 렌더링 필요 여부 |
| `seed` | 고정값 또는 `random` |

### 2.2 출력: 이미지 파일 + 자산 대장

- **이미지 파일**: vault 밖 Danbi 출력 규약 위치 — 개발 환경 `.danbi/outputs`, Electron 패키지 `userData/outputs` [사실: COMFYUI_AUTOMATION_KR.md 기록]. 클라우드 슬롯 산출물도 **동일 규약 위치**에 저장한다 [제안]. vault에는 경로 참조만 남긴다(브리프 확정: 대용량 미디어는 vault 밖).
- **자산 대장**: `DanbiVault/20-productions/<production_id>/03-assets.md` — 컷별 레코드를 **append-only**로 추가(잡 완료→vault append 단방향 이벤트).

`03-assets.md` frontmatter [제안]:

```
production_id: 2026-07-05-heritage-sokguram
type: assets
status: draft
image_status: pending | generating | generated | approved
av_status: pending          # S5가 관리
comfyui_job_ids: []          # SQLite GenerationJob.id 목록 (조인 키)
cloud_job_ids: []            # 클라우드 요청 ID 목록
updated: 2026-07-05
```

컷별 레코드 필드(본문 표) [제안]: `cut_id`, 슬롯, 모델/워크플로우 이름+템플릿 해시, seed, steps, cfg, 해상도, denoise(i2i일 때), 레퍼런스 이미지 경로, 산출 파일 경로, `GenerationJob.id`(로컬) 또는 클라우드 요청 ID, ComfyUI `promptId`, 비용(클라우드), 생성 시각, 결과 상태(`success`/`failed`/`retried`), 채택 여부(검수 후 기입).

### 2.3 상태 전이

- `02-storyboard.md`: `approved` 유지(S4는 콘티를 수정하지 않는다).
- `03-assets.md`: 최초 생성 시 `status: draft`, `image_status: pending` → 배치 시작 시 `generating` → 전 컷 결과 기록 완료 시 `generated` → **P1 빌더에서 인간이 컷별 채택 완료 시 `approved`** (이 전이는 인간만 수행). `image_status: approved`가 S5 진입 조건이다.
- 생산물(production) 수준 상태 전이는 P4 오케스트레이션 문서 소관 ([../platform/11_ORCHESTRATION_KR.md](../platform/11_ORCHESTRATION_KR.md)).

---

## 3. 워크플로우

```
[콘티 승인(인간)] → ①파싱·라우팅 → ②준비·readiness → ③dry-run 검증
→ ④배치 실행(로컬 직렬/클라우드 병렬) → ⑤수집·기록(03-assets.md append)
→ ⑥검수 게이트(인간, P1 빌더) → S5로
```

1. **트리거**: `02-storyboard.md`가 `approved`로 전이되면 오케스트레이터(Claude Code 스킬 계층)가 S4 배치를 구성한다(vault 승인→잡 enqueue 이벤트).
2. **파싱·라우팅**: 콘티에서 컷 목록을 추출하고 컷별 슬롯을 결정한다. `slot: auto`일 때의 기본 라우팅 규칙 [제안]:
   - `text_in_image: true`(한글 타이틀 카드 등) → **GPT Image 2** (CJK 텍스트 렌더링 ~99% 정확도 [사실])
   - `reference` 지정 컷(캐릭터·스타일 일관성 필요) → **로컬 i2i**(레퍼런스 유도, §4.3)
   - 대량 B-roll·마감 여유 있는 컷 → **Nano Banana 2 Batch**(반값, 24시간 내 비동기 반환 [사실]) 또는 로컬
   - 그 외 기본 → 로컬 슬롯(비용 0) 우선, 품질 미달 시 클라우드 재생성
3. **준비**: 로컬은 ComfyUI 가동·모델 존재 확인(`/system_stats`, 향후 readiness API [사실: 설계 문서 존재, 미구현]), 레퍼런스 이미지를 `/upload/image`로 업로드. 클라우드는 API 키·쿼터·예상 비용(컷 수 × 단가) 산출 후 로그.
4. **dry-run 검증**: `POST /api/editor/comfyui-jobs`는 `execute=false`가 기본 — 외부 ComfyUI 없이 계획·payload만 검증한다 [사실]. 전체 컷의 파라미터 주입 결과를 dry-run으로 먼저 확인하고, 이상 없을 때만 `execute=true`로 옵트인한다(Danbi의 "기본 dry-run" 철학과 동일).
5. **배치 실행**: §4.4 참조. 로컬은 단일 GPU(RTX 3090)이므로 실질 직렬 실행, 클라우드는 병렬 허용.
6. **수집·기록**: 완료 이벤트마다 출력 파일 경로·`promptId`·promptLineage를 확보해 `03-assets.md`에 컷 레코드를 append하고, frontmatter의 `comfyui_job_ids`/`cloud_job_ids`를 갱신한다. `DanbiVault/log.md`에 배치 요약 1줄 append.
7. **검수 게이트(인간)**: P1 통합 빌더에서 컷별 이미지를 확인하고 채택/재생성을 지시한다. 재생성 지시는 해당 컷만 파라미터를 바꿔 ①~⑥을 재수행한다. **전 컷 채택 완료 → `image_status: approved` → S5 진입.** 에이전트는 이 전이를 대행하지 않는다.

---

## 4. 구현 기술 (코드 없이)

### 4.1 어댑터 패턴: 슬롯 계약

모든 슬롯이 따르는 공통 계약 [제안]:
- **공통 입력**: 프롬프트/네거티브, 해상도·비율, seed, (선택) 레퍼런스 이미지, 배치 옵션(우선순위, 마감 유형: 즉시/야간배치)
- **공통 출력**: 로컬 파일 경로(출력 규약 위치), 생성 파라미터 스냅샷(재현 가능해야 함), 잡 식별자, 비용·소요시간 메타, 오류 코드(재시도 가능 여부 구분)
- 슬롯 교체는 이 계약 안에서만 이뤄지며, `03-assets.md` 기록 스키마는 슬롯과 무관하게 동일하다.

**로컬 슬롯 (ComfyUI, localhost:8188)**:
- 현재 자산: `workflows/broll_i2v.json`은 이름과 달리 **SD1.5 text-to-image 정지 이미지 워크플로우(1024×576)** — 플레이스홀더 수준 [사실: JSON 직접 확인]. 품질 목표상 교체가 필요하다.
- 교체 후보 [사실: 리서치 보고서]: **Qwen-Image 2.0**(오픈 가중치 7B, 생성+편집 통합, 네이티브 2K, 이미지 내 텍스트 정확도 오픈소스 최강 — 단 영/중 중심), **FLUX.2**(오픈 체크포인트, ComfyUI 생태계 표준, 4MP). 선택 기준 [제안]: RTX 3090 24GB에서의 VRAM 적합성·생성 속도 실측 후 결정, 세로 9:16 해상도 지원 필수.
- 템플릿은 ComfyUI UI의 "Export (API Format)" JSON을 `workflows/`에 등록하고 **버전 관리 + 해시 고정**으로 다룬다 [사실: 업계 관행 + Danbi 기존 규약].

**클라우드 슬롯**:
- **Nano Banana 2** (`gemini-3.1-flash-image`): 1K 이미지당 $0.067, **Batch API 사용 시 절반 가격**(24시간 내 비동기) [사실]. 쇼츠 1편 10컷 기준 약 $0.67, 배치 시 ~$0.34. 야간 배치 생성의 1순위.
- **GPT Image 2** (`gpt-image-2`): 추론 기반 생성, 최대 4K, **CJK 포함 텍스트 렌더링 ~99%** [사실] — 한글 타이틀 카드·자막 포함 컷 전담.
- 클라우드 슬롯 호출은 Danbi 내부가 아니라 **오케스트레이션 계층에서 직접 수행**하고, 산출물 저장 위치·기록 스키마만 Danbi 규약을 따른다 [제안: Danbi의 잡 인프라는 ComfyUI 전용이므로 무리하게 편입하지 않음].

### 4.2 기존 Danbi 자산 재사용 [사실]

| 자산 | 역할 | 유의점 |
|---|---|---|
| `POST /api/editor/comfyui-jobs`(+ `/:id` GET/DELETE/retry) | 배치 큐 진입점. `execute=false` 기본(dry-run) | `DANBI_EDITOR_API_TOKEN` 게이트, ComfyUI 대상 localhost 기본 |
| `src/lib/comfyui-client.ts` | `/prompt`, `/upload/image`(레퍼런스 업로드), `/history`, `/system_stats` | — |
| `src/lib/workflow-loader.ts` | 템플릿 파라미터 주입 | **이름 기반 매칭이라 복잡 워크플로우에서 오주입 위험** — 아래 참조 |
| `src/lib/editor/comfyui-queue.ts` | 우선순위/동시성/스냅샷 영속/취소/재시도 | `queue-settings`의 `comfyuiConcurrency` 1–4 |
| 출력 규약 | `.danbi/outputs` / `userData/outputs` 복사 + preview `source`/FFmpeg `renderPath` 기록 | 경로 탈출 차단 가드 내장 |
| `comfyui-results.ts` + AI Result Review | 결과 자산화, `provider=comfyui`·`promptId`·`promptLineage` 메타 | S4 기록 스키마의 원천 |

**파라미터 주입의 한계와 개선** [사실: TOOBUSY_PINGPONG 분석 문서가 지적]: 현행 주입은 "같은 이름의 input을 찾아 치환"하는 단순 키 매칭이라, 노드가 많은 신규 템플릿(Qwen/FLUX)에서는 동명 input 전체 치환 오작동 또는 대응 input 부재 시 무시가 발생할 수 있다. 개선안은 노드 ID를 명시하는 **node-specific `ComfyUIWorkflowBindingSpec`** 등록(워크플로우 import/analyzer, P2 제안). S4 착수 시점에 analyzer가 없어도, 신규 템플릿의 프롬프트/seed/해상도/denoise 노드 ID를 **수동 바인딩 표**로 문서화해 등록하면 동일 안전성을 얻는다 [제안].

### 4.3 레퍼런스 유도 i2i — 캐릭터·스타일 일관성

- 패턴 원형은 `broll_reference_i2v.json` [사실]: 레퍼런스 이미지 로드 → 스케일 정규화 → VAE 인코드 → KSampler(denoise 0.58) → 저장. 이 구조를 교체 모델용 템플릿으로 이식한다.
- 운용 [제안]: 생산물의 **기준 레퍼런스**(주인공 캐릭터, 배경 스타일)를 첫 승인 컷 또는 vault 레퍼런스 노트에서 지정하고, 일관성이 필요한 컷은 해당 이미지를 `/upload/image`로 올린 뒤 i2i 실행. denoise는 일관성↔자유도 트레이드오프 축으로, 0.4(강한 유지)~0.65(느슨한 유도) 범위를 컷별 바인딩 파라미터로 노출한다.
- 클라우드 슬롯도 참조 이미지 입력을 지원하므로(Nano Banana 2 인물 일관성 보완 [사실: 리서치 보고서 리스크 항목]) 동일 `reference` 필드로 통일한다.

### 4.4 배치 실행·오류 처리·재시도

- **동시성**: 로컬은 `comfyuiConcurrency` 설정이 1–4까지 허용되나 [사실], 단일 GPU VRAM 경합 때문에 **1(직렬)을 기본**으로 한다 [제안, 브리프 확정 방향]. S5(I2V·BGM)와의 동시 실행도 금지 — 스테이지 간 GPU 상호 배제는 P4가 관장. 클라우드 컷은 GPU와 무관하므로 병렬 진행.
- **진행률**: 요청마다 **고유 `client_id`**로 WebSocket(`/ws`)을 구독해야 어느 이벤트가 어느 컷 것인지 구분된다 [사실]. 진행률 표시는 P2 대시보드 소관 ([../platform/09_COMFYUI_DASHBOARD_KR.md](../platform/09_COMFYUI_DASHBOARD_KR.md)).
- **CUDA OOM**: HTTP 오류가 아니라 **WebSocket `execution_error` 이벤트로 도착**한다 [사실]. 전용 핸들러가 필요하다.
- **재시도 정책** [제안]:
  1. 컷 단위 최대 2회. 1차 재시도 = 동일 파라미터(일시 오류 가정). 2차 = 해상도 한 단계 축소 또는 steps 감축(OOM 계열일 때).
  2. OOM 시 재시도 전 VRAM 해제가 필요하다. `/free`·`/interrupt`는 "사용자 명시 액션" 원칙이 확정되어 있으므로 [사실: pingpong 분석 권고], **OOM 자동 핸들러에 한해 제한적 자동 `/free`를 허용할지**는 구현 시 결정 사항(§7 open question). 허용 전까지는 "실패 마킹 후 인간에게 보고"가 폴백.
  3. 실패 컷은 `failed`로 기록하고 **배치 전체를 중단하지 않는다**. 실패 컷만 골라 재시도하는 경로는 기존 `comfyui-jobs/:id` retry POST를 사용 [사실].
  4. 클라우드 오류: 콘텐츠 필터 거부는 재시도 무익 — 프롬프트 수정 필요로 마킹하고 로컬 슬롯 폴백 제안. 쿼터/일시 오류만 지수 백오프 재시도.

### 4.5 결과 기록과 조인

- 조인 키는 브리프 확정대로 **`production_id`와 `comfyui_job_ids`(SQLite `GenerationJob.id`)** 둘뿐이다. `03-assets.md`의 컷 레코드가 파일 경로·파라미터·잡 ID를 한 줄로 묶어, "이 이미지가 어떤 프롬프트·seed·템플릿에서 나왔는가"를 vault에서 역추적 가능하게 한다(promptLineage 메타의 vault 측 대응물).
- 기록은 append-only. 재생성 시 기존 레코드를 수정하지 않고 새 레코드를 추가하며, 채택 여부 컬럼으로 최종본을 구분한다 [제안].

---

## 5. 활용 스킬 (§4 브리프 카탈로그)

| 단계 | 스킬 | 용도 |
|---|---|---|
| ②파싱·라우팅 | `gongnyang-prompt-kit`(포크 예정) | S3가 산출한 프롬프트를 이미지 모델별 문법(한국형 카테고리 포함)으로 최종 컴파일·보정 |
| 구현 착수 전 | `feature-planner`, superpowers `writing-plans` | 배치 러너·어댑터 구현 계획 수립 |
| Danbi 코드 수정 | Serena(`find_symbol` 등) | `workflow-loader` 바인딩 개선, comfyui-jobs 연계 지점 탐색 시 심볼 단위 접근 |
| 구현 | superpowers `test-driven-development`, `executing-plans` | dry-run 픽스처(`test_workflow.json` 활용) 기반 주입 검증부터 작성 |
| 오류 분석 | superpowers `systematic-debugging` | 파라미터 오주입·OOM 재현 시 |
| 문서/모델 확인 | `WebSearch`/`WebFetch` | Qwen-Image 2.0/FLUX.2 ComfyUI 노드 요구사항, 클라우드 API 스펙 최신화 |
| 완료 선언 전 | superpowers `verification-before-completion` | §7 기계 완료조건 실증 후 보고 |

---

## 6. 구현 단계 체크리스트

**선행 조건**
- [ ] S3 콘티 문서의 컷 스키마 확정(§2.1 필드가 `02-storyboard.md`에 존재) — [./03_STORYBOARD_WORKFLOW_KR.md](./03_STORYBOARD_WORKFLOW_KR.md)
- [ ] `DanbiVault/20-productions/<production_id>/` 구조와 `90-templates/`의 `03-assets.md` 템플릿 존재 — [../platform/10_KNOWLEDGE_DB_KR.md](../platform/10_KNOWLEDGE_DB_KR.md)
- [ ] ComfyUI(StabilityMatrix, localhost:8188) 가동 + 교체 대상 모델 체크포인트/커스텀 노드 설치
- [ ] Danbi 개발 서버 가동 + `DANBI_EDITOR_API_TOKEN` 설정
- [ ] 클라우드 키 준비: Gemini API 키(Nano Banana 2), OpenAI API 키(GPT Image 2) — 미발급 시 로컬 슬롯만으로 착수 가능

**작업 항목** (순서 권장)
1. [ ] **어댑터 계약 확정**: §4.1 공통 입력/출력 필드를 컷 레코드 스키마와 함께 `90-templates/03-assets.md` 템플릿에 반영. 산출물: vault 템플릿 1개.
2. [ ] **로컬 t2i 템플릿 교체**: Qwen-Image 2.0 또는 FLUX.2 워크플로우를 ComfyUI UI에서 구성(9:16 세로 해상도 포함) → API Format으로 내보내 `E:\ai_tool\Danbi_Studio\workflows\`에 신규 파일로 등록(기존 `broll_i2v.json`은 삭제하지 않고 보존). 산출물: API-format JSON 1개 + 노드 ID 수동 바인딩 표(프롬프트/네거티브/seed/steps/해상도 노드 명시, 본 문서 부속 또는 워크플로우 옆 문서로).
3. [ ] **레퍼런스 i2i 템플릿 이식**: `broll_reference_i2v.json` 패턴(로드→정규화→VAE 인코드→denoise 샘플링)을 교체 모델로 재구성, denoise를 바인딩 파라미터로 노출. 산출물: API-format JSON 1개 + 바인딩 표.
4. [ ] **주입 안전화**: 신규 템플릿 2종에 대해 이름 기반 주입의 오작동 여부를 dry-run으로 확인. 오작동 시 node-specific 바인딩(수동 표 기반) 적용 — Danbi `workflow-loader` 수정이 필요하면 Serena로 해당 심볼만 수정. 산출물: dry-run 검증 통과 기록.
5. [ ] **클라우드 어댑터 2종**: 오케스트레이션 계층(Claude Code 스킬/스크립트)에 Nano Banana 2(즉시+Batch 모드), GPT Image 2 호출 경로 구성. 산출물을 `.danbi/outputs` 규약 위치에 저장하고 비용을 레코드에 남기는지 확인. 산출물: 스킬 문서/절차 2건.
6. [ ] **배치 러너**: 승인된 콘티 파싱 → 슬롯 라우팅 → dry-run → `execute=true` 투입(고유 `client_id`) → WS/폴링 수집 → OOM 핸들러·재시도 정책(§4.4) → `03-assets.md` append + frontmatter 갱신 + `log.md` 1줄. 산출물: 오케스트레이션 계층의 S4 실행 스킬 1건.
7. [ ] **검수 연계**: `image_status: generated` 도달 시 P1 빌더(부재 시 임시로 `/ai-studio` 갤러리)에서 검수 가능함을 확인하고, 채택 결과를 `03-assets.md`에 반영하는 절차 문서화.

**검증 방법**
- [ ] 단위: `test_workflow.json` 픽스처로 파라미터 주입 dry-run이 기대 payload를 만드는지 확인
- [ ] 통합(로컬): 파일럿 콘티 3컷(t2i 2 + 레퍼런스 i2i 1)을 실제 생성 — 출력이 `.danbi/outputs`에 존재하고 `03-assets.md` 레코드의 seed·해상도로 동일 이미지가 재현되는지 확인
- [ ] 통합(클라우드): 각 슬롯 1컷씩 생성 — 비용 기록·저장 규약 준수 확인, 한글 텍스트 컷은 GPT Image 2 결과의 판독성 확인
- [ ] 장애 주입: 고의 OOM(과대 해상도)으로 `execution_error` 경로와 재시도·실패 마킹이 정책대로 동작하는지 확인
- [ ] 파일럿 1편(약 10컷) 전 구간 실행: 실패 컷이 있어도 배치가 완주하고, 전 컷 상태가 `03-assets.md`에 남는지 확인

---

## 7. 완료 조건

**기계(에이전트) 완료조건**
- 승인된 콘티의 **모든 컷**에 대해 결과 상태(`success`/`failed`+사유+재시도 이력)가 `03-assets.md`에 기록됨
- `success` 컷의 이미지 파일이 출력 규약 위치에 존재하고, 레코드에 파일 경로·생성 파라미터·`GenerationJob.id`(또는 클라우드 요청 ID)가 조인되어 있음
- frontmatter `comfyui_job_ids`/`cloud_job_ids` 갱신, `image_status: generated`, `log.md` 요약 append 완료
- 여기서 에이전트는 **멈춘다**. `image_status: approved` 전이는 수행하지 않는다.

**EXTERNAL_PENDING (사람/외부 의존)**
- `EXTERNAL_PENDING`: 인간 검수 — P1 빌더에서 컷별 이미지 채택/재생성 판정, `image_status: approved` 전이
- `EXTERNAL_PENDING`: 클라우드 계정 준비 — Gemini/OpenAI API 키 발급·결제 설정(미완 시 해당 슬롯 비활성, 로컬만 운용)
- `EXTERNAL_PENDING`: OOM 시 자동 `/free` 허용 여부에 대한 사용자 정책 결정(§4.4 — 결정 전까지 실패 마킹 폴백)

---

## 8. 리스크와 완화책

| 리스크 | 근거 | 완화책 |
|---|---|---|
| 이름 기반 파라미터 주입 오작동(동명 input 전체 치환/무시) | [사실: pingpong 분석 지적, loader 세부는 미확인 추정 포함] | dry-run 필수 관문화, 신규 템플릿은 노드 ID 수동 바인딩 표 → 장기적으로 P2 import/analyzer |
| CUDA OOM·VRAM 경합(특히 S5와 동시 실행 시) | [사실: OOM은 `execution_error` 이벤트로 도착] | 로컬 동시성 1, 스테이지 간 GPU 상호 배제(P4), 해상도 축소 재시도, 모델 언로드 전략 |
| 현행 SD1.5 플레이스홀더의 품질 한계 | [사실: JSON 확인 — 1024×576 t2i] | 파일럿 전 Qwen/FLUX 교체(체크리스트 2번), 세로 9:16 해상도 확보 |
| 캐릭터·스타일 일관성 드리프트 | [사실: 클라우드 모델 리스크로 보고됨] | 레퍼런스 i2i 기본화, denoise 범위 운용, 기준 레퍼런스를 vault에 고정 |
| 클라우드 콘텐츠 필터 거부(인물·문화유산 소재) | [사실: Nano Banana 2 리스크 항목] | 재시도 대신 프롬프트 수정 마킹 + 로컬 슬롯 폴백 |
| SynthID 등 워터마크 포함 | [추정: Gemini 이미지 정책 관행] | 채널 정책 확인 후 해당 컷은 로컬 슬롯 사용 검토 |
| 클라우드 비용 폭주 | [사실: 단가 공개 — 1K $0.067] | 배치 실행 전 예상 비용 산출·로그, Batch API(반값) 우선, 컷 수 상한 [제안] |
| ComfyUI 업데이트로 템플릿 파손 | [사실: 업계 통용 리스크] | ComfyUI 버전 고정(StabilityMatrix), 템플릿 해시 고정 + 스모크 테스트(3컷 파일럿 재실행) |
| 한글 프롬프트의 이미지 모델 성능 저하 | [추정] | S3에서 영문 프롬프트 산출 원칙, `gongnyang-prompt-kit`으로 컴파일 |

---

## 9. 관련 문서

- 마스터 보고서: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)
- 이전 단계(입력 계약 원천): [./03_STORYBOARD_WORKFLOW_KR.md](./03_STORYBOARD_WORKFLOW_KR.md)
- 다음 단계(이미지 소비자): [./05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md](./05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md)
- 검수 UI: [../platform/08_UNIFIED_BUILDER_KR.md](../platform/08_UNIFIED_BUILDER_KR.md)
- 큐/진행률/readiness 대시보드: [../platform/09_COMFYUI_DASHBOARD_KR.md](../platform/09_COMFYUI_DASHBOARD_KR.md)
- vault 스키마·동기화 이벤트: [../platform/10_KNOWLEDGE_DB_KR.md](../platform/10_KNOWLEDGE_DB_KR.md)
- 승인 게이트·스테이지 연결: [../platform/11_ORCHESTRATION_KR.md](../platform/11_ORCHESTRATION_KR.md)
- Danbi 내부 근거: `E:\ai_tool\Danbi_Studio\docs\COMFYUI_AUTOMATION_KR.md`, `docs\TOOBUSY_PINGPONG_DANBI_APPLICATION_ANALYSIS_KR.md`, `workflows\broll_i2v.json`, `workflows\broll_reference_i2v.json`
