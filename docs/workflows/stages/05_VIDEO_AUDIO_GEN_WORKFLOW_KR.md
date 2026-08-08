# S5. 영상·음성·BGM 생성 워크플로우

> Danbi Studio 영상 자동화 파이프라인 5단계. 승인된 콘티와 S4 생성 이미지를 입력으로 I2V 영상 클립, TTS 나레이션, 자막 타임스탬프, BGM을 생성하고 `03-assets.md`를 갱신한다.
> 상위 설계: [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md)

---

## 1. 목적과 범위

- **목적**: 컷별 정지 이미지(S4 산출)를 움직이는 영상 클립으로 변환(I2V)하고, 대본의 장면 블록별 나레이션 음성(TTS)·word-level 자막 타임스탬프·BGM 트랙을 생성해, S6 편집 단계가 기계적으로 소비할 수 있는 에셋 세트를 완성한다.
- **범위**: I2V 클립 생성, TTS 나레이션 생성, 자막 강제 정렬, BGM 생성, `03-assets.md` 갱신, 단일 GPU(RTX 3090) VRAM 직렬화 운용까지. **편집·타임라인 조립은 범위 밖**(S6), 이미지 생성은 범위 밖(S4).
- **이 단계가 해소하는 결손**: [사실] Danbi 저장소의 `workflows/*.json` 3종은 이름(`broll_i2v.json` 등)과 달리 전부 SD1.5 정지 이미지 워크플로우이며, **실제 영상(I2V) 워크플로우 JSON은 존재하지 않는다**(4대 결손 ②). [사실] TTS/음성 생성 자산도 조사 범위 내 확인되지 않았다(4대 결손 ③ — TTS 연동 규칙). 본 문서가 두 결손의 보충 절차를 정의한다.
- **핵심 계약**: [제안] **"음성이 시간을 지배한다"** — 장면 블록별 TTS 음성 길이가 해당 컷(들)의 duration을 확정하고, I2V 클립 길이와 S6 컴파일러의 타임라인 배치는 이 값을 따른다. 따라서 실행 순서는 반드시 TTS → 정렬 → I2V → BGM이다.

## 2. 입력/출력 계약

### 2.1 입력

| 항목 | 위치 | 조건 |
|---|---|---|
| 콘티 | `DanbiVault/20-productions/<production_id>/02-storyboard.md` | frontmatter `status: approved` (인간 승인 완료) — 컷 목록, 컷별 영상(모션) 프롬프트, 오디오 지시 포함 |
| 대본 | 같은 폴더 `01-script.md` | 장면 블록별 나레이션 텍스트(TTS 입력 원문) |
| 컷 이미지 | Danbi outputs 디렉터리(vault 밖), 경로는 `03-assets.md`의 이미지 표에 기록됨 | S4 완료 — 모든 컷의 이미지 경로 존재 |
| 목소리 레퍼런스 | `DanbiVault/10-knowledge/channels/` 하위 채널 노트가 참조하는 레퍼런스 음성 파일(vault 밖 보관, 경로 참조) | **본인 또는 서면 허락받은 목소리만** — 채널 노트에 출처·동의 기록 필수 |

### 2.2 출력

| 산출물 | 위치 | 형식(제안) |
|---|---|---|
| I2V 클립 | Danbi outputs(개발 `.danbi/outputs`, 패키지 `userData/outputs`) — [사실] 기존 comfyui-jobs 결과 복사 규약 그대로 | 컷당 1개, 콘티 명시 해상도/fps |
| TTS 나레이션 | 동일 outputs 하위 오디오 폴더 | 장면 블록당 1개 WAV |
| 자막 타임스탬프 | 동일 위치 | 장면 블록당 1개 정렬 데이터 파일(word-level 시작/끝 시각 + 텍스트) — S6 자막 트랙 입력 |
| BGM | 동일 위치 | 프로덕션당 1개 이상(무드별) |
| 에셋 대장 | `03-assets.md` 갱신 | 아래 2.3 구조 |

### 2.3 `03-assets.md` 기록 구조 [제안]

