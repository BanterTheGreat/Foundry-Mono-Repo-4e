import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openTestWorld } from '../tests/foundry/helpers/session.mjs';

const cases = [
  ['shift', 'trigger-prompts.js', 'if (action !== "shift") {', 'if (true) {', 'does not provoke on Shift'],
  ['dedup', 'trigger-item-limits.js', 'if (state.enemies.includes(ticket.sourceKey)) {', 'if (false && state.enemies.includes(ticket.sourceKey)) {', 'offers once per enemy'],
  ['turn', 'trigger-item-limits.js', 'if (limited && state.used) {', 'if (false && limited && state.used) {', 'one claimed choice spends'],
  ['green'],
];
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, file, before, after, expectedFailure] of cases) {
    const page = await browser.newPage({ baseURL: 'http://localhost:30000' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let mutated = false;
    await page.route('**/modules/banter-4e-modifications/**/*.js', async route => {
      const response = await route.fetch();
      let body = await response.text();
      if (route.request().url().includes('/test-foundry/trigger-prompts.js')) {
        body = body.replace(/^      describe\("(?!Opportunity attack)/gm, '      describe.skip("');
        body = body.replace(/^(\s*)it\("([^"\n]+)"/gm, (match, indent, title) =>
          /^(does not provoke on Shift|offers once per enemy|one claimed choice spends)/.test(title) ? match : `${indent}it.skip("${title}"`);
      }
      if (file && route.request().url().includes(`/scripts/modules/trigger-prompts/${file}`)) {
        assert.ok(body.includes(before), `mutation ${name} must match deployed source`);
        body = body.replace(before, after);
        mutated = true;
      }
      await route.fulfill({ response, body });
    });
    try {
      await openTestWorld(page);
      await page.waitForFunction(() => game.modules.get('foundry-test-harness')?.api?.ready);
      const preflight = await page.evaluate(() => ({
        combats: game.combats.filter(c => c.active || c.started).length,
        otherGMs: game.users.filter(u => u.active && u.isGM && u.id !== game.user.id).length,
      }));
      assert.deepEqual(preflight, { combats: 0, otherGMs: 0 });
      const counts = () => ({ actors: game.actors.size, items: game.items.size, scenes: game.scenes.size,
        combats: game.combats.size, messages: game.messages.size,
        tokens: game.scenes.reduce((n, scene) => n + scene.tokens.size, 0) });
      const initial = await page.evaluate(counts);
      const result = await page.evaluate(() => game.modules.get('foundry-test-harness').api.run(['banter-4e-modifications.trigger-prompts']));
      await writeFile(`output/opportunity-live-${name}.json`, JSON.stringify(result, null, 2));
      assert.deepEqual(await page.evaluate(counts), initial, 'fixtures must clean up');
      assert.deepEqual(errors, [], 'no browser errors');
      assert.deepEqual(await page.evaluate(() => window.triggerPromptStrayErrors ?? []), []);
      if (name === 'green') {
        assert.equal(result.report.stats.failures, 0);
        assert.equal(result.report.stats.passes, 3);
      } else {
        assert.equal(mutated, true);
        assert.ok(result.report.stats.failures > 0, `${name} mutation must be caught`);
        assert.ok(JSON.stringify(result.report.failures).includes(expectedFailure), `failure must identify ${expectedFailure}`);
      }
      console.log(JSON.stringify({ name, stats: result.report.stats, cleaned: true }));
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
