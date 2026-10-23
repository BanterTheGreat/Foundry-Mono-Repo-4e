# Power source utility replacement

The shared out-of-combat utility lists now use the PDF's new (`**`)
non-combat additions, with local exclusions and skill migrations (113 source cards), including dual-use additions, at levels 2, 6, and 10. Published index-only powers, revised existing powers, and additions
classified only as combat are excluded. General combat utilities and the
separate class-utility work are preserved.

The source is `content/reference/non-combat-utility-powers.json`; its recorded
SHA-256 matches the supplied PDF. Run `python3 scripts/import_source_utilities.py`
to regenerate `content/power-source-utilities.json`.

Grouping: Wizard/Warlock → Arcane; Cleric/Paladin → Divine;
Fighter/Rogue/Warlord → Martial. Ranger nature, tracking, foraging, harvesting,
and companion powers → Primal; remaining weapon/tactical Ranger powers → Martial
(the explicit list is in the importer). This Ranger split is a local adaptation,
including replacing their Martial keyword and Martial Practice designation
where assigned to Primal. Source totals: Arcane 34, Martial 35, Primal 21, Divine 23.
Mount-related, named, specific-weapon, and Renown exclusions are recorded in
`EXCLUDED_POWERS` in the importer. Shield-compatible powers remain. Charming
Rapscallion is now a level 2 Diplomacy skill utility in
`glossary/utility/utility-charisma.typ`, with Diplomacy proficiency required and
no Martial source restriction.

Local skill names, proficiency terminology, direct ability points, and Normal
DC terminology replace source terminology. Other printed DCs, costs, durations,
and requirements remain. Minimum level follows the enclosing source section,
including the two cards whose printed level disagrees with that section.
Source page citations are printed on every card.

Sharing a power source does not supply a beast companion, pact, or class feature.
Some powers depend on the source's optional systems (Warfare, Quick and
Dirty Fighting, Strongholds, and others). Those systems are not installed by
this replacement; the section explicitly requires the GM to use the relevant
system before those powers are usable. Original class names in rules can still
identify a feature, power reference, or class-specific rider. Level 16 and
higher powers are excluded from both generated lists by the importer.

## Generic skill utilities

`content/skill-utility-migrations.json` records the 58 powers moved from the
source lists and their required skills. After filtering out levels 16 and higher, the importer writes 41 of these to
`content/skill-utilities.json`; `glossary/utility/skill-utilities.typ` assembles
them with the existing Charming Rapscallion card. Each migrated power requires
proficiency in its assigned skill and retains its minimum level, other
prerequisites, and costs, without a power-source restriction. Optional
class-feature riders still require the named feature.

Of the original 84 reviewed candidates, 26 were retained in their source lists because they
only grant check bonuses (including bonus dice and bonuses through equipment
or Aid Another). These IDs are recorded in `bonusOnlyRetained`. Powers that
also grant movement, rerolls, extra actions, information, crafting effects,
or other capabilities were moved. Existing Charming Rapscallion is unchanged.

The migration metadata retains the higher-level assignments for reference.
Underworld Contact accepts an adventurer's past instead of requiring a rogue's.

## Additional published Primal utilities

`content/primal-utility-additions.json` adds ten published utilities verified
against the offline 4e compendium. The importer appends them after adapting
the PDF additions. Their original publication citations and entry links are
printed on the cards. They are shared by all Primal classes, and marked for
both combat and non-combat utility picks. Published mechanics and levels are
preserved; none requires a class feature or a specific weapon.

- Barbarian (2): Stonebreaker (2), Climber's Claws (6).
- Druid (3): Form of the Sprinting Elk (2), Meld into Stone (6), Animal Shapes (10).
- Warden (2): Sea Stride (6), Sylvan Trickery (10).
- Shaman (2): Primal Gust (10), Twilight's Veil (10).
- Seeker (1): Burrowing Stride (10).

These add ways to break obstacles, travel, climb, swim, hide, transform,
move creatures, and burrow. They are exceptions to the PDF-only selection
above, with a maximum of three additions from any single class.
