#!/usr/bin/env node
// S7 — 결정 원장 보정 루프(Calibrate 노드).
//
// ~/.l5/ledger/decisions.jsonl 을 읽어 예측 vs 실측 불일치를 집계하고,
// 임계를 넘는 필드에 대한 보정 제안(CalibrationProposal)을 출력한다.
// 새 데몬을 만들지 않는다 — 기존 night-bpr 레일이나 수동 실행으로 돌린다.
//
// 사용: node scripts/ledger-calibration.mjs [--json] [--ledger <path>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const ledgerIdx = args.indexOf('--ledger');
const ledgerPath =
  ledgerIdx !== -1 && args[ledgerIdx + 1]
    ? args[ledgerIdx + 1]
    : path.join(os.homedir(), '.l5', 'ledger', 'decisions.jsonl');

let ledgerMod;
try {
  ledgerMod = require(path.join(repoRoot, 'packages/l5-core/dist/functions/decision-ledger'));
} catch (e) {
  console.error('decision-ledger 모듈을 찾을 수 없습니다. l5-core를 빌드하세요: pnpm --filter @l5/core build');
  process.exit(1);
}
const { parseEntry, buildCalibrationProposals } = ledgerMod;

if (!fs.existsSync(ledgerPath)) {
  const out = { ledger: ledgerPath, entries: 0, proposals: [] };
  console.log(asJson ? JSON.stringify(out) : `원장 없음(${ledgerPath}) — 축적 전입니다.`);
  process.exit(0);
}

const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
const entries = lines.map((l) => parseEntry(l)).filter(Boolean);
const proposals = buildCalibrationProposals(entries);

if (asJson) {
  console.log(JSON.stringify({ ledger: ledgerPath, entries: entries.length, proposals }, null, 2));
} else {
  console.log(`원장 ${entries.length}건 분석 (${ledgerPath})`);
  if (!proposals.length) {
    console.log('보정 제안 없음 — 표본 부족이거나 예측이 실측과 정합.');
  }
  for (const p of proposals) {
    console.log(`- [${p.kind}/${p.field}] ${p.direction === 'over' ? '과대예측' : '과소예측'} ` +
      `(표본 ${p.sample_count}, 불일치율 ${(p.mismatch_rate * 100).toFixed(0)}%) → ${p.suggestion}`);
  }
}