frontmatter: `production_id`, `status`, `comfyui_job_ids`(SQLite `GenerationJob.id` 배열 — 유일한 조인 키), `voice_ref`(사용한 목소리 레퍼런스와 동의 기록 링크), `duration_locked: true|false`.

본문 표(컷 단위): `cut_id` | 이미지 경로(S4) | 모션 프롬프트(정제본) | I2V 클립 경로 | **`duration_seconds`(확정값)** | 담당 장면 블록 id.
본문 표(오디오 단위): 장면 블록 id | 나레이션 WAV 경로 | 음성 길이 | 정렬 데이터 경로 | QC 결과(대본 일치율).
BGM 절: 트랙 경로 | 프롬프트/무드 태그 | 라이선스 메모(ACE-Step 1.5 = MIT, royalty-free 학습 데이터 [사실]).

### 2.4 상태 전이

- `02-storyboard.md`가 `approved`인 프로덕션만 S5 진입 가능. `draft→approved` 게이트는 인간 전용이며 에이전트는 절대 스스로 넘지 않는다(브리프 확정).
- S5의 모든 산출물이 `03-assets.md`에 기록되고 QC를 통과하면 프로덕션 `status: approved → generated` 전이. 이 전이는 S4 이미지 + S5 영상/음성/BGM이 **모두** 갖춰졌을 때만 수행한다.
- 잡 완료 → vault append는 단방향 이벤트(브리프 확정): 잡 결과를 `03-assets.md`와 `log.md`에 추가 기록만 하고, vault에서 잡을 되건드리지 않는다.

### 2.5 duration 확정 계약 — S6 컴파일러 인터페이스 [제안]

1. 장면 블록의 TTS 음성 길이 + 앞뒤 패딩(예: 0.2~0.4초, 채널 노트에서 상수로 관리)이 그 블록의 **총 재생 시간**이다.
2. 블록이 컷 여러 개에 걸치면, 콘티의 컷별 배분 비율(또는 정렬 데이터의 문장 경계)로 나눠 각 컷의 `duration_seconds`를 산출한다.
3. I2V 클립은 컷 duration **이상**으로 생성한다(프레임 수 = fps × duration 올림). 부족분이 생기면 S6에서 마지막 프레임 홀드 또는 슬로우 리타임으로 보정하되, 원칙은 생성 시점 충족이다.
4. `duration_locked: true`가 기록된 후에는 대본·콘티 수정 시 반드시 S5를 해당 블록부터 재실행한다(부분 재생성).

## 3. 워크플로우

승인 게이트 표기: 🚪 = 인간 개입 지점.

- **0단계 — 선행 검증(기계)**: 콘티 `approved` 확인, S4 이미지 전수 존재 확인, ComfyUI readiness 확인([사실] `/system_stats`·`/object_info` 기반 readiness API가 설계 문서에 존재, 미구현 — 구현 전에는 수동 확인), 목소리 레퍼런스의 동의 기록 존재 확인(없으면 즉시 중단).
- **1단계 — TTS 나레이션 생성(기계)**: `01-script.md`의 장면 블록별 텍스트를 Fun-CosyVoice 3.0에 투입, 채널 페르소나 목소리(제로샷 클로닝)로 블록당 WAV 1개 생성. 숫자·한자어 읽기 오류 대비 발음 표기 전처리 규칙(채널 노트 관리)을 적용한다. [제안]
- **2단계 — 정렬·QC(기계)**: SenseVoice-Small로 각 WAV를 인식해 (a) 대본 텍스트와 일치율 검사(QC — 임계값 미달 블록은 재생성 또는 플래그), (b) 대본 원문 기준 강제 정렬로 word-level 타임스탬프를 추출해 정렬 데이터 파일로 저장. [사실: SenseVoice-Small은 Apache-2.0, 비자기회귀 구조로 10초 오디오를 70ms에 처리, 한국어 고정밀 5개 언어 포함 / 강제 정렬 파이프라인 구성은 제안]
- **3단계 — duration 확정(기계)**: §2.5 규칙으로 컷별 `duration_seconds` 산출, `03-assets.md`에 기록하고 `duration_locked: true`.
- **🚪 3.5단계 — 음성 검수(인간, 권장)**: 사용자가 나레이션을 청취해 발음·톤 확인. 파이프라인은 여기서 멈추지 않고 진행할 수 있으나(기계 QC 통과 시), 최종 `generated` 전이 전 인간 확인을 완료 조건의 EXTERNAL_PENDING으로 남긴다. [제안]
- **4단계 — I2V 클립 생성(기계)**: 컷별로 vibe-creating-skill로 정제한 모션 프롬프트 + S4 이미지 + 확정 duration을 WAN 2.1 I2V 워크플로우 템플릿에 주입해 ComfyUI 큐에 등록. 진행률은 WebSocket으로 추적, OOM은 `execution_error` 이벤트로 수신해 재시도 핸들러 처리. [사실: ComfyUI API 구조 / 워크플로우 자체는 신규 제작 대상]
- **5단계 — BGM 생성(기계)**: WAN 모델 언로드(`/free`) 후 ACE-Step 1.5 워크플로우로 콘티의 무드 지시에 맞는 트랙 생성. 총 재생 시간 합계보다 긴 길이로 생성해 S6에서 컷 조정. [사실: ACE-Step 1.5는 MIT, ComfyUI 네이티브 노드, RTX 3090에서 곡당 10초 미만]
- **6단계 — 기록·전이(기계)**: 모든 산출물 경로·잡 id를 `03-assets.md`에 기록, `log.md`에 append, 프로덕션 `status: generated`. AI Result Review 패널([사실] 기존 구현)로 원본 이미지 대 I2V 결과 비교 검토 가능 상태로 정리.

