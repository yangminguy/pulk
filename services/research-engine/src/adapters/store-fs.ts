// store-fs adapter — SecondBrainStorePort backed by the local filesystem.
//
// Layout (RESEARCH_ENGINE_SPEC §6, root = RESEARCH_STORE_DIR, default
// ~/second-brain/research/):
//   raw_sources/<videoId>.transcript.json   raw skill payload, verbatim
//   raw_sources/<videoId>.meta.json          stats + channel + market
//   raw_sources/.sha256-index.json           sha256 → videoId (reupload dedup)
//   knowledge_atoms/<runId>/<claimId>.json
//   graph/<runId>.edges.jsonl
//   syntheses/<runId>.json
//   reports/<runId>.md
//   runs/<runId>/{request.json,state.json}
//
// All writes are atomic (write .tmp → rename). Transcript re-save is skipped when
// the sha256 is already indexed. Principle-card push is delegated to an optional
// writer (brain-cards) and is a graceful no-op when absent.

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type {
  ConceptEdge,
  KnowledgeAtom,
  RunState,
  SecondBrainStorePort,
  SynthesisReport,
  SynthesizedPrinciple,
  Transcript,
  VideoMeta,
} from '@l5/core';

/** Optional sink for top synthesized principles (brain-cards adapter). */
export interface PrincipleCardWriter {
  push(input: {
    topic: string;
    notionUrl: string | null;
    principles: SynthesizedPrinciple[];
  }): Promise<void>;
}

export interface StoreFsOptions {
  rootDir?: string;
  cards?: PrincipleCardWriter;
  /** structured progress log (defaults to console.error). */
  log?: (msg: string) => void;
}

/** Resolve `~` prefix to the user's home dir. */
export function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

export function defaultStoreDir(): string {
  return expandHome(process.env.RESEARCH_STORE_DIR ?? join('~', 'second-brain', 'research'));
}

function atomicWrite(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${randomBytes(6).toString('hex')}`;
  writeFileSync(tmp, data, 'utf8');
  renameSync(tmp, path);
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

export class FsStore implements SecondBrainStorePort {
  private readonly root: string;
  private readonly cards?: PrincipleCardWriter;
  private readonly log: (msg: string) => void;
  private shaIndex: Record<string, string> | null = null;

  constructor(opts: StoreFsOptions = {}) {
    this.root = opts.rootDir ?? defaultStoreDir();
    this.cards = opts.cards;
    this.log = opts.log ?? ((m) => process.stderr.write(`${m}\n`));
  }

  // ---- paths ----
  private rawDir(): string {
    return join(this.root, 'raw_sources');
  }
  private transcriptPath(videoId: string): string {
    return join(this.rawDir(), `${videoId}.transcript.json`);
  }
  private metaPath(videoId: string): string {
    return join(this.rawDir(), `${videoId}.meta.json`);
  }
  private shaIndexPath(): string {
    return join(this.rawDir(), '.sha256-index.json');
  }
  private runDir(runId: string): string {
    return join(this.root, 'runs', runId);
  }

  // ---- state ----
  async saveState(state: RunState): Promise<void> {
    const dir = this.runDir(state.runId);
    atomicWrite(join(dir, 'request.json'), JSON.stringify(state.request, null, 2));
    atomicWrite(join(dir, 'state.json'), JSON.stringify(state, null, 2));
  }

  async loadState(runId: string): Promise<RunState | null> {
    return readJson<RunState>(join(this.runDir(runId), 'state.json'));
  }

  // ---- transcript dedup ----
  private loadShaIndex(): Record<string, string> {
    if (this.shaIndex) return this.shaIndex;
    this.shaIndex = readJson<Record<string, string>>(this.shaIndexPath()) ?? {};
    return this.shaIndex;
  }

  async hasTranscriptSha(sha256: string): Promise<boolean> {
    if (!sha256) return false;
    return Object.prototype.hasOwnProperty.call(this.loadShaIndex(), sha256);
  }

  async saveTranscript(transcript: Transcript, meta: VideoMeta): Promise<{ deduped: boolean }> {
    const index = this.loadShaIndex();
    if (transcript.sha256 && Object.prototype.hasOwnProperty.call(index, transcript.sha256)) {
      return { deduped: true };
    }
    atomicWrite(this.transcriptPath(transcript.videoId), JSON.stringify(transcript, null, 2));
    atomicWrite(this.metaPath(meta.videoId), JSON.stringify(meta, null, 2));
    if (transcript.sha256) {
      index[transcript.sha256] = transcript.videoId;
      atomicWrite(this.shaIndexPath(), JSON.stringify(index, null, 2));
    }
    return { deduped: false };
  }

  async loadTranscript(videoId: string): Promise<Transcript | null> {
    return readJson<Transcript>(this.transcriptPath(videoId));
  }

  // ---- atoms / graph / synthesis / report ----
  async saveAtoms(runId: string, atoms: KnowledgeAtom[]): Promise<void> {
    const dir = join(this.root, 'knowledge_atoms', runId);
    for (const atom of atoms) {
      atomicWrite(join(dir, `${atom.claimId}.json`), JSON.stringify(atom, null, 2));
    }
  }

  async saveGraph(runId: string, edges: ConceptEdge[]): Promise<void> {
    const lines = edges.map((e) => JSON.stringify(e)).join('\n');
    atomicWrite(join(this.root, 'graph', `${runId}.edges.jsonl`), lines ? `${lines}\n` : '');
  }

  async saveSynthesis(runId: string, report: SynthesisReport): Promise<void> {
    atomicWrite(join(this.root, 'syntheses', `${runId}.json`), JSON.stringify(report, null, 2));
  }

  async saveReportMarkdown(runId: string, markdown: string): Promise<string> {
    const path = join(this.root, 'reports', `${runId}.md`);
    atomicWrite(path, markdown);
    return path;
  }

  // ---- book chapters (§12-A) ----
  private bookChapterPath(runId: string, chapterId: string): string {
    // chapterIds are model/skeleton-derived slugs; sanitize to keep them as a
    // single safe filename segment.
    const safe = chapterId.replace(/[^a-zA-Z0-9._-]/g, '_') || 'chapter';
    return join(this.root, 'book_chapters', runId, `${safe}.md`);
  }

  async saveBookChapter(runId: string, chapterId: string, markdown: string): Promise<void> {
    atomicWrite(this.bookChapterPath(runId, chapterId), markdown);
  }

  async loadBookChapter(runId: string, chapterId: string): Promise<string | null> {
    try {
      return readFileSync(this.bookChapterPath(runId, chapterId), 'utf8');
    } catch {
      return null;
    }
  }

  // ---- brain cards (graceful) ----
  async pushPrincipleCards(input: {
    topic: string;
    notionUrl: string | null;
    principles: SynthesizedPrinciple[];
  }): Promise<void> {
    if (!this.cards) {
      this.log('[store] brain-cards writer not configured — skipping principle push');
      return;
    }
    try {
      await this.cards.push(input);
    } catch (err) {
      this.log(`[store] brain-card push failed (non-fatal): ${(err as Error).message}`);
    }
  }

  /** best-effort check used by the CLI to decide the store root is usable. */
  ensureRoot(): void {
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true });
  }
}
