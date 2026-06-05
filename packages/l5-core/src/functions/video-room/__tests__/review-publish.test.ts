import {
  evaluateVideoRoomQA,
  createUploadDraft,
  approveUploadDraft,
  requestUploadRevision,
  createMemoryCandidate,
} from '../review-publish';
import type { VideoQAResult } from '../types';

// ── Helper ────────────────────────────────────────────────────────────────────

function allPassChecks(): VideoQAResult['checks'] {
  return {
    business_pt_structure: 'pass',
    pulling_to_key_bridge: 'pass',
    script_matches_approved_draft: 'pass',
    slide_readability: 'pass',
    audio_sync: 'pass',
    visual_quality: 'pass',
    upload_metadata_ready: 'pass',
  };
}

// ── evaluateVideoRoomQA ───────────────────────────────────────────────────────

describe('evaluateVideoRoomQA', () => {
  it('returns overall_status pass when all 7 checks pass', () => {
    const result = evaluateVideoRoomQA({
      id: 'qa1',
      video_project_id: 'vp1',
      render_job_id: 'rj1',
      checks: allPassChecks(),
    });
    expect(result.overall_status).toBe('pass');
  });

  it('returns needs_revision when any check fails', () => {
    const checks = { ...allPassChecks(), audio_sync: 'fail' as const };
    const result = evaluateVideoRoomQA({
      id: 'qa1',
      video_project_id: 'vp1',
      render_job_id: 'rj1',
      checks,
    });
    expect(result.overall_status).toBe('needs_revision');
  });

  it('includes all 7 check keys', () => {
    const result = evaluateVideoRoomQA({
      id: 'qa1',
      video_project_id: 'vp1',
      render_job_id: 'rj1',
      checks: allPassChecks(),
    });
    expect(Object.keys(result.checks)).toHaveLength(7);
  });

  it('preserves optional notes', () => {
    const result = evaluateVideoRoomQA({
      id: 'qa1',
      video_project_id: 'vp1',
      render_job_id: 'rj1',
      checks: allPassChecks(),
      notes: '3번 섹션 길다',
    });
    expect(result.notes).toBe('3번 섹션 길다');
  });

  it('needs_revision when multiple checks fail', () => {
    const checks: VideoQAResult['checks'] = {
      business_pt_structure: 'fail',
      pulling_to_key_bridge: 'fail',
      script_matches_approved_draft: 'pass',
      slide_readability: 'pass',
      audio_sync: 'fail',
      visual_quality: 'pass',
      upload_metadata_ready: 'pass',
    };
    const result = evaluateVideoRoomQA({
      id: 'qa1',
      video_project_id: 'vp1',
      render_job_id: 'rj1',
      checks,
    });
    expect(result.overall_status).toBe('needs_revision');
  });
});

// ── createUploadDraft ─────────────────────────────────────────────────────────

describe('createUploadDraft', () => {
  it('creates draft with visibility private by default', () => {
    const draft = createUploadDraft({
      id: 'ud1',
      video_project_id: 'vp1',
      render_job_id: 'rj1',
      title: '마케팅 3단계',
      description: '설명',
      tags: ['마케팅'],
    });
    expect(draft.visibility).toBe('private');
    expect(draft.approval_status).toBe('pending');
  });

  it('stores title, description, tags', () => {
    const draft = createUploadDraft({
      id: 'ud1',
      video_project_id: 'vp1',
      render_job_id: 'rj1',
      title: '마케팅',
      description: '작은 브랜드 마케팅',
      tags: ['마케팅', '콘텐츠', 'AI'],
    });
    expect(draft.title).toBe('마케팅');
    expect(draft.description).toBe('작은 브랜드 마케팅');
    expect(draft.tags).toEqual(['마케팅', '콘텐츠', 'AI']);
  });

  it('stores optional thumbnail_ref', () => {
    const draft = createUploadDraft({
      id: 'ud1',
      video_project_id: 'vp1',
      render_job_id: 'rj1',
      title: '마케팅',
      description: '설명',
      tags: [],
      thumbnail_ref: 'thumbs/t.png',
    });
    expect(draft.thumbnail_ref).toBe('thumbs/t.png');
  });
});

// ── approveUploadDraft ────────────────────────────────────────────────────────

describe('approveUploadDraft', () => {
  const base = createUploadDraft({
    id: 'ud1',
    video_project_id: 'vp1',
    render_job_id: 'rj1',
    title: '마케팅',
    description: '설명',
    tags: [],
  });

  it('sets approval_status to approved', () => {
    expect(approveUploadDraft(base).approval_status).toBe('approved');
  });

  it('keeps visibility private after approval', () => {
    const approved = approveUploadDraft(base);
    expect(approved.visibility).toBe('private');
  });

  it('sets scheduled_at when provided', () => {
    const approved = approveUploadDraft(base, '2026-06-10T09:00:00Z');
    expect(approved.scheduled_at).toBe('2026-06-10T09:00:00Z');
  });

  it('does not mutate the original draft', () => {
    approveUploadDraft(base);
    expect(base.approval_status).toBe('pending');
  });
});

// ── requestUploadRevision ─────────────────────────────────────────────────────

describe('requestUploadRevision', () => {
  it('sets approval_status to needs_revision', () => {
    const draft = createUploadDraft({
      id: 'ud1',
      video_project_id: 'vp1',
      render_job_id: 'rj1',
      title: '마케팅',
      description: '설명',
      tags: [],
    });
    expect(requestUploadRevision(draft).approval_status).toBe('needs_revision');
  });
});

// ── createMemoryCandidate ─────────────────────────────────────────────────────

describe('createMemoryCandidate', () => {
  it('returns a non-empty string mentioning the product and key content', () => {
    const result = createMemoryCandidate({
      product: 'AI 마케팅 자동화 팀',
      key_content_title: '마케팅을 몰라도 고객을 만드는 3단계',
      bridge_description: '"마케팅 설계 순서" 질문을 만드는 방식',
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('AI 마케팅 자동화 팀');
    expect(result).toContain('마케팅을 몰라도 고객을 만드는 3단계');
  });
});
