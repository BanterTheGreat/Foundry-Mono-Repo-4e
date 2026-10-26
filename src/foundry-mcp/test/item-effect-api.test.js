import test from "node:test";
import assert from "node:assert/strict";
import { addItemEffects, confirmItemEffects, itemEffectData } from "../scripts/item-effect-api.js";
import { validateItemEffects, EFFECT_DURATIONS } from "../shared/item-effect-data.js";
import { EFFECT_CONFIRM_TIMEOUT_MS } from "../shared/protocol.js";

/**
 * Simulate documents and awaited embedded writes without operating Foundry.
 */
function fixture() {
  const calls = [];
  const game = {
    ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, items: new Map(), actors: new Map()
  };
  const makeItem = (id, type, parent) => {
    const item = {
      id, uuid: parent ? `${parent.uuid}.Item.${id}` : `Item.${id}`, name: id, type, parent,
      source: { name: id, type, system: {}, effects: [] }, effects: new Map(),
      toObject: () => structuredClone(item.source),
      createEmbeddedDocuments: async (type, sources) => {
        calls.push({ uuid: item.uuid, type, sources });
        return sources.map(data => {
          const source = structuredClone(data);
          const effect = { id: `effect${item.effects.size}`, toObject: () => structuredClone(source), getFlag: (module, key) => source.flags?.[module]?.[key] };
          item.effects.set(effect.id, effect);
          item.source.effects.push(source);
          return effect;
        });
      }
    };
    (parent?.items ?? game.items).set(id, item);
    return item;
  };
  const actor = { id: "pc", uuid: "Actor.pc", items: new Map() };
  game.actors.set(actor.id, actor);
  const equipment = makeItem("armour", "equipment");
  const power = makeItem("ward", "power", actor);
  return {
    game, equipment, power, calls, actor, makeItem,
    config: { DND4E: { statusEffect: { mark: {}, dazed: {} }, effectTypes: { fear: "Fear" }, damageTypes: { fire: "Fire" }, powerSource: {} } },
    confirm: async () => "confirmed", notify: () => {}
  };
}

/**
 * A passive property and an activated power need different native settings.
 */
function proposal() {
  const resistance = { key: "fire-resistance", name: "Fire resistance 5", description: "You gain resist 5 fire.", application: "equipped", duration: "permanent", changes: [{ key: "system.resistances.fire.res", type: "upgrade", value: "5" }] };
  return { items: [
    { uuid: "Item.armour", effects: [resistance] },
    { uuid: "Actor.pc.Item.ward", effects: [{ ...resistance, application: "self", duration: "endOfEncounter" }] }
  ] };
}

test("world and actor features support confirmed passive effects and duplicate-safe retries", async () => {
  for (const parent of [false, true]) {
    const deps = fixture();
    const feat = deps.makeItem("toughness", "feature", parent ? deps.actor : undefined);
    const args = { items: [{ uuid: feat.uuid, effects: [{
      key: "toughness", name: "Toughness", description: "Gain bonus HP and Endurance.",
      application: "passive", duration: "permanent", useSourceActorData: false,
      changes: [{ key: "system.attributes.hp.feat", type: "upgrade", value: "5 + @lvhalf" },
        { key: "system.skills.end.feat", type: "upgrade", value: "2" }]
    }] }] };
    assert.equal((await addItemEffects(args, deps)).status, "updated");
    assert.equal(deps.calls[0].sources[0].transfer, true);
    assert.equal(deps.calls[0].sources[0].system.equippedRec, false);
    deps.confirm = () => assert.fail("An identical retry must not prompt");
    assert.equal((await addItemEffects(args, deps)).status, "unchanged");
  }
});

test("features reject activated or equipped effects before confirmation and cancellation saves nothing", async () => {
  const deps = fixture();
  const feat = deps.makeItem("feat", "feature", deps.actor);
  const args = { items: [{ uuid: feat.uuid, effects: [{
    ...proposal().items[0].effects[0], application: "passive"
  }] }] };
  for (const application of ["equipped", "self", "misc", "hit"]) {
    const invalid = structuredClone(args);
    invalid.items[0].effects[0].application = application;
    await assert.rejects(addItemEffects(invalid, deps), /Features need permanent passive/);
  }
  deps.confirm = async () => "cancelled";
  assert.equal((await addItemEffects(args, deps)).status, "cancelled");
  assert.equal(deps.calls.length, 0);
});

