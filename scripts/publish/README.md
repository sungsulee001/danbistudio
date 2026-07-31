# Danbi S7 — YouTube 업로더

`04-publish.md`의 **§0 붙여넣기 블록**을 파싱해 YouTube Data API v3로 마스터 영상을 올린다.
사이클의 마지막 칸(업로드 자동화)이다.

```
scripts/publish/
├── auth.mjs      최초 1회 OAuth 인증 (인간 전용 — 브라우저 동의 필요)
├── upload.mjs    업로드 · 썸네일 · 재생목록 · 04-publish 자동 기입
├── lib.mjs       §0 파서 · 토큰 갱신 · ffprobe 검증 · vault 쓰기
└── README.md     이 문서
```

**의존성 0개.** Node 24 내장 기능만 쓴다(`fetch` · `node:http` · `node:crypto` · `node:fs`).
`googleapis`(≈50MB)도 `google-auth-library`도 설치하지 않는다. `ffprobe`만 PATH에 있으면 된다.

---

## 0. 안전 기본값 (먼저 읽을 것)

| 항목 | 기본 동작 |
|---|---|
| 공개 범위 | **private**. `--visibility public`을 명시해야만 공개된다 |
| 드라이런 | `--dry-run`이면 API 호출 **0회** — 파싱·검증·요약만 |
| §0 형식 불일치 | **에러로 중단.** 추측해서 올리지 않는다 |
| 아동용 | 항상 `selfDeclaredMadeForKids: false` |
| 구독자 알림 | `notifySubscribers=false` (private 업로드 후 공개 전환 흐름이라) |

> **§0 파서가 존재하는 이유.** ep1에서 §1 제목 후보 *분석 문서*가 공개 설명란에 들어갔다.
> 이 업로더는 설명란에 **§0-B 코드블록 안 텍스트만** 넣고, 그 안에 내부 분석 문서의 지문
> (`제목 후보`, `추천 1위`, `약속-이행 판정` 등)이 섞여 있으면 업로드를 거부한다.

---

## 1. 인간이 1회 하는 인증 절차

### 실행 명령 (한 줄)

```
node E:\ai_tool\Danbi_Studio\scripts\publish\auth.mjs
```

> ⚠ **이 명령은 인간만 실행한다.** 브라우저에서 구글 계정 동의가 필요하고, 계정 인증은
> 에이전트의 권한 밖이다. 에이전트는 이 스크립트를 실행하지 않는다.

### 화면 순서

1. 터미널에 인증 URL이 찍히고 브라우저가 자동으로 열린다.
   열리지 않으면 터미널의 URL을 복사해 브라우저 주소창에 붙여넣는다.
2. **계정 선택** — 유튜브 채널 「기록은 침묵한다」를 소유한 계정(`silenttime5959`)을 고른다.
   다른 계정을 고르면 엉뚱한 채널에 올라간다.
3. **"Google에서 확인하지 않은 앱입니다"** 경고 화면
   → `고급` 클릭 → `<앱 이름>(으)로 이동(안전하지 않음)` 클릭.
   본인이 만든 클라이언트이고 심사 전 상태라 나오는 정상 화면이다.
4. **권한 2개를 모두 체크**한다.
   - *YouTube 동영상, 등급, 댓글 관리* (`youtube.upload`)
   - *YouTube 계정 관리* (`youtube` — 썸네일·재생목록에 필요)
   하나라도 빠지면 썸네일 설정이나 재생목록 추가에서 403이 난다.
5. `계속` → 브라우저에 **"인증 완료 ✅"**, 터미널에 연결된 채널 이름이 찍히면 끝이다.

### 결과

- 리프레시 토큰이 `E:\ai_tool\Danbi_Studio\.secrets\youtube-token.json`에 저장된다.
- 이후 `upload.mjs`는 사람 개입 없이 액세스 토큰을 자동 갱신한다.
- `.secrets\`는 `.gitignore`에 등재되어 있다. **이 폴더의 파일은 절대 커밋·공유하지 않는다.**

---

## 2. 업로드 명령

### ① 드라이런 (항상 여기서 시작)

```
node scripts/publish/upload.mjs 2026-07-29-jagyeongnu-night --dry-run
```

§0 A/B/C/D를 파싱하고, 마스터 파일을 `ffprobe`로 검증하고, 실제로 올라갈 값을 전부 출력한다.
**API 호출 0회.** 제목·태그·설명문 앞 10줄·영상 규격을 눈으로 확인한다.

### ② private 업로드

```
node scripts/publish/upload.mjs 2026-07-29-jagyeongnu-night
```

resumable 업로드로 마스터를 올리고(기본 private), §0-D의 썸네일을 설정하고,
`04-publish.md`의 frontmatter(`video_id` · `url` · `published_at` · `visibility`)를 기입한 뒤
`## 게시 결과` 절을 append한다.

