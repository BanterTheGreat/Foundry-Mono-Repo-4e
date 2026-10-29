import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { authPath, requireTarget, settings } from "./config.mjs";

requireTarget();

export default defineConfig({
  testDir: "./scenarios",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 15000 },
  outputDir: "../../output/foundry-test-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "../../output/foundry-test-report", open: "never" }],
    ["json", { outputFile: "../../output/foundry-test-results/playwright.json" }],
  ],
  use: {
    baseURL: `${settings.url.replace(/\/$/, "")}/`,
    browserName: "chromium",
    viewport: { width: 1920, height: 1080 },
    storageState: existsSync(authPath) ? authPath : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
