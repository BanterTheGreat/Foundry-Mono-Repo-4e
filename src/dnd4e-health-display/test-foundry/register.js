import { projectDamage } from "../scripts/power-activation/damage-application-data.js";
import { getTokenHoverDisplayData } from "../scripts/health-display/token-hover-display-data.js";
import { registerTargetAutomationTests } from "./target-automation.js";
import { getNpcPowerHints } from "../scripts/actor-display/npc-power-hints.js";

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

      it("renders compact NPC hints and retains right-side traits with native powers", async function () {
        const actor = await fixtures.createActor({ items: [{ name: "Storm test", type: "power", system: {
          actionType: "minor", attack: { isAttack: true, def: "ref" },
          hit: { detail: "The target is dazed (save ends)." },
        } }] });
        const pc = await fixtures.createActor({ type: "Player Character" });
        const defense = ["fort", "ref", "wil"].reduce((lowest, key) =>
          pc.system.defences[key].value < pc.system.defences[lowest].value ? key : lowest, "fort");
        const power = actor.items.find(item => item.type === "power");
        await power.update({ "system.attack.def": defense });
        const source = { document: { disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE } };
        const hints = getNpcPowerHints(power, source, [{ actor: pc, name: "Mira <test>" }]);
        assert.equal(hints.actionLabel, "Minor");
        assert.equal(hints.conditionSummary, game.i18n.localize(CONFIG.statusEffects.find(status => status.id === "dazed").name));
        assert.equal(hints.weakSummary, "Mira <test>");
        const render = async data => {
          const html = await foundry.applications.handlebars.renderTemplate(
            "modules/dnd4e-health-display/scripts/actor-display/actor-display.hbs", {
              isNpcSheet: true, name: actor.name, selectedCategory: { name: "Sheet", powers: [{
                id: power.id, name: power.name, ...data,
              }] }, npcFeatures: [{ name: "Stormborn", html: "Trait rules" }],
            });
          const element = document.createElement("div");
          element.innerHTML = html;
          return element;
        };
        const element = await render(hints);
        const row = element.querySelector(".dnd4e-actor-display__power");
        assert.include(row.textContent, "Minor");
        assert.include(row.textContent, "Mira <test>");
        assert.notInclude(row.textContent, "Weak:");
		assert.isNotNull(row.querySelector(".dnd4e-actor-display__npc-power-copy > i"));
		assert.isNotNull(row.querySelector(".dnd4e-actor-display__npc-power-title > .dnd4e-actor-display__npc-power-conditions"));
		assert.isNotNull(row.querySelector(".dnd4e-actor-display__npc-power-usage > .dnd4e-actor-display__npc-power-weak"));
        assert.isNull(row.querySelector("test"), "PC names are escaped");
        assert.lengthOf(element.querySelectorAll(".dnd4e-actor-display__sheet-columns > section"), 2);
        assert.include(element.querySelector(".dnd4e-actor-display__feats").textContent, "Stormborn");
        source.document.disposition = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
        const friendly = await render(getNpcPowerHints(power, source, [{ actor: pc }]));
        assert.isNull(friendly.querySelector(".dnd4e-actor-display__npc-power-weak"));
        assert.isNotNull(friendly.querySelector(".dnd4e-actor-display__npc-power-conditions"));
      });
    });
  }, { displayName: "INFO DISPLAYS: Live health and template integration", preSelected: false });
  return [key, registerTargetAutomationTests(quench)];
}
