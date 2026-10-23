import test from "node:test";
import assert from "node:assert/strict";
import { SkillBuffs } from "../scripts/modules/skill-buffs/skill-buffs.js";
import { AttackBuffs } from "../scripts/modules/attack-buffs/attack-buffs.js";

/** A prepared actor fixture with typed item stacking and named sheet bonuses. */
function fixture() {
  const effect = (id, value, type = "item") => ({
    _id: id, name: id, system: { changes: [{ key: `system.skills.ste.${type}`, value }] },
  });
  const source = {
    system: {
      skills: { ste: { training: 5, bonus: [{ name: "Guidance", active: true, value: 1 }], armourCheck: true } },
      skillTraining: { trained: { value: 5, untyped: 0 }, expertise: { value: 8, untyped: 0 } },
      modifiers: { skills: { bonus: [] } },
    },
    effects: [],
    items: [
      { _id: "boots", name: "Quiet Boots", type: "equipment", system: { equipped: true }, effects: [effect("boot-bonus", 2)] },
      { _id: "cloak", name: "Shadow Cloak", type: "equipment", system: { equipped: true }, effects: [effect("cloak-bonus", 1)] },
    ],
  };
  class Actor {
    constructor(raw) {
      this.source = structuredClone(raw);
      this.prepareData();
    }
    toObject() {
      return structuredClone(this.source);
    }
    clone(raw) {
      return new Actor(raw);
    }
    prepareData() {
      this.system = structuredClone(this.source.system);
      this.items = this.source.items.map(raw => ({ ...structuredClone(raw), id: raw._id, uuid: `Actor.hero.Item.${raw._id}`, documentName: "Item" }));
      this.appliedEffects = [
        ...this.source.effects.map(raw => ({ ...structuredClone(raw), id: raw._id, uuid: `Actor.hero.ActiveEffect.${raw._id}`, parent: { documentName: "Actor" } })),
        ...this.items.filter(item => item.system.equipped).flatMap(item => item.effects.map(raw => ({
          ...raw, id: raw._id, uuid: `${item.uuid}.ActiveEffect.${raw._id}`, parent: item,
        }))),
      ].filter(effect => !effect.disabled);
      const skill = this.system.skills.ste;
      const active = this.appliedEffects.flatMap(effect => effect.system.changes);
      const itemBonus = Math.max(0, ...active.filter(change => change.key.endsWith(".item")).map(change => change.value));
      const untyped = active.filter(change => change.key.endsWith(".untyped")).reduce((sum, change) => sum + change.value, 0);
      const training = skill.training === 5 ? 5 : skill.training === 8 ? 8 : 0;
      const manual = [...skill.bonus, ...this.system.modifiers.skills.bonus].filter(bonus => bonus.active).reduce((sum, bonus) => sum + bonus.value, 0);
      const armour = this.items.filter(item => item.system.equipped && item.system.armour?.skillCheck && skill.armourCheck)
        .reduce((sum, item) => sum + Math.abs(item.system.armour.skillCheckValue), 0);
      skill.total = 3 + training + manual + itemBonus + untyped - armour;
    }
  }
  return { actor: new Actor(source), source, Actor, effect };
}

test("skill snapshot shows proficiency, named manual buffs, and only contributing items", () => {
  const { actor } = fixture();
  const snapshot = SkillBuffs.snapshot(actor, "ste");
  assert.equal(snapshot.dc, null);
  assert.deepEqual(snapshot.badges.map(badge => [badge.name, badge.value, badge.loss]), [
    ["Proficiency", 5, 5], ["Guidance", 1, 1], ["Quiet Boots", 1, 1],
  ]);
  assert.equal(actor.system.skills.ste.total, 11);
  assert.equal(actor.appliedEffects.length, 2);
});

test("multiple item effects form one badge; unequipped items contribute nothing", () => {
  const { source, Actor, effect } = fixture();
  source.items[0].effects.push(effect("extra", 1, "untyped"));
  source.items[1].system.equipped = false;
  const snapshot = SkillBuffs.snapshot(new Actor(source), "ste", 15);
  assert.deepEqual(snapshot.badges.map(badge => [badge.name, badge.loss]), [
    ["Proficiency", 5], ["Guidance", 1], ["Quiet Boots", 3],
  ]);
  assert.equal(snapshot.dc, 15);
});

test("untrained skills omit proficiency, expertise uses its configured bonus, and inactive named buffs disappear", () => {
  const { source, Actor } = fixture();
  source.system.skills.ste.training = 0;
  source.system.skills.ste.bonus[0].active = false;
  assert.deepEqual(SkillBuffs.snapshot(new Actor(source), "ste", "").badges.map(badge => badge.name), ["Quiet Boots"]);
  source.system.skills.ste.training = 8;
  assert.equal(SkillBuffs.snapshot(new Actor(source), "ste").badges[0].name, "Expertise");
  assert.equal(SkillBuffs.snapshot(new Actor(source), "ste").badges[0].value, 8);
});

