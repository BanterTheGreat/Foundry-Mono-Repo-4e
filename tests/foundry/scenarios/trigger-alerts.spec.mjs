import { test, expect } from "@playwright/test";
import { openTestWorld } from "../helpers/session.mjs";
import { settings } from "../config.mjs";

test("compact trigger alerts show causes, power tooltips and deadline-based draining timers", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openTestWorld(page);
  const environment = await page.evaluate(() => ({
    world: game.world.id, users: game.users.filter(user => user.active).map(user => ({ name: user.name, isGM: user.isGM })),
    scene: canvas.scene?.id, grid: canvas.scene?.grid.size,
    enabled: Boolean(game.TriggerPrompts),
    leftovers: game.actors.filter(actor => actor.getFlag("foundry-test-harness", "runId")).map(actor => actor.name),
    counts: { actors: game.actors.size, messages: game.messages.size },
  }));
  expect(environment.world).toBe(settings.worldId);
  expect(environment.enabled).toBe(true);
  console.log("Trigger alert read-only world probe", environment);
  try {
    await page.evaluate(async () => {
      const { TestDocuments, assertTestWorld } = await import("/modules/foundry-test-harness/scripts/fixtures.js");
      assertTestWorld();
      const docs = window.triggerAlertTestDocs = new TestDocuments();
      const actor = window.triggerAlertTestActor = await docs.createActor({ items: [
        { name: "Test Riposte", type: "power", system: { autoGenChatPowerCard: true, hit: { detail: "The target is struck." } } },
        { name: "Test Shield", type: "power", system: { autoGenChatPowerCard: false, description: { value: "Gain a shield bonus." } } },
      ] });
      window.triggerAlertUses = [];
      actor.usePower = async (item, options) => window.triggerAlertUses.push({ name: item.name, options });
      window.makeTriggerAlert = async (overrides = {}) => {
        const message = await docs.createMessage({ content: "Test private trigger", whisper: [game.user.id], flags: { triggerPrompts: {
          actorId: actor.id, actorUuid: actor.uuid, label: "Enemy misses you", detail: "Goblin skirmisher missed you.",
          choices: actor.items.map(item => ({ itemId: item.id })), recipientIds: [game.user.id], used: false,
          expiresAt: Date.now() + 20000, ...overrides,
        } } });
        return message.id;
      };
    });
    const id = await page.evaluate(() => window.makeTriggerAlert());
    const alert = page.locator(`.banter-trigger-alert[data-message-id="${id}"]`);
    await expect(alert).toBeVisible();
    await expect(page.locator(`li[data-message-id="${id}"]`)).toBeHidden();
    await expect(alert).toContainText("Goblin skirmisher missed you.");
    await expect(alert).not.toContainText("Hover for power details");
    await expect(alert).not.toContainText("Ignore (");
    expect(await alert.evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(85);
    await expect.poll(() => alert.locator(".banter-trigger-alert__drain").evaluate(el => {
      return new DOMMatrixReadOnly(getComputedStyle(el).transform).a;
    })).toBeLessThan(.98);
    const button = alert.getByRole("button", { name: "Test Riposte" });
    await button.hover();
    await expect(alert.getByRole("tooltip")).toContainText("The target is struck.");
    await alert.getByRole("button", { name: "Test Shield" }).focus();
    await expect(alert.getByRole("tooltip")).toContainText("Gain a shield bonus.");
    await page.keyboard.press("Escape");
    await expect(alert.getByRole("tooltip")).toBeHidden();
    const animation = await alert.locator(".banter-trigger-alert__drain").evaluate(el => el.getAnimations()[0].currentTime);
    await page.evaluate(id => {
      const message = game.messages.get(id);
      game.TriggerPrompts.promptChat.alerts.show(message);
      game.TriggerPrompts.promptChat.alerts.show(message);
    }, id);
    await expect(page.locator(`.banter-trigger-alert[data-message-id="${id}"]`)).toHaveCount(1);
    expect(await alert.locator(".banter-trigger-alert__drain").evaluate(el => el.getAnimations()[0].currentTime)).toBeGreaterThanOrEqual(animation);
    await button.click();
    await expect(alert).toHaveCount(0);
    expect(await page.evaluate(() => window.triggerAlertUses)).toEqual([{ name: "Test Riposte", options: { configureDialog: true } }]);

    const ignored = await page.evaluate(() => window.makeTriggerAlert());
    await page.locator(`.banter-trigger-alert[data-message-id="${ignored}"]`).getByRole("button", { name: "Ignore" }).click();
    await expect(page.locator(`.banter-trigger-alert[data-message-id="${ignored}"]`)).toHaveCount(0);
    await page.evaluate(id => {
      const docs = window.triggerAlertTestDocs;
      docs.documents = docs.documents.filter(doc => doc.id !== id);
    }, ignored);

    const late = await page.evaluate(() => window.makeTriggerAlert({ expiresAt: Date.now() + 3000 }));
    const lateAlert = page.locator(`.banter-trigger-alert[data-message-id="${late}"]`);
    await expect(lateAlert).toBeVisible();
    expect(await lateAlert.locator(".banter-trigger-alert__drain").evaluate(el => parseFloat(getComputedStyle(el).animationDelay))).toBeLessThan(-6);
    await expect(lateAlert).toHaveCount(0, { timeout: 5000 });
    const hidden = await page.evaluate(() => window.makeTriggerAlert({ recipientIds: [] }));
    await expect(page.locator(`.banter-trigger-alert[data-message-id="${hidden}"]`)).toHaveCount(0);
    const expired = await page.evaluate(() => window.makeTriggerAlert({ expiresAt: Date.now() - 1 }));
    await expect(page.locator(`.banter-trigger-alert[data-message-id="${expired}"]`)).toHaveCount(0);
    const claimed = await page.evaluate(() => window.makeTriggerAlert());
    await expect(page.locator(`.banter-trigger-alert[data-message-id="${claimed}"]`)).toBeVisible();
    await page.evaluate(async id => { await game.messages.get(id).update({ "flags.triggerPrompts.used": true }); }, claimed);
    await expect(page.locator(`.banter-trigger-alert[data-message-id="${claimed}"]`)).toHaveCount(0);
  } finally {
    await page.evaluate(async () => { await window.triggerAlertTestDocs?.cleanup(); });
  }
  expect(await page.evaluate(() => ({ actors: game.actors.size, messages: game.messages.size }))).toEqual(environment.counts);
  expect(errors).toEqual([]);
});
