import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ADDRESS_PATTERN = /^[^\s:]+:\d{1,5}$/;

/**
 * Build and update the debug app on connected Android devices.
 * @param {Function} run Process runner with the `spawnSync` signature.
 * @param {string} platform Node platform name.
 * @param {string} [serial] When set, install only to this adb serial (ANDROID_SERIAL).
 */
export function installBuilder(run = spawnSync, platform = process.platform, serial = "") {
  const windows = platform === "win32";
  const result = run(windows ? "cmd.exe" : "bash", windows
    ? ["/d", "/s", "/c", ".\\gradlew.bat :android:installDebug"]
    : ["./gradlew", ":android:installDebug"], {
    cwd: fileURLToPath(new URL("../src/character-builder/", import.meta.url)),
    stdio: "inherit",
    shell: false,
    ...(serial ? { env: { ...process.env, ANDROID_SERIAL: serial } } : {}),
  });
  if (result.error) {
    console.error(result.error.message);
  }
  return result.status ?? 1;
}

/**
 * Find a wireless-debugging phone advertised over mDNS.
 * @param {Function} run Process runner with the `spawnSync` signature.
 * @param {string} adb Path or name of the adb executable.
 * @returns {string} The first `ip:port` found, or an empty string.
 */
export function discoverWirelessAddress(run = spawnSync, adb = process.env.ADB || "adb") {
  const result = run(adb, ["mdns", "services"], { encoding: "utf8" });
  return String(result.stdout ?? "").match(/_adb-tls-connect\._tcp\.?\s+(\S+:\d+)/)?.[1] ?? "";
}

/**
 * Connect adb to a paired phone, then install the debug app to it alone.
 * @param {string} [address] The phone's `ip:port` from the Wireless debugging screen.
 *   Falls back to mDNS discovery when omitted.
 * @param {Function} run Process runner with the `spawnSync` signature.
 * @param {string} platform Node platform name.
 * @returns {number} Process exit status.
 */
export function installBuilderWireless(address = "", run = spawnSync, platform = process.platform) {
  const adb = process.env.ADB || "adb";
  const target = address || discoverWirelessAddress(run, adb);
  if (!ADDRESS_PATTERN.test(target)) {
    console.error(
      "No wireless device address. Pass the IP:port from the phone's Wireless debugging screen, e.g.\n"
      + "  npm run builder:install:wifi -- 192.168.2.3:39867\n"
      + "The phone must be paired once first: adb pair <ip>:<pairing-port>",
    );
    return 1;
  }
  const connect = run(adb, ["connect", target], { encoding: "utf8" });
  const output = `${connect.stdout ?? ""}${connect.stderr ?? ""}`.trim();
  if (connect.error || connect.status !== 0 || !/connected to/i.test(output) || /failed|cannot|unable/i.test(output)) {
    console.error(connect.error?.message || output || `adb connect ${target} failed.`);
    console.error("Check that Wireless debugging is on, the phone is paired, and the port is current (it changes on every toggle or reboot).");
    return 1;
  }
  console.log(output);
  return installBuilder(run, platform, target);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === "--wireless") {
    process.exitCode = installBuilderWireless(args[1] || process.env.BUILDER_DEVICE || "");
  } else {
    process.exitCode = installBuilder();
  }
}
