# NPC source fields in DnD4e 0.9.3

## Actor and calculations

The document type is exactly `"NPC"`, not `"npc"`. Fields below are relative to `system`. Source: [NPCData](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/actor/npc.mjs), [combatant schema](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/actor/templates/combatant.mjs), [details schema](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/actor/templates/details.mjs), [Actor4e](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/actor.mjs).

| Printed value | Stored source field |
| --- | --- |
| Level, XP | `details.level`, `details.exp` |
| Brute, elite | `details.role.primary: "brute"`, `details.role.secondary: "elite"` |
| Leader suffix | `details.role.leader: true` |
| Large shadow humanoid, troll | `details.size: "lg"`, `origin: "shadow"`, `type: "humanoid"`, `other: "troll"` within details |
| HP | `attributes.hp.value` and `.max`; `.autototal: false` |
| Bloodied | Derived as `floor(hp.max / 2)`; avoid supplying it |
| AC, Fortitude, Reflex, Will | `defences.ac.base`, `.fort.base`, `.ref.base`, `.wil.base` |
| Initiative | `attributes.init.base` |
| Saving Throws +2 | `details.saves.value: 2` |
| Action Points 1 | `actionpoints.value: 1` |
| Str 22 | `abilities.str.value: 22` (and con/dex/int/wis/cha) |
| Perception +13 | `skills.prc.base: 13` |
| Resist 10 necrotic | `resistances.necrotic.res: 10` |
| Vulnerable 5 fire | `resistances.fire.vuln: 5` |
| Immune poison | `resistances.poison.immune: true` |
| Other resistance/immunity | String arrays under `untypedResistances.resistances`, `.vulnerabilities`, `.immunities` |

Set `advancedCals: false` for imports. With simple NPC math, defenses, initiative and skills start at the supplied base; ability/half-level bonuses are not added again. The world setting `npcMathOptions` affects actors when that field is omitted. Creation explicitly overrides it to false. Typed bonuses still apply and remain usable through later gameplay effects. Saving throw value is the printed bonus, not a d20 roll or save DC.

Ability modifiers are `floor((score - 10) / 2)`; the stat block's parenthesized ability checks include `floor(level / 2)`. Store scores, not those checks. Tier is 1/2/3 for heroic/paragon/epic; MCP derives it from level. HP autototal adds Constitution and per-level terms, so disable it for printed HP. Elite/solo role labels do not replace explicit HP, save and action point entries.

## Skills

All bases are totals under simple NPC math. Supply every skill to avoid zero defaults. For unlisted skills, use ability modifier plus half level; listed skills and Perception use their printed totals. Do not also add training to a printed total. Source: `calcSkillNPC` in Actor4e and [CONFIG](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/config.mjs).

| Ability | Skill keys |
| --- | --- |
| Str | `ath` Athletics |
| Con | `end` Endurance |
| Dex | `acr` Acrobatics, `stl` Stealth, `thi` Thievery |
| Int | `arc` Arcana, `his` History, `rel` Religion |
| Wis | `dun` Dungeoneering, `hea` Heal, `ins` Insight, `nat` Nature, `prc` Perception |
| Cha | `blu` Bluff, `dip` Diplomacy, `itm` Intimidate, `stw` Streetwise |

Prepared skills use `.total`, not `.value`. Passives derive from `10 + skill.total`.

## Movement, senses, languages and size

Speed 8 is `movement.base.base: 8`; walking defaults to `@base + @armour`. Climb 8 is `movement.climb.formula: "8"`. Burrow/fly/swim/teleport use the same formula field. Store formulas as strings, not prepared movement `.value`. Preserve traits such as hover or spider climb in the mode's `.traits` or movement notes. Sources: [speed schema](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/actor/templates/speed.mjs), Actor4e movement preparation.

Basic sight keys: `senses.basic` is `"nv"` normal, `"lv"` low-light, `"dv"` darkvision, `"blind"` blind. Special senses use `senses.special.bs/ts/tr: {value: true, range: <number>}` for blindsight/tremorsense/truesight. Add `senses.allAround` for all-around vision, and `.custom`/`.notes` for other text. Source: [senses schema](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/actor/templates/senses.mjs).