실패 처리: 컷/블록 단위 부분 재실행이 기본. [사실] 기존 comfyui-jobs는 job 단위 retry를 지원하며, "실패 하위 클립만 재시도"는 문서에 명시된 남은 확장 항목이다.

## 4. 구현 기술 (코드 없음 — 구조·계약·도구)

### 4.1 I2V — WAN 2.1 워크플로우 신규 제작·등록 절차 [제안, 4대 결손 ② 보충]

1. **제작**: ComfyUI UI에서 WAN 2.1 I2V(14B 또는 VRAM 여유에 따라 양자화 변형) 워크플로우를 수동 구성 — 입력 이미지 로드 → 모션 프롬프트(±) → I2V 샘플러 → 비디오 인코딩/저장 노드. 해상도·fps는 쇼츠 기준(9:16, 콘티 명시값)으로 고정 슬롯화.
2. **내보내기**: "Export (API Format)"으로 JSON 추출 — [사실] 이 API-format JSON을 버전 관리 대상 템플릿(배포 단위)으로 취급하는 것이 업계 표준 관행(diff/롤백/해시 고정).
3. **등록**: `workflows/wan_i2v.json`으로 저장소에 추가. 치환 대상 입력(이미지 파일명, 프롬프트 텍스트, 네거티브, seed, 프레임 수, fps)을 노드 id 기준으로 명세한 바인딩 문서를 함께 둔다. [사실] 현행 `workflow-loader.ts`의 파라미터 주입은 **이름 기반 전체 치환이라 복잡 워크플로우에서 취약** — pingpong 분석 문서의 P2 "workflow import/analyzer + node-specific `ComfyUIWorkflowBindingSpec`" 구현이 이 등록을 안전하게 만든다(선행 권장, 필수는 아님).
4. **프레임 수 계약**: `duration_seconds`는 [사실] 현재 타임라인 배치용 메타일 뿐 워크플로우 내부에서 소비되지 않는다 → [제안] 주입 계층에서 `프레임 수 = ceil(fps × duration_seconds)`로 환산해 WAN 노드의 길이 입력에 넣는 변환 규칙을 명문화한다.
5. **스모크 테스트**: 대표 이미지 1장 + 고정 seed로 기준 클립을 생성해 결과 해시·길이를 기록(ComfyUI 버전 업데이트 시 템플릿 파손 감지용 기준선).

모션 프롬프트 정제: 콘티의 컷별 영상 프롬프트(한국어 지시)를 vibe-creating-skill로 WAN에 적합한 카메라 워크·모션 어휘로 변환하고, 정제 전/후 텍스트를 `03-assets.md`에 모두 기록해 회고(S7)에서 프롬프트 자산화한다. [제안]