재생목록까지 넣으려면 재생목록 **ID**가 필요하다(§0-D의 재생목록 *이름*은 참고용):

```
node scripts/publish/upload.mjs 2026-07-29-jagyeongnu-night --playlist PLxxxxxxxxxxxxxxxx
```

업로드가 중단되면 **같은 명령을 다시 실행**한다. 세션 URI가
`.secrets\upload-sessions\<production_id>.json`에 저장되어 있어 끊긴 지점부터 재개한다.
세션을 버리고 처음부터 다시 올리려면 `--restart`.

### ③ 공개 전환

스튜디오에서 설명란·챕터·썸네일을 눈으로 확인한 뒤:

```
node scripts/publish/upload.mjs 2026-07-29-jagyeongnu-night --set-visibility public
```

업로드하지 않고 기존 `video_id`(frontmatter에서 읽음)의 공개 범위만 바꾼다.
`--visibility public`으로 처음부터 공개 업로드도 가능하지만, **권장하지 않는다** —
설명란 오기입을 되돌릴 기회가 없어진다(ep1 사고가 그 형태였다).

### 전체 옵션

| 옵션 | 설명 |
|---|---|
| `--dry-run` | 파싱·검증·요약만. API 호출 없음 |
| `--visibility private\|unlisted\|public` | 업로드 시 공개 범위 (기본 `private`) |
| `--set-visibility private\|unlisted\|public` | 업로드 없이 기존 영상의 공개 범위만 변경 |
| `--video-id <id>` | `--set-visibility`용. 생략 시 frontmatter의 `video_id` |
| `--thumbnail <path>` | §0-D 썸네일 경로 덮어쓰기 |
| `--no-thumbnail` | 썸네일 설정 건너뜀 |
| `--playlist <playlistId>` | 업로드 후 재생목록에 추가 |
| `--category 교육\|인물/블로그\|<숫자ID>` | §0-D 카테고리 덮어쓰기 |
| `--restart` | 기존 resumable 세션 폐기, 처음부터 재업로드 |
| `--no-writeback` | `04-publish.md` 자동 기입 생략 |

첫 인자는 `production_id` 또는 `04-publish.md`의 전체 경로 둘 다 받는다.

---

## 3. ⚠ 동의 화면이 "테스트" 상태면 리프레시 토큰이 7일 만에 만료된다

Google Cloud Console → **API 및 서비스 → OAuth 동의 화면**의 게시 상태가
**「테스트(Testing)」**이면, 발급된 리프레시 토큰은 **7일 후 무효**가 된다.
그 뒤 `upload.mjs`를 돌리면 이렇게 죽는다:

```
❌ [AUTH] 액세스 토큰 갱신 실패 (HTTP 400): Token has been expired or revoked.
```

**임시 대응**: 인간이 `node scripts/publish/auth.mjs`를 다시 실행한다(7일마다 반복).

**프로덕션 전환 (권장)**

1. Google Cloud Console → **API 및 서비스 → OAuth 동의 화면**
2. 게시 상태 「테스트」 옆 **`앱 게시`** 버튼 → 확인
3. 상태가 **「프로덕션(In production)」**으로 바뀐다 → 리프레시 토큰 7일 만료가 **사라진다**
4. 인증을 1회 다시 받아 만료 없는 토큰으로 교체한다

> **심사(verification)와 게시(publishing)는 다른 것이다.**
> `youtube.upload`·`youtube`는 민감한 범위라 "프로덕션" 전환 시 미심사 앱 경고 화면이
> 계속 뜨지만(§1-3 단계로 통과 가능), **본인 계정 사용에는 지장이 없다.**
> 외부 사용자에게 배포하지 않는 한 심사 제출은 필요 없다.
>
> **미확정 항목**: 과거 보고서에 "미심사 API 프로젝트는 업로드가 비공개로 고정되어 공개
> 전환 불가"라는 기술이 있으나 **검증되지 않았다.** 첫 업로드에서 `--set-visibility public`이
> 실제로 성공하는지로 확인한다. 실패한다면 그때 심사 제출을 검토한다.

---

## 4. 쿼터

일일 한도 **10,000 units** (태평양시 자정 리셋, 프로젝트 단위).

| 작업 | 비용 |
|---|---|
| `videos.insert` (업로드) | **1,600** |
| `thumbnails.set` | 50 |
| `playlistItems.insert` | 50 |
| `videos.update` (공개 전환) | 50 |
| `channels.list` (auth.mjs 확인용) | 1 |

