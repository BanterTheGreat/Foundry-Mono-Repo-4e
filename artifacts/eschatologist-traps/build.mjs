import { writeFile } from 'node:fs/promises';
import { validateNpcRequest } from '../../src/foundry-mcp/shared/npc-data.js';

const feature = (name, text) => ({ name, type: 'feature', system: { featureType: 'trait', description: { value: `<p>${text}</p>` } } });
const shotgunFlavor = 'As you slide the door open, a wire snaps and a trio of shotguns—one at floor level of the car, one pointed down from the ceiling, and one mounted underneath the car in its wheel area—discharge in your face.';
const mineFlavor = 'Your foot snags something, and then you’re hurled back by an explosion.';
const clampFlavor = 'You step on what looks like a discarded burlap sack, but there’s a click, and your leg feels like it’s been bitten by a dragon.';

/** Build an independently rollable trap attack. */
function attack(name, flavor, bonus, defense, formula, crit, rangeType, target, hit, options = {}) {
  return {
    name, type: 'power',
    system: {
      powerType: 'inherent', powersource: '', prepared: true,
      useType: 'encounter', actionType: 'reaction', weaponType: 'none', weaponUse: 'none',
      rangeType, rangePower: '1', target,
      attack: { isAttack: true, isBasic: false, ability: '', formula: String(bonus), def: defense },
      hit: { isDamage: true, formula, critFormula: crit, detail: hit },
      damageType: {},
      description: { chat: flavor, value: `<p><em>${flavor}</em></p><p>${hit}</p>` },
      ...options
    }
  };
}

/** Build an inert object NPC with explicit placeholder combat statistics. */
function actor(name, level, xp, items) {
  const halfLevel = Math.floor(level / 2);
  const notes = 'Object trap. The source supplies no defenses, initiative, abilities, size, movement, saves, or action points. Sheet placeholders: Medium, abilities 10, defenses 10, initiative 0, speed 0, save bonus 0, action points 0; unlisted skills use half level. HP 1 represents the minion classification; confirm object durability with the GM. Detection DCs are checks made by creatures, not this actor’s Perception skill. Triggers and conditional effects require GM adjudication.';
  return {
    name, type: 'NPC', img: 'icons/svg/trap.svg',
    system: {
      advancedCals: false,
      details: { level, tier: 1, exp: xp, size: 'med', type: '', origin: '', other: 'Object; Trap', role: { primary: '', secondary: 'minion', leader: false }, saves: { value: 0 } },
      attributes: { hp: { value: 1, max: 1, autototal: false }, init: { base: 0 } },
      abilities: Object.fromEntries('str con dex int wis cha'.split(' ').map(key => [key, { value: 10 }])),
      defences: Object.fromEntries('ac fort ref wil'.split(' ').map(key => [key, { base: 10 }])),
      skills: Object.fromEntries('acr arc ath blu dip dun end hea his ins itm nat prc rel stl stw thi'.split(' ').map(key => [key, { base: halfLevel }])),
      movement: { base: { base: 0 }, walk: { formula: '0' }, run: { formula: '0' }, charge: { formula: '0' }, shift: { formula: '0' }, notes: 'Stationary object.' },
      actionpoints: { value: 0 }, biography: `<p>${notes}</p>`, powerGroupTypes: 'action', powerSortTypes: 'none'
    },
    prototypeToken: { name, actorLink: false, disposition: -1, width: 1, height: 1, texture: { src: 'icons/svg/trap.svg' } },
    items
  };
}

