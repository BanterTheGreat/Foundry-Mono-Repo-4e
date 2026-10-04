import { EDIT_CONFIRM_TIMEOUT_MS, MAX_MESSAGE_BYTES, MODULE_ID } from "../shared/protocol.js";
import { validateNpcEdit } from "../shared/npc-data.js";
import { assertEnabledGM } from "./read-api.js";

const pending = new WeakSet();

/**
 * Native DnD4e 0.9.3 on-hit Mark template. Effect changes belong to system,
 * and use string change types in this pinned version. Source data resolves
 * @charaUID to the attacking actor when the system applies it to a target.
 * No caller-supplied effect source, flags or executable content is accepted.
 */
function hitMarkData(item) {
  return {
    name: `Marked (${item.name})`, type: "base",
    img: "systems/dnd4e/icons/statusEffects/mark_1.svg",
    description: "Marked until the end of the marking creature's next turn.",
    origin: item.uuid, disabled: false, transfer: false, statuses: ["mark"], showIcon: 2,
    system: {
      durationType: "endOfUserTurn", powerEffectType: "hit", useSourceActorData: true,
      changes: [{ key: "system.marker", type: "override", value: "@charaUID", priority: null }]
    },
    flags: { [MODULE_ID]: { hitMark: true } }
  };
}

/**
 * A persisted marker makes effect creation safe to retry after disconnects.
 * Reject altered managed effects rather than adding a second on-hit mark.
 */
function findHitMark(item) {
  const matches = Array.from(item.effects.values()).filter(effect => effect.getFlag(MODULE_ID, "hitMark") === true);
  if (matches.length > 1) {
    throw new Error("Power has duplicate managed on-hit marks; inspect its effects.");
  }
  const effect = matches[0];
  if (effect) {
    const source = effect.toObject(true);
    const expected = hitMarkData(item);
    for (const path of ["type", "disabled", "transfer", "statuses", "system.durationType", "system.powerEffectType", "system.useSourceActorData"]) {
      if (JSON.stringify(atPath(source, path)) !== JSON.stringify(atPath(expected, path))) {
        throw new Error("Managed on-hit mark was changed; inspect it before retrying.");
      }
    }
    const changes = source.system.changes;
    const expectedChange = expected.system.changes[0];
    if (changes?.length !== 1 || Object.entries(expectedChange).some(([key, value]) => changes[0][key] !== value)) {
      throw new Error("Managed on-hit mark was changed; inspect it before retrying.");
    }
  }
  return effect;
}

/**
 * Flatten only validated source objects; arrays are replaced as whole values.
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
 * Read a validated path from a serialized source document.
 */
function atPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

/**
 * Treat all game content as text in the confirmation UI, including HTML fields.
 */
