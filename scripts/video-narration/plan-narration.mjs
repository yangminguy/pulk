#!/usr/bin/env node
// plan-narration.mjs — [원고 + 전사(들)] → EDL 초안(edit-plan.json) + 사람이 읽는 마크다운 표.
//
// l5-core의 buildEditPlan(순수 두뇌)을 호출한다. 재발화/실패시작/침묵/필러를 자동 감지해
// "살릴 구간(clips) / 버릴 구간(cuts) / 사람이 확인할 지점(flags)"을 만든다.
//
// 사용:
//   node scripts/video-narration/plan-narration.mjs \
//     --script path/to/원고.txt \
//     --transcript full=path/to/full-read.json \
//     [--transcript revised=path/to/revised.json] \
//     --out path/to/edit-plan.json
//
// --transcript 는 "source=경로" 형태로 여러 번 줄 수 있다. 첫 번째가 메인(spine).
//
// [늘어진 단어 속 침묵 자동 제거] --audio source=경로 를 주면, 비정상적으로 긴 단어
// (기본 1.2s 이상) 구간을 ffmpeg silencedetect로 분석해 그 안의 침묵을 찾아 EDL에 반영한다.
// (whisper가 단어 앞뒤 침묵을 단어에 붙여 "장비 4.0s"처럼 잡히는 절음을 잘라낸다.)

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// l5-core는 빌드된 dist에서 가져온다(사전에 `npm run build --prefix packages/l5-core`).
const { buildEditPlan } = require(resolve(process.cwd(), 'packages/l5-core/dist/index.js'));

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

/** whisper json → l5-core가 받는 words 배열(segments를 평탄화). */
function loadWords(path) {
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const segs = Array.isArray(raw.segments) ? raw.segments : [];
  const words = [];
  for (const s of segs) {
    for (const w of s.words ?? []) {
      words.push({
        word: w.word ?? '',
        start: Number(w.start ?? 0),
        end: Number(w.end ?? 0),
        probability: w.probability != null ? Number(w.probability) : undefined,
      });
    }
  }
  return words;
}

/** "source=path" 스펙들을 {source: path} 맵으로. */
function specMap(specs, flag) {
  const m = new Map();
  for (const spec of specs) {
    const eq = spec.indexOf('=');
    if (eq < 0) throw new Error(`--${flag} must be "source=path", got: ${spec}`);
    m.set(spec.slice(0, eq), spec.slice(eq + 1));
  }
  return m;
}

/**
 * 늘어진 단어 [start,end]에서 "실제 발화 덩어리 하나만 남기고 앞뒤 침묵을 통째로 제거"한다.
 *
 * whisper가 절음(멈칫)을 긴 단어로 뭉치면, 그 안엔 [침묵 + 짧은 발화 + 침묵 + 발화…]가 섞여
 * 있다. 침묵을 조각조각 잘라내면 발화 파편이 남아 "뚝뚝" 끊겨 들린다. 대신 가장 긴 연속 발화
 * 덩어리 하나만 남기고 그 앞뒤(침묵+파편)를 한 번에 컷하면 끊김 없이 자연스럽다.
 * (사장님 우선순위: 원고 일치보다 "절지·끊기지 않게".)
 */
