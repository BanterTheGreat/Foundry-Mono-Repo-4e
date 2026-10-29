import { test, expect } from "@playwright/test";
import { settings } from "../config.mjs";
import { openTestWorld } from "../helpers/session.mjs";

const browserDiagnostics = new WeakMap();

/** DnD4e 0.9.3 enumerates the form itself; omit Playwright's own numeric locator marker. */
async function submitNativeAttack(page) {
  await page.evaluate(() => {
    const form = document.querySelector("form.application.roll-dialogue");
    delete form.__playwright_target__;
  });
  await page.locator('form.application.roll-dialogue button[data-action="normal"]').click();
}

/** Build a real isolated battlefield; use the production public activation service. */
async function prepare(page) {
  await openTestWorld(page);
  expect(await page.evaluate(() => game.world.id)).toBe(settings.worldId);
  await page.evaluate(async () => {
    const { TargetAutomationFixture } = await import(new URL(
      "modules/dnd4e-health-display/test-foundry/target-automation-fixture.js", document.baseURI).href);
    window.targetAutomationFixture = new TargetAutomationFixture();
    await window.targetAutomationFixture.setup();
    window.originalTargetDice = CONFIG.Dice.randomUniform;
    if (typeof window.originalTargetDice !== "function") {
      throw new Error("The native configurable dice RNG is unavailable.");
    }
    CONFIG.Dice.randomUniform = () => 0.45;
  });
}

test.beforeEach(async ({ page }) => {
  const diagnostics = { pageErrors: [], consoleErrors: [] };
  browserDiagnostics.set(page, diagnostics);
  page.on("pageerror", error => diagnostics.pageErrors.push(error.stack ?? error.message));
  page.on("console", message => {
    if (message.type() === "error") {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  await prepare(page);
});

test.afterEach(async ({ page }, testInfo) => {
  try {
    await page.evaluate(async () => {
      if (window.originalTargetDice) {
        CONFIG.Dice.randomUniform = window.originalTargetDice;
        delete window.originalTargetDice;
      }
      await window.targetAutomationFixture?.cleanup();
      delete window.targetAutomationFixture;
    });
  } finally {
    const diagnostics = browserDiagnostics.get(page);
    await testInfo.attach("browser-diagnostics", { body: JSON.stringify(diagnostics, null, 2), contentType: "application/json" });
    expect(diagnostics.pageErrors, "No uncaught errors, including setup and cleanup").toEqual([]);
  }
});

test("native attack cancellation and a changed battlefield spend no use", async ({ page }) => {
  await page.evaluate(async () => {
    await window.targetAutomationFixture.open({ system: { attack: { isAttack: true } }, targets: ["enemy"] });
  });
  const panel = page.locator(".power-targeting");
  await panel.locator('[data-action="attack"]').click();
  const native = page.locator(".application.roll-dialogue");
  await expect(native).toBeVisible();
  await native.locator('[data-action="close"]').click();
  await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state)).toBe("targeting");
  expect(await page.evaluate(() => window.targetAutomationFixture.item.system.uses.value)).toBe(2);

  await panel.locator('[data-action="attack"]').click();
  await expect(native).toBeVisible();
  await page.evaluate(async () => { await window.targetAutomationFixture.tokens.enemy.document.update({ x: 1200 }); });
  await submitNativeAttack(page);
  await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state)).toBe("targeting");
  expect(await page.evaluate(() => window.targetAutomationFixture.item.system.uses.value)).toBe(2);
  expect(await page.evaluate(() => window.targetAutomationFixture.activation.attackMessages.length)).toBe(0);
});