function escape(value) {
  const text = value === undefined ? "(unset)" : typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

/**
 * Show the complete before/after summary, with cancellation as the default.
 * Expire the approval before the companion's edit request deadline.
 */
export async function confirmNpcEdit({ name, changes }, {
  Dialog = globalThis.Dialog, timeoutMs = EDIT_CONFIRM_TIMEOUT_MS
} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = value => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }
    };
    const rows = changes.map(change => `<tr><td>${escape(change.document)}<br>${escape(change.path)}</td><td style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(change.before)}</td><td style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(change.after)}</td></tr>`).join("");
    const dialog = new Dialog({
      title: "Foundry MCP: Confirm NPC edit",
      content: `<p>Review changes to <strong>${escape(name)}</strong>. Nothing is saved until you confirm. This request expires after 60 seconds.</p><div style="max-height:55vh;overflow:auto"><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      buttons: {
        confirm: { label: "Confirm changes", callback: () => finish(true) },
        cancel: { label: "Cancel", callback: () => finish(false) }
      },
      default: "cancel",
      close: () => finish(false)
    }, { width: 760 });
    timer = setTimeout(() => {
      finish(false);
      Promise.resolve(dialog.close()).catch(() => {});
    }, timeoutMs);
    try {
      dialog.render(true);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * Edit world NPC source fields and existing powers/features only after the
 * active GM reviews a generated summary. Recheck session and source after
 * approval so a stale popup cannot overwrite intervening manual changes.
 */
export async function editNpc(args, {
  game = globalThis.game, confirm = confirmNpcEdit, assertConnection = () => {},
  notify = message => globalThis.ui.notifications.info(message)
} = {}) {
  assertEnabledGM(game);
  validateNpcEdit(args);
  // Snapshot validated input before yielding to the confirmation UI.
  args = JSON.parse(JSON.stringify(args));
  if (new TextEncoder().encode(JSON.stringify(args)).length > MAX_MESSAGE_BYTES / 2) {
    throw new Error("NPC edit exceeds 2 MiB.");
  }
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
      throw new Error("Editing requires the paired active GM and DnD4e 0.9.3.");
    }
  };
  assertSession();
  const actor = game.actors.get(args.uuid.slice(6));
  if (!actor || actor.uuid !== args.uuid || actor.type !== "NPC" || actor.pack || actor.parent) {
    throw new Error("Only existing world NPC actors can be edited.");
  }
  if (pending.has(game)) {
    throw new Error("Another NPC edit is awaiting confirmation.");
  }
  const { uuid, items = [], ...actorData } = args;
  const targets = [{ document: actor, patch: flatten(actorData) }];
  const markTargets = [];
  for (const { id, type, hitMark, ...data } of items) {
    const item = actor.items.get(id);
    if (!item || item.type !== type || item.parent !== actor) {
      throw new Error("Choose an existing NPC power or feature with its matching type.");
    }
    targets.push({ document: item, patch: flatten(data) });
    if (hitMark && !findHitMark(item)) {
      markTargets.push(item);
    }
  }
  const changes = [];
  for (const target of targets) {
    target.source = JSON.stringify(target.document.toObject(true));
    const source = JSON.parse(target.source);
    for (const [path, after] of Object.entries(target.patch)) {
      const before = atPath(source, path);
      if (JSON.stringify(before) === JSON.stringify(after)) {
        delete target.patch[path];
      } else {
        changes.push({ document: target.document.name, uuid: target.document.uuid, path, before, after });
      }
    }
  }
  for (const item of markTargets) {
    changes.push({ document: item.name, uuid: item.uuid, path: "effects: add on-hit Marked", before: "No managed on-hit mark", after: "On hit: Marked; marker is the attacking actor; expires at the end of its next turn." });
  }
  const receipt = { uuid, name: actor.name, type: actor.type, changes };
  if (!changes.length) {
    return { ...receipt, status: "unchanged" };
  }
  pending.add(game);
  try {
    const approved = await confirm({ name: actor.name, changes });
    assertSession();
    if (approved !== true) {
      return { ...receipt, status: "cancelled" };
    }
    for (const target of targets) {
      const current = target.document === actor ? game.actors.get(actor.id) : actor.items.get(target.document.id);
      if (current !== target.document || JSON.stringify(current.toObject(true)) !== target.source) {
        throw new Error("NPC changed while awaiting confirmation; request a fresh edit.");
      }
    }
    // Embedded updates and actor updates are separate Foundry operations. Report
    // partial outcomes explicitly; never claim they form an atomic transaction.
    const itemUpdates = targets.slice(1).filter(target => Object.keys(target.patch).length)
      .map(target => ({ _id: target.document.id, ...target.patch }));
    const savedChanges = () => changes.filter(change => {
      const document = change.uuid === actor.uuid ? game.actors.get(actor.id)
        : targets.find(target => target.document.uuid === change.uuid)?.document;
      if (change.path === "effects: add on-hit Marked") {
        return document && findHitMark(document);
      }
      return document && JSON.stringify(atPath(document.toObject(true), change.path)) === JSON.stringify(change.after);
    });
    try {
      if (itemUpdates.length) {
        await actor.updateEmbeddedDocuments("Item", itemUpdates);
        assertSession();
        const expected = changes.filter(change => change.uuid !== actor.uuid && change.path !== "effects: add on-hit Marked");
        if (savedChanges().filter(change => change.uuid !== actor.uuid && change.path !== "effects: add on-hit Marked").length !== expected.length) {
          throw new Error("Some item updates were cancelled.");
        }
      }
      for (const item of markTargets) {
        assertSession();
        await item.createEmbeddedDocuments("ActiveEffect", [hitMarkData(item)]);
        assertSession();
        if (!findHitMark(item)) {
          throw new Error("Mark effect creation was cancelled.");
        }
      }
      if (Object.keys(targets[0].patch).length) {
        assertSession();
        const updated = await actor.update(targets[0].patch);
        if (!updated) {
          throw new Error("NPC update was cancelled.");
        }
        assertSession();
      }
      if (savedChanges().length !== changes.length) {
        throw new Error("Some NPC changes were not saved.");
      }
    } catch {
      notify(`Foundry MCP: edit to ${actor.name} did not fully complete. Check the NPC before retrying.`);
      return { ...receipt, status: "incomplete", applied: savedChanges(), message: "Edit did not fully complete. Read the NPC source before retrying; some changes may have been saved." };
    }
    notify(`Foundry MCP: saved ${changes.length} changes to ${actor.name}.`);
    return { ...receipt, name: actor.name, status: "updated" };
  } finally {
    pending.delete(game);
  }
}