/**
 * Model the installed Aura Effects schema without launching Foundry.
 */
function enableAuras(deps) {
  deps.game.modules = new Map([["auraeffects", { active: true }]]);
  deps.config.ActiveEffect = { dataModels: { "auraeffects.aura": {
    defineSchema: () => Object.fromEntries(["distanceFormula", "disposition", "showRadius", "script", "changes", "durationType", "powerEffectType"].map(key => [key, {}]))
  } } };
}

/**
 * Fire Mantle emits an area without spreading its bearer's protections.
 */
function visualAura(deps) {
  return { items: [{ uuid: deps.power.uuid, effects: [{
    key: "fire-mantle-aura", name: "Fire Mantle Aura", description: "Aura 1. Enemy fire damage is handled manually.",
    application: "all", duration: "endOfEncounter",
    aura: { distanceFormula: "1", visualOnly: true, showRadius: true, color: "#ff6600", applyToSelf: false }
  }] }] };
}

test("visual-only auras are confirmed, use the module type and suppress every recipient copy; retries remain safe", async () => {
  const deps = fixture();
  enableAuras(deps);
  const args = visualAura(deps);
  deps.confirm = async report => {
    assert.equal(deps.calls.length, 0);
    assert.deepEqual(report.items[0].effects[0].aura, args.items[0].effects[0].aura);
    return "confirmed";
  };
  assert.equal((await addItemEffects(args, deps)).status, "updated");
  const saved = deps.calls[0].sources[0];
  assert.equal(saved.type, "auraeffects.aura");
  assert.equal(saved.transfer, false);
  assert.equal(saved.system.script, "false");
  assert.equal(saved.system.showRadius, true);
  assert.equal(saved.system.color, "#ff6600");
  assert.equal(saved.system.distanceFormula, "1");
  assert.equal(saved.system.applyToSelf, false);
  assert.equal(saved.system.durationType, "endOfEncounter");
  assert.deepEqual(saved.flags.auraeffects, { originalType: "base" });
  assert.deepEqual(saved.system.changes, []);
  deps.confirm = () => assert.fail("An identical retry must not prompt");
  assert.equal((await addItemEffects(args, deps)).status, "unchanged");
  for (const patch of [{ distanceFormula: "2" }, { visualOnly: false }, { showRadius: false }, { color: "#112233" }]) {
    const changed = structuredClone(args);
    Object.assign(changed.items[0].effects[0].aura, patch);
    await assert.rejects(addItemEffects(changed, deps), /differs/);
  }
});

test("recipient auras preserve modifiers, source evaluation, dispositions, collisions and stacking", async () => {
  for (const [disposition, value] of [["any", 0], ["friendly", 1], ["hostile", -1]]) {
    const deps = fixture();
    enableAuras(deps);
    const args = visualAura(deps);
    const effect = args.items[0].effects[0];
    effect.aura = { distanceFormula: "max(1, @chaMod)", bestFormula: "@chaMod", disposition,
      evaluatePreApply: true, canStack: true, collisionType: "sight", applyToSelf: true,
      combatOnly: true, disableOnHidden: false, overrideName: "Ward" };
    effect.changes = [{ key: "system.resistances.fire.res", type: "upgrade", value: "@chaMod" }];
    assert.equal((await addItemEffects(args, deps)).status, "updated");
    const saved = deps.calls[0].sources[0];
    assert.equal(saved.system.disposition, value);
    assert.equal(saved.system.script, "");
    assert.equal(saved.system.evaluatePreApply, true);
    assert.equal(saved.system.canStack, true);
    assert.equal(saved.system.combatOnly, true);
    assert.equal(saved.system.disableOnHidden, false);
    assert.equal(saved.system.overrideName, "Ward");
    assert.equal(saved.system.collisionType, "sight");
    assert.equal(saved.system.changes[0].value, "@chaMod");
  }
});

