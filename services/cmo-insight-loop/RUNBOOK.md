# CMO Insight Loop — RUNBOOK

스케줄 태스크(Cowork)가 따르는 실행 절차. 모든 경로는 `services/cmo-insight-loop/` 기준.

## 매일 루프 (21:00 KST)

1. **가이드라인 로드**: `data/guidelines.md` 읽기 — 피드백 누적분을 분석 기준에 반영.
2. **수집**: 사용자 Mac에서 실행 (Desktop Commander):
   ```bash
   cd ~/Desktop/pulk/services/cmo-insight-loop && node scripts/collect.mjs
   ```
   산출: `data/runs/<date>/collected.json` + `thumbs/*.jpg`
3. **분석**: `METHOD.md` 방법론대로 영상 5개 각각 분석.
   - collected.json의 메타+자막 읽기, 썸네일 이미지는 Read 도구로 직접 보기.
   - 자막 없음(available=false) 영상은 썸네일/제목 분석만 하고 도입부는 "자막 없음" 표기.
4. **인사이트 저장**: `data/insights/<date>.md` — METHOD.md 산출물 포맷.
5. **리포트 생성**: `report-template.html` 스타일로 `data/reports/<date>.html` 작성.
6. **발송**:
   ```bash
   node scripts/send-telegram.mjs --html data/reports/<date>.html --caption "📊 CMO 인사이트 <date> — 영상 5개 분석"
   ```
7. 실패 시: 실패 단계와 원인을 텔레그램 --message로라도 보고.

## 주간 루프 (일요일 22:00 KST)

1. 지난 7일 `data/insights/*.md` 통합 → 반복 등장 패턴/최강 인사이트 선별.
2. 인사이트별 claim 단문 생성: "[패턴명]을 사용하면 [효과]가 생긴다" 형식.
3. `data/brain-queue.jsonl`에 추가. topics 매핑:
   - 썸네일 → `["유튜브_썸네일", "CTR"]`
   - 제목 → `["유튜브_제목", "CTR"]`
   - 도입부 → `["유튜브_훅", "도입부"]`
   - 구조 → `["유튜브_원고", "스토리텔링"]`
4. 동기화:
   ```bash
   node scripts/sync-brain.mjs
   ```
   (Supabase 휴면이면 MCP로 restore_project 후 재시도)
5. 주간 요약을 텔레그램 --message로 발송.

## 피드백 루프

사장님이 채팅으로 인사이트 평가/수정사항을 주면:
1. `data/guidelines.md` 피드백 로그에 날짜와 함께 추가.
2. 다음 매일 루프부터 자동 반영 (1단계에서 항상 읽으므로).

## 주의

- `data/history.json`은 collect.mjs가 자동 갱신 — 직접 수정 금지.
- 토큰/키는 절대 파일에 쓰지 않는다 (plist/credentials.json/env에서 런타임 로드).
- 영상 5개 미만 수집 시에도 있는 만큼 분석하고 리포트에 사유 명기.
