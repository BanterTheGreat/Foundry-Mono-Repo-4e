import { test, expect } from "@playwright/test";
import { settings } from "../config.mjs";
import { openTestWorld } from "../helpers/session.mjs";

test("module integration suites pass in the real Foundry runtime", async ({ page }, testInfo) => {
  test.setTimeout(360000);
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
      optedIn: game.modules.get("foundry-test-harness")?.active
        && game.settings.get("foundry-test-harness", "testWorldId") === game.world.id,
    }));
    expect(environment.worldId, "Refusing to run against a different world").toBe(settings.worldId);
    expect(environment.isGM, "Log in as a GM").toBe(true);
    expect(environment.activeGM, "Log out other GM sessions before running tests").toBe(true);
    expect(environment.optedIn, "Enable the harness and set its Test world ID setting").toBe(true);

    await expect.poll(() => page.evaluate(() => {
      const api = game.modules.get("foundry-test-harness")?.api;
      if (api?.initializationError) {
        return api.initializationError;
      }
      return api?.ready === true;
    }), { message: "Harness suites must finish loading" }).toBe(true);

    const result = await page.evaluate(() => game.modules.get("foundry-test-harness").api.run());
    await testInfo.attach("quench-report", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    expect(result.report.stats.tests, "An empty run must fail").toBeGreaterThan(0);
    expect(result.report.stats.failures, JSON.stringify(result.report.failures, null, 2)).toBe(0);
    expect(result.report.stats.pending, "Integration tests must not silently skip").toBe(0);
    expect(diagnostics.pageErrors, "Uncaught browser errors").toEqual([]);
  } finally {
    await testInfo.attach("browser-diagnostics", { body: JSON.stringify(diagnostics, null, 2), contentType: "application/json" });
  }
});