### 4.2 TTS — Fun-CosyVoice 3.0

- [사실] Fun-CosyVoice3-0.5B-2512: LLM 기반 제로샷 TTS, 한국어 포함 9개 언어, 제로샷 음성 클로닝·스트리밍 지원, CER 0.81%. 저장소 Apache-2.0(가중치 상업 이용은 HF 모델 카드 최종 확인 권장).
- [사실] Danbi에는 TTS 자산이 없으므로 신규 연동. [제안] ComfyUI 바깥의 **별도 로컬 TTS 서비스**(상주 또는 온디맨드 프로세스)로 두고, Danbi 혹은 오케스트레이터(Claude Code 스킬)가 "텍스트+레퍼런스 음성 → WAV" 계약으로 호출한다. 0.5B 모델이라 VRAM 부담이 작아 ComfyUI 미가동 구간(1~3단계)에 GPU를 짧게 점유하거나 CPU로도 운용 가능.
- 페르소나 관리 [제안]: 채널당 레퍼런스 음성 1세트를 채널 노트에 등록(파일 경로 + 취득 경위 + 동의 문서 링크). **동의 기록 없는 레퍼런스는 0단계에서 하드 블록.**

### 4.3 자막 정렬 — SenseVoice-Small

- [사실] Apache-2.0, ONNX/LibTorch/GGUF(q8 약 254MB, CPU 단독 실행 가능) 배포 옵션 → GPU 경합 없이 CPU에서 정렬 수행 가능.
- [제안] 이중 용도: ① QC — 인식 결과와 대본 텍스트의 편집 거리 기반 일치율로 TTS 오독 검출, ② 강제 정렬 — 대본 원문을 기준 텍스트로 word-level 시작/끝 타임스탬프 산출. 산출 형식은 S6 컴파일러·자막 트랙이 바로 읽는 단일 규격(블록 id, 단어, 시작, 끝)으로 고정하고 [../platform/11_ORCHESTRATION_KR.md](../platform/11_ORCHESTRATION_KR.md)의 데이터 계약 절과 일치시킨다.

### 4.4 BGM — ACE-Step 1.5 (+ MIDI 부가 전략)

- [사실] MIT + royalty-free 학습 데이터 명시 → 유튜브 수익화 리스크 최소. 2B 모델 VRAM 4GB 미만, ComfyUI 네이티브 노드 공식 지원, RTX 3090에서 곡당 10초 미만.
- [제안] 콘티 오디오 지시(무드/템포/악기)를 프롬프트 템플릿으로 변환해 ComfyUI ACE-Step 워크플로우(별도 API-format JSON, `workflows/ace_bgm.json`으로 등록)로 실행. 인트로/아웃트로 구조 제어 한계는 [사실]이므로 편집 단계 컷 조정 전제.
- MIDI 전략(부가 옵션) [제안]: 사용자가 메모해 둔 MuseScore(악보)·Lakh MIDI(데이터셋)·Basic Pitch(오디오→MIDI 변환) 경로는 ACE-Step 결과가 채널 무드와 맞지 않을 때의 대안 소재 파이프라인으로만 유지한다. 기본 경로는 ACE-Step 단독이며, MIDI 경로는 본 단계의 완료 조건에 포함하지 않는다.

### 4.5 VRAM 직렬화와 큐 운용 [제안 — 근거는 사실 표기]

단일 RTX 3090(24GB)에서의 실행 순서와 점유 전략:

| 순서 | 작업 | 실행처 | VRAM | 근거/비고 |
|---|---|---|---|---|
| 1 | TTS(전 블록) | 로컬 TTS 서비스 | 수 GB [추정] | ComfyUI 유휴 구간에 수행 |
| 2 | 정렬/QC | CPU(GGUF/ONNX) | 0 | [사실] CPU 단독 가능 |
| 3 | I2V(컷 순차) | ComfyUI | 최대(WAN) | `comfyuiConcurrency=1` 고정 |
| 4 | 모델 언로드 | ComfyUI `/free` | — | [사실] `/free`·`/interrupt`는 P1 설계 존재, "사용자 명시 액션" 원칙 → 자동화 시 잡 러너의 명시적 단계로 호출 |
| 5 | BGM | ComfyUI(ACE-Step) | <4GB | [사실] |

