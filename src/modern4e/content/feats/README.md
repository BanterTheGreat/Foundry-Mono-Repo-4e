# Shared Modern 4e feats

Follow the [shared Modern 4e content model](../../../../docs/modern4e-content-model.md)
when extending these definitions or migrating powers, classes, ancestries and
other entry types. Identity, access, prerequisites and selection rules
form a reusable base; the contract below describes the implemented feat subset.

These JSON files are the authoritative Modern 4e feat definitions for Typst and
Character Builder build-time content. Published compendium text does not replace
their local rules. File grouping, array order and Typst page breaks retain book
layout; moving a definition does not change its identity or access.

Each file has `schemaVersion: 2` and a `feats` array. A printed placement may instead
contain only `{"ref": "modern4e.feat.<stored-id>"}`, referring to a full definition
in another registered section. References cannot override fields or chain; unknown
and repeated section references fail validation. Typst resolves the same definition
while the runtime catalog exports it once. Register every JSON file in
`../feat-sections.json`; both consumers use this inventory for cross-references.
The validator is `../../scripts/feats.py`. Run its tests through the Character
Builder content suite documented in the repository's `tests/README.md`.

## Definition

```json
{
  "id": "modern4e.feat.deep-gash",
  "title": "Deep Gash",
  "access": {
    "type": "entry",
    "entryId": "modern4e.class.fighter"
  },
  "prerequisites": {
    "type": "abilityPoints",
    "ability": "CONSTITUTION",
    "minimum": 3
  },
  "selection": {
    "maximum": 1,
    "constraints": []
  },
  "description": "When you deal ongoing damage ..."
}
```

- **ID:** suggest `modern4e.feat.` plus a title slug when creating the entry,
  then store it permanently. Renames never regenerate IDs. Same-title entries
  have explicit suffixes; the migration preserves variants rather than merging
  their potentially different rules. All IDs must be unique.
- **Access:** `always` means general access, an `entry` references a class or
  ancestry, and `allOf`/`anyOf` combine those gates. Access is checked alongside
  prerequisites. A feat in an ancestry/class combination section has ancestry
  access plus its printed class prerequisite. Section names have no runtime
  meaning. Campaign approval is a future, additional restriction.
- **Prerequisites:** one condition tree, using the vocabulary below. `always`
  means no additional printed requirement. Typst generates the printed line;
  do not add an independent `requirements` string.
- **Description:** unchanged local effect prose. Supports `*bold*`, `_emphasis_`,
  blank-line paragraphs and `- ` bullet paragraphs. It is text, never executable
  Typst or a source of automatically inferred rules.
- **Optional provenance:** existing `source` and `note` strings remain intact.
- **Selection and choices:** every feat explicitly declares its occurrence limit;
  five repeatable feats also declare distinct-choice or armor-advancement rules.
  Optional `choices` describe granted selections independently of the constraints.
  See the [selection contract](../../../../docs/modern4e-selection-rules.md)
  for scopes, exhaustion behavior and pending option catalogs. Typst generates
  repetition Special paragraphs from this data.
- **Multiclass:** `tags: ["MULTICLASS"]` classifies a multiclass feat.
  `multiclassFor` optionally identifies its target class. That target is not a
  requirement to already belong to that class. For feat and paragon-path prerequisites, an explicitly declared target counts as
  class membership (including its class source). It does not open class power pools
  or grant equipment proficiencies. Granted features qualify only when actually
  represented as grants; multiclass exclusivity remains unimplemented.

## Condition vocabulary

