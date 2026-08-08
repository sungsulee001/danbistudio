> 본 문서는 2026-07-05 파이프라인 집중 분석 세션의 리서치 산출물 원본이다.

# AI 생성 도구 리서치 보고서 — Danbi Studio 자동화 파이프라인 근거 자료

조사일: 2026-07-05. 대상 파이프라인: 시나리오→대본→콘티→이미지→영상/음성→편집(Danbi Studio)→업로드(쇼츠/릴스/틱톡).
각 항목은 **[사실]**(웹 출처 확인) / **[추정]**(정황 기반 판단)을 구분해 표기한다.

---

## 1. ACE-Step (음악/오디오 생성)

**무엇인가** — [사실] 오픈소스 음악 생성 파운데이션 모델. 현재 최신은 **ACE-Step 1.5**(2B DiT)와 **1.5 XL**(4B DiT)이며, "거의 모든 상용 대안을 능가하는 로컬 음악 생성 모델"을 표방한다. 가사(보컬) 포함 완곡 생성이 가능하다.

**로컬 vs API** — [사실] 완전 로컬 실행. CUDA/AMD ROCm/Intel/Mac 모두 지원.
- 1.5 표준(2B): **VRAM 4GB 미만**으로 구동
- 1.5 XL(4B): 오프로드+양자화 시 **≥12GB**, 미적용 시 **≥20GB**
- 속도: A100에서 곡당 2초 미만, **RTX 3090에서 10초 미만** — 쇼츠용 BGM 생성엔 사실상 실시간 수준

**라이선스·비용** — [사실] v1은 Apache-2.0, **1.5/1.5 XL은 MIT + 저작권 문제없는(royalty-free) 학습 데이터** 명시. 상업 이용 무료. 유튜브 수익화 콘텐츠에 쓰기에 라이선스 리스크가 매우 낮다.

**ComfyUI 연동** — [사실] ComfyUI **네이티브 노드로 공식 지원**(v1부터, 1.5도 2026년 지원 완료). 즉 별도 서버 없이 ComfyUI API 하나로 이미지·음악을 통합 호출 가능.

**파이프라인 위치** — "영상/음성 생성" 단계에서 BGM·효과음 트랙 생성 → Danbi Studio 오디오 트랙으로 삽입.

**리스크** — 한국어 가사 보컬 품질은 별도 검증 필요 [추정]. 곡 구조(인트로/아웃트로) 제어 한계 → 편집 단계에서 컷 조정 전제.

