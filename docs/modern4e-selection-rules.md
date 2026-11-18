# Modern 4e selection authoring

Status: implemented for feat authoring and Typst/build export. Runtime occurrence
limits, Armor Proficiency advancement and Skill Training distinct proficiency choices are implemented; the other
repeatable choice effects remain part of migration issue #29. This extends the
[shared content model](modern4e-content-model.md) without changing class JSON,
class progression or the existing v1 runtime packages.

## Limits and granted choices

Feat files and their exported catalog use `schemaVersion: 2`. Reference and
section inventories retain their own version 1. Every feat explicitly stores
`selection`: ordinary feats have a one-occurrence limit; the five locally
repeatable exceptions have `maximum: null`. No limits are inferred from titles,
prose or directory names. The shared validator supplies no default for other
entry categories; class and power schemas remain independent.

An illustrative restricted skill pool:

```json
{
  "selection": {
    "maximum": null,
    "constraints": [
      {
        "type": "distinct",
        "choiceId": "skills",
        "against": {"scope": "CHARACTER", "fact": "SKILL_PROFICIENCY"},
        "whenExhausted": "BLOCK"
      }
    ]
  },
  "choices": [
    {
      "id": "skills",
      "kind": "SKILL",
      "count": 2,
      "source": {"type": "values", "values": ["ATHLETICS", "ENDURANCE", "NATURE"]}
    }
  ]
}
```

Actual Skill Training lists all 16 Modern 4e skills. `maximum` is a positive
integer or `null` for no fixed cap; other constraints can still block further
selections. `constraints` is an array. Missing `selection` is an error in feat v2.

`choices` is a separate optional array of granted choices. Each has a stable ID
scoped to its entry, a `kind`, a positive `count` of distinct values within one
occurrence, and a `source`. A `SKILL` choice does not itself imply proficiency:
Linguist chooses a skill for a bonus, whereas Skill Training grants proficiency.
The runtime compiles supported build-time grants separately from this selection
vocabulary; other benefit mechanics remain in effect prose and manual coverage.

Choice kinds are `SKILL`, `LANGUAGE`, `WEAPON_PROFICIENCY` and `DAMAGE_TYPE`.
`values` sources use validated finite enum pools. `catalog` sources declare
external option catalogs; missing catalogs produce explicit export limitations.
The LANGUAGE catalog is reviewed and exported with stable identities, names, scripts
and source attribution (Rules Compendium p. 69). WEAPON uses the validated local
equipment catalog's nine superior weapons and stable `modern4e.weapon.*` IDs.
The simple-and-military bundle remains a separate authored option identity.

## Distinct-choice constraints

| `against` scope | Meaning |
| --- | --- |
| `ENTRY` | Exclude values picked for other occurrences of the same entry and choice ID |
| `CHARACTER` | Exclude facts possessed from any source: `SKILL_PROFICIENCY` or `LANGUAGE` |
| `POWER` | Exclude `DAMAGE_TYPE` values already dealt by the declared power `entryId` |

These scopes differ deliberately. Weapon Proficiency excludes its earlier picks;
Skill Training also excludes proficiencies from backgrounds, classes or any other
source. Adaptable Breath checks all existing Dragon Breath damage types.

`whenExhausted: "BLOCK"` requires enough new options for the full count. Skill
Training needs two remaining untrained skills; partial grants are not invented.
`whenExhausted: "ALLOW_REPEAT"` permits a previous value only when the distinct
pool is exhausted. Linguist uses that fallback for its one bonus-skill choice,
not its three language choices. Values within one occurrence remain distinct.

## Migrated feats

- **Armor Proficiency:** `advance` on `ARMOR_PROFICIENCY`, one step through
  Cloth → Leather → Hide → Chainmail → Scale → Plate. The final element is the
  cap; there is no manual choice or invented starting proficiency.
- **Skill Training:** two skills not already proficient from any source.
- **Linguist:** three new languages; one of Diplomacy, Society or Insight for its
  bonus, preferring a skill not used for earlier Linguist picks. The bonus skill
  may repeat only once all three have been selected.
- **Weapon Proficiency:** one superior weapon or the explicit simple-and-military
  bundle. Its source is `catalog: "WEAPON"`,
  `filters: {"proficiencyCategory": "SUPERIOR"}`, and
  `bundles: [{"id": "simple-and-military", "proficiencyCategories": ["SIMPLE", "MILITARY"]}]`.
  This preserves the local alternative without guessing weapon IDs. Repeated
  selections require different options, so the bundle cannot be selected twice.
- **Adaptable Breath:** one of Acid, Cold, Fire, Lightning, Poison, Necrotic or
  Radiant that Dragon Breath does not already deal. The local pool is preserved.

## Consumers and limits

`src/modern4e/scripts/entry_selection.py` validates this shared vocabulary slice.
The feat consumer supplies its skill/damage vocabularies. Validation rejects
unknown fields, invalid caps, duplicate IDs/options, impossible finite counts,
missing choice references, incompatible scopes/facts, invalid power references,
and malformed armor progressions.

Typst generates the five repetition Special paragraphs from this data. The
compiler exports identical `selectionText` alongside `selection` and `choices`.
Effect prose retains the original benefits without duplicating these paragraphs.

The production mechanics-v2 engine enforces explicit occurrence limits and Skill
Training's two distinct untrained skills, including repeated picks and exhaustion.
Armor Proficiency replays the authored order at acquisition time, uses independent
equipment grants and class proficiencies, grants exactly the next category, and
blocks further selection at Plate. A missing starting proficiency grants nothing.
Weapon Proficiency, Linguist and Adaptable Breath compile to structured value
choices. Persisted decisions retain source occurrence, choice ID and ordinal;
invalid or orphaned decisions remain in the document with diagnostics. Language
facts are character-wide; repeated bonus-skill/weapon picks are entry-specific;
damage facts target the declared power. Descriptive personal-detail text never
establishes those facts. Linguist's authored +2 feat bonus (+3 at level 21) uses
the normal modifier stacking rules, including repeated selections of that feat.
Structured ancestry choices supply known languages, power damage types and Past
Life qualification. Past Life never visits or grants the chosen ancestry's traits.
Acquisition-time independent facts continue to exclude self-benefits and dependent
chains. Full combat/session effects remain manual.
Saved-character migration UI/save integration is deferred to
[#38](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/38), outside #29. Scope `ENTRY`
uses stable IDs; known duplicate definitions need review before full activation.

Alchemist is an explicit alternative on the authored class-feature Technique
Master grants. The granting occurrence and grant ID identify its slot; changing
the selected definition retains the deterministic granted occurrence identity.
With no saved decision, the engine uses the default grant. An explicit substitution retains its
saved supplier/fingerprint and is revalidated when the source or allowed options
change; unavailable or orphaned choices are diagnosed and preserved. Removing a
decision deliberately restores the current default. This is a grant interaction,
not general retraining or an extra feat allowance. Technique mastery and formula
effects remain manual. Conditional benefits such as “have a shield equipped to
benefit” remain effect conditions, never new selection prerequisites.
