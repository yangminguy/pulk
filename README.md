# 디립다 랜딩 페이지 (`apps/landing`)

PUL-6 유튜브 성장 플랜(§4 CTA→리드 경로, §6 즉시 실행)의 **단일 리드 랜딩 페이지**.
모든 YouTube CTA가 향하는 하나의 URL. 정적 사이트(빌드 툴체인 없음) — 어디든 배포 가능.

## 구성

- `index.html` — 3단계 단일 페이지
  1. **STEP 1 자가진단** — 작은 브랜드 콘텐츠 마케팅 자가진단 체크리스트(8문항, 즉시 점수·진단)
  2. **STEP 2 자료 받기** — 이메일 + 카카오톡 **동시 수집**(둘 중 하나 이상)
  3. **STEP 3 무료 진단** — 15분 무료 진단 신청 3문항(이름/브랜드 · 채널 링크 · 가장 답답한 점) + 연락처
- `styles.css` — 디립다 브랜드 토큰(#090909 / #DCDBCE / #E5511F), 다크+오렌지, 모바일 반응형
- `script.js` — 체크리스트 채점, 폼 검증, 리드 제출
- `config.js` — **리드 수집 백엔드 URL 설정 지점**
- `assets/` — 디립다 프로필·배너(브랜딩 산출물에서 복사)

브랜드 근거: `deliverables/diripda-channel-branding-2026-07-18/brand-copy.md`

## 로컬 미리보기

```bash
cd apps/landing
python3 -m http.server 4173
# → http://localhost:4173
```

## 리드 백엔드 연결 (배포 전 필수)

현재 `config.js`의 `LEAD_ENDPOINT`가 비어 있으면 제출값은 브라우저 `localStorage`
(`dripda_leads`)에만 저장되고 사용자에겐 정상 접수로 안내됩니다(임시 폴백, 데이터 유실 방지).

**운영 전 실제 엔드포인트 연결이 필요합니다.** 옵션(택1 — PUL-6 하위 이슈에서 결정):

- **Google Apps Script → 구글시트**: 웹앱 배포 후 URL을 `LEAD_ENDPOINT`에.
- **Formbricks**(이미 스택에 존재): survey/webhook URL.
- **자체 API**(`apps/api-server`): `POST /api/lead` 추가 후 URL.

엔드포인트는 아래 JSON을 받습니다:

```json
{ "ts": "...", "source": "diripda-landing",
  "form_type": "lead_magnet | free_diagnosis",
  "email": "", "kakao": "", "self_score": "0",
  "name": "", "channel": "", "pain": "", "contact": "" }
```

## 배포

정적 파일이므로 Vercel/Netlify/Cloudflare Pages/S3 등 어디든 가능.
Vercel 예: `apps/landing`을 root로 하는 새 프로젝트(빌드 명령 없음, 출력 = 그대로).
배포는 **Release Engineer + CEO 승인** 후 진행(권한 게이트).
