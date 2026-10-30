import { TargetAutomationFixture, basePower, waitForFact } from "./target-automation-fixture.js";

const MODULE = "dnd4e-health-display";

/** Exercise the production ApplicationV2 listeners, templates and document hooks. */
export function registerActorHudTests(quench) {
  const key = `${MODULE}.actor-hud`;
  quench.registerBatch(key, ({ describe, it, assert, before, after, beforeEach, afterEach }) => {
    describe("Actor HUD menus and controls", function () {
      this.timeout(45000);
      let fixture;
      let previousEnabled;
      let hud;
      let actor;
      let initialApps;
      let chatHook;

      /** Include legacy DnD4e sheets as well as ApplicationV2 windows. */
      function applications() {
        return new Set([...foundry.applications.instances.values(), ...Object.values(ui.windows)]);
      }

      /** Click a real action and wait for its replacement DOM after rendering. */
      async function click(selector) {
        const button = hud.element.querySelector(selector);
        assert.isNotNull(button, selector);
        assert.isFalse(button.disabled, `${selector} is enabled`);
        const marker = hud.element.querySelector("nav");
        button.click();
        await waitForFact(() => hud.element.querySelector("nav") !== marker, `HUD render after ${selector}`);
      }

      /** Select a fixture token through Foundry's normal controlToken hook. */
      async function select(token) {
        token.control({ releaseOthers: true });
        hud = await waitForFact(() => ui.Dnd4eActorDisplay?.actor?.id === token.actor.id
          && ui.Dnd4eActorDisplay, "controlled actor HUD");
        await hud.render({ force: true });
        actor = token.actor;
      }

      /** Add identifiable entries covering every power action group and both feature layouts. */
      async function populate(target) {
        await target.createEmbeddedDocuments("Item", [
          ...["standard", "minor", "reaction", "move"].map(actionType =>
            foundry.utils.mergeObject(foundry.utils.deepClone(basePower), {
              name: `HUD ${actionType}`, system: { actionType, attack: { isBasic: actionType === "standard" } },
            })),
          { name: "HUD feat", type: "feature", system: { featureType: "feat", description: { value: "<p>HUD feat rules</p>" } } },
          { name: "HUD trait", type: "feature", system: { featureType: "trait", description: { value: "<p>HUD trait rules</p>" } } },
          { name: "HUD sword", type: "weapon", system: { equipped: false } },
        ]);
      }

      before(async function () {
        previousEnabled = game.settings.get(MODULE, "showHorizontalActorDisplay");
        fixture = await new TargetAutomationFixture().setup();
        await game.settings.set(MODULE, "showHorizontalActorDisplay", true);
        await populate(fixture.actors.caster);
        await populate(fixture.actors.enemy);
        chatHook = Hooks.on("preCreateChatMessage", (message, data, options) => {
          if ([fixture.actors.caster, fixture.actors.enemy].some(candidate =>
            message.speaker.actor === candidate.id || message.content?.includes(candidate.name))) {
            message.updateSource({ "flags.foundry-test-harness.runId": fixture.documents.runId });
            options.notify = false;
          }
        });
      });
      after(async function () {
        try {
          if (chatHook !== undefined) {
            Hooks.off("preCreateChatMessage", chatHook);
          }
          await fixture?.cleanup();
        } finally {
          if (previousEnabled !== undefined) {
            await game.settings.set(MODULE, "showHorizontalActorDisplay", previousEnabled);
          }
        }
      });
      beforeEach(async function () {
        initialApps = applications();
        await select(fixture.tokens.caster);
        hud.onClosePowers();
        await hud.render({ force: true });
      });
      afterEach(async function () {
        // Close only windows opened by this test, including native sheets/dialogs.
        for (const app of applications()) {
          if (!initialApps.has(app) && app !== ui.Dnd4eActorDisplay && app !== ui.Dnd4eActorPortrait) {
            await app.close({ animate: false });
          }
        }
        await fixture.cancel();
      });

      for (const [category, action] of [["standard", "standard"], ["minor", "minor"], ["reaction", "reaction"], ["other", "move"]]) {
        it(`opens, closes and renders the PC ${category} power group`, async function () {
          const selector = `[data-power-category="${category}"]`;
          await click(selector);
          assert.equal(hud.element.querySelector(selector).getAttribute("aria-expanded"), "true");
          assert.include(hud.element.querySelector(".dnd4e-actor-display__popup").textContent, `HUD ${action}`);
          await click(selector);
          assert.isNull(hud.element.querySelector(".dnd4e-actor-display__popup"));
          assert.equal(hud.element.querySelector(selector).getAttribute("aria-expanded"), "false");
        });
      }

      for (const type of ["caster", "enemy"]) {
        for (const tab of ["skills", "items", "extras", ...(type === "caster" ? ["features"] : [])]) {
          it(`renders and closes ${type === "caster" ? "PC" : "NPC"} ${tab}`, async function () {
            await select(fixture.tokens[type]);
            await click(`[data-display-tab="${tab}"]`);
            assert.equal(hud.element.querySelector(`[data-display-tab="${tab}"]`).getAttribute("aria-expanded"), "true");
            if (tab === "extras") {
              assert.sameMembers([...hud.element.querySelectorAll(".is-character-menu [data-command]")]
                .map(button => button.dataset.command), ["secondWind", "healing", "savingThrow", "deathSave", "shortRest", "extendedRest"]);
            } else {
              const entries = [...hud.element.querySelectorAll("[data-hud-entry]")];
              assert.isAbove(entries.length, 0);
              const search = hud.element.querySelector("[data-hud-search]");
              search.value = "no such HUD entry";
              search.dispatchEvent(new Event("input", { bubbles: true }));
              assert.isTrue(entries.every(entry => entry.hidden));
              assert.isFalse(hud.element.querySelector("[data-hud-search-empty]").hidden);
              search.value = entries[0].dataset.hudEntry.toUpperCase();
              search.dispatchEvent(new Event("input", { bubbles: true }));
              assert.isFalse(entries[0].hidden, "search ignores case");
              search.value = "";
              search.dispatchEvent(new Event("input", { bubbles: true }));
              assert.isTrue(entries.every(entry => !entry.hidden));
            }
            await click('[data-action="closePowers"]');
            assert.isNull(hud.element.querySelector(".dnd4e-actor-display__popup"));
          });
        }
      }

      it("opens the NPC Sheet automatically, groups basic attacks and shows trait disclosures", async function () {
        await select(fixture.tokens.enemy);
        assert.isNotNull(hud.element.querySelector(".is-npc-sheet"));
        assert.lengthOf(hud.element.querySelectorAll("[data-power-category]"), 0);
        assert.isNull(hud.element.querySelector('[data-display-tab="features"]'));
        assert.deepEqual([...hud.element.querySelectorAll(".dnd4e-actor-display__npc-power-group")]
          .map(node => node.textContent), ["Basic Attacks", "Other Powers"]);
        const details = hud.element.querySelector("details");
        assert.isTrue(details.open, "two traits start expanded");
        assert.include(hud.element.querySelector(".dnd4e-actor-display__feats").textContent, "HUD trait");
        details.querySelector("summary").click();
        assert.isFalse(details.open);
        await click('[data-display-tab="sheet"]');
        assert.isNull(hud.element.querySelector(".is-npc-sheet"));
        await click('[data-display-tab="sheet"]');
        assert.isNotNull(hud.element.querySelector(".is-npc-sheet"));
      });

      for (const type of ["caster", "enemy"]) {
        it(`persists equipment toggles and resource edits for ${type}`, async function () {
          await select(fixture.tokens[type]);
          const sword = actor.items.find(item => item.name === "HUD sword");
          await sword.update({ "system.equipped": false });
          await hud.render({ force: true });
          await click('[data-display-tab="items"]');
          const selector = `[data-action="toggleEquip"][data-item-id="${sword.id}"]`;
          for (const expected of [true, false]) {
            await click(selector);
            await waitForFact(() => sword.system.equipped === expected, "persisted equipment");
            assert.equal(hud.element.querySelector(selector).getAttribute("aria-pressed"), String(expected));
          }
          const portrait = ui.Dnd4eActorPortrait;
          for (const [path, value] of [["system.attributes.hp.value", 31], ["system.attributes.temphp.value", 8]]) {
            await portrait.render({ force: true });
            const input = portrait.element.querySelector(`[data-resource-path="${path}"]`);
            assert.isNotNull(input);
            input.value = String(value);
            input.dispatchEvent(new Event("blur"));
            await waitForFact(() => foundry.utils.getProperty(actor, path) === value, `persisted ${path}`);
          }
        });
      }

      it("closes menus with Escape and outside pointer events, and resets state on token changes", async function () {
        await click('[data-display-tab="skills"]');
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await waitForFact(() => !hud.element.querySelector(".dnd4e-actor-display__popup"), "Escape close");
        await click('[data-power-category="minor"]');
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        await waitForFact(() => !hud.element.querySelector(".dnd4e-actor-display__popup"), "outside close");
        await select(fixture.tokens.enemy);
        assert.isNotNull(hud.element.querySelector(".is-npc-sheet"));
        await select(fixture.tokens.caster);
        assert.isNull(hud.element.querySelector(".dnd4e-actor-display__popup"));
        assert.lengthOf(document.querySelectorAll("#dnd4e-actor-display"), 1);
        assert.lengthOf(document.querySelectorAll("#dnd4e-horizontal-actor-display"), 1);
      });

      it("opens the native actor sheet from the portrait", async function () {
        ui.Dnd4eActorPortrait.element.querySelector('[data-command="openSheet"]').click();
        await waitForFact(() => actor.sheet.rendered, "actor sheet");
        assert.isTrue(actor.sheet.rendered);
      });

      for (const type of ["caster", "enemy"]) {
        it(`updates action-point and death-save availability for ${type}`, async function () {
          await select(fixture.tokens[type]);
          await actor.update({ "system.actionpoints.value": 0, "system.attributes.hp.value": 20 });
          await hud.render({ force: true });
          assert.isTrue(hud.element.querySelector('[data-command="actionPoint"]').disabled);
          await click('[data-display-tab="extras"]');
          assert.isTrue(hud.element.querySelector('[data-command="deathSave"]').disabled);
          await actor.update({ "system.actionpoints.value": 1, "system.attributes.hp.value": 0 });
          await hud.render({ force: true });
          assert.isFalse(hud.element.querySelector('[data-command="actionPoint"]').disabled);
          assert.isFalse(hud.element.querySelector('[data-command="deathSave"]').disabled);
          await actor.update({ "system.attributes.hp.value": 40 });
        });

        for (const command of ["healing", "savingThrow", "shortRest", "extendedRest"]) {
          it(`opens the native ${command} dialog for ${type}`, async function () {
            await select(fixture.tokens[type]);
            await click('[data-display-tab="extras"]');
            const existing = applications();
            hud.element.querySelector(`.is-character-menu [data-command="${command}"]`).click();
            const dialog = await waitForFact(() => [...applications()].find(app =>
              !existing.has(app) && app.rendered), `${command} dialog`);
            assert.isTrue(dialog.rendered);
            await dialog.close({ animate: false });
          });
        }

        it(`rolls a skill through its rendered ${type} button`, async function () {
          await select(fixture.tokens[type]);
          await click('[data-display-tab="skills"]');
          const messages = new Set(game.messages.keys());
          hud.element.querySelector('[data-action="skill"]').click();
          const message = await waitForFact(() => game.messages.find(entry =>
            !messages.has(entry.id) && entry.speaker.actor === actor.id), "native skill roll");
          assert.isAbove(message.rolls.length, 0);
        });

        it(`refreshes a spent ${type} power and opens its sheet on right-click`, async function () {
          await select(fixture.tokens[type]);
          const power = actor.items.find(item => item.name === "HUD standard");
          await power.update({ "system.uses.value": 0 });
          await hud.render({ force: true });
          if (type === "caster") {
            await click('[data-power-category="standard"]');
          }
          const rowSelector = `.dnd4e-actor-display__power[data-item-id="${power.id}"]`;
          assert.isTrue(hud.element.querySelector(`${rowSelector} [data-action="power"]`).disabled);
          await click(`${rowSelector} [data-action="refreshPower"]`);
          await waitForFact(() => Number(power.system.uses.value) === Number(power.system.uses.max), "restored power uses");
          await waitForFact(() => !hud.element.querySelector(`${rowSelector} [data-action="refreshPower"]`), "spent control removed");
          assert.isFalse(hud.element.querySelector(`${rowSelector} [data-action="power"]`).disabled);
          // Refresh also awaits a private GM notification; wait before fixture cleanup.
          await waitForFact(() => game.messages.some(message => message.content?.includes("refreshed")
            && message.content.includes(actor.name) && message.content.includes(power.name)), "refresh whisper");
          hud.element.querySelector(rowSelector).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
          await waitForFact(() => power.sheet.rendered, "power sheet");
          assert.isTrue(power.sheet.rendered);
        });

        it(`uses the ${type} power button to enter Target Automation`, async function () {
          await select(fixture.tokens[type]);
          const power = actor.items.find(item => item.name === "HUD minor");
          if (type === "caster") {
            await click('[data-power-category="minor"]');
          }
          hud.element.querySelector(`[data-action="power"][data-item-id="${power.id}"]`).click();
          const session = await waitForFact(() => [...applications()].find(app =>
            app.session?.item.uuid === power.uuid)?.session, "power activation");
          fixture.activation = session;
          assert.equal(session.item.uuid, power.uuid);
          assert.isNull(hud.element.querySelector(".dnd4e-actor-display__popup"));
          await fixture.cancel();
        });

        it(`sends a ${type} power to chat without spending its use`, async function () {
          await select(fixture.tokens[type]);
          const power = actor.items.find(item => item.name === "HUD reaction");
          const uses = power.system.uses.value;
          const messages = new Set(game.messages.keys());
          if (type === "caster") {
            await click('[data-power-category="reaction"]');
          }
          hud.element.querySelector(`[data-action="chatPower"][data-item-id="${power.id}"]`).click();
          const message = await waitForFact(() => game.messages.find(entry =>
            !messages.has(entry.id) && entry.content?.includes(power.name)), "power chat card");
          assert.include(message.content, power.name);
          assert.equal(power.system.uses.value, uses);
          assert.isNull(hud.element.querySelector(".dnd4e-actor-display__popup"));
        });

        it(`opens the ${type} feature and inventory sheets from their controls`, async function () {
          await select(fixture.tokens[type]);
          const feature = actor.items.find(item => item.name === "HUD feat");
          if (type === "caster") {
            await click('[data-display-tab="features"]');
            hud.element.querySelector(`[data-action="feature"][data-item-id="${feature.id}"]`)
              .dispatchEvent(new MouseEvent("auxclick", { button: 2, bubbles: true, cancelable: true }));
          } else {
            hud.element.querySelector(`[data-action="openFeatSheet"][data-item-id="${feature.id}"]`).click();
          }
          await waitForFact(() => feature.sheet.rendered, "feature sheet");
          await feature.sheet.close({ animate: false });
          await click('[data-display-tab="items"]');
          const sword = actor.items.find(item => item.name === "HUD sword");
          hud.element.querySelector(`[data-action="item"][data-item-id="${sword.id}"]`)
            .dispatchEvent(new MouseEvent("auxclick", { button: 2, bubbles: true, cancelable: true }));
          await waitForFact(() => sword.sheet.rendered, "inventory sheet");
          assert.isTrue(sword.sheet.rendered);
        });
      }
    });
  }, { displayName: "INFO DISPLAYS: Actor HUD tabs and controls", preSelected: false });
  return key;
}
