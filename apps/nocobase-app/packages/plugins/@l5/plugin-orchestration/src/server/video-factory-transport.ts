// M5: Video Factory transport — spawn-based local Remotion/tsx project.
//
// ENV:
//   VIDEO_FACTORY_DIR  default: /Users/wonminyang/ai-slide-video-factory
//
// makeVideoFactoryTransport() returns null (graceful disable) when the
// directory does not exist.
//
// generate() writes a job JSON and runs validate only. Render is left to
// a human running `npm run render` — it takes minutes.
//
// Security: slug is sanitized to [a-z0-9-] only; path traversal is blocked.

import { execFile } from 'child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, basename } from 'path';

type VideoFactoryTransport = import('../../../../../../../../packages/l5-core/dist/functions/memory/video-factory').VideoFactoryTransport;

const VALIDATE_TIMEOUT_MS = 60_000;

function getDir(): string | null {
  const dir = process.env.VIDEO_FACTORY_DIR ?? '/Users/wonminyang/ai-slide-video-factory';
  if (!existsSync(dir)) return null;
  return dir;
}

function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'l5-job';
}

function buildJobJson(slug: string, brief: { topic: string; angle?: string; format?: string }) {
  const title = brief.topic.slice(0, 80);
  const format = brief.format ?? 'youtube_16_9';
  return {
    id: `l5-${slug}`,
    title,
    slug: `l5-${slug}`,
    format,
    theme: 'default_deck',
    fps: 30,
    width: 1920,
    height: 1080,
    status: 'draft',
    generationMode: 'review_only',
    scenes: [
      {
        scene_id: 'hero_01',
        type: 'hero',
        duration: 6,
        rhythm_role: 'hook',
        transition: 'fade',
        headline: title,
        subtitle: brief.angle ?? '',
        caption: '',
      },
      {
        scene_id: 'problem_01',
        type: 'problem',
        duration: 8,
        rhythm_role: 'tension',
        headline: brief.angle ?? title,
        bullets: [brief.angle ?? brief.topic],
        caption: '',
      },
    ],
    output: {},
  };
}

function runValidate(dir: string, jobRelPath: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Use npx tsx directly — avoids needing npm run which may differ per env
    execFile(
      'npx',
      ['tsx', 'scripts/validate-job.ts', '--job', jobRelPath],
      { cwd: dir, timeout: VALIDATE_TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) {
          const summary = (stderr || stdout).slice(0, 400);
          resolve({ ok: false, error: summary });
          return;
        }
        resolve({ ok: true });
      },
    );
  });
}

function runValidateBrief(dir: string, briefRelPath: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Same pattern as runValidate — npx tsx scripts/validate-brief.ts --brief <path>.
    execFile(
      'npx',
      ['tsx', 'scripts/validate-brief.ts', '--brief', briefRelPath],
      { cwd: dir, timeout: VALIDATE_TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) {
          const summary = (stderr || stdout).slice(0, 400);
          resolve({ ok: false, error: summary });
          return;
        }
        resolve({ ok: true });
      },
    );
  });
}

const PRESET_FILE = '_l5-preset.json';

// M4: 파일 기반 렌더 상태 관찰값. 판단(상태 도출)은 l5-core deriveRenderJobStatus가 한다.
// Factory 프로토콜: jobs/<file>.json 인박스 → (사람/오케스트레이터가 render 실행) →
// outputs/<job.slug>/{video.mp4, render_report.json, qa_report.md, youtube_metadata.json}.
export interface FactoryRenderObservation {
  job_file_exists: boolean;
  output_dir_exists: boolean;
  video_file_exists: boolean;
  video_size_bytes?: number;
  render_report_exists: boolean;
  render_report?: Record<string, unknown> | null;
  qa_report_exists?: boolean;
  youtube_metadata_exists?: boolean;
  thumbnail_exists?: boolean;
  error_file_exists?: boolean;
  error_message?: string;
  paths?: {
    job?: string;
    output_dir?: string;
    video?: string;
    thumbnail?: string;
    render_report?: string;
    qa_report?: string;
    youtube_metadata?: string;
  };
}

