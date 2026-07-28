// skill-executor.ts — Phase 0 스킬 실행 브릿지.
//
// runVideoProductionPlanning(runner.ts)의 deps.executeSkill 구현체. 스킬 SKILL.md를
// 로드해 claude CLI(headless)로 실행하고, 스킬이 파일로 쓴 아티팩트 JSON을 읽어
// envelope로 반환한다. stdout을 파싱하지 않고 파일 계약을 쓰므로 "malformed JSON" 병목을
// 피한다. 모든 IO는 주입 → NocoBase/실제 claude 없이 단위 테스트 가능(코드베이스 DI 관행).

import type {
  ProductionArtifactEnvelope,
  VideoProductionRun,
  VideoSkillExecutionInput,
} from './runner.js';

/**
 * 브릿지가 실행하는 스킬 입력. skill_id는 임의 문자열(디렉토리명) — video-production과
 * content-planning 스킬을 모두 받는다. VideoSkillExecutionInput(narrower)도 이 형에 대입 가능.
 */
export interface BridgeSkillInput {
  run: VideoProductionRun;
  skill_id: string;
  context: Record<string, unknown>;
  prior_artifacts: ProductionArtifactEnvelope[];
}

export interface SkillClaudeResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** 브릿지가 필요로 하는 모든 부작용(파일·프로세스·해시)을 주입한다. */
export interface SkillExecutorIO {
  /** 스킬 루트. SKILL.md 경로 = join(skillsRoot, skill_id, 'SKILL.md'). */
  skillsRoot: string;
  /** run별 작업 디렉토리 루트. run 디렉토리 = join(runsRoot, run.id). */
  runsRoot: string;
  join(...parts: string[]): string;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  /** dir 안의 *.json 파일 절대경로 목록(정렬). 없으면 []. */
  listJson(dir: string): Promise<string[]>;
  /** headless claude 실행. cwd에서 프롬프트를 돌리고 결과 코드를 돌려준다. */
  runClaude(input: { prompt: string; cwd: string }): Promise<SkillClaudeResult>;
  /** envelope 정규화용 결정적 체크섬. */
  checksum(value: unknown): string;
}

/** 씬별 다중 파일을 쓰는 스킬(하나의 실행에서 N개 아티팩트). */
const MULTI_OUTPUT_SKILLS = new Set<string>(['video-slide-worker']);

/**
 * 아티팩트 envelope 계약.
 * - video_production_v1: 제작 파이프라인(runner.validateArtifact가 강제).
 * - content_planning_v1: 콘텐츠 기획 스킬. 최상위 gate_stage로 게이트 리포트를 채운다.
 */
export type SkillContract = 'video_production_v1' | 'content_planning_v1';

export interface CreateSkillExecutorOptions {
  /** 기본 video_production_v1(기존 동작 불변). */
  contract?: SkillContract;
}

/**
 * SKILL.md 지침 + 아티팩트 계약 + 입출력 경로를 담은 headless 프롬프트를 조립한다.
 * 순수 함수(부작용 없음) — 프롬프트 조립 로직을 독립 테스트할 수 있게 분리.
 */
export function buildSkillPrompt(input: {
  skillDoc: string;
  skill_id: string;
  run: VideoProductionRun;
  outDir: string;
  contextPath: string;
  priorPath: string;
  contract?: SkillContract;
}): string {
  const contract: SkillContract = input.contract ?? 'video_production_v1';
  const planning = contract === 'content_planning_v1';
  const multi = MULTI_OUTPUT_SKILLS.has(input.skill_id);
  return [
    `You are executing the Pulk ${planning ? 'content-planning' : 'video-production'} skill "${input.skill_id}" in headless mode.`,
    ``,
    `## Skill instructions`,
    input.skillDoc.trim(),
    ``,
    `## Inputs (read these files first)`,
    `- Context JSON: ${input.contextPath}`,
    `- Prior artifacts JSON (array, may be empty): ${input.priorPath}`,
    ``,
    `## Output contract — STRICT`,
    `Write artifact JSON file(s) into this directory: ${input.outDir}`,
    `Each file is ONE JSON object with EXACTLY these keys:`,
    `  "schema_version": "${contract}",`,
    `  "artifact_type": <string>,`,
    ...(planning
      ? [`  "gate_stage": "<the gate report stage this skill fills, per the skill instructions>",`]
      : []),
    `  "project_id": "${input.run.project_id}",`,
    `  "run_id": "${input.run.id}",`,
    `  "version": 1,`,
    `  "source_versions": {},`,
    `  "status": "draft" | "blocked",`,
    `  "issues": [<string>...],`,
    `  "generated_by": "${input.skill_id}",`,
    `  "checksum": "",`,
    `  "data": { ... skill-specific payload, all fields from the skill's STRICT output ... }`,
    `Leave "checksum" empty — the bridge computes it. All free-text inside "data" MUST be 한국어.`,
    ...(planning
      ? [`Put every domain field the skill defines inside "data". "gate_stage" is the ONLY domain-level key at top level.`]
      : []),
    multi
      ? `This skill writes MANY files (one per scene) into ${input.outDir}. Use stable scene ids as file names.`
      : `Write EXACTLY ONE file: ${input.outDir}/${input.skill_id}.json`,
    `Do NOT print the artifact to stdout — write the file(s) only, then stop.`,
    `If you cannot satisfy the contract truthfully, still write a file with status "blocked" and a reason in "issues".`,
  ].join('\n');
}

