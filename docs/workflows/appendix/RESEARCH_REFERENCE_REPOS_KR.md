> 본 문서는 2026-07-05 파이프라인 집중 분석 세션의 리서치 산출물 원본이다.

# 참고 저장소 조사 보고서 — 영상 자동화 파이프라인 설계 근거 자료

- 조사일: 2026-07-05 / 조사 방법: GitHub 페이지·GitHub API·웹 검색(WebFetch/WebSearch)
- 대상 파이프라인: 시나리오 → 대본 → 콘티 → 이미지 생성 → 동영상·음성 생성 → 편집(Danbi Studio, Electron+Next.js, Windows 로컬) → 업로드(쇼츠/릴스/틱톡)
- 표기 원칙: 수치·라이선스는 GitHub API/페이지에서 직접 확인한 **사실**. "판단/추측"으로 표시한 부분은 조사자의 평가.

## 0. 요약 표

| # | 저장소 | 정체 | 라이선스 | 활성도 | 권고 |
|---|--------|------|----------|--------|------|
| 1 | obra/superpowers | Claude Code 스킬 프레임워크·개발 방법론 | MIT | 매우 높음 (246k★, 7/2 푸시) | **참고**(개발 방법론) |
| 2 | NousResearch/hermes-agent | 자기개선형 범용 AI 에이전트 | MIT | 매우 높음 (209k★, 7/5 푸시) | **보류**(2단계 재검토) |
| 3 | calesthio/OpenMontage | 에이전트형 영상 제작 시스템 | **AGPL-3.0** | 높음 (33.3k★) | **참고**(아키텍처)·코드 편입 금지 |
| 4 | Forward-Future/loopy | 에이전트 루프 라이브러리+스킬 | MIT | 중간 (2.4k★) | 참고 |
| 5 | revfactory/webtoon-harness | 웹툰 제작 Claude Code 하니스 | MIT | 낮음 (254★, 커밋 2개) | **참고**(콘티 단계 구조 차용) |
| 6 | Alisa0808/vibe-creating-skill | 텍스트→비디오 프롬프트 정제 스킬 | MIT | 낮음 (93★) | **채택**(경량) |
| 7 | palmier-io/palmier-pro | macOS AI 비디오 편집기 | **GPL-3.0** | 매우 높음 (10k★, 7/5 푸시) | **참고**(UX 벤치마크)·코드 재사용 제외 |
| 8 | code-yeongyu/lazycodex | 복잡 코드베이스용 에이전트 하니스 | MIT | 높음 (2.4k★, 7/1 릴리스) | 참고 |
| 9 | Yeachan-Heo/gajae-code | 외부 코딩 에이전트 러너 | MIT | 높음 (1.6k★, 7/4 릴리스) | 참고 |
| 10 | kimsh-1/gongnyang-prompt-kit | 이미지 프롬프트 컴파일러 스킬 | MIT | 낮음 (109★) | **채택**(경량) |
| 11 | kimsh-1/codex-fleet | Codex 병렬 배치 실행 스킬 | MIT | 낮음 (20★) | 참고(패턴만) |
| 12 | DietrichGebert/ponytail | 미니멀 코딩 원칙 스킬 | MIT | 매우 높음 (74.2k★) | 참고(개발 보조)/파이프라인 제외 |
| 13 | diffusionstudio/lottie | AI 에이전트용 Text-to-Lottie | MIT | 높음 (4.5k★, v1.0.0) | **채택** |
| 14 | asgeirtj/system_prompts_leaks | AI 시스템 프롬프트 아카이브 | CC0-1.0 | 매우 높음 (49.3k★) | 참고 |
| 15 | baidu/Unlimited-OCR | 원샷 장문 OCR 모델(arXiv 2606.23050) | MIT | 높음 (13.3k★) | 보류(한국어 검증 후) |
| 16 | digital.khs.go.kr | 국가유산 디지털 데이터 포털 | 공공누리(유형별 상이) | 정부 운영 | **채택**(콘텐츠 소스) |

---

## 1. obra/superpowers — Claude Code 스킬 프레임워크

