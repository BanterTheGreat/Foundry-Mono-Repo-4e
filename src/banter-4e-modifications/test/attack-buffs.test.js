import test from "node:test";
import assert from "node:assert/strict";
import { AttackBuffs } from "../scripts/modules/attack-buffs/attack-buffs.js";
import { findBonusLoss, resolveBuffBadges } from "../scripts/modules/attack-buffs/attack-buff-math.js";

test("typed replacement bonuses reduce the decisive contribution; untyped modifiers stack", () => {
  assert.equal(findBonusLoss({ power: [4, 2], untyped: [2, -1] },
    { power: [4, 2], untyped: [2, -1] }, { power: [2], untyped: [2, -1] }), 2);
  assert.equal(findBonusLoss({ power: [4, 2] }, { power: [4, 2] }, { power: [4] }), 0);
  assert.equal(findBonusLoss({ untyped: [2, -1] }, { untyped: [2, -1] }, { untyped: [-1] }), 2);
  assert.equal(findBonusLoss({ power: [6] }, { power: [4] }, { power: [] }), null);
});

test("decisive means a hit becomes a miss, with ties still hitting", () => {
  const badges = [{ name: "Bless", value: 2, loss: 2 }, { name: "Charge", value: 1, loss: 1 }];
  assert.deepEqual(resolveBuffBadges(badges, 21, 20, "", "hit").map(badge => badge.decisive), [true, false]);
  assert.deepEqual(resolveBuffBadges(badges, 21, 19, "", "hit").map(badge => badge.decisive), [false, false]);
  for (const [state, hit] of [["critical", "critical"], ["fumble", "fumble"], ["immune", "immune"], ["", "miss"], ["", ""]]) {
    assert.ok(resolveBuffBadges(badges, 21, 20, state, hit).every(badge => !badge.decisive));
  }
  assert.ok(resolveBuffBadges(badges, 21, undefined, "", "hit").every(badge => !badge.decisive));
});

/** Minimal system seam: deterministic values, keyword-filtered attack effects. */
function fixture() {
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = formula;
      this.isDeterministic = !formula.includes("d");
    }
    static replaceFormulaData(formula) {
      return formula;
    }
    evaluateSync() {
      return { total: Number(this.formula) };
    }
  };
  globalThis.CONFIG = { DND4E: { commonAttackBonuses: { comAdv: { label: "Combat Advantage" } } } };
  globalThis.game = { i18n: { localize: text => text } };
  const effect = (id, name, value, key = "power.attack.global.power") => ({
    id, uuid: `Actor.hero.ActiveEffect.${id}`, name, transfer: false,
    parent: { documentName: "Actor" }, system: { changes: [{ key, value }] },
  });
  const actor = {
    appliedEffects: [effect("bless", "Bless", "2"), effect("weak", "Lesser blessing", "1")],
    system: { modifiers: {} }, getRollData: () => ({}),
  };
  const item = { id: "power", actor, system: { attack: { formula: "5" } }, getRollData: () => ({ item: {} }) };
  const options = { bonuses: { power: [2, 1], untyped: [] } };
  const config = { targetOptions: options, commonAttackBonuses: { comAdv: { shouldApply: true, value: 2 } } };
  const utils = {
    getWeaponUse: () => null,
    async applyEffects(data, owner, power, weapon, type, extra, target, replay) {
      for (const active of owner.appliedEffects) {
        for (const change of active.system.changes) {
          if (change.key.startsWith(target ? "grants.attack.global." : "power.attack.global.")) {
            replay.bonuses[change.key.split(".").at(-1)].push(Number(change.value));
          }
        }
      }
    },
  };
  return { actor, item, options, config, utils, effect };
}

test("snapshot includes applied temporary buffs and common bonuses, excluding suppressed buffs", async () => {
  const { item, config, options, utils } = fixture();
  const badges = await AttackBuffs.snapshot({ item, config }, {}, options, utils);
  assert.deepEqual(badges, [
    { name: "Bless", value: 1, loss: 1, decisive: false },
    { name: "Combat Advantage", value: 2, loss: 2, decisive: false },
  ]);
  assert.deepEqual(options.bonuses.power, [2, 1], "replay must not mutate actual roll bonuses");
});

test("target-granted modifiers use the target's effects", async () => {
  const { actor, item, options, config, utils, effect } = fixture();
  actor.appliedEffects = [];
  const target = { actor: { ...actor, appliedEffects: [effect("opening", "Exposed", "2", "grants.attack.global.power")] } };
  options.bonuses.power = [2];
  assert.equal((await AttackBuffs.snapshot({ item, target, config }, {}, options, utils))[0].name, "Exposed");
});

test("dice buffs reuse the original evaluated value without rolling a second time", async () => {
  const { actor, item, options, config, utils, effect } = fixture();
  actor.appliedEffects = [effect("random", "Random blessing", "1d6")];
  options.bonuses.power = [5];
  const badges = await AttackBuffs.snapshot({ item, config }, {}, options, utils);
  assert.deepEqual(badges.map(badge => [badge.name, badge.loss]), [["Random blessing", 5], ["Combat Advantage", 2]]);
});

