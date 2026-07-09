// cto-planning/scout — S1: Plan Grounding(계획 전 repo 스카우트).
//
// 계획 턴이 코드베이스를 "보고" 판단하도록, 대상 repo의 실측 요약을 만들어
// planning 컨텍스트에 주입한다. l5-core는 이식성 유지를 위해 fs를 직접 쓰지
// 않고 deps(readdir/readFile/exists)를 주입받는다 — NocoBase plugin은 node:fs를,
// 테스트는 인메모리 가짜를 넘긴다. never-throw: 어떤 실패도 빈 리포트로 강등.

export interface ScoutDeps {
  /** 디렉토리 항목 이름 목록. 실패 시 throw 대신 [] 권장(내부에서 흡수함). */
  readdir(path: string): string[];
  readFile(path: string): string | null;
  isDirectory(path: string): boolean;
}

export interface RepoScoutModule {
  path: string;
  /** package.json name/description 또는 디렉토리 성격 한 줄. */
  summary: string;
}

export interface RepoScoutMatch {
  path: string;
  /** 어떤 키워드가 왜 매칭됐는지. */
  reason: string;
}

export interface RepoScoutReport {
  repo_path: string;
  modules: RepoScoutModule[];
  /** founder 메시지 키워드와 이름이 겹치는 기존 파일/디렉토리 — 재사용/중복 판단 근거. */
  keyword_matches: RepoScoutMatch[];
  /** 스카우트 실패/부분 실패 사유(빈 배열 = 정상). */
  warnings: string[];
}

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__tests__',
]);

/** founder 메시지에서 스카우트 키워드 추출: 2자 이상 한글/영문 토큰, 최대 8개. */
export function extractScoutKeywords(message: string): string[] {
  const tokens = (message.toLowerCase().match(/[a-z][a-z0-9_-]{2,}|[가-힣]{2,}/g) ?? []);
  const STOP = new Set([
    '만들어줘', '해줘', '기능', '추가', '개발', '프로젝트', 'the', 'and', 'for',
    '그리고', '있는', '있게', '수정', '해서', '하는', '하고',
  ]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

function listDirSafe(deps: ScoutDeps, path: string): string[] {
  try {
    return deps.readdir(path) ?? [];
  } catch {
    return [];
  }
}

function readPackageSummary(deps: ScoutDeps, dir: string): string | null {
  try {
    const raw = deps.readFile(`${dir}/package.json`);
    if (!raw) return null;
    const pkg = JSON.parse(raw) as { name?: string; description?: string };
    if (!pkg.name) return null;
    return pkg.description ? `${pkg.name} — ${pkg.description}` : pkg.name;
  } catch {
    return null;
  }
}

/**
 * 대상 repo를 2단계 깊이로 훑어 모듈 지도 + 키워드 매칭을 만든다.
 * LLM 미사용(결정적·저비용). 실패는 warnings로만 남기고 항상 리포트를 반환.
 */
export function scoutRepo(
  repoPath: string,
  keywords: string[],
  deps: ScoutDeps,
  opts?: { maxModules?: number; maxMatches?: number },
): RepoScoutReport {
  const maxModules = opts?.maxModules ?? 20;
  const maxMatches = opts?.maxMatches ?? 15;
  const modules: RepoScoutModule[] = [];
  const keyword_matches: RepoScoutMatch[] = [];
  const warnings: string[] = [];
  const kws = keywords.map((k) => k.toLowerCase()).filter(Boolean);

  const top = listDirSafe(deps, repoPath);
  if (top.length === 0) {
    warnings.push(`repo를 읽을 수 없음: ${repoPath}`);
    return { repo_path: repoPath, modules, keyword_matches, warnings };
  }

  const matchName = (name: string, rel: string) => {
    if (keyword_matches.length >= maxMatches) return;
    const lower = name.toLowerCase();
    const hit = kws.find((k) => lower.includes(k));
    if (hit) keyword_matches.push({ path: rel, reason: `이름에 키워드 '${hit}' 포함` });
  };

  const walk = (dir: string, rel: string, depth: number) => {
    for (const name of listDirSafe(deps, dir)) {
      if (IGNORE_DIRS.has(name) || name.startsWith('.')) continue;
      const abs = `${dir}/${name}`;
      const childRel = rel ? `${rel}/${name}` : name;
      let isDir = false;
      try {
        isDir = deps.isDirectory(abs);
      } catch {
        continue;
      }
      matchName(name, childRel);
      if (!isDir) continue;
      if (modules.length < maxModules) {
        const summary = readPackageSummary(deps, abs);
        if (summary) modules.push({ path: childRel, summary });
      }
      if (depth < 2) walk(abs, childRel, depth + 1);
    }
  };

  try {
    walk(repoPath, '', 0);
  } catch (e) {
    warnings.push(`스카우트 부분 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { repo_path: repoPath, modules, keyword_matches, warnings };
}

/** 스카우트 리포트를 planning 프롬프트 섹션 문자열로. 비어 있으면 null. */
export function formatScoutForPrompt(report: RepoScoutReport | null | undefined): string | null {
  if (!report) return null;
  const lines: string[] = [];
  if (report.modules.length) {
    lines.push('[repo 실측 — 기존 모듈]');
    for (const m of report.modules.slice(0, 20)) lines.push(`- ${m.path}: ${m.summary}`);
  }
  if (report.keyword_matches.length) {
    lines.push('[repo 실측 — 아이디어 키워드와 겹치는 기존 코드(재사용/중복 후보)]');
    for (const m of report.keyword_matches.slice(0, 15)) lines.push(`- ${m.path} (${m.reason})`);
  }
  if (!lines.length) return null;
  lines.push(
    '위 실측을 근거로: 재사용 가능한 기존 코드는 태스크 rationale에 "재사용: <경로>"로, 신규는 "신규" 명시. 이미 있는 것을 다시 만들지 마라.',
  );
  return lines.join('\n');
}
