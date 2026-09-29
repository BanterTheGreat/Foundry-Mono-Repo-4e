#!/usr/bin/env node
// Copies module(s) under src/ into the local Foundry VTT Data/modules folder.
// With no args, copies every module; pass one or more module folder names to copy only those.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(import.meta.url), "../..");
const srcDir = join(rootDir, "src");

const defaultDataRoot =
  process.platform === "win32"
    ? process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "FoundryVTT", "Data")
    : process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support", "FoundryVTT", "Data")
      : undefined;

const dataRoot = process.env.FOUNDRY_DATA_PATH ?? defaultDataRoot;

if (!dataRoot) {
  console.error(
    "Could not determine the Foundry data path. Set FOUNDRY_DATA_PATH, or use Windows or macOS with Foundry's default data location."
  );
  process.exit(1);
}

const modulesDir = join(dataRoot, "modules");
const ignoredNames = new Set([".git", ".idea", ".vscode", "node_modules", "test", ".DS_Store"]);

const requestedNames = process.argv.slice(2);

const allModules = readdirSync(srcDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const modules = requestedNames.length > 0 ? requestedNames : allModules;

if (modules.length === 0) {
  console.error(`No module folders found under ${srcDir}`);
  process.exit(1);
}

const missing = modules.filter((name) => !allModules.includes(name));
if (missing.length > 0) {
  console.error(`No such module folder(s) under ${srcDir}: ${missing.join(", ")}`);
  process.exit(1);
}

for (const name of modules) {
  const from = join(srcDir, name);
  const to = join(modulesDir, name);

  mkdirSync(to, { recursive: true });
  cpSync(from, to, {
    recursive: true,
    force: true,
    filter: (path) => !ignoredNames.has(basename(path)),
  });

  console.log(`Copied ${name} -> ${to}`);
}