Languages use `languages.spoken: {value: ["Primordial"], custom: "Undercommon"}`; scripts are separately under `languages.script`. Spoken keys are case-sensitive: `Abyssal`, `Common`, `DeepSpeech`, `Draconic`, `Dwarven`, `Elven`, `Giant`, `Goblin`, `Primordial`, `Supernal`. Undercommon is absent from CONFIG and goes in `custom`, with other custom languages separated by semicolons. `details.alignment` is free text on the NPC sheet, e.g. `"Chaotic Evil"`; the legacy CONFIG alignment keys are not used by that input.

Sizes: `tiny`, `sm`, `med`, `lg`, `huge`, `grg`. Token widths/heights are 1, 1, 1, 2, 3, 4 respectively. Actor size synchronization occurs on update in 0.9.3; MCP supplies correct prototype dimensions at creation. NPC tokens are unlinked and hostile by default.

## Powers and traits

Source: [PowerData](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/item/power.mjs), [attack/damage schema](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/item/templates/attack-damage.mjs), [FeatureData](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/item/feature.mjs), [Item4e roll construction](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/item.mjs).

Embedded actions are `{name, type: "power", system: {...}}`. Use `powerType: "inherent"`, `powersource: ""` unless a source is printed, and `prepared: true` (the default). `useType` is `atwill`, `encounter`, `daily`, or `recharge`; preserve recharge text in `rechargeRoll`/`rechargeCondition`. Action keys: `standard`, `move`, `minor`, `free`, `reaction`, `interrupt`, `opportunity`, `none`.

Set `weaponType: "none"`, `weaponUse: "none"` for standalone monster attacks. Range keys: `melee`, `reach`, `range` (ranged), `closeBurst`, `closeBlast`, `rangeBurst`, `rangeBlast`, `wall`, `personal`, `touch`, `special`. Set `rangePower` as a string and `area` for burst/blast size. `target` is a string such as `"One creature"`.

| Printed power entry | Power source fields |
| --- | --- |
| +15 vs. Reflex | `attack.isAttack: true`, `.formula: "15"`, `.ability: ""`, `.def: "ref"` |
| Basic | `attack.isBasic: true` |
| 4d6+12 necrotic damage | `hit.isDamage: true`, `.formula: "4d6+12"`; `damageType.necrotic: true` |
| Critical damage | `hit.critFormula: "36"` for 4d6+12; use the maximum dice result |
| Hit rider | Include the complete damage and rider text in `hit.detail` |
| Miss | `miss.detail`; `.halfDamage: true` where printed, and an appropriate `.formula` |
| Effect | `effect.detail` |
| Requirement | `requirement` (singular); `requirements` is a separate legacy field |
| Trigger / sustain | `trigger`, `sustain.actionType`, `sustain.detail` |
| Flavor/full rules | `description.value` (HTML accepted) |

Attack `.formula` is the bonus expression; the system supplies the d20. Never prepend `1d20` or use a character formula with half level/ability on top of a printed total. `hit.formula` is primary damage. `damage.parts` is additional damage and would double count the primary damage if repeated there. Additional parts use `{formula: "1d6", type: ["fire"]}` objects, not old tuple arrays. Damage types: `acid`, `cold`, `fire`, `force`, `lightning`, `necrotic`, `physical`, `poison`, `psychic`, `radiant`, `thunder`; `damage` means all damage for resistances and `ongoing` means ongoing. Keyword flags and damage-type flags are separate; use `keywordsCustom` for printed non-damage keywords supported as text by the tool.

For compound actions such as “use shadow claws twice,” set `attack.isAttack: false`, `hit.isDamage: false`, `hit.formula: ""`, `hit.critFormula: ""`, and preserve the instructions in `effect.detail`. Use `powerSubtype: "utility"` for these descriptive actions. Default powers assume an attack and weapon damage; explicitly disable those defaults on non-attacks.

Passive traits are `{name, type: "feature", system: {featureType: "trait", description: {value: "<p>Full trait rules.</p>"}}}`. Active auras can be represented descriptively as traits; setting an aura size alone does not implement an Aura Effects module aura. Preserve conditional regeneration, grab DCs, saving throw durations and special target restrictions in text. Automation requires a separate implementation.
