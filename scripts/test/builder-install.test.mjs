import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverWirelessAddress, installBuilder, installBuilderWireless } from "../builder-install.mjs";

for (const platform of ["win32", "linux", "darwin"]) {
  test(`builder install uses the project wrapper on ${platform}`, () => {
    const status = installBuilder((command, args, options) => {
      assert.equal(command, platform === "win32" ? "cmd.exe" : "bash");
      assert.deepEqual(args, platform === "win32"
        ? ["/d", "/s", "/c", ".\\gradlew.bat :android:installDebug"] : ["./gradlew", ":android:installDebug"]);
      assert.match(options.cwd.replaceAll("\\", "/"), /\/src\/character-builder\/$/);
      assert.equal(options.shell, false);
      assert.equal(options.stdio, "inherit");
      return { status: 0 };
    }, platform);
    assert.equal(status, 0);
  });
}

test("builder install propagates build or device failures", () => {
  assert.equal(installBuilder(() => ({ status: 7 })), 7);
  assert.equal(installBuilder(() => ({ status: null })), 1);
});

test("builder install can target a single serial", () => {
  installBuilder((command, args, options) => {
    assert.equal(options.env.ANDROID_SERIAL, "192.168.2.3:39867");
    return { status: 0 };
  }, "linux", "192.168.2.3:39867");
});

test("wireless discovery reads the mDNS connect service", () => {
  const stdout = "List of discovered mdns services\nadb-ABC\t_adb-tls-connect._tcp\t192.168.2.3:39867\n";
  assert.equal(discoverWirelessAddress(() => ({ stdout })), "192.168.2.3:39867");
  assert.equal(discoverWirelessAddress(() => ({ stdout: "List of discovered mdns services\n" })), "");
});

test("wireless install connects first, then installs to that device only", () => {
  const calls = [];
  const status = installBuilderWireless("192.168.2.3:39867", (command, args, options) => {
    calls.push([command, args, options]);
    return command === "adb" ? { status: 0, stdout: "connected to 192.168.2.3:39867\n" } : { status: 0 };
  }, "linux");
  assert.equal(status, 0);
  assert.deepEqual(calls[0].slice(0, 2), ["adb", ["connect", "192.168.2.3:39867"]]);
  assert.equal(calls[1][0], "bash");
  assert.equal(calls[1][2].env.ANDROID_SERIAL, "192.168.2.3:39867");
});

test("wireless install uses discovery when no address is given", () => {
  const calls = [];
  const status = installBuilderWireless("", (command, args) => {
    calls.push([command, args]);
    if (args[0] === "mdns") {
      return { status: 0, stdout: "x\t_adb-tls-connect._tcp\t10.0.0.5:4000\n" };
    }
    return command === "adb" ? { status: 0, stdout: "already connected to 10.0.0.5:4000" } : { status: 0 };
  }, "linux");
  assert.equal(status, 0);
  assert.deepEqual(calls[1], ["adb", ["connect", "10.0.0.5:4000"]]);
});

test("wireless install fails without building when no address or connection", () => {
  let built = false;
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(installBuilderWireless("", () => ({ status: 0, stdout: "" })), 1);
    assert.equal(installBuilderWireless("192.168.2.3:1", (command) => {
      built ||= command !== "adb";
      return { status: 0, stdout: "failed to connect to '192.168.2.3:1'" };
    }), 1);
  } finally {
    console.error = quiet;
  }
  assert.equal(built, false);
});
