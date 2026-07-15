// M4 영상 제작 파이프라인 잔여 — render-pipeline 단위 테스트.
// brief 직접참조 슬라이드덱 / factory 잡 변환 / 파일 기반 상태 도출·전이 / 산출물 QA / 업로드 초안.

import type { VideoExecutionBrief, RenderJob } from '../types';
import { createRenderJob } from '../production';
import {
  buildSlideDeckSpecFromBrief,
  inferSlideVisualType,
  estimateSlideDurationSeconds,
  slideDeckSpecToScriptBeats,
  buildFactoryJobFromSlideDeck,
  deriveRenderJobStatus,
  markRenderJobSubmitted,
  reconcileRenderJob,
  evaluateRenderArtifacts,
  buildYoutubeUploadDraftFromBrief,
  type RenderJobObservation,
} from '../render-pipeline';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeBrief(overrides: Partial<VideoExecutionBrief> = {}): VideoExecutionBrief {
  return {
    schema_version: 'cmo_to_factory_v2',
    content_card_id: 'card-1',
    content_type: 'pulling',
    title: '작은 브랜드가 광고보다 구조를 먼저 잡아야 하는 이유',
    target_viewer: {
      who: '1인 브랜드 사장님',
      knowledge_level: '광고만 돌려봄',
      pain: '광고비 대비 매출이 안 나옴',
      desired_reaction: '구조부터 잡아야겠다',
    },
    strategy: {
      core_message: '광고는 증폭기일 뿐, 엔진이 아니다',
      covered_stages: ['phenomenon', 'desire'],
      role_in_content_set: '풀링 1편',
      bridge_to_key_content: '키 콘텐츠에서 구조 잡는 법을 다룬다',
    },
    script: {
      full_script: '전체 원고입니다. 광고를 더 돌려도 매출이 안 오르는 이유를 설명합니다.',
      intro_30s: '광고비를 두 배로 늘렸는데 매출은 그대로인 적 있으신가요?',
      logic_blocks: [
        {
          block_id: 'b1',
          role: 'hook',
          speaker_text: '광고를 더 돌려도 매출이 안 오르는 진짜 이유가 있습니다.',
          communication_goal: '문제 인식',
          viewer_reaction_target: '뜨끔함',
          required_evidence: ['광고비 통계', '실사례'],
          visual_intent_hint: '비교 차트',
        },
        {
          block_id: 'b2',
          role: 'cta',
          speaker_text: '지금 구조 점검 체크리스트를 받아보세요.',
          communication_goal: '행동 유도',
          viewer_reaction_target: '클릭',
          visual_intent_hint: 'CTA 카드',
        },
      ],
    },
    source_materials: { used_insights: {} },
    constraints: { tone: '단호한 조언', format: 'youtube_16_9' },
    ...overrides,
  };
}

const SPEC_IDS = {
  id: 'spec-1',
  video_project_id: 'proj-1',
  script_draft_id: 'draft-1',
  voice_recording_id: 'voice-1',
};

function makeObservation(overrides: Partial<RenderJobObservation> = {}): RenderJobObservation {
  return {
    job_file_exists: true,
    output_dir_exists: true,
    video_file_exists: true,
    video_size_bytes: 1024 * 1024,
    render_report_exists: true,
    render_report: { totalSeconds: 184, sceneCount: 4, width: 1920, height: 1080, fps: 30 },
    qa_report_exists: true,
    youtube_metadata_exists: true,
    thumbnail_exists: true,
    paths: {
      video: '/factory/outputs/l5-x/video.mp4',
      thumbnail: '/factory/outputs/l5-x/thumbnail.png',
      qa_report: '/factory/outputs/l5-x/qa_report.md',
      youtube_metadata: '/factory/outputs/l5-x/youtube_metadata.json',
    },
    ...overrides,
  };
}

// ── 1. buildSlideDeckSpecFromBrief ───────────────────────────────────────────

