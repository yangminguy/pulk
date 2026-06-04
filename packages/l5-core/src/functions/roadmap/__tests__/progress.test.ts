import {
  deriveRoadmapItemStatus,
  summarizeRoadmap,
  type RoadmapProgressItem,
} from '../progress';

describe('deriveRoadmapItemStatus', () => {
  it('is planned with no tasks', () => {
    expect(deriveRoadmapItemStatus({ total: 0, done: 0, running: 0 })).toBe('planned');
  });
  it('is planned when all tasks are still queued', () => {
    expect(deriveRoadmapItemStatus({ total: 3, done: 0, running: 0 })).toBe('planned');
  });
  it('is active when a task is in flight', () => {
    expect(deriveRoadmapItemStatus({ total: 3, done: 0, running: 1 })).toBe('active');
  });
  it('is active when some but not all are done', () => {
    expect(deriveRoadmapItemStatus({ total: 3, done: 2, running: 0 })).toBe('active');
  });
  it('is done when all tasks are done', () => {
    expect(deriveRoadmapItemStatus({ total: 3, done: 3, running: 0 })).toBe('done');
  });
});

describe('summarizeRoadmap', () => {
  const items: RoadmapProgressItem[] = [
    { id: 'a', title: 'A', sequence: 1, project_id: 'p', business_id: 'b', total: 2, done: 2, status: 'done' },
    { id: 'b', title: 'B', sequence: 2, project_id: 'p', business_id: 'b', total: 2, done: 1, status: 'active' },
    { id: 'c', title: 'C', sequence: 3, project_id: 'p', business_id: 'b', total: 1, done: 0, status: 'planned' },
  ];

  it('aggregates task and item counts with a percent', () => {
    const s = summarizeRoadmap(items);
    expect(s.item_count).toBe(3);
    expect(s.done_items).toBe(1);
    expect(s.total_tasks).toBe(5);
    expect(s.done_tasks).toBe(3);
    expect(s.percent).toBe(60);
  });

  it('is 0% with no tasks', () => {
    expect(summarizeRoadmap([]).percent).toBe(0);
  });
});
