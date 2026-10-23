import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("deployment excludes rulebooks and prototypes, including explicit requests", (t) => {
  const root = mkdtempSync(join(tmpdir(), "foundry-copy-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  cpSync(new URL("../copy-modules.mjs", import.meta.url), join(root, "scripts/copy-modules.mjs"));
  for (const name of ["example-module", "modern4e", "prototype"]) {
    mkdirSync(join(root, "src", name), { recursive: true });
    writeFileSync(join(root, "src", name, "content.txt"), name);
  }
  // Even an accidentally added manifest must never enable rulebook deployment.
  for (const name of ["example-module", "modern4e"]) {
    writeFileSync(join(root, "src", name, "module.json"), JSON.stringify({ id: name }));
  }
  const run = (data, ...args) => spawnSync(process.execPath, [join(root, "scripts/copy-modules.mjs"), ...args], {
    env: { ...process.env, FOUNDRY_DATA_PATH: join(root, data) },
    encoding: "utf8",
  });
  const all = run("all");
  assert.equal(all.status, 0, all.stderr);
  assert.ok(existsSync(join(root, "all/modules/example-module/content.txt")));
  assert.ok(!existsSync(join(root, "all/modules/modern4e")));
  assert.ok(!existsSync(join(root, "all/modules/prototype")));
  assert.equal(run("single", "example-module").status, 0);
  for (const name of ["modern4e", "MODERN4E", "prototype", "../modern4e"]) {
    const rejected = run("rejected", "example-module", name);
    assert.equal(rejected.status, 1);
    assert.ok(!existsSync(join(root, "rejected")), "Reject the whole batch before copying anything");
  }
});
