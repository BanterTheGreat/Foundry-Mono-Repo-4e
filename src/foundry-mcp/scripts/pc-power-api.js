import { MODULE_ID } from "../shared/protocol.js";
import { validatePcPowerEdit } from "../shared/pc-power-data.js";
import { canonical } from "./creation-utils.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const pending = new WeakSet();
const snapshot = value => JSON.stringify(canonical(value));

/**
 * Flatten validated partial objects; arrays replace the whole stored value.
 */
function flatten(value, prefix = "", result = {}) {
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      flatten(entry, path, result);
    } else {
      result[path] = entry;
    }
  }
  return result;
}

/**
 * Edit or add world PC powers after active-GM review of every changed field.
 */
export async function editPcPowers(args, {
  game = globalThis.game, assertConnection = () => {}, confirm = confirmNpcEdit
} = {}) {
  assertEnabledGM(game);
  validatePcPowerEdit(args);
  args = JSON.parse(JSON.stringify(args));
  const { uuid, summary } = args;
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
      throw new Error("Power edits require a world PC and the paired active GM on DnD4e 0.9.3.");
    }
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another PC power edit is awaiting confirmation.");
  }
  const select = () => (args.powers ?? []).map(power => {
    const item = actor.items.get(power.id);
    if (!item || item.parent !== actor || item.toObject(true).type !== "power") {
      throw new Error("Select existing power Items belonging to this world PC.");
    }
    return item;
  });
  const additions = (args.addPowers ?? []).map(({ key, ...power }) => ({
    key, power, fingerprint: snapshot(power), path: `items: add power (${key})`
  }));
  /**
   * Recover persisted additions across retries without accepting changed payloads.
   */
  const findAddition = addition => {
    const matches = [...actor.items.values()].filter(item => {
      const marker = item.toObject(true).flags?.[MODULE_ID]?.pcPowerAddition;
      return marker?.key === addition.key && marker.userId === userId;
    });
    if (matches.length > 1 || matches.some(item => item.toObject(true).type !== "power"
      || item.toObject(true).flags[MODULE_ID].pcPowerAddition.fingerprint !== addition.fingerprint)) {
      throw new Error("Power addition key already used with different data or duplicate receipts.");
    }
    return matches[0];
  };
  const newPowers = additions.filter(addition => !findAddition(addition));
  const addedPowers = () => additions.flatMap(addition => {
    const item = findAddition(addition);
    return item ? [{ key: addition.key, id: item.id, uuid: item.uuid, name: item.name }] : [];
  });
  const targets = select().map((item, index) => {
    const source = item.toObject(true);
    const { id, ...data } = args.powers[index];
    const patch = flatten(data);
    for (const [path, value] of Object.entries(patch)) {
      const before = path.split(".").reduce((entry, key) => entry?.[key], source);
      if (snapshot(before) === snapshot(value)) {
        delete patch[path];
      }
    }
    return { item, source: snapshot(source), patch };
  });
  const atPath = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);
  const changes = targets.flatMap(({ item, source, patch }) => Object.entries(patch).map(([path, after]) => ({
    document: item.name, uuid: item.uuid, path, before: atPath(JSON.parse(source), path), after
  })));
  for (const addition of newPowers) {
    changes.push({ document: addition.power.name, uuid, path: addition.path, before: null, after: addition.power });
  }
  const receipt = { uuid, name: actor.name, changes };
  if (!changes.length) {
    return { ...receipt, status: "unchanged", addedPowers: addedPowers() };
  }
  pending.add(game);
  try {
    const approved = await confirm({ name: actor.name, changes,
      summary: summary ?? `Update or add powers on ${actor.name}.`,
      title: "Foundry MCP: Confirm PC power edits" });
    assertSession();
    if (approved !== true) {
      return { ...receipt, status: "cancelled" };
    }
    const current = select();
    if (targets.some((target, index) => current[index] !== target.item || snapshot(current[index].toObject(true)) !== target.source)) {
      throw new Error("PC powers changed while awaiting confirmation; request a fresh change.");
    }
    if (newPowers.some(addition => findAddition(addition))) {
      throw new Error("PC power additions changed while awaiting confirmation; request a fresh change.");
    }
    let failed = false;
    try {
      const updates = targets.filter(target => Object.keys(target.patch).length)
        .map(target => ({ _id: target.item.id, ...target.patch }));
      if (updates.length) {
        await actor.updateEmbeddedDocuments("Item", updates);
        assertSession();
      }
      for (const addition of newPowers) {
        assertSession();
        if (findAddition(addition)) {
          continue;
        }
        await actor.createEmbeddedDocuments("Item", [{ ...addition.power, type: "power",
          flags: { [MODULE_ID]: { pcPowerAddition: {
            key: addition.key, userId, fingerprint: addition.fingerprint
          } } } }]);
        assertSession();
        if (!findAddition(addition)) {
          throw new Error("Power creation was cancelled.");
        }
      }
    } catch {
      failed = true;
    }
    assertSession();
    const applied = changes.filter(change => {
      const addition = newPowers.find(addition => addition.path === change.path);
      if (addition) {
        return Boolean(findAddition(addition));
      }
      const target = targets.find(target => target.item.uuid === change.uuid);
      return snapshot(atPath(actor.items.get(target.item.id)?.toObject(true), change.path)) === snapshot(change.after);
    });
    return { ...receipt, status: failed || applied.length !== changes.length ? "incomplete" : "updated", applied, addedPowers: addedPowers() };
  } finally {
    pending.delete(game);
  }
}