- **정체(사실)**: Jesse Vincent가 만든 에이전틱 스킬 프레임워크이자 소프트웨어 개발 방법론. 브레인스토밍→계획 작성→TDD 구현→서브에이전트 주도 개발→코드 리뷰→체계적 디버깅의 스킬 라이브러리를 제공. Claude Code, Codex, Cursor 등 다수 에이전트 지원. 현재 이 세션 환경에도 superpowers 플러그인이 설치되어 있음(설치 사실 확인).
- **라이선스/활성도(사실)**: MIT. 246,499★, 최신 릴리스 v6.1.1(2026-07-02). 매우 활발.
- **파이프라인 적용 지점**: 파이프라인 **런타임 구성요소가 아니라 파이프라인을 "개발하는" 방법론**. Danbi Studio 개편·파이프라인 스킬 작성 시 `writing-skills`, `writing-plans`, `subagent-driven-development`를 그대로 사용.
- **권고: 참고(개발 방법론으로는 사실상 채택)**. 콘텐츠 파이프라인의 각 단계(시나리오/콘티/생성)를 superpowers 스타일의 스킬 문서로 정의하면 유지보수성이 높아짐(판단).

## 2. NousResearch/hermes-agent — "헤르메스 에이전트 필요한가?"

- **정체(사실)**: Nous Research의 자기개선형 범용 에이전트("The agent that grows with you"). 특징: (a) 경험에서 스킬을 자동 생성·개선하는 폐쇄 학습 루프, (b) 에이전트 큐레이션 메모리 + FTS5 세션 검색, (c) Telegram/Discord/Slack/WhatsApp/Signal/CLI 멀티 게이트웨이, (d) 내장 cron 스케줄러, (e) 병렬 서브에이전트, (f) Docker/SSH/Modal 등 분산 실행, (g) OpenRouter 포함 300+ 모델, (h) 웹검색·이미지 생성(FAL)·TTS(OpenAI) 등 40+ 내장 도구, agentskills.io 스킬 표준 호환. Python 82%.
- **라이선스/활성도(사실)**: MIT. 209,393★, v0.18.0(2026-07-01), 7/5에도 푸시 — 최상위권 활성도.
- **오케스트레이터 적합성 판단(핵심 질문에 대한 답)**:
  - **적합한 점**: 이미지 생성·TTS 도구 내장, cron으로 "매일 쇼츠 1편 자동 생산" 같은 무인 스케줄 운용 가능, 메신저 게이트웨이로 승인/알림 루프(예: 텔레그램으로 콘티 승인) 구현 용이. 스킬 표준이 Claude 스킬과 유사해 자산 이식 가능.
  - **부적합한 점**: 범용 개인 비서 지향이라 영상 도메인 특화 기능(콘티, 타임라인, 렌더링)은 전무 — 결국 도구·스킬은 직접 작성해야 함. Python 상주 프로세스라 Electron+Next.js인 Danbi Studio와 스택이 분리됨. 현재 사용자 환경은 이미 Claude Code + 스킬 + MCP 오케스트레이션 체계를 갖추고 있어 **역할이 중복**됨(판단).
  - **결론(판단)**: "필요한가?" → **지금 당장은 아니다.** 1단계(반자동, 사람이 Claude Code를 구동)는 기존 Claude Code 스킬 체계로 충분. 2단계(완전 무인: 스케줄 생산 + 메신저 승인 + 자동 업로드)로 갈 때 hermes-agent를 **상시 데몬 오케스트레이터**로 도입하는 것이 가장 유력한 후보다. 그때도 Danbi Studio와는 CLI/MCP/파일 프로토콜로 느슨하게 연결할 것.
- **권고: 보류(2단계에서 최우선 재검토)**.

## 3. calesthio/OpenMontage — 가장 직접적인 경쟁/참고 시스템

- **정체(사실)**: "세계 최초 오픈소스 에이전트형 영상 제작 시스템". 12개 제작 파이프라인(해설영상, 다큐, 토킹헤드, 애니메이션 등), 52개 도구(영상 생성·이미지·TTS·음악·후반작업), 500+ 에이전트 스킬, 실시간 제작 보드(Backlot)와 승인 게이트, FLUX/Runway/Veo/ElevenLabs/Suno 연동, 품질·비용 기준 자동 프로바이더 선택. Python+FFmpeg+React/Remotion.
- **라이선스/활성도(사실)**: **AGPL-3.0**. 33.3k★, 2026-03 생성 후 급성장, 7/4 푸시.
- **파이프라인 적용 지점**: 우리가 만들려는 "시나리오→생성→편집" 전 구간과 개념적으로 거의 동일. 특히 (a) 파이프라인/승인 게이트 설계, (b) 멀티 프로바이더 스코어링 선택, (c) 리서치→대본 선행 단계 설계의 **아키텍처 교과서**.
- **주의(사실+판단)**: AGPL-3.0은 네트워크 서비스 형태 제공 시에도 소스 공개 의무가 발생하는 강한 카피레프트. **Danbi Studio 코드베이스에 소스를 직접 편입하면 전체가 AGPL 오염될 위험**이 있음. 사용하려면 별도 프로세스(CLI 호출)로 격리하거나, 아이디어·프롬프트 구조만 재구현해야 함.
- **권고: 참고(아키텍처 1순위 벤치마크). 코드 편입은 제외, 격리 실행 형태의 부분 활용은 가능.**

