import { validatePcActorEdit } from "../shared/pc-actor-data.js";
import { canonical } from "./creation-utils.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const pending = new WeakSet();
const snapshot = value => JSON.stringify(canonical(value));
const atPath = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);

/**
 * Flatten only validated fields; trait arrays replace the stored selection.
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
 * Edit stored PC fields after active-GM review, rejecting stale approvals.
 */
export async function editPcActor(args, {
  game = globalThis.game, assertConnection = () => {}, confirm = confirmNpcEdit
} = {}) {
  assertEnabledGM(game);
  validatePcActorEdit(args);
  args = JSON.parse(JSON.stringify(args));
  const { uuid, summary, ...data } = args;
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
      throw new Error("PC edits require a world PC and the paired active GM on DnD4e 0.9.3.");
    }
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another PC actor edit is awaiting confirmation.");
  }
  const source = actor.toObject(true);
  const original = snapshot(source);
  const patch = flatten(data);
  const changes = Object.entries(patch).filter(([path, after]) => snapshot(atPath(source, path)) !== snapshot(after))
    .map(([path, after]) => ({ document: actor.name, uuid, path, before: atPath(source, path), after }));
  const receipt = { uuid, name: actor.name, changes };
  if (!changes.length) {
    return { ...receipt, status: "unchanged" };
  }
  pending.add(game);
  try {
    const approved = await confirm({ name: actor.name, changes, summary,
      title: "Foundry MCP: Confirm PC edit" });
    assertSession();
    if (approved !== true) {
      return { ...receipt, status: "cancelled" };
    }
    if (snapshot(actor.toObject(true)) !== original) {
      throw new Error("PC changed while awaiting confirmation; read source and request a fresh change.");
    }
    let failed = false;
    try {
      await actor.update(Object.fromEntries(changes.map(change => [change.path, change.after])));
    } catch {
      failed = true;
    }
    assertSession();
    const saved = actor.toObject(true);
    const applied = changes.filter(change => snapshot(atPath(saved, change.path)) === snapshot(change.after));
    return { ...receipt, status: failed || applied.length !== changes.length ? "incomplete" : "updated", applied };
  } finally {
    pending.delete(game);
  }
}