출처: [ACE-Step-1.5 GitHub](https://github.com/ace-step/ACE-Step-1.5), [GPU 호환성 문서](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/GPU_COMPATIBILITY.md), [ComfyUI 공식 블로그](https://blog.comfy.org/p/ace-step-15-xl-commercial-grade-music), [AMD 블로그](https://www.amd.com/en/blogs/2026/commercial-grade-ai-music-generation-on-amd-ryzen-ai-and-radeon-ace-step-1-5.html), [ComfyUI 튜토리얼](https://docs.comfy.org/tutorials/audio/ace-step/ace-step-v1)

---

## 2. FunAudioLLM: SenseVoice(음성인식) + CosyVoice(TTS)

### SenseVoice (ASR)
- [사실] 다국어 음성 이해 모델(ASR+감정 인식+오디오 이벤트 감지). 50+개 언어, **한국어는 고정밀 5개 언어(중/광둥/영/일/한)에 포함**. 2026년 5월부터 화자 분리(diarization) 지원.
- [사실] SenseVoice-Small은 비자기회귀 구조로 10초 오디오를 70ms에 처리(Whisper-Large 대비 15배). **HF 모델 카드 기준 Apache-2.0**.
- [사실] 배포 옵션 풍부: ONNX(funasr-onnx), LibTorch, **GGUF/llama.cpp(양자화 q8 약 254MB, CPU 단독 실행 가능)**, Docker, FastAPI.
- 파이프라인 위치: TTS 결과물의 **자막 타임스탬프 추출(강제 정렬)** 및 QC(생성 음성이 대본과 일치하는지 검증)에 사용. Danbi Studio 자막 트랙 자동 생성의 핵심.

### CosyVoice (TTS)
- [사실] 최신은 **Fun-CosyVoice 3.0**(Fun-CosyVoice3-0.5B-2512, 2025-12 릴리스). LLM 기반 제로샷 TTS로 **한국어 포함 9개 언어** + 18개 방언 지원, 제로샷 음성 클로닝, 스트리밍/저지연 지원. CER 0.81% 수준.
- [사실] 저장소는 Apache-2.0. 단, 가중치의 상업 이용 관련 GitHub 이슈(#598, #853) 문의가 존재 — **가중치 라이선스는 배포 전 HF 모델 카드로 최종 확인 권장** [추정: 관행상 Apache-2.0으로 통용].
- 로컬 실행: 0.5B 모델이라 GPU 부담이 작다(수 GB VRAM 수준) [추정].
- 파이프라인 위치: "대본 → 나레이션 음성" 단계. 채널 고유 목소리를 클로닝해 일관된 페르소나 유지 가능.
- 리스크: 한국어 운율 자연스러움은 3.0에서 개선됐다고 하나 실측 필요. 음성 클로닝은 본인/허락받은 목소리만 사용(초상권·음성권 리스크).

출처: [SenseVoice GitHub](https://github.com/FunAudioLLM/SenseVoice), [SenseVoiceSmall HF](https://huggingface.co/FunAudioLLM/SenseVoiceSmall), [CosyVoice GitHub](https://github.com/FunAudioLLM/CosyVoice), [Fun-CosyVoice3-0.5B HF](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512), [CosyVoice3 가이드](https://stable-learn.com/en/cosyvoice3-tech-guide/)

---

## 3. ComfyUI API 자동화

**핵심 구조** — [사실] ComfyUI 서버(기본 포트 8188)는 HTTP+WebSocket API를 노출한다.
- `POST /prompt`: **API 포맷 워크플로우 JSON**을 전송하면 큐에 등록되고 `prompt_id` 반환
- `ws://host:8188/ws?clientId=...`: 노드 단위 실행 상태, 진행률(`progress`), 완료(`executed`), 오류(`execution_error`) 이벤트 수신
- `GET /history/{prompt_id}`: 결과 메타데이터, `GET /view`: 출력 파일 다운로드, `POST /upload/image`: 입력 업로드, `/queue`, `/interrupt`: 큐 관리

**파라미터화 모범 사례** — [사실+업계 관행]
1. UI에서 "Export (API Format)"로 내보낸 JSON을 **버전 관리 대상 템플릿**으로 취급(diff/롤백/해시 고정). "워크플로우 = 배포 단위"로 다루는 것이 표준 관행.
2. 런타임에는 노드 ID(또는 노드 title 검색)로 `inputs.text`(프롬프트), `inputs.seed`, 해상도 등 특정 필드만 치환. 콘티 1장 = 템플릿 1회 호출 구조.
3. 요청마다 **고유 `client_id`** 사용 — 없으면 어떤 WebSocket 이벤트가 어느 작업 것인지 구분 불가.
4. **CUDA OOM은 HTTP 오류가 아니라 `execution_error` 이벤트로 도착** → VRAM 해제 후 재시도하는 전용 핸들러 필요.

**파이프라인 위치** — "콘티→이미지"(로컬 모델 사용 시)와 "음악(ACE-Step)" 단계의 실행 엔진. Danbi Studio(Electron 메인 프로세스)가 ComfyUI를 사이드카 프로세스로 관리하고 REST/WS로 오케스트레이션하는 구조가 자연스럽다 [추정/설계 제안].

**리스크** — ComfyUI 업데이트 시 노드 스키마 변경으로 템플릿 파손 가능 → ComfyUI 버전 고정 및 템플릿 스모크 테스트 권장. 단일 GPU에서 이미지 생성과 영상 인코딩의 VRAM 경합 → 큐 직렬화 필요.

출처: [9elements 가이드](https://9elements.com/blog/hosting-a-comfyui-workflow-via-api/), [Runflow 개발자 가이드(2026)](https://www.runflow.io/blog/comfyui-api-developer-guide), [ViewComfy 프로덕션 가이드](https://www.viewcomfy.com/blog/building-a-production-ready-comfyui-api), [DeepWiki API 문서](https://deepwiki.com/Comfy-Org/ComfyUI/7-api-and-programmatic-usage)

---

## 4. LM Studio (로컬 LLM 서버)

**무엇인가/API** — [사실] 로컬 LLM 실행 GUI+서버. **OpenAI 호환 엔드포인트**(`http://localhost:1234/v1` — chat completions, embeddings, function calling, structured output)와 자체 REST API, TS/Python SDK, Anthropic 호환 엔드포인트까지 제공. CLI(`lms server start --port 1234`)와 헤드리스 데몬(**llmster**)으로 GUI 없이 백그라운드 서비스 가능 — Electron 앱이 부팅 시 자동 기동하기 적합.

**비용** — [사실] 앱 자체 무료(업무 사용 포함 무료 정책, 2025년 발표) [추정: 2026년에도 유지 — 재확인 권장]. 모델 추론 비용 0(전기료·GPU만).

**한국어 글쓰기 모델 후보** — [사실, 2026년 기준]
| 모델 | 라이선스 | 비고 |
|---|---|---|
| **Kakao Kanana** | Apache-2.0 | 상업 이용 자유, 한국어 특화. 1순위 후보 |
| **Upstage SOLAR** | Apache-2.0 | 상업 친화, 한국어 강점 |
| LG **EXAONE** | NC(비상업 연구용) | 한국어 성능 우수하나 **수익화 콘텐츠 제작엔 라이선스 부적합** |
| Naver HyperCLOVA X | 미공개(SEED 소형만 공개) | 본체는 오픈소스 아님 |
| Qwen3 / Gemma 계열 | 오픈 | 다국어 범용, 한국어 준수 [추정] |

**파이프라인 위치** — "시나리오→대본→콘티(장면별 프롬프트 JSON)" 단계 전체. structured output(JSON 스키마 강제) 지원이 콘티를 기계가 읽을 수 있는 형식으로 뽑는 데 결정적이다.

**리스크** — 로컬 7B~14B급 모델의 한국어 창작 품질은 클라우드 프런티어 모델 대비 열세 → "초안은 로컬, 품질 중요 단계만 클라우드 API" 하이브리드 옵션 설계 권장 [추정/제안].

출처: [LM Studio 개발자 문서](https://lmstudio.ai/docs/developer), [서버 문서](https://lmstudio.ai/docs/developer/core/server), [OpenAI 호환 문서](https://lmstudio.ai/docs/developer/openai-compat), [한국어 LLM 벤치마크(엘리스)](https://elice.io/ko/resources/blog/llm-benchmark-korea-elice), [국내 오픈소스 LLM 현황](https://www.oss.kr/oss_guide/show/9246eca5-f639-484c-be09-797d76fc9582)

---

## 5. "나노바나나2" = Google Nano Banana 2

**정식 명칭** — [사실, Google 공식 문서 확인] Google Gemini API의 이미지 생성 모델 라인업:
- **Nano Banana 2 = `gemini-3.1-flash-image`** (범용 주력)
- Nano Banana 2 Lite = `gemini-3.1-flash-lite-image` (최속·최저가, 1K 전용)
- Nano Banana Pro = `gemini-3-pro-image` (최고 품질)
- (구) Nano Banana = `gemini-2.5-flash-image`

**로컬 vs API** — [사실] 클라우드 API 전용(Gemini API/Vertex AI, OpenRouter 경유도 가능). 로컬 실행 불가.

**가격** — [사실] Nano Banana 2 기준 이미지당: 0.5K $0.045 / **1K $0.067** / 2K $0.101 / 4K $0.151. **Batch API 사용 시 절반 가격**(24시간 내 비동기 반환 — 야간 배치 생성에 적합). AI Studio 무료 티어 존재(RPM/일일 한도).

**파이프라인 위치** — "콘티→이미지" 단계의 클라우드 옵션. 쇼츠 1편에 장면 10컷이면 1K 기준 약 $0.67, 배치면 ~$0.34 수준.

**리스크** — 생성물에 SynthID 워터마크 포함 [추정: Gemini 이미지 정책 관행]. 인물·캐릭터 일관성은 참조 이미지 입력으로 보완 필요. API 정책상 콘텐츠 필터로 일부 장면 거부 가능.

출처: [Google 공식 이미지 생성 문서](https://ai.google.dev/gemini-api/docs/image-generation), [Gemini API 가격](https://ai.google.dev/gemini-api/docs/pricing), [OpenRouter 리스팅](https://openrouter.ai/google/gemini-3.1-flash-image-preview)

---

## 6. "오픈이미지2" — 후보 분석

사용자 언급 명칭과 정확히 일치하는 제품은 없다. 유력 후보 3개와 판단 근거:

**후보 1 (가장 유력): OpenAI GPT Image 2 (`gpt-image-2` / "ChatGPT Images 2.0")** — [사실] 2026-04-21 공개, 5월 초 API 개방. 국내 언론이 "**오픈AI 이미지 2.0**"으로 보도 → "오픈이미지2"로 축약됐을 개연성이 가장 높다 [추정]. 특징: 추론(Thinking) 기반 생성, 최대 4K, **CJK 포함 텍스트 렌더링 ~99% 정확도**(한글 자막·타이틀 카드 생성에 강점), DALL-E는 5월 12일 종료. 가격은 서드파티(fal.ai) 기준 저품질 $0.01/장부터.

**후보 2: Qwen-Image 2.0** — [사실] 2026-02-10 공개, 생성+편집 통합 7B 단일 모델, 네이티브 2K, **오픈 가중치(로컬 실행 가능)**, 이미지 내 텍스트 정확도 오픈소스 최강(단, 영/중 타이포그래피 중심). "오픈(소스) 이미지 (모델) 2"로 불렸을 가능성 [추정].

**후보 3: FLUX.2 (Black Forest Labs)** — [사실] 오픈 가중치 체크포인트(Klein 등) 제공, 프로덕션급 품질, 4MP 지원. ComfyUI 생태계 표준에 가까움.

**권고** [제안]: 사용자에게 확인하되, 설계상으로는 "클라우드 이미지 슬롯"(GPT Image 2 / Nano Banana 2)과 "로컬 이미지 슬롯"(Qwen-Image/FLUX.2 via ComfyUI)을 어댑터 패턴으로 모두 수용하면 어느 해석이든 커버된다.

출처: [OpenAI 발표](https://openai.com/index/introducing-chatgpt-images-2-0/), [gpt-image-2 모델 문서](https://developers.openai.com/api/docs/models/gpt-image-2), [와우테일 국내 보도](https://wowtale.net/2026/04/23/257527/), [BentoML 오픈소스 이미지 모델 가이드](https://www.bentoml.com/blog/a-guide-to-open-source-image-generation-models), [Thunder Compute 2026 랭킹](https://www.thundercompute.com/blog/best-open-source-image-generation-models)

---

## 7. "Insane Search" — 실체 확인됨

**무엇인가** — [사실] **`fivetaku/insane-search`** — 한국 AI 커뮤니티(GPTaku)에서 만든 **Claude Code 플러그인**. 웹 페치가 차단될 때 자동으로 우회 경로를 찾는 도구다. API 키·로그인 불필요. Phase 0→3 적응형 에스컬레이션: 공개 API 리더 → 신디케이션 게이트웨이 → TLS 임퍼서네이션 → 헤드리스 브라우저 순으로 시도. 지원 대상: X(oEmbed), Reddit, YouTube 자막, HN, **네이버, 쿠팡**, LinkedIn, Medium, Substack, arXiv, GitHub, Bluesky, RSS 일반.

설치: `/plugin marketplace add https://github.com/fivetaku/gptaku_plugins.git` → `/plugin install insane-search@gptaku-plugins`.

**파이프라인 위치** — "시나리오 리서치"(트렌드/소재 수집) 단계. 단 **Claude Code 세션용 플러그인**이므로 Danbi Studio 앱 내 프로그래매틱 검색 엔진으로 직접 쓰긴 어렵다 [사실+추정].

**앱 내장용 대안** [제안]: Tavily Search API(에이전트 특화, 무료 티어), Exa(시맨틱 검색), Brave Search API, Perplexity API(검색+요약 통합). 공개 콘텐츠 스크레이핑은 사이트 ToS·robots 준수 필요(insane-search 자체도 "공개 콘텐츠만, 로그인·페이월은 우회하지 않음"을 명시).

출처: [insane-search GitHub](https://github.com/fivetaku/insane-search), [한국어 README](https://github.com/fivetaku/insane-search/blob/main/README.ko.md), [gptaku_plugins](https://github.com/fivetaku/gptaku_plugins), [Tavily 등 검색 MCP 비교](https://fast.io/resources/best-mcp-servers-search/)

---

## 8. 업로드 자동화 (YouTube / TikTok / Instagram)

### YouTube Data API v3 (Shorts)
- [사실] Shorts 전용 API 없음 — `videos.insert`로 세로 영상(요건 충족 시)을 올리면 자동으로 Shorts 판정.
- 인증: OAuth 2.0(데스크톱은 loopback/설치형 앱 플로우 + refresh token). `youtube.upload`는 민감 스코프라 **OAuth 동의화면 검증 필요**.
- 쿼터: [사실] `videos.insert` = **1,600유닛**, 기본 일일 10,000유닛 → **하루 약 6개 업로드**. 증량은 감사(Audit) 신청 필요, 기간 보장 없음.
- 핵심 제약: [사실+통용] 미감사(unaudited) API 프로젝트로 올린 영상은 **비공개(private) 잠금** 처리될 수 있음 → 실서비스 전 API 컴플라이언스 감사 필수.
- 현실적 접근: 개인 채널 자동화(사용자 본인 소유 프로젝트)는 진입장벽 낮음. 하루 6개면 쇼츠 채널 1~2개 운영에 충분.

### TikTok Content Posting API
- [사실] Direct Post(즉시 게시)와 Upload(초안→앱에서 확인) 두 모드. **미감사 클라이언트는 SELF_ONLY(본인만 보기)로만 게시 가능 + 24시간당 최대 5명 사용자 + 게시 시점에 계정이 비공개 상태여야 함**. 공개 게시하려면 **감사(audit) 통과 필수**(커뮤니티 보고 기준 1~2주, 스코프별 데모 영상 요구).
- 인증: OAuth 2.0(`video.publish`, `video.upload` 스코프). 리다이렉트 URI가 필요해 데스크톱 앱은 로컬 루프백 서버 또는 개발자 웹 콜백 브리지 필요 [추정: TikTok은 https 콜백 요구 관행].
- 현실적 접근: 초기에는 "Upload(초안) 모드 + 사용자가 TikTok 앱에서 최종 게시" 반자동이 안전. 완전 자동은 감사 통과 후.

### Instagram Reels (Graph API)
- [사실] **비즈니스 계정 필수**(구 Graph API는 Facebook 페이지 연결 필요). 권한은 `instagram_business_content_publish` 등 신형 스코프(구 스코프는 2025-01-27 폐기) — **Meta 앱 리뷰(스크린캐스트 포함, 2~4주)** 필요.
- 게시 흐름: [사실] 컨테이너 모델 — `POST /{ig-user-id}/media`(컨테이너 생성)→처리 대기→`/media_publish`. **video_url은 공개 접근 가능한 URL이어야 함**(로컬 우선 앱은 임시 호스팅 필요; Reels용 resumable upload 프로토콜 존재 여부는 구현 전 공식 문서 재확인 권장 [추정]).
- 제한: [사실] 24시간당 100건. Reels 탭 노출 요건: 9:16, (권장) 90초 이내, H.264+AAC.
- 현실적 접근: 셋 중 진입장벽 최고(비즈니스 계정 전환 + 앱 리뷰 + 공개 URL 요건). 마지막 단계로 미루는 것이 합리적.

**공통 설계 제안** [제안]: 데스크톱 앱은 각 플랫폼 OAuth를 로컬 브라우저로 위임하고 refresh token을 OS 키체인에 저장. 단계적 출시 — ① YouTube(즉시 가능) → ② TikTok 초안 모드 → ③ TikTok 감사·Instagram 앱 리뷰 통과 후 완전 자동. 서드파티 통합 API(Blotato 등)나 브라우저 자동화는 비용/ToS 위반 리스크가 있어 보조 수단으로만.

출처: [YouTube 쿼터 계산기](https://developers.google.com/youtube/v3/determine_quota_cost), [YouTube API 한도 2026](https://www.getphyllo.com/post/youtube-api-limits-how-to-calculate-api-usage-cost-and-fix-exceeded-api-quota), [TikTok Direct Post 문서](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post), [TikTok 콘텐츠 공유 가이드라인](https://developers.tiktok.com/doc/content-sharing-guidelines), [Instagram Reels API 가이드](https://www.getphyllo.com/post/a-complete-guide-to-the-instagram-reels-api), [Reels 게시 가이드 2026](https://postproxy.dev/blog/instagram-reels-api-publishing-guide/)

---

## 종합: 파이프라인 단계별 도구 매핑

| 단계 | 1순위 | 대안 | 실행 위치 |
|---|---|---|---|
| 시나리오 리서치 | Tavily/Exa API | insane-search(Claude Code 한정) | 클라우드 |
| 시나리오/대본/콘티 | LM Studio + Kanana(Apache-2.0) | 클라우드 LLM 하이브리드 | 로컬 |
| 콘티→이미지 | Nano Banana 2($0.067/1K장) 또는 GPT Image 2 | Qwen-Image 2.0/FLUX.2 (ComfyUI 로컬) | 클라우드/로컬 |
| 음성(TTS) | Fun-CosyVoice 3.0(한국어, 클로닝) | 클라우드 TTS | 로컬 |
| 자막 정렬/QC | SenseVoice-Small(Apache-2.0, CPU 가능) | Whisper | 로컬 |
| BGM | ACE-Step 1.5(MIT, VRAM<4GB) | — | 로컬(ComfyUI) |
| 실행 엔진 | ComfyUI REST(/prompt)+WS, 템플릿 JSON 버전 관리 | — | 로컬 |
| 업로드 | YouTube(쿼터 6편/일) → TikTok(감사 필요) → IG Reels(앱 리뷰+공개 URL) | 반자동 초안 모드 | 클라우드 API |

**전체 리스크 톱3**: ① TikTok/Instagram 공개 게시는 심사 통과 전까지 완전 자동화 불가(반자동 폴백 설계 필수) ② "오픈이미지2" 실체는 사용자 확인 필요(GPT Image 2가 유력) ③ 단일 GPU에서 이미지·음악·영상 작업 VRAM 경합 → 작업 큐 직렬화 및 모델 언로드 전략 필요.