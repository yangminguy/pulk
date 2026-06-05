import {
  createViewtrapResearchSession,
  addSearchKeywords,
  completeResearchSession,
  createReferenceCandidate,
  buildSearchStrategy,
} from '../viewtrap-research';
import { VIEWTRAP_URL } from '../types';

const NOW = '2026-06-05T00:00:00.000Z';

describe('createViewtrapResearchSession', () => {
  it('creates a session with not_started status and correct viewtrap_url', () => {
    const session = createViewtrapResearchSession({
      id: 'session-1',
      video_project_id: 'proj-1',
      research_type: 'key_content',
      created_at: NOW,
    });

    expect(session.id).toBe('session-1');
    expect(session.video_project_id).toBe('proj-1');
    expect(session.research_type).toBe('key_content');
    expect(session.viewtrap_url).toBe(VIEWTRAP_URL);
    expect(session.status).toBe('not_started');
    expect(session.search_keywords).toEqual([]);
    expect(session.findings_summary).toBe('');
    expect(session.created_at).toBe(NOW);
    expect(session.completed_at).toBeUndefined();
  });

  it('stores optional browser_session_ref', () => {
    const session = createViewtrapResearchSession({
      id: 's2',
      video_project_id: 'p2',
      research_type: 'pulling_content',
      created_at: NOW,
      browser_session_ref: 'chrome-session-abc',
    });
    expect(session.browser_session_ref).toBe('chrome-session-abc');
  });
});

describe('addSearchKeywords', () => {
  it('appends keywords and transitions not_started -> researching', () => {
    const session = createViewtrapResearchSession({
      id: 's1',
      video_project_id: 'p1',
      research_type: 'key_content',
      created_at: NOW,
    });

    const updated = addSearchKeywords(session, ['마케팅 자동화', 'AI 마케팅']);
    expect(updated.search_keywords).toEqual(['마케팅 자동화', 'AI 마케팅']);
    expect(updated.status).toBe('researching');
  });

  it('keeps existing keywords when adding more', () => {
    const session = createViewtrapResearchSession({
      id: 's1',
      video_project_id: 'p1',
      research_type: 'key_content',
      created_at: NOW,
    });

    const s1 = addSearchKeywords(session, ['keyword1']);
    const s2 = addSearchKeywords(s1, ['keyword2', 'keyword3']);
    expect(s2.search_keywords).toEqual(['keyword1', 'keyword2', 'keyword3']);
  });

  it('preserves already-researching status', () => {
    const session = createViewtrapResearchSession({
      id: 's1',
      video_project_id: 'p1',
      research_type: 'key_content',
      created_at: NOW,
    });
    const s1 = addSearchKeywords(session, ['kw1']);
    expect(s1.status).toBe('researching');
    const s2 = addSearchKeywords(s1, ['kw2']);
    expect(s2.status).toBe('researching');
  });
});

describe('completeResearchSession', () => {
  function makeResearching() {
    const s = createViewtrapResearchSession({
      id: 's1',
      video_project_id: 'p1',
      research_type: 'key_content',
      created_at: NOW,
    });
    return addSearchKeywords(s, ['키워드']);
  }

  it('completes a session with findings_summary and completed_at', () => {
    const session = makeResearching();
    const completed = completeResearchSession(session, '리서치 완료 요약', NOW);
    expect(completed.status).toBe('completed');
    expect(completed.findings_summary).toBe('리서치 완료 요약');
    expect(completed.completed_at).toBe(NOW);
  });

  it('throws when findings_summary is empty', () => {
    const session = makeResearching();
    expect(() => completeResearchSession(session, '', NOW)).toThrow();
  });

  it('throws when findings_summary is whitespace only', () => {
    const session = makeResearching();
    expect(() => completeResearchSession(session, '   ', NOW)).toThrow();
  });
});

describe('createReferenceCandidate', () => {
  const base = {
    id: 'ref-1',
    research_session_id: 'session-1',
    title: '테스트 영상',
    url: 'https://youtu.be/abc123',
    source: 'youtube' as const,
    consumer_stage: '현상' as const,
    selected_for: 'key_content' as const,
    selection_reason: '조회수 높음',
  };

  it('creates a reference candidate with required fields', () => {
    const candidate = createReferenceCandidate(base);
    expect(candidate.id).toBe('ref-1');
    expect(candidate.url).toBe('https://youtu.be/abc123');
    expect(candidate.consumer_stage).toBe('현상');
    expect(candidate.selected_for).toBe('key_content');
  });

  it('throws when url is empty', () => {
    expect(() => createReferenceCandidate({ ...base, url: '' })).toThrow('url');
  });

  it('throws when url is whitespace', () => {
    expect(() => createReferenceCandidate({ ...base, url: '   ' })).toThrow();
  });

  it('stores optional numeric fields', () => {
    const candidate = createReferenceCandidate({
      ...base,
      view_count: 50000,
      subscriber_count: 10000,
      contribution_score: 8.5,
      recent_growth_signal: 'high',
    });
    expect(candidate.view_count).toBe(50000);
    expect(candidate.subscriber_count).toBe(10000);
    expect(candidate.contribution_score).toBe(8.5);
    expect(candidate.recent_growth_signal).toBe('high');
  });
});

describe('buildSearchStrategy', () => {
  it('returns 6 steps', () => {
    const strategy = buildSearchStrategy('마케팅 자동화', '콘텐츠 성과 부족');
    expect(strategy).toHaveLength(6);
  });

  it('step numbers are 1 through 6', () => {
    const strategy = buildSearchStrategy('AI 마케팅', '광고비 낭비');
    const steps = strategy.map((s) => s.step);
    expect(steps).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('step 1 includes productKeyword, step 2 includes problemKeyword', () => {
    const strategy = buildSearchStrategy('AI팀', '매출 없음');
    expect(strategy[0].keywords).toContain('AI팀');
    expect(strategy[1].keywords).toContain('매출 없음');
  });

  it('each step has a non-empty label and at least one keyword', () => {
    const strategy = buildSearchStrategy('상품A', '문제B');
    for (const step of strategy) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.keywords.length).toBeGreaterThan(0);
    }
  });
});