| Type | Fields | Meaning |
| --- | --- | --- |
| `always` | — | No restriction |
| `allOf` | `conditions` | Every child must hold |
| `anyOf` | `conditions` | At least one child must hold |
| `level` | `minimum` | Minimum character level |
| `abilityPoints` | `ability`, `minimum` | Direct Modern 4e points, never vanilla scores |
| `proficiency` | `skill` | Proficiency in one of the 16 Modern 4e skills |
| `equipmentProficiency` | `equipment` | Armor/shield proficiency, distinct from equipped state |
| `entry` | `entryId` | Possession of a declared class, ancestry, feature, power or feat |
| `classPowerSource` | `powerSource` | A qualifying class has this source; a single granted power is insufficient |
| `size` | `size` | Character size |
| `selected` | `category`, `filters` | A selected class-specific multiclass feat, or encounter power with a level |
| `unresolved` | `text`, `reason` | Preserved requirement requiring a ruling or missing local definition |

Groups need at least two distinct children. Enum values are uppercase. A mixed
requirement such as “11th level, 3 Constitution or 3 Dexterity” is an `allOf`
containing the level and an `anyOf` containing the two abilities. Printed grouping
uses parentheses so OR scope is explicit.

`selected` currently supports exactly two shapes:

```json
{"type": "selected", "category": "FEAT", "filters": {"multiclass": true, "classSpecific": true}}
```

```json
{"type": "selected", "category": "POWER", "filters": {"usage": "ENCOUNTER", "hasLevel": true}}
```

Non-feat references are declared in `../feat-references.json`, with stable ID,
category, printed title, status and optional local source path. `PENDING_MIGRATION`
means the corresponding shared executable definition is not available yet;
`UNAVAILABLE` identifies an option outside the local roster.
These declarations provide identity and labels, not automated eligibility.
Unknown feat IDs fail validation. Missing content is never silently created from
a title or dropped. The catalog exposes reference gaps for the future compiler.

Feral Companion, Fey Charge, Combat Opening and Elusive Hexer are retired by user
ruling. This removes the Combined Attack ambiguity and every Eladrin/Half-elf
dependency; the current authored catalog has no unresolved prerequisite occurrences.
Feats requiring Shielding Elixir, Beast Mastery or Vistani Heritage are also removed.
Saved retired IDs receive no silent replacements. See migration issue
[#29](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/29).

## Migration limits

The build exports a deterministic authoring catalog and production mechanics-v2
runtime package. Grouped prerequisites, historical independent facts, explicit
class/source qualification and ZEITGEIST availability are evaluated by shared Kotlin.
Occurrence limits, armor advancement, Skill Training, Weapon Proficiency, Linguist
and Adaptable Breath build-time choices are enforced. Explicit class-feature
Ritual Master grants allow the authored Alchemist substitution in the same
stable grant slot. Other unspecified benefits remain manual. In particular, “must have a shield equipped to
benefit” must not be converted into a selection prerequisite.

The current catalog contains 798 stored definitions across 93 sections.
The reviewed duplicate groups now have one definition each. Shared-class feats use
OR access and references at both printed locations; ancestry/class feats live only
in the ancestry-combination list. Scouring Wrath retains its previous stable ID
after correcting its title. Retired duplicate IDs have an explicit migration plan
at `character-builder/content/migrations/feat-consolidation-v1.json` (relative to
`src/`); removed tier variants are not substituted automatically.

## Reviewed language catalog

`../languages.json` supplies the user-approved ten-language catalog from the
published Languages entry (Rules Compendium p. 69, `glossary623`), with persistent
uppercase identities, display names, scripts and source attribution. The authoring
export exposes it under `optionCatalogs.LANGUAGE`; Linguist's production definition
preserves it in `sharedData.runtimeChoiceCatalogs.LANGUAGE`. Linguist's runtime
choices grant three new languages and the chosen skill bonus; catalog membership
alone does not establish known languages or ancestry eligibility facts.
Unspecified additional feat effects remain manual pending further scope decisions.

`optionCatalogs.WEAPON` derives nine superior weapon identities and titles from
the validated local `../equipment/equipment.json`. The feat's authored
`simple-and-military` bundle is distinct from those weapon identities. Neither
catalog imports or guesses additional published weapons. Runtime scope and saved
orphan behavior are documented in the shared selection contract.
