#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function arg(name, required = true) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (required && !value) throw new Error(`--${name} is required`);
  return value;
}

const tracePath = resolve(arg("trace"));
const htmlPath = arg("html", false);
const trace = JSON.parse(readFileSync(tracePath, "utf8"));
const scenes = trace.scenes ?? [];
const issues = [];

if (scenes.length === 0) issues.push("trace has no scenes");

const decisions = scenes.map((scene) => {
  const decision = scene.visual_decision ?? {};
  return {
    id: scene.scene_id,
    form: decision.visual_form ?? decision.selected_factory_scene_type ?? decision.evidence_structure,
    renderMode: decision.render_mode ?? "graphic",
    selectedType: decision.selected_factory_scene_type,
    previewAsset: scene.asset_decision?.preview_asset,
  };
});

for (const decision of decisions) {
  if (!decision.form) issues.push(`${decision.id}: visual_form is missing`);
  if (!decision.selectedType) issues.push(`${decision.id}: selected_factory_scene_type is missing`);
  if (["photo", "video", "screenshot", "recorded_ui", "talking_head", "mixed"].includes(decision.renderMode) && !decision.previewAsset) {
    issues.push(`${decision.id}: ${decision.renderMode} requires preview_asset`);
  }
}

if (decisions.length >= 8) {
  const counts = new Map();
  for (const { form } of decisions) counts.set(form, (counts.get(form) ?? 0) + 1);
  if (counts.size < 4) issues.push(`visual family count ${counts.size} is below 4`);
  for (const [form, count] of counts) {
    if (count / decisions.length > 0.35) issues.push(`${form}: share ${count}/${decisions.length} exceeds 35%`);
  }
  for (let index = 2; index < decisions.length; index += 1) {
    if (decisions[index].form === decisions[index - 1].form && decisions[index].form === decisions[index - 2].form) {
      issues.push(`${decisions[index].id}: ${decisions[index].form} repeats more than twice`);
    }
  }
}

if (htmlPath) {
  const html = readFileSync(resolve(htmlPath), "utf8");
  for (const decision of decisions) {
    const escapedId = decision.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const article = html.match(new RegExp(`<article[^>]+data-scene="${escapedId}"[^>]*>[\\s\\S]*?</article>`));
    if (!article) {
      issues.push(`${decision.id}: composed scene is missing`);
      continue;
    }
    if (!article[0].includes(`data-visual-form="${decision.form}"`)) issues.push(`${decision.id}: visual_form changed during composition`);
    if (!article[0].includes(`data-layout="${decision.selectedType}"`)) issues.push(`${decision.id}: selected layout changed during composition`);
    if (!article[0].includes(`data-render-mode="${decision.renderMode}"`)) issues.push(`${decision.id}: render_mode changed during composition`);
    if (decision.previewAsset && !article[0].includes(decision.previewAsset)) issues.push(`${decision.id}: preview_asset is not rendered`);
  }
}

const result = {
  ok: issues.length === 0,
  scene_count: decisions.length,
  visual_forms: [...new Set(decisions.map((item) => item.form))],
  issues,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exit(1);
