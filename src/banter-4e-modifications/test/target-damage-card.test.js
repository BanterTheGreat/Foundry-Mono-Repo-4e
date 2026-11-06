import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

/** Exercise the real damage card before and after the confirmation update. */
test('target damage Apply requires confirmation for players but allows GMs before confirmation', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://damage-card.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill(path === '/'
        ? { contentType: 'text/html', body: '<main><div class="message-content"></div></main>' }
        : { contentType: 'text/javascript', body: await readFile(new URL(`../${path.slice(1)}`, import.meta.url), 'utf8') });
    });
    await page.goto('http://damage-card.test/');
    await page.evaluate(async () => {
      const { renderTargetDamage } = await import('/scripts/modules/chat-rolls/target-damage-card.js');
      const { ChatRolls } = await import('/scripts/modules/chat-rolls/chat-rolls.js');
      const { ChatRollActions } = await import('/scripts/modules/chat-rolls/chat-roll-actions.js');
      window.applications = 0;
      ChatRollActions.applyActorDamage = async () => { window.applications++; };
      const roll = { total: 10, terms: [], options: { hitTypeDamage: true, hitType: 'normal' },
        render: async () => '<div class="dice-roll"></div>' };
      const source = { id: 'source', rolls: [roll] };
      globalThis.game = { messages: new Map([['source', source]]), user: { isGM: false, character: { id: 'hero', isOwner: true }, setFlag: async () => {} }, system: { version: '0.9.3' } };
      const token = { id: 'target', name: 'Target', actor: { isOwner: true }, isVisible: true };
      globalThis.canvas = { ready: true, scene: { id: 'scene' }, tokens: { get: () => token, controlled: [] } };
      globalThis.ui = { notifications: { warn: text => { throw new Error(text); }, error: text => { throw new Error(text); } } };
      window.message = { id: 'aggregate', flags: { 'dnd4e-health-display': { damageChat: {
        name: 'Power', sceneId: 'scene', pending: true,
        layers: ['hit', 'miss', 'critical'].map(outcome => ({ outcome, messageId: 'source', targets: [{ tokenId: 'target', total: 10 }] })),
      } } }, update: async () => {} };
      window.render = async () => {
        document.querySelector('.message-content').replaceChildren();
        await renderTargetDamage(window.message, document.querySelector('main'), ChatRolls);
      };
      await window.render();
    });
    const buttons = page.locator('.banter-roll__apply');
    assert.equal(await buttons.count(), 3);
    assert.deepEqual(await buttons.evaluateAll(elements => elements.map(button => button.disabled)), [true, true, true]);
    // A synthetic click or a stale enabled control must not bypass pending state.
    await buttons.first().evaluate(button => { button.disabled = false; button.click(); });
    assert.equal(await page.evaluate(() => window.applications), 0);
    await page.evaluate(async () => { game.user.isGM = true; await window.render(); });
    assert.deepEqual(await buttons.evaluateAll(elements => elements.map(button => button.disabled)), [false, false, false]);
    await buttons.first().click();
    assert.equal(await page.evaluate(() => window.applications), 1);
    await page.evaluate(async () => { game.user.isGM = false; window.applications = 0; await window.render(); });
    assert.deepEqual(await buttons.evaluateAll(elements => elements.map(button => button.disabled)), [true, true, true]);
    await page.evaluate(async () => { window.message.flags['dnd4e-health-display'].damageChat.pending = false; await window.render(); });
    assert.deepEqual(await buttons.evaluateAll(elements => elements.map(button => button.disabled)), [false, false, false]);
    await buttons.first().click();
    assert.equal(await page.evaluate(() => window.applications), 1);
    assert.equal(await buttons.first().isEnabled(), true);
  } finally {
    await browser.close();
  }
});
