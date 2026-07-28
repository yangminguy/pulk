#!/usr/bin/env node
// transcribe.mjs — 나레이션 녹음 → 단어별 타임스탬프 전사(mlx_whisper, Apple Silicon).
//
// deliverables/bandit-.../audio/transcripts/full-read.json 과 동일한 형태를 만든다:
//   { text, language, segments:[{ start,end,text, words:[{word,start,end,probability}] }] }
//
// 사용:
//   node scripts/video-narration/transcribe.mjs \
//     --audio path/to/full-read.m4a --out path/to/full-read.json \
//     [--python /path/to/venv/bin/python3] [--model mlx-community/whisper-large-v3-turbo]
//
// mlx_whisper는 pip로 설치된 파이썬 패키지다. --python 으로 그 패키지가 있는 인터프리터를
// 지정한다(예: deliverables/bandit-.../audio/.venv/bin/python3). 미지정 시 python3.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function arg(name, required = true, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined) {
    if (required) throw new Error(`--${name} is required`);
    return fallback;
  }
  return v;
}

const audio = resolve(arg('audio'));
const out = resolve(arg('out'));
const python = arg('python', false, 'python3');
const model = arg('model', false, 'mlx-community/whisper-large-v3-turbo');

const py = `
import json, sys
import mlx_whisper
r = mlx_whisper.transcribe(${JSON.stringify(audio)}, path_or_hf_repo=${JSON.stringify(model)}, word_timestamps=True)
# 필요한 필드만 남겨 결정적 형태로 저장.
segments = []
for s in r.get("segments", []):
    words = [
        {"word": w.get("word", ""), "start": round(float(w.get("start", 0)), 3),
         "end": round(float(w.get("end", 0)), 3), "probability": round(float(w.get("probability", 1.0)), 4)}
        for w in s.get("words", [])
    ]
    segments.append({"start": round(float(s.get("start", 0)), 3), "end": round(float(s.get("end", 0)), 3),
                     "text": s.get("text", ""), "words": words})
out = {"text": r.get("text", ""), "language": r.get("language", ""), "segments": segments}
with open(${JSON.stringify(out)}, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(${JSON.stringify(out)})
`;

const res = spawnSync(python, ['-c', py], { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
if (res.status !== 0) {
  console.error(`transcribe failed (exit ${res.status}). mlx_whisper가 설치된 인터프리터를 --python 으로 지정했는지 확인하세요.`);
  process.exit(res.status ?? 1);
}
