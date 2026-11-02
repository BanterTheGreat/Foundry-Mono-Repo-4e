import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
try {const page=await browser.newPage(); await page.goto('http://localhost:30000'); console.log(await page.locator('body').innerText());} finally {await browser.close();}
