# Shared Modern 4e content model

Status: agreed authoring direction. The feat migration implements identity,
access and structured prerequisites. Selection rules and reuse across other
entry types are planned in [migration issue #29](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/29).

## Shared entry base

Model Modern 4e content with a common entry base, extended by category-specific
data. Reuse this model for feats, powers, classes, ancestries (published “races”),
themes, backgrounds, features, items, paragon paths and epic destinies. Modern 4e
definitions are authoritative; the published compendium provides reference
material for explicitly imported or adapted content.

| Field | Shared meaning | Current status |
| --- | --- | --- |
| `id` | Persistent identity, independent of title and file location | Implemented for feats |
| `title` | Human-readable name; changing it does not change identity | Implemented for feats |
| `access` | Which characters have access to this curated entry | Implemented as feat authoring data |
| `prerequisites` | Additional conditions required to select the entry | Implemented as feat authoring data |
| `selection` | Limits and constraints on selecting this entry | Planned; no accepted JSON field yet |
| `description` | Shared human-readable rules text | Implemented for feats |
| Provenance | Source references and explanatory author notes | Existing optional feat `source` and `note` fields |

These concepts are entry-type agnostic. Their applicability and supported
condition types still need validation for each category. For example, feats
currently restrict `access` to general/class/ancestry gates; powers may need
source or feature access. Extend the shared condition vocabulary when that
requirement is implemented, rather than creating a separate power-only language.

Use category-specific data alongside the base: powers need action, usage,
keywords and attack/effect details; classes need power sources, statistics,
features and progression; ancestries need traits, size and granted features.
Those fields do not belong in the shared base merely because one category needs
them. Keep category explicit in heterogeneous catalogs; its precise authoring
placement is part of the later schema migration. Today's feat-only files use a
`feats` envelope and do not accept an extra `category` field.

## Identity

Suggest `modern4e.<category>.<title-slug>` when creating an entry, then persist
the result. Use `ancestry` as the category name for local ancestry definitions.
Never recalculate IDs during builds or renames. Resolve collisions explicitly
and validate uniqueness across the catalog. Same-title entries can have different
rules and must not overwrite one another. References use stored IDs, not titles,
array positions or paths.

## Access and prerequisites

Access and prerequisites are separate conditions that must both hold. Access
records curation and ownership: a general option, a class's option, an ancestry's
option, or a combination. Prerequisites record additional qualifications such as
level, direct ability points, proficiency, selected features, powers or feats.
Campaign availability is an additional policy; installing content alone does
not make it available to a character.

Use the same closed condition-tree vocabulary across categories. `allOf` means
every child must hold; `anyOf` means at least one child must hold. Express grouping
explicitly. Conditions reference structured character facts or entry IDs. Do not
parse free text, execute scripts, infer access from file placement or translate
published ability scores into Modern 4e points automatically.

“Any Divine class” checks a qualifying class's power source. Merely knowing a
Divine power does not establish that qualification. Multiclass qualification
needs explicit rules; a multiclass feat's target class is not automatically a
requirement to already belong to that class.

Unknown or ambiguous requirements remain explicit `unresolved` conditions with
their original text and a reason. References to entries pending migration remain
declared gaps. Neither case can establish eligibility. Preserve saved selections
when content changes, and report the problem rather than deleting the decision.

## Selection rules and granted choices

Reserve **selection rules** for how an entry may be selected: maximum occurrences,
repeatability, uniqueness across chosen configurations, and eligibility for a
particular selection slot. These concepts apply to feats, powers and other entry
types. They do not imply that every category has the same default limit. Define
the exact JSON shape and defaults with their implementation; the current feat
validator rejects a `selection` field.

Keep three concepts distinct:

- An entry's **selection rules** constrain choosing that entry. A repeatable feat
  might require each occurrence to choose a different weapon.
- An entry's **granted choices** ask the player to choose benefits after taking
  it. A class can grant power selections; a feat can grant skill selections.
- A **benefit condition** determines when an effect applies. “Have a shield
  equipped to benefit” does not automatically prevent selecting the entry.

A selection slot's candidate pool and count belong to the granting choice or
progression rule. They are not automatically properties of every candidate entry.

## Shared authoring and consumers

Author the rules once in structured JSON for both Typst and the Character Builder.
Typst owns layout and renders prerequisite text from the structured conditions.
The content compiler validates and exports the same identities, conditions and
rules for the builder. Keep printed placement and section order separate from
semantic identity and access. A display label is not an eligibility rule.

This shared authoring model does not require authored JSON, compiled runtime
packages and saved characters to use identical envelopes. Compilers may normalize
data, but must preserve its meaning, references and unresolved status. Saved
characters record decisions and provenance, rather than embedding a second
editable copy of the content definition.

The current [feat authoring contract](../src/modern4e/content/feats/README.md)
is the first implementation of this direction. Its validator, reference registry
and section inventory still use feat-specific names. Generalize those as other
categories migrate; do not claim a generic runtime schema already exists.
`build.py --modern-feats` currently exports an authoring catalog, not an enabled
v1 runtime package. Runtime condition evaluation, structured selection rules and
category-specific mechanics remain separate implementation work.
