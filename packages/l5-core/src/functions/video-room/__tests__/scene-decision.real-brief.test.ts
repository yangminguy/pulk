// Phase 2 실브리프 검증 — 미용실 SNS 브리프(b302482b)를 실제 변환해 씬 분포를 확인한다.
// 합격 기준(Work Order A2 + dedupe 후속 + 검증 루프 1 F2·F3):
//   insight 비중 50% 미만 · 장면 타입 5종 이상 · CTA 존재 · 전 씬 duration 3~12초(hero 포함)
//   · "---" 미유출 · 전 씬 emphasis 채움
//   · dedupe: 이 브리프는 3개 블록이 동일 원고(상류 버그) → 1블록 분량(약 40~50씬)만 생성
//   · 총 길이 5~9분대
//   · F2: hero duration은 캡션 글자수 기반(15자 훅 → ≤5초, 8초 고정 금지)
//   · F3: 어미 잘림 headline/subtitle 0건 · body/subtitle이 caption과 사실상 동일(≥80%)한 씬 0건
// 픽스처는 /Users/wonminyang/ai-slide-video-factory/briefs/b302482b-….json의 스냅샷 사본.

import * as fs from 'fs';
import * as path from 'path';
import type { VideoExecutionBrief } from '../types';
import { buildSlideDeckSpecFromBrief, buildFactoryJobFromSlideDeck } from '../render-pipeline';
import { SCENE_MAX_SECONDS, hasBrokenHeadlineEnding } from '../scene-decision';

const FIXTURE = path.join(__dirname, 'fixtures', 'brief-b302482b-salon-sns.json');

describe('scene decision on real salon SNS brief (b302482b)', () => {
  const brief = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8')) as VideoExecutionBrief;

  const spec = buildSlideDeckSpecFromBrief(brief, {
    id: 'spec-real',
    video_project_id: 'proj-real',
    script_draft_id: 'draft-real',
    voice_recording_id: 'voice-real',
  });
  // DB slide_deck 카드 저장/복원 경로와 동일하게 JSON 왕복 후 잡을 만든다.
  const roundTripped = JSON.parse(JSON.stringify(spec));
  const job = buildFactoryJobFromSlideDeck(roundTripped, { slug: 'real', title: brief.title });

  const distribution = job.scenes.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});

  it('prints the scene distribution (보고용)', () => {
    const total = job.scenes.length;
    const totalSeconds = job.scenes.reduce((sum, s) => sum + s.duration, 0);
    const lines = Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}: ${n} (${((n / total) * 100).toFixed(1)}%)`);
    // eslint-disable-next-line no-console
    console.log(`[scene distribution] total=${total} totalSeconds=${totalSeconds}\n${lines.join('\n')}`);
    expect(total).toBeGreaterThan(0);
  });

  it('dedupes the 3 identical logic blocks down to a single block worth of scenes', () => {
    // 상류 버그: 3개 블록 speaker_text가 전부 full_script 전문과 동일 → 1블록 분량만.
    expect(job.scenes.length).toBeGreaterThanOrEqual(40);
    expect(job.scenes.length).toBeLessThanOrEqual(60);
  });

  it('keeps total duration in the 5~9 minute band', () => {
    const totalSeconds = job.scenes.reduce((sum, s) => sum + s.duration, 0);
    expect(totalSeconds).toBeGreaterThanOrEqual(300);
    expect(totalSeconds).toBeLessThanOrEqual(540);
  });

  it('keeps insight share below 50%', () => {
    const insight = distribution['insight'] ?? 0;
    expect(insight / job.scenes.length).toBeLessThan(0.5);
  });

  it('uses at least 5 distinct scene types', () => {
    expect(Object.keys(distribution).length).toBeGreaterThanOrEqual(5);
  });

  it('has a cta scene and it is the last scene', () => {
    expect(distribution['cta'] ?? 0).toBeGreaterThanOrEqual(1);
    expect(job.scenes[job.scenes.length - 1].type).toBe('cta');
  });

  it('keeps every scene (hero included) at 12 seconds or less', () => {
    for (const s of job.scenes) {
      expect(s.duration).toBeLessThanOrEqual(SCENE_MAX_SECONDS);
      expect(s.duration).toBeGreaterThanOrEqual(3);
    }
    expect(job.scenes[0].type).toBe('hero');
  });

  it('F2: hero duration is caption-length based — 15자 훅 캡션은 5초 이하(무음 공백 방지)', () => {
    const hero = job.scenes[0] as { type: string; duration: number; caption?: string };
    expect(hero.type).toBe('hero');
    expect(hero.caption).toBe('인스타 매일 올리고 있어요.');
    expect(hero.duration).toBeLessThanOrEqual(5);
    expect(hero.duration).toBeGreaterThanOrEqual(3);
  });

  it('F3: no headline/subtitle/title ends with a broken conjugation or particle', () => {
    for (const s of job.scenes) {
      const { headline, subtitle, title } = s as {
        headline?: string;
        subtitle?: string;
        title?: string;
      };
      for (const field of [headline, subtitle, title]) {
        if (field) expect(hasBrokenHeadlineEnding(field)).toBe(false);
      }
    }
  });

  it('F3: no scene body/subtitle/note substantially duplicates its caption (≥80%)', () => {
    const norm = (t: string) => (t ?? '').replace(/[\s.,!?…"'“”‘’-]/g, '');
    for (const s of job.scenes) {
      const { caption, body, subtitle, note } = s as {
        caption?: string;
        body?: string;
        subtitle?: string;
        note?: string;
      };
      const nc = norm(caption ?? '');
      if (nc.length === 0) continue;
      for (const field of [body, subtitle, note]) {
        if (!field) continue;
        expect(norm(field).length / nc.length).toBeLessThan(0.8);
      }
    }
  });

  it('never leaks "---" script artifacts into any scene field', () => {
    expect(JSON.stringify(job.scenes)).not.toContain('---');
  });

  it('fills emphasis on every scene', () => {
    for (const s of job.scenes) {
      const emphasis = (s as { emphasis?: string[] }).emphasis;
      expect(Array.isArray(emphasis)).toBe(true);
      expect(emphasis!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('fills mood and transition on every scene', () => {
    for (const s of job.scenes) {
      expect((s as { mood?: string }).mood).toBeDefined();
      expect((s as { transition?: string }).transition).toBeDefined();
    }
  });
});
