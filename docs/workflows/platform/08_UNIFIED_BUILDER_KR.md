# P1. 통합 빌더 — 콘티·이미지·동영상 한 화면 제어 UI

> 파이프라인 위치: 플랫폼 계층(P1). S3(콘티)~S5(영상·음성 생성) 구간을 사람이 한 화면에서 검수·제어하는 조종석.
> 상위 설계: [마스터 보고서](../00_MASTER_PIPELINE_REPORT_KR.md) · 공용 브리프 §2, §3의 확정 결정을 따른다.

---

## 1. 목적과 범위

### 목적

사용자 명시 요구 "콘티·이미지·동영상을 한 화면에서 제어할 수 있는 빌더"를 충족한다. 현재 파이프라인에서 S3~S5 구간의 인간 개입(프롬프트 확인·수정, 생성 실행, 후보 비교, 승인/반려)은 vault 마크다운 직접 편집 + `/ai-studio` + `/automation` 세 곳에 흩어져 있다. 통합 빌더는 이 세 접점을 **production(작품) 단위 컷 중심 뷰** 하나로 묶어, "컷을 보고 → 프롬프트를 고치고 → 생성하고 → 비교하고 → 승인한다"는 루프를 화면 이동 없이 완결시킨다.

### 형태 결정 [제안]

**Danbi Studio 내 신규 페이지(예: `/builder`)로 구현한다.** 별도 앱이 아닌 내장 페이지를 택하는 근거:

1. **API 재사용** — 생성 실행(`POST /api/generate`, `POST /api/editor/comfyui-jobs`), 큐 조회(`GET /api/editor/comfyui-jobs`), 큐 설정(`/api/editor/queue-settings`), 자동화 계획(`POST /api/editor/automation`)이 이미 구현·문서화되어 있다[사실]. 별도 앱이면 CORS·토큰 배포·버전 정합 문제를 새로 떠안는다.
2. **보안 경계 재사용** — `DANBI_EDITOR_API_TOKEN` 게이트, ComfyUI localhost-only 기본값, 출력 경로 탈출 차단이 확정 경계로 존재한다[사실]. 내장 페이지는 이 경계 안에서 동작하므로 새 공격 표면이 생기지 않는다.
3. **UI 자산 재사용** — AI Result Review의 원본/결과 side-by-side 비교와 undo 가능한 교체 모드, Inspector의 ComfyUI Binding 패널(클립별 preset/prompt/seed/steps/CFG/해상도 undo 가능 저장), 에디터의 3열 레이아웃(Asset Bay / Edit Workspace / Inspector dock) 선례가 모두 기존 코드베이스에 있다[사실].
4. **파일 접근** — Danbi는 Electron 앱이므로 Obsidian vault 마크다운을 로컬 파일로 직접 읽고 쓸 수 있다[사실: Electron+Next.js 스택]. 별도 웹앱이면 파일 브리지를 새로 만들어야 한다.
5. **기존 `/ai-studio`·`/automation`과의 관계** [제안] — 두 페이지는 워크플로우/큐/훅 관리라는 "인프라 뷰"로 유지하고, `/builder`는 production 컷 중심의 "제작 뷰"로 분리한다. 같은 API를 다른 각도에서 소비할 뿐 기능 중복이 아니다.

### 범위

- **포함**: 컷 카드 리스트(콘티 텍스트+상태), 컷별 프리뷰·후보 비교, 프롬프트/파라미터 인스펙터, 이미지·영상 생성 실행과 재생성, 승인/반려, 일괄 액션, `02-storyboard.md`·`03-assets.md` 갱신, S6 핸드오프.
- **제외**: 콘티 자체의 창작(S3 담당), TTS/BGM 생성 제어(S5 담당 — 빌더는 컷의 오디오 지시 텍스트를 읽기 전용 표시만), 타임라인 편집(S6/에디터 담당), 큐 인프라 관리(P2 대시보드 담당), 업로드(S7 담당).

---

## 2. 입력/출력 계약

### 입력

| 소스 | 위치 | 내용 |
|---|---|---|
| 콘티 문서 | `DanbiVault/20-productions/<production_id>/02-storyboard.md` | 컷 목록, 컷별 이미지/영상 프롬프트, 오디오 지시. frontmatter `status`가 `approved` 이상일 때만 생성 액션 활성화 |
| 에셋 대장 | `DanbiVault/20-productions/<production_id>/03-assets.md` | 컷별 생성 산출물 기록(파일 경로, `comfyui_job_ids`, 채택/승인 상태) |
| 잡 상태 | `GET /api/editor/comfyui-jobs` (Prisma SQLite) [사실] | status/progress/priority/promptIds/warnings 스냅샷 |
| 미디어 | Danbi outputs 디렉터리(`.danbi/outputs` 또는 Electron `userData/outputs`) [사실] | result snapshot의 preview용 `source`와 FFmpeg용 `renderPath` |