## 4. Forward-Future/loopy

- **정체(사실)**: 반복 가능한 에이전트 워크플로(루프)의 공개 카탈로그 + 설치형 스킬. Discover/Find/Audit/Adapt/Craft/Run/Debrief/Save/Publish 9개 경로. Claude Code·Codex·Cursor에 npx로 설치.
- **라이선스/활성도(사실)**: MIT, 2.4k★, 183커밋.
- **적용 지점/권고**: "매일 트렌드 조사→소재 선정→대본" 같은 **반복 루프의 설계·문서화 형식**으로 참고. 핵심 의존성으로 삼을 이유는 없음(판단). **참고**.

## 5. revfactory/webtoon-harness — 콘티 단계의 직접 선례

- **정체(사실)**: 트렌드 리서치→시나리오→작화→세로 스크롤 뷰어 조립까지 웹툰 제작을 자동화하는 Claude Code 하니스. 27개 에이전트를 리서치/시나리오/비주얼/조립 4개 팀으로 편성. 캐릭터 일관성용 레퍼런스 시트 선렌더링, 말풍선을 이미지에 직접 베이킹, 최대 5개 동시 Codex CLI 렌더링, 6축 검증 루프, 에피소드 간 연속성 추적.
- **라이선스/활성도(사실)**: MIT, 254★, **커밋 2개** — 사실상 일회성 공개물이며 유지보수 기대 불가.
- **적용 지점**: 우리 파이프라인의 **"대본→콘티→이미지 생성" 구간과 구조가 정확히 일치**. 특히 (a) 레퍼런스 시트로 캐릭터/스타일 일관성 확보, (b) 팀 단위 에이전트 분업, (c) 검증 루프 설계는 그대로 차용할 가치가 큼(판단).
- **권고: 참고(구조·프롬프트 차용). 의존성으로는 부적합(활성도 낮음).**

## 6. Alisa0808/vibe-creating-skill

- **정체(사실)**: 러프한 아이디어를 텍스트→비디오 모델용 정제 프롬프트로 변환하는 스킬. ByteDance/Volcengine 공개 방법론의 독립 포트. 시각 앵커/액션·상태/톤/테마 4개 검증 레이어. Seedance 2.0, Kling, Veo, Hailuo 등 호환. Claude Code·Codex·Hermes 등 지원. 영/중 이중어.
- **라이선스/활성도(사실)**: MIT, 93★, 커밋 20개 — 소규모.
- **적용 지점/권고**: **"콘티→동영상 생성" 단계의 프롬프트 품질 게이트로 경량 채택**. 스킬 파일 몇 개 수준이라 포크해서 한국어화·모델 커스터마이즈하기 쉬움(판단). **채택(포크 후 자체 유지)**.

## 7. palmier-io/palmier-pro — 편집기 벤치마크 (사용자 메모 검증)

- **정체(사실)**: "AI를 위해 만든 macOS 비디오 편집기". Swift 98.7%, macOS 26(Tahoe)+Apple Silicon 전용. Premiere/CapCut급 타임라인 편집 + Seedance/Kling 등 생성 AI 내장 + **MCP 통합으로 Claude Code/Cursor/Codex 에이전트가 편집기를 직접 조작**.
- **라이선스/활성도(사실)**: GPL-3.0. 9,969★, v0.6.1(2026-07-04), 매우 활발.
- **사용자 메모 검증**: "편집기는 완전 오픈소스" — **부분적으로만 사실**. README 기준 편집기 본체는 오픈소스지만 **생성형 AI 기능은 유료 구독**이며, 라이선스도 MIT가 아닌 GPL-3.0.
- **적용 지점(판단)**: Windows 기반 Danbi Studio에 Swift/macOS 코드는 재사용 불가. 대신 (a) **"에이전트가 MCP로 편집기를 조작한다"는 인터페이스 설계**(어떤 툴을 노출하는지: 클립 배치, 컷 편집, 자막, 렌더 등), (b) 타임라인 UX, (c) 생성 AI-편집기 결합 방식을 Danbi Studio 완성도 업그레이드의 벤치마크로 삼을 것. GPL이므로 코드 이식은 라이선스상도 부적절.
- **권고: 참고(기능·MCP 인터페이스 벤치마크 1순위). 코드 채택 제외.**

