import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

;(globalThis as typeof globalThis & { React: typeof React }).React = React;

const packageJsonPath = path.resolve(__dirname, '../../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

// AC1: Check dependencies
assert.ok(packageJson.dependencies['react-hook-form'] || packageJson.devDependencies['react-hook-form'], 'AC1: react-hook-form must be installed');
assert.ok(packageJson.dependencies['react-dropzone'] || packageJson.devDependencies['react-dropzone'], 'AC1: react-dropzone must be installed');
assert.ok(packageJson.dependencies['zod'] || packageJson.devDependencies['zod'], 'AC1: zod must be installed');
assert.ok(packageJson.dependencies['@hookform/resolvers'] || packageJson.devDependencies['@hookform/resolvers'], 'AC1: @hookform/resolvers must be installed');

// UploadDraftSchema Test
let UploadDraftSchema: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../schemas/upload-draft.schema');
  UploadDraftSchema = mod.UploadDraftSchema;
} catch {
  // expected to fail before implementation
}
assert.ok(UploadDraftSchema, 'AC3/Schema: UploadDraftSchema should be exported from src/schemas/upload-draft.schema');

if (UploadDraftSchema) {
  // Check schema validation (AC3 partially via schema)
  const invalidResult = UploadDraftSchema.safeParse({});
  assert.equal(invalidResult.success, false, 'Schema should fail on empty object');
  assert.ok(invalidResult.error.errors.some((e: any) => e.path.includes('title')), 'Should require title');
  assert.ok(invalidResult.error.errors.some((e: any) => e.path.includes('category')), 'Should require category');

  const validResult = UploadDraftSchema.safeParse({
    title: 'Test Draft',
    category: 'Test Category',
  });
  assert.equal(validResult.success, true, 'Schema should pass with title and category');
  assert.equal(validResult.data.risk_level, 'D1', 'Risk level should default to D1');
  assert.deepEqual(validResult.data.tags, [], 'Tags should default to empty array');
}

// UploadDraftCard Component Test
let UploadDraftCard: React.ComponentType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../UploadDraftCard');
  UploadDraftCard = mod.UploadDraftCard || mod.default;
} catch {
  // expected to fail before implementation
}
assert.ok(UploadDraftCard, 'AC2/4: UploadDraftCard should be exported from src/components/UploadDraftCard');

if (UploadDraftCard) {
  const html = renderToStaticMarkup(React.createElement(UploadDraftCard));
  // Check basic elements rendering
  assert.match(html, /드래그/, 'AC2: Dropzone area should render text related to dragging');
  assert.match(html, /제목/, 'AC3: Form should have a title field');
  assert.match(html, /카테고리/, 'AC3: Form should have a category field');
  assert.match(html, /태그/, 'AC4: Form should have a tag input area');
}

console.log('✅ All UploadDraftCard tests passed');