### 출력

| 대상 | 내용 |
|---|---|
| `02-storyboard.md` | 인스펙터에서 수정한 컷별 프롬프트·파라미터를 본문 컷 섹션에 반영(빌더 = vault 문서의 편집 UI) |
| `03-assets.md` | 생성 완료·후보 채택·승인/반려 결과를 컷별로 기록. frontmatter `comfyui_job_ids`에 잡 ID 누적 |
| SQLite 잡 큐 | `POST /api/editor/comfyui-jobs`(dry-run 검증 후 `execute=true`)로 신규 생성 잡 enqueue [사실: API 존재] |
| S6 트리거 | 전 컷 승인 시 `03-assets.md` frontmatter `status: generated` 전이 → 콘티→EditorProject 컴파일러 입력 준비 완료 신호 |

### 데이터 역할 분리 [제안 — 브리프 §2.2 이중 구조의 적용]

- **SQLite = 잡 실행 상태의 원천**(진행률, promptId, 재시도). 빌더는 조회만 하고 API로만 조작한다.
- **vault = 창작·승인 상태의 원천**(프롬프트 텍스트, 채택 결과, 승인 여부). 빌더는 사람이 조작하는 편집 UI이므로 vault 직접 쓰기가 허용된다(에이전트의 단방향 동기화 2종과 별개 — 사람의 편집은 Obsidian에서 고치는 것과 동격).
- 조인 키는 `production_id`와 `comfyui_job_ids` 둘뿐. 빌더는 제3의 저장소를 만들지 않는다.

### 컷 상태 머신 [제안]

문서 단위 `status`(브리프 확정: `draft → approved → generated → edited → published`)와 별개로, **컷 단위** 상태를 `03-assets.md`의 컷별 레코드에 기록한다:

```
storyboard_only(콘티만)
  → image_queued(이미지 대기) → image_ready(이미지 완료)
  → video_queued(영상 대기)   → video_ready(영상 완료)
  → approved(승인) | rejected(반려)
rejected → (프롬프트 수정) → image_queued 또는 video_queued 로 복귀
```

- 상태 전진은 잡 완료 이벤트(SQLite 조회)로, `approved/rejected`는 오직 빌더의 인간 클릭으로만 일어난다.
- 컷별 상태 필드 후보(컷 레코드): `cut_id`, `cut_status`(위 값), `image_asset`(경로), `video_asset`(경로), `adopted_candidate`(채택 후보 식별자), `comfyui_job_ids`(누적), `rejected_reason`(반려 사유, 재생성 프롬프트 개선 입력).
- 문서 상태 연동: 모든 컷이 `approved`이면 빌더가 `03-assets.md`의 `status`를 `generated`로 전이할 수 있다(버튼 = 인간 액션). 이 전이가 S6 진입 신호다.
- 필드명·컷 레코드 표기는 S3/S4/S5 문서와 vault `CLAUDE.md` 스키마에서 최종 합의한다(아래 미결 사항).

---

## 3. 워크플로우

승인 게이트 원칙: `draft→approved`(콘티 승인)와 컷 `approved/rejected`는 **인간 전용**. 빌더는 사람이 누르는 UI이므로 게이트의 정당한 실행 지점이다. 에이전트가 빌더 API를 호출해 승인을 대행하는 것은 금지(브리프 §2.5).

