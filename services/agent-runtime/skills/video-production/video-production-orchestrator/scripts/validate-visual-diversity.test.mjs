import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const validator = new URL("./validate-visual-diversity.mjs", import.meta.url).pathname;

function trace(forms) {
  return {
    scenes: forms.map((form, index) => ({
      scene_id: `s${index + 1}`,
      visual_decision: {
        visual_form: form,
        render_mode: "graphic",
        selected_factory_scene_type: form,
      },
      asset_decision: {},
    })),
  };
}

function run(forms) {
  const dir = mkdtempSync(join(tmpdir(), "visual-diversity-"));
  const path = join(dir, "trace.json");
  writeFileSync(path, JSON.stringify(trace(forms)));
  return execFileSync(process.execPath, [validator, "--trace", path], { encoding: "utf8" });
}

test("passes a varied visual rhythm", () => {
  const output = JSON.parse(run(["comparison", "flow", "talking_head", "metric_cards", "comparison", "steps", "gallery", "flow"]));
  assert.equal(output.ok, true);
});

test("rejects a storyboard normalized to one layout", () => {
  assert.throws(
    () => run(Array(8).fill("comparison")),
    /Command failed/,
  );
});
