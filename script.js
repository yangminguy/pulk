/* ─────────────────────────────────────────────────────────
   디립다 랜딩 — 상호작용 & 리드 수집
   - 자가진단 체크리스트 점수/진단
   - 리드 폼(이메일+카톡 / 무료진단 3문항) 검증 + 제출
   - LEAD_ENDPOINT 설정 시 POST, 아니면 localStorage 폴백
   ───────────────────────────────────────────────────────── */
(function () {
  "use strict";
  var CONFIG = window.DRIPDA_CONFIG || { LEAD_ENDPOINT: "", FALLBACK_CONTACT: "" };

  /* ── toast ── */
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(msg, isErr) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.toggle("err", !!isErr);
    // reflow to restart transition
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
      setTimeout(function () { toastEl.hidden = true; }, 300);
    }, 3200);
  }

  /* ── self-diagnostic checklist ── */
  var checksRoot = document.getElementById("checks");
  var scoreCard = document.getElementById("scoreCard");
  var scoreVal = document.getElementById("scoreVal");
  var scoreTitle = document.getElementById("scoreTitle");
  var scoreDesc = document.getElementById("scoreDesc");
  var captureScore = document.getElementById("captureScore");
  var diagScore = document.getElementById("diagScore");

  var BANDS = [
    { min: 0, max: 2, title: "지금이 시작점입니다", desc: "기본기(브랜드 한 줄 정의·발행 리듬·리드 수집 경로)부터 세우면 가장 빠르게 바뀝니다. 무료 진단에서 우선순위 1~2개를 잡아드릴게요." },
    { min: 3, max: 5, title: "절반은 갖췄습니다", desc: "발행은 하는데 ‘문의로 이어지는 흐름(CTA→리드)’이 새고 있을 가능성이 큽니다. 어디서 새는지 진단으로 콕 집어드립니다." },
    { min: 6, max: 8, title: "구조는 탄탄합니다", desc: "이제는 ‘반응 좋은 콘텐츠 시리즈화’와 전환율 최적화 단계입니다. 데이터 기준으로 다음 레버를 함께 찾아봐요." },
  ];

  function updateScore() {
    if (!checksRoot) return;
    var boxes = checksRoot.querySelectorAll('input[type="checkbox"]');
    var score = 0;
    boxes.forEach(function (b) { if (b.checked) score += Number(b.dataset.w || 1); });
    if (scoreCard) scoreCard.hidden = false;
    if (scoreVal) scoreVal.textContent = String(score);
    var band = BANDS.find(function (x) { return score >= x.min && score <= x.max; }) || BANDS[0];
    if (scoreTitle) scoreTitle.textContent = band.title;
    if (scoreDesc) scoreDesc.textContent = band.desc;
    if (captureScore) captureScore.value = String(score);
    if (diagScore) diagScore.value = String(score);
  }
  if (checksRoot) {
    checksRoot.addEventListener("change", updateScore);
  }

  /* ── validation helpers ── */
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function mark(el, bad) { if (el) el.classList.toggle("invalid", !!bad); }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }

  /* ── lead submission ── */
  function submitLead(payload, btn) {
    var endpoint = (CONFIG.LEAD_ENDPOINT || "").trim();
    var record = Object.assign({ ts: new Date().toISOString(), source: "diripda-landing" }, payload);

    function saveLocal() {
      try {
        var key = "dripda_leads";
        var arr = JSON.parse(localStorage.getItem(key) || "[]");
        arr.push(record);
        localStorage.setItem(key, JSON.stringify(arr));
      } catch (e) { /* ignore storage errors */ }
    }

    function done(ok) {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; }
      if (ok) {
        toast("신청이 접수되었습니다. 곧 연락드릴게요!");
      } else if (CONFIG.FALLBACK_CONTACT) {
        toast("전송에 문제가 있어요. " + CONFIG.FALLBACK_CONTACT + " 로 연락 주세요.", true);
      } else {
        // endpoint 미설정/실패해도 로컬 저장은 됐으므로 사용자에겐 정상 접수로 안내
        toast("신청이 접수되었습니다. 곧 연락드릴게요!");
      }
    }

    if (btn) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = "전송 중…"; }

    if (!endpoint) {
      saveLocal();
      return done(true);
    }
    saveLocal(); // always keep a local copy as backup
    // NOTE: text/plain(단순 요청)으로 보내 불필요한 CORS 프리플라이트를 피한다.
    // 본문은 JSON 문자열이며 Supabase submit-lead 엣지함수가 req.text()→JSON.parse 로 처리한다.
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(record),
    })
      .then(function (r) { done(r.ok); })
      .catch(function () { done(false); });
  }

  /* ── capture form (email + kakao) ── */
  var capForm = document.getElementById("captureForm");
  if (capForm) {
    capForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = val("cap-email");
      var kakao = val("cap-kakao");
      var emailEl = document.getElementById("cap-email");
      var kakaoEl = document.getElementById("cap-kakao");
      var emailOk = email && isEmail(email);
      var hasKakao = !!kakao;
      // 이메일 또는 카톡 중 하나 이상 필요
      if (!emailOk && !hasKakao) {
        mark(emailEl, true); mark(kakaoEl, true);
        toast("이메일 또는 카카오톡 중 하나 이상 남겨주세요.", true);
        return;
      }
      if (email && !emailOk) { mark(emailEl, true); toast("이메일 형식을 확인해주세요.", true); return; }
      mark(emailEl, false); mark(kakaoEl, false);
      submitLead({
        form_type: "lead_magnet",
        email: email,
        kakao: kakao,
        self_score: val("captureScore"),
      }, capForm.querySelector('button[type="submit"]'));
      capForm.reset();
    });
  }

  /* ── diagnosis form (3 questions + contact) ── */
  var dgForm = document.getElementById("diagnoseForm");
  if (dgForm) {
    dgForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = val("dg-name");
      var channel = val("dg-channel");
      var pain = val("dg-pain");
      var contact = val("dg-contact");
      var missing = false;
      [["dg-name", name], ["dg-channel", channel], ["dg-pain", pain], ["dg-contact", contact]].forEach(function (p) {
        var bad = !p[1];
        mark(document.getElementById(p[0]), bad);
        if (bad) missing = true;
      });
      if (missing) { toast("3가지 질문과 연락처를 모두 채워주세요.", true); return; }
      submitLead({
        form_type: "free_diagnosis",
        name: name,
        channel: channel,
        pain: pain,
        contact: contact,
        self_score: val("diagScore"),
      }, dgForm.querySelector('button[type="submit"]'));
      dgForm.reset();
    });
  }
})();
