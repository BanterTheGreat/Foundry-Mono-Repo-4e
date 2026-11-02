import { TRIGGER_MODULE, TRIGGER_FLAG, validateTriggerAutomation } from "../shared/trigger-automation-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const pending = new WeakSet();
const prefix = `flags.${TRIGGER_MODULE}.${TRIGGER_FLAG}`;

/** Load the installed registry so discovery and validation match the runtime. */
async function loadRules() {
  const base = "../../banter-4e-modifications/scripts/modules/trigger-prompts/";
  const [definitions, filters] = await Promise.all([import(`${base}trigger-definitions.js`), import(`${base}trigger-filters.js`)]);
  return { ...definitions, ...filters };
}

/** Resolve exact world destinations without arbitrary UUID traversal. */
function resolve(game, uuid) {
  const parts = uuid.split(".");
  const actor = parts[0] === "Actor" ? game.actors.get(parts[1]) : null;
  const document = parts.length === 4 ? actor?.items.get(parts[3]) : parts[0] === "Item" ? game.items.get(parts[1]) : actor;
  if (!document || document.uuid !== uuid || document.pack || actor?.pack || actor?.parent
    || (document.parent && document.parent !== actor)
    || (document !== actor && !["power", "feat", "feature"].includes(document.type))) {
    throw new Error("Only world actors and world or actor-owned powers, feats and features are supported.");
  }
  return document;
}