test("temporary penalties and equipped armour penalties retain their names and signs", () => {
  const { source, Actor, effect } = fixture();
  source.effects.push(effect("Curse", -2, "untyped"));
  source.items.push({ _id: "armour", name: "Chainmail", type: "equipment", effects: [], system: {
    equipped: true, armour: { skillCheck: true, skillCheckValue: -1 },
  } });
  source.system.modifiers.skills.bonus.push({ name: "Inspiration", active: true, value: 2 });
  const snapshot = SkillBuffs.snapshot(new Actor(source), "ste", "12");
  assert.equal(snapshot.badges.find(badge => badge.name === "Curse").loss, -2);
  assert.equal(snapshot.badges.find(badge => badge.name === "Chainmail (armour penalty)").loss, -1);
  assert.equal(snapshot.badges.find(badge => badge.name === "Inspiration").value, 2);
  assert.equal(snapshot.dc, 12);
});

test("overlapping skill calls retain independent serializable snapshots and preserve existing options", () => {
  const { actor, Actor } = fixture();
  const calls = [];
  Actor.prototype.rollSkill = function(skillId, options) {
    calls.push(options);
    return "rolled";
  };
  SkillBuffs.wrapActorClass(Actor);
  SkillBuffs.wrapActorClass(Actor);
  const originalOptions = { dc: 15, options: { flags: { other: { keep: true } } } };
  assert.equal(actor.rollSkill("ste", originalOptions), "rolled");
  actor.system.skills.ste.training = 0;
  actor.rollSkill("ste", { dc: 10 });
  const first = calls[0].options.flags["banter-4e-modifications"].skillCheck;
  const second = calls[1].options.flags["banter-4e-modifications"].skillCheck;
  assert.equal(first.dc, 15);
  assert.equal(second.dc, 10);
  assert.equal(first.badges[0].name, "Proficiency");
  assert.ok(second.badges.every(badge => badge.name !== "Proficiency"));
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.deepEqual(originalOptions, { dc: 15, options: { flags: { other: { keep: true } } } });
  assert.equal(calls[0].options.flags.other.keep, true);
  actor.rollSkill("ste", { dc: 10, targetValue: 20 });
  assert.equal(calls[2].options.flags["banter-4e-modifications"].skillCheck.dc, 20);
});

test("skill badge rendering highlights against a known DC, without automatic natural-one failure", () => {
  const created = [];
  globalThis.document = { createElement: () => {
    const element = { append() {}, setAttribute() {} };
    created.push(element);
    return element;
  } };
  const result = { querySelector: selector => selector === ".dice-total" ? {} : null, append() {} };
  const root = { querySelectorAll: () => [{ querySelector: () => result }] };
  const render = (total, dc, badge) => {
    created.length = 0;
    AttackBuffs.renderBadges({
      rolls: [{ total, dice: [{ faces: 20, results: [{ result: 1 }] }] }],
      flags: { "banter-4e-modifications": { skillCheck: { dc, badges: [badge] } } },
    }, root);
    return created[1];
  };
  assert.equal(render(15, 15, { name: "Proficiency", value: 5, loss: 5 }).title, "Without Proficiency, this check would fail.");
  assert.equal(render(14, 15, { name: "Curse", value: -2, loss: -2 }).title, "Without Curse, this check would succeed.");
  assert.equal(render(15, null, { name: "Proficiency", value: 5, loss: 5 }).className, "banter-attack-buff");
  assert.equal(render(15, 15, { name: "Dexterity", kind: "ability", score: 16, value: 3, loss: 0 }).title, "Dexterity 16: +3 ability modifier.");
});

test("ability badges follow the configured skill ability, hide zero, and preserve negative modifiers", () => {
  const { actor } = fixture();
  actor.system.abilities = { dex: { value: 16, mod: 3 }, wis: { value: 8, mod: -1 } };
  actor.system.skills.ste.ability = "dex";
  assert.deepEqual(SkillBuffs.snapshot(actor, "ste").badges[0], {
    name: "Dexterity", kind: "ability", score: 16, value: 3, loss: 0, decisive: false,
  });
  actor.system.skills.ste.ability = "wis";
  assert.equal(SkillBuffs.snapshot(actor, "ste").badges[0].name, "Wisdom");
  assert.equal(SkillBuffs.snapshot(actor, "ste").badges[0].value, -1);
  actor.system.skills.ste.mod = 0;
  assert.ok(SkillBuffs.snapshot(actor, "ste").badges.every(badge => badge.kind !== "ability"));
  actor.system.skills.ste.absolute = 20;
  assert.ok(SkillBuffs.snapshot(actor, "ste").badges.every(badge => badge.kind !== "ability"));
});
