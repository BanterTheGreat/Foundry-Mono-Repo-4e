import { chromium } from "@playwright/test";
import { chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { authPath, requireTarget, settings } from "./config.mjs";

requireTarget();
const browser = await chromium.launch({ headless: false });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(settings.url);
  console.log(`Log in as the test GM in Chromium. Waiting up to 5 minutes for world ${settings.worldId}.`);
  await page.waitForFunction(() => globalThis.game?.ready && game.user?.isGM, null, { timeout: 300000 });
  const actualWorld = await page.evaluate(() => game.world.id);
  if (actualWorld !== settings.worldId) {
    throw new Error(`Expected world ${settings.worldId}, got ${actualWorld}. No authentication was saved.`);
  }
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 });
  await context.storageState({ path: authPath });
  await chmod(authPath, 0o600);
  console.log("Saved local GM browser session. Run npm run test:foundry. If Foundry expires the session, repeat this command.");
} finally {
  await browser.close();
}
