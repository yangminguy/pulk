// p5-e2e.test.ts — Single content card Research → Strategy → Script → QA →
// VideoExecutionBrief → Handoff end-to-end test.
//
// Topic: small brand marketing (소규모 브랜드 인스타그램 마케팅)
// All ids/timestamps injected by test — no Date/randomUUID calls anywhere.
//
// Test inventory:
//   Test 1 — pipeline returns brief with schema_version 'cmo_to_factory_v2'
//   Test 2 — qa.overall_pass is true and all five scores are present
//   Test 3 — source_pack_ids pass through into brief.source_materials
//   Test 4 — brief.script.full_script is non-empty (Founder Voice preserved logic)
//   Test 5 — VoiceMatchedScript.preserved_logic is reflected (covered_stages in strategy)
//   Test 6 — RESPONSIBILITY SEPARATION: forbidden keys absent + validateVideoExecutionBrief valid
//   Test 7 — logic_blocks each carry communication_goal and viewer_reaction_target
//   Test 8 — prepareFactoryHandoff returns validation_status 'valid'
//   Test 9 — sendToFactory with mock transport returns handoff_status 'sent'

import {
  runScriptRoomToBrief,
  type RunScriptRoomToBriefInput,
} from '../script-room-pipeline';
import {
  prepareFactoryHandoff,
  sendToFactory,
  type FactoryTransport,
} from '../factory-handoff';
import { validateVideoExecutionBrief } from '../brief-validators';
import type { VideoExecutionBrief } from '../types';

// ── Injected ids (caller's responsibility — pipeline never generates these) ─────

const CARD_ID = 'card-e2e-p5-001';
const RECORD_ID = 'rec-e2e-p5-001';
const CREATED_AT = '2026-06-06T09:00:00.000Z';

// ── Realistic synthetic input: 소규모 브랜드 인스타그램 마케팅 ──────────────────

function makePipelineInput(
  overrides: Partial<RunScriptRoomToBriefInput> = {},
): RunScriptRoomToBriefInput {
  return {
    content_card_id: CARD_ID,
    content_type: 'key',
    title: '인스타그램으로 소규모 브랜드 매출 올리는 법',

    topic: '소규모 브랜드 인스타그램 마케팅',
    target_viewer: '직원 5명 미만의 소규모 브랜드 대표',

    market_research: {
      topic: '소규모 브랜드 인스타그램 마케팅',
      why_this_topic_matters: '중소 브랜드의 70%가 인스타그램을 주 채널로 사용하지만 전환율이 낮음',
      market_context: [
        '인스타그램 쇼핑 기능 확대',
        '마이크로 인플루언서 효과 증가',
        '숏폼 콘텐츠 도달률 3배 상승',
      ],
      competitor_content_patterns: [
        '제품 사진 위주 단순 게시',
        '팔로워 이벤트 남발',
        '스토리 활용 미흡',
      ],
      unanswered_questions: [
        '어떤 콘텐츠가 실제 구매로 이어지나',
        '광고비 없이 노출을 늘리려면',
      ],
      common_misunderstandings: [
        '팔로워 수가 곧 매출이다',
        '예쁜 사진만 있으면 된다',
      ],
      example_materials: [
        '핸드메이드 브랜드 월 300만원 매출 달성 사례',
        '로컬 카페 릴스 30만뷰 사례',
      ],
      content_opportunities: [
        '뒷이야기 콘텐츠로 신뢰 형성',
        '고객 후기 UGC 재활용 전략',
        '저예산 광고 타겟팅 방법',
      ],
    },

    voc: {
      repeated_phrases: ['팔로워는 많은데 구매가 없어요', '콘텐츠를 뭘 올려야 할지 모르겠어요'],
      pain_expressions: [
        '하루종일 찍고 편집해도 반응이 없다',
        '광고를 돌려도 전환이 안 된다',
        '경쟁사는 어떻게 파는 건지 이해가 안 된다',
      ],
      desire_expressions: [
        '인스타만으로 월 500만원을 만들고 싶다',
        '자연스럽게 고객이 찾아오는 브랜드를 만들고 싶다',
      ],
      objection_expressions: ['소규모라서 예산이 없어요', '이미 다 해봤는데 안 됐어요'],
      realistic_situations: ['직접 촬영하고 직접 운영한다', '하루 1시간도 SNS에 시간을 못 낸다'],
      must_use_language: ['실제로 작동하는', '예산 없이도', '소규모 브랜드에 맞는'],
      avoid_language: ['무조건 성공', '100% 보장'],
    },

    claim: {
      safe_claims: [
        '릴스는 피드보다 3배 높은 도달률을 보인다',
        '고객 후기 게시물은 브랜드 신뢰도를 높인다',
        '스토리 투표 기능은 참여율을 높인다',
      ],
      risky_claims: ['인스타 하나로 연매출 1억 가능'],
      unverified_claims: [],
      safe_wording: ['데이터에 따르면', '사례 기반으로'],
      proof_points: ['메타 공식 인사이트 데이터', '실제 소규모 브랜드 3개월 실험 결과'],
      claims_to_avoid: ['보장', '무조건', '반드시'],
    },

    audience_fit: {
      pain_fit: 92,
      desire_fit: 88,
      language_fit: 85,
      curiosity_fit: 78,
      trust_fit: 82,
      action_fit: 80,
      what_target_wants_to_hear: ['지금 당장 쓸 수 있는 방법', '예산 적어도 되는 전략'],
      what_target_does_not_want_to_hear: ['대기업 사례', '추상적인 마케팅 이론'],
      must_answer_questions: ['어디서부터 시작하면 되나요?', '하루 얼마나 투자해야 하나요?'],
      recommended_angle: '실전 사례와 즉시 적용 가능한 액션 중심',
    },

    strategy_input: {
      channel_context: {
        current_position: '소규모 브랜드 마케팅 전문 채널',
        content_pillar: '실전 마케팅 전략',
        role_in_content_set: '키 콘텐츠: 인스타그램 매출 연결 구조',
        bridge_from_previous_content: '이전 영상에서 브랜드 아이덴티티를 다뤘습니다',
        bridge_to_next_content: '다음 영상에서 광고 세팅 방법을 구체적으로 알아봅니다',
      },
    },

    voice_sources: [
      {
        source_id: 'vs-founder-001',
        title: '창업자 블로그 인터뷰',
        sample_phrases: ['직접 해봤습니다', '이 방법이 실제로 작동합니다'],
        style_traits: ['직설적', '짧은 문장', '구체적 사례 선호'],
      },
    ],

    qa_input: {
      strategy_fit_score: 87,
      audience_fit_score: 85,
      voice_fit_score: 80,
      sales_logic_score: 83,
      fact_safety_score: 92,
      desire_stage_coverage: {
        phenomenon: true,
        desire: true,
        plan: true,
        action: true,
        reward: false,
      },
      logic_block_alignment: ['block_1 OK', 'block_2 OK', 'block_3 OK'],
      missing_parts: [],
      revision_requests: [],
    },

    source_pack_ids: {
      market_research_pack_id: 'mrp-e2e-001',
      voc_pack_id: 'voc-e2e-001',
      claim_evidence_report_id: 'cer-e2e-001',
      script_material_pack_id: 'smp-e2e-001',
    },

    used_insights: {
      thumbnail: ['ins-thumb-001'],
      script: ['ins-script-001'],
      founder_voice: ['ins-voice-001'],
    },

    constraints: {
      tone: '친근하고 실용적인 설명체',
      avoid: ['전문용어 남발', '추상적 표현'],
      format: 'youtube_16_9',
    },

    ...overrides,
  };
}