const actors = [
  actor('Shotgun Trap', 7, 75, [
    feature('Detect', 'Perception DC 19: You barely manage to notice a taut wire attached to the door, leading inside the rail car. DC 24: Hidden in the mechanism under the train is a shotgun, pointed right at you.'),
    feature('Countermeasures', '<strong>Disable:</strong> Thievery DC 24 to open the door safely and disarm the trap. Failing by 5 or more triggers it.<br><strong>Dodge:</strong> A character who suspects a trap can hide under the level of the rail car floor as he opens the door, and so is only hit by the shotgun in the train wheels. The attack deals 1d10+2 damage, or 1d10+14 on a critical hit. Use the separate Dodge damage attack to represent this situation.'),
    attack('Point Blank Blast', shotgunFlavor, 10, 'ref', '3d10+6', '3d10+42', 'range', 'Triggering creature', '3d10+6 damage, or 3d10+42 on a critical hit.', { trigger: 'A creature opens the trapped door.', miss: { halfDamage: true, formula: '', detail: 'Half damage.' }, effect: { detail: 'Secondary Attack: Repeat the attack against each other creature in Close Blast 3, but it deals half damage on a hit, and none on a miss. Use the separate Secondary Attack power once per other creature.' } }),
    attack('Point Blank Blast — Secondary Attack', shotgunFlavor, 10, 'ref', 'floor((3d10+6)/2)', 'floor((3d10+42)/2)', 'closeBlast', 'Each other creature in the blast (excluding the triggering creature)', 'Half of the primary attack damage on a hit; none on a miss.', { area: '3', rangePower: '3', trigger: 'Resolve after Point Blank Blast; part of the same encounter use.', miss: { halfDamage: false, formula: '', detail: 'None.' }, special: 'This is a component of Point Blank Blast, not an additional independent use. Roll against each other creature in Close Blast 3.' }),
    attack('Point Blank Blast — Dodge damage', shotgunFlavor, 10, 'ref', '1d10+2', '1d10+14', 'range', 'Triggering creature hiding below the rail car floor', '1d10+2 damage, or 1d10+14 on a critical hit.', { trigger: 'A creature who suspects the trap hides below the rail car floor while opening the trapped door.', requirement: 'Apply the Dodge countermeasure; replaces primary damage, not an additional attack.', miss: { halfDamage: true, formula: '', detail: 'Half damage, as for Point Blank Blast.' }, special: 'Only the shotgun in the train wheels can hit this creature. Resolve the other creatures’ secondary attacks normally.' })
  ]),
  actor('Tripwire Mine Trap', 7, 75, [
    feature('Detect', 'Perception DC 24: You react to the pressure of a wire against your shin fast enough to stop walking before you trigger the trap.'),
    feature('Countermeasures', '<strong>Disable:</strong> Thievery DC 24 to disable the trap. Failing by 5 or more triggers it.<br><strong>Step Over:</strong> A character aware of the trap can step over it (Dexterity DC 4).'),
    attack('Mine Explosion', mineFlavor, 10, 'ref', '5d6', '30', 'closeBurst', 'Creatures in burst', '5d6 damage and the target is knocked prone.', { rangePower: '2', area: '2', trigger: 'A creature enters the trapped space.', miss: { halfDamage: true, formula: '', detail: 'Half damage. The target is not knocked prone on a miss.' } })
  ]),
  actor('Piercing Clamp Trap', 2, 31, [
    feature('Detect', 'Perception DC 20: One of the burlap sacks on the floor has something metallic peeking through.'),
    feature('Countermeasures', '<strong>Disable:</strong> Thievery DC 20 to disable the trap.<br><strong>Step Over:</strong> A character aware of the trap can step over it with a Dexterity check (DC 4).'),
    attack('Foot Grab', clampFlavor, 8, 'ac', '1d6+2', '8', 'melee', 'Triggering creature', '1d6+2 damage, and the target is grabbed by its foot, if it has one (escape DC 18). Until the grab ends, the target takes ongoing 5 damage. Each time the target makes an escape attempt against the grab, the target takes 5 damage. If the trap drops the target below 1 hit point, the target loses the foot.', { trigger: 'A creature enters the trapped space.', miss: { halfDamage: false, formula: '', detail: 'No miss effect specified.' } })
  ])
];

for (const data of actors) {
  validateNpcRequest({ name: data.name, folder: 'Eschatologist', requestId: `eschatologist-${data.name.toLowerCase().replaceAll(' ', '-')}-20261008`, system: data.system, items: data.items });
  await writeFile(new URL(`./${data.name.toLowerCase().replaceAll(' ', '-')}.json`, import.meta.url), JSON.stringify(data, null, 2) + '\n');
}

// The user executes this script macro in Foundry; the agent does not run it.
const macro = `// Create three DnD4e 0.9.3 trap NPCs in Eschatologist. Run once as GM.\nif (!game.user.isGM) {\n  throw new Error('Run this macro as GM.');\n}\nif (game.system.id !== 'dnd4e' || game.system.version !== '0.9.3') {\n  throw new Error('These actors target DnD4e 0.9.3.');\n}\nconst data = ${JSON.stringify(actors, null, 2)};\nconst folders = game.folders.filter(folder => folder.type === 'Actor' && folder.name === 'Eschatologist');\nif (folders.length > 1) {\n  throw new Error('Multiple Actor folders named Eschatologist; choose a destination before importing.');\n}\nconst destination = folders[0] ?? await Folder.create({ name: 'Eschatologist', type: 'Actor' });\nconst existing = data.filter(entry => game.actors.some(actor => actor.name === entry.name && actor.folder?.id === destination.id));\nif (existing.length) {\n  throw new Error('Trap actors already exist in Eschatatologist: ' + existing.map(entry => entry.name).join(', '));\n}\nconst created = await Actor.createDocuments(data.map(entry => ({ ...entry, folder: destination.id })));\nui.notifications.info('Created ' + created.length + ' trap NPCs in Eschatologist.');\n`;
await writeFile(new URL('./create-traps.js', import.meta.url), macro);
console.log(`Validated ${actors.length} actor imports and generated the GM creation macro.`);
