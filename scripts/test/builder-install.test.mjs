import assert from "node:assert/strict";
import { test } from "node:test";
import { installBuilder } from "../builder-install.mjs";

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