## 8. code-yeongyu/lazycodex

- **정체(사실)**: 복잡한 코드베이스용 에이전트 하니스. 프로젝트 메모리, 계획, 병렬 실행, 작업별 다중 모델 라우팅, 스킬 시스템. 코어는 oh-my-openagent 서브모듈. TypeScript 중심.
- **라이선스/활성도(사실)**: MIT, 2.4k★, v4.15.1(2026-07-01).
- **적용 지점/권고**: 파이프라인 자체보다 **Danbi Studio 개발 생산성 도구**. 다중 모델 라우팅 아이디어는 파이프라인의 "단계별 모델 선택"(대본=고성능, 프롬프트 변환=저비용) 설계에 참고 가치(판단). **참고**.

## 9. Yeachan-Heo/gajae-code

- **정체(사실)**: "의도를 인코딩하고 소프트웨어를 디코딩하는" 코딩 에이전트 러너. deep-interview(요구사항 구체화), ralplan(계획 검토), ultragoal(증거 기반 검증), team(병렬 tmux 워커), Telegram 알림. TypeScript+Rust.
- **라이선스/활성도(사실)**: MIT, 1.6k★, v0.8.1(2026-07-04), 1,405커밋 — 활발.
- **적용 지점/권고(판단)**: tmux 의존이라 Windows 네이티브 환경과 궁합이 나쁨(WSL 필요 추정). "장시간 목표 추적+메신저 알림" 패턴은 무인 파이프라인 감시 설계에 참고. **참고**.

## 10. kimsh-1/gongnyang-prompt-kit

- **정체(사실)**: "포스터 하나 만들어줘" 수준의 요청을 GPT Image-2용 완성 프롬프트(장면/카메라/조명/HEX 색상/텍스처)로 컴파일하는 Claude Code 스킬. 한국형 포스터·카드뉴스 포함 12개 카테고리(C1–C12), 검증 스크립트, 8개 프리셋.
- **라이선스/활성도(사실)**: MIT, 109★, 커밋 24개.
- **적용 지점/권고**: **"콘티→이미지 생성" 프롬프트 컴파일 단계에 경량 채택**. 한국어 콘텐츠(카드뉴스·포스터) 카테고리가 있어 국내향 쇼츠 썸네일/인서트 이미지 생성과 궁합이 좋음(판단). vibe-creating-skill(영상용)과 짝을 이루는 이미지용 프롬프트 게이트. **채택(포크 후 이미지 모델을 우리 파이프라인 모델로 치환)**.

## 11. kimsh-1/codex-fleet

- **정체(사실)**: `codex exec` 백그라운드 프로세스를 병렬 스폰해 배치 이미지 생성 등 대량 작업을 처리하는 스킬 모음(codex-imagegen, codex-spawn). PARALLEL 파라미터로 워커 풀 조절, 레이스 컨디션·모더레이션 거부 처리 포함.
- **라이선스/활성도(사실)**: MIT, 20★, 커밋 7개, Codex CLI+ChatGPT Plus/Pro 계정 필요.
- **적용 지점/권고(판단)**: "콘티 컷 20장을 병렬 생성"할 때의 **워커 풀·출력 수집 패턴**만 차용. Codex 계정 의존과 극소 규모라 직접 의존은 부적절. **참고(패턴만)**.

## 12. DietrichGebert/ponytail

- **정체(사실)**: 에이전트가 과잉 설계 없이 최소 코드만 쓰게 하는 스킬(YAGNI→재사용→표준라이브러리→최소 신규 코드의 결정 사다리). 16+ 에이전트 지원. 코드량 ~54% 감소·~20% 비용 절감 주장(자체 측정).
- **라이선스/활성도(사실)**: MIT, 74,228★, v4.8.4(2026-06), 활발.
- **적용 지점/권고**: 영상 파이프라인과 무관한 **개발 보조 스킬**. Danbi Studio 코드베이스 비대화 방지용으로는 유용(판단). **파이프라인 관점에서는 제외, 개발 도구로는 참고**.

