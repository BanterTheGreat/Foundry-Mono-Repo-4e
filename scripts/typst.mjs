#!/usr/bin/env node
// Keep Typst's working directory and development output inside the rulebook.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bookDir = fileURLToPath(new URL("../src/modern4e/", import.meta.url));
const [command = "compile", ...extraArgs] = process.argv.slice(2);
const commands = {
  compile: ["compile", "main.typ", "inDev.pdf"],
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
  console.error(`Unknown Typst command: ${command}. Use compile, watch, fonts, or clean.`);
  process.exitCode = 1;
}
