import { chromium } from 'playwright';
import { openTestWorld } from '../tests/foundry/helpers/session.mjs';
import { settings } from '../tests/foundry/config.mjs';
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11'] });
try {
 const page = await browser.newPage({ baseURL: settings.url, viewport: { width: 1920, height: 1080 } });
 const mutations = [];
 await page.route('**/modules/banter-4e-modifications/scripts/modules/trigger-prompts/*.js', async route => {
   const response = await route.fetch();
   let body = await response.text();
   const name = new URL(route.request().url()).pathname.split('/').at(-1);
   const replace = (before, after, label) => {
     if (!body.includes(before)) throw new Error(`Mutation anchor missing: ${label}`);
     body = body.replace(before, after); mutations.push(label);
   };
   if (name === 'trigger-definitions.js') {
     replace('where: { outcome: "hit", isOpportunity: true }', 'where: { outcome: "hit", isOpportunity: false }', 'opportunity-mode inverted');
     replace('on: COMBAT_EVENT_TYPE.SAVE_RESOLVED, recipients: { role: "subject" }', 'on: COMBAT_EVENT_TYPE.SAVE_RESOLVED, where: { outcome: "fail" }, recipients: { role: "subject" }', 'successful-save completion disabled');
   }
   if (name === 'trigger-filters.js') {
     replace('if (context.requiresCompanion && !parameters.companionActorUuid)', 'if (context.requiresCompanion)', 'companion routing disabled');
   }
   await route.fulfill({ response, body });
 });
 await openTestWorld(page);
 const env = await page.evaluate(() => ({ world: game.world.id, combat: game.combats.some(c=>c.started||c.active), otherGM: game.users.some(u=>u.active&&u.isGM&&u.id!==game.user.id), fixtures: game.actors.some(a=>a.name.startsWith('[Integration test')) }));
 if (env.world !== settings.worldId || env.combat || env.otherGM || env.fixtures) throw new Error(JSON.stringify(env));
 await page.waitForFunction(() => game.modules.get('foundry-test-harness')?.api?.ready === true);
 const count = () => ({ actors:game.actors.size, scenes:game.scenes.size, combats:game.combats.size, messages:game.messages.size, tokens:game.scenes.reduce((n,s)=>n+s.tokens.size,0) });
 const before = await page.evaluate(count);
 const result = await page.evaluate(() => game.modules.get('foundry-test-harness').api.run(['banter-4e-modifications.expanded-triggers']));
 const after = await page.evaluate(count);
 const failures = result.report.failures.map(f=>f.title);
 console.log(JSON.stringify({mutations,stats:result.report.stats,failures,clean:JSON.stringify(before)===JSON.stringify(after)},null,2));
 if (new Set(mutations).size !== 3 || result.report.stats.failures < 3 || JSON.stringify(before)!==JSON.stringify(after)) process.exitCode=1;
} finally { await browser.close(); }
