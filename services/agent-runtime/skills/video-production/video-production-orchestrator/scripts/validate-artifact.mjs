#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) throw new Error('usage: validate-artifact.mjs <artifact.json>');
const artifact = JSON.parse(await readFile(path, 'utf8'));
const required = ['schema_version', 'artifact_type', 'project_id', 'run_id', 'version', 'source_versions', 'status', 'issues', 'generated_by', 'checksum', 'data'];
const missing = required.filter((key) => artifact[key] === undefined || artifact[key] === null);
if (artifact.schema_version !== 'video_production_v1') missing.push('schema_version=video_production_v1');
if (!Number.isInteger(artifact.version) || artifact.version < 1) missing.push('version>=1');
if (!Array.isArray(artifact.issues)) missing.push('issues[]');
if (missing.length) {
  process.stderr.write(`invalid artifact: ${missing.join(', ')}\n`);
  process.exit(1);
}
process.stdout.write(`valid ${artifact.artifact_type} v${artifact.version}\n`);