- [사실] 기존 큐 자산 재사용: `queue-settings`(동시성 1–4, 우선순위 −100~100), comfyui-jobs의 priority/취소/재시도/스냅샷. [제안] S5 동안 동시성 1 고정, 우선순위는 I2V > BGM으로 부여하고, S4 이미지 배치와 S5가 겹치지 않도록 오케스트레이터가 프로덕션 단위로 직렬 스케줄링한다.
- [사실] CUDA OOM은 HTTP 오류가 아닌 WebSocket `execution_error` 이벤트로 도착 → [제안] OOM 수신 시 `/free` 호출 후 1회 재시도, 재실패 시 잡을 실패 마킹하고 해상도/프레임 수 하향 제안을 로그에 남기는 규칙을 잡 러너에 명세.
- [사실] 요청마다 고유 `client_id`를 부여해야 WebSocket 이벤트를 잡별로 구분할 수 있다.

### 4.6 Danbi 연계 지점

- 실행 진입점: [사실] `POST /api/editor/comfyui-jobs`(dry-run 기본, `execute=true`로 실제 큐잉, `promptIds` 기록) 또는 `POST /api/generate`. 출력은 `.danbi/outputs`/`userData/outputs`로 복사되고 preview `source`·FFmpeg `renderPath`가 result snapshot에 기록됨 → S6 미디어 반입이 이 경로를 그대로 소비.
- 결과 메타데이터: [사실] 결과 asset에 `provider=comfyui`, `sourceClipId`, `automationJobId`, `promptId`, `promptLineage` 기록 → `03-assets.md`의 `comfyui_job_ids` 조인 키와 연결.
- 진행률/진단: readiness API·WS 진행률·`/view` fallback은 [사실] 설계 문서(P1)만 존재하고 미구현 — 대시보드([../platform/09_COMFYUI_DASHBOARD_KR.md](../platform/09_COMFYUI_DASHBOARD_KR.md))와 공용 구현.
- 보안 경계 준수: [사실] ComfyUI 대상 localhost 기본, 출력 경로 탈출 차단, `DANBI_EDITOR_API_TOKEN` 게이트 — TTS 서비스 등 신규 연동도 동일 원칙 적용. [제안]

## 5. 활용 스킬 (브리프 §4 카탈로그)

| 단계 | 스킬 | 용도 |
|---|---|---|
| 4단계(I2V) | `vibe-creating-skill`(포크 예정, MIT) | 콘티 영상 지시 → WAN용 모션/카메라 프롬프트 정제 |
| 워크플로우 제작·등록(§4.1) | `feature-planner`, `superpowers:writing-plans` | WAN/ACE-Step 워크플로우 등록 + 바인딩 명세 작업 계획 수립 |
| 잡 러너·TTS 연동 구현 | `superpowers:test-driven-development`, `superpowers:subagent-driven-development` | duration 환산·OOM 재시도 등 규칙 로직의 테스트 우선 구현 |
| 장애 분석 | `superpowers:systematic-debugging` | `execution_error`/정렬 불일치 등 재현·격리 |
| 완료 검증 | `superpowers:verification-before-completion` | §7 기계 완료조건 실증 후 `generated` 전이 |
| Danbi 코드 수정 | Serena(내장) | comfyui-jobs/workflow-loader 연계 심볼 탐색 |

## 6. 구현 단계 체크리스트 (착수 가능 수준)

