# 디립다 랜딩 — Vercel 배포 가이드 (PUL-50, 호스팅=Vercel 확정)

이 랜딩은 빌드가 필요 없는 **정적 사이트**(HTML/CSS/JS)입니다. Vercel에 5분이면 공개 URL이 나옵니다.
사장님(CEO) Google/GitHub 계정 로그인이 필요해 에이전트가 대신 못 하는 1회 수동 단계입니다.

## 선행 조건 (순서 중요)
1. **먼저** 리드 백엔드부터 연결하세요 — `backend/apps-script/DEPLOY.md`대로 Apps Script 배포 → `/exec` URL 확보.
   - 그 URL을 이 스레드(PUL-50)에 코멘트로 남기면 제가 `config.js`의 `LEAD_ENDPOINT`에 넣고 라이브 검증합니다.
   - (백엔드 없이 먼저 배포해도 페이지는 뜨지만 제출값이 서버에 안 쌓이고 localStorage 폴백으로만 남습니다.)

## 방법 A — Vercel 대시보드 (권장, GUI)
1. https://vercel.com → **Add New… → Project** → 이 저장소(`l5-business-os`) import.
2. **Root Directory** 를 반드시 **`apps/landing`** 으로 지정. (모노레포이므로 이 설정이 핵심)
3. **Framework Preset = Other**, Build Command 비움, Output Directory 비움(정적 그대로 서빙).
4. **Deploy** → `https://<프로젝트>.vercel.app` URL 생성.
5. (선택) **Settings → Domains** 에서 커스텀 도메인 연결 → 단일 URL 확정.

## 방법 B — CLI
```bash
npm i -g vercel
cd apps/landing
vercel            # 최초: 계정/스코프 선택 후 배포 (Root가 이미 apps/landing이면 그대로)
vercel --prod     # 프로덕션 URL로 승격
```

## 배포 후
- 생성된 공개 URL을 PUL-50 스레드에 코멘트로 남겨주세요.
- 그러면 제가 (1) 모든 YouTube CTA가 이 단일 URL만 가리키도록 정리, (2) 실제 폼 제출 → 시트 적재 라이브 검증을 마치고 이슈를 done 처리합니다.

## 포함된 설정
- `vercel.json`: `cleanUrls`(확장자 없는 경로), 기본 보안 헤더(nosniff/frame/referrer). 정적 사이트라 별도 빌드 설정 불필요.
