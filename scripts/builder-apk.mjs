import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve } from "node:path";

const BUILDER_ROOT = fileURLToPath(new URL("../src/character-builder/", import.meta.url));
const APK_PATH = join(BUILDER_ROOT, "android", "build", "outputs", "apk", "debug", "android-debug.apk");

/**
 * Build the debug APK and report where to find it.
 * @param {Function} run Process runner with the `spawnSync` signature.
 * @param {string} platform Node platform name.
 * @param {Function} exists File existence check with the `existsSync` signature.
 * @param {Function} log Output sink with the `console.log` signature.
 * @returns {number} Process exit status.
 */
export function buildApk(run = spawnSync, platform = process.platform, exists = existsSync, log = console.log) {
  const windows = platform === "win32";
  const result = run(windows ? "cmd.exe" : "bash", windows
    ? ["/d", "/s", "/c", ".\\gradlew.bat :android:assembleDebug"]
    : ["./gradlew", ":android:assembleDebug"], {
    cwd: BUILDER_ROOT,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(result.error.message);
  }
  const status = result.status ?? 1;
  if (status !== 0) {
    return status;
  }
  if (!exists(APK_PATH)) {
    console.error(`The build succeeded but ${APK_PATH} does not exist.`);
    return 1;
  }
  log(`\nDebug APK ready:\n  ${APK_PATH}\n  ${pathToFileURL(APK_PATH).href}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = buildApk();
}
