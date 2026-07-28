#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const KNOWN_GATE_STAGES = [
  'key_content_plan_doc',
  'pulling_plan_doc',
  'title_development',
  'thumbnail_plan',
  'script_draft',
];

const path = process.argv[2];
if (!path) throw new Error('usage: validate-planning-artifact.mjs <artifact.json>');
const artifact = JSON.parse(await readFile(path, 'utf8'));
// 통일 envelope(content_planning_v1): schema_version + gate_stage(top-level) + data.
const required = ['schema_version', 'project_id', 'gate_stage', 'status', 'data'];
const missing = required.filter((key) => artifact[key] === undefined || artifact[key] === null);
if (artifact.schema_version !== undefined && artifact.schema_version !== 'content_planning_v1') {
  missing.push('schema_version=content_planning_v1');
}
if (artifact.gate_stage !== undefined && !KNOWN_GATE_STAGES.includes(artifact.gate_stage)) {
  missing.push(`gate_stage in {${KNOWN_GATE_STAGES.join('|')}}`);
}
if (missing.length) {
  process.stderr.write(`invalid planning artifact: ${missing.join(', ')}\n`);
  process.exit(1);
}
process.stdout.write(`valid planning artifact ${artifact.gate_stage} (${artifact.project_id})\n`);