test("a suppressed random bonus takes over at its original rolled value", async () => {
  const { actor, item, options, config, utils, effect } = fixture();
  actor.appliedEffects = [effect("strong", "Strong blessing", "4"), effect("random", "Random blessing", "1d6")];
  options.bonuses.power = [4, 2];
  const badges = await AttackBuffs.snapshot({ item, config }, {}, options, utils);
  assert.deepEqual(badges.map(badge => [badge.name, badge.loss]), [["Strong blessing", 2], ["Combat Advantage", 2]]);
});

test("ambiguous dice bonus arrays are not credited", async () => {
  const { actor, item, options, config, utils, effect } = fixture();
  actor.appliedEffects = [effect("strong", "Strong blessing", "4"), effect("random", "Random blessing", "1d6")];
  options.bonuses.power = [4, 2, 1];
  const badges = await AttackBuffs.snapshot({ item, config }, {}, options, utils);
  assert.deepEqual(badges.map(badge => badge.name), ["Combat Advantage"]);
});

test("standard global attack bonuses are evaluated on a disposable clone", async () => {
  const { actor, item, options, config, utils, effect } = fixture();
  const buff = effect("global", "Battle blessing", "2", "system.modifiers.attack.power");
  actor.appliedEffects = [buff];
  actor.system.modifiers.attack = { power: 2 };
  actor.toObject = () => ({ effects: [{ _id: "global", disabled: false }], items: [] });
  let prepared = false;
  actor.clone = source => {
    assert.equal(source.effects[0].disabled, true);
    const clone = {
      ...actor, appliedEffects: [], system: { modifiers: { attack: { power: 0 } } },
      prepareData() { prepared = true; },
    };
    clone.items = new Map([[item.id, { ...item, actor: clone }]]);
    return clone;
  };
  const originalApply = utils.applyEffects;
  utils.applyEffects = async (...args) => {
    await originalApply(...args);
    const [, owner, , , , , target, replay] = args;
    if (!target && owner.system.modifiers.attack?.power) {
      replay.bonuses.power.push(owner.system.modifiers.attack.power);
    }
  };
  options.bonuses.power = [2];
  const badges = await AttackBuffs.snapshot({ item, config }, {}, options, utils);
  assert.equal(prepared, true);
  assert.equal(badges[0].name, "Battle blessing");
  assert.equal(badges[0].loss, 2);
  assert.equal(actor.system.modifiers.attack.power, 2);
  assert.equal(buff.disabled, undefined);
});

test("equipment transfers need a temporary duration; disabled and suppressed effects never appear", () => {
  const equipment = { transfer: true, parent: { documentName: "Item" }, system: {} };
  assert.equal(AttackBuffs.isTemporary(equipment), false);
  assert.equal(AttackBuffs.isTemporary({ ...equipment, system: { durationType: "endOfEncounter" } }), true);
  assert.equal(AttackBuffs.isTemporary({ ...equipment, isTemporary: true, disabled: true }), false);
  assert.equal(AttackBuffs.isTemporary({ ...equipment, isTemporary: true, isSuppressed: true }), false);
});

test("roll snapshots survive expiration and resolve independently per target", async () => {
  const { actor, item, config, options, utils } = fixture();
  class MultiRoll {
    rollArray = [];
    multirollData = [];
    async addNewRoll(parts, replacements, data, rollOptions) {
      const roll = { options: rollOptions, total: 21 };
      this.rollArray.push(roll);
      return roll;
    }
    populateMultirollData() {
      this.multirollData = this.rollArray.map(() => ({ hitstate: "hit" }));
    }
  }
  AttackBuffs.wrapRollClass(MultiRoll, utils);
  AttackBuffs.wrapRollClass(MultiRoll, utils);
  const rolls = new MultiRoll();
  AttackBuffs.captureAttack(item, null, null, config);
  const first = await rolls.addNewRoll([], [], {}, options);
  const nextOptions = { bonuses: { power: [2, 1], untyped: [] } };
  AttackBuffs.captureAttack(item, null, null, { ...config, targetOptions: nextOptions });
  const second = await rolls.addNewRoll([], [], {}, nextOptions);
  actor.appliedEffects = [];
  rolls.populateMultirollData({ targDefValArray: [21, 19] }, ["", ""]);
  assert.equal(first.options.banterAttackBuffs[0].name, "Bless");
  assert.equal(first.options.banterAttackBuffs[0].decisive, true);
  assert.equal(second.options.banterAttackBuffs[0].decisive, false);
  assert.deepEqual(JSON.parse(JSON.stringify(first.options)).banterAttackBuffs, first.options.banterAttackBuffs);
});