test("aura inputs reject executable input, random formulas, unknown fields and visual-only mechanics", () => {
  for (const patch of [{ script: "true" }, { distanceFormula: "1d6" }, { distanceFormula: "Math.random()" },
    { distanceFormula: undefined }, { bestFormula: "d20" }, { disposition: "allies" },
    { collisionType: "wall" }, { color: "red" }, { overrideName: "x".repeat(201) }]) {
    const args = visualAura(fixture());
    Object.assign(args.items[0].effects[0].aura, patch);
    assert.throws(() => validateItemEffects(args));
  }
  for (const patch of [{ condition: "slowed" }, { statuses: ["dazed"] },
    { changes: [{ key: "system.resistances.fire.res", type: "upgrade", value: "10" }] },
    { dots: [{ amount: "5", types: ["fire"] }] }]) {
    const args = visualAura(fixture());
    Object.assign(args.items[0].effects[0], patch);
    assert.throws(() => validateItemEffects(args), /Visual-only/);
  }
});

test("auras require compatible active module support before and after approval; cancellation saves nothing", async () => {
  for (const mutate of [deps => { deps.game.modules.get("auraeffects").active = false; },
    deps => { delete deps.config.ActiveEffect; },
    deps => { deps.config.ActiveEffect.dataModels["auraeffects.aura"].defineSchema = () => ({}); }]) {
    for (const afterApproval of [false, true]) {
      const deps = fixture();
      enableAuras(deps);
      const args = visualAura(deps);
      if (afterApproval) {
        deps.confirm = async () => { mutate(deps); return "confirmed"; };
      } else {
        mutate(deps);
        deps.confirm = () => assert.fail("Unsupported module must not prompt");
      }
      await assert.rejects(addItemEffects(args, deps), /Aura authoring/);
      assert.equal(deps.calls.length, 0);
    }
  }
  const deps = fixture();
  enableAuras(deps);
  deps.confirm = async () => "cancelled";
  assert.equal((await addItemEffects(visualAura(deps), deps)).status, "cancelled");
  assert.equal(deps.calls.length, 0);
});

test("aura report shows visualization versus recipient behavior and escapes aura configuration", async () => {
  let options;
  class Dialog {
    constructor(data) { options = data; }
    render() { options.buttons.cancel.callback(); }
  }
  const args = visualAura(fixture());
  args.items[0].effects[0].aura.overrideName = "<script>";
  await confirmItemEffects(args, { Dialog });
  assert.match(options.content, /Visualization only; no recipient copies/);
  assert.match(options.content, /distanceFormula/);
  assert.match(options.content, /&lt;script&gt;/);
  assert.ok(!options.content.includes("<script>"));
});

test("confirms one complete batch before any writes, preserving existing effects and reusing retries", async () => {
  const deps = fixture();
  const args = proposal();
  deps.equipment.source.effects.push({ name: "Unmanaged effect" });
  deps.confirm = async report => {
    assert.equal(deps.calls.length, 0);
    assert.equal(report.items.length, 2);
    assert.equal(report.items[0].effects[0].duration, "permanent");
    return "confirmed";
  };
  const result = await addItemEffects(args, deps);
  assert.equal(result.status, "updated");
  assert.equal(result.applied.length, 2);
  assert.equal(deps.equipment.source.effects.length, 2);
  const passive = deps.calls[0].sources[0];
  const power = deps.calls[1].sources[0];
  assert.equal(passive.transfer, true);
  assert.equal(passive.system.equippedRec, true);
  assert.equal(passive.system.durationType, "");
  assert.deepEqual(passive.system.changes, [{ key: "system.resistances.fire.res", type: "upgrade", value: "5", priority: null }]);
  assert.equal(power.transfer, false);
  assert.equal(power.system.powerEffectType, "self");
  assert.equal(power.system.durationType, "endOfEncounter");
  deps.confirm = () => assert.fail("Identical retry must not prompt or duplicate");
  assert.equal((await addItemEffects(args, deps)).status, "unchanged");
  assert.equal(deps.calls.length, 2);
  const changed = structuredClone(args);
  changed.items[0].effects[0].changes[0].value = "10";
  await assert.rejects(addItemEffects(changed, deps), /differs/);
});

