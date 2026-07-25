# brandboy-pipeline (소스 미러)

이 디렉토리는 **작업 레포 `~/brandboy-pipeline`의 소스 스냅샷**이다. GitHub 백업·리뷰용이며, 실제 개발·테스트는 `~/brandboy-pipeline`(독립 npm 레포)에서 한다.

## 왜 미러인가

`docs/cmo/video-pipeline/ARCHITECTURE.md` 결정대로 brandboy는 pulk와 **별도 레포**다 — pulk는 pnpm 강제, brandboy는 npm/npx(hyperframes) 생태계라 워크스페이스를 합치면 상시 충돌 비용이 든다. 그래서 pulk 최상위 `brandboy-pipeline/`에 두되 pnpm 워크스페이스 글롭(`apps/**`·`packages/**`·`services/**`)에는 넣지 않아 pulk 빌드에 영향이 없다.

## 이 미러에 없는 것 (작업 레포에서 재생성)

- `node_modules/` — `npm i` (typescript·tsx·zod·hyperframes@0.7.71)
- 바이너리 테스트 미디어(`*.mov`/`*.mp4`/`*.wav`/`*.png`) — `scripts/verify-*.ts`와 `fixtures/*/make-*.ts`가 ffmpeg로 재생성
- `resolve/media/` 심링크·`projects/` 실작업물·`.cache/`·`.preflight/`

## 실행 (작업 레포에서)

```bash
cd ~/brandboy-pipeline
npm i
npx tsc --noEmit
npx tsx scripts/verify-schema.ts   # 그 외 verify-{scoped-write,align,reanchor,sessions,plan,harvest,review,assemble,qc,resolve,e2e,motion,ingest} + t0b/t9d
```

## 파이프라인 개요

원고+사람 녹음 → 외부 원본 자막 검색으로 구간 발굴 → 사람 검수(스토리보드 승인 ②) → CapCut 초안 / **DaVinci Resolve OTIO 타임라인**(경로 R, 미디어 자동 스테이징) / 순번 파일 세트로 조립. 상세는 `docs/cmo/video-pipeline/`(pulk) + 이 미러의 `spec/`·`docs/`.
