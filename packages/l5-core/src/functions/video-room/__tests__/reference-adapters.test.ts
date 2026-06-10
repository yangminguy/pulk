import {
  manualInputAdapter,
  createReferenceAdapter,
  viewtrapScrapeAdapter,
  ReferenceSourceAdapter,
} from '../reference-adapters';
import type { ReferenceCandidate } from '../types';

function makeRecord(i: number): ReferenceCandidate {
  return {
    id: `ref-${i}`,
    research_session_id: 'session-1',
    title: `참조 영상 ${i}`,
    url: `https://youtube.com/watch?v=${i}`,
    source: 'manual',
    consumer_stage: '현상',
    selected_for: 'key_content',
    selection_reason: `이유 ${i}`,
  };
}

describe('manualInputAdapter', () => {
  it('수동 입력 records를 query 무관하게 그대로 통과시킨다', async () => {
    const records = [makeRecord(0), makeRecord(1)];
    const adapter = manualInputAdapter(records);
    const result = await adapter.fetch('아무 쿼리');
    expect(result).toEqual(records);
  });

  it('반환값을 변형해도 원본 records가 오염되지 않는다(얕은 복사)', async () => {
    const records = [makeRecord(0)];
    const adapter = manualInputAdapter(records);
    const result = await adapter.fetch('q');
    result.push(makeRecord(99));
    const again = await adapter.fetch('q');
    expect(again).toHaveLength(1);
    expect(records).toHaveLength(1);
  });
});

describe('createReferenceAdapter', () => {
  it('scraper 주입 시 그 스크래퍼에 위임한다', async () => {
    const scraped = [makeRecord(7)];
    const scraper: ReferenceSourceAdapter = {
      async fetch(query: string) {
        return scraped.map((r) => ({ ...r, title: `${r.title} :: ${query}` }));
      },
    };
    const adapter = createReferenceAdapter({ scraper, manualRecords: [makeRecord(0)] });
    const result = await adapter.fetch('viewtrap-쿼리');
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('viewtrap-쿼리');
  });

  it('scraper 미주입(기본) → manualRecords 기반 수동 입력 폴백', async () => {
    const records = [makeRecord(1), makeRecord(2)];
    const adapter = createReferenceAdapter({ manualRecords: records });
    const result = await adapter.fetch('q');
    expect(result).toEqual(records);
  });

  it('deps 전부 생략 → 빈 배열 폴백(현 수동 입력 흐름을 깨지 않음)', async () => {
    const adapter = createReferenceAdapter();
    const result = await adapter.fetch('q');
    expect(result).toEqual([]);
  });

  it('viewtrapScrapeAdapter를 scraper로 주입하면 scrape 산출이 그대로 흐른다', async () => {
    const scrapeOutput = [makeRecord(3), makeRecord(4)];
    const adapter = createReferenceAdapter({ scraper: viewtrapScrapeAdapter(scrapeOutput) });
    const result = await adapter.fetch('아무 쿼리');
    expect(result).toEqual(scrapeOutput);
  });
});

describe('viewtrapScrapeAdapter', () => {
  it('scrape 산출 JSON을 query 무관하게 그대로 통과시킨다', async () => {
    const scrapeOutput = [makeRecord(0), makeRecord(1)];
    const adapter = viewtrapScrapeAdapter(scrapeOutput);
    const result = await adapter.fetch('마케팅 대행사');
    expect(result).toEqual(scrapeOutput);
  });

  it('반환값을 변형해도 원본 scrape 산출이 오염되지 않는다(얕은 복사)', async () => {
    const scrapeOutput = [makeRecord(0)];
    const adapter = viewtrapScrapeAdapter(scrapeOutput);
    const result = await adapter.fetch('q');
    result.push(makeRecord(99));
    const again = await adapter.fetch('q');
    expect(again).toHaveLength(1);
    expect(scrapeOutput).toHaveLength(1);
  });
});
