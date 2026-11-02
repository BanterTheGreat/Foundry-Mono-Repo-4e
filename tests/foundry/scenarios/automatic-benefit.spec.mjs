import { test, expect } from '@playwright/test';
import { openTestWorld } from '../helpers/session.mjs';
import { settings } from '../config.mjs';

test('automatic benefits announce publicly and retain chat after the informational alert expires', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openTestWorld(page);
  const before = await page.evaluate(() => ({
    world: game.world.id,
    combat: game.combats.some(combat => combat.active || combat.started),
    users: game.users.filter(user => user.active).map(user => ({ name: user.name, isGM: user.isGM })),
    leftovers: [...game.actors, ...game.scenes].filter(doc => doc.getFlag('foundry-test-harness', 'runId')).map(doc => doc.name),
    counts: { actors: game.actors.size, messages: game.messages.size },
    messageIds: game.messages.map(message => message.id),
  }));
  expect(before.world).toBe(settings.worldId);
  expect(before.combat, 'End existing test-world combat before running').toBe(false);
  expect(before.leftovers).toEqual([]);
  expect(before.users.filter(user => user.isGM && user.name !== settings.userName)).toEqual([]);
  try {
    const ids = await page.evaluate(async () => {
      const { TestDocuments, assertTestWorld } = await import('/modules/foundry-test-harness/scripts/fixtures.js');
      const { ItemTriggerAssignments } = await import('/modules/banter-4e-modifications/scripts/modules/trigger-prompts/item-trigger-assignments.js');
      const { PowerTriggerDialog } = await import('/modules/banter-4e-modifications/scripts/modules/trigger-prompts/power-trigger-dialog.js');
      assertTestWorld();
      const docs = window.automaticBenefitDocs = new TestDocuments();
      const actor = await docs.createActor({ items: [
        { name: 'Mandatory benefit', type: 'feat', system: { description: { value: '<p>Gain the mandatory benefit.</p>' } } },
        { name: 'Optional response', type: 'feat' },
      ] });
      const item = actor.items.find(item => item.name === 'Mandatory benefit');
      await ItemTriggerAssignments.write(item, [], 'day', true);
      PowerTriggerDialog.show(item);
      const chat = game.TriggerPrompts.promptChat;
      const input = { actor, trigger: { id: 'test', label: 'Test event' }, assignments: actor.items.map(item => ({ item })), context: { detail: 'A test enemy dropped to 0 HP.' }, recipientIds: [game.user.id] };
      await chat.createPromptCard(input);
      const automatic = game.messages.find(message => message.flags.triggerPrompts?.automatic && message.flags.triggerPrompts.actorId === actor.id);
      const optional = game.messages.find(message => !message.flags.triggerPrompts?.automatic && message.flags.triggerPrompts?.actorId === actor.id);
      await chat.createPromptCard({ ...input, assignments: [{ item }] });
      return { automatic: automatic.id, optional: optional.id, publicCount: game.messages.filter(message => message.flags.triggerPrompts?.automatic && message.flags.triggerPrompts.actorId === actor.id).length, whisper: automatic.whisper, used: item.getFlag('banter-4e-modifications', 'trigger-prompt-usage').used };
    });
    expect(ids.whisper).toEqual([]);
    expect(ids.publicCount).toBe(1);
    expect(ids.used).toBe('day:day');
    await expect(page.locator('[name="automaticBenefit"]')).toBeChecked();
    await page.locator('[name="automaticBenefit"]').uncheck();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect(await page.evaluate(() => window.automaticBenefitDocs.documents.find(doc => doc.documentName === 'Actor').items.find(item => item.name === 'Mandatory benefit').getFlag('banter-4e-modifications', 'trigger-prompts').automatic)).toBe(false);
    const announcement = page.locator(`li[data-message-id="${ids.automatic}"]`);
    await expect(announcement).not.toHaveClass(/trigger-prompt-hidden/);
    await expect(announcement).toContainText('Automatic benefit triggered');
    await expect(announcement).toContainText('Gain the mandatory benefit.');
    await expect(announcement.locator('.dnd4e.chat-card')).toHaveCount(1);
    await expect(announcement.locator('.banter-trigger-tooltip-header')).toHaveCount(0);
    const alert = page.locator(`.banter-trigger-alert[data-message-id="${ids.automatic}"]`);
    // The configuration interaction can outlast six seconds: inspect another fresh rendering window.
    await page.evaluate(async id => { await game.messages.get(id).update({ 'flags.triggerPrompts.expiresAt': Date.now() + 6000 }); }, ids.automatic);
    await expect(alert).toBeVisible();
    await expect(alert.locator('[data-trigger-prompt-action]')).toHaveCount(0);
    await expect(alert.getByRole('button', { name: 'Dismiss' })).toBeVisible();
    await expect(page.locator(`li[data-message-id="${ids.optional}"]`)).toBeHidden();
    await expect(alert).toHaveCount(0, { timeout: 10000 });
    expect(await page.evaluate(id => Boolean(game.messages.get(id)), ids.automatic)).toBe(true);
    await page.evaluate(id => { game.TriggerPrompts.promptChat.alerts.show(game.messages.get(id)); }, ids.automatic);
    await expect(alert).toHaveCount(0);
    await page.evaluate(async id => { await game.messages.get(id).update({ 'flags.triggerPrompts.expiresAt': Date.now() + 6000 }); }, ids.automatic);
    await alert.getByRole('button', { name: 'Dismiss' }).click();
    await page.evaluate(id => { game.TriggerPrompts.promptChat.alerts.show(game.messages.get(id)); }, ids.automatic);
    await expect(alert).toHaveCount(0);
    expect(await page.evaluate(id => Boolean(game.messages.get(id)), ids.automatic)).toBe(true);
  } finally {
    await page.evaluate(async existing => {
      await window.automaticBenefitDocs?.cleanup();
      for (const message of [...game.messages]) {
        if (!existing.includes(message.id) && message.author?.id === game.user.id) {
          await message.delete();
        }
      }
    }, before.messageIds);
  }
  expect(await page.evaluate(() => ({ actors: game.actors.size, messages: game.messages.size }))).toEqual(before.counts);
  expect(errors).toEqual([]);
});