// ── Run the pipeline once and share the result across tests ──────────────────

let pipelineResult: ReturnType<typeof runScriptRoomToBrief>;

beforeAll(() => {
  pipelineResult = runScriptRoomToBrief(makePipelineInput());
});

// ── Test 1: schema_version ────────────────────────────────────────────────────

describe('P5 E2E — pipeline output shape', () => {
  it('Test 1: brief.schema_version is cmo_to_factory_v2', () => {
    expect(pipelineResult.brief.schema_version).toBe('cmo_to_factory_v2');
  });

  // ── Test 2: QA scores ───────────────────────────────────────────────────────

  it('Test 2: qa.overall_pass is true and all five score fields are present', () => {
    const { qa } = pipelineResult;
    expect(qa.overall_pass).toBe(true);
    expect(typeof qa.strategy_fit_score).toBe('number');
    expect(typeof qa.audience_fit_score).toBe('number');
    expect(typeof qa.voice_fit_score).toBe('number');
    expect(typeof qa.sales_logic_score).toBe('number');
    expect(typeof qa.fact_safety_score).toBe('number');
  });

  // ── Test 3: source_pack_ids pass-through ────────────────────────────────────

  it('Test 3: source_pack_ids are surfaced in brief.source_materials', () => {
    const { source_materials } = pipelineResult.brief;
    expect(source_materials.market_research_pack_id).toBe('mrp-e2e-001');
    expect(source_materials.voc_pack_id).toBe('voc-e2e-001');
    expect(source_materials.claim_evidence_report_id).toBe('cer-e2e-001');
    expect(source_materials.script_material_pack_id).toBe('smp-e2e-001');
  });

  // ── Test 4: full_script non-empty ──────────────────────────────────────────

  it('Test 4: brief.script.full_script is non-empty after Founder Voice pass', () => {
    expect(pipelineResult.brief.script.full_script.length).toBeGreaterThan(0);
  });

  // ── Test 5: preserved_logic via covered_stages ─────────────────────────────

  it('Test 5: strategy.covered_stages is non-empty (Founder Voice preserved_logic)', () => {
    // VoiceMatchedScript.preserved_logic === true is enforced by founder-voice.ts.
    // Its effect surfaces here: the strategy brief's covered_stages must be present
    // and non-empty because logic was never mutated.
    const { covered_stages } = pipelineResult.brief.strategy;
    expect(Array.isArray(covered_stages)).toBe(true);
    expect(covered_stages.length).toBeGreaterThan(0);
  });
});