describe('buildSlideDeckSpecFromBrief', () => {
  it('builds intro + per-block + bridge slides directly from the brief', () => {
    const spec = buildSlideDeckSpecFromBrief(makeBrief(), SPEC_IDS);

    // intro + 2 blocks + bridge (pulling with bridge_to_key_content)
    expect(spec.slides).toHaveLength(4);
    expect(spec.slides[0].headline).toBe('작은 브랜드가 광고보다 구조를 먼저 잡아야 하는 이유');
    expect(spec.slides[0].speaker_text).toContain('광고비를 두 배로');
    expect(spec.slides[1].headline).toBe('문제 인식');
    expect(spec.slides[1].speaker_text).toContain('진짜 이유');
    expect(spec.slides[1].body).toBe('광고비 통계 · 실사례');
    expect(spec.slides[3].visual_type).toBe('bridge');
    expect(spec.slides[3].speaker_text).toContain('키 콘텐츠');
    // consecutive indexes (buildSlideDeckSpec validation passed)
    expect(spec.slides.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(spec.aspect_ratio).toBe('16:9');
    expect(spec.video_project_id).toBe('proj-1');
  });

  it('maps shorts format to 9:16 and skips bridge slide for key content', () => {
    const brief = makeBrief({
      content_type: 'key',
      constraints: { tone: 't', format: 'shorts_9_16' },
    });
    const spec = buildSlideDeckSpecFromBrief(brief, SPEC_IDS);
    expect(spec.aspect_ratio).toBe('9:16');
    expect(spec.slides).toHaveLength(3); // intro + 2 blocks, no bridge
  });

  it('falls back to core_message when intro_30s is empty', () => {
    const brief = makeBrief();
    brief.script = { ...brief.script, intro_30s: '' };
    const spec = buildSlideDeckSpecFromBrief(brief, SPEC_IDS);
    expect(spec.slides[0].speaker_text).toBe('광고는 증폭기일 뿐, 엔진이 아니다');
  });

  it('throws when logic_blocks is empty', () => {
    const brief = makeBrief();
    brief.script = { ...brief.script, logic_blocks: [] };
    expect(() => buildSlideDeckSpecFromBrief(brief, SPEC_IDS)).toThrow(/logic_blocks/);
  });
});

describe('inferSlideVisualType', () => {
  const base = {
    block_id: 'b',
    role: 'explain',
    speaker_text: 's',
    communication_goal: 'g',
    viewer_reaction_target: 'r',
  };
  it('maps hint keywords deterministically', () => {
    expect(inferSlideVisualType({ ...base, visual_intent_hint: '비교 차트' })).toBe('comparison');
    expect(inferSlideVisualType({ ...base, visual_intent_hint: '고객 후기 인용' })).toBe('quote');
    expect(inferSlideVisualType({ ...base, visual_intent_hint: '3단계 체크리스트' })).toBe('checklist');
    expect(inferSlideVisualType({ ...base, visual_intent_hint: '프레임워크 구조도' })).toBe('framework');
    expect(inferSlideVisualType({ ...base, role: 'cta' })).toBe('cta');
    expect(inferSlideVisualType({ ...base })).toBe('text');
  });
});

// ── 2. SlideDeck → factory 렌더 잡 ───────────────────────────────────────────

describe('estimateSlideDurationSeconds', () => {
  it('clamps to factory [3, 20] second range', () => {
    expect(estimateSlideDurationSeconds('짧음')).toBe(3);
    expect(estimateSlideDurationSeconds('가'.repeat(1000))).toBe(20);
    const mid = estimateSlideDurationSeconds('가'.repeat(55)); // ≈10s
    expect(mid).toBeGreaterThanOrEqual(3);
    expect(mid).toBeLessThanOrEqual(20);
    expect(mid).toBe(10);
  });
});

describe('slideDeckSpecToScriptBeats / buildFactoryJobFromSlideDeck', () => {
  // Phase 2 갱신: 기존 테스트는 "슬라이드 1장=beat 1개(첫 장 hero, hint 그대로)"를
  // 고정했으나, Scene Decision 엔진 도입으로 beats는 planned_beats(페이싱 분할 +
  // 타입 스코어링)에서 나온다. 의도(hero 첫 장, 비교 hint 반영, cta 존재, 유효 범위)는
  // 유지하고 1:1 매핑 가정만 새 동작(8~12초 페이싱, ≤12초)으로 바꿨다.
  it('converts slides to beats with hero first, hint respected, and cta last', () => {
    const spec = buildSlideDeckSpecFromBrief(makeBrief(), SPEC_IDS);
    const beats = slideDeckSpecToScriptBeats(spec);
    expect(beats[0].scene_type).toBe('hero');
    expect(beats[0].rhythm_role).toBe('hook');
    expect(beats[0].duration).toBeGreaterThanOrEqual(8); // 인트로 전문 20초 금지
    expect(beats.some((b) => b.scene_type === 'comparison')).toBe(true); // 비교 차트 hint
    const last = beats[beats.length - 1];
    expect(last.scene_type).toBe('cta');
    expect(last.rhythm_role).toBe('cta');
    expect(beats.some((b) => b.scene_type === 'section')).toBe(true); // bridge
    for (const b of beats) {
      expect(b.duration).toBeGreaterThanOrEqual(3);
      expect(b.duration).toBeLessThanOrEqual(12);
      expect(b.headline.length).toBeGreaterThan(0);
      expect(b.speaker_text.length).toBeGreaterThan(0);
      expect(b.emphasis && b.emphasis.length).toBeGreaterThanOrEqual(1);
      expect(b.mood).toBeDefined();
      expect(b.transition).toBeDefined();
    }
  });

  it('produces a factory-valid job (validated by buildFactoryVideoJob)', () => {
    const spec = buildSlideDeckSpecFromBrief(makeBrief(), SPEC_IDS);
    const job = buildFactoryJobFromSlideDeck(spec, { slug: 'spec-1', title: '제목' });
    expect(job.id).toBe('l5-spec-1');
    expect(job.slug).toBe('l5-spec-1');
    expect(job.format).toBe('youtube_16_9');
    // Phase 2 갱신: 페이싱 분할로 4장 고정 → 4장 이상.
    expect(job.scenes.length).toBeGreaterThanOrEqual(4);
    expect(job.fps).toBe(30);
  });

  it('derives shorts format from 9:16 aspect ratio', () => {
    const brief = makeBrief({ constraints: { tone: 't', format: 'shorts_9_16' } });
    const spec = buildSlideDeckSpecFromBrief(brief, SPEC_IDS);
    const job = buildFactoryJobFromSlideDeck(spec, { slug: 's', title: 't' });
    expect(job.format).toBe('shorts_9_16');
  });
});

// ── 3. 상태 도출 + 전이 ──────────────────────────────────────────────────────

describe('deriveRenderJobStatus', () => {
  it('derives each status from file facts', () => {
    expect(deriveRenderJobStatus(makeObservation())).toBe('completed');
    expect(
      deriveRenderJobStatus(
        makeObservation({ video_file_exists: false, render_report_exists: false, render_report: null }),
      ),
    ).toBe('rendering');
    expect(
      deriveRenderJobStatus(
        makeObservation({
          output_dir_exists: false,
          video_file_exists: false,
          render_report_exists: false,
          render_report: null,
        }),
      ),
    ).toBe('queued');
    expect(
      deriveRenderJobStatus({
        job_file_exists: false,
        output_dir_exists: false,
        video_file_exists: false,
        render_report_exists: false,
      }),
    ).toBe('not_found');
    expect(deriveRenderJobStatus(makeObservation({ error_file_exists: true }))).toBe('failed');
    // 0-byte video is not completed
    expect(deriveRenderJobStatus(makeObservation({ video_size_bytes: 0 }))).toBe('rendering');
  });
});

describe('markRenderJobSubmitted / reconcileRenderJob', () => {
  const baseJob = (): RenderJob =>
    createRenderJob({
      id: 'rj-1',
      video_project_id: 'proj-1',
      slide_deck_spec_id: 'spec-1',
      created_at: '2026-06-10T00:00:00.000Z',
    });

  it('marks queued job as rendering after submit, rejects non-queued', () => {
    const job = markRenderJobSubmitted(baseJob());
    expect(job.status).toBe('rendering');
    expect(() => markRenderJobSubmitted(job)).toThrow(/queued/);
  });

  it('reconciles queued → completed with output refs', () => {
    const done = reconcileRenderJob(baseJob(), makeObservation(), '2026-06-10T01:00:00.000Z');
    expect(done.status).toBe('completed');
    expect(done.output_video_ref).toBe('/factory/outputs/l5-x/video.mp4');
    expect(done.thumbnail_ref).toBe('/factory/outputs/l5-x/thumbnail.png');
    expect(done.qa_report_ref).toBe('/factory/outputs/l5-x/qa_report.md');
    expect(done.youtube_metadata_ref).toBe('/factory/outputs/l5-x/youtube_metadata.json');
    expect(done.completed_at).toBe('2026-06-10T01:00:00.000Z');
  });

  it('reconciles rendering → failed with error message', () => {
    const rendering = markRenderJobSubmitted(baseJob());
    const failed = reconcileRenderJob(
      rendering,
      makeObservation({ error_file_exists: true, error_message: 'remotion exited 1' }),
      '2026-06-10T01:00:00.000Z',
    );
    expect(failed.status).toBe('failed');
    expect(failed.error_message).toBe('remotion exited 1');
  });

  it('promotes queued → rendering and leaves terminal/unknown states unchanged', () => {
    const obsRendering = makeObservation({
      video_file_exists: false,
      render_report_exists: false,
      render_report: null,
    });
    const promoted = reconcileRenderJob(baseJob(), obsRendering, 'now');
    expect(promoted.status).toBe('rendering');

    const completed = reconcileRenderJob(baseJob(), makeObservation(), 'now');
    expect(reconcileRenderJob(completed, makeObservation({ error_file_exists: true }), 'now')).toBe(
      completed,
    );

    const queuedObs = makeObservation({
      output_dir_exists: false,
      video_file_exists: false,
      render_report_exists: false,
      render_report: null,
    });
    const untouched = reconcileRenderJob(baseJob(), queuedObs, 'now');
    expect(untouched.status).toBe('queued');
  });
});

// ── 4. 렌더 산출물 QA ────────────────────────────────────────────────────────

describe('evaluateRenderArtifacts', () => {
  it('passes a complete youtube_16_9 render', () => {
    const qa = evaluateRenderArtifacts(makeObservation(), { format: 'youtube_16_9' });
    expect(qa.result).toBe('pass');
    expect(qa.issues).toEqual([]);
    expect(Object.values(qa.checks).every((c) => c === 'pass')).toBe(true);
  });

  it('fails on missing/empty video file', () => {
    const qa = evaluateRenderArtifacts(makeObservation({ video_size_bytes: 0 }));
    expect(qa.result).toBe('fail');
    expect(qa.checks.video_file).toBe('fail');
    expect(qa.issues.join(' ')).toMatch(/video\.mp4/);
  });

  it('fails on duration out of range and resolution mismatch', () => {
    const qa = evaluateRenderArtifacts(
      makeObservation({ render_report: { totalSeconds: 4, width: 1280, height: 720 } }),
      { format: 'youtube_16_9', min_total_seconds: 10 },
    );
    expect(qa.checks.duration_in_range).toBe('fail');
    expect(qa.checks.resolution_matches_format).toBe('fail');
    expect(qa.result).toBe('fail');
  });

  it('fails resolution for shorts when not 1080x1920, and metadata when absent', () => {
    const qa = evaluateRenderArtifacts(
      makeObservation({ youtube_metadata_exists: false }),
      { format: 'shorts_9_16' },
    );
    expect(qa.checks.resolution_matches_format).toBe('fail');
    expect(qa.checks.upload_metadata_present).toBe('fail');
  });

  it('fails report-dependent checks when render_report is missing', () => {
    const qa = evaluateRenderArtifacts(
      makeObservation({ render_report_exists: false, render_report: null }),
    );
    expect(qa.checks.render_report).toBe('fail');
    expect(qa.checks.duration_in_range).toBe('fail');
    expect(qa.checks.resolution_matches_format).toBe('fail');
  });
});

// ── 5. 업로드 초안 (실제 업로드 없음) ────────────────────────────────────────

describe('buildYoutubeUploadDraftFromBrief', () => {
  const ids = { id: 'ud-1', video_project_id: 'proj-1', render_job_id: 'rj-1' };

  it('drafts title/description/tags from the brief and stays private + pending', () => {
    const draft = buildYoutubeUploadDraftFromBrief(makeBrief(), ids, {
      thumbnail_ref: 'thumbnail.png',
    });
    expect(draft.title).toBe('작은 브랜드가 광고보다 구조를 먼저 잡아야 하는 이유');
    expect(draft.description).toContain('광고는 증폭기일 뿐');
    expect(draft.description).toContain('광고비를 두 배로');
    expect(draft.description).toContain('다음 영상: 키 콘텐츠에서 구조 잡는 법을 다룬다');
    expect(draft.tags).toContain('풀링콘텐츠');
    expect(draft.tags).toContain('phenomenon');
    expect(draft.tags.length).toBeLessThanOrEqual(15);
    // 업로드 게이트: 초안은 절대 공개/승인 상태로 시작하지 않는다.
    expect(draft.visibility).toBe('private');
    expect(draft.approval_status).toBe('pending');
    expect(draft.render_job_id).toBe('rj-1');
    expect(draft.thumbnail_ref).toBe('thumbnail.png');
  });

  it('uses 키콘텐츠 tag and omits bridge line for key content', () => {
    const brief = makeBrief({
      content_type: 'key',
      strategy: {
        core_message: '코어',
        covered_stages: ['plan'],
        role_in_content_set: '키',
      },
    });
    const draft = buildYoutubeUploadDraftFromBrief(brief, ids);
    expect(draft.tags).toContain('키콘텐츠');
    expect(draft.description).not.toContain('다음 영상:');
  });
});
