# preflight-report — T0a 도구 사전검증

**실행**: 2026-07-25 · 판정 근거 원본: `.preflight/` (hyperframes-contract.txt · capcut-contract.txt · sample.wav · p6.html)

## 결과 표

| 항목 | 결과 | 선택 경로 | 비고 |
|---|---|---|---|
| P1 whisper 단어 시각 | **O** | **A** | faster-whisper 1.2.1 `word_timestamps=True` → 한국어 단어별 start/end 45개 정상. 유사도 분포: min 0.854 / mean 0.969 (7문장) |
| P1b similarity_threshold | — | — | **확정값: 0.75 유지** (기본값). 분포 최소 0.854 > 0.75. ※ TTS(say -v Yuna) 샘플 기준 잠정 — 첫 실녹음에서 재확인 |
| P2 CapCut 초안 열림 | **X(실측)** | **C 확정** | capcut-cli **0.15.0**. `doctor` ok:true(draft-dir 실재). `quickstart smoke` → 초안 생성+인덱스 등록+lint clean. **[HUMAN] CapCut.app에서 "smoke" 초안 열림 육안 확인 1회 필요** |
| P2b CapCut 계약 | — | — | `.preflight/capcut-contract.txt` 전문 첨부 (doctor/quickstart/draft/segment/text/srt) |
| P2c hyperframes 계약 | **O** | — | **버전 핀: 0.7.71**. `lint`·`inspect` 실재 (inspect는 deprecated → **`check` 사용 권장**). `init --non-interactive` 실재. `render --strict`(lint 연동) 실재 |
| P3 알파 렌더 인식 | **O(실측)** | **A 확정** | hyperframes `render --format mov\|webm` 투명 지원 명시. **[HUMAN] CapCut 오버레이 트랙에서 알파 인식 육안 확인 필요** — 실패 시 경로 D(단색 배경 + 메인 트랙) |
| P4 ffmpeg 필터 | **O** | — | ffmpeg 8.1.1(시스템). aselect·silencedetect·acrossfade·loudnorm·astats **5/5** |
| P6 브라우저 재생·저장 | **O** | **정적 HTML** | Playwright 실측 — Chromium: seek 12.4s OK + Blob 다운로드 OK · WebKit(Safari 엔진): 동일 OK. **[HUMAN] 실 Safari 1회 확인 권장(위험 낮음)** |

## 파생 결정

- **T5 assemble**: 경로 A(CapCut 초안) 주 경로, `--emit both` 기본으로 경로 C(순번 파일 세트) 동시 산출 → 사람 확인 실패 시에도 마감 보험.
- **T8 motion**: hyperframes `0.7.71` 핀(`package.json`). 체인은 `lint → check(inspect 후속) → render --format mov`(알파). CapCut 알파 인식 미확인 대비 렌더 배경 주입 옵션(경로 D)을 bridge에 config로 유지.
- **T4 review**: 정적 HTML 단일 파일 확정. `--watch` 폴백 코드는 만들지 않는다(P6 통과).
- **T3 align**: 경로 A — 단어 시각 정밀 매칭. `word_timing:"estimated"`(경로 B) 필드는 스키마에 유지(방어).

## 사람 확인 대기 (자동 통과 처리 금지)

| # | 항목 | 방법 |
|---|---|---|
| H1 | ~~CapCut.app에서 `smoke` 초안 열림~~ | **실패 확정 (2026-07-25, 판정자: 사장님 — 더블클릭 무반응)** — 원인 실측: 설치된 CapCut은 신형 저장 구조(`template-2.tmp` 바이너리+`Timelines/`)를 쓰고, capcut-cli 0.15.0은 구형 6.5.0(`draft_content.json`)만 생성. CLI가 신형 타임라인을 읽지도 못함("binary/encrypted template-2.tmp"). → **경로 C(순번 파일 세트) 주 경로 확정** (D2 폴백 그대로). capcut 이미터 코드는 보존(구버전·향후 호환 대비) |
| H2 | ~~CapCut 알파(mov) 오버레이 인식~~ | **통과 (2026-07-25, 판정자: 사장님)** — 신규 프로젝트에 alpha-test.mov(ProRes4444) 수동 임포트로 투명 오버레이 확인 → 경로 A(V3 알파) 확정 |
| H3 | ~~실 Safari file:// 재생·다운로드~~ | **통과 (2026-07-25, 판정자: 사장님)** — 구간 재생+다운로드 확인 |
| H4 | P1b 임계값 실녹음 재확인 | 첫 세션 녹음 후 align-report의 low_confidence 분포 확인 |
| L1/L2 | ~~마스터·접합부 청취(픽스처)~~ | **통과 (2026-07-25, 판정자: 사장님)** — 클릭·펌핑·접합부 이상 없음. 실전 녹음에서 재확인 예정 |

## 환경 실측

| 도구 | 버전 |
|---|---|
| ffmpeg | 8.1.1 (/opt/homebrew) |
| yt-dlp | 2026.07.04 |
| faster_whisper | 1.2.1 (/usr/bin/python3) |
| capcut-cli | 0.15.0 |
| hyperframes | 0.7.71 (핀 대상) |
| node | 24.14.1 (>= 22 OK) |
| CapCut 초안 폴더 | `~/Movies/CapCut/User Data/Projects/com.lveditor.draft` |

## T0b 상태

검색 품질 게이트 `hit@5`는 **참조 브랜드 선정 + 사장님 판정**이 필요해 별도 진행(US-02: 측정 하네스 우선 구축). 실측 전 T7은 **A′ 겸용 설계**(어휘 인덱스 기본 + rerank 모듈 config 게이트)로 진행한다.

## CapCut(최신, macOS) 임포트 실측 (2026-07-25, 사장님)

- 미디어 패널 임포트 가능: **mp4 · mov(ProRes4444 알파 포함) · wav**
- 미디어 패널 임포트 불가: **srt** (기타 json 등 비미디어 파일 불가) — SRT는 텍스트/자막 메뉴 경로 확인 필요(리서치 진행 중)
- 파생: 경로 C 산출물은 mp4/mov/wav만 미디어로, 자막은 별도 경로 또는 대안 NLE에서 처리
