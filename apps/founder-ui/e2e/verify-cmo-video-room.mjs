// Live E2E: CMO Video Room full strategy → production → publish flow.
//
// Exercises the cmo NocoBase resource end-to-end against a running server:
//   create project → chat (loads stage script / gate) → decide gate / advance
//   → slide deck → render → QA → upload draft.
//
// Usage:
//   NOCOBASE_BASE_URL=http://localhost:13000 \
//   NOCOBASE_USERNAME=admin@nocobase.com NOCOBASE_PASSWORD=admin123 \
//   node e2e/verify-cmo-video-room.mjs
//
// Exits non-zero on the first failed assertion.

const BASE = (process.env.NOCOBASE_BASE_URL ?? 'http://localhost:13000').replace(/\/$/, '');
const USER = process.env.NOCOBASE_USERNAME ?? 'admin@nocobase.com';
const PASS = process.env.NOCOBASE_PASSWORD ?? 'admin123';

let token = '';
let pass = 0;
const fails = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(action, body) {
  const res = await fetch(`${BASE}/api/cmo:${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { status: res.status, json, text };
}

function data(r) {
  // NocoBase wraps action body as { data: <ctx.body> }; our actions set ctx.body = { ok, data }.
  return r.json?.data?.data ?? r.json?.data ?? r.json;
}

async function signIn() {
  const res = await fetch(`${BASE}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: USER, password: PASS }),
  });
  if (!res.ok) throw new Error(`auth:signIn failed ${res.status}: ${await res.text()}`);
  const payload = await res.json();
  token = payload?.data?.token;
  if (!token) throw new Error('no token from auth:signIn');
}

