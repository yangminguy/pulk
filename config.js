/* ─────────────────────────────────────────────────────────
   디립다 랜딩 — 런타임 설정
   리드(이메일·카카오톡·무료진단 신청)를 실제로 받는 백엔드 설정.

   ▶ PUL-50 라이브 백엔드 = Supabase Edge Function (submit-lead)
     - 프로젝트: pqqgkhowiaeznkumwhwl (ap-northeast-1)
     - 저장 테이블: public.leads (RLS on, service-role insert 전용)
     - 인증 불필요 공개 인테이크(verify_jwt=false). 프런트는 text/plain(JSON)으로 POST.
     이미 라이브 검증 완료(2폼 삽입·검증·CORS OK).

   LEAD_ENDPOINT 가 비어 있으면 제출값은 브라우저 localStorage 에만
   저장됩니다(데이터 유실 방지용 임시 폴백).
   ───────────────────────────────────────────────────────── */
window.DRIPDA_CONFIG = {
  LEAD_ENDPOINT: "https://pqqgkhowiaeznkumwhwl.supabase.co/functions/v1/submit-lead",
  // 제출 실패 시 안내에 노출할 대체 연락처(선택)
  FALLBACK_CONTACT: "",
};
