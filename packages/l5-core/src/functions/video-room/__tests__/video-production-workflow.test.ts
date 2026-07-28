import type { VideoExecutionBrief } from '../types';
import {
  approvalReceipt,
  assertCanAssembleFactoryJob,
  assertCanSubmitFinalRender,
  buildStoryboardManifest,
  composeStoryboardHtml,
  createVideoProductionRun,
  makeProductionArtifact,
  routeStoryboardFeedback,
} from '../video-production-workflow';

const brief: VideoExecutionBrief = {
  schema_version: 'cmo_to_factory_v2',
  content_card_id: 'card-1',
  content_type: 'key',
  title: '광고비보다 고객 문제를 먼저 찾아야 하는 이유',
  target_viewer: { who: '미용실 원장', knowledge_level: '초급', pain: '예약 부족', desired_reaction: '문제를 기록한다' },
  strategy: { core_message: '반복 질문이 콘텐츠다', covered_stages: ['phenomenon'], role_in_content_set: '키 콘텐츠' },
  script: {
    full_script: '예약이 없을 때 광고부터 늘리지 마세요. 고객 질문을 먼저 기록하세요.',
    intro_30s: '예약이 없을 때 광고부터 늘리지 마세요.',
    logic_blocks: [
      { block_id: 'b1', role: 'hook', speaker_text: '예약이 없을 때 광고부터 늘리지 마세요.', communication_goal: '광고보다 문제 발견이 먼저다', viewer_reaction_target: '멈춰 듣기' },
      { block_id: 'b2', role: 'process', speaker_text: '고객이 반복해서 묻는 질문을 기록하세요.', communication_goal: '반복 질문을 콘텐츠로 바꾼다', viewer_reaction_target: '실행', required_evidence: ['질문 → 콘텐츠 → 예약 흐름'], visual_intent_hint: '3단계 과정' },
    ],
  },
  source_materials: { used_insights: {} },
  constraints: { tone: '명확함', format: 'youtube_16_9' },
};

const run = createVideoProductionRun({ id: 'run-1', project_id: 'project-1', slug: 'salon', source_media_ref: '/video/source.mov', now: '2026-07-16T00:00:00.000Z' });

describe('video production workflow', () => {
  it('builds complete meaning-block scenes and self-contained animated HTML', () => {
    const manifest = buildStoryboardManifest({ run, brief });
    expect(manifest.coverage).toBe(1);
    expect(manifest.scenes).toHaveLength(2);
    expect(manifest.scenes[1].preferred_scene_type).toBe('steps');
    const html = composeStoryboardHtml(manifest);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('모션 다시보기');
    expect(html).toContain('scene_02');
    expect(html).toContain('IntersectionObserver');
  });

  it('blocks assembly when approval is absent or stale', () => {
    const artifact = makeProductionArtifact({ artifact_type: 'storyboard', project_id: run.project_id, run_id: run.id, version: 2, source_versions: {}, status: 'draft', issues: [], generated_by: 'storyboard-composer', data: {} });
    expect(() => assertCanAssembleFactoryJob(null, artifact)).toThrow(/approval/);
    const stale = approvalReceipt({ run_id: run.id, artifact_type: 'storyboard', version: 1, checksum: artifact.checksum, approved_at: 'now' });
    expect(() => assertCanAssembleFactoryJob(stale, artifact)).toThrow(/active artifact/);
    const current = approvalReceipt({ run_id: run.id, artifact_type: 'storyboard', version: 2, checksum: artifact.checksum, approved_at: 'now' });
    expect(() => assertCanAssembleFactoryJob(current, artifact)).not.toThrow();
  });

  it('requires storyboard and pilot receipts before final render', () => {
    const storyboard = approvalReceipt({ run_id: run.id, artifact_type: 'storyboard', version: 1, checksum: 'a', approved_at: 'now' });
    const pilot = approvalReceipt({ run_id: run.id, artifact_type: 'pilot_qa', version: 1, checksum: 'b', approved_at: 'now' });
    expect(() => assertCanSubmitFinalRender({ run_id: run.id, storyboard, pilot: null })).toThrow(/pilot/);
    expect(() => assertCanSubmitFinalRender({ run_id: run.id, storyboard, pilot })).not.toThrow();
  });

  it('routes scene revisions only to the owning skill and composer', () => {
    expect(routeStoryboardFeedback({ scene_id: 'scene_1', decision: 'needs_revision', note: '이미지를 바꿔주세요' })).toEqual(['video-asset-director', 'storyboard-composer']);
    expect(routeStoryboardFeedback({ scene_id: 'scene_1', decision: 'needs_revision', note: '자막 줄바꿈 수정' })).toEqual(['video-caption-designer', 'storyboard-composer']);
  });
});
