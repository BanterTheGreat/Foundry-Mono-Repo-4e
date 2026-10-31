import { assertTestWorld, getTestFolderId, TestDocuments } from "../../foundry-test-harness/scripts/fixtures.js";
import { useAbility } from "../scripts/power-activation/power-activation.js";

const MODULE = "dnd4e-health-display";
export const basePower = {
  name: "Target Automation integration power", type: "power",
  flags: { [MODULE]: { targetAutomation: { enabled: true, targetCount: 1 } } },
  system: { rangeType: "range", rangePower: "5", range: { long: null }, weaponUse: "none", weaponType: "none",
    attack: { isAttack: false, formula: "100", def: "ac" },
    hit: { isDamage: false, isHealing: false, healFormula: "", formula: "7", critFormula: "14", detail: "Test damage." },
    miss: { halfDamage: false, formula: "" }, uses: { value: 2, max: "2", per: "encounter" } },
};

/** Wait for a specific runtime fact rather than sleeping for rendering or canvas work. */
export async function waitForFact(predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

/** A sandbox scene with real actors, powers and tokens, entered through the public activation API. */
export class TargetAutomationFixture {
  documents = new TestDocuments();
  tokens = {};
  actors = {};

  /** Build an isolated square-grid battlefield and remember the user's previous client state. */
  async setup() {
    assertTestWorld();
    this.previousScene = canvas.scene;
    this.previousControlled = canvas.tokens.controlled.map(token => token.id);
    this.previousTargets = [...game.user.targets].map(token => token.id);
    this.previousEnabled = game.settings.get(MODULE, "enablePowerTargetAutomation");
    try {
      this.scene = await Scene.create({
        name: `[Integration test ${this.documents.runId}] Target Automation`,
        folder: await getTestFolderId("Scene"),
        width: 3000, height: 3000, padding: 0, tokenVision: false, navigation: false,
        grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" },
        flags: { "foundry-test-harness": { runId: this.documents.runId } },
      });
      this.documents.documents.push(this.scene);
      await this.scene.view();
      await waitForFact(() => canvas.ready && canvas.scene.id === this.scene.id, "test scene");
      await game.settings.set(MODULE, "enablePowerTargetAutomation", true);
      const caster = await this.documents.createActor({ type: "Player Character", items: [basePower, {
        name: "Test reach spear", type: "weapon", system: { equipped: true, weaponType: "simpleM",
          properties: { rch: true, thv: true }, range: { value: 5, long: 10 } },
      }] });
      this.actors.caster = caster;
      this.item = caster.itemTypes.power[0];
      this.weapon = caster.itemTypes.weapon[0];
      const roster = [
        ["caster", caster, 1000, 1000, 1, 0, 1],
        ["enemy", null, 1100, 1000, -1, 0, 1],
        ["ally", null, 1000, 1100, 1, 0, 1],
        ["neutral", null, 900, 1000, 0, 0, 1],
        ["far", null, 1700, 1000, -1, 0, 1],
        ["large", null, 1300, 1000, -1, 0, 2],
        ["elevated", null, 1000, 900, -1, 10, 1],
        ["slowed", null, 1100, 1100, -1, 0, 1],
        ["companion", null, 700, 1000, 1, 0, 1],
      ];
      for (const [key, existing, x, y, disposition, elevation, width] of roster) {
        const actor = existing ?? await this.documents.createActor({ effects: key === "slowed"
          ? [{ name: "Test slowed", statuses: ["slowed"] }] : [] });
        this.actors[key] = actor;
        const source = await actor.getTokenDocument({ name: key, x, y, disposition, elevation, width, height: width,
          actorLink: true, flags: { "foundry-test-harness": { runId: this.documents.runId } } });
        const [token] = await this.scene.createEmbeddedDocuments("Token", [source.toObject()]);
        this.documents.documents.push(token);
        this.tokens[key] = token.object;
      }
      // Scope every generated card/roll to fixture actors, including native asynchronous messages.
      const ids = new Set(Object.values(this.actors).map(actor => actor.id));
      this.preCreate = Hooks.on("preCreateChatMessage", (message, data, options) => {
        if (ids.has(message.speaker.actor)) {
          message.updateSource({ "flags.foundry-test-harness.runId": this.documents.runId });
          options.notify = false;
        }
      });
      this.created = Hooks.on("createChatMessage", message => {
        if (message.getFlag("foundry-test-harness", "runId") === this.documents.runId) {
          this.documents.documents.push(message);
        }
      });
      this.tokens.caster.control({ releaseOthers: true });
      return this;
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  /** Use a schema-prepared clone for read-only range/config cases without database writes. */
  power(system = {}, config = {}) {
    return this.item.clone({ system, flags: { [MODULE]: { targetAutomation: { enabled: true, targetCount: 1, ...config } } } }, { keepId: true });
  }

  /** Start a real session from reset persisted configuration, without patching its controller. */
  async open({ system = {}, config = {}, targets = [] } = {}) {
    await this.cancel();
    await this.item.update({ system: foundry.utils.mergeObject(foundry.utils.deepClone(basePower.system), system, { inplace: false }),
      [`flags.${MODULE}.targetAutomation`]: { enabled: true, targetCount: 1, targetMode: "area", targetDisposition: "all",
        includeCaster: false, targetCondition: "", targetAdjacent: "", placementMode: "targets", originMode: "character",
        originActors: [], allowCaster: true, placeRegion: false, wallSolid: false, wallHeight: 1, ...config } });
    for (const token of [...game.user.targets]) {
      token.setTarget(false, { releaseOthers: false });
    }
    for (const key of targets) {
      this.tokens[key].setTarget(true, { releaseOthers: false });
    }
    this.tokens.caster.control({ releaseOthers: true });
    await useAbility(this.item, this.tokens.caster);
    this.activation = await waitForFact(() => [...foundry.applications.instances.values()]
      .find(app => app.session?.item.uuid === this.item.uuid)?.session, "Target Automation panel");
    await this.activation.panel.render({ force: true });
    return this.activation;
  }

  /** Cancel the current public activation before starting the next case or cleaning up. */
  async cancel() {
    if (this.activation && !this.activation.finished) {
      await this.activation.cancel();
    }
    this.activation = null;
    await game.modules.get(MODULE).powerActivation.cancel();
  }

  /** Restore the original view/settings and delete only fixture-owned documents. */
  async cleanup() {
    const failures = [];
    try {
      await this.cancel();
    } catch (error) {
      failures.push(error);
    }
    for (const [hook, id] of [["preCreateChatMessage", this.preCreate], ["createChatMessage", this.created]]) {
      if (id !== undefined) {
        Hooks.off(hook, id);
      }
    }
    // Cancel removes provisional cards itself; omit those already deleted from our ledger.
    this.documents.documents = this.documents.documents.filter(document => document.documentName !== "ChatMessage" || game.messages.has(document.id));
    try {
      if (this.previousScene && game.scenes.has(this.previousScene.id)) {
        await this.previousScene.view();
      }
      if (this.previousEnabled !== undefined) {
        await game.settings.set(MODULE, "enablePowerTargetAutomation", this.previousEnabled);
      }
      await this.documents.cleanup();
      for (const id of this.previousControlled ?? []) {
        canvas.tokens.get(id)?.control({ releaseOthers: false });
      }
      for (const id of this.previousTargets ?? []) {
        canvas.tokens.get(id)?.setTarget(true, { releaseOthers: false });
      }
    } catch (error) {
      failures.push(error);
    }
    if (failures.length) {
      throw new AggregateError(failures, failures.map(error => error.message).join("; "));
    }
  }
}
