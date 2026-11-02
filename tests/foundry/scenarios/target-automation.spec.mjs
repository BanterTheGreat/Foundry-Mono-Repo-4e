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
    window.targetAutomationMessageIds = game.messages.map(message => message.id);
    window.targetAutomationCounts = { actors: game.actors.size, scenes: game.scenes.size, combats: game.combats.size, messages: game.messages.size,
      tokens: game.scenes.reduce((total, scene) => total + scene.tokens.size, 0) };
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
    if (testInfo.title.includes("combat trigger prompts")) {
      await page.evaluate(async () => {
        const before = new Set(window.targetAutomationMessageIds);
        for (const message of game.messages.filter(entry => !before.has(entry.id) && entry.author?.id === game.user.id)) {
          await message.delete({ notify: false });
        }
      });
      const counts = await page.evaluate(() => ({ actors: game.actors.size, scenes: game.scenes.size, combats: game.combats.size, messages: game.messages.size,
        tokens: game.scenes.reduce((total, scene) => total + scene.tokens.size, 0) }));
      expect(counts, "Trigger workflow restores document counts").toEqual(await page.evaluate(() => window.targetAutomationCounts));
    }
  }
});

test("native attack cancellation and a changed battlefield spend no use", async ({ page }) => {
  await page.evaluate(async () => {
    await window.targetAutomationFixture.open({ system: { attack: { isAttack: true } }, targets: ["enemy"] });
  });
  const panel = page.locator(".power-targeting");
  await panel.locator('[data-action="attack"][data-variant="regular"]').click();
  const native = page.locator(".application.roll-dialogue");
  await expect(native).toBeVisible();
  await native.locator('[data-action="close"]').click();
  await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state)).toBe("targeting");
  expect(await page.evaluate(() => window.targetAutomationFixture.item.system.uses.value)).toBe(2);

  await panel.locator('[data-action="attack"][data-variant="regular"]').click();
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
    await panel.locator('[data-action="attack"][data-variant="regular"]').click();
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
  await panel.locator('[data-action="attack"][data-variant="regular"]').focus();
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
  test(`attack variant buttons preserve selection and carry ${variant} through native attack and damage`, async ({ page }) => {
    await page.evaluate(async () => {
      await window.targetAutomationFixture.open({ system: {
        attack: { isAttack: true, isBasic: true, canCharge: true, canOpp: true, formula: "100" },
        hit: { isDamage: true, formula: "7", critFormula: "14" },
      }, targets: ["enemy"] });
    });
    const panel = page.locator(".power-targeting");
    const buttons = panel.locator('.power-targeting__attack-actions [data-action="attack"]');
    await expect(buttons).toHaveText(["Charge attack", "Normal attack", "Opportunity attack"]);
    const attackButton = panel.locator(`[data-action="attack"][data-variant="${variant}"]`);
    const selection = await page.evaluate(() => {
      const fixture = window.targetAutomationFixture;
      return { targets: fixture.activation.targets.map(token => token.id), expected: fixture.tokens.enemy.id, uses: fixture.item.system.uses.value };
    });
    expect(selection.targets).toEqual([selection.expected]);
    expect(selection.uses).toBe(2);
    await attackButton.click();
    const native = page.locator(".application.roll-dialogue");
    await expect(native).toBeVisible();
    await native.locator('[data-action="close"]').click();
    await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state)).toBe("targeting");
    await expect(attackButton).toBeEnabled();
    await attackButton.click();
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