test("render uses text nodes, is idempotent, and hides private roll badges", () => {
  function node() {
    return { children: [], append(child) { this.children.push(child); }, setAttribute() {} };
  }
  globalThis.document = { createElement: node };
  const result = node();
  result.querySelector = selector => selector === ".dice-total" ? {} : result.children.find(child => child.className === "banter-attack-buffs");
  const root = { querySelectorAll: () => [{ querySelector: () => result }] };
  const message = { rolls: [{ options: { banterAttackBuffs: [{ name: "<img onerror=bad>", value: 2, decisive: true }] } }] };
  AttackBuffs.renderBadges({ ...message, isContentVisible: false }, root);
  assert.equal(result.children.length, 0);
  AttackBuffs.renderBadges(message, root);
  AttackBuffs.renderBadges(message, [root]);
  assert.equal(result.children.length, 1);
  assert.equal(result.children[0].children[0].textContent, "✦ <img onerror=bad> +2");
  assert.ok(!result.children[0].children[0].title.includes("AC"));
});

test("a temporary penalty is decisive only when removing it rescues an ordinary miss", () => {
  const badges = [
    { name: "Marked", value: -2, loss: -2 },
    { name: "Minor penalty", value: -1, loss: -1 },
    { name: "Bless", value: 2, loss: 2 },
  ];
  const resolved = resolveBuffBadges(badges, 18, 20, "", "miss");
  assert.deepEqual(resolved.map(badge => badge.decisivePenalty), [true, false, false]);
  assert.ok(resolved.every(badge => !badge.decisive));
  assert.equal(resolveBuffBadges(badges, 19, 20, "", "miss")[1].decisivePenalty, true);
  for (const [crit, hit] of [["critical", "critical"], ["fumble", "fumble"], ["immune", "immune"], ["", "hit"], ["", ""]]) {
    assert.ok(resolveBuffBadges(badges, 18, 20, crit, hit).every(badge => !badge.decisivePenalty));
  }
  assert.ok(resolveBuffBadges(badges, 18, undefined, "", "miss").every(badge => !badge.decisivePenalty));
});

test("snapshot retains negative effects and selected situational penalties", async () => {
  const { actor, item, options, config, utils, effect } = fixture();
  actor.appliedEffects = [effect("curse", "Curse", "-2", "power.attack.global.untyped")];
  options.bonuses = { power: [], untyped: [-2] };
  config.commonAttackBonuses = { marked: { shouldApply: true, value: -2 } };
  CONFIG.DND4E.commonAttackBonuses.marked = { label: "Marked" };
  const badges = await AttackBuffs.snapshot({ item, config }, {}, options, utils);
  assert.deepEqual(badges.map(badge => [badge.name, badge.loss]), [["Curse", -2], ["Marked", -2]]);
  assert.ok(resolveBuffBadges(badges, 18, 20, "", "miss").every(badge => badge.decisivePenalty));
});

test("enhancement describes the selected weapon without counting it as a temporary buff", async () => {
  const { item, config, options, utils } = fixture();
  utils.getWeaponUse = () => ({ name: "Thorned Spear +2", system: { enhance: 2 }, getRollData: () => ({ item: {} }) });
  const badges = await AttackBuffs.snapshot({ item, config }, {}, options, utils);
  assert.deepEqual(badges[0], {
    name: "Enchantment", source: "Thorned Spear +2", kind: "enhancement", value: 2, loss: 0, decisive: false,
  });
  assert.equal(resolveBuffBadges(badges, 20, 20, "", "hit")[0].decisive, false);
  assert.equal(resolveBuffBadges(badges, 18, 20, "", "miss")[0].decisivePenalty, false);
  assert.deepEqual(options.bonuses.power, [2, 1]);
  item.system.weaponType = "implement";
  assert.equal((await AttackBuffs.snapshot({ item, config }, {}, options, utils))[0].name, "Enchantment");
  utils.getWeaponUse = () => ({ name: "Ordinary spear", system: { enhance: 0 }, getRollData: () => ({ item: {} }) });
  assert.ok((await AttackBuffs.snapshot({ item, config }, {}, options, utils)).every(badge => badge.kind !== "enhancement"));
});

test("penalty rendering has a red class, a signed number, and the rescued-hit tooltip", () => {
  const created = [];
  globalThis.document = {
    createElement: () => {
      const element = { children: [], append(child) { this.children.push(child); }, setAttribute() {} };
      created.push(element);
      return element;
    },
  };
  const result = { querySelector: selector => selector === ".dice-total" ? {} : null, append() {} };
  const root = { querySelectorAll: () => [{ querySelector: () => result }] };
  AttackBuffs.renderBadges({ rolls: [{ options: { banterAttackBuffs: [
    { name: "Marked", value: -2, decisivePenalty: true },
    { name: "Weapon enhancement", value: 2, source: "Spear", kind: "enhancement" },
  ] } }] }, root);
  assert.equal(created[1].className, "banter-attack-buff banter-attack-buff--decisive-penalty");
  assert.equal(created[1].textContent, "✦ Marked -2");
  assert.equal(created[1].title, "Without Marked, this attack would hit.");
  assert.equal(created[2].className, "banter-attack-buff");
  assert.equal(created[2].textContent, "Enchantment +2");
  assert.equal(created[2].title, "Spear: listed enhancement +2.");
});