test("condition shortcut copies configured Name, Icon and Mods, retaining application and duration without condition prose", async () => {
  const deps = fixture();
  const changes = [{ key: "system.movement.base.ceil", type: "override", value: "2", phase: "initial" }];
  deps.config.statusEffects = [{ id: "slowed", name: "EFFECT.statusSlowed", img: "custom/slowed.svg", changes,
    description: "Long condition explanation", flags: { macro: "never copy" } }];
  deps.game.i18n = { localize: () => "Slowed" };
  const args = { items: [{ uuid: deps.power.uuid, effects: [{ key: "slowed", condition: "slowed", application: "hit", duration: "endOfUserTurn" }] }] };
  deps.confirm = async report => {
    const effect = report.items[0].effects[0];
    assert.equal(effect.name, "Slowed");
    assert.equal(effect.img, "custom/slowed.svg");
    assert.deepEqual(effect.changes, changes);
    assert.equal(effect.description, "");
    assert.equal(deps.calls.length, 0);
    return "confirmed";
  };
  assert.equal((await addItemEffects(args, deps)).status, "updated");
  const saved = deps.calls[0].sources[0];
  assert.equal(saved.name, "Slowed");
  assert.equal(saved.img, "custom/slowed.svg");
  assert.equal(saved.description, "");
  assert.deepEqual(saved.statuses, ["slowed"]);
  assert.deepEqual(saved.system.changes, [{ ...changes[0], priority: null }]);
  assert.equal(saved.system.powerEffectType, "hit");
  assert.equal(saved.system.durationType, "endOfUserTurn");
  assert.equal(saved.flags.macro, undefined);
  deps.confirm = () => assert.fail("Identical retry must not duplicate");
  assert.equal((await addItemEffects(args, deps)).status, "unchanged");
  assert.deepEqual(deps.config.statusEffects[0].changes, changes);
});

test("condition shortcuts reject ambiguous overrides, unknown conditions and changed definitions during approval", async () => {
  const args = { items: [{ uuid: "Actor.pc.Item.ward", effects: [{ key: "slow", condition: "slowed", application: "hit", duration: "endOfUserTurn" }] }] };
  for (const patch of [{ name: "Other" }, { changes: [] }, { statuses: [] }, { condition: "../slowed" }, { img: "arbitrary.svg" }]) {
    const invalid = structuredClone(args);
    Object.assign(invalid.items[0].effects[0], patch);
    assert.throws(() => validateItemEffects(invalid));
  }
  const deps = fixture();
  deps.config.statusEffects = [{ id: "slowed", name: "Slowed", img: "slowed.svg", changes: [] }];
  deps.confirm = async () => {
    deps.config.statusEffects[0].img = "changed.svg";
    return "confirmed";
  };
  await assert.rejects(addItemEffects(args, deps), /Condition changed/);
  assert.equal(deps.calls.length, 0);
  args.items[0].effects[0].condition = "missing";
  await assert.rejects(addItemEffects(args, deps), /Unknown configured condition/);
});

test("a status-only effect with the power icon does not suppress a complete condition copy", async () => {
  const deps = fixture();
  deps.config.DND4E.statusEffect.slowed = {};
  deps.power.img = "power.svg";
  const effect = { key: "old-slow", name: "Howling Wall — Slowed", description: "Slowed.",
    application: "hit", duration: "endOfUserTurn", statuses: ["slowed"] };
  await addItemEffects({ items: [{ uuid: deps.power.uuid, effects: [effect] }] }, deps);
  deps.config.statusEffects = [{ id: "slowed", name: "Slowed", img: "condition.svg" }];
  const args = { items: [{ uuid: deps.power.uuid, effects: [{ key: "condition-slow", condition: "slowed", application: "hit", duration: "endOfUserTurn" }] }] };
  assert.equal((await addItemEffects(args, deps)).status, "updated");
  assert.equal(deps.power.effects.size, 2);
  assert.equal(deps.calls[1].sources[0].img, "condition.svg");
  assert.deepEqual(deps.calls[1].sources[0].system.changes, []);
  assert.equal((await addItemEffects(args, deps)).status, "unchanged");
});

