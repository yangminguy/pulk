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
import { existsSync, readFileSync, writeFileSync } from 'fs';
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

const PRESET_FILE = '_l5-preset.json';

export function makeVideoFactoryTransport(): (VideoFactoryTransport & { submitJob(videoJob: unknown): Promise<{ ok: boolean; job_path?: string; validated?: boolean; error?: string }> }) | null {
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
  };
}
