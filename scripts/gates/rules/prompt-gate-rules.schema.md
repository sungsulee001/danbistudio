# 게이트 ① 규칙 테이블 스키마 (prompt-gate)

`image-rules.json` · `video-rules.json` · `audio-rules.json` 이 따르는 형식.
`prompt-gate.mjs` 는 `rules/*-rules.json` 중 **`kind` 가 `image`·`video`·`audio` 인 테이블만** 읽는다
(같은 디렉터리를 다른 게이트와 공유하므로 나머지는 조용히 건너뛴다).

새 실증이 나오면 **코드를 고치지 말고 이 테이블에 규칙만 추가**한다.

## 테이블

```json
{
  "kind": "image | video | audio",
  "model": "이 규칙들이 전제하는 모델·설정",
  "doc": "근거 문서 요약",
  "rules": [ /* 규칙 객체 */ ]
}
```

## 규칙 객체

| 필드 | 필수 | 설명 |
|---|---|---|
| `id` | ✅ | 전 테이블 통틀어 유일. `IMG-`·`VID-`·`AUD-` 접두 |
| `severity` | ✅ | `ERROR`(게이트 차단, exit 1) / `WARN`(보고만) |
| `title` | | 한 줄 규칙명 |
| `applies_to` | | 적용 조건 (아래) |
| `detect` | ✅ | 검출 서술어 (아래) |
| `why` | ✅ | 실증 근거 한 줄 — 어느 컷에서 몇 대 몇으로 실증됐는지 |
| `fix` | ✅ | 수정 지침 (가능하면 before → after) |

### `applies_to`

```json
{
  "field": "image_prompt",     // 검사할 필드. 기본값 image_prompt
  "flags_all": ["closeup", "single_figure"],
  "flags_any": ["hat"],
  "flags_none": ["figurine"]
}
```

검사 가능한 필드: `image_prompt` · `motion_prompt` · `camera` · `style_variant` ·
`shot_type` · `intent` · `reference_sheet` · `prompt`(오디오) · `mode`(오디오).

**레인 게이팅** — 아이템에 그 종류의 프롬프트가 아예 없으면(예: 이미지 프롬프트만 넣은 입력)
해당 `kind` 의 규칙은 적용되지 않는다.

### 컷 유형 플래그

`prompt-gate.mjs` 의 `deriveFlags()` 가 콘티 필드와 프롬프트 본문에서 도출한다.
콘티 입력과 `--json` 입력이 같은 함수를 쓰며, `--json` 은 레코드의 `flags` 배열로 추가 지정할 수 있다.

| 플래그 | 도출 근거 |
|---|---|
| `closeup` | `shot_type` 이 MCU/CU/ECU/BCU (콘티 없으면 프롬프트의 close-up 어휘) |
| `single_figure` | closeup + 인물 명사 + 군상·손·무인 아님 + "이인" 아님 |
| `hands` | `style_variant: hands-only` 또는 컴파일본 첫 절이 손을 주어로 삼음 |
| `crowd` | 한국어 "군상/N인/개체 차이"(부정 문맥 제외) 또는 영문 "three+ men/officials/figures" |
| `figurine` | 목인·나무 인형 (사람이 쓰는 관모가 아니므로 갓 prior 규칙 제외) |
| `hat` | 관모 어휘(hat/cap/helmet/사모/익선관/투구) 등장 |
| `face_hidden` | `shot_type` 에 "미노출" 또는 의도에 "얼굴 미노출" 명시 |
| `back_view` | `shot_type` 이 뒷모습·정후방 이거나 프롬프트에 `directly behind` |
| `seated` / `fullbody` | 착좌·전신(또는 WS/EWS/LS/FS 샷 코드) |
| `nofigure_intent` | 의도가 무인이거나 `{STYLE_NOFIGURE}` 사용, 또는 인물 명사 없이 deserted/empty |
| `a2v` | `a2v` 필드가 "예" 로 시작 |
| `static_camera` | `camera` 가 이동 계열 프리셋이 아님(Static·Handheld) |
| `sfx` / `bgm` | `--json` 레코드의 `subkind` |

### `detect` 서술어

| `type` | 위반 조건 | 추가 필드 |
|---|---|---|
| `regex` | 패턴이 매치되면 위반 | `pattern`, `flags` |
| `regex_absent` | 패턴이 **없으면** 위반(필수 표현) | `pattern`, `flags` |
| `regex_count` | 매치 수가 `max` 초과 또는 `min` 미만 | `pattern`, `flags`, `max`, `min` |
| `regex_pair` | `pattern` 매치 + (`with` 매치 / `with_mode:"absent"` 면 `with` 부재) | `pattern`, `with`, `with_mode`, `flags` |
| `regex_unless` | `unless` 가 없을 때만 `pattern` 매치를 위반으로 본다 | `pattern`, `unless`, `flags` |

## 규칙 추가 절차

1. 실증(컷 ID·수치·해소 방법)을 `20-productions/*/03-assets.md` 에 먼저 남긴다.
2. 해당 테이블에 규칙 객체를 추가한다. `why` 에 그 실증을 한 줄로 요약한다.
3. `fixtures/prompt-gate-golden.json` 의 `fail`(과거 실패)·`pass`(교정본)에 케이스를 추가한다.
4. `npx vitest run scripts/gates/__tests__/prompt-gate.test.mjs` 로 회귀를 확인한다.
   기존 콘티에 대한 카운트 단언이 깨지면, 그것이 **의도된 검출 확대인지 오탐인지**를 판정하고
   테스트의 기대치를 근거와 함께 갱신한다.
