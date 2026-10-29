import { projectDamage } from "../scripts/power-activation/damage-application-data.js";
import { getTokenHoverDisplayData } from "../scripts/health-display/token-hover-display-data.js";
import { registerTargetAutomationTests } from "./target-automation.js";

/** Register live document, native damage, and Handlebars integration tests. */
export function registerTests(quench, { assertTestWorld, TestDocuments }) {
  const key = "dnd4e-health-display.integration";
  quench.registerBatch(key, ({ describe, it, assert, beforeEach, afterEach }) => {
    describe("Health display with real DnD4e documents", function () {
      this.timeout(15000);
      let fixtures;
      beforeEach(function () {
        assertTestWorld();
        fixtures = new TestDocuments();
      });
      afterEach(async function () {
        await fixtures?.cleanup();
      });

      it("mounts exactly one hover display during ready", function () {
        assert.lengthOf(document.querySelectorAll("#dnd4e-token-hover-display"), 1);
        assert.isBoolean(game.settings.get("dnd4e-health-display", "shiftEffectDescriptions"));
      });

      it("predicts the same temp HP and HP as native applyDamage", async function () {
        const actor = await fixtures.createActor();
        const projected = projectDamage(actor, 12);
        assert.equal(projected.after, 33);
        assert.equal(projected.tempAfter, 0);
        await actor.applyDamage(12);
        assert.equal(actor.system.attributes.hp.value, projected.after);
        // DnD4e 0.9.3 prepares depleted temporary HP as null rather than numeric zero.
        assert.equal(Number(actor.system.attributes.temphp.value), projected.tempAfter);
        assert.equal(game.actors.get(actor.id).toObject().system.attributes.hp.value, 33);
      });

      it("matches the native negative HP floor", async function () {
        const actor = await fixtures.createActor();
        const projected = projectDamage(actor, 1000);
        await actor.applyDamage(1000);
        assert.equal(projected.after, -20);
        assert.equal(actor.system.attributes.hp.value, projected.after);
      });

      it("renders the real hover template with live actor data", async function () {
        const actor = await fixtures.createActor();
        await actor.update({ "system.attributes.hp.value": 20 });
        const data = getTokenHoverDisplayData({ actor, name: actor.name }, { useEffectDescriptions: false });
        assert.equal(data.healthState, "Bloodied");
        assert.lengthOf(data.segments.filter(segment => segment.filled), 2);
        const html = await foundry.applications.handlebars.renderTemplate(
          "modules/dnd4e-health-display/scripts/health-display/health-display.hbs", data,
        );
        const element = document.createElement("div");
        element.innerHTML = html;
        assert.include(element.textContent, actor.name);
        assert.include(html, "Bloodied");
      });
    });
  }, { displayName: "INFO DISPLAYS: Live health and template integration", preSelected: false });
  return [key, registerTargetAutomationTests(quench)];
}