**A. WAN 2.1 I2V 워크플로우 제작·등록** — 4대 결손 ②
- 선행: ComfyUI(localhost:8188, StabilityMatrix 관리)에 WAN 2.1 모델·필요 custom node 설치, VRAM 프로파일 확인.
- 작업: ① UI에서 I2V 그래프 구성(9:16, 콘티 표준 fps) ② API-format으로 내보내 `E:\ai_tool\Danbi_Studio\workflows\wan_i2v.json` 저장 ③ 치환 입력(이미지·프롬프트·네거티브·seed·프레임 수·fps)의 노드 id 바인딩 명세를 본 폴더에 `05A_WAN_I2V_BINDING_KR.md` 등 부속 문서로 기록 ④ `duration_seconds→프레임 수` 환산 규칙을 주입 계층 요구사항으로 명세.
- 검증: 고정 seed 스모크 테스트로 기준 클립 생성 — 길이가 지정 duration 이상인지, `comfyui-jobs` dry-run이 payload를 통과시키는지, `execute=true` 실행 후 outputs 복사·`renderPath` 기록이 되는지 확인.

**B. TTS 서비스 연동** — 4대 결손 ③
- 선행: Fun-CosyVoice3-0.5B-2512 가중치 확보(HF 모델 카드에서 상업 이용 조건 최종 확인), 채널 레퍼런스 음성 + 동의 기록 등록.
- 작업: ① "장면 블록 텍스트 + 레퍼런스 → WAV + 길이(초)" 계약의 로컬 서비스 구성 ② 발음 전처리 규칙 표 초안(숫자/한자어/고유명사)을 채널 노트에 생성 ③ §2.5 duration 확정 규칙(패딩 상수, 다중 컷 배분)을 잡 러너 명세로 문서화.
- 검증: 실제 대본 1편으로 전 블록 WAV 생성 → 한국어 청취 확인, 길이 값이 `03-assets.md`에 기록되고 `duration_locked`가 세팅되는지 확인.

**C. SenseVoice 정렬·QC**
- 선행: SenseVoice-Small(GGUF 또는 ONNX) 준비 — CPU 실행 확인.
- 작업: ① WAV+대본 → word-level 정렬 데이터 산출 흐름 구성 ② 일치율 QC 임계값과 미달 시 재생성/플래그 규칙 정의 ③ 정렬 데이터 규격을 S6 문서의 자막 트랙 입력 규격과 동일하게 합의.
- 검증: B의 산출 WAV로 정렬 실행 → 타임스탬프가 음성 길이 범위 내이고 단어 누락이 없는지, 고의로 틀린 대본을 넣었을 때 QC가 미달 판정하는지 확인.

**D. ACE-Step BGM 워크플로우 등록**
- 선행: ComfyUI에 ACE-Step 1.5 네이티브 노드·모델 준비.
- 작업: ① BGM용 API-format JSON을 `workflows/ace_bgm.json`으로 등록 ② 콘티 오디오 지시 → 프롬프트 템플릿 매핑 규칙 문서화 ③ 트랙 라이선스 메모(MIT) 자동 기재 규칙.
- 검증: 3090에서 생성 시간 10초 내외인지 실측, 총 재생 시간보다 긴 트랙이 나오는지, outputs 복사가 되는지 확인.

**E. VRAM 직렬화 잡 러너 규칙**
- 선행: A~D 개별 검증 완료.
- 작업: ① TTS→정렬→I2V→`/free`→BGM 순서를 오케스트레이터(Claude Code 스킬)의 단계 정의로 명세 ② `comfyuiConcurrency=1`·우선순위 정책 ③ OOM(`execution_error`) 재시도 규칙 ④ 잡 완료→vault append 이벤트로 `03-assets.md`·`log.md` 갱신.
- 검증: 실제 프로덕션 1편 전체를 통과시키는 종단 리허설 — 순서 위반·VRAM OOM 없이 완주하고 `status: generated`까지 전이되는지 확인.

## 7. 완료 조건

**기계(에이전트) 완료조건**
- [ ] `workflows/wan_i2v.json`·`workflows/ace_bgm.json`이 저장소에 등록되고 바인딩 명세 문서 존재
- [ ] 전 컷 I2V 클립이 확정 `duration_seconds` 이상 길이로 생성되어 outputs에 존재
- [ ] 전 장면 블록의 TTS WAV + word-level 정렬 데이터 생성, QC 일치율 임계값 통과
- [ ] BGM 1트랙 이상 생성(총 재생 시간 초과 길이)
- [ ] `03-assets.md`에 전 산출물 경로·`comfyui_job_ids`·`duration_locked: true` 기록, `log.md` append
- [ ] 프로덕션 frontmatter `status: generated` 전이

