import { registerActiveDefenseTests } from "./active-defense.js";

/** Register integration tests against the actual post-init DnD4e configuration. */
export function registerTests(quench, { assertTestWorld, TestDocuments }) {
  const key = "banter-4e-modifications.integration";
  quench.registerBatch(key, ({ describe, it, assert, beforeEach, afterEach }) => {
    describe("Banter system initialization", function () {
      this.timeout(15000);
      let fixtures;
      beforeEach(function () {
        assertTestWorld();
        fixtures = new TestDocuments();
      });
      afterEach(async function () {
        await fixtures?.cleanup();
      });

      it("registers its active-defense setting and conditional runtime", function () {
        const enabled = game.settings.get("banter-4e-modifications", "enable-active-defense");
        assert.isBoolean(enabled);
        if (enabled) {
          assert.exists(game.PlayerDefense, "The active-defense ready hook must initialize PlayerDefense");
        }
      });

      it("installs homebrew skills before the actor data model initializes", async function () {
        const actor = await fixtures.createActor();
        for (const [key, ability] of Object.entries({ cra: "int", soc: "int", banter_rel: "wis", banter_hea: "int" })) {
          assert.equal(CONFIG.DND4E.skills[key]?.ability, ability, `${key} ability`);
          assert.exists(actor.system.skills[key], `${key} must survive real actor schema preparation`);
        }
        for (const key of ["hea", "rel", "his", "stw", "dun"]) {
          assert.notProperty(CONFIG.DND4E.skills, key);
        }
      });
    });
  }, { displayName: "BANTER: Live initialization and actor schema", preSelected: false });
  return [key, registerActiveDefenseTests(quench)];
}