function detectWordSilences(audioPath, source, words, minWordSec, minSilenceSec) {
  const out = [];
  for (const w of words) {
    if (w.end - w.start < minWordSec) continue;
    const r = spawnSync(
      'ffmpeg',
      ['-hide_banner', '-nostats', '-ss', String(w.start), '-to', String(w.end), '-i', resolve(audioPath),
       '-af', 'silencedetect=noise=-30dB:d=0.25', '-f', 'null', '-'],
      { encoding: 'utf8' },
    );
    const text = `${r.stderr ?? ''}`;
    // 단어 구간 내 침묵 구간(절대 초) 수집.
    const sils = [];
    let sStart = null;
    for (const line of text.split('\n')) {
      let m = line.match(/silence_start:\s*(-?[\d.]+)/);
      if (m) { sStart = Math.max(0, parseFloat(m[1])); continue; }
      m = line.match(/silence_end:\s*([\d.]+)/);
      if (m && sStart != null) {
        sils.push([w.start + sStart, Math.min(w.end, w.start + parseFloat(m[1]))]);
        sStart = null;
      }
    }
    if (sils.length === 0) continue;

    // 침묵을 뺀 발화 덩어리들.
    const speech = [];
    let cur = w.start;
    for (const [ss, se] of sils) {
      if (ss > cur) speech.push([cur, ss]);
      cur = Math.max(cur, se);
    }
    if (cur < w.end) speech.push([cur, w.end]);

    if (speech.length === 0) {
      // 전부 침묵 → 단어 통째로 컷(발화가 사실상 없음).
      out.push({ source, start: round3(w.start), end: round3(w.end) });
      continue;
    }
    // 가장 긴 발화 덩어리만 남기고 앞뒤를 통째로 컷.
    let best = speech[0];
    for (const sp of speech) if (sp[1] - sp[0] > best[1] - best[0]) best = sp;
    if (best[1] - best[0] < 0.35) {
      // 남길 발화가 짧은 파편뿐(예: 늘어진 "장비"의 끝 "비" 0.27s) → 통째 컷.
      // 파편을 남기면 "준비하면서 (뚝) 비 정보를"처럼 오히려 더 끊겨 들린다.
      out.push({ source, start: round3(w.start), end: round3(w.end) });
      continue;
    }
    if (best[0] - w.start >= minSilenceSec) out.push({ source, start: round3(w.start), end: round3(best[0]) });
    if (w.end - best[1] >= minSilenceSec) out.push({ source, start: round3(best[1]), end: round3(w.end) });
  }
  return out;
}
function round3(n) { return Math.round(n * 1000) / 1000; }

const scriptPath = arg('script');
const transcriptSpecs = args('transcript');
if (transcriptSpecs.length === 0) throw new Error('at least one --transcript source=path is required');
const audioMap = specMap(args('audio'), 'audio');
const minWordSec = Number(arg('min-word-sec', false, '2.0'));
const minSilenceSec = Number(arg('min-silence-sec', false, '0.35'));
// 이 값을 넘는 문장 사이 무음을 컷(→ apply의 균일 gap으로 대체)해 리듬을 일정하게 한다.
const silenceGap = Number(arg('silence-gap', false, '0.3'));
const outPath = arg('out');

const approvedScript = readFileSync(resolve(scriptPath), 'utf8');
const transcriptMap = specMap(transcriptSpecs, 'transcript');
const sources = [...transcriptMap.entries()].map(([source, path]) => ({ source, words: loadWords(path) }));

// --audio 준 소스는 긴 단어 속 침묵을 분석해 주입.
const silences = [];
for (const { source, words } of sources) {
  const audioPath = audioMap.get(source);
  if (audioPath) silences.push(...detectWordSilences(audioPath, source, words, minWordSec, minSilenceSec));
}
if (silences.length) console.error(`[오디오 분석] 늘어진 단어 속 침묵 ${silences.length}곳 감지`);

const plan = buildEditPlan({ approvedScript, sources, silences, options: { silence_gap_sec: silenceGap } });
writeFileSync(resolve(outPath), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

// ── 사람이 읽는 요약 표 ──────────────────────────────────────────────────────
function fmt(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}
const cutLabel = {
  retake_discarded: '중복테이크',
  false_start: '실패시작',
  silence: '무음',
  filler: '필러',
};

console.log(`\n# EDL 초안 — ${outPath}`);
console.log(`살릴 구간 ${plan.clips.length}개 (${plan.kept_seconds}s) · 버릴 구간 ${plan.cuts.length}개 (${plan.cut_seconds}s) · 확인 필요 ${plan.flags.length}개\n`);

if (plan.cuts.length) {
  console.log(`## 버릴 구간 (자동 감지 — 검토하세요)`);
  console.log(`| # | source | 시작 | 끝 | 종류 | 근거 |`);
  console.log(`|---|--------|------|-----|------|------|`);
  plan.cuts.forEach((c, i) => {
    console.log(`| ${i + 1} | ${c.source} | ${fmt(c.start)} | ${fmt(c.end)} | ${cutLabel[c.reason] ?? c.reason} | ${c.note} |`);
  });
  console.log('');
}
if (plan.flags.length) {
  console.log(`## 확인 필요 (애매해서 자동 컷 안 함)`);
  plan.flags.forEach((f, i) => console.log(`${i + 1}. [${f.source} ${fmt(f.at)}] ${f.issue}`));
  console.log('');
}
console.log(`→ 표를 검토해 잘못 잘린 구간이 있으면 ${outPath}의 clips/cuts를 수정한 뒤 apply-edit-plan.mjs 로 렌더하세요.`);
