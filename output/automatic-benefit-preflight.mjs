import { chromium } from 'playwright';
import { openTestWorld } from '../tests/foundry/helpers/session.mjs';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({baseURL:'http://localhost:30000'});
 await openTestWorld(page);
 console.log(JSON.stringify(await page.evaluate(() => ({world:game.world.id,users:game.users.filter(u=>u.active).map(u=>({name:u.name,isGM:u.isGM})),combats:game.combats.map(c=>({id:c.id,started:c.started,active:c.active})),scene:canvas.scene?.id,grid:canvas.scene?.grid.size,leftovers:[...game.actors,...game.scenes].filter(d=>d.getFlag('foundry-test-harness','runId')).map(d=>d.name),tests:game.modules.get('foundry-test-harness')?.api?.running,workflows:document.querySelectorAll('.target-automation-panel,.dnd4e.roll-configuration').length})),null,2));
} finally {await browser.close();}