**하루 약 6회 업로드**가 상한이다(1,600 × 6 = 9,600).
에피소드 1편 전체 흐름(업로드+썸네일+재생목록+공개전환)은 **1,750 units**이므로
하루 5편까지 여유롭다. 현 채널 속도(월 1~2편)에서는 문제되지 않는다.

⚠ **드라이런은 0 units.** 실수로 쿼터를 태우지 않으려면 항상 `--dry-run`부터 돌린다.
⚠ **재개는 추가 비용이 없다.** 중단된 업로드를 이어받는 것은 같은 세션이라 1,600을 다시 쓰지 않는다.
   반면 `--restart`는 새 `videos.insert`라서 1,600을 또 쓴다.

---

## 5. 실패 대응

스크립트는 실패 원인을 코드로 구분해 출력한다: `[PARSE] [AUTH] [QUOTA] [MEDIA] [NETWORK] [API] [USAGE]`

| 코드 | 의미 | 대응 |
|---|---|---|
| `PARSE` | §0 블록 형식 불일치 | 메시지가 어느 절(A/B/C/D)이 문제인지 지목한다. `04-publish.md`를 고치고 `--dry-run` 재실행 |
| `PARSE` + `§0 블록 필요` | 구형식 문서(ep1 등) | 자동 처리하지 않는다. `tpl-publish.md` §0 규격으로 A/B/C/D를 작성해야 한다 |
| `AUTH` | 토큰 없음·만료·철회 | 인간이 `node scripts/publish/auth.mjs` 재실행. 그 뒤 같은 업로드 명령을 다시 실행하면 **resumable 세션이 이어진다** |
| `QUOTA` | 일일 쿼터/업로드 횟수 초과 | 태평양시 자정 이후 같은 명령 재실행. 세션이 살아 있으면 이어서 올라간다 |
| `MEDIA` | 마스터 없음·손상·ffprobe 실패 | 경로(§0-D "영상 파일")와 파일 존재를 확인 |
| `NETWORK` | 네트워크·5xx | 지수 백오프로 6회 자동 재시도. 그래도 실패하면 같은 명령 재실행(끊긴 지점부터 재개) |
| `NETWORK` + `세션 만료(404)` | resumable 세션 소실(약 1주 경과) | `--restart`로 새 세션 시작 |
| `API` | 그 외 (403 권한, 400 메타데이터) | 메시지의 `reason`을 확인. 403이면 auth.mjs 재실행으로 스코프 재동의 |

### 자주 나오는 상황

**"변형·합성 콘텐츠 고지가 API로 적용되지 않았다"**
`status.containsSyntheticMedia` 필드가 거부되면 스크립트가 그 필드를 빼고 자동 재시도하고,
완료 후 *"스튜디오에서 수동 체크 필요"*를 04-publish에 기록한다.
→ 유튜브 스튜디오 → 해당 영상 → 세부정보 → **"변형된 콘텐츠 또는 합성 콘텐츠"** 를 직접 체크한다.

**썸네일 403 (`forbidden`)**
채널이 아직 **커스텀 썸네일 권한**(전화번호 인증)을 못 받았을 수 있다.
영상 업로드 자체는 성공한 상태이므로, 인증 후 `--no-thumbnail` 없이 스튜디오에서 수동 설정한다.

**업로드는 됐는데 처리(processing)가 안 끝남**
API는 업로드 완료 시점에 응답한다. 트랜스코딩은 그 뒤 유튜브 쪽에서 진행된다(2GB · 1080p 기준
수십 분). `video_id`는 이미 유효하므로 공개 전환은 처리 완료 후에 한다.

---

## 6. §0 붙여넣기 블록 규격 (파서 계약)

`90-templates/tpl-publish.md` §0이 정본이다. 요약:

```markdown
## 0. 붙여넣기 블록

### A. 제목 (1줄)
```
확정 제목 한 줄            ← 정확히 1줄. 100자 이내. < > 금지
```

### B. 설명문 (코드블록 안 전문)
```
설명란에 그대로 들어갈 텍스트 전문   ← 5000자 이내. 내부 분석 표현 금지
```

### C. 태그 (한 줄, 쉼표 구분)
```
태그1, 태그2, 태그3          ← 쉼표 합산 500자 이내
```

### D. 업로드 화면 부가 설정 (인간 체크)

- 썸네일 파일: `절대경로`          ← 선택
- 영상 파일: `절대경로`            ← **필수**
- 카테고리: 교육                  ← 선택(생략 시 교육/27)
- "변형·합성 콘텐츠" 고지 체크 **권장**   ← "권장/필수/체크"가 있으면 고지 ON
- 재생목록: "이름"                ← 참고용(실제 추가는 --playlist <id>)
```

§0 블록은 다음 `## ` 헤딩에서 끝난다. 그 뒤 내용(§0-2, §1 이하 내부 분석)은 파서가 읽지 않는다.
