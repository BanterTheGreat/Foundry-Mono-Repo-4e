import { assertTestWorld, getTestFolderId, TestDocuments } from "../../foundry-test-harness/scripts/fixtures.js";

const MODULE = "banter-4e-modifications";
const FLAG = "trigger-prompts";
const HARNESS = "foundry-test-harness";

/** The two attack powers every fixture creature carries: a weapon (melee) one and a ranged one. */
export const WEAPON_ATTACK = "Test Strike";
export const RANGED_ATTACK = "Test Shot";

/** Wait for a specific runtime fact rather than sleeping for hooks and document writes. */
export async function waitForFact(predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

/**
 * Let in-flight hook work finish before asserting that something did NOT happen. Hooks are not
 * awaited by Foundry, so a prompt that is going to appear does so within a few frames.
 */
export const settle = (ms = 700) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Build a power document, optionally carrying trigger assignments in the module's own item flag.
 *
 * @param {string} name
 * @param {{triggers?: Array<string|{triggerId: string, parameters?: object, source?: string}>, opportunity?: boolean, rangeType?: string, trigger?: string}} [options]
 * @returns {object} Item source data.
 */
export function powerData(name, { triggers = [], opportunity = false, rangeType = "weapon", trigger = "" } = {}) {
  const assignments = triggers.map(entry => typeof entry === "string"
    ? { triggerId: entry, parameters: {}, source: "manual" }
    : { parameters: {}, source: "manual", ...entry });
  return {
    name,
    type: "power",
    system: {
      rangeType,
      trigger,
      attack: { isAttack: true, def: "ac", isOpp: opportunity },
      hit: { detail: "The target is struck." },
      miss: { detail: "The target avoids the strike." },
    },
    flags: triggers.length ? { [MODULE]: { [FLAG]: { version: 1, assignments } } } : {},
  };
}

/**
 * A real scene, combat, actors, tokens and chat messages for driving the trigger-prompt hooks.
 *
 * The scene is temporary and viewed by this client only (never activated), so other connected users
 * keep their own view. Every creature is a Player Character: Player Defense only intercepts an NPC
 * attacking a PC, and these tests exercise trigger evaluation, not the defense dialog.
 */
export class TriggerWorld {
  sceneDocuments = new TestDocuments();
  encounterDocuments = null;
  entries = new Map();
  combat = null;

  /**
   * Build the temporary scene and view it, remembering the previous view.
   *
   * @param {{shared?: boolean}} [options]
   *   `shared` also makes the temporary scene the active one for every connected user, because a
   *   player can only see the active scene. The previously active scene is restored by `close()`
   *   (or by `cleanupRuns` if this page is lost). Only documents flagged with this run's ID are
   *   ever deleted.
   */
  static async open({ shared = false } = {}) {
    assertTestWorld();
    if (!game.settings.get(MODULE, "enable-trigger-prompts") || !game.TriggerPrompts) {
      throw new Error("Enable trigger prompts in the test world and reload before running their tests.");
    }
    const world = new TriggerWorld();
    world.openedAt = Date.now();
    world.shared = shared;
    world.previousScene = canvas.scene;
    world.scene = await Scene.create({
      name: `[Integration test ${world.sceneDocuments.runId}] Trigger Prompts`,
      folder: await getTestFolderId("Scene"),
      width: 3000, height: 3000, padding: 0, tokenVision: false, navigation: false,
      grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" },
      flags: { [HARNESS]: { runId: world.sceneDocuments.runId } },
    });
    world.sceneDocuments.documents.push(world.scene);
    if (shared) {
      world.previousActiveSceneId = game.scenes.active?.id ?? null;
      await world.scene.activate();
    } else {
      await world.scene.view();
    }
    await waitForFact(() => canvas.ready && canvas.scene.id === world.scene.id, "the test scene");
    return world;
  }

  /** Restore the previous view and delete everything this world created. */
  async close() {
    await this.endEncounter();
    if (this.shared && this.previousActiveSceneId && game.scenes.has(this.previousActiveSceneId)) {
      // Activating also views the scene, and a second switch while it loads is refused by Foundry.
      await game.scenes.get(this.previousActiveSceneId).activate();
      await waitForFact(() => canvas.ready && canvas.scene?.id === this.previousActiveSceneId, "the previously active scene", 30000);
    } else if (this.previousScene && game.scenes.has(this.previousScene.id)) {
      await this.previousScene.view();
      await waitForFact(() => canvas.ready && canvas.scene.id === this.previousScene.id, "the previous scene");
    }
    await this.sceneDocuments.cleanup();
    await this.sweepMessages(this.openedAt);
  }

  /**
   * Create creatures on the scene and a combat containing them.
   *
   * @param {Array<{key: string, col: number, row: number, type?: string, disposition?: number, width?: number, powers?: object[], hp?: number, ownerId?: string, actorFlags?: object, markedBy?: string}>} layout
   *   `col`/`row` are grid squares. `disposition` is 1 friendly (default) or -1 hostile. `markedBy` names
   *   the creature whose Mark this one carries.
   * @param {{start?: boolean}} [options]
   */
  async encounter(layout, { start = true } = {}) {
    await this.endEncounter();
    this.messageCutoff = Date.now();
    this.encounterDocuments = new TestDocuments();
    for (const spec of layout) {
      const actor = await this.encounterDocuments.createActor({
        type: spec.type ?? "Player Character",
        ownerId: spec.ownerId,
        items: [powerData(WEAPON_ATTACK), powerData(RANGED_ATTACK, { rangeType: "range" }), ...(spec.powers ?? [])],
      });
      if (spec.hp !== undefined) {
        await actor.update({ "system.attributes.hp.value": spec.hp, "system.attributes.hp.max": 40 });
      }
      if (spec.actorFlags) {
        await actor.setFlag(MODULE, FLAG, { assignments: [], ...spec.actorFlags });
      }
      const source = await actor.getTokenDocument({
        name: spec.key, x: 300 + spec.col * 100, y: 300 + spec.row * 100,
        disposition: spec.disposition ?? 1, width: spec.width ?? 1, height: spec.width ?? 1, actorLink: true,
        flags: { [HARNESS]: { runId: this.encounterDocuments.runId } },
      });
      const [token] = await this.scene.createEmbeddedDocuments("Token", [source.toObject()]);
      this.encounterDocuments.documents.push(token);
      this.entries.set(spec.key, { key: spec.key, actor, token });
    }
    // A mark names the marking actor, so it can only be set once every actor exists.
    for (const spec of layout.filter(entry => entry.markedBy)) {
      await this.get(spec.key).actor.update({ "system.marker": this.get(spec.markedBy).actor.uuid });
    }
    this.combat = await Combat.create({ scene: this.scene.id, flags: { [HARNESS]: { runId: this.encounterDocuments.runId } } });
    await this.combat.createEmbeddedDocuments("Combatant", layout.map((spec, index) => {
      const { token, actor } = this.get(spec.key);
      return { tokenId: token.id, sceneId: this.scene.id, actorId: actor.id, initiative: 20 - index };
    }));
    if (start) {
      await this.combat.startCombat();
      await waitForFact(() => game.combat?.id === this.combat.id && game.combat.started, "the started combat");
    }
    return this;
  }

  /** The run IDs that flag every document this world has created, for cleanup from another page. */
  get runIds() {
    return [this.sceneDocuments.runId, this.encounterDocuments?.runId].filter(Boolean);
  }

  /**
   * Delete whatever the given runs left behind, found by their flags rather than by this object.
   * Used when the page that built the fixtures is gone (for example after a test closed the GM).
   * Only documents carrying one of the run IDs are deleted, plus the chat messages the two test
   * accounts posted since `since`, which are test output.
   *
   * @param {{runIds: string[], since: number, accounts?: string[], restoreActiveSceneId?: string|null}} cleanup
   *   `restoreActiveSceneId` is activated again before the fixture scene is deleted.
   */
  static async cleanupRuns({ runIds, since, accounts = [game.user.name], restoreActiveSceneId = null }) {
    assertTestWorld();
    const flagged = document => runIds.includes(document.getFlag(HARNESS, "runId"));
    for (const combat of game.combats.filter(flagged)) {
      await combat.delete();
    }
    // A Foundry Collection has map/filter/reduce but no flatMap.
    const tokens = game.scenes.contents.flatMap(scene => scene.tokens.filter(flagged));
    // Core clears each exiting combatant's token movement history without awaiting it; deleting the
    // tokens first would make that write fail on a missing document.
    await waitForFact(() => tokens.every(token => !token._source._movementHistory?.length), "core to clear token movement history", 5000)
      .catch(() => {});
    await Promise.all(tokens.map(token => token.delete()));
    await new Promise(resolve => setTimeout(resolve, 600));
    for (const actor of game.actors.filter(flagged)) {
      await actor.delete();
    }
    if (restoreActiveSceneId && game.scenes.has(restoreActiveSceneId)) {
      await game.scenes.get(restoreActiveSceneId).activate();
      await waitForFact(() => canvas.ready && canvas.scene?.id === restoreActiveSceneId, "the original scene");
    }
    for (const scene of game.scenes.filter(flagged)) {
      await scene.delete();
    }
    const messages = game.messages.filter(message => flagged(message)
      || (accounts.includes(message.author?.name) && message.timestamp >= since));
    for (let index = 0; index < messages.length; index += 100) {
      await ChatMessage.deleteDocuments(messages.slice(index, index + 100).map(message => message.id));
    }
  }

  /** @returns {{key: string, actor: Actor, token: TokenDocument}} */
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) {
      throw new Error(`No fixture creature "${key}".`);
    }
    return entry;
  }

  /** The id of the named power on a creature. */
  powerId(key, name) {
    return this.get(key).actor.items.find(item => item.name === name).id;
  }

  /**
   * Begin an attack the way the DnD4e roll flow does: the system's `dnd4e.rollAttack` hook. The
   * returned function creates the attack's chat message, which is when the roll total becomes known.
   * Splitting the two lets a test keep several attacks in flight at once. (The native attack dialog
   * and canvas targeting are outside this seam.)
   *
   * @param {string} attackerKey
   * @param {string[]} targetKeys
   * @param {{power?: string, total?: number, natural?: 1|20|null, defense?: number|number[], defenseType?: string, flags?: object}} [options]
   *   `total` against `defense` (one value, or one per target) decides hit or miss unless a natural
   *   1 or 20 is requested.
   * @returns {() => Promise<ChatMessage>}
   */
  startAttack(attackerKey, targetKeys, { power = WEAPON_ATTACK, total = 20, natural = null, defense = 15, defenseType = "ac", flags = {} } = {}) {
    const attacker = this.get(attackerKey);
    const item = attacker.actor.items.find(candidate => candidate.name === power);
    const targets = targetKeys.map(key => this.get(key).token.object);
    if (targets.some(token => !token)) {
      throw new Error("The test tokens are not on the canvas.");
    }
    const speaker = { actor: attacker.actor.id, token: attacker.token.id, scene: this.scene.id };
    Hooks.callAll("dnd4e.rollAttack", item, {
      targets, targDefValArray: targets.map((token, index) => Array.isArray(defense) ? defense[index] : defense),
      targDefArray: targets.map(() => defenseType), targetHit: [], targetMissed: [],
    }, speaker);
    return async () => {
      const roll = natural
        ? await new Roll("1d20").evaluate(natural === 1 ? { minimize: true } : { maximize: true })
        : await new Roll(String(total)).evaluate();
      return this.encounterDocuments.createMessage({ flavor: item.name, speaker, rolls: [roll], flags });
    };
  }

  /** Make a complete attack: the roll hook, then its chat message. */
  async attack(attackerKey, targetKeys, options) {
    return this.startAttack(attackerKey, targetKeys, options)();
  }

  /**
   * Move a token as a real committed move, and wait for Foundry to finish it. Core keeps working
   * on a move after the update resolves (history and stop bookkeeping), so deleting the token
   * straight away makes those later writes fail on a document that no longer exists.
   */
  async move(key, col, row) {
    const { token } = this.get(key);
    await token.update({ x: 300 + col * 100, y: 300 + row * 100 }, { animate: false });
    await Promise.race([token.movement.finished, new Promise(resolve => setTimeout(resolve, 4000))]);
  }

  /** Change hit points through a real actor update. */
  async setHp(key, value) {
    await this.get(key).actor.update({ "system.attributes.hp.value": value });
  }

  /** Make a creature roll a real saving throw that cannot meet (or always meets) its DC. */
  async rollSave(key, { fail = true } = {}) {
    await this.get(key).actor.rollSave(null, null, { dc: fail ? 99 : 1 });
  }

  /** Prompt cards created for this encounter's creatures, optionally for one creature or trigger. */
  prompts({ key, triggerId } = {}) {
    const ids = new Map([...this.entries.values()].map(entry => [entry.actor.id, entry.key]));
    return game.messages.filter(message => {
      const prompt = message.flags?.triggerPrompts;
      return prompt && ids.has(prompt.actorId)
        && (!key || ids.get(prompt.actorId) === key)
        && (!triggerId || prompt.triggerId === triggerId);
    });
  }

  /** Wait until a creature has a prompt for a trigger, and return it. */
  async waitForPrompt(key, triggerId, timeout = 8000) {
    return waitForFact(() => this.prompts({ key, triggerId })[0], `a ${triggerId} prompt for ${key}`, timeout);
  }

  /** Assert-by-return: every prompt currently held, as `key:triggerId` strings. */
  promptSummary() {
    const keys = new Map([...this.entries.values()].map(entry => [entry.actor.id, entry.key]));
    return this.prompts().map(message => `${keys.get(message.flags.triggerPrompts.actorId)}:${message.flags.triggerPrompts.triggerId}`).sort();
  }

  /**
   * Delete the chat messages this client's user created since a moment in time. Starting and
   * ending a combat, changing hit points and rolling saves all make DnD4e and Foundry post their own
   * cards, which no fixture tracks. The harness requires an exclusive active GM, so everything this
   * user posted during a test is test output.
   */
  async sweepMessages(since) {
    await new Promise(resolve => setTimeout(resolve, 400));
    const ids = game.messages.filter(message => message.author?.id === game.user.id && message.timestamp >= since).map(message => message.id);
    for (let index = 0; index < ids.length; index += 100) {
      await ChatMessage.deleteDocuments(ids.slice(index, index + 100));
    }
  }

  /** Delete this encounter's prompts, combat, tokens, actors and messages. */
  async endEncounter() {
    if (!this.encounterDocuments) {
      return;
    }
    for (const message of this.prompts()) {
      if (game.messages.has(message.id)) {
        await message.delete();
      }
    }
    if (this.combat && game.combats.has(this.combat.id)) {
      await this.combat.delete();
    }
    // When a combatant leaves a combat, core clears its token's movement history in a write it does
    // not await. Deleting the tokens first would make that write fail on a missing document.
    const tokens = [...this.entries.values()].map(entry => entry.token).filter(token => token.parent?.tokens.has(token.id));
    await waitForFact(() => tokens.every(token => !token._source._movementHistory?.length), "core to clear token movement history", 5000)
      .catch(() => {});
    await this.encounterDocuments.cleanup();
    await this.sweepMessages(this.messageCutoff);
    this.encounterDocuments = null;
    this.combat = null;
    this.entries.clear();
  }
}