test("description-only hit reminders preserve text and duration and distinguish different reminders", async () => {
  for (const arrays of [{}, { changes: [], statuses: [], dots: [] }]) {
    const deps = fixture();
    const effect = {
      key: "haunting-spirits", name: "Haunting Spirits",
      description: "The target grants combat advantage to one chosen ally until the end of your next turn.",
      application: "hit", duration: "endOfUserTurn", ...arrays
    };
    const args = { items: [{ uuid: deps.power.uuid, effects: [effect] }] };
    deps.confirm = async report => {
      assert.equal(deps.calls.length, 0);
      assert.equal(report.items[0].effects[0].description, effect.description);
      return "confirmed";
    };
    assert.equal((await addItemEffects(args, deps)).status, "updated");
    const saved = deps.calls[0].sources[0];
    assert.equal(saved.description, effect.description);
    assert.equal(saved.transfer, false);
    assert.equal(saved.system.powerEffectType, "hit");
    assert.equal(saved.system.durationType, "endOfUserTurn");
    assert.deepEqual(saved.system.changes, []);
    assert.deepEqual(saved.system.dots, []);
    assert.deepEqual(saved.statuses, []);
    deps.confirm = () => assert.fail("Identical retry must not prompt");
    assert.equal((await addItemEffects(args, deps)).status, "unchanged");
    const changed = structuredClone(args);
    changed.items[0].effects[0].description = "A different reminder.";
    await assert.rejects(addItemEffects(changed, deps), /differs/);
    changed.items[0].effects[0].key = "different-reminder";
    deps.confirm = async () => "confirmed";
    assert.equal((await addItemEffects(changed, deps)).status, "updated");
    assert.equal(deps.power.effects.size, 2);
    for (const description of [undefined, "", "   "]) {
      const invalid = structuredClone(args);
      invalid.items[0].effects[0].description = description;
      assert.throws(() => validateItemEffects(invalid), /description/);
    }
  }
});

test("effect reports show authored summary first and never store it on effects", async () => {
  const deps = fixture();
  const args = { ...proposal(), summary: "Grant fire resistance to the armor and ward." };
  deps.confirm = async report => {
    assert.equal(report.summary, args.summary);
    return "confirmed";
  };
  assert.equal((await addItemEffects(args, deps)).status, "updated");
  assert.ok(deps.calls.every(call => call.sources.every(source => !Object.hasOwn(source, "summary"))));
  let options;
  class Dialog {
    constructor(data) { options = data; }
    render() { options.buttons.cancel.callback(); }
  }
  await confirmItemEffects({ summary: "Add <script> fire resistance.", items: [] }, { Dialog });
  assert.ok(options.content.indexOf("Add &lt;script&gt; fire resistance.") < options.content.indexOf("Detailed changes"));
  assert.ok(!options.content.includes("<script>"));
  for (const summary of [" ", "x".repeat(1001), 42]) {
    assert.throws(() => validateItemEffects({ ...proposal(), summary }));
  }
});

test("native durations, ongoing damage, save DC, statuses and expiration actions retain their semantics", () => {
  const deps = fixture();
  for (const duration of EFFECT_DURATIONS) {
    const effect = { key: "mark", name: "Mark", description: "Marked.", application: "hit", duration,
      statuses: ["mark"], changes: [{ key: "system.marker", type: "override", value: "@charaUID" }],
      ...(duration === "custom" ? { durationValue: 300, durationUnits: "seconds" } : {}),
      ...(duration === "saveEnd" ? { saveDC: 12, dots: [{ amount: "5 + @tier", types: ["fire"] }] } : {}) };
    validateItemEffects({ items: [{ uuid: deps.power.uuid, effects: [effect] }] });
    const data = itemEffectData(deps.power, effect);
    assert.equal(data.system.durationType, duration === "permanent" ? "" : duration);
    assert.equal(data.system.powerEffectType, "hit");
    assert.equal(data.system.useSourceActorData, true);
    if (duration === "custom") {
      assert.deepEqual(data.duration, { value: 300, units: "seconds", expiry: "custom" });
    }
    if (duration === "saveEnd") {
      assert.equal(data.system.saveDC, 12);
      assert.deepEqual(data.system.dots, effect.dots);
    }
  }
});

