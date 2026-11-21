import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApk } from "../builder-apk.mjs";

for (const platform of ["win32", "linux", "darwin"]) {
  test(`APK build uses the project wrapper on ${platform}`, () => {
    const status = buildApk((command, args, options) => {
      assert.equal(command, platform === "win32" ? "cmd.exe" : "bash");
      assert.deepEqual(args, platform === "win32"
        ? ["/d", "/s", "/c", ".\\gradlew.bat :android:assembleDebug"] : ["./gradlew", ":android:assembleDebug"]);
      assert.match(options.cwd.replaceAll("\\", "/"), /\/src\/character-builder\/$/);
      assert.equal(options.shell, false);
      assert.equal(options.stdio, "inherit");
      return { status: 0 };
    }, platform, () => true, () => {});
    assert.equal(status, 0);
  });
}

test("APK build prints the file path and a file link", () => {
  const lines = [];
  assert.equal(buildApk(() => ({ status: 0 }), "linux", () => true, (line) => lines.push(line)), 0);
  const output = lines.join("\n").replaceAll("\\", "/");
  assert.match(output, /src\/character-builder\/android\/build\/outputs\/apk\/debug\/android-debug\.apk/);
  assert.match(output, /file:\/\/\/.*android-debug\.apk/);
});

test("APK build propagates Gradle failures without printing a link", () => {
  const lines = [];
  assert.equal(buildApk(() => ({ status: 7 }), "linux", () => true, (line) => lines.push(line)), 7);
  assert.equal(buildApk(() => ({ status: null }), "linux", () => true, (line) => lines.push(line)), 1);
  assert.deepEqual(lines, []);
});

test("APK build fails when the expected file is missing", () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(buildApk(() => ({ status: 0 }), "linux", () => false, () => assert.fail("no link expected")), 1);
  } finally {
    console.error = quiet;
  }
});