1. **진입** — production 선택기에서 `20-productions/` 하위 폴더 목록 중 하나를 연다. `02-storyboard.md`의 `status`가 `draft`면 읽기 전용 배지(생성 버튼 비활성)로 표시한다. ▶ *게이트: 콘티 승인(S3)은 빌더 밖에서 이미 끝났어야 함.*
2. **로드·조인** — `02-storyboard.md`를 파싱해 컷 카드를 만들고, `03-assets.md`의 컷 레코드 + `GET /api/editor/comfyui-jobs` 스냅샷을 `comfyui_job_ids`로 조인해 각 카드에 상태 배지(콘티만/이미지 대기/이미지 완료/영상 대기/영상 완료/승인/반려)와 진행률을 붙인다.
3. **컷 검토·프롬프트 편집** — 컷 카드를 선택하면 중앙에 프리뷰, 우측 인스펙터에 이미지/영상 프롬프트·파라미터(seed, steps, CFG, 해상도, 워크플로우 preset)가 뜬다. 수정 내용은 저장 시 `02-storyboard.md` 해당 컷 섹션에 기록된다.
4. **이미지 생성** — 단일 컷 또는 선택 컷들에 대해 생성 실행. 내부적으로 dry-run(`execute=false`)으로 payload를 검증[사실: API 기본 동작]한 뒤 `execute=true`로 큐잉하고, 카드 상태를 `image_queued`로 전이한다. 진행률은 초기엔 잡 스냅샷 폴링, P2의 WebSocket 진행률(설계 존재, 미구현[사실])이 완성되면 실시간 표시로 교체.
5. **후보 비교·채택** — 잡 완료 시 중앙 프리뷰가 후보들을 side-by-side로 배열한다(AI Result Review 패턴 재사용[사실]). 사람이 후보 하나를 채택하면 `03-assets.md` 컷 레코드에 경로·잡 ID가 기록되고 상태가 `image_ready`로 전이한다.
6. **영상 생성** — 채택 이미지를 입력으로 I2V 잡을 큐잉(`video_queued`). **의존성**: 실제 I2V 워크플로우 JSON은 현재 리포지토리에 없다[사실 — 4대 결손 ②]. 결손 ② 해소 전까지 영상 열은 비활성 상태로 출시하고 이미지 루프만 제공한다 [제안].
7. **승인/반려** — 컷의 최종 산출물(이미지 또는 영상)을 보고 사람이 승인 또는 반려한다. ▶ *게이트: 인간 전용.* 반려 시 사유를 적으면 인스펙터가 프롬프트 수정 화면으로 이동해 4~7을 반복한다.
8. **일괄 액션** — (a) 선택/전체 컷 재생성(실행 전 dry-run 결과와 예상 잡 수를 확인 다이얼로그로 표시), (b) "승인된 컷만 S6로": 전 컷 승인 확인 → `03-assets.md` `status: generated` 전이 → [S6 편집 워크플로우](../stages/06_EDITING_WORKFLOW_KR.md)의 콘티→EditorProject 컴파일러가 이 문서를 입력으로 소비한다.

### 화면 레이아웃 [제안]

에디터가 이미 검증한 3열 구조(Asset Bay / Edit Workspace / Inspector dock)[사실]를 빌더 문맥으로 번안한다:

| 열 | 내용 |
|---|---|
| 좌: 컷 카드 리스트 | 컷 번호, 콘티 텍스트 요약, 상태 배지, 진행률 바, 다중 선택 체크박스. 상단에 production 선택기와 문서 상태 배지 |
| 중: 프리뷰 | 선택 컷의 채택 산출물 크게 표시. 후보 비교 모드에서는 side-by-side 격자(AI Result Review 패턴). 이미지↔영상 탭 전환, 영상은 인라인 재생 |
| 우: 인스펙터 | 이미지 프롬프트/영상 프롬프트/오디오 지시(읽기 전용) 편집기, 파라미터(seed·steps·CFG·해상도·workflow preset), 생성/재생성 버튼, 승인/반려 버튼, 잡 이력(`promptLineage` 메타데이터[사실] 표시) |

각 열(panel)에 개별 error boundary를 두어 한 패널의 렌더 오류가 화면 전체를 죽이지 않게 한다 — OpenReel 분석의 흡수 권고 패턴[사실]. ComfyUI 화면이나 에디터 뷰를 빌더 안에 iframe으로 임베드해야 하는 경우가 생기면, iframe을 재로딩하지 않는 postMessage 브리지 패턴[사실: 동일 분석의 흡수 권고]을 적용한다.

---

## 4. 구현 기술 (코드 없이)

