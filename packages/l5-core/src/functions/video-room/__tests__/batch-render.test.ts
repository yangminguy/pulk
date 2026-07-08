import {
  planBatchRender,
  summarizeBatchRender,
  type BatchRenderCandidate,
  type BatchRenderItemResult,
} from '../batch-render';

const base: BatchRenderCandidate = {
  project_id: 'p1',
  project_title: '풀링 1',
  project_status: 'rendering',
  factory_slug: 'l5-spec-1',
  job_path: '/factory/jobs/l5-spec-1.json',
  observed_status: 'queued',
};

describe('planBatchRender', () => {
  it('queued + rendering 상태만 렌더 대상으로 고른다', () => {
    const plan = planBatchRender([
      base,
      { ...base, project_id: 'p2', project_title: '풀링 2', factory_slug: 'l5-spec-2', job_path: '/j/2.json' },
    ]);
    expect(plan.to_render).toHaveLength(2);
    expect(plan.skipped).toHaveLength(0);
    expect(plan.to_render[0]).toEqual({
      project_id: 'p1',
      project_title: '풀링 1',
      factory_slug: 'l5-spec-1',
      job_path: '/factory/jobs/l5-spec-1.json',
    });
  });

  it('rendering 상태가 아닌 프로젝트는 스킵한다 (승인 게이트 미통과)', () => {
    const plan = planBatchRender([{ ...base, project_status: 'script_approval' }]);
    expect(plan.to_render).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain('script_approval');
  });

  it('slug/job_path 없으면 스킵한다 (submitRender 미실행)', () => {
    const plan = planBatchRender([
      { ...base, factory_slug: null },
      { ...base, project_id: 'p2', job_path: '  ' },
    ]);
    expect(plan.to_render).toHaveLength(0);
    expect(plan.skipped).toHaveLength(2);
  });

  it.each([
    ['rendering', '이미 렌더 진행 중'],
    ['completed', '이미 렌더 완료'],
    ['failed', '사람 확인 필요'],
    ['not_found', '잡 파일 없음'],
  ] as const)('observed_status=%s는 스킵한다', (observed, reasonPart) => {
    const plan = planBatchRender([{ ...base, observed_status: observed }]);
    expect(plan.to_render).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain(reasonPart);
  });

  it('observed_status=null(조회 실패)은 스킵한다', () => {
    const plan = planBatchRender([{ ...base, observed_status: null }]);
    expect(plan.skipped[0].reason).toContain('조회 실패');
  });

  it('같은 factory_slug는 첫 항목만 렌더한다 (멱등)', () => {
    const plan = planBatchRender([base, { ...base, project_id: 'p2' }]);
    expect(plan.to_render).toHaveLength(1);
    expect(plan.skipped[0].reason).toContain('중복');
  });
});

describe('summarizeBatchRender', () => {
  const okResult: BatchRenderItemResult = {
    project_id: 'p1',
    project_title: '풀링 1',
    factory_slug: 'l5-spec-1',
    status: 'completed',
    total_seconds: 185,
    qa_result: 'pass',
  };

  it('결과가 없으면 null (알림 스팸 방지)', () => {
    expect(summarizeBatchRender([], 'b1')).toBeNull();
  });

  it('전건 성공이면 info + 완료 제목', () => {
    const msg = summarizeBatchRender([okResult], 'b1')!;
    expect(msg.level).toBe('info');
    expect(msg.title).toContain('완료 1/1건');
    expect(msg.body).toContain('✅ 풀링 1 (3분 5초)');
    expect(msg.dedupKey).toBe('video-batch-render:b1');
  });

  it('실패 포함이면 warn + 실패 라인', () => {
    const msg = summarizeBatchRender(
      [okResult, { ...okResult, project_id: 'p2', project_title: '풀링 2', status: 'failed', error: 'remotion exit 1' }],
      'b2',
    )!;
    expect(msg.level).toBe('warn');
    expect(msg.title).toContain('1건 성공 · 1건 실패');
    expect(msg.body).toContain('❌ 풀링 2 — remotion exit 1');
  });

  it('QA fail은 성공이어도 warn + 표시', () => {
    const msg = summarizeBatchRender([{ ...okResult, qa_result: 'fail' }], 'b3')!;
    expect(msg.level).toBe('warn');
    expect(msg.body).toContain('⚠️ QA fail');
    expect(msg.body).toContain('QA fail 1건');
  });
});
