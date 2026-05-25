# @l5/plugin-business-portfolio

사업 아이디어 및 포트폴리오 관리 (P0 Core MVP).

## 책임

- 사업 아이디어 입력/평가 (Founder Fit 점수)
- 포트폴리오 보드: 진행 중/보류/종료 사업 추적
- Business Brief 생성

## L5 Core 연동

- `scoreFounderFit` — 아이디어와 Founder DNA 적합도 점수
- `generateBusinessBrief` — 사업 brief 생성

## Collections

- `business_idea`
- `business`

## 상태

Scaffold only. 도메인 로직은 `@l5/core`, NocoBase 호출은 미구현 (TODO).