## 13. diffusionstudio/lottie — 편집 단계 모션그래픽

- **정체(사실)**: AI 코딩 에이전트가 자연어로 프로덕션급 Lottie 애니메이션을 생성하게 하는 오픈소스 프레임워크. 라이브 프리뷰 플레이어, 타이밍/그라디언트/카메라 제어, 웹·RN·iOS·Android·Flutter 내보내기. `npx skills add diffusionstudio/lottie`로 설치. 제작사는 Diffusion Studio(웹 기반 영상 편집 엔진 core로 알려진 회사 — 이 관계는 페이지에 명시되지 않음, 추정).
- **라이선스/활성도(사실)**: MIT, 4.5k★, v1.0.0(2026-06-15). TypeScript 중심.
- **적용 지점/권고**: **채택 1순위.** Lottie는 웹 렌더러(lottie-web)로 재생 가능하므로 Electron+Next.js인 Danbi Studio 스택과 궁합이 완벽함(판단). 쇼츠용 자막 강조, 타이틀 카드, 트랜지션, 인포그래픽 오버레이를 "대본→Lottie 코드 생성→타임라인 오버레이"로 자동화하는 편집 단계 구성요소로 통합 권고. **채택**.

## 14. asgeirtj/system_prompts_leaks

- **정체(사실)**: Claude(Fable 5, Opus 4.8, Claude Code 포함), ChatGPT 5.5, Gemini 3.5, Grok, Cursor, Copilot 등 상용 AI의 시스템 프롬프트를 문서화한 아카이브. CC0-1.0(퍼블릭 도메인). 49.3k★, 2026-07-01 업데이트로 매우 활발.
- **적용 지점/권고(판단)**: 파이프라인 구성요소는 아니고, **오케스트레이터/에이전트 프롬프트 설계 시의 레퍼런스**(상용 서비스들이 도구 호출·안전장치·출력 형식을 어떻게 지시하는지). CC0라 발췌 활용도 자유. **참고**.

## 15. Baidu Unlimited-OCR (arXiv 2606.23050)