export function makeVideoFactoryTransport(): (VideoFactoryTransport & {
  submitJob(videoJob: unknown): Promise<{ ok: boolean; job_path?: string; validated?: boolean; error?: string }>;
  submitBrief(brief: unknown): Promise<{ ok: boolean; error?: string; data?: { brief_path: string; validated: boolean } }>;
  getRenderJobStatus(slug: string): Promise<{ ok: boolean; error?: string; observation?: FactoryRenderObservation }>;
}) | null {
  const dir = getDir();
  if (!dir) return null;

  return {
    async generate(brief) {
      try {
        const slug = sanitizeSlug(brief.topic);
        const filename = `l5-${slug}.json`;
        // Block path traversal: ensure filename is just a basename
        if (basename(filename) !== filename) {
          return { ok: false, error: 'invalid slug' };
        }
        const jobRelPath = `jobs/${filename}`;
        const jobAbsPath = resolve(dir, jobRelPath);

        const job = buildJobJson(slug, brief);
        writeFileSync(jobAbsPath, JSON.stringify(job, null, 2), 'utf8');

        const result = await runValidate(dir, jobRelPath);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        return { ok: true, data: { job_path: jobAbsPath, validated: true } };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async configure(preset) {
      try {
        const presetPath = resolve(dir, `jobs/${PRESET_FILE}`);
        let existing: Record<string, unknown> = {};
        if (existsSync(presetPath)) {
          try {
            existing = JSON.parse(readFileSync(presetPath, 'utf8'));
          } catch {
            existing = {};
          }
        }
        const merged = {
          ...existing,
          ...(preset.strategy !== undefined ? { strategy: preset.strategy } : {}),
          ...(preset.content_style !== undefined ? { content_style: preset.content_style } : {}),
          ...(preset.notes !== undefined ? { notes: preset.notes } : {}),
        };
        writeFileSync(presetPath, JSON.stringify(merged, null, 2), 'utf8');
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async getConfig() {
      try {
        const presetPath = resolve(dir, `jobs/${PRESET_FILE}`);
        if (!existsSync(presetPath)) return {};
        const raw = JSON.parse(readFileSync(presetPath, 'utf8'));
        return {
          strategy: raw?.strategy ?? undefined,
          content_style: raw?.content_style ?? undefined,
          notes: raw?.notes ?? undefined,
        };
      } catch {
        return {};
      }
    },

    async submitJob(videoJob: unknown): Promise<{ ok: boolean; job_path?: string; validated?: boolean; error?: string }> {
      try {
        const rawSlug = String((videoJob as any).slug ?? (videoJob as any).id ?? 'l5-job');
        const slug = sanitizeSlug(rawSlug);
        const filename = `l5-${slug}.json`;
        // Block path traversal: ensure filename is just a basename.
        if (basename(filename) !== filename) {
          return { ok: false, error: 'invalid slug' };
        }
        const jobRelPath = `jobs/${filename}`;
        const jobAbsPath = resolve(dir, jobRelPath);
        writeFileSync(jobAbsPath, JSON.stringify(videoJob, null, 2), 'utf8');
        const result = await runValidate(dir, jobRelPath);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        return { ok: true, job_path: jobAbsPath, validated: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async submitBrief(brief: unknown): Promise<{ ok: boolean; error?: string; data?: { brief_path: string; validated: boolean } }> {
      try {
        const b = brief as Record<string, unknown>;
        const rawSlug = String(b?.content_card_id ?? b?.title ?? 'l5-brief');
        const slug = sanitizeSlug(rawSlug);
        const filename = `${slug}.json`;
        // Block path traversal: ensure filename is just a basename.
        if (basename(filename) !== filename) {
          return { ok: false, error: 'invalid slug' };
        }
        const briefRelPath = `briefs/${filename}`;
        const briefAbsPath = resolve(dir, briefRelPath);
        // Always write the brief file (leave it on disk even if validation fails).
        writeFileSync(briefAbsPath, JSON.stringify(brief, null, 2), 'utf8');

        const result = await runValidateBrief(dir, briefRelPath);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        return { ok: true, data: { brief_path: briefAbsPath, validated: true } };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    // M4: 렌더 상태 폴링용 파일 사실(facts) 수집. 도메인 판단은 하지 않는다.
    // slug는 factory job.slug(예: l5-<uuid>) 또는 그 base를 모두 허용한다 —
    // submitJob이 jobs/l5-<sanitized>.json으로 쓰고, render는 outputs/<job.slug>/에 쓴다.
    async getRenderJobStatus(slug: string): Promise<{ ok: boolean; error?: string; observation?: FactoryRenderObservation }> {
      try {
        const sanitized = sanitizeSlug(String(slug ?? ''));
        if (!sanitized || basename(`${sanitized}.json`) !== `${sanitized}.json`) {
          return { ok: false, error: 'invalid slug' };
        }

        // jobs/ 인박스: 후보 파일명 둘 다 확인 (l5- 접두어 유무).
        const jobCandidates = [`jobs/${sanitized}.json`, `jobs/l5-${sanitized}.json`];
        let jobAbsPath: string | undefined;
        let jobSlug: string | undefined;
        for (const rel of jobCandidates) {
          const abs = resolve(dir, rel);
          if (existsSync(abs)) {
            jobAbsPath = abs;
            try {
              const parsed = JSON.parse(readFileSync(abs, 'utf8'));
              if (parsed && typeof parsed.slug === 'string') jobSlug = parsed.slug;
            } catch {
              // job 파일이 깨졌어도 존재 사실은 유효.
            }
            break;
          }
        }

        // outputs/: render-final이 job.slug 기준으로 쓴다. job에서 못 읽으면 후보 디렉토리 탐색.
        const outCandidates = [jobSlug, sanitized, `l5-${sanitized}`].filter(Boolean) as string[];
        let outDir: string | undefined;
        for (const cand of outCandidates) {
          const abs = resolve(dir, 'outputs', cand);
          if (existsSync(abs)) {
            outDir = abs;
            break;
          }
        }

        const videoPath = outDir ? resolve(outDir, 'video.mp4') : undefined;
        const thumbPath = outDir ? resolve(outDir, 'thumbnail.png') : undefined;
        const reportPath = outDir ? resolve(outDir, 'render_report.json') : undefined;
        const qaPath = outDir ? resolve(outDir, 'qa_report.md') : undefined;
        const metaPath = outDir ? resolve(outDir, 'youtube_metadata.json') : undefined;
        const errorPath = outDir ? resolve(outDir, 'render_error.txt') : undefined;

        let videoSize: number | undefined;
        if (videoPath && existsSync(videoPath)) {
          try {
            videoSize = statSync(videoPath).size;
          } catch {
            videoSize = undefined;
          }
        }

        let renderReport: Record<string, unknown> | null = null;
        const reportExists = !!(reportPath && existsSync(reportPath));
        if (reportExists) {
          try {
            renderReport = JSON.parse(readFileSync(reportPath!, 'utf8'));
          } catch {
            renderReport = null;
          }
        }

        const errorExists = !!(errorPath && existsSync(errorPath));
        let errorMessage: string | undefined;
        if (errorExists) {
          try {
            errorMessage = readFileSync(errorPath!, 'utf8').slice(0, 400);
          } catch {
            errorMessage = 'render_error.txt (unreadable)';
          }
        }

        const observation: FactoryRenderObservation = {
          job_file_exists: !!jobAbsPath,
          output_dir_exists: !!outDir,
          video_file_exists: !!(videoPath && existsSync(videoPath)),
          ...(videoSize !== undefined ? { video_size_bytes: videoSize } : {}),
          render_report_exists: reportExists,
          render_report: renderReport,
          qa_report_exists: !!(qaPath && existsSync(qaPath)),
          youtube_metadata_exists: !!(metaPath && existsSync(metaPath)),
          thumbnail_exists: !!(thumbPath && existsSync(thumbPath)),
          ...(errorExists ? { error_file_exists: true, error_message: errorMessage } : {}),
          paths: {
            ...(jobAbsPath ? { job: jobAbsPath } : {}),
            ...(outDir
              ? {
                  output_dir: outDir,
                  video: videoPath,
                  thumbnail: thumbPath,
                  render_report: reportPath,
                  qa_report: qaPath,
                  youtube_metadata: metaPath,
                }
              : {}),
          },
        };

        return { ok: true, observation };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };
}
