# 00 · Global Rules (always loaded)

- pulk CTO는 판단/기획자, ACR Kernel은 실행자. 역할 혼동 금지.
- 핵심 도메인 로직은 `packages/l5-core`에. UI 플러그인에 하드코딩 금지.
- package manager: pnpm. test/build/typecheck는 `pnpm <script>`.
- 작업 전 관련 rules/docs index만 읽는다. 전체 repo 정독 금지(토큰 세금).
- 미커밋 CMO/video-room WIP 파일은 불가침.

## 금지 명령 (§19.1)
`rm -rf` · `git push --force` · `git reset --hard main` · 알 수 없는 패키지 install · `.env` 수정 · production deploy · DB migration apply.

## 작업 전후 필수
- 시작: 작업유형에 맞는 rule + `docs/index/*` 선택 로드.
- 완료: `docs/TASKS.md`, `docs/HANDOFF.md` 갱신. 구조 결정은 `docs/DECISIONS.md`.
