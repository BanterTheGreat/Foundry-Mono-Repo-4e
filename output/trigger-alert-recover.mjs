import { chromium } from '@playwright/test';
import { openTestWorld } from '../tests/foundry/helpers/session.mjs';
import { settings } from '../tests/foundry/config.mjs';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ baseURL: settings.url });
  await openTestWorld(page);
  console.log(await page.evaluate(async () => {
    const { assertTestWorld } = await import('/modules/foundry-test-harness/scripts/fixtures.js');
    assertTestWorld();
    const actors = game.actors.filter(actor => actor.getFlag('foundry-test-harness', 'runId') && actor.items.some(item => item.name === 'Test Riposte') && actor.items.some(item => item.name === 'Test Shield'));
    const runs = new Set(actors.map(actor => actor.getFlag('foundry-test-harness', 'runId')));
    const messages = game.messages.filter(message => runs.has(message.getFlag('foundry-test-harness', 'runId')));
    for (const message of messages) { await message.delete(); }
    for (const actor of actors) { await actor.delete(); }
    return { recoveredActors: actors.length, recoveredMessages: messages.length };
  }));
} finally { await browser.close(); }