async function main() {
  console.log(`CMO Video Room live E2E → ${BASE}`);

  // 0. cmo resource must exist (not 404).
  const ping = await call('chatMessage', {});
  ok('cmo:chatMessage resource registered (not 404)', ping.status !== 404, `status ${ping.status}`);
  if (ping.status === 404) {
    console.log('\nBackend cmo resource is missing — is the clean-branch plugin loaded?');
    process.exit(1);
  }

  await signIn();
  ok('admin auth:signIn returns token', !!token);

  // 1. create project
  const created = await call('createProject', {
    title: 'AI 마케팅팀 상품 판매용 콘텐츠 세트',
    product: 'AI 마케팅 자동화 팀',
    target_audience: '마케팅팀을 둘 여력이 없는 작은 브랜드 대표',
    business_goal: 'consulting_lead',
  });
  const proj = data(created);
  const projectId = proj?.project_id;
  ok('createProject returns project_id + strategy_chat', !!projectId && proj?.status === 'strategy_chat', JSON.stringify(proj));

  // 2. chat turn (deterministic stage script at least)
  const chat = await call('chatMessage', {
    project_id: projectId,
    founder_message: '키 콘텐츠 잡아줘',
  });
  const chatData = data(chat);
  ok('chatMessage returns a non-empty reply', typeof chatData?.reply === 'string' && chatData.reply.length > 0, JSON.stringify(chatData)?.slice(0, 160));
  ok('chatMessage returns cmo_message_id', !!chatData?.cmo_message_id);

  // 3. getProject reflects messages + roadmap
  const got = await call('getProject', { project_id: projectId });
  const gotData = data(got);
  ok('getProject returns project + roadmap', !!gotData?.project && Array.isArray(gotData?.roadmap), JSON.stringify(Object.keys(gotData ?? {})));
  ok('getProject roadmap has 14 nodes', (gotData?.roadmap?.length ?? 0) === 14, `len ${gotData?.roadmap?.length}`);
  ok('getProject messages persisted', Array.isArray(gotData?.messages) && gotData.messages.length >= 2);

  // 3b. flow aligned to lecture: 썸네일 구성 + 원고 도입부 nodes exist, reference_analysis removed
  const roadmap = gotData?.roadmap ?? [];
  ok('roadmap includes 썸네일 구성 + 원고 도입부 nodes', roadmap.some((n) => (n.label ?? '').includes('썸네일')) && roadmap.some((n) => (n.label ?? '').includes('도입부')), JSON.stringify(roadmap.map((n) => n.label)));
  ok('roadmap has no reference_analysis stage', !roadmap.some((n) => n.status === 'reference_analysis' || n.status === 'second_brain_insight_merge'), JSON.stringify(roadmap.map((n) => n.status)));

  // 4. walk to a gate stage by advancing through non-gate stages.
  //    strategy_chat → ... → key_content_approval is the first gate.
  let status = gotData?.project?.status ?? 'strategy_chat';
  let guard = 0;
  let gateId = null;
  while (guard++ < 30) {
    const g = await call('getProject', { project_id: projectId });
    const gd = data(g);
    status = gd?.project?.status;
    const pendingGate = (gd?.gates ?? []).find((x) => x.status === 'pending');
    if (pendingGate) { gateId = pendingGate.id; break; }
    const adv = await call('advanceStatus', { project_id: projectId });
    const advData = data(adv);
    if (adv.status >= 400 || !advData?.status) {
      // hit a gate that has not been raised yet — raise it via a chat turn
      await call('chatMessage', { project_id: projectId, founder_message: '진행' });
      const g2 = await call('getProject', { project_id: projectId });
      const gd2 = data(g2);
      const pg2 = (gd2?.gates ?? []).find((x) => x.status === 'pending');
      if (pg2) { gateId = pg2.id; status = gd2?.project?.status; break; }
      break;
    }
    status = advData.status;
    if (status === 'completed') break;
  }
  ok('reached a pending approval gate during the walk', !!gateId, `status=${status}`);

  // 5. decide the gate (approve) → status advances past the gate
  if (gateId) {
    const decided = await call('decideGate', { gate_id: gateId, decision: 'approved' });
    const dd = data(decided);
    ok('decideGate(approved) advances project status', !!dd?.status && dd.status !== status, JSON.stringify(dd));
  }

  // 6. production pipeline: slide deck → render → QA → upload draft
  const deck = await call('buildSlideDeck', { project_id: projectId, design_theme: 'Pulk Clean Green Slide Deck' });
  const deckData = data(deck);
  const deckId = deckData?.slide_deck_spec_id;
  ok('buildSlideDeck returns a spec id', !!deckId, JSON.stringify(deckData)?.slice(0, 160));

  if (deckId) {
    const render = await call('submitRender', { project_id: projectId, slide_deck_spec_id: deckId });
    const renderData = data(render);
    const renderId = renderData?.render_job_id;
    ok('submitRender returns a render job (rendering/queued)', !!renderId, JSON.stringify(renderData)?.slice(0, 160));

    if (renderId) {
      const qa = await call('runQA', { project_id: projectId, render_job_id: renderId });
      const qaData = data(qa);
      ok('runQA returns a result with overall_status', !!qaData?.result?.overall_status, JSON.stringify(qaData)?.slice(0, 160));

      const up = await call('createUploadDraft', {
        project_id: projectId,
        render_job_id: renderId,
        title: '마케팅을 몰라도 콘텐츠로 고객을 만드는 3단계',
        description: '작은 브랜드가 먼저 봐야 하는 구조',
        tags: ['마케팅', '콘텐츠마케팅', '작은브랜드'],
      });
      const upData = data(up);
      ok('createUploadDraft defaults to private visibility', upData?.draft?.visibility === 'private', JSON.stringify(upData)?.slice(0, 160));
    }
  }

  // ── P1: new backend actions — prove domain validation runs at runtime ──
  const ptNeg = await call('loadPTContext', { project_id: projectId, source_refs: ['only-one'], rules: ['r1'] });
  ok('loadPTContext rejects <3 sources (domain rule enforced)', ptNeg.status >= 400, `status=${ptNeg.status}`);

  const ptPos = await call('loadPTContext', {
    project_id: projectId,
    source_refs: ['src-a', 'src-b', 'src-c'],
    rules: ['키콘텐츠 규칙'],
  });
  ok('loadPTContext accepts >=3 sources', ptPos.status === 200 && data(ptPos)?.context_loaded === true, JSON.stringify(data(ptPos))?.slice(0, 160));

  // live Second Brain wiring: empty source_refs → auto-filled from biz brain
  const ptAuto = await call('loadPTContext', { project_id: projectId, source_refs: [], rules: ['키콘텐츠 규칙'] });
  ok('loadPTContext auto-fills from live Second Brain (empty source_refs → ok)', ptAuto.status === 200 && data(ptAuto)?.context_loaded === true, `status=${ptAuto.status} ${JSON.stringify(data(ptAuto))?.slice(0, 120)}`);

  const voice = await call('attachVoice', { project_id: projectId, file_url: 'https://example.com/voice.mp3', duration_sec: 120 });
  ok('attachVoice attaches a voice recording', voice.status === 200 && !!data(voice)?.voice, JSON.stringify(data(voice))?.slice(0, 160));

  const sbNeg = await call('commitStrategyArtifact', { project_id: projectId, stage: 'second_brain', payload: { content_plan_id: 'cp1', retrieved_insights: [] } });
  ok('commitStrategyArtifact rejects empty Second Brain insights', sbNeg.status >= 400, `status=${sbNeg.status}`);

  const pullNeg = await call('commitStrategyArtifact', { project_id: projectId, stage: 'pulling_content', payload: { key_content_id: 'k1', pulling_contents: [{ order: 1 }], set_logic: 'x' } });
  ok('commitStrategyArtifact rejects pulling set != 5 items', pullNeg.status >= 400, `status=${pullNeg.status}`);

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) {
    console.log('FAILED:', fails.join(', '));
    process.exit(1);
  }
  console.log('CMO Video Room live E2E: ALL GREEN ✅');
}

main().catch((e) => {
  console.error('E2E crashed:', e?.message ?? e);
  process.exit(1);
});