// ── Test 6: Responsibility separation — forbidden keys absent ─────────────────

describe('P5 E2E — Test 6: responsibility separation', () => {
  it('generated brief has NO scene_type, best_medium, duration, timeline, scenes keys at top level', () => {
    const brief = pipelineResult.brief as unknown as Record<string, unknown>;
    expect(brief).not.toHaveProperty('scene_type');
    expect(brief).not.toHaveProperty('best_medium');
    expect(brief).not.toHaveProperty('bestMedium');
    expect(brief).not.toHaveProperty('duration');
    expect(brief).not.toHaveProperty('timeline');
    expect(brief).not.toHaveProperty('timeline_json');
    expect(brief).not.toHaveProperty('scenes');
  });

  it('generated brief has NO forbidden keys in any logic_block', () => {
    const forbidden = ['scene_type', 'best_medium', 'bestMedium', 'duration', 'timeline', 'scenes', 'message_unit_id'];
    for (const block of pipelineResult.brief.script.logic_blocks) {
      const b = block as unknown as Record<string, unknown>;
      for (const key of forbidden) {
        expect(b).not.toHaveProperty(key);
      }
    }
  });

  it('validateVideoExecutionBrief(brief).valid === true', () => {
    const result = validateVideoExecutionBrief(pipelineResult.brief);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ── Test 7: logic_blocks have communication_goal + viewer_reaction_target ──────

describe('P5 E2E — Test 7: logic_block contract fields', () => {
  it('every logic_block has non-empty communication_goal', () => {
    for (const block of pipelineResult.brief.script.logic_blocks) {
      expect(typeof block.communication_goal).toBe('string');
      expect(block.communication_goal.trim().length).toBeGreaterThan(0);
    }
  });

  it('every logic_block has non-empty viewer_reaction_target', () => {
    for (const block of pipelineResult.brief.script.logic_blocks) {
      expect(typeof block.viewer_reaction_target).toBe('string');
      expect(block.viewer_reaction_target.trim().length).toBeGreaterThan(0);
    }
  });

  it('at least one logic_block is present', () => {
    expect(pipelineResult.brief.script.logic_blocks.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Test 8: prepareFactoryHandoff returns validation_status 'valid' ────────────

describe('P5 E2E — Test 8: prepareFactoryHandoff', () => {
  it('returns a record with validation_status valid and handoff_status not_sent', () => {
    const record = prepareFactoryHandoff(pipelineResult.brief, {
      id: RECORD_ID,
      created_at: CREATED_AT,
    });

    expect(record.id).toBe(RECORD_ID);
    expect(record.content_card_id).toBe(CARD_ID);
    expect(record.schema_version).toBe('cmo_to_factory_v2');
    expect(record.validation_status).toBe('valid');
    expect(record.handoff_status).toBe('not_sent');
    expect(record.created_at).toBe(CREATED_AT);
    expect(record.brief).toBe(pipelineResult.brief);
  });
});

// ── Test 9: sendToFactory with mock transport returns handoff_status 'sent' ────

describe('P5 E2E — Test 9: sendToFactory with mock transport', () => {
  it('returns updated record with handoff_status sent on ok=true transport', async () => {
    const mockTransport: FactoryTransport = {
      send: jest.fn().mockResolvedValue({ ok: true }),
    };

    const record = prepareFactoryHandoff(pipelineResult.brief, {
      id: RECORD_ID,
      created_at: CREATED_AT,
    });

    const sent = await sendToFactory(record, mockTransport);

    expect(sent.handoff_status).toBe('sent');
    expect(sent.validation_status).toBe('valid');
    expect(sent.id).toBe(RECORD_ID);
    expect(mockTransport.send).toHaveBeenCalledWith(pipelineResult.brief);
  });

  it('returns handoff_status failed when transport returns ok=false', async () => {
    const mockTransport: FactoryTransport = {
      send: jest.fn().mockResolvedValue({ ok: false }),
    };

    const record = prepareFactoryHandoff(pipelineResult.brief, {
      id: RECORD_ID,
      created_at: CREATED_AT,
    });

    const result = await sendToFactory(record, mockTransport);
    expect(result.handoff_status).toBe('failed');
  });

  it('throws when trying to send an invalid brief', async () => {
    // Build a brief that will fail validation (empty title)
    const invalidBrief: VideoExecutionBrief = {
      ...pipelineResult.brief,
      title: '',
    };

    const invalidRecord = prepareFactoryHandoff(invalidBrief, {
      id: 'rec-invalid-001',
      created_at: CREATED_AT,
    });

    expect(invalidRecord.validation_status).toBe('invalid');

    const mockTransport: FactoryTransport = {
      send: jest.fn(),
    };

    await expect(sendToFactory(invalidRecord, mockTransport)).rejects.toThrow(
      'sendToFactory: refusing to send invalid brief',
    );
    expect(mockTransport.send).not.toHaveBeenCalled();
  });
});
