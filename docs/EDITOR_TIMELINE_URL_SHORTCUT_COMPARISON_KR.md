# Editor Timeline URL Shortcut Comparison - 2026-06-21

## 분석한 URL

- Tilnote: https://tilnote.io/pages/6a0acee7feaf255d209877c1
- Creator Joseph: https://creatorjoseph.com/193
- Sowonlog: https://sowonlog.tistory.com/entry/%ED%94%84%EB%A6%AC%EB%AF%B8%EC%96%B4-%EC%BB%B7%ED%8E%B8%EC%A7%91-%EC%8B%9C-%EC%9C%A0%EC%9A%A9%ED%95%9C-%EB%8B%A8%EC%B6%95%ED%82%A4-%EC%B6%94%EC%B2%9Cctrl-k-q-w-%EB%93%B1

## 공통으로 중요한 편집 흐름

| 항목 | URL 기준 | Danbi 기존 상태 | 이번 반영 |
| --- | --- | --- | --- |
| 재생 헤드 기준 분할 | Ctrl+K, Razor/Cut | Split 기능 있음, toolbar 노출 있음 | `Split`을 직접 버튼으로 유지 |
| 리플 트림 | Q/W | `trimToPlayhead` 있음, ripple toggle 의존 | toolbar와 shortcut 경로에서 Q/W를 강제 ripple trim으로 연결 |
| 삭제/리플 삭제 | Delete, Ripple Delete | 일반 delete/ripple delete 있음 | `Del`, `Ripple Del` 직접 버튼 유지 |
| 뒤쪽/앞쪽 선택 | A, Shift+A | 내부 shortcut/handler 있음 | `Select` 메뉴에 left/right 선택 노출 |
| J/K/L 탐색 | 컷 지점 탐색 속도 향상 | shortcut handler 있음 | transport row에 `J`, `K`, `L` 버튼 노출 |
| 확대/축소/전체 보기 | zoom, fit | zoom slider, fit 있음 | 유지 |
| 스냅 | S | snap toggle 있음 | 유지 |
| 삽입/덮어쓰기 | insert/overwrite | edit mode 있음 | 유지 |
| 보조 기능 | title/track/save/command palette | toolbar 앞줄에 노출 | `More` 메뉴로 이동 |

## 제거/하향 조정한 항목

- 앞줄 `+` 메뉴: 컷편집 핵심이 아니라 `More`로 이동했다.
- 앞줄 `Cmd`: command palette는 유지하되 `More`로 이동했다.
- `Project` 메뉴: timeline core action이 아니라 `More`로 이동했다.
- 일반 `Trim In/Out` 표현: URL 기준의 Q/W 의미에 맞게 `Q Trim`, `W Trim` 리플 트림으로 바꿨다.

## 남은 차이

- Premiere의 `Ctrl+K`는 split이지만 Danbi는 기존 command palette 표준으로 `Ctrl+K`를 사용 중이다.
- 현재 Danbi split shortcut은 command registry 기준 `B / S`이다.
- `Ctrl+K`를 split으로 바꾸려면 command palette shortcut 재설계와 기존 테스트/문서 갱신이 필요하므로 이번 변경에서는 UI의 `Split` 직접 버튼과 기존 split shortcut을 유지했다.

## 검증 기준

- playhead가 클립 안에 있을 때 선택 없이도 Q/W trim과 delete 계열 버튼이 활성화되어야 한다.
- Q/W toolbar와 keyboard/command palette trim 경로는 ripple trim으로 동작해야 한다.
- 보조 기능은 사라지지 않고 `More`에서 접근 가능해야 한다.
