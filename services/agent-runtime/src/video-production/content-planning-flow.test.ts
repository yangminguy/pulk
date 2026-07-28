// content-planning-flow.test.ts — QA: 사장님 기획 유저플로우 end-to-end 시뮬레이션.
//
// 실제 브릿지(createSkillExecutor) + 실제 content-planning SKILL.md(디스크) + 실제
// state-machine 게이트 로직으로 흐름을 돌린다. LLM(claude)만 페이크 — 스킬이 파일로 쓰는
// 아티팩트를 합성해 넣는다. "스킬이 게이트 리포트를 만들고, 리포트 없는 승인은 상태머신이
// 차단하며, 소유 스킬이 카드를 만든 뒤에만 전진한다"는 유저플로우 불변식을 검증한다.

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSkillExecutor, type SkillExecutorIO } from './skill-executor';
import type { VideoProductionRun, VideoSkillExecutionInput } from './runner';
import {
  missingGateReports,
  advanceStatus,
  GATE_REQUIRED_REPORT_STAGES,
} from '@l5/core/dist/functions/video-room/state-machine.js';

const SKILLS_ROOT = resolve(process.cwd(), 'skills/content-planning');

// 오케스트레이터 planning-flow.md가 선언한 스킬 → 게이트 리포트 stage 매핑(state-machine 정본).
const PLANNING: Array<{ skill: string; gate_stage: string }> = [
  { skill: 'content-key-plan', gate_stage: 'key_content_plan_doc' },
  { skill: 'content-pulling-research', gate_stage: 'pulling_plan_doc' },
  { skill: 'content-title-develop', gate_stage: 'title_development' },
  { skill: 'content-thumbnail-develop', gate_stage: 'thumbnail_plan' },
  { skill: 'content-script-draft', gate_stage: 'script_draft' },
];

const run: VideoProductionRun = {
  id: 'qa-run', project_id: 'qa-project', slug: 'qa', source_media_ref: 'n/a',
  status: 'planning', current_skill: null, progress: 0, blocker: null, active_versions: {},
  storyboard_approved_at: null, pilot_approved_at: null, factory_slug: null,
  created_at: 'now', updated_at: 'now',
};

