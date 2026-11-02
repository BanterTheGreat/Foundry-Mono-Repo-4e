import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { ActorTriggerConfiguration } from "../scripts/modules/trigger-prompts/actor-trigger-configuration.js";

test("actor trigger settings scroll while Save stays outside the scrolling area", async () => {
  let options;
  globalThis.foundry = {
    utils: { escapeHTML: value => String(value) },
    applications: { api: { DialogV2: class {
      constructor(configuration) { options = configuration; }
      render() {}
    } } },
  };
  ActorTriggerConfiguration.showActorDialog({ name: "Hero", items: new Map(), getFlag: () => ({}) });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<form>${options.content}<button>Save</button></form>`);
    await page.addStyleTag({ content: await readFile(new URL("../styles/main.css", import.meta.url), "utf8") });
    for (const height of [900, 500]) {
      await page.setViewportSize({ width: 800, height });
      const layout = await page.locator(".trigger-prompts-config--actor").evaluate(element => {
        element.scrollTop = element.scrollHeight;
        return {
          scrollTop: element.scrollTop,
          height: element.clientHeight,
          viewport: innerHeight,
          overflow: getComputedStyle(element).overflowY,
          saveInside: Boolean(element.querySelector("button")),
          saveBottom: document.querySelector("button").getBoundingClientRect().bottom,
        };
      });
      assert.equal(layout.overflow, "auto");
      assert.ok(layout.scrollTop > 0);
      assert.ok(layout.height <= height * 0.65);
      assert.equal(layout.saveInside, false);
      assert.ok(layout.saveBottom < layout.viewport);
    }
  } finally {
    await browser.close();
    delete globalThis.foundry;
  }
});
