# Mandatory class prerequisite cleanup

Removed requirements that every member of the local class already meets. Level,
ability, ancestry, skill, feat, specific build, and optional power requirements
remain. No feat effects changed. Class features were checked against their active
`classes/*.typ` definitions, rather than published class assumptions.

In particular, Rogue Weapon Talent, Combat Leader, Combat Superiority, specific
implement masteries, and individual cleric and paladin power choices remain
requirements because they are optional locally. Untiring Virtue's three miracle
options collectively cover every local paladin; that disjunction was removed.
Paladins also always have shield proficiency, so Warding Shield's proficiency
requirement was removed only in the paladin section.

| File | Feat | Previous requirements | New requirements |
| --- | --- | --- | --- |
| `classes/artificer.typ` | Enhanced Resistive Formula | 11th level, healing infusion | 11th level |
| `classes/artificer.typ` | Rapid Infusion | 11th level, at least one Healing Infusion | 11th level |
| `classes/avenger.typ` | Arbiter of Justice | 11th level, oath of enmity | 11th level |
| `classes/avenger.typ` | Avenging Surge | 11th level, Censure of Unity, oath of enmity | 11th level, Censure of Unity |
| `classes/avenger.typ` | Censure's Grip | 11th level, Censure of Pursuit, oath of enmity | 11th level, Censure of Pursuit |
| `classes/avenger.typ` | Devout Guidance | 11th level, divine guidance | 11th level |
| `classes/avenger.typ` | Exposing Oath | 11th level, oath of enmity | 11th level |
| `classes/avenger.typ` | Halo of Isolation | 11th level, oath of enmity | 11th level |
| `classes/avenger.typ` | Inexorable Pursuit | 11th level, Censure of Pursuit, oath of enmity | 11th level, Censure of Pursuit |
| `classes/avenger.typ` | Inspiring Oath | 11th level, oath of enmity | 11th level |
| `classes/avenger.typ` | Onslaught of Enmity | 11th level, oath of enmity | 11th level |
| `classes/avenger.typ` | Painful Oath | 11th level, oath of enmity | 11th level |
| `classes/avenger.typ` | Pledge of Retribution | 11th level, Censure of Retribution, oath of enmity | 11th level, Censure of Retribution |
| `classes/avenger.typ` | Protected Isolation | 11th level, Censure of Retribution, oath of enmity | 11th level, Censure of Retribution |
| `classes/barbarian.typ` | Charging Rampage | 11th level, Rampage | 11th level |
| `classes/barbarian.typ` | Explosive Rage Strike | 11th level, rage strike | 11th level |
| `classes/bard.typ` | Majestic Rescue | 11th level, majestic word | 11th level |
| `classes/cleric.typ` | Extended Healing | 11th level, healing word | 11th level |
| `classes/cleric.typ` | Gambler's Word | 11th level, healing word | 11th level |
| `classes/druid.typ` | Bolstered Swarm | 11th level, Primal Swarm, wild shape | 11th level, Primal Swarm |
| `classes/druid.typ` | Brutal Grappler Form | 11th level, wild shape | 11th level |
| `classes/druid.typ` | Commanding Form | 11th level, wild shape | 11th level |
| `classes/druid.typ` | Fierce Thrasher Form | 11th level, wild shape | 11th level |
| `classes/druid.typ` | Hunting Wolf Form | 11th level, wild shape | 11th level |
| `classes/druid.typ` | Pouncing Form | 11th level, Primal Predator, wild shape | 11th level, Primal Predator |
| `classes/druid.typ` | Quick Wild Shape | 11th level, wild shape | 11th level |
| `classes/druid.typ` | Scattering Swarm | 11th level, Primal Swarm, wild shape | 11th level, Primal Swarm |
| `classes/druid.typ` | Scuttling Crawler Form | 11th level, wild shape | 11th level |
| `classes/druid.typ` | Stalking Panther Form | 11th level, wild shape | 11th level |
| `classes/druid.typ` | Venomous Fang Form | 11th level, wild shape | 11th level |
| `classes/druid.typ` | Vital Form | 11th level, wild shape | 11th level |
| `classes/ranger.typ` | Bleeding Precision | 11th level, Hunter's Quarry | 11th level |
| `classes/ranger.typ` | Hunter's Advantage | 11th level, elf, Hunter's Quarry | 11th level, elf |
| `classes/ranger.typ` | Hunter's Resurgence | 11th level, Hunter's Quarry | 11th level |
| `classes/ranger.typ` | Prime Quarry | 11th level, 2 Wisdom, Hunter's Quarry, Prime Shot | 11th level, 2 Wisdom, Prime Shot |
| `classes/ranger.typ` | Wrathful Hunter | 11th level, tiefling, Hunter's Quarry | 11th level, tiefling |
| `classes/rogue.typ` | Bleeding Backstab | 11th level, Sneak Attack | 11th level |
| `classes/rogue.typ` | Disheartening Ambush | 11th level, Sneak Attack | 11th level |
| `classes/rogue.typ` | Dragon Breath Scoundrel | 11th level, dragonborn, Sneak Attack | 11th level, dragonborn |
| `classes/rogue.typ` | Infernal Sneak Attack | 11th level, tiefling, Sneak Attack | 11th level, tiefling |
| `classes/rogue.typ` | Opportunistic Sneak Attack | 11th level, Sneak Attack | 11th level |
| `classes/rogue.typ` | Unerring Ambush | 11th level, First Strike | 11th level |
| `classes/sorcerer.typ` | Arcane Flexibility | 11th level, Spell Source | 11th level |
| `classes/warden.typ` | Enhanced Font of Life | 11th level, Font of Life | 11th level |
| `classes/warden.typ` | Font of Vengeance | 11th level, Font of Life | 11th level |
| `classes/warden.typ` | Quickening Font | 11th level, Font of Life | 11th level |
| `classes/warden.typ` | Vengeful Grasp | 11th level, warden's grasp | 11th level |
| `classes/warden.typ` | Wellspring of Life | 11th level, Font of Life | 11th level |
| `classes/wizard.typ` | Second Implement | 11th level, Arcane Implement Mastery | 11th level |
| `classes/paladin.typ` | Untiring Virtue | 11th level, ardent vow, virtue's touch, or lay on hands | 11th level |
| `classes/paladin.typ` | Warding Shield | 11th level, proficiency with light or heavy shields | 11th level |
| `content/feats/paragon/fighter.json` | Daunting Challenge | 11th level, Combat Challenge | 11th level |
| `content/feats/paragon/fighter.json` | Marked Scourge | 11th level, Combat Challenge | 11th level |
| `content/feats/paragon/fighter.json` | Staggering Challenge | 11th level, Combat Challenge | 11th level |
| `content/feats/paragon/fighter.json` | Combat Opening | 11th level, Half-elf, Combat Challenge | 11th level, Half-elf |