test("cancel, close, expiry and wall-clock deadline prevent every write", async () => {
  assert.equal(EFFECT_CONFIRM_TIMEOUT_MS, 120000);
  for (const response of ["cancelled", "expired", false, undefined]) {
    const deps = fixture();
    deps.confirm = async () => response;
    const result = await addItemEffects(proposal(), deps);
    assert.equal(result.status, response === "expired" ? "expired" : "cancelled");
    assert.equal(deps.calls.length, 0);
  }
  const deps = fixture();
  let time = 0;
  deps.now = () => time;
  deps.confirm = async () => { time = 120001; return "confirmed"; };
  assert.equal((await addItemEffects(proposal(), deps)).status, "expired");
  assert.equal(deps.calls.length, 0);
});

test("stale documents and changed session identity/access prevent confirmed writes", async () => {
  for (const mutate of [
    deps => { deps.equipment.source.name = "Changed"; },
    deps => { deps.game.items.delete("armour"); },
    deps => { deps.game.user.isActiveGM = false; },
    deps => { deps.game.user.isGM = false; },
    deps => { deps.game.world.id = "other"; },
    deps => { deps.game.user.id = "other"; },
    deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.game.settings.get = () => false; },
    deps => { deps.game.socket.connected = false; }
  ]) {
    const deps = fixture();
    deps.confirm = async () => { mutate(deps); return "confirmed"; };
    await assert.rejects(addItemEffects(proposal(), deps));
    assert.equal(deps.calls.length, 0);
  }
  const deps = fixture();
  let connected = true;
  deps.assertConnection = () => { if (!connected) { throw new Error("Disconnected"); } };
  deps.confirm = async () => { connected = false; return "confirmed"; };
  await assert.rejects(addItemEffects(proposal(), deps), /Disconnected/);
  assert.equal(deps.calls.length, 0);
});

test("partial writes produce saved receipts and a retry adds only missing effects", async () => {
  const deps = fixture();
  const create = deps.power.createEmbeddedDocuments;
  deps.power.createEmbeddedDocuments = async () => { throw new Error("Write unavailable"); };
  const first = await addItemEffects(proposal(), deps);
  assert.equal(first.status, "incomplete");
  assert.equal(first.applied.length, 1);
  deps.power.createEmbeddedDocuments = create;
  const second = await addItemEffects(proposal(), deps);
  assert.equal(second.status, "updated");
  assert.equal(second.applied.length, 1);
  assert.equal(deps.equipment.effects.size, 1);
  assert.equal(deps.power.effects.size, 1);
});

test("cancelled creates and writes that persist before rejecting are reported honestly", async () => {
  const deps = fixture();
  deps.power.createEmbeddedDocuments = async () => [];
  assert.equal((await addItemEffects(proposal(), deps)).status, "incomplete");
  const create = deps.equipment.createEmbeddedDocuments;
  deps.equipment.effects.clear();
  deps.equipment.source.effects = [];
  deps.equipment.createEmbeddedDocuments = async (...args) => { await create(...args); throw new Error("Lost acknowledgement"); };
  const result = await addItemEffects(proposal(), deps);
  assert.equal(result.status, "incomplete");
  assert.equal(result.applied.length, 1);
});

