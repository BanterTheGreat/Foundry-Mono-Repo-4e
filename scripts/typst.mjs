#!/usr/bin/env node
// Keep Typst's working directory and PDF output inside the rulebook.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bookDir = fileURLToPath(new URL("../src/modern4e/", import.meta.url));
const [command = "compile", ...extraArgs] = process.argv.slice(2);

if (command === "release") {
  const configuration = readFileSync(new URL("../src/modern4e/helpers/configuration.typ", import.meta.url), "utf8");
  const version = configuration.match(/^\s*#let\s+version\s*=\s*"([^"]+)"\s*;/m)?.[1];
  if (!version || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(version)) {
    console.error("Could not read a filename-safe version from Modern4e's helpers/configuration.typ.");
    process.exit(1);
  }
  extraArgs.unshift("main.typ", `Modern4e-${version}.pdf`);
}

const commands = {
  compile: ["compile", "main.typ", "inDev.pdf"],
  release: ["compile"],
  watch: ["watch", "main.typ", "inDev.pdf"],
  fonts: ["fonts"],
};

if (command === "clean") {
  rmSync(fileURLToPath(new URL("../src/modern4e/inDev.pdf", import.meta.url)), { force: true });
} else if (Object.hasOwn(commands, command)) {
  const result = spawnSync(process.env.TYPST_BIN || "typst", [...commands[command], ...extraArgs], {
    cwd: bookDir,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Could not run Typst. Install it on PATH or set TYPST_BIN. ${result.error.message}`);
  }
  process.exitCode = result.status ?? 1;
} else {
  console.error(`Unknown Typst command: ${command}. Use compile, release, watch, fonts, or clean.`);
  process.exitCode = 1;
}
