import { test, expect } from "@playwright/test";
import { settings } from "../config.mjs";
import { openTestWorld } from "../helpers/session.mjs";

const BATCH = "banter-4e-modifications.trigger-prompts";

/** Counts of every document type the batch creates, to prove it cleans up after itself. */
const worldCounts = () => ({
  actors: game.actors.size, items: game.items.size, scenes: game.scenes.size, combats: game.combats.size,
  messages: game.messages.size, tokensOnScenes: game.scenes.reduce((total, scene) => total + scene.tokens.size, 0),
});

/** Run only the trigger-prompt Quench batch (every trigger, live hooks) as the test GM. */
test("every trigger prompts, and only when it should, in the real Foundry runtime", async ({ page }, testInfo) => {
  test.setTimeout(900000);
  const diagnostics = { pageErrors: [], consoleErrors: [] };
  page.on("pageerror", error => diagnostics.pageErrors.push(error.stack ?? error.message));
  page.on("console", message => {
    if (message.type() === "error") {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  try {
    await openTestWorld(page);
    const environment = await page.evaluate(() => ({
      worldId: game.world.id,
      isGM: game.user.isGM,
      activeGM: game.users.activeGM?.id === game.user.id,
      optedIn: game.settings.get("foundry-test-harness", "testWorldId") === game.world.id,
      triggerPrompts: game.settings.get("banter-4e-modifications", "enable-trigger-prompts") && Boolean(game.TriggerPrompts),
    }));
    expect(environment.worldId, "Refusing to run against a different world").toBe(settings.worldId);
    expect(environment.isGM, "Log in as a GM").toBe(true);
    expect(environment.activeGM, "Log out other GM sessions before running tests").toBe(true);
    expect(environment.optedIn, "Enable the harness and set its Test world ID setting").toBe(true);
    expect(environment.triggerPrompts, "Enable 'Enable trigger prompts' in the test world and reload").toBe(true);

    await expect.poll(() => page.evaluate(() => {
      const api = game.modules.get("foundry-test-harness")?.api;
      return api?.initializationError ?? api?.ready === true;
    }), { message: "Harness suites must finish loading", timeout: 60000 }).toBe(true);

    const countsBefore = await page.evaluate(worldCounts);
    const result = await page.evaluate(batch => game.modules.get("foundry-test-harness").api.run([batch]), BATCH);
    await testInfo.attach("quench-report", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    expect(result.report.stats.tests, "An empty run must fail").toBeGreaterThan(30);
    expect(result.report.stats.failures, JSON.stringify(result.report.failures, null, 2)).toBe(0);
    expect(result.report.stats.pending, "Trigger-prompt tests must not silently skip").toBe(0);
    const stray = await page.evaluate(() => window.triggerPromptStrayErrors ?? []);
    await testInfo.attach("stray-errors-by-test", { body: JSON.stringify(stray, null, 2), contentType: "application/json" });
    expect(stray, "Unhandled rejections during the batch, by test").toEqual([]);
    expect(diagnostics.pageErrors, "Uncaught browser errors").toEqual([]);
    expect(await page.evaluate(worldCounts), "The batch must leave the world exactly as it found it").toEqual(countsBefore);
  } finally {
    await testInfo.attach("browser-diagnostics", { body: JSON.stringify(diagnostics, null, 2), contentType: "application/json" });
  }
});
