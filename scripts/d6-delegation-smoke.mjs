// D6 — live delegation loop smoke test.
// Seeds a CMO→CTO delegation, drives delegation:advance (runDelegationLoop),
// and reports the outcome. Read/write via NocoBase REST only — no browser.

const BASE = (process.env.NOCOBASE_BASE_URL ?? 'http://localhost:13000').replace(/\/$/, '');
const USER = process.env.NOCOBASE_USERNAME ?? 'nocobase';
const PASS = process.env.NOCOBASE_PASSWORD ?? 'admin123';

let TOKEN = '';
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Authenticator': 'basic',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

const log = (...a) => console.log(...a);

(async () => {
  // 1) auth
  const signIn = await api('/api/auth:signIn', { method: 'POST', body: { account: USER, password: PASS } });
  TOKEN = signIn?.data?.token;
  if (!TOKEN) throw new Error('sign-in: no token');
  log('✅ auth ok');

  // NOTE: NocoBase REST :create ignores client-supplied id and generates its own,
  // so we capture the returned data.id at each step.

  const objective =
    'CTO 관점에서 세컨 브레인을 MCP로 더 잘 활용하기 위한 개선안 초안을 작성하라.';
  const acceptance_criteria = [
    '개선안에 최소 2개의 구체적 액션 아이템이 포함된다',
    '각 액션 아이템에 위험도(D1~D5)가 명시된다',
  ];

  // 0) seed a founder_instruction + ceo_interpretation (agent_tasks FKs)
  const instrRes = await api('/api/founder_instructions:create', {
    method: 'POST',
    body: {
      raw_text: '[D6-SMOKE] 세컨 브레인 MCP 활용 개선 위임 테스트',
      source: 'manual',
      status: 'new',
    },
  });
  const instructionId = instrRes?.data?.id;
  if (!instructionId) throw new Error('instruction create: no id');
  log('✅ seeded founder_instruction', instructionId);

  const interpRes = await api('/api/ceo_interpretations:create', {
    method: 'POST',
    body: {
      instruction_id: instructionId,
      goal: '세컨 브레인 MCP 활용 개선 위임 루프를 검증한다.',
      assumptions: ['D6 smoke에서 생성한 검증 데이터다'],
      phase: 'validation',
      success_criteria: acceptance_criteria,
      risk_level: 'D2',
      approval_required: false,
    },
  });
  const interpretationId = interpRes?.data?.id;
  if (!interpretationId) throw new Error('interpretation create: no id');
  log('✅ seeded ceo_interpretation', interpretationId);

  // 2) seed the requesting (CMO) origin task — paused, mimics ask_executive
  const originRes = await api('/api/agent_tasks:create', {
    method: 'POST',
    body: {
      instruction_id: instructionId,
      interpretation_id: interpretationId,
      assigned_agent: 'CMO',
      title: '[D6-SMOKE] CMO 캠페인 기획 (CTO 위임 대기)',
      rationale: '세컨 브레인 활용 개선안이 필요해 CTO에게 위임함.',
      expected_output: 'CTO 개선안을 반영한 캠페인 기획.',
      status: 'needs_review',
      risk_level: 'D2',
    },
  });
  const originId = originRes?.data?.id;
  if (!originId) throw new Error('origin task create: no id');
  log('✅ seeded origin CMO task', originId);

  // 3) open the delegation (CMO → CTO)
  const delRes = await api('/api/executive_delegations:create', {
    method: 'POST',
    body: {
      from_agent: 'CMO',
      to_agent: 'CTO',
      origin_task_id: originId,
      objective,
      acceptance_criteria,
      status: 'open',
      round: 0,
      max_rounds: 2,
    },
  });
  const delId = delRes?.data?.id;
  if (!delId) throw new Error('delegation create: no id');
  // reflect the pause on the origin task now that we have the delegation id
  await api(`/api/agent_tasks:update?filterByTk=${originId}`, {
    method: 'POST',
    body: { blocker: `awaiting_delegation: ${delId}` },
  });
  log('✅ opened delegation', delId, '(max_rounds=2)');

  // 4) drive the verification loop (the heavy LLM step)
  log('⏳ delegation:advance — running loop (worker 제작 → 요청임원 검증) …');
  const t0 = Date.now();
  const adv = await api('/api/delegation:advance', { method: 'POST', body: { id: delId } });
  const secs = Math.round((Date.now() - t0) / 1000);
  log(`✅ advance returned in ${secs}s`);

  // 5) read back final state
  const delAfter = await api(`/api/executive_delegations:get?filterByTk=${delId}`);
  const del = delAfter?.data ?? {};
  const origin = (await api(`/api/agent_tasks:get?filterByTk=${originId}`))?.data ?? {};
  let work = {};
  if (del.work_task_id) work = (await api(`/api/agent_tasks:get?filterByTk=${del.work_task_id}`))?.data ?? {};

  log('\n================ D6 RESULT ================');
  log('advance payload:', JSON.stringify(adv?.data ?? adv, null, 2).slice(0, 1200));
  log('------------------------------------------');
  log('delegation.status :', del.status);
  log('delegation.round  :', del.round, '/ max', del.max_rounds);
  log('last_feedback     :', (del.last_feedback ?? '').slice(0, 300));
  log('result_summary    :', (del.result_summary ?? '').slice(0, 400));
  log('work_task_id      :', del.work_task_id, '| work.status:', work.status, '| agent:', work.assigned_agent);
  log('origin.status     :', origin.status, '| origin.blocker:', origin.blocker);
  log('==========================================');
  log('\nseed ids (for cleanup): origin=%s work=%s del=%s', originId, del.work_task_id, delId);
})().catch((e) => {
  console.error('❌ D6 smoke failed:', e.message);
  process.exit(1);
});
