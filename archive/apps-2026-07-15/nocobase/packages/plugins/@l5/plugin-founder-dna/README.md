# @l5/plugin-founder-dna

Founder DNA 관리 및 업데이트 제안 (P0 Core MVP).

## 책임

- Founder 성향, 회사 문화, 제약 조건 입력/편집 (Founder DNA Room)
- 누적 인사이트 기반 Founder DNA 업데이트 제안 표시 및 승인
- Founder Brief 생성 요청

## L5 Core 연동

- `generateFounderBrief` — Founder 데이터로부터 brief 생성

## Collections

- `founder_dna`
- `founder_dna_update_suggestion`
- `founder_brief`

## 상태

Scaffold only. 도메인 로직은 `@l5/core`, NocoBase 호출은 미구현 (TODO).
