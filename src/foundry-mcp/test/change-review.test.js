import test from "node:test";
import assert from "node:assert/strict";
import { changeReviewContent, bindChangeReview } from "../scripts/change-review.js";

test("power review renders readable settings and escapes complete source data", () => {
  const content = changeReviewContent({ name: "Test John", overview: "Add <script> powers", changes: [
    { document: "Burst <img>", uuid: "Actor.pc", path: "items: add power (burst)", before: null,
      after: { name: "Burst <img>", system: { rangeType: "rangeBurst", area: "1", rangePower: "10",
        useType: "atwill", attack: { isAttack: false }, hit: { isDamage: false },
        description: { value: "<script>alert(1)</script>" } } } },
    { document: "Other", uuid: "Actor.pc.Item.other", path: "system.target", before: "One", after: "Two" }
  ] });
  assert.match(content, /Area burst 1 within 10 squares/);
  assert.match(content, /At-will/);
  assert.match(content, /Inspect source data/);
  assert.match(content, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(content, /data-panel="1" hidden/);
  assert.match(content, /system.target/);
  assert.ok(!content.includes("<script>"));
  assert.ok(!content.includes("<img>"));
});

test("document navigation switches only its own panels without approving", () => {
  const buttons = [0, 1].map(index => ({ dataset: { reviewIndex: String(index) },
    addEventListener(event, callback) { this.click = callback; },
    setAttribute(key, value) { this[key] = value; } }));
  const panels = [0, 1].map(index => ({ dataset: { panel: String(index) }, hidden: index !== 0 }));
  const root = { querySelectorAll: selector => selector === "[data-review-index]" ? buttons : panels };
  bindChangeReview([root]);
  let prevented = false;
  buttons[1].click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(panels.map(panel => panel.hidden), [true, false]);
  assert.equal(buttons[0]["aria-pressed"], "false");
  assert.equal(buttons[1]["aria-pressed"], "true");
});
