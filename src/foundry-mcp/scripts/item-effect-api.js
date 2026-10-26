import { EFFECT_CONFIRM_TIMEOUT_MS, MAX_MESSAGE_BYTES, MODULE_ID } from "../shared/protocol.js";
import { EFFECT_ITEM_TYPES, auraEffectData, validateItemEffects } from "../shared/item-effect-data.js";
import { assertEnabledGM } from "./read-api.js";
import { conditionData } from "./condition-data.js";

const pending = new WeakSet();
const applicationLabels = {
  equipped: "Owner, only while equipped", passive: "Owner, while carried",
  all: "All targets", allies: "Allied targets", enemies: "Enemy targets", hit: "Targets hit",
  miss: "Targets missed", hitOrMiss: "Targets hit or missed", self: "Power user",
  selfAfterAttack: "Power user, after attack", selfHit: "Power user, on hit", selfMiss: "Power user, on miss",
  misc: "Miscellaneous / manual application"
};
const durationLabels = {
  permanent: "No expiry", endOfTargetTurn: "End of target's next turn", endOfUserTurn: "End of source's next turn",
  endOfUserCurrent: "End of source's current turn", startOfTargetTurn: "Start of target's next turn",
  startOfUserTurn: "Start of source's next turn", saveEnd: "Save ends", endOfEncounter: "End of encounter",
  endOfDay: "Extended rest", custom: "Custom"
};

/**
 * Treat all source rules and proposal text as text in the GM report.
 */
function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

/**
 * Show one review for the complete batch, including unsupported/manual rules.
 * Check wall time in the click callback as background browser timers may lag.
 */
