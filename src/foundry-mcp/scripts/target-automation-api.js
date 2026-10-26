import { AUTOMATION_MODULE, AUTOMATION_FLAG, validateTargetAutomation } from "../shared/target-automation-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";

const prefix = `flags.${AUTOMATION_MODULE}.${AUTOMATION_FLAG}`;
const pending = new WeakSet();

/**
 * Resolve only world actors and world/embedded power Items from fixed collections.
 */
function resolve(game, uuid) {
  const parts = uuid.split(".");
  const actor = parts[0] === "Actor" ? game.actors.get(parts[1]) : null;
  const document = parts.length === 4 ? actor?.items.get(parts[3])
    : parts[0] === "Item" ? game.items.get(parts[1]) : actor;
  if (!document || document.uuid !== uuid || document.pack || (document.parent && document.parent !== actor)
    || (parts[0] === "Actor" && (!actor || actor.pack || actor.parent))) {
    throw new Error("Only existing world actors and their powers or world powers are supported.");
  }
  if (document !== actor && document.type !== "power") {
    throw new Error("Target automation requires a power Item.");
  }
  return document;
}

/**
 * Load the installed targeting module's own defaults without duplicating its rules.
 */
async function loadRules() {
  return import("../../dnd4e-health-display/scripts/power-activation/rules.js");
}

/**
 * Read or confirm a bounded configuration edit; never activate powers or run macros.
 */
export async function targetAutomation(args, editing = false, {
  game = globalThis.game, confirm = confirmNpcEdit, assertConnection = () => {},
  rules = loadRules, conditions = () => globalThis.CONFIG?.statusEffects ?? []
} = {}) {
  validateTargetAutomation(args, editing);
  args = structuredClone(args);
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3"
      || !game.modules.get(AUTOMATION_MODULE)?.active) {
      throw new Error("Target automation requires the active display module and paired active GM on DnD4e 0.9.3.");
    }
  };
  assertSession();
  const { automationConfig, powerOriginRules, supportsTargetAutomation } = await rules();
  assertSession();
  const read = item => ({ uuid: item.uuid, name: item.name, config: automationConfig(item),
    stored: item.toObject(true).flags?.[AUTOMATION_MODULE]?.[AUTOMATION_FLAG] ?? {},
    origins: powerOriginRules(item), supported: supportsTargetAutomation(item),
    rangeType: item.system.rangeType, range: item.system.rangePower, area: item.system.area,
    hasAttack: item.hasAttack, macrosEnabled: (item.system.macros ?? []).some(macro => macro.enabled) });
  if (!editing) {
    const document = resolve(game, args.uuid);
    return { moduleEnabled: game.settings.get(AUTOMATION_MODULE, "enablePowerTargetAutomation"),
      ...(document.documentName === "Actor" ? { uuid: document.uuid,
        originActors: document.getFlag(AUTOMATION_MODULE, AUTOMATION_FLAG)?.originActors ?? [],
        powers: [...document.items.values()].filter(item => item.type === "power").map(read) } : read(document)) };
  }
  if (pending.has(game)) {
    throw new Error("Another automation edit is awaiting confirmation.");
  }
  const snapshots = new Map();
  const track = document => {
    if (!snapshots.has(document.uuid)) {
      snapshots.set(document.uuid, { document, source: JSON.stringify(document.toObject(true)) });
    }
    return document;
  };
  const targets = [];
  if (args.originActors !== undefined) {
    targets.push({ document: track(resolve(game, args.uuid)), patch: { [`${prefix}.originActors`]: args.originActors } });
  }
  const conditionSnapshot = JSON.stringify(conditions());
  for (const proposal of args.powers ?? []) {
    const item = track(resolve(game, proposal.uuid));
    const config = { ...automationConfig(item), ...proposal.config };
    const preview = { system: item.system, actor: item.actor, hasAttack: item.hasAttack };
    preview.getFlag = (module, flag) => module === AUTOMATION_MODULE && flag === AUTOMATION_FLAG
      ? config : item.getFlag(module, flag);
    if (config.enabled && !supportsTargetAutomation(preview)) {
      throw new Error("Enabled automation requires supported range/target counts or a non-attack summon with an actor.");
    }
    if (config.enabled) {
      const origins = powerOriginRules(preview);
      for (const uuid of [...origins.originActors, ...(config.placementMode === "summon" ? [config.summonActor] : [])]) {
        track(resolve(game, uuid));
      }
      if (item.actor) {
        track(resolve(game, item.actor.uuid));
      }
    }
    if (proposal.config.targetCondition && !conditions().some(status => status.id === proposal.config.targetCondition)) {
      throw new Error("Discover a configured condition with list_conditions first.");
    }
    const patch = Object.fromEntries(Object.entries(proposal.config).map(([key, value]) => [`${prefix}.${key}`, value]));
    if (config.enabled && item.system.macros?.some(macro => macro.enabled)) {
      patch["system.macros"] = item.system.macros.map(macro => ({ ...macro, enabled: false }));
    }
    targets.push({ document: item, patch });
  }
  for (const uuid of new Set([...(args.originActors ?? []), ...(args.powers ?? []).flatMap(power =>
    [...(power.config.originActors ?? []), ...(power.config.summonActor ? [power.config.summonActor] : [])])])) {
    track(resolve(game, uuid));
  }
  const atPath = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);
  const changes = targets.flatMap(({ document, patch }) => Object.entries(patch).flatMap(([path, after]) => {
    const before = atPath(document.toObject(true), path);
    return JSON.stringify(before) === JSON.stringify(after) ? []
      : [{ document: document.name, uuid: document.uuid, path, before, after }];
  }));
  if (!changes.length) {
    return { status: "unchanged", changes };
  }
  pending.add(game);
  try {
    const approved = await confirm({ name: "Target Automation", title: "Foundry MCP: Confirm Target Automation",
      summary: args.summary ?? "Update power targeting and alternate origins; enabled automation disables use macros.", changes });
    assertSession();
    if (approved !== true) {
      return { status: "cancelled", changes };
    }
    if (conditionSnapshot !== JSON.stringify(conditions()) || [...snapshots].some(([uuid, snapshot]) =>
      resolve(game, uuid) !== snapshot.document || JSON.stringify(snapshot.document.toObject(true)) !== snapshot.source)) {
      throw new Error("Automation source or conditions changed during review; request a fresh edit.");
    }
    let failed = false;
    for (const { document, patch } of targets) {
      assertSession();
      if (!changes.some(change => change.uuid === document.uuid)) {
        continue;
      }
      if (resolve(game, document.uuid) !== document
        || JSON.stringify(document.toObject(true)) !== snapshots.get(document.uuid).source) {
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