- **호스트**: Next.js 신규 라우트 `/builder`(Danbi Studio 앱 내). 페이지 셸 + 3개 패널 컴포넌트 + production 선택기.
- **vault I/O**: Electron main 프로세스의 로컬 파일 접근으로 `DanbiVault/20-productions/` 마크다운을 읽고 쓴다. frontmatter(YAML) 파싱·직렬화와 컷 섹션 단위의 부분 갱신 규칙이 필요하다. 쓰기 전 파일 수정시각 비교로 외부 편집(Obsidian, 에이전트) 충돌을 감지하고 재로드를 유도한다 [제안].
- **잡 실행·조회**: 기존 `POST /api/editor/comfyui-jobs`(dry-run→execute), `GET`(스냅샷), job별 GET/DELETE/retry POST, `GET/PUT /api/editor/queue-settings`[사실]. 컷 프롬프트→잡 payload 변환은 `POST /api/editor/automation`의 계획 생성 계약(workflowName, parameters{prompt, steps, fps, duration_seconds}) [사실]을 따르되, 빌더는 클립이 아닌 컷을 단위로 쓰므로 컷→payload 매핑 규칙을 새로 정의한다.
- **워크플로우**: 이미지 = `workflows/broll_i2v.json`(실체는 SD1.5 t2i[사실])·`broll_reference_i2v.json`(레퍼런스 i2i[사실])에서 출발, 상위 모델 워크플로우로 교체 예정. 영상 = 결손 ②(WAN 2.1 등 I2V JSON 제작·등록) 완료 후 연결. 파라미터 주입은 현재 이름 기반 전체 치환이라 복잡 워크플로우에서 취약하므로[사실], P2의 workflow import/analyzer가 등록한 node-specific binding을 우선 사용한다.
- **결과 표시**: result snapshot의 `source`(preview)·`renderPath`[사실]를 프리뷰에 사용. 산출물 원본은 outputs 디렉터리에 두고 vault에는 경로만 기록(브리프 §2.3: 대용량 미디어는 vault 밖).
- **진행률**: 1차 폴링(잡 스냅샷), 2차 P2의 WebSocket `/ws` 진행률(sampling %, current node)로 업그레이드. readiness API(누락 custom node/model 사전 진단)가 생기면 생성 버튼 옆에 ComfyUI 상태 배지로 노출 [제안 — 설계는 P2 문서 담당].
- **보안**: 빌더가 추가하는 모든 신규 API 라우트는 기존 `DANBI_EDITOR_API_TOKEN` 게이트·localhost-only 기본값을 그대로 따른다[사실: 확정 경계].
- **P2 대시보드와의 경계**: 빌더 = production/컷 중심 제작 뷰, [P2 대시보드](./09_COMFYUI_DASHBOARD_KR.md) = 큐/인프라 중심 운영 뷰. 큐 정체·readiness 이상 등 인프라 문제는 빌더에서 배지로만 알리고 상세는 대시보드로 링크한다 [제안].

---

## 5. 활용 스킬

| 단계 | 스킬 | 용도 |
|---|---|---|
| 설계 착수 | `brainstorming`(superpowers) | 3열 레이아웃·상태 머신의 대안 검토와 요구 확정 |
| 계획 수립 | `writing-plans`(superpowers) | 아래 §6 체크리스트를 실행 가능한 구현 계획서로 전개 |
| UI 구현 | `frontend-design` | 컷 카드·프리뷰·인스펙터의 시각 품질(제네릭 AI 스타일 회피) |
| 테마 정합 | `theme-factory` | 기존 에디터 다크 테마·디자인 토큰과 빌더 페이지 통일 |
| 구현 방식 | `test-driven-development`, `subagent-driven-development`(superpowers) | 파서·상태 조인 로직을 테스트 선행으로, 패널 단위 병렬 구현 |
| 코드 탐색 | Serena(Claude Code 내장) | `comfyui-queue.ts`, `comfyui-results.ts`, AI Result Review 컴포넌트 등 재사용 지점의 심볼 단위 파악 |
| 검증 | `webapp-testing` | 컷 로드→프롬프트 수정→dry-run 생성→승인까지의 E2E 시나리오 |
| 마무리 | `verification-before-completion`(superpowers) | 완료 주장 전 §7 기계 완료조건의 증거 확보 |

---

## 6. 구현 단계 체크리스트

### Phase 0 — 계약 고정 (선행 조건: vault 구조 확정(브리프 §2.3), S3 콘티 문서 형식 초안 존재)

- [ ] `02-storyboard.md` 컷 섹션 표기와 `03-assets.md` 컷 레코드 필드(§2의 후보 목록)를 S3/S4/S5 문서·vault `CLAUDE.md`와 대조해 확정하고, 확정본을 vault `90-templates/`의 템플릿과 `CLAUDE.md` 스키마 문서에 반영한다.
- [ ] 컷→ComfyUI 잡 payload 매핑 규칙(어느 프롬프트 필드가 어느 워크플로우 input으로 가는지)을 표로 문서화한다(이 문서의 부록 또는 별도 파일).
- **검증**: 샘플 production 폴더(수기 작성)를 만들어 스키마 문서만 보고 제3자가 컷 레코드를 읽고 쓸 수 있는지 리뷰.