/** Read trigger configuration or apply a reviewed, stale-checked bounded edit. */
export async function triggerAutomation(args, editing = false, {
  game = globalThis.game, confirm = confirmNpcEdit, assertConnection = () => {}, rules = loadRules
} = {}) {
  validateTriggerAutomation(args, editing);
  args = structuredClone(args);
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3" || !game.modules.get(TRIGGER_MODULE)?.active) {
      throw new Error("Trigger Automation requires active Banter and the paired active GM on DnD4e 0.9.3.");
    }
  };
  assertSession();
  const registry = await rules();
  assertSession();
  const catalog = registry.TRIGGERS.map(({ id, label, description, actorLevel, defaultRangeSquares, companion }) =>
    ({ id, label, description, actorLevel: actorLevel === true, defaultRangeSquares, companion: companion === true }));
  const stored = document => document.toObject(true).flags?.[TRIGGER_MODULE]?.[TRIGGER_FLAG] ?? {};
  const read = document => ({ uuid: document.uuid, name: document.name, type: document.type, stored: stored(document) });
  if (!editing) {
    const document = resolve(game, args.uuid);
    return { ...read(document), catalog, moduleEnabled: game.settings.get(TRIGGER_MODULE, "enable-trigger-prompts"),
      filters: { attackTypes: registry.ATTACK_TYPES, defenseTypes: registry.DEFENSE_TYPES, damageTypes: registry.DAMAGE_TYPES },
      ...(document.documentName === "Actor" ? { items: [...document.items.values()]
        .filter(item => ["power", "feat", "feature"].includes(item.type)).map(read) } : {}) };
  }
  if (pending.has(game)) {
    throw new Error("Another trigger edit is awaiting confirmation.");
  }
  const snapshots = new Map();
  const track = document => {
    snapshots.set(document.uuid, { document, source: JSON.stringify(document.toObject(true)) });
    return document;
  };
  const targets = [];
  if (args.opportunityAttack || args.reminders) {
    const actor = track(resolve(game, args.uuid));
    const patch = {};
    const configuration = stored(actor);
    if (!Array.isArray(configuration.assignments)) {
      if (catalog.some(trigger => trigger.id !== "opportunity-attack" && configuration[trigger.id]?.enabled)) {
        throw new Error("Legacy actor assignments require migration through the actor Triggers dialog before editing actor options.");
      }
      patch[`${prefix}.assignments`] = [];
      patch[`${prefix}.opportunityAttack.enabled`] = configuration["opportunity-attack"]?.enabled ?? actor.type !== "NPC";
      patch[`${prefix}.opportunityAttack.oncePerTurn`] = true;
    }
    for (const [key, value] of Object.entries(args.opportunityAttack ?? {})) {
      patch[`${prefix}.opportunityAttack.${key}`] = value;
    }
    for (const reminder of args.reminders ?? []) {
      if (!catalog.some(trigger => trigger.id === reminder.triggerId && trigger.actorLevel)) {
        throw new Error("Choose an actor-level reminder from get_trigger_automation.");
      }
      patch[`${prefix}.actorLevelTriggers.${reminder.triggerId}.enabled`] = reminder.enabled;
    }
    targets.push({ document: actor, patch });
  }
  for (const proposal of args.items ?? []) {
    const document = track(resolve(game, proposal.uuid));
    const patch = { [`${prefix}.version`]: 1 };
    if (proposal.assignments !== undefined) {
      patch[`${prefix}.assignments`] = proposal.assignments.map(assignment => {
        const trigger = catalog.find(trigger => trigger.id === assignment.triggerId);
        if (!trigger || trigger.actorLevel || trigger.id === "opportunity-attack") {
          throw new Error("Choose an item trigger from get_trigger_automation; opportunity attacks use actor options.");
        }
        const parameters = assignment.parameters ?? {};
        for (const [key, values] of [["attackTypes", registry.ATTACK_TYPES], ["defenseTypes", registry.DEFENSE_TYPES], ["damageTypes", registry.DAMAGE_TYPES]]) {
          if (parameters[key]?.some(value => !values.includes(value)) || new Set(parameters[key] ?? []).size !== (parameters[key]?.length ?? 0)) {
            throw new Error(`Invalid ${key} filter.`);
          }
        }
        if (trigger.companion && !parameters.companionActorUuid) {
          throw new Error("Companion triggers require companionActorUuid.");
        }
        if (parameters.companionActorUuid) {
          track(resolve(game, parameters.companionActorUuid));
        }
        return { triggerId: assignment.triggerId, parameters, source: assignment.source ?? "manual" };
      });
    }
    for (const key of ["limit", "automatic"]) {
      if (proposal[key] !== undefined) {
        patch[`${prefix}.${key}`] = proposal[key];
      }
    }
    targets.push({ document, patch });
  }
  const atPath = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);
  const changes = targets.flatMap(({ document, patch }) => Object.entries(patch).flatMap(([path, after]) => {
    const before = atPath(document.toObject(true), path);
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ document: document.name, uuid: document.uuid, path, before, after }];
  }));
  if (!changes.length) {
    return { status: "unchanged", changes };
  }
  pending.add(game);
  try {
    const approved = await confirm({ name: "Trigger Automations", title: "Foundry MCP: Confirm Trigger Automations",
      summary: args.summary ?? "Update trigger assignments and actor options.", changes });
    assertSession();
    if (approved !== true) {
      return { status: "cancelled", changes };
    }
    const unchanged = (uuid, snapshot) => resolve(game, uuid) === snapshot.document
      && JSON.stringify(snapshot.document.toObject(true)) === snapshot.source;
    if ([...snapshots].some(([uuid, snapshot]) => !unchanged(uuid, snapshot))) {
      throw new Error("Trigger source changed during review; read source and request a fresh edit.");
    }
    let failed = false;
    for (const { document, patch } of targets) {
      assertSession();
      if (!changes.some(change => change.uuid === document.uuid)) {
        continue;
      }
      if (!unchanged(document.uuid, snapshots.get(document.uuid))) {
        failed = true;
        break;
      }
      try {
        await document.update(patch);
      } catch {
        failed = true;
        break;
      }
      assertSession();
    }
    const applied = changes.filter(change => JSON.stringify(atPath(resolve(game, change.uuid).toObject(true), change.path)) === JSON.stringify(change.after));
    return { status: failed || applied.length !== changes.length ? "incomplete" : "updated", changes, applied };
  } finally {
    pending.delete(game);
  }
}
