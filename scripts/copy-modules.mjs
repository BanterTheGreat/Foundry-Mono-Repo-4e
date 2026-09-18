#!/usr/bin/env node
// Copies every module under src/ into the local Foundry VTT Data/modules folder.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(import.meta.url), "../..");
const srcDir = join(rootDir, "src");

const dataRoot =
  process.env.FOUNDRY_DATA_PATH ??
  (process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "FoundryVTT", "Data"));

if (!dataRoot) {
  console.error(
    "Could not determine the Foundry data path. Set FOUNDRY_DATA_PATH or ensure %LOCALAPPDATA% is set."
  );
  process.exit(1);
}

const modulesDir = join(dataRoot, "modules");
const ignoredNames = new Set([".git", ".idea", ".vscode", "node_modules", "test", ".DS_Store"]);

const modules = readdirSync(srcDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (modules.length === 0) {
  console.error(`No module folders found under ${srcDir}`);
  process.exit(1);
}

for (const name of modules) {
  const from = join(srcDir, name);
  const to = join(modulesDir, name);

  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  cpSync(from, to, {
    recursive: true,
    filter: (path) => !ignoredNames.has(basename(path)),
  });

  console.log(`Copied ${name} -> ${to}`);
}