### Phase 1 — 읽기 전용 뷰어 (선행 조건: Phase 0, 샘플 production 폴더)

- [ ] `/builder` 라우트와 3열 셸, production 선택기(`20-productions/` 폴더 스캔)를 만든다. 위치: Danbi의 기존 페이지 규약(`src/app/` 하위)에 따른다.
- [ ] storyboard 파서(frontmatter+컷 섹션→컷 모델)와 assets 파서를 Electron 파일 접근 위에 구현한다.
- [ ] `GET /api/editor/comfyui-jobs` 스냅샷과 `comfyui_job_ids` 조인 → 컷 카드 상태 배지·진행률 표시.
- [ ] 패널별 error boundary 장착.
- **검증**: 샘플 production을 열어 컷 카드·배지가 문서 내용과 일치하는지 스냅샷 테스트. 잡 스냅샷에 없는 job ID(고아 참조)가 있어도 카드가 죽지 않고 경고 배지로 표시되는지 확인.

### Phase 2 — 인스펙터·생성 실행 (선행 조건: Phase 1, ComfyUI 로컬 인스턴스 또는 dry-run 전용 모드)

- [ ] 인스펙터의 프롬프트·파라미터 편집 → `02-storyboard.md` 컷 섹션 부분 갱신(쓰기 전 mtime 충돌 감지 포함).
- [ ] 생성 버튼: dry-run 검증 → 확인 → execute 큐잉 → `03-assets.md`에 job ID 기록·상태 `image_queued` 전이.
- [ ] 폴링 기반 진행률 갱신과 실패 잡의 retry 버튼(기존 job별 retry POST 재사용).
- **검증**: ComfyUI 없이 dry-run 모드로 E2E(webapp-testing): 프롬프트 수정→저장→생성→문서 갱신 왕복 후 frontmatter·본문 필드가 손실 없이 보존되는지 diff 확인. ComfyUI 가동 환경에서 실제 이미지 1컷 생성해 outputs 경로가 카드에 뜨는지 확인.

### Phase 3 — 후보 비교·승인 게이트 (선행 조건: Phase 2, AI Result Review 컴포넌트 재사용 가능성 확인)

- [ ] side-by-side 후보 비교 뷰(기존 패턴 재사용 또는 번안)와 후보 채택 → `03-assets.md` 기록.
- [ ] 승인/반려 버튼과 반려 사유 입력, 반려→프롬프트 수정 루프 동선.
- [ ] 전 컷 승인 시 `status: generated` 전이 버튼(비가역 경고 표시).
- **검증**: E2E — 2컷 production에서 1컷 승인·1컷 반려 후 문서 상태가 전이되지 않음을 확인, 반려 컷 재생성·승인 후 `generated` 전이가 활성화됨을 확인. 승인 없는 자동 전이 경로가 코드에 존재하지 않는지 리뷰.

### Phase 4 — 일괄 액션·S6 핸드오프·영상 열 (선행 조건: Phase 3; 영상 열은 결손 ② I2V 워크플로우 등록 완료)

- [ ] 다중 선택 일괄 재생성(예상 잡 수·소요 안내 다이얼로그, 단일 GPU 직렬화 준수).
- [ ] "승인된 컷만 S6로" 액션: `generated` 전이 + 컴파일러 입력 경로 안내(또는 S6 컴파일러 직접 호출 — S6 문서의 계약에 따름).
- [ ] I2V 워크플로우 등록 후 영상 생성·`video_queued/ready` 상태 활성화.
- **검증**: 승인 3컷/미승인 1컷 상태에서 핸드오프 실행 시 미승인 컷이 제외되는지, S6 컴파일러가 `03-assets.md`를 읽어 타임라인 초안을 만들 수 있는지 통합 테스트.

---

## 7. 완료 조건

### 기계(에이전트) 완료조건