for (const scenario of [
  { name: "hit", attack: "100", expected: [7], types: ["normal"] },
  { name: "shared and target modifiers with exactly-once HP application", attack: "100", modifiers: true, expected: [8], types: ["normal"] },
  { name: "removing one reviewed target", attack: "100", removeTarget: true, expected: [7], types: ["normal"] },
  { name: "miss without damage", attack: "-100", expected: [0], types: [] },
  { name: "half damage on miss", attack: "-100", miss: { halfDamage: true }, expected: [3], types: ["normal"] },
  { name: "separate miss damage", attack: "-100", miss: { formula: "3" }, expected: [3], types: ["miss"] },
  { name: "mixed hit and half-miss", attack: "100", miss: { halfDamage: true }, mixed: true, expected: [7, 3], types: ["normal"] },
  // Foundry maps faces with ceil((1 - randomUniform) * faces).
  { name: "critical hit", attack: "100", random: 0, expected: [14], types: ["crit"] },
  { name: "critical failure", attack: "100", random: 0.99, expected: [0], types: [] },
]) {
  test(`native attack, damage review and completion: ${scenario.name}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.evaluate(async scenario => {
      if (scenario.random !== undefined) {
        CONFIG.Dice.randomUniform = () => scenario.random;
      }
      const fixture = window.targetAutomationFixture;
      if (scenario.mixed) {
        await fixture.actors.far.update({ "system.defences.ac.base": 200 });
      }
      await fixture.open({ system: { rangePower: "10", attack: { isAttack: true, formula: scenario.attack },
        hit: { isDamage: true, formula: "7", critFormula: "14" }, miss: scenario.miss ?? {} },
        config: { targetCount: scenario.mixed || scenario.removeTarget ? 2 : 1 },
        targets: scenario.mixed || scenario.removeTarget ? ["enemy", "far"] : ["enemy"] });
    }, scenario);
    const panel = page.locator(".power-targeting");
    await panel.locator('[data-action="attack"]').click();
    const native = page.locator(".application.roll-dialogue");
    await expect(native).toBeVisible();
    await submitNativeAttack(page);
    await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state), { timeout: 45000 })
      .toMatch(/^(reviewingResults|reviewingDamage|complete)$/);
    const state = await page.evaluate(() => window.targetAutomationFixture.activation.state);
    if (state === "reviewingResults") {
      if (scenario.removeTarget) {
        const disclosure = panel.locator("details[data-target-disclosure]");
        if (await disclosure.getAttribute("open") === null) {
          await disclosure.locator("summary").click();
        }
        const id = await page.evaluate(() => window.targetAutomationFixture.tokens.far.id);
        await panel.locator(`[data-action="removeReviewTarget"][data-token-id="${id}"]`).click();
        await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.targets.length)).toBe(1);
      }
      await panel.locator('[data-action="confirmResults"]').click();
    }
    await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state), { timeout: 45000 })
      .toBe(scenario.types.length ? "reviewingDamage" : "complete");
    expect(await page.evaluate(() => window.targetAutomationFixture.item.system.uses.value)).toBe(1);
    const types = await page.evaluate(() => window.targetAutomationFixture.activation.damageMessages
      .map(message => message.flags["dnd4e-health-display"].damageReview.type));
    expect(types.sort()).toEqual([...scenario.types].sort());
    if (scenario.modifiers) {
      await panel.locator("[data-damage-modifier]").fill("-2");
      await panel.locator('[data-action="adjustDamage"]').click();
      await expect(panel.locator(".power-targeting__outcome-total strong")).toHaveText("5");
      const disclosure = panel.locator("details[data-target-disclosure]");
      if (await disclosure.getAttribute("open") === null) {
        await disclosure.locator("summary").click();
      }
      await panel.locator("[data-target-damage-modifier]").fill("+3");
      await panel.locator('[data-action="adjustTargetDamage"]').click();
      await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.targetDamageModifiers
        .get(window.targetAutomationFixture.tokens.enemy.id)?.total)).toBe(3);
    }
    if (scenario.types.length) {
      await panel.locator('[data-action="confirmDamage"]').click();
    }
    await expect(panel.locator('[data-action="complete"]')).toBeVisible();
    const result = await page.evaluate(() => {
      const activation = window.targetAutomationFixture.activation;
      return { state: activation.state, use: activation.item.system.uses.value,
        receipts: activation.attackMessages.flatMap(message => message.flags["dnd4e-health-display"].targetDamageReview.targets),
        pending: activation.attackMessages.map(message => message.flags["dnd4e-health-display"].attackResults.pending),
        hp: activation.targets.map(token => token.actor.system.attributes.hp.value) };
    });
    expect(result.receipts.map(target => target.total)).toEqual(scenario.expected);
    expect(result.pending.every(value => value === false)).toBe(true);
    expect(result.hp.every(value => value === 40), "confirmation leaves HP application to the GM").toBe(true);
    if (scenario.modifiers) {
      const applied = await page.evaluate(async () => {
        const fixture = window.targetAutomationFixture;
        const { applyTargetDamage } = await import(new URL(
          "modules/dnd4e-health-display/scripts/power-activation/damage-application-data.js", document.baseURI).href);
        const message = fixture.activation.attackMessages[0];
        await Promise.all([applyTargetDamage(message, fixture.tokens.enemy.id), applyTargetDamage(message, fixture.tokens.enemy.id)]);
        return { hp: fixture.actors.enemy.system.attributes.hp.value,
          temp: Number(fixture.actors.enemy.system.attributes.temphp.value),
          receipt: message.flags["dnd4e-health-display"].damageApplications[fixture.tokens.enemy.id].state };
      });
      expect(applied).toEqual({ hp: 37, temp: 0, receipt: "applied" });
    }
    await testInfo.attach("target-automation-result", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    await panel.locator('[data-action="complete"]').click();
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => window.targetAutomationFixture.item.system.uses.value)).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("target portraits focus and highlight tokens without changing selection", async ({ page }) => {
  await page.evaluate(async () => {
    await window.targetAutomationFixture.open({ system: { attack: { isAttack: true } }, targets: ["enemy"] });
  });
  const panel = page.locator(".power-targeting");
  const portrait = panel.locator('[data-action="focusTarget"]');
  await expect(portrait).toHaveCount(1);
  await portrait.hover();
  expect(await page.evaluate(() => Boolean(window.targetAutomationFixture.activation.targetHighlight))).toBe(true);
  await portrait.click();
  await expect.poll(() => page.evaluate(() => {
    const token = window.targetAutomationFixture.tokens.enemy;
    return Math.abs(canvas.stage.pivot.x - token.center.x) + Math.abs(canvas.stage.pivot.y - token.center.y);
  })).toBeLessThan(2);
  await portrait.focus();
  await portrait.press("Enter");
  await panel.locator('[data-action="attack"]').focus();
  expect(await page.evaluate(() => Boolean(window.targetAutomationFixture.activation.targetHighlight))).toBe(false);
  const facts = await page.evaluate(() => {
    const fixture = window.targetAutomationFixture;
    return { targets: fixture.activation.targets.map(token => token.id), expected: fixture.tokens.enemy.id,
      uses: fixture.item.system.uses.value, state: fixture.activation.state, controlled: canvas.tokens.controlled.map(token => token.id), caster: fixture.tokens.caster.id };
  });
  expect(facts.targets).toEqual([facts.expected]);
  expect(facts.controlled).toEqual([facts.caster]);
  expect(facts).toMatchObject({ uses: 2, state: "targeting" });
});

for (const variant of ["charge", "opportunity", "regular"]) {
  test(`attack mode selector preserves selection and carries ${variant} through native attack and damage`, async ({ page }) => {
    await page.evaluate(async () => {
      await window.targetAutomationFixture.open({ system: {
        attack: { isAttack: true, isBasic: true, canCharge: true, canOpp: true, formula: "100" },
        hit: { isDamage: true, formula: "7", critFormula: "14" },
      }, targets: ["enemy"] });
    });
    const panel = page.locator(".power-targeting");
    const selector = panel.locator("[data-variant-selector]");
    await expect(selector.locator("option")).toHaveText(["Basic attack", "Charge", "Opportunity attack"]);
    await selector.selectOption("charge");
    await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.variant)).toBe("charge");
    if (variant !== "charge") {
      await selector.selectOption(variant);
    }
    await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.variant)).toBe(variant);
    const selection = await page.evaluate(() => {
      const fixture = window.targetAutomationFixture;
      return { targets: fixture.activation.targets.map(token => token.id), expected: fixture.tokens.enemy.id, uses: fixture.item.system.uses.value };
    });
    expect(selection.targets).toEqual([selection.expected]);
    expect(selection.uses).toBe(2);
    await panel.locator('[data-action="attack"]').click();
    const native = page.locator(".application.roll-dialogue");
    await expect(native).toBeVisible();
    await native.locator('[data-action="close"]').click();
    await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state)).toBe("targeting");
    await expect(selector).toHaveValue(variant);
    await panel.locator('[data-action="attack"]').click();
    await submitNativeAttack(page);
    await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state), { timeout: 45000 })
      .toMatch(/^(reviewingResults|reviewingDamage)$/);
    if (await page.evaluate(() => window.targetAutomationFixture.activation.state) === "reviewingResults") {
      await panel.locator('[data-action="confirmResults"]').click();
    }
    await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state), { timeout: 45000 }).toBe("reviewingDamage");
    const expectedVariance = variant === "charge" ? { isCharge: true } : variant === "opportunity" ? { isOpp: true } : {};
    const facts = await page.evaluate(() => {
      const fixture = window.targetAutomationFixture;
      return { attack: fixture.activation.attackMessages.map(message => message.flags.dnd4e?.variance ?? {}),
        damage: fixture.activation.damageMessages.map(message => message.flags.dnd4e?.variance ?? {}), uses: fixture.item.system.uses.value };
    });
    expect(facts.uses).toBe(1);
    expect(facts.attack.length).toBeGreaterThan(0);
    for (const variance of [...facts.attack, ...facts.damage]) {
      expect(variance).toEqual(expectedVariance);
    }
    await expect(panel.locator('[data-action="focusTarget"]')).toHaveCount(1);
  });
}
