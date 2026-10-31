import { useAbility } from "../scripts/power-activation/power-activation.js";
import { applyTargetDamage } from "../scripts/power-activation/damage-application-data.js";
import { TargetAutomationFixture, basePower, waitForFact } from "./target-automation-fixture.js";

const MODULE = "dnd4e-health-display";

/** Seed evaluated results at the damage-review boundary; all documents and UI actions remain real. */
async function openDamageReview(fixture, npcAttack, outcome) {
  const source = npcAttack ? fixture.tokens.enemy : fixture.tokens.caster;
  const target = npcAttack ? fixture.tokens.caster : fixture.tokens.enemy;
  const [item] = await source.actor.createEmbeddedDocuments("Item", [foundry.utils.mergeObject(
    foundry.utils.deepClone(basePower), { system: { attack: { isAttack: true }, hit: { isDamage: true } } },
  )]);
  source.control({ releaseOthers: true });
  await useAbility(item, source);
  const session = await waitForFact(() => [...foundry.applications.instances.values()]
    .find(app => app.session?.item.uuid === item.uuid)?.session, "damage test activation");
  fixture.activation = session;
  session.targets = [target];
  session.committed = true;
  session.requiredDamageTypes = outcome === "miss" ? [] : ["normal"];
  const speaker = { actor: source.actor.id, token: source.id, scene: fixture.scene.id };
  const roll = await new Roll("20").evaluate();
  roll.options.multirollData = { targetID: target.id, hitstate: outcome, critstate: "normal" };
  const attack = await ChatMessage.create({ speaker, content: "Confirmed fixture attack", rolls: [roll],
    flags: { [MODULE]: { attackResults: { sessionId: session.id, sceneId: fixture.scene.id,
      itemUuid: item.uuid, targetIds: [target.id], pending: false } } } }, { notify: false });
  session.attackMessages = [attack];
  if (outcome !== "miss") {
    const damage = await ChatMessage.create({ speaker, content: "Fixture damage", rolls: [await new Roll("12").evaluate()],
      flags: { [MODULE]: { damageReview: { sessionId: session.id, type: "normal", pending: true } } } }, { notify: false });
    session.damageMessages = [damage];
  }
  for (const state of ["attackDialog", "preparingResults", "reviewingResults", "confirmingResults", "readyForDamage",
    "rollingDamage", "reviewingDamage"]) {
    session.transition(state);
  }
  await session.panel.render({ force: true });
  return { session, target, attack };
}

/** Cover damage confirmation through real hooks, native HP mutation and the production button. */
export function registerDamageConfirmationTests(quench) {
  const key = "dnd4e-health-display.damage-confirmation";
  quench.registerBatch(key, ({ describe, it, assert, beforeEach, afterEach }) => {
    describe("GM damage confirmation", function () {
      this.timeout(45000);
      let fixture;
      let reviewRenders;
      let renderHook;
      beforeEach(async function () {
        fixture = await new TargetAutomationFixture().setup();
        reviewRenders = [];
        renderHook = Hooks.on("renderDamageApplicationPanel", app => reviewRenders.push(app));
      });
      afterEach(async function () {
        Hooks.off("renderDamageApplicationPanel", renderHook);
        try {
          for (const app of [...foundry.applications.instances.values()]) {
            if (app.message?.flags?.[MODULE]?.damageApplication?.sceneId === fixture?.scene?.id) {
              await app.close();
            }
          }
        } finally {
          await fixture?.cleanup();
        }
      });

      for (const outcome of ["hit", "miss"]) {
        it(`NPC → PC ${outcome} applies directly with no approval popup and no duplicate damage`, async function () {
          const { session, target, attack } = await openDamageReview(fixture, true, outcome);
          const hp = target.actor.system.attributes.hp.value;
          const temp = Number(target.actor.system.attributes.temphp.value);
          const button = session.panel.element.querySelector('[data-action="confirmDamage"]');
          assert.exists(button, "the production Apply Damage action is available");
          button.click();
          button.click();
          await waitForFact(() => session.state === "complete", "direct damage confirmation");
          const receipt = attack.flags[MODULE].damageApplications?.[target.id];
          assert.equal(receipt?.state, "applied");
          assert.equal(receipt.amount, outcome === "hit" ? 12 : 0);
          assert.equal(target.actor.system.attributes.hp.value, outcome === "hit" ? hp - Math.max(0, 12 - temp) : hp);
          assert.equal(Number(target.actor.system.attributes.temphp.value), outcome === "hit" ? Math.max(0, temp - 12) : temp);
          assert.lengthOf(reviewRenders, 0, "no transient approval dialog was rendered");
          await applyTargetDamage(attack, target.id);
          assert.equal(target.actor.system.attributes.hp.value, receipt.health.after, "persisted receipt prevents repeat application");
          assert.equal(Number(target.actor.system.attributes.temphp.value), receipt.health.tempAfter);
          assert.equal(attack.flags[MODULE].damageApplication.dismissed, true);
        });
      }

      it("PC → NPC keeps HP unchanged until the GM approves", async function () {
        const { session, target, attack } = await openDamageReview(fixture, false, "hit");
        const hp = target.actor.system.attributes.hp.value;
        const temp = Number(target.actor.system.attributes.temphp.value);
        session.panel.element.querySelector('[data-action="confirmDamage"]').click();
        await waitForFact(() => session.state === "complete" && reviewRenders.length, "GM approval popup");
        assert.equal(target.actor.system.attributes.hp.value, hp);
        assert.equal(Number(target.actor.system.attributes.temphp.value), temp);
        assert.notExists(attack.flags[MODULE].damageApplications?.[target.id]);
        const review = reviewRenders.at(-1);
        await waitForFact(() => review.element?.querySelector('[data-action="applyAll"]'), "approval action");
        review.element.querySelector('[data-action="applyAll"]').click();
        await waitForFact(() => attack.flags[MODULE].damageApplications?.[target.id]?.state === "applied", "approved damage");
        assert.equal(target.actor.system.attributes.hp.value, hp - Math.max(0, 12 - temp));
      });
    });
  }, { displayName: "INFO DISPLAYS: GM direct damage and approval", preSelected: false });
  return key;
}
