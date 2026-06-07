// factory-handoff.test.ts — unit tests for prepareFactoryHandoff + sendToFactory.
//
// Transport is always a mock — no network calls.

import {
  prepareFactoryHandoff,
  sendToFactory,
} from '../factory-handoff';
import type { FactoryTransport, VideoExecutionBriefRecord } from '../factory-handoff';
import type { VideoExecutionBrief } from '../types';

// ── Minimal valid brief factory ───────────────────────────────────────────────

function validBrief(overrides: Partial<Record<string, unknown>> = {}): VideoExecutionBrief {
  return {
    schema_version: 'cmo_to_factory_v2',
    content_card_id: 'card_001',
    content_type: 'key',
    title: '카페 매출 구조의 비밀',
    target_viewer: {
      who: '개인 카페 운영자',
      knowledge_level: 'beginner',
      pain: '광고비는 많이 쓰는데 단골이 안 늘어남',
      desired_reaction: '구조적으로 정리해야겠다는 느낌',
    },
    strategy: {
      core_message: '카페 매출은 광고가 아니라 고객 구조로 결정된다',
      covered_stages: ['phenomenon', 'desire'],
      role_in_content_set: '키 콘텐츠: 구조 파악',
    },
    script: {
      full_script: '안녕하세요. 오늘은 카페 매출 구조에 대해 이야기합니다.',
      intro_30s: '카페 사장님들이 놓치는 것은 무엇일까요?',
      logic_blocks: [
        {
          block_id: 'block_1',
          role: '문제 제기',
          speaker_text: '광고비는 많이 쓰는데...',
          communication_goal: '현재 상황의 모순을 명확히 한다',
          viewer_reaction_target: '내 상황이 맞다고 느낀다',
        },
      ],
    },
    source_materials: {
      used_insights: {},
    },
    constraints: {
      tone: '차분하지만 확신 있는 설명',
      format: 'youtube_16_9',
    },
    ...overrides,
  } as VideoExecutionBrief;
}

function testIds() {
  return { id: 'rec_001', created_at: '2026-06-06T00:00:00.000Z' };
}

// ── Mock transports ───────────────────────────────────────────────────────────

function okTransport(): FactoryTransport & { calls: VideoExecutionBrief[] } {
  const calls: VideoExecutionBrief[] = [];
  return {
    calls,
    async send(brief) {
      calls.push(brief);
      return { ok: true };
    },
  };
}

function failTransport(): FactoryTransport {
  return {
    async send() {
      return { ok: false };
    },
  };
}

function throwingTransport(): FactoryTransport {
  return {
    async send() {
      throw new Error('network timeout');
    },
  };
}

// ── Case 1: valid brief → record has validation_status='valid', handoff_status='not_sent' ──

test('valid brief produces record with validation_status=valid and handoff_status=not_sent', () => {
  const brief = validBrief();
  const record = prepareFactoryHandoff(brief, testIds());

  expect(record.validation_status).toBe('valid');
  expect(record.handoff_status).toBe('not_sent');
  expect(record.id).toBe('rec_001');
  expect(record.content_card_id).toBe('card_001');
  expect(record.schema_version).toBe('cmo_to_factory_v2');
  expect(record.created_at).toBe('2026-06-06T00:00:00.000Z');
  expect(record.brief).toBe(brief);
});

// ── Case 2: valid brief → sendToFactory → handoff_status='sent' ──────────────

test('valid record sent via ok transport → handoff_status=sent', async () => {
  const transport = okTransport();
  const record = prepareFactoryHandoff(validBrief(), testIds());
  const sent = await sendToFactory(record, transport);

  expect(sent.handoff_status).toBe('sent');
  expect(sent.validation_status).toBe('valid');
  expect(transport.calls).toHaveLength(1);
  // original record is not mutated
  expect(record.handoff_status).toBe('not_sent');
});

// ── Case 3: invalid brief (scene_type in logic_block) → validation_status='invalid', send rejected ──

test('brief with scene_type in logic_block → invalid, sendToFactory throws', async () => {
  const brief = validBrief();
  // Inject forbidden field into logic_block
  (brief.script.logic_blocks[0] as unknown as Record<string, unknown>)['scene_type'] = 'face_video';

  const record = prepareFactoryHandoff(brief, testIds());
  expect(record.validation_status).toBe('invalid');
  expect(record.handoff_status).toBe('not_sent');

  const transport = okTransport();
  await expect(sendToFactory(record, transport)).rejects.toThrow(
    /refusing to send invalid brief/,
  );
  expect(transport.calls).toHaveLength(0);
});

// ── Case 4: transport returns ok=false → handoff_status='failed' ─────────────

test('transport returning ok=false → handoff_status=failed', async () => {
  const record = prepareFactoryHandoff(validBrief(), testIds());
  const sent = await sendToFactory(record, failTransport());

  expect(sent.handoff_status).toBe('failed');
  expect(sent.validation_status).toBe('valid');
});

// ── Case 5: transport throws → handoff_status='failed' ───────────────────────

test('transport that throws → handoff_status=failed (no propagation)', async () => {
  const record = prepareFactoryHandoff(validBrief(), testIds());
  const sent = await sendToFactory(record, throwingTransport());

  expect(sent.handoff_status).toBe('failed');
});

// ── Case 6: invalid brief from missing required field (no title) → not_sent ───

test('brief missing title → validation_status=invalid, handoff_status=not_sent', () => {
  const brief = validBrief();
  (brief as unknown as Record<string, unknown>)['title'] = '';

  const record = prepareFactoryHandoff(brief, testIds());
  expect(record.validation_status).toBe('invalid');
  expect(record.handoff_status).toBe('not_sent');
});

// ── Case 7: ids are preserved verbatim on the record ─────────────────────────

test('custom ids are stored verbatim on the record', () => {
  const ids = { id: 'custom-uuid-xyz', created_at: '2026-01-15T12:00:00.000Z' };
  const record = prepareFactoryHandoff(validBrief(), ids);

  expect(record.id).toBe('custom-uuid-xyz');
  expect(record.created_at).toBe('2026-01-15T12:00:00.000Z');
});