- **정체(사실)**: Baidu의 원샷 장문 OCR 모델. Reference Sliding Window Attention(R-SWA)으로 출력 길이와 무관하게 KV 캐시를 상수로 유지, 여러 페이지를 단일 포워드 패스로 파싱. OmniDocBench v1.5에서 93%(DeepSeek OCR 대비 +6%). 코드·가중치 공개: [github.com/baidu/Unlimited-OCR](https://github.com/baidu/Unlimited-OCR), MIT, 13.3k★, vLLM/SGLang 지원, NVIDIA GPU 필요.
- **적용 지점(판단)**: 파이프라인의 **소스 수집 단계** — 스캔 문서·PDF 보고서(예: 국가유산 발굴 보고서)를 시나리오 원천 텍스트로 변환. 단 **한국어 지원 여부가 문서에 명시돼 있지 않아** 국내 자료 처리 성능은 미검증(사실: 미명시).
- **권고: 보류.** 한국어 문서 벤치마크를 직접 돌려본 뒤 채택 여부 결정. 대안: 한국어에 강한 상용 OCR(네이버 클로바 OCR) 또는 멀티모달 LLM 직접 파싱.

## 16. 국가유산 디지털 서비스 (digital.khs.go.kr)

- **정체(사실)**: 국가유산청 운영 포털. 사진·도면·3D 정밀데이터·보고서·다큐 영상 등 **약 68만 건의 국가유산 디지털 데이터**를 개방. 3D 에셋은 게임·영화용으로 제공되며 언리얼 마켓플레이스·유니티 에셋스토어·스케치팹에도 배포. AR/파노라마/세계유산 영상 등 테마 콘텐츠 보유.
- **이용 조건(사실+주의)**: 공공누리 체계 적용. 다만 **공공누리는 제1~4유형이 있고, 제3·4유형은 상업적 이용이 금지**되므로 항목별 유형 확인이 필수. "무료 활용 개방" 홍보 문구만 믿고 수익형 쇼츠에 쓰면 안 됨(판단). 공개 API는 이 포털 자체에는 미확인 — 국가유산청의 기존 OpenAPI(문화유산 정보)와 병행 조사가 필요(추측).
- **적용 지점/권고**: **채택(콘텐츠 소스 1순위).** "한국 문화유산 쇼츠" 같은 채널 기획 시 시나리오 소재(보고서·해설) + 비주얼 소스(고해상도 사진·3D 렌더·다큐 푸티지)를 한 곳에서 확보 가능. 파이프라인에 "소스 수집기(공공누리 유형 필터 내장)" 모듈로 설계 권고.

---

## 종합: 파이프라인 단계별 매핑 (판단)

| 단계 | 활용 자원 |
|------|-----------|
| 소스 수집 | **digital.khs.go.kr(채택)**, Unlimited-OCR(보류, 한국어 검증) |
| 시나리오/대본 | Claude Code + superpowers식 스킬(참고), loopy 루프 형식(참고) |
| 콘티→이미지 | webtoon-harness 구조 차용(참고), **gongnyang-prompt-kit(채택)**, codex-fleet 병렬 패턴(참고) |
| 이미지→동영상/음성 | **vibe-creating-skill(채택)**, OpenMontage 프로바이더 선택 로직(아키텍처 참고, AGPL 격리) |
| 편집(Danbi Studio) | **diffusionstudio/lottie(채택)**, palmier-pro MCP 인터페이스·UX 벤치마크(참고) |
| 오케스트레이션 | 1단계: Claude Code 스킬 체계(현행), 2단계 무인화: **hermes-agent 재검토(보류)** |
| 업로드 | 이번 조사 대상에 직접 해당 자원 없음 — 별도 조사 필요(YouTube Data API, 틱톡/메타 업로드 API) |

**핵심 결론 3가지**
1. **헤르메스 에이전트는 "지금은 불필요, 무인화 단계의 1순위 후보"**다. 현재 반자동 단계에서는 기존 Claude Code 오케스트레이션과 중복되고, cron+메신저 승인+자기개선 스킬이 필요해지는 완전 자동화 단계에서 도입 가치가 커진다.
2. **라이선스 지뢰 2곳**: OpenMontage(AGPL-3.0)와 palmier-pro(GPL-3.0)는 아키텍처·UX 참고만 하고 코드는 Danbi Studio에 편입하지 말 것. 나머지 채택 후보는 전부 MIT/CC0라 안전하다.
3. **즉시 채택 가능한 경량 자산**은 diffusionstudio/lottie(편집 오버레이), gongnyang-prompt-kit(이미지 프롬프트), vibe-creating-skill(영상 프롬프트), 국가유산 디지털 서비스(소재)이며, 모두 낮은 통합 비용으로 파이프라인 품질을 끌어올린다.

### 출처
- [obra/superpowers](https://github.com/obra/superpowers) · [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) · [calesthio/OpenMontage](https://github.com/calesthio/OpenMontage) · [Forward-Future/loopy](https://github.com/Forward-Future/loopy) · [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) · [Alisa0808/vibe-creating-skill](https://github.com/Alisa0808/vibe-creating-skill) · [palmier-io/palmier-pro](https://github.com/palmier-io/palmier-pro) · [code-yeongyu/lazycodex](https://github.com/code-yeongyu/lazycodex) · [Yeachan-Heo/gajae-code](https://github.com/Yeachan-Heo/gajae-code) · [kimsh-1/gongnyang-prompt-kit](https://github.com/kimsh-1/gongnyang-prompt-kit) · [kimsh-1/codex-fleet](https://github.com/kimsh-1/codex-fleet) · [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) · [diffusionstudio/lottie](https://github.com/diffusionstudio/lottie) · [asgeirtj/system_prompts_leaks](https://github.com/asgeirtj/system_prompts_leaks)
- [baidu/Unlimited-OCR](https://github.com/baidu/Unlimited-OCR) · [arXiv 2606.23050](https://arxiv.org/html/2606.23050v1) · [HF Papers](https://huggingface.co/papers/2606.23050)
- [국가유산 디지털 서비스](https://digital.khs.go.kr/) · [서비스 소개](https://digital.khs.go.kr/service/servicePage.do) · [이용 가이드](https://digital.khs.go.kr/service/instructionsForUse2.do) · [공공누리 제도 안내](https://www.copyright.or.kr/gov/nuri/rule_info/index.do) · [국가유산청 데이터 개방 보도자료](https://www.cha.go.kr/newsBbz/selectNewsBbzView.do?newsItemId=155705839&sectionId=b_sec_1&mn=NS_01_02)