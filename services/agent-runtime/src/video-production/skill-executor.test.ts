import { buildSkillPrompt, createSkillExecutor, type SkillExecutorIO } from './skill-executor';
import {
  runVideoProductionPlanning,
  type ProductionArtifactEnvelope,
  type VideoProductionRun,
  type VideoSkillExecutionInput,
} from './runner';

const run: VideoProductionRun = {
  id: 'run-1', project_id: 'project-1', slug: 'slug', source_media_ref: 'source.mov',
  status: 'planning', current_skill: null, progress: 0, blocker: null, active_versions: {},
  storyboard_approved_at: null, pilot_approved_at: null, factory_slug: null,
  created_at: 'now', updated_at: 'now',
};

/**
 * In-memory fake IO. runClaude가 outDir에 "스킬이 쓴 것"으로 가정한 아티팩트 파일을
 * 직접 심어(seed) 파일 계약을 시뮬레이션한다.
 */
function makeIO(seed: {
  claudeExit?: number;
  writeArtifacts?: (skill_id: string) => Array<{ name: string; body: unknown }>;
  skillDocs?: Record<string, string>;
}): { io: SkillExecutorIO; files: Map<string, string> } {
  const files = new Map<string, string>();
  const dirs = new Map<string, Set<string>>(); // dir -> filenames

  const io: SkillExecutorIO = {
    skillsRoot: '/skills',
    runsRoot: '/runs',
    join: (...parts) => parts.join('/'),
    readFile: async (path) => {
      // SKILL.md 로드
      const skillMatch = path.match(/^\/skills\/([^/]+)\/SKILL\.md$/);
      if (skillMatch) {
        const doc = seed.skillDocs?.[skillMatch[1]];
        if (doc === undefined) throw new Error('no such skill doc');
        return doc;
      }
      if (files.has(path)) return files.get(path)!;
      throw new Error(`ENOENT ${path}`);
    },
    writeFile: async (path, data) => {
      files.set(path, data);
      const dir = path.slice(0, path.lastIndexOf('/'));
      const name = path.slice(path.lastIndexOf('/') + 1);
      if (!dirs.has(dir)) dirs.set(dir, new Set());
      dirs.get(dir)!.add(name);
    },
    mkdirp: async (path) => { if (!dirs.has(path)) dirs.set(path, new Set()); },
    listJson: async (dir) => {
      const names = dirs.get(dir);
      if (!names) return [];
      return [...names].filter((n) => n.endsWith('.json')).sort().map((n) => `${dir}/${n}`);
    },
    runClaude: async ({ cwd }) => {
      const exitCode = seed.claudeExit ?? 0;
      if (exitCode === 0 && seed.writeArtifacts) {
        // cwd = /runs/run-1 ; skill_id는 현재 실행 중인 스킬 — outDir 마지막 세그먼트로 추론.
        // 테스트는 skill 단위로 호출하므로, 마지막으로 mkdirp된 out/<skill> 디렉토리에 쓴다.
        const outDirs = [...dirs.keys()].filter((d) => d.startsWith(`${cwd}/out/`));
        const outDir = outDirs[outDirs.length - 1];
        const skill_id = outDir.slice(outDir.lastIndexOf('/') + 1);
        for (const { name, body } of seed.writeArtifacts(skill_id)) {
          await io.writeFile(`${outDir}/${name}`, JSON.stringify(body));
        }
      }
      return { exitCode, stdout: '', stderr: exitCode === 0 ? '' : 'boom' };
    },
    checksum: (value) => `sum:${JSON.stringify(value).length}`,
  };
  return { io, files };
}

const DOCS: Record<string, string> = {
  'video-content-brief': '# brief\nDo the brief.',
  'video-slide-worker': '# slide\nOne fragment per scene.',
};

describe('buildSkillPrompt', () => {
  it('embeds skill doc, io paths and the strict artifact contract', () => {
    const p = buildSkillPrompt({
      skillDoc: '# hi', skill_id: 'video-content-brief', run,
      outDir: '/runs/run-1/out/video-content-brief',
      contextPath: '/runs/run-1/in/x.context.json', priorPath: '/runs/run-1/in/x.prior.json',
    });
    expect(p).toContain('video_production_v1');
    expect(p).toContain('/runs/run-1/out/video-content-brief');
    expect(p).toContain('"project_id": "project-1"');
    expect(p).toContain('EXACTLY ONE file');
  });

  it('switches to multi-file wording for slide worker', () => {
    const p = buildSkillPrompt({
      skillDoc: '# s', skill_id: 'video-slide-worker', run,
      outDir: '/o', contextPath: '/c', priorPath: '/pr',
    });
    expect(p).toContain('writes MANY files');
  });
});