export function confirmItemEffects({ items, summary }, {
  Dialog = globalThis.Dialog, timeoutMs = EFFECT_CONFIRM_TIMEOUT_MS, now = Date.now
} = {}) {
  return new Promise((resolve, reject) => {
    const expires = now() + timeoutMs;
    let settled = false;
    let timer;
    const finish = status => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(now() >= expires ? "expired" : status);
      }
    };
    const sections = items.map(item => `<section><h3>${escape(item.name)} (${escape(item.type)})</h3><p>${escape(item.uuid)}</p>
      ${item.notes ? `<p><strong>Manual handling / limitations:</strong> ${escape(item.notes)}</p>` : ""}
      ${item.effects.map(effect => `<fieldset><legend>${escape(effect.name)} — ${escape(effect.status)}</legend>
      <p style="white-space:pre-wrap">${escape(effect.description)}</p>
      ${effect.condition ? `<p><strong>Copy condition Name, Icon, Mods:</strong> ${escape(effect.condition)}; icon: ${escape(effect.img)}</p>` : ""}
      <p><strong>Applies:</strong> ${escape(applicationLabels[effect.application])}; <strong>Duration:</strong> ${escape(durationLabels[effect.duration])}${effect.durationValue ? ` (${escape(effect.durationValue)} ${escape(effect.durationUnits)})` : ""}${effect.durationAction ? `; ends on ${escape(effect.durationAction)}` : ""}${effect.duration === "saveEnd" ? `; save DC ${escape(effect.saveDC ?? 10)}` : ""}.</p>
      <p><strong>Formula data:</strong> ${effect.useSourceActorData === false ? "Affected actor (dynamic)" : "Source actor"}</p>
      ${effect.aura ? `<p><strong>Aura Effects:</strong> ${effect.aura.visualOnly ? "Visualization only; no recipient copies" : "Applies copies to eligible creatures in range"}</p><pre style="white-space:pre-wrap">${escape(JSON.stringify(auraEffectData(effect.aura), null, 2))}</pre>` : ""}
      ${effect.changes?.length ? `<ul>${effect.changes.map(change => `<li>${escape(change.key)}: ${escape(change.type)} ${escape(change.value)}${change.priority !== undefined ? ` (priority ${escape(change.priority)})` : ""}</li>`).join("")}</ul>` : ""}
      ${effect.statuses?.length ? `<p>Conditions: ${escape(effect.statuses.join(", "))}</p>` : ""}
      ${effect.keywords?.length ? `<p>Keywords: ${escape(effect.keywords.join(", "))}</p>` : ""}
      ${effect.dots?.length ? `<p>Ongoing damage: ${escape(effect.dots.map(dot => `${dot.amount} ${dot.types.join(", ")}`).join("; "))}</p>` : ""}</fieldset>`).join("")}</section>`).join("");
    const count = items.reduce((total, item) => total + item.effects.filter(effect => effect.status === "add").length, 0);
    const overview = summary ?? `Review ${count} new effect${count === 1 ? "" : "s"} across ${items.length} item${items.length === 1 ? "" : "s"}, including any manual handling notes.`;
    const dialog = new Dialog({
      title: "Foundry MCP: Review ActiveEffects",
      content: `<p style="white-space:pre-wrap;overflow-wrap:anywhere"><strong>${escape(overview)}</strong></p><p><strong>Nothing is saved until Confirm.</strong> You have 2 minutes to review. Existing effects are preserved. Power application requires DnD4e auto-apply effects and the appropriate targets; miscellaneous effects need manual application.</p><h3>Detailed changes</h3><div style="max-height:60vh;overflow:auto;overflow-wrap:anywhere">${sections}</div>`,
      buttons: {
        confirm: { label: "Confirm", callback: () => finish("confirmed") },
        cancel: { label: "Cancel", callback: () => finish("cancelled") }
      },
      default: "cancel", close: () => finish("cancelled")
    }, { width: 800 });
    timer = setTimeout(() => {
      finish("expired");
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
 * Resolve only Items in the world or on a world actor, without UUID traversal.
 */
function resolveItem(game, uuid) {
  const parts = uuid.split(".");
  const actor = parts[0] === "Actor" ? game.actors.get(parts[1]) : null;
  const item = actor ? actor.items.get(parts[3]) : parts[0] === "Item" ? game.items.get(parts[1]) : null;
  if (!item || item.uuid !== uuid || item.pack || !EFFECT_ITEM_TYPES.includes(item.type)
    || (actor ? actor.pack || actor.parent || item.parent !== actor : item.parent)) {
    throw new Error("Choose an existing supported world power, equipment or feature Item, or one on a world actor.");
  }
  return item;
}

/**
 * Build native 0.9.3 data, never accepting caller-supplied flags/source objects.
 */
export function itemEffectData(item, effect) {
  const transfer = ["equipped", "passive"].includes(effect.application);
  return {
    name: effect.name, type: effect.aura ? "auraeffects.aura" : "base", img: effect.img ?? (item.img || "icons/svg/aura.svg"),
    description: effect.description, origin: item.uuid, disabled: false, transfer,
    statuses: effect.statuses ?? [], showIcon: transfer ? 0 : 2,
    ...(effect.duration === "custom" ? { duration: { value: effect.durationValue, units: effect.durationUnits, expiry: "custom" } } : {}),
    system: {
      durationType: effect.duration === "permanent" ? "" : effect.duration,
      powerEffectType: transfer ? "misc" : effect.application,
      equippedRec: effect.application === "equipped", useSourceActorData: effect.useSourceActorData ?? true,
      durationAction: effect.durationAction ?? "", saveDC: effect.saveDC ?? 10,
      keywords: effect.keywords ?? [], dots: effect.dots ?? [],
      changes: (effect.changes ?? []).map(change => ({ ...change, priority: change.priority ?? null })),
      ...(effect.aura ? auraEffectData(effect.aura) : {})
    },
    flags: {
      [MODULE_ID]: { itemEffectKey: effect.key, ...(effect.condition ? { condition: effect.condition } : {}) },
      ...(effect.aura ? { auraeffects: { originalType: "base" } } : {})
    }
  };
}

/**
 * Compare requested mechanics with stored effects, ignoring system defaults and
 * keywords inherited from a parent power during construction.
 */
function matches(source, expected) {
  const equal = (actual, value) => {
    if (Array.isArray(value)) {
      return Array.isArray(actual) && actual.length === value.length && value.every((entry, i) => equal(actual[i], entry));
    }
    if (value && typeof value === "object") {
      return Object.entries(value).every(([key, entry]) => equal(actual?.[key], entry));
    }
    return actual === value;
  };
  const { keywords, ...system } = expected.system;
  // For reminders, the description is the effect's substance. Empty mechanics
  // alone must not make unrelated reminders equivalent.
  const descriptionOnly = !system.changes.length && !system.dots.length && !expected.statuses.length;
  return equal(source, { type: expected.type, disabled: false, transfer: expected.transfer, statuses: expected.statuses, system,
    ...(expected.type === "auraeffects.aura" ? { flags: { auraeffects: expected.flags.auraeffects } } : {}),
    ...(expected.flags[MODULE_ID].condition ? { name: expected.name, img: expected.img, description: expected.description } : {}),
    ...(descriptionOnly ? { description: expected.description } : {}),
    ...(expected.duration ? { duration: expected.duration } : {}) })
    && keywords.every(keyword => source.system?.keywords?.includes(keyword));
}

/**
 * Persisted stable keys and mechanical equivalence prevent duplicate additions
 * after timeouts, partial writes, reloads, or an already automated source Item.
 */
function existingEffect(item, expected) {
  const effects = Array.from(item.effects.values());
  const managed = effects.filter(effect => effect.getFlag(MODULE_ID, "itemEffectKey") === expected.flags[MODULE_ID].itemEffectKey);
  if (managed.length > 1 || (managed.length && !matches(managed[0].toObject(true), expected))) {
    throw new Error("A managed effect with this key differs or is duplicated. Inspect it before proposing another effect.");
  }
  return managed[0] ?? effects.find(effect => matches(effect.toObject(true), expected));
}

/**
 * Confirm and append a batch of native effects. Revalidate the session and all
 * source snapshots after approval and before each write. Writes across Items
 * are not atomic; return explicit receipts for partial outcomes.
 */
export async function addItemEffects(args, {
  game = globalThis.game, config = globalThis.CONFIG, confirm = confirmItemEffects,
  assertConnection = () => {}, notify = message => globalThis.ui.notifications.info(message), now = Date.now
} = {}) {
  assertEnabledGM(game);
  validateItemEffects(args);
  args = JSON.parse(JSON.stringify(args));
  if (new TextEncoder().encode(JSON.stringify(args)).length > MAX_MESSAGE_BYTES / 2) {
    throw new Error("Effect proposal exceeds 2 MiB.");
  }
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
      throw new Error("Effect authoring requires the paired active GM and DnD4e 0.9.3.");
    }
  };
  assertSession();
  const hasAuras = args.items.some(item => item.effects.some(effect => effect.aura));
  const auraModel = config.ActiveEffect?.dataModels?.["auraeffects.aura"];
  const assertAuraSupport = () => {
    if (!hasAuras) {
      return;
    }
    const schema = auraModel?.defineSchema?.();
    if (!game.modules?.get("auraeffects")?.active || !auraModel
      || config.ActiveEffect?.dataModels?.["auraeffects.aura"] !== auraModel
      || !["distanceFormula", "disposition", "showRadius", "script", "changes", "durationType", "powerEffectType"].every(key => Object.hasOwn(schema ?? {}, key))) {
      throw new Error("Aura authoring requires active Aura Effects with its DnD4e-compatible aura data model (verified against 2.2.1). Reload Foundry after enabling it.");
    }
  };
  assertAuraSupport();
  if (pending.has(game)) {
    throw new Error("Another effect batch is awaiting confirmation.");
  }
  const targets = args.items.map(proposal => {
    const item = resolveItem(game, proposal.uuid);
    for (const effect of proposal.effects) {
      if (item.type === "feature" && effect.application !== "passive") {
        throw new Error("Features need permanent passive effects; triggered benefits remain manual or belong on a power Item.");
      }
      const activated = ["power", "consumable"].includes(item.type);
      if (activated === ["equipped", "passive"].includes(effect.application)) {
        throw new Error("Powers/consumables need a power application type; inventory properties use equipped or passive.");
      }
      if ((effect.statuses ?? []).some(status => !Object.hasOwn(config.DND4E.statusEffect, status))
        || (effect.keywords ?? []).some(keyword => !Object.hasOwn({ ...config.DND4E.effectTypes, ...config.DND4E.damageTypes, ...config.DND4E.powerSource }, keyword))) {
        throw new Error("Unknown native status or effect keyword.");
      }
    }
    const effects = proposal.effects.map(effect => {
      let condition;
      if (effect.condition) {
        condition = conditionData(config, game, effect.condition);
        effect = { ...effect, name: condition.name, img: condition.img, changes: condition.changes,
          statuses: [condition.id], description: effect.description ?? "" };
        if (!effect.name || !effect.img) {
          throw new Error("The configured condition needs a Name and Icon.");
        }
      }
      const data = itemEffectData(item, effect);
      const existing = existingEffect(item, data);
      return { spec: effect, data, existing, condition };
    });
    for (let index = 0; index < effects.length; index++) {
      if (effects.slice(0, index).some(previous => matches(previous.data, effects[index].data))) {
        throw new Error("The proposal contains duplicate effect mechanics on the same Item.");
      }
    }
    return { item, proposal, effects, source: JSON.stringify(item.toObject(true)) };
  });
  const receipt = { items: targets.map(({ item, proposal, effects }) => ({
    uuid: item.uuid, name: item.name, type: item.type, notes: proposal.notes,
    effects: effects.map(({ spec, existing }) => ({ ...spec, status: existing ? "already present" : "add" }))
  })) };
  if (!targets.some(target => target.effects.some(effect => !effect.existing))) {
    // Manual-only batches still show a report, even though no write is needed.
    if (targets.every(target => !target.proposal.notes)) {
      return { ...receipt, status: "unchanged" };
    }
  }
  pending.add(game);
  try {
    const expires = now() + EFFECT_CONFIRM_TIMEOUT_MS;
    const approval = await confirm({ ...receipt, summary: args.summary });
    assertSession();
    if (now() >= expires || approval === "expired") {
      return { ...receipt, status: "expired", applied: [] };
    }
    if (approval !== "confirmed") {
      return { ...receipt, status: "cancelled", applied: [] };
    }
    const assertFresh = target => {
      assertAuraSupport();
      if (resolveItem(game, target.item.uuid) !== target.item || JSON.stringify(target.item.toObject(true)) !== target.source) {
        throw new Error("Item changed while awaiting confirmation; request a fresh proposal.");
      }
      for (const effect of target.effects) {
        if (effect.condition && JSON.stringify(conditionData(config, game, effect.condition.id)) !== JSON.stringify(effect.condition)) {
          throw new Error("Condition changed while awaiting confirmation; request a fresh proposal.");
        }
      }
    };
    targets.forEach(assertFresh);
    const applied = [];
    let writing;
    try {
      for (const target of targets) {
        assertSession();
        assertFresh(target);
        const additions = target.effects.filter(effect => !effect.existing);
        if (!additions.length) {
          continue;
        }
        writing = { target, additions };
        await target.item.createEmbeddedDocuments("ActiveEffect", additions.map(effect => effect.data));
        assertSession();
        const saved = additions.map(effect => ({ effect, document: existingEffect(target.item, effect.data) }));
        for (const { effect, document } of saved) {
          if (document) {
            applied.push({ uuid: target.item.uuid, effectId: document.id, key: effect.spec.key, name: effect.spec.name });
          }
        }
        writing = undefined;
        if (saved.some(entry => !entry.document)) {
          throw new Error("Some effect creations were cancelled.");
        }
      }
    } catch {
      // A write can persist and then reject or lose its connection. Inspect the
      // current Item collection for receipts without attempting rollback.
      if (writing) {
        for (const effect of writing.additions) {
          const document = Array.from(writing.target.item.effects.values()).find(entry => entry.getFlag(MODULE_ID, "itemEffectKey") === effect.spec.key);
          if (document && matches(document.toObject(true), effect.data)) {
            applied.push({ uuid: writing.target.item.uuid, effectId: document.id, key: effect.spec.key, name: effect.spec.name });
          }
        }
      }
      notify("Foundry MCP: effect batch did not fully complete. Inspect the affected Items before retrying.");
      return { ...receipt, status: "incomplete", applied, message: "Some effects may have saved. Read source before retrying the same stable keys." };
    }
    notify(`Foundry MCP: added ${applied.length} ActiveEffects across ${targets.length} Items.`);
    return { ...receipt, status: applied.length ? "updated" : "unchanged", applied };
  } finally {
    pending.delete(game);
  }
}
