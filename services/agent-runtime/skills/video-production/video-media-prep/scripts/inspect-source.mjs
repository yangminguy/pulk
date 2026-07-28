#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function arg(name, required = true) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (required && !value) throw new Error(`--${name} is required`);
  return value;
}

function normalized(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function compact(value) {
  return normalized(value).replace(/\s+/g, '');
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
}

async function checksum(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

const source = resolve(arg('source'));
const out = resolve(arg('out'));
const approvedScriptPath = arg('approved-script', false);
const transcriptPath = arg('transcript', false);
const orientationOverride = arg('orientation-override', false);
const probe = spawnSync('ffprobe', [
  '-v', 'error', '-show_entries',
  'format=duration,format_name,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate:stream_tags=rotate:stream_side_data=rotation',
  '-of', 'json', source,
], { encoding: 'utf8' });
if (probe.status !== 0) throw new Error(`ffprobe failed: ${probe.stderr || probe.stdout}`);

const metadata = JSON.parse(probe.stdout);
const video = metadata.streams?.find((stream) => stream.codec_type === 'video');
if (!video) throw new Error('source has no readable video stream');
const rotation = Number(video.tags?.rotate ?? video.side_data_list?.[0]?.rotation ?? 0);
const width = Number(video.width ?? 0);
const height = Number(video.height ?? 0);
const effectiveWidth = Math.abs(rotation) % 180 === 90 ? height : width;
const effectiveHeight = Math.abs(rotation) % 180 === 90 ? width : height;

let transcript_alignment = null;
if (approvedScriptPath && transcriptPath) {
  const approved = compact((await readFile(resolve(approvedScriptPath), 'utf8')).replace(/^#.*$/gm, ''));
  const transcriptRaw = await readFile(resolve(transcriptPath), 'utf8');
  let transcriptText = transcriptRaw;
  try {
    const parsed = JSON.parse(transcriptRaw);
    transcriptText = Array.isArray(parsed)
      ? parsed.map((item) => item.text ?? '').join(' ')
      : (parsed.text ?? parsed.transcript ?? parsed.segments?.map((item) => item.text ?? '').join(' ') ?? parsed.words?.map((item) => item.text ?? item.word ?? '').join(' ') ?? transcriptRaw);
  } catch {}
  const transcript = compact(transcriptText);
  const distance = editDistance(approved, transcript);
  const coverage = Math.max(0, 1 - distance / Math.max(approved.length, transcript.length, 1));
  transcript_alignment = {
    approved_character_count: approved.length,
    transcript_character_count: transcript.length,
    edit_distance: distance,
    coverage,
    material_difference: coverage < 0.9,
  };
}

const report = {
  schema_version: 'video-source-inspection-v1',
  source,
  checksum_sha256: await checksum(source),
  duration_sec: Number(metadata.format?.duration ?? 0),
  container: metadata.format?.format_name ?? null,
  bit_rate: Number(metadata.format?.bit_rate ?? 0),
  detected_orientation: effectiveWidth >= effectiveHeight ? 'horizontal' : 'vertical',
  orientation: orientationOverride ?? (effectiveWidth >= effectiveHeight ? 'horizontal' : 'vertical'),
  rotation,
  width: effectiveWidth,
  height: effectiveHeight,
  streams: metadata.streams,
  transcript_alignment,
  blockers: [
    ...(effectiveWidth < effectiveHeight && orientationOverride !== 'horizontal' ? ['source video is vertical; horizontal framing review is required'] : []),
    ...(transcript_alignment?.material_difference ? ['transcript materially differs from the approved script'] : []),
  ],
};
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${out}\n`);