- [ ] `/builder`에서 샘플 production 로드 → 컷 카드·상태 배지 렌더가 E2E로 통과.
- [ ] 프롬프트 수정→저장→재로드 왕복에서 `02-storyboard.md`의 다른 필드가 훼손되지 않음(diff 검증 자동화).
- [ ] dry-run 생성이 유효 payload를 만들고, execute 경로가 `03-assets.md`에 job ID·상태를 기록.
- [ ] 승인/반려가 vault에만 기록되고 SQLite를 직접 쓰지 않음(역할 분리 준수) — 코드 리뷰 + 테스트.
- [ ] 승인 게이트를 우회하는 자동 전이 경로 부재 확인.
- [ ] 신규 라우트 전부 `DANBI_EDITOR_API_TOKEN` 게이트 하에 동작.

### EXTERNAL_PENDING (사람/외부)

- [ ] **인간 UX 검수**: 실제 제작 1편(콘티→이미지→승인→S6)을 사용자가 빌더만으로 완주하고 동선 승인 — 사람 필요.
- [ ] **생성 품질 판단**: 채택/반려 기준은 미적 판단이므로 자동화 불가 — 컷별 인간 승인 그 자체가 상시 EXTERNAL_PENDING 게이트.
- [ ] **영상 열 활성화**: 결손 ② I2V 워크플로우의 품질 확인(실 GPU 렌더 결과 인간 확인) 후 개방.

---

## 8. 리스크와 완화책

| 리스크 | 내용 | 완화책 |
|---|---|---|
| vault 동시 편집 충돌 | Obsidian·에이전트·빌더가 같은 파일을 편집 | 쓰기 전 mtime 비교→충돌 시 재로드 유도, vault의 git 이력으로 복구 [제안] |
| 마크다운 파싱 취약성 | 자유 서식 본문에서 컷 섹션 오인식 | 컷 데이터는 frontmatter/정형 섹션 표기만 허용(Phase 0에서 스키마 고정), 파싱 실패 시 해당 컷만 오류 카드로 격리(panel error boundary와 동일 철학) |
| 상태 이중 기록 표류 | `03-assets.md`와 SQLite 잡 상태 불일치 | 역할 분리(§2): 잡 상태는 항상 SQLite 조회값을 표시하고 vault에는 결과·승인만 기록. 고아 job ID는 경고 배지 |
| 파라미터 주입 오작동 | 이름 기반 전체 치환의 복잡 워크플로우 취약성[사실] | P2 workflow import/analyzer의 node-specific binding 완성 전에는 검증된 기본 워크플로우만 preset으로 노출 |
| I2V 부재로 반쪽 출시 | 영상 제어가 요구인데 워크플로우가 없음[사실] | 영상 열을 명시적 "준비 중" 상태로 표시(숨기지 않음), 이미지 루프 먼저 가치 제공. 결손 ②를 병행 최우선 |
| 일괄 재생성 폭주 | 수십 컷 재생성으로 GPU 장시간 점유·산출물 덮어쓰기 | dry-run 예상치 확인 다이얼로그, queue-settings 동시성(1–4)[사실] 준수, 기존 산출물은 덮지 않고 후보 누적 |
| 범위 팽창 | 빌더가 에디터·대시보드 기능을 흡수하려는 유혹 | §1 제외 목록을 계약으로 유지, 인프라 상세는 P2 링크로 위임 |

---

## 9. 관련 문서

- [마스터 파이프라인 보고서](../00_MASTER_PIPELINE_REPORT_KR.md)
- 상류 단계: [S3 콘티](../stages/03_STORYBOARD_WORKFLOW_KR.md) · [S4 이미지 생성](../stages/04_IMAGE_GEN_WORKFLOW_KR.md) · [S5 영상·음성 생성](../stages/05_VIDEO_AUDIO_GEN_WORKFLOW_KR.md)
- 하류 단계: [S6 편집·렌더](../stages/06_EDITING_WORKFLOW_KR.md) — "승인된 컷만 S6로" 핸드오프의 수신자
- 플랫폼: [P2 ComfyUI 대시보드](./09_COMFYUI_DASHBOARD_KR.md)(큐/readiness/진행률 인프라) · [P3 지식 DB](./10_KNOWLEDGE_DB_KR.md)(vault 스키마 원천) · [P4 오케스트레이션](./11_ORCHESTRATION_KR.md)(승인 게이트와 단계 트리거 규약)
- Danbi 내부 근거 문서: `docs/COMFYUI_AUTOMATION_KR.md`(자동화 API 계약), `docs/TOOBUSY_PINGPONG_DANBI_APPLICATION_ANALYSIS_KR.md`(readiness/WS 진행률 설계), `docs/COMFYUI_VIEWER_OPENREEL_EXTENSION_ANALYSIS_KR.xhtml`(postMessage 브리지·error boundary 패턴)
