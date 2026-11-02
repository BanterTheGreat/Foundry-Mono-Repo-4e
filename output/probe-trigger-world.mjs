import { chromium } from '@playwright/test';
import { settings } from '../tests/foundry/config.mjs';
import { openTestWorld } from '../tests/foundry/helpers/session.mjs';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({baseURL:settings.url});
 await page.goto(settings.url);
 await openTestWorld(page);
 console.log(JSON.stringify(await page.evaluate(() => ({world:game.world.id, users:game.users.filter(u=>u.active).map(u=>({name:u.name,isGM:u.isGM})), combats:game.combats.map(c=>({id:c.id,active:c.active,started:c.started})), fixtures:[...game.actors,...game.scenes].filter(d=>d.name.startsWith('[Integration test')).map(d=>d.name), windows:Object.values(ui.windows).map(w=>w.title), scene:canvas.scene?.name}))));
} finally {await browser.close();}