describe('createSkillExecutor', () => {
  const input = (skill_id: VideoSkillExecutionInput['skill_id']): VideoSkillExecutionInput => ({
    run, skill_id, context: { hello: 'world' }, prior_artifacts: [],
  });

  it('runs a skill and returns a normalized, checksummed artifact', async () => {
    const { io } = makeIO({
      skillDocs: DOCS,
      writeArtifacts: () => [{
        name: 'video-content-brief.json',
        // 일부러 checksum 비우고 source_versions 누락 → 브릿지가 정규화해야 함.
        body: { schema_version: 'video_production_v1', artifact_type: '01_content_brief',
          project_id: 'WRONG', run_id: 'WRONG', version: 1, status: 'draft', issues: [],
          generated_by: 'video-content-brief', checksum: '', data: { ok: true } },
      }],
    });
    const executeSkill = createSkillExecutor(io);
    const out = await executeSkill(input('video-content-brief'));
    expect(out).toHaveLength(1);
    expect(out[0].project_id).toBe('project-1');   // 정규화: run 정체성으로 교정
    expect(out[0].run_id).toBe('run-1');
    expect(out[0].source_versions).toEqual({});    // 누락 보정
    expect(out[0].checksum).toMatch(/^sum:/);       // 브릿지가 채움
    expect(out[0].data).toEqual({ ok: true });
  });

  it('supports multi-file skills (one artifact per scene)', async () => {
    const { io } = makeIO({
      skillDocs: DOCS,
      writeArtifacts: () => [
        { name: 'scene_01.json', body: { artifact_type: '02_slide_fragments', data: { s: 1 } } },
        { name: 'scene_02.json', body: { artifact_type: '02_slide_fragments', data: { s: 2 } } },
      ],
    });
    const out = await createSkillExecutor(io)(input('video-slide-worker'));
    expect(out).toHaveLength(2);
    expect(out.map((a) => (a.data as { s: number }).s).sort()).toEqual([1, 2]);
  });

  it('throws when claude exits non-zero', async () => {
    const { io } = makeIO({ skillDocs: DOCS, claudeExit: 1 });
    await expect(createSkillExecutor(io)(input('video-content-brief'))).rejects.toThrow(/exited 1/);
  });

  it('throws when the skill wrote no artifact', async () => {
    const { io } = makeIO({ skillDocs: DOCS, writeArtifacts: () => [] });
    await expect(createSkillExecutor(io)(input('video-content-brief'))).rejects.toThrow(/no artifact/);
  });

  it('throws on missing SKILL.md', async () => {
    const { io } = makeIO({ skillDocs: {} });
    await expect(createSkillExecutor(io)(input('video-content-brief'))).rejects.toThrow(/SKILL\.md not found/);
  });

  it('content_planning_v1 계약: gate_stage를 최상위로 보존하고 schema_version을 설정', async () => {
    const { io } = makeIO({
      skillDocs: DOCS,
      writeArtifacts: () => [{
        name: 'content-key-plan.json',
        body: { artifact_type: 'key_content_plan_doc', gate_stage: 'key_content_plan_doc',
          status: 'draft', data: { applied_sales_logic: {}, pulling_keyword_plan: [{ keyword: 'k', reason: 'r' }] } },
      }],
    });
    const executeSkill = createSkillExecutor(io, { contract: 'content_planning_v1' });
    const out = await executeSkill(input('video-content-brief'));
    expect(out[0].schema_version).toBe('content_planning_v1');
    expect(out[0].gate_stage).toBe('key_content_plan_doc');
    expect(out[0].checksum).toBeTruthy();
  });

  it('content_planning_v1 계약: gate_stage가 data 안에 있어도 최상위로 승격', async () => {
    const { io } = makeIO({
      skillDocs: DOCS,
      writeArtifacts: () => [{
        name: 'x.json',
        body: { artifact_type: 't', status: 'draft', data: { gate_stage: 'script_draft' } },
      }],
    });
    const out = await createSkillExecutor(io, { contract: 'content_planning_v1' })(input('video-content-brief'));
    expect(out[0].gate_stage).toBe('script_draft');
  });

  it('throws on non-JSON artifact', async () => {
    const { io, files } = makeIO({ skillDocs: DOCS });
    // runClaude가 깨진 파일을 쓰도록 override.
    io.runClaude = async ({ cwd }) => {
      files.set(`${cwd}/out/video-content-brief/x.json`, '{not json');
      // listJson이 보도록 dir 등록
      await io.writeFile(`${cwd}/out/video-content-brief/x.json`, '{not json');
      return { exitCode: 0, stdout: '', stderr: '' };
    };
    await expect(createSkillExecutor(io)(input('video-content-brief'))).rejects.toThrow(/not valid JSON/);
  });
});

describe('bridge wired into runVideoProductionPlanning (user-flow chain)', () => {
  it('drives the full skill chain end-to-end with valid artifacts', async () => {
    const { io } = makeIO({
      skillDocs: new Proxy({}, { get: () => '# any skill' }) as Record<string, string>,
      writeArtifacts: (skill_id) => [{
        name: `${skill_id}.json`,
        body: { artifact_type: skill_id, status: 'draft', data: { skill_id } },
      }],
    });
    const executeSkill = createSkillExecutor(io);
    const seen: string[] = [];
    const artifacts = await runVideoProductionPlanning(
      { run, context: {} },
      {
        executeSkill: async (i) => {
          seen.push(i.skill_id);
          return executeSkill(i);
        },
      },
    );
    // 9개 기획 스킬 전부 실행 + 각자 유효 아티팩트 → runner.validateArtifact 통과.
    expect(seen).toHaveLength(9);
    expect(artifacts).toHaveLength(9);
    artifacts.forEach((a) => {
      expect(a.run_id).toBe('run-1');
      expect(a.checksum).toBeTruthy();
    });
  });
});