test("validates the complete batch before prompting, excluding unsupported writes and executable input", async () => {
  const mutations = [
    args => { args.items[0].uuid = "Compendium.pack.Item.armour"; },
    args => { args.items[0].uuid = "Scene.scene.Token.token.Actor.pc.Item.armour"; },
    args => { args.items.push(args.items[0]); },
    args => { args.items[0].effects[0].flags = {}; },
    args => { args.items[0].effects[0].changes[0].key = "flags.macro.command"; },
    args => { args.items[0].effects[0].changes[0].type = "custom"; },
    args => { args.items[0].effects[0].changes[0].value = "alert(1)"; },
    args => { args.items[0].effects[0].changes[0].value = "@constructor.call(1)"; },
    args => { args.items[0].effects[0].duration = "daily"; },
    args => { args.items[0].effects[0].duration = "saveEnd"; },
    args => { args.items[0].effects[0].application = "self"; },
    args => { args.items[1].effects[0].application = "equipped"; },
    args => { args.items[1].effects[0].statuses = ["invented"]; },
    args => { args.items[1].effects[0].keywords = ["invented"]; },
    args => { args.items[1].effects[0].duration = "custom"; },
    args => { args.items[1].effects[0].saveDC = 12; },
    args => { args.items[0].effects = []; }
  ];
  for (const mutate of mutations) {
    const deps = fixture();
    const args = proposal();
    mutate(args);
    deps.confirm = () => assert.fail("Invalid batch must not prompt");
    await assert.rejects(addItemEffects(args, deps));
    assert.equal(deps.calls.length, 0);
  }
});

test("rejects duplicate mechanics within a proposal and permits valid dynamic/conditional formulas", async () => {
  const deps = fixture();
  const args = proposal();
  args.items[0].effects.push({ ...args.items[0].effects[0], key: "same-property" });
  await assert.rejects(addItemEffects(args, deps), /duplicate effect mechanics/);
  assert.equal(deps.calls.length, 0);
  const effect = proposal().items[1].effects[0];
  effect.useSourceActorData = false;
  effect.durationAction = "attacked";
  effect.changes = [
    { key: "power.defence.opp.vsAc.untyped", type: "add", value: "2 * @bloodied" },
    { key: "power.damage.fire.roll", type: "add", value: "1d6[fire]" },
    { key: "system.resistances.fire.res", type: "upgrade", value: "5 + scale(@lv, 1)" }
  ];
  assert.equal((await addItemEffects({ items: [{ uuid: deps.power.uuid, effects: [effect] }] }, deps)).status, "updated");
  const saved = deps.calls[0].sources[0];
  assert.equal(saved.system.useSourceActorData, false);
  assert.equal(saved.system.durationAction, "attacked");
});

test("only one pending batch is allowed and cancellation releases it", async () => {
  const deps = fixture();
  let cancel;
  deps.confirm = () => new Promise(resolve => { cancel = resolve; });
  const first = addItemEffects(proposal(), deps);
  await assert.rejects(addItemEffects(proposal(), deps), /awaiting confirmation/);
  cancel("cancelled");
  assert.equal((await first).status, "cancelled");
  deps.confirm = async () => "confirmed";
  assert.equal((await addItemEffects(proposal(), deps)).status, "updated");
});

test("manual-only Items remain visible in the report and never save", async () => {
  const deps = fixture();
  deps.confirm = async report => {
    assert.equal(report.items[0].notes, "Sustain and chosen ally need manual handling.");
    return "confirmed";
  };
  const result = await addItemEffects({ items: [{ uuid: "Item.armour", effects: [], notes: "Sustain and chosen ally need manual handling." }] }, deps);
  assert.equal(result.status, "unchanged");
  assert.equal(deps.calls.length, 0);
});

test("confirmation UI escapes source text, defaults to Cancel, expires, and rejects late clicks", async () => {
  for (const action of ["confirm", "cancel", "close", "expire", "late"]) {
    let options;
    let time = 0;
    class Dialog {
      constructor(data) { options = data; }
      render() {
        assert.equal(options.default, "cancel");
        assert.match(options.content, /2 minutes/);
        assert.ok(!options.content.includes("<script>"));
        assert.ok(options.content.includes("&lt;script&gt;"));
        if (action === "close") {
          options.close();
        } else if (action === "late") {
          time = 100;
          options.buttons.confirm.callback();
        } else if (action !== "expire") {
          options.buttons[action].callback();
        }
      }
      close() { options.close(); }
    }
    const receipt = { items: [{ name: "<script>", type: "power", uuid: "Item.x", notes: "<script>", effects: [] }] };
    const result = await confirmItemEffects(receipt, { Dialog, timeoutMs: 5, now: () => time });
    assert.equal(result, action === "confirm" ? "confirmed" : ["expire", "late"].includes(action) ? "expired" : "cancelled");
  }
});
