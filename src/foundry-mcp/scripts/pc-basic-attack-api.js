import { BASIC_ATTACK_ABILITIES, validatePcBasicAttacks } from "../shared/pc-basic-attack-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const pending = new WeakSet();
const names = ["Melee Basic Attack", "Ranged Basic Attack"];

/**
 * Change both core basic attacks' shared attack/damage ability after approval.
 * Preserve formulas and all unrelated fields; synchronize existing rules labels.
 */
export async function setPcBasicAttackAbility(args, {
  game = globalThis.game, assertConnection = () => {}, confirm = confirmNpcEdit
} = {}) {
  assertEnabledGM(game);
  validatePcBasicAttacks(args);
  const { uuid, ability, summary } = args;
  const worldId = game.world.id;
  const userId = game.user.id;
  const actor = game.actors.get(uuid.slice(6));
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3"
      || !actor || actor.type !== "Player Character" || actor.parent || actor.pack
      || actor.uuid !== uuid || game.actors.get(actor.id) !== actor) {
      throw new Error("Basic attack changes require a world PC and the paired active GM on DnD4e 0.9.3.");
    }
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another basic attack change is awaiting confirmation.");
  }
  const select = () => names.map(name => {
    const matches = Array.from(actor.items.values()).filter(item => item.name === name);
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one ${name}; resolve missing or duplicate powers first.`);
    }
    return matches[0];
  });
  const targets = select().map(item => {
    const source = item.toObject(true);
    if (item.parent !== actor || source.type !== "power" || source.system?.attack?.isBasic !== true
      || ![source.system.attack.formula, source.system.hit?.formula, source.system.hit?.critFormula]
        .every(formula => typeof formula === "string" && formula.includes("@powerMod"))) {
      throw new Error("Only core basic attack powers using @powerMod for attack, damage and critical damage are supported.");
    }
    const patch = {};
    const oldAbility = BASIC_ATTACK_ABILITIES[source.system.attack.ability];
    if (source.system.attack.ability !== ability) {
      patch["system.attack.ability"] = ability;
    }
    for (const [path, text] of [["system.hit.detail", source.system.hit.detail], ["system.description.value", source.system.description?.value]]) {
      if (oldAbility && typeof text === "string") {
        const after = text.replace(new RegExp(`\\b${oldAbility}\\b`, "g"), BASIC_ATTACK_ABILITIES[ability]);
        if (after !== text) {
          patch[path] = after;
        }
      }
    }
    return { item, source: JSON.stringify(source), patch };
  });
  const atPath = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);
  const changes = targets.flatMap(({ item, source, patch }) => Object.entries(patch).map(([path, after]) => ({
    document: item.name, uuid: item.uuid, path, before: atPath(JSON.parse(source), path), after
  })));
  const receipt = { uuid, name: actor.name, ability, changes };
  if (!changes.length) {
    return { ...receipt, status: "unchanged" };
  }
  pending.add(game);
  try {
    const approved = await confirm({ name: actor.name, changes,
      summary: summary ?? `Use ${BASIC_ATTACK_ABILITIES[ability]} for attack and damage on both of ${actor.name}'s basic attacks.`,
      title: "Foundry MCP: Confirm PC basic attacks" });
    assertSession();
    if (approved !== true) {
      return { ...receipt, status: "cancelled" };
    }
    const current = select();
    if (targets.some((target, index) => current[index] !== target.item || JSON.stringify(current[index].toObject(true)) !== target.source)) {
      throw new Error("Basic attacks changed while awaiting confirmation; request a fresh change.");
    }
    let failed = false;
    try {
      await actor.updateEmbeddedDocuments("Item", targets.filter(target => Object.keys(target.patch).length)
        .map(target => ({ _id: target.item.id, ...target.patch })));
    } catch {
      failed = true;
    }
    assertSession();
    const applied = changes.filter(change => {
      const target = targets.find(target => target.item.uuid === change.uuid);
      return atPath(actor.items.get(target.item.id)?.toObject(true), change.path) === change.after;
    });
    return { ...receipt, status: failed || applied.length !== changes.length ? "incomplete" : "updated", applied };
  } finally {
    pending.delete(game);
  }
}
