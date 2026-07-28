#!/usr/bin/env node
// apply-edit-plan.mjs — EDL(edit-plan.json)의 clips → ffmpeg으로 깨끗한 나레이션 오디오 렌더.
//
// edit_main_audio.py의 검증된 필터 체인을 계승한다:
//   clip별 atrim → afade(클릭 방지) → concat → highpass → acompressor → loudnorm(-16 LUFS).
// clips는 "살릴 구간"만 담으므로, 사이의 실패테이크/무음은 concat 과정에서 자연히 제거된다.
//
// 사용:
//   node scripts/video-narration/apply-edit-plan.mjs \
//     --plan path/to/edit-plan.json \
//     --source full=path/to/full-read.m4a \
//     [--source revised=path/to/revised.m4a] \
//     --out path/to/narration   (→ narration.wav, narration.m4a 생성)
//     [--gap 0.12] [--fade 0.018]

import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

function arg(name, required = true, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined) {
    if (required) throw new Error(`--${name} is required`);
    return fallback;
  }
  return v;
}
function args(name) {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}`) out.push(process.argv[i + 1]);
  });
  return out;
}

const plan = JSON.parse(readFileSync(resolve(arg('plan')), 'utf8'));
const clips = Array.isArray(plan.clips) ? plan.clips : [];
if (clips.length === 0) throw new Error('plan.clips is empty — nothing to render');

const gap = Number(arg('gap', false, '0'));
const fade = Number(arg('fade', false, '0.018'));
const outPrefix = resolve(arg('out'));
mkdirSync(dirname(outPrefix), { recursive: true });

// source 이름 → ffmpeg input index.
const sourceSpecs = args('source');
if (sourceSpecs.length === 0) throw new Error('at least one --source name=path is required');
const sourceIndex = new Map();
const inputs = [];
sourceSpecs.forEach((spec, idx) => {
  const eq = spec.indexOf('=');
  if (eq < 0) throw new Error(`--source must be "name=path", got: ${spec}`);
  sourceIndex.set(spec.slice(0, eq), idx);
  inputs.push('-i', resolve(spec.slice(eq + 1)));
});

// clip별 필터 + 사이 gap(짧은 호흡) 삽입.
const filters = [];
const labels = [];
clips.forEach((c, i) => {
  if (!sourceIndex.has(c.source)) throw new Error(`clip source "${c.source}" has no matching --source`);
  const dur = c.end - c.start;
  filters.push(
    `[${sourceIndex.get(c.source)}:a]atrim=start=${c.start}:end=${c.end},asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=${fade},afade=t=out:st=${Math.max(0, dur - fade)}:d=${fade}[a${i}]`,
  );
  labels.push(`[a${i}]`);
  if (gap > 0 && i < clips.length - 1) {
    filters.push(`anullsrc=r=48000:cl=mono:d=${gap}[g${i}]`);
    labels.push(`[g${i}]`);
  }
});
filters.push(
  `${labels.join('')}concat=n=${labels.length}:v=0:a=1,` +
    `highpass=f=70,acompressor=threshold=0.125:ratio=2:attack=12:release=140,` +
    `loudnorm=I=-16:TP=-1.5:LRA=7[out]`,
);

const wav = `${outPrefix}.wav`;
const m4a = `${outPrefix}.m4a`;

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) {
    console.error(`${cmd} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

run('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  ...inputs,
  '-filter_complex', filters.join(';'),
  '-map', '[out]', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s24le', wav,
]);
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '192k', m4a]);

const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', wav], { encoding: 'utf8' });
console.log(JSON.stringify({ wav, m4a, duration: Number((probe.stdout ?? '0').trim()), clips: clips.length }, null, 2));
