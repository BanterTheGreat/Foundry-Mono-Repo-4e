# Shared equipment authoring (schema v1)

`equipment.json` is authoritative for all 45 weapons, six armor types, two
shields and nine printed weapon-property explanations in the Modern 4e book.
The rulebook reads it through `helpers/equipment.typ`; the builder content build
exports the same definitions. No compendium data or standard 4e defaults are
merged into these local rules.

```sh
python3 src/modern4e/scripts/equipment_content.py
python3 src/character-builder/content/build.py --modern-equipment
python3 src/character-builder/content/build.py --modern-equipment --check
python3 -m unittest discover -s src/character-builder/content -p 'test_modern_equipment.py' -v
npm run typst:compile
```

The build writes `modern-equipment-generated/modern4e.equipment-authoring/catalog.json`
under the builder content directory (ignored). `--output <directory>` changes
that destination. The standalone validator also accepts `--content <file>` and
`--output <file>` with optional `--check`. Validation precedes export.
Object keys and exported entry IDs are sorted; sections, rows and properties
retain their authored order. Outputs have no timestamps or local paths.

## Definitions and presentation

- `schemaVersion` versions this authoring contract independently of saved
  characters and runtime packages.
- `equipment` contains `ITEM` definitions, each with a persisted `id`,
  `presentation`, discriminated `equipment` profile and explicit runtime coverage.
  IDs use `modern4e.weapon.*`, `modern4e.armor.*` or `modern4e.shield.*` and must
  survive renames. Existing published-ID proof fixtures are not migrated here.
- `sections` records printed headings and ordered entry references. It does not
  determine identity or proficiency. Every definition appears exactly once.
- `properties` contains closed identifiers, display labels and complete rule
  explanations. `printRule` preserves which rules have printed sections.
  Off-hand, Reach, Ranged and Load have labels but no invented explanations:
  the original chapter does not define them separately.
- `armorRules` records the highest-of-Intelligence/Dexterity light-armor rule,
  the abilities affected by armor check penalties and the printed explanation.
  Individual armor entries carry no `acAbility`; heavy armor adds no ability
  contribution under this category rule. Values are direct Modern 4e points.

Typst owns tables, columns and page breaks. Shared strings stay literal; property
explanations support emphasis, inline code and bullet lists without executing
Typst source. Property labels are consistently capitalized, and the redundant
`None, Implement` cell now prints `Implement`; numerical values are preserved.

## Equipment profiles

Weapons specify proficiency category, melee/ranged attack category, required
hands, groups, proficiency bonus, structured damage dice and ordered property
usages. A property usage is an `id` with only its allowed parameters:

- `THROWN`: optional `range` with positive `normal` and `long` distances in squares.
- `RANGED`: required range in the same shape.
- `LOAD`: required `action` (`FREE`, `MINOR` or `STANDARD`).
- `BRUTAL`: optional positive `value`; absent retains the shared local Brutal rule
  (reroll 1–2), rather than implying Brutal 1.
- Other properties: identifier only. Local Versatile and High Crit scaling is
  preserved in the property explanations, not duplicated on every weapon.

Armor specifies proficiency key, LIGHT/HEAVY category, armor bonus, speed modifier
and armor check modifier. Shields specify proficiency key, occupied hands, shield
bonus and the same modifiers. Bonuses are nonnegative; penalties are negative
modifiers. Owning/equipping an item does not grant proficiency.

## Preserved gaps and runtime boundary

`null` is unavailable source data, not zero. Unarmed Attack has no printed
proficiency bonus; the Superior Ranged heading specifies no required hands.
Dagger has Thrown without a printed range. Quarterstaff, Glaive, Spiked Chain and
Sling Staff have Versatile while appearing under two-handed headings. These
facts remain intact, with explicit coverage limitations; this migration does not
resolve their mechanics. Throwing Shield remains a weapon, distinct from armor
shield entries. Plate's local +9 and the local weapon groups/dice are preserved.

The output kind is `modern4e.equipment-authoring`, **not an enabled v1 runtime
package**. Existing Kotlin v1 contracts cannot decode the new profiles, and this
change does not wire equipment calculations into the UI. All entries explicitly
declare UNIMPLEMENTED runtime coverage. Runtime interpretation, proficiency
checks, hand conflicts, shield application/stacking, magic-item composition,
and deliberate saved-ID migration remain separate work under the broader
[shared-content migration #29](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/29).
Characters continue to save item references and owned-instance state rather than
copying these definitions or calculated totals.
