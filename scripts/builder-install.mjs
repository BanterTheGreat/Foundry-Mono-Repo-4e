import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** Build and update the debug app on connected Android devices. */
export function installBuilder(run = spawnSync, platform = process.platform) {
  const windows = platform === "win32";
  const result = run(windows ? "cmd.exe" : "bash", windows
    ? ["/d", "/s", "/c", ".\\gradlew.bat :android:installDebug"]
    : ["./gradlew", ":android:installDebug"], {
    cwd: fileURLToPath(new URL("../src/character-builder/", import.meta.url)),
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(result.error.message);
  }
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = installBuilder();
}