/** 실제 fs를 쓰되 claude만 페이크한 IO(스킬이 outDir에 아티팩트를 쓴 것으로 합성). */
async function realIOWithFakeClaude(gateStageFor: Map<string, string>): Promise<SkillExecutorIO> {
  const runsRoot = await mkdtemp(join(tmpdir(), 'planning-qa-'));
  return {
    skillsRoot: SKILLS_ROOT,
    runsRoot,
    join,
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: (p, d) => writeFile(p, d, 'utf8'),
    mkdirp: async (p) => { await mkdir(p, { recursive: true }); },
    listJson: async (dir) => {
      let e: string[]; try { e = await readdir(dir); } catch { return []; }
      return e.filter((n) => n.endsWith('.json')).sort().map((n) => join(dir, n));
    },
    // 페이크 claude: 프롬프트에 실제 SKILL.md 지침이 실렸는지 확인하고, 소유 스킬의
    // gate_stage를 담은 스키마-준수 아티팩트를 outDir에 쓴다.
    runClaude: async ({ prompt }) => {
      // 브릿지 프롬프트가 명시한 outDir을 그대로 읽는다(추측 금지).
      const m = prompt.match(/into this directory: (\S+)/);
      const outDir = m![1];
      const skill = outDir.slice(outDir.lastIndexOf('/') + 1);
      const gate_stage = gateStageFor.get(skill);
      // 프롬프트가 이 스킬 SKILL.md 본문을 담았는지(로딩 증거) 확인.
      if (!prompt.includes(gate_stage!)) {
        return { exitCode: 3, stdout: '', stderr: `SKILL.md for ${skill} did not load` };
      }
      await writeFile(join(outDir, `${skill}.json`), JSON.stringify({
        schema_version: 'content_planning_v1', artifact_type: skill,
        gate_stage, status: 'draft', issues: [],
        data: { note: `${skill} 산출물(한국어)` },
      }));
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    checksum: (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex'),
  };
}

describe('QA · 브릿지 × 실제 content-planning SKILL.md 로딩', () => {
  it('5개 기획 스킬을 실제 디스크에서 로드해 아티팩트를 라운드트립한다', async () => {
    const gateStageFor = new Map(PLANNING.map((p) => [p.skill, p.gate_stage]));
    const io = await realIOWithFakeClaude(gateStageFor);
    const executeSkill = createSkillExecutor(io, { contract: 'content_planning_v1' });

    for (const { skill, gate_stage } of PLANNING) {
      const input: VideoSkillExecutionInput = {
        run, skill_id: skill as VideoSkillExecutionInput['skill_id'],
        context: { product: '테스트 상품' }, prior_artifacts: [],
      };
      const out = await executeSkill(input);
      expect(out).toHaveLength(1);
      expect(out[0].run_id).toBe('qa-run');
      expect(out[0].checksum).toBeTruthy();
      expect(out[0].schema_version).toBe('content_planning_v1');
      expect(out[0].gate_stage).toBe(gate_stage); // 최상위로 승격(통일 계약)
    }
  });
});

describe('QA · 실제 state-machine 게이트 불변식 (리포트 없는 승인 차단)', () => {
  it('키 콘텐츠 게이트: 카드 없으면 차단, content-key-plan 산출 후 전진', () => {
    // 카드 없음 → missing → advanceStatus throw
    expect(missingGateReports('key_content_approval', [])).toEqual(['key_content_plan_doc']);
    expect(() => advanceStatus('key_content_approval', { gateApproved: true, presentCardStages: [] }))
      .toThrow(/report card/);
    // 소유 스킬 산출(카드 존재) → missing 없음 → 전진 성공
    const present = ['key_content_plan_doc'];
    expect(missingGateReports('key_content_approval', present)).toEqual([]);
    expect(advanceStatus('key_content_approval', { gateApproved: true, presentCardStages: present }))
      .toBe('viewtrap_pulling_research');
  });

  it('훅 승인: title+thumbnail 두 카드 모두 있어야 통과(2카드 게이트)', () => {
    expect(GATE_REQUIRED_REPORT_STAGES.hook_draft_approval).toEqual(['title_development', 'thumbnail_plan']);
    // 하나만 있으면 여전히 차단
    expect(missingGateReports('hook_draft_approval', ['title_development'])).toEqual(['thumbnail_plan']);
    expect(() => advanceStatus('hook_draft_approval', { gateApproved: true, presentCardStages: ['title_development'] }))
      .toThrow(/report card/);
    // 둘 다 있으면 통과
    const both = ['title_development', 'thumbnail_plan'];
    expect(missingGateReports('hook_draft_approval', both)).toEqual([]);
    expect(advanceStatus('hook_draft_approval', { gateApproved: true, presentCardStages: both }))
      .toBe('script_planning');
  });

  it('원고 승인: script_draft 카드가 전진을 게이트한다', () => {
    expect(() => advanceStatus('script_approval', { gateApproved: true, presentCardStages: [] }))
      .toThrow(/report card/);
    expect(advanceStatus('script_approval', { gateApproved: true, presentCardStages: ['script_draft'] }))
      .toBe('voice_recording');
  });

  it('저작된 5개 스킬이 기획 구간의 모든 게이트 리포트 stage를 빠짐없이 커버한다', () => {
    const gatesInPlanningSegment = [
      'key_content_approval', 'pulling_content_set_approval', 'hook_draft_approval', 'script_approval',
    ] as const;
    const requiredStages = new Set(gatesInPlanningSegment.flatMap((g) => GATE_REQUIRED_REPORT_STAGES[g]));
    const producedStages = new Set(PLANNING.map((p) => p.gate_stage));
    for (const stage of requiredStages) {
      expect(producedStages.has(stage)).toBe(true); // 커버리지 100%
    }
  });
});