/**
 * executeSkill 구현을 반환하는 팩토리. 반환 함수는 항상 배열을 돌려주며(단일 스킬도 [1개]),
 * runner가 그대로 validateArtifact에 태운다. 정체성·checksum·필수배열은 브릿지가 정규화하므로
 * 스킬 출력이 살짝 틀려도(빈 checksum, 누락된 source_versions 등) 체인이 깨지지 않는다.
 */
export function createSkillExecutor(io: SkillExecutorIO, options: CreateSkillExecutorOptions = {}) {
  const contract: SkillContract = options.contract ?? 'video_production_v1';
  return async function executeSkill(
    input: BridgeSkillInput,
  ): Promise<ProductionArtifactEnvelope[]> {
    const { run, skill_id } = input;

    const skillDocPath = io.join(io.skillsRoot, skill_id, 'SKILL.md');
    let skillDoc: string;
    try {
      skillDoc = await io.readFile(skillDocPath);
    } catch {
      throw new Error(`${skill_id}: SKILL.md not found at ${skillDocPath}`);
    }

    const runDir = io.join(io.runsRoot, run.id);
    const inDir = io.join(runDir, 'in');
    const outDir = io.join(runDir, 'out', skill_id);
    await io.mkdirp(inDir);
    await io.mkdirp(outDir);

    const contextPath = io.join(inDir, `${skill_id}.context.json`);
    const priorPath = io.join(inDir, `${skill_id}.prior.json`);
    await io.writeFile(contextPath, JSON.stringify(input.context ?? {}, null, 2));
    await io.writeFile(priorPath, JSON.stringify(input.prior_artifacts ?? [], null, 2));

    const prompt = buildSkillPrompt({ skillDoc, skill_id, run, outDir, contextPath, priorPath, contract });
    const result = await io.runClaude({ prompt, cwd: runDir });
    if (result.exitCode !== 0) {
      const tail = (result.stderr || result.stdout || '').slice(-400);
      throw new Error(`${skill_id}: claude exited ${result.exitCode}: ${tail}`);
    }

    const files = await io.listJson(outDir);
    if (files.length === 0) {
      throw new Error(`${skill_id}: no artifact written to ${outDir}`);
    }

    const artifacts: ProductionArtifactEnvelope[] = [];
    for (const file of files) {
      const raw = await io.readFile(file);
      let parsed: Partial<ProductionArtifactEnvelope>;
      try {
        parsed = JSON.parse(raw) as Partial<ProductionArtifactEnvelope>;
      } catch {
        throw new Error(`${skill_id}: artifact ${file} is not valid JSON`);
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${skill_id}: artifact ${file} is not a JSON object`);
      }
      artifacts.push(normalizeArtifact(parsed, run, skill_id, io.checksum, contract));
    }
    return artifacts;
  };
}

/** 스킬 출력 envelope의 정체성·필수필드·checksum을 정규화한다(브릿지가 소유). */
function normalizeArtifact(
  parsed: Partial<ProductionArtifactEnvelope> & { gate_stage?: unknown },
  run: VideoProductionRun,
  skill_id: string,
  checksum: (value: unknown) => string,
  contract: SkillContract,
): ProductionArtifactEnvelope {
  const version =
    Number.isInteger(parsed.version) && (parsed.version as number) >= 1
      ? (parsed.version as number)
      : 1;
  const status: ProductionArtifactEnvelope['status'] =
    parsed.status === 'approved' || parsed.status === 'blocked' ? parsed.status : 'draft';
  const base: Omit<ProductionArtifactEnvelope, 'checksum'> = {
    schema_version: contract,
    artifact_type: String(parsed.artifact_type ?? skill_id),
    project_id: run.project_id,
    run_id: run.id,
    version,
    source_versions:
      parsed.source_versions && typeof parsed.source_versions === 'object'
        ? parsed.source_versions
        : {},
    status,
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
    generated_by: parsed.generated_by ? String(parsed.generated_by) : skill_id,
    data: parsed.data ?? {},
  };
  // content_planning: 게이트 리포트 stage를 최상위로 보존(top-level 또는 data 안에서 승격).
  if (contract === 'content_planning_v1') {
    const dataGate = (parsed.data as { gate_stage?: unknown } | undefined)?.gate_stage;
    const gate_stage = parsed.gate_stage ?? dataGate;
    if (gate_stage != null) base.gate_stage = String(gate_stage);
  }
  return { ...base, checksum: checksum(base) };
}
