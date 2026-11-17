import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = fileURLToPath(new URL("../../", import.meta.url));

test("Modern 4e creation and advancement authoring", () => {
  execFileSync(process.env.PYTHON || "python3", [
    "-X", "utf8", "-m", "unittest", "discover", "-s", "src/modern4e/scripts", "-p", "test_creation_content.py",
  ], { cwd: repo, stdio: "pipe", env: { ...process.env, PYTHONUTF8: "1" } });
});
