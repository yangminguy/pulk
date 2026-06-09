import { extractCompletionInsight } from '../completion-insight-extraction';
import { recordVideoPerformance } from '../performance-ingestion';

const lowPerf = recordVideoPerformance({
  project_id: 'p1',
  view_count: 300,
  completion_rate: 0.25,
  ctr: 0.02,
  retention_notes: '도입 30초 이탈 큼',
});

const goodPerf = recordVideoPerformance({
  project_id: 'p1',
  view_count: 50000,
  completion_rate: 0.6,
  ctr: 0.09,
});

describe('extractCompletionInsight', () => {
  it('LLM 미주입 + 저성과 → 임계값 규칙 인사이트(hook/intro/topic/pulling 포함)', async () => {
    const out = await extractCompletionInsight({ performance: lowPerf, key_content_title: 'K' });
    const usages = out.map((c) => c.usage);
    expect(usages).toContain('hook');
    expect(usages).toContain('intro');
    expect(usages).toContain('topic');
    expect(usages).toContain('pulling');
    expect(out[0].id).toBe('insight-0');
  });

  it('LLM 미주입 + 양호 성과 → 성공 패턴 재사용 인사이트 1개', async () => {
    const out = await extractCompletionInsight({ performance: goodPerf, key_content_title: '좋은 영상' });
    expect(out.length).toBe(1);
    expect(out[0].usage).toBe('topic');
    expect(out[0].insight).toContain('좋은 영상');
  });

  it('injected LLM 성공 → LLM 인사이트 사용, id 인덱스 부여', async () => {
    const llmComplete = async () =>
      '```json\n' +
      JSON.stringify([
        { insight: '훅을 질문형으로', usage: 'hook' },
        { insight: '풀링 검색축 강화', usage: 'pulling' },
      ]) +
      '\n```';
    const out = await extractCompletionInsight({ performance: lowPerf, key_content_title: 'K' }, { llmComplete });
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({ id: 'insight-0', insight: '훅을 질문형으로', usage: 'hook' });
    expect(out[1].id).toBe('insight-1');
  });

  it('LLM 형식오류 → 재시도 후 결정론 폴백', async () => {
    let calls = 0;
    const llmComplete = async () => {
      calls++;
      return 'not json';
    };
    const out = await extractCompletionInsight(
      { performance: lowPerf, key_content_title: 'K' },
      { llmComplete, maxRetries: 2 },
    );
    expect(calls).toBe(3);
    expect(out.length).toBeGreaterThan(0); // 폴백 산출
  });
});
