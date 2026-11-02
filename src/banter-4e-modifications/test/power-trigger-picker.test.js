import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

/** Exercise the production dialog and native form controls without a Foundry server. */
test("trigger picker preserves edits across selection, filtering and suggestions", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://trigger-picker.test/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/") {
        await route.fulfill({ contentType: "text/html", body: "<!doctype html><main></main>" });
        return;
      }
      await route.fulfill({ contentType: "text/javascript", body: await readFile(new URL(`../${path.slice(1)}`, import.meta.url), "utf8") });
    });
    await page.goto("http://trigger-picker.test/");
    await page.evaluate(async () => {
      globalThis.game = { actors: new Map() };
      globalThis.foundry = {
        utils: { escapeHTML: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;") },
        applications: { api: { DialogV2: class {
          constructor(options) {
            this.options = options;
            this.element = document.querySelector("main");
          }
          addEventListener(event, callback) { this.onRender = callback; }
          render() {
            this.element.innerHTML = `<form>${this.options.content}</form>`;
            this.onRender();
          }
        } } },
      };
      const { PowerTriggerDialog } = await import("/scripts/modules/trigger-prompts/power-trigger-dialog.js");
      globalThis.picker = PowerTriggerDialog;
      PowerTriggerDialog.show({ name: "Test power", type: "power", system: { trigger: "An enemy within 5 squares of you hits you" }, flags: {} });
    });
    const choose = id => page.locator(`[data-trigger-id="${id}"]`).click();
    const field = name => page.locator(`[name="${name}"]`);
    await page.addStyleTag({ content: await readFile(new URL("../styles/main.css", import.meta.url), "utf8") });
    await page.addStyleTag({ content: "body { background: #09090f; color: #eee4cc; font: 14px Arial; } main { width: 730px; }" });
    await choose("enemy-hits-you");
    const appearance = await page.evaluate(() => {
      const selected = document.querySelector('[data-trigger-id="enemy-hits-you"]');
      const other = document.querySelector('[data-trigger-id="you-miss"]');
      return {
        selectedBackground: getComputedStyle(selected).backgroundColor,
        otherBackground: getComputedStyle(other).backgroundColor,
        statusWidth: selected.querySelector("[data-assignment-status]").getBoundingClientRect().width,
        borders: ["catalog", "editor", "settings"].map(name => getComputedStyle(document.querySelector(`.trigger-prompts-picker__${name}`)).borderTopWidth),
      };
    });
    assert.notEqual(appearance.selectedBackground, appearance.otherBackground);
    assert.equal(appearance.statusWidth, 1, "Accessible assignment text must not crowd trigger names");
    assert.deepEqual(appearance.borders, ["1px", "1px", "1px"]);
    await field("suggestFromText").check();
    assert.equal(await field("enemy-hits-you.enabled").isChecked(), true);
    assert.equal(await page.locator('[data-trigger-id="enemy-hits-you"] [data-assignment-marker]').textContent(), "✓");
    await field("suggestFromText").uncheck();
    assert.equal(await field("enemy-hits-you.enabled").isChecked(), false);
    assert.equal(await page.locator('[data-trigger-id="enemy-hits-you"] [data-assignment-marker]').textContent(), "");
    await field("enemy-hits-you.enabled").check();
    await field("enemy-hits-you.rangeSquares").fill("7");
    await field("enemy-hits-you.nonMinion").check();
    await field("enemy-hits-you.criticalOnly").check();
    await field("enemy-hits-you.attackTypes").first().check();
    await choose("you-miss");
    await field("you-miss.enabled").check();
    await page.locator(".trigger-prompts-picker__category").selectOption("Companion");
    assert.equal(await page.locator("[data-trigger-id]:visible").count(), 2);
    await page.locator(".trigger-prompts-config__search").fill("  NO SUCH EVENT  ");
    assert.equal(await page.locator("[data-trigger-panel]:visible").count(), 0);
    assert.equal(await page.locator(".trigger-prompts-config__empty").isVisible(), true);
    await page.locator(".trigger-prompts-config__search").fill("");
    await page.locator(".trigger-prompts-picker__category").selectOption("All");
    await choose("enemy-hits-you");
    assert.equal(await field("enemy-hits-you.rangeSquares").inputValue(), "7");
    assert.equal(await field("enemy-hits-you.nonMinion").isChecked(), true);
    await field("enemy-hits-you.enabled").uncheck();
    assert.equal(await page.locator('[data-trigger-panel="enemy-hits-you"] .trigger-prompts-picker__conditions').isVisible(), false);
    await field("enemy-hits-you.enabled").check();
    assert.equal(await field("enemy-hits-you.rangeSquares").inputValue(), "7");
    assert.equal(await page.locator("[data-trigger-panel]:visible").count(), 1);
    await field("suggestFromText").check();
    assert.equal(await field("enemy-hits-you.rangeSquares").inputValue(), "5");
    assert.equal(await page.locator('[data-trigger-id="enemy-hits-you"] [data-assignment-marker]').textContent(), "✓");
    await field("suggestFromText").uncheck();
    assert.equal(await field("enemy-hits-you.rangeSquares").inputValue(), "7");
    await field("automaticBenefit").check();
    await field("sharedLimit").selectOption("turn");
    await page.locator(".trigger-prompts-config__search").fill("companion");
    const saved = await page.evaluate(() => {
      const data = new FormData(document.querySelector("form"));
      return { assignments: picker.readAssignments(data), limit: picker.readLimit(data), automatic: data.has("automaticBenefit") };
    });
    assert.equal(saved.assignments.length, 2);
    assert.deepEqual(saved.assignments.find(a => a.triggerId === "enemy-hits-you").parameters, { rangeSquares: 7, attackTypes: ["melee"], nonMinion: true, criticalOnly: true });
    assert.equal(saved.limit, "turn");
    assert.equal(saved.automatic, true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