for (const origin of ["caster", "companion"]) {
  test(`confirmed native Target Automation delivers combat trigger prompts and typed damage${origin === "companion" ? " through a companion origin" : ""}`, async ({ page }) => {
    await page.evaluate(async origin => {
      if (game.combats.some(combat => combat.active || combat.started)) {
        throw new Error("End existing combats before running trigger integration tests.");
      }
      const fixture = window.targetAutomationFixture;
      const { TRIGGER_ID: ID } = await import("/modules/banter-4e-modifications/scripts/modules/trigger-prompts/constants.js");
      const assign = async (actor, ids, parameters = {}) => {
        await actor.createEmbeddedDocuments("Item", ids.map(triggerId => ({
          name: `Trigger ${triggerId}`, type: "feature", system: { description: { value: "Integration trigger" } },
          flags: { "banter-4e-modifications": { "trigger-prompts": { version: 1, assignments: [{ triggerId, parameters }] } } },
        })));
      };
      await assign(fixture.actors.caster, [ID.YOU_HIT_WITH_OPPORTUNITY_ATTACK, ID.YOU_BLOODY_ENEMY]);
      await assign(fixture.actors.enemy, [ID.ENEMY_HITS_YOU, ID.YOU_ARE_HIT_BY_MELEE_ATTACK, ID.YOU_BECOME_BLOODIED]);
      await assign(fixture.actors.enemy, [ID.YOU_TAKE_DAMAGE], { damageTypes: ["physical"] });
      await assign(fixture.actors.ally, [ID.COMPANION_TARGETED, ID.COMPANION_HIT], { companionActorUuid: fixture.actors.enemy.uuid });
      await assign(fixture.actors.ally, [ID.MARKED_ENEMY_ATTACKS_OTHER]);
      await fixture.tokens.ally.document.update({ disposition: -1 });
      await fixture.actors.caster.update({ "system.marker": fixture.actors.ally.uuid });
      await fixture.actors.enemy.update({ "system.attributes.hp.value": 21, "system.attributes.temphp.value": 0 });
      window.triggerAutomationCutoff = Date.now();
      const combat = await Combat.create({ scene: fixture.scene.id, flags: { "foundry-test-harness": { runId: fixture.documents.runId } } });
      window.triggerAutomationCombat = combat;
      await combat.createEmbeddedDocuments("Combatant", ["caster", "enemy", "ally"].map((key, index) => ({
        actorId: fixture.actors[key].id, tokenId: fixture.tokens[key].id, sceneId: fixture.scene.id, initiative: 20 - index,
      })));
      await combat.startCombat();
      await fixture.open({ system: { rangeType: "melee", rangePower: origin === "companion" ? "5" : "1", attack: { isAttack: true, canOpp: true, formula: "100" },
        hit: { isDamage: true, formula: "7", critFormula: "14" } },
        config: origin === "companion" ? { originMode: "custom", originActors: [fixture.actors.companion.uuid], allowCaster: false } : {},
        targets: ["enemy"] });
    }, origin);
    try {
      const panel = page.locator(".power-targeting");
      await panel.locator('[data-action="attack"][data-variant="opportunity"]').click();
      await expect(page.locator(".application.roll-dialogue")).toBeVisible();
      await submitNativeAttack(page);
      await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state), { timeout: 45000 }).toBe("reviewingResults");
      expect(await page.evaluate(() => game.messages.filter(m => m.flags.triggerPrompts?.triggerId === "you-hit-with-opportunity-attack").length)).toBe(0);
      await panel.locator('[data-action="confirmResults"]').click();
      await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state), { timeout: 45000 }).toBe("reviewingDamage");
      await panel.locator('[data-action="confirmDamage"]').click();
      await expect.poll(() => page.evaluate(() => window.targetAutomationFixture.activation.state), { timeout: 45000 }).toBe("complete");
      await page.evaluate(async () => {
        const fixture = window.targetAutomationFixture;
        const { applyTargetDamage } = await import("/modules/dnd4e-health-display/scripts/power-activation/damage-application-data.js");
        await applyTargetDamage(fixture.activation.attackMessages[0], fixture.tokens.enemy.id);
      });
      const expected = ["you-hit-with-opportunity-attack", "you-bloody-enemy", "enemy-hits-you", "you-are-hit-by-melee-attack", "you-become-bloodied", "you-take-damage", "companion-targeted", "companion-hit", "marked-enemy-attacks-other"].sort();
      await expect.poll(() => page.evaluate(() => game.messages.filter(m => m.timestamp >= window.triggerAutomationCutoff && m.flags.triggerPrompts)
        .map(m => m.flags.triggerPrompts.triggerId).sort()), { timeout: 15000 }).toEqual(expected);
      const metadata = await page.evaluate(() => window.targetAutomationFixture.activation.attackMessages[0].flags["dnd4e-health-display"].attackResults.triggerMetadata);
      expect(metadata.isOpportunity).toBe(true);
      expect(metadata.attackRange).toBe("melee");
      await panel.locator('[data-action="complete"]').click();
    } finally {
      await page.evaluate(async () => {
        await window.triggerAutomationCombat?.delete();
        await new Promise(resolve => setTimeout(resolve, 700));
        const cutoff = window.triggerAutomationCutoff ?? Date.now();
        const messages = game.messages.filter(m => m.author?.id === game.user.id && m.timestamp >= cutoff);
        for (const message of messages) {
          await message.delete({ notify: false });
        }
        delete window.triggerAutomationCombat;
      });
    }
  });

}
