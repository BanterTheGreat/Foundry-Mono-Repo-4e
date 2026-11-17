import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = fileURLToPath(new URL("../../", import.meta.url));

test("Modern 4e ancestry catalog, validation and Typst rendering", () => {
  execFileSync(process.env.PYTHON || "python3", [
    "-m", "unittest", "discover", "-s", "src/modern4e/scripts", "-p", "test_ancestry_content.py",
  ], { cwd: repo, stdio: "pipe" });
});