**EXTERNAL_PENDING (외부/인간 의존 — 여기서 멈춘다)**
- [ ] `EXTERNAL_PENDING` 인간 청취 검수: 나레이션 발음·톤, 목소리 페르소나 적합성 확인(3.5단계)
- [ ] `EXTERNAL_PENDING` 인간 시각 검수: I2V 클립 모션 품질·아티팩트 확인(AI Result Review 패널)
- [ ] `EXTERNAL_PENDING` Fun-CosyVoice 3.0 가중치 상업 이용 조건의 HF 모델 카드 최종 확인(사용자 판단 기록)
- [ ] `EXTERNAL_PENDING` 목소리 레퍼런스 동의 기록 확보(본인 목소리 외 사용 시)

## 8. 리스크와 완화책

| 리스크 | 성격 | 완화책 |
|---|---|---|
| WAN 2.1이 3090 24GB에서 목표 해상도/길이를 못 버팀 | [추정] | 양자화 변형·해상도 하향 슬롯을 워크플로우 변형판으로 병행 등록, OOM 시 하향 재시도 규칙(§4.5) |
| 이름 기반 파라미터 주입이 WAN 그래프에서 오작동 | [사실 — pingpong 문서 지적] | 바인딩 명세 문서 + P2 import/analyzer 구현 시 node-specific 바인딩으로 이관 |
| CosyVoice 한국어 운율 부자연 | [추정 — 실측 필요] | 블록 단위 재생성 용이 구조, 발음 전처리 표 축적, 임계 미달 시 클라우드 TTS 폴백 슬롯(어댑터 패턴) |
| 가중치 라이선스 불확실(CosyVoice) | [사실 — GitHub 이슈 존재] | EXTERNAL_PENDING으로 배포 전 확인 강제, 확인 결과를 vault에 기록 |
| ComfyUI 업데이트로 템플릿 파손 | [사실 — 관행상 알려진 리스크] | ComfyUI 버전 고정(StabilityMatrix), 고정 seed 스모크 테스트를 회귀 기준선으로 유지 |
| duration 확정 후 대본 수정으로 정합성 붕괴 | [제안 단계 리스크] | `duration_locked` 플래그 + 해당 블록부터 부분 재실행 규칙(§2.5-4) |
| ACE-Step 곡 구조 제어 한계 | [사실] | 여유 길이 생성 + S6 컷 조정 전제, 무드 불일치 시 MIDI 부가 전략 폴백 |
| 음성 클로닝 권리 침해 | 정책 | 동의 기록 없는 레퍼런스 하드 블록(0단계), 채널 노트에 출처 상시 기록 |

## 9. 관련 문서

- [../00_MASTER_PIPELINE_REPORT_KR.md](../00_MASTER_PIPELINE_REPORT_KR.md) — 파이프라인 전체 설계
- [./04_IMAGE_GEN_WORKFLOW_KR.md](./04_IMAGE_GEN_WORKFLOW_KR.md) — 선행 단계(컷 이미지 생성, ComfyUI 실행 규약 공유)
- [./06_EDITING_WORKFLOW_KR.md](./06_EDITING_WORKFLOW_KR.md) — 후속 단계(duration 계약·정렬 데이터·renderPath 소비자)
- [./03_STORYBOARD_WORKFLOW_KR.md](./03_STORYBOARD_WORKFLOW_KR.md) — 입력 문서(컷별 영상 프롬프트·오디오 지시 규격)
- [../platform/09_COMFYUI_DASHBOARD_KR.md](../platform/09_COMFYUI_DASHBOARD_KR.md) — readiness/진행률/`/free` UI 공용 구현
- [../platform/11_ORCHESTRATION_KR.md](../platform/11_ORCHESTRATION_KR.md) — 단계 연결·직렬 스케줄링·승인 게이트
- [../platform/10_KNOWLEDGE_DB_KR.md](../platform/10_KNOWLEDGE_DB_KR.md) — vault 구조·조인 키·단방향 동기화
