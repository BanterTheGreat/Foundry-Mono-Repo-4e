import { chromium } from 'playwright';
import { settings, authPath } from '../tests/foundry/config.mjs';
import { openTestWorld } from '../tests/foundry/helpers/session.mjs';
import { existsSync } from 'node:fs';
const browser = await chromium.launch({headless:true});
try {
 const context = await browser.newContext({baseURL:settings.url, ...(existsSync(authPath)?{storageState:authPath}:{})});
 const page = await context.newPage();
 await openTestWorld(page);
 console.log(await page.evaluate(()=>({world:game.world.id,ready:game.ready,scene:canvas.scene?.name,users:game.users.filter(u=>u.active).map(u=>({name:u.name,isGM:u.isGM})),combats:game.combats.map(c=>({id:c.id,active:c.active,started:c.started})),workflows:document.querySelectorAll('.power-targeting,.roll-dialogue').length,fixtures:[...game.actors,...game.scenes].filter(d=>d.name.startsWith('[Integration test')).map(d=>d.name),running:game.modules.get('foundry-test-harness')?.api?.running,enabled:game.settings.get('dnd4e-health-display','enablePowerTargetAutomation')})));
} finally {await browser.close();}
