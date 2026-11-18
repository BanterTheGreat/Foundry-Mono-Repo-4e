# Shared Modern 4e content model

Status: agreed authoring direction. The feat migration implements identity,
access, structured prerequisites and selection authoring. Production v2 now evaluates
independent historical eligibility, explicit multiclass qualification and Skill Training
distinctness. Other repeatable effects and broader migration work remain in [migration issue #29](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/29).

## Shared entry base

The [ordered power contract](modern4e-power-authoring.md) revises
the power body around ordered blocks, attack groups, independent activations and
explicit structural references. Sixteen published-reference fixtures and a strict
read-only validator exercise the shape. Class catalog/export v2 and Typst now
consume it for all 19 local classes, all 15 ancestry powers and the 11 Zeitgeist
theme powers. Runtime combat interpretation remains unimplemented. Power-point
augments and Monk disciplines remain outside its scope; non-augmenting theme
powers retain Psionic keywords.

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
| `selection` | Limits and constraints on selecting this entry | Implemented as feat authoring data; runtime enforcement pending |
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
Divine power does not establish that qualification. An explicitly targeted class-specific multiclass feat counts as class membership
for feat and paragon-path prerequisites, including qualifying class sources. It
does not open class power pools or grant class equipment proficiencies. Explicitly
granted features qualify normally; prose-only effects remain unsupported.

Unknown or ambiguous requirements remain explicit `unresolved` conditions with
their original text and a reason. References to entries pending migration remain
declared gaps. Neither case can establish eligibility. Preserve saved selections
when content changes, and report the problem rather than deleting the decision.

## Selection rules and granted choices

Reserve **selection rules** for how an entry may be selected: maximum occurrences,
repeatability, uniqueness across chosen configurations, and eligibility for a
particular selection slot. These concepts apply to feats, powers and other entry
types. They do not imply that every category has the same default limit. The
[selection authoring contract](modern4e-selection-rules.md) defines the implemented
feat v2 shape, explicit occurrence caps and distinct-choice scopes. Other category
schemas remain independent; the shared validator supplies no defaults.

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

Equipment now follows this direction through the
[equipment authoring contract](../src/modern4e/content/equipment/README.md):
persisted item IDs, presentation, typed weapon/armor/shield profiles, shared
property rules, category-level armor rules and explicit runtime coverage.
Printed section order is separate from identity. Typst consumes the JSON directly;
`build.py --modern-equipment` exports it for builder compilation. This authoring
slice does not extend Kotlin v1 runtime contracts or enable equipment calculations.

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
v1 runtime package. Production v2 evaluates supported conditions, occurrence maxima and Skill Training
distinctness; other category-specific mechanics remain separate implementation work.


## Class authoring across all combat roles

The [class authoring contract](../src/modern4e/content/classes/README.md) extends
this base with full class flavor, role/sources, abilities, proficiencies, local
statistics, automatic acquisition grants, independently identified features/powers
and explanatory rules. Fighter, Paladin, Swordmage, Warden, Artificer, Bard,
Cleric, Runepriest, Shaman, Warlord, Druid, Invoker, Wizard, Avenger, Barbarian,
Ranger, Rogue, Sorcerer and Warlock render directly from these JSON definitions,
including their granted powers in the ordered format. Existing Fighter and
77 predeclared class feature/power
feature/power identities are retained. Feature sections preserve prose/card/choice
ordering; page and column layout remain in Typst.
Shared initial power choices are separate from class entries; feature-owned
modifiers can change counts and constrain a selection set (Druid), and separate
owned collections model learned/stored/prepared choices (Wizard).

`scripts/class_content.py` validates and exports a deterministic authoring catalog,
not an enabled runtime package. The separate Character Builder
`content/build.py --modern-classes-runtime` maps this catalog to package/mechanics
v2: class formulas, explicit acquisition and finite feature-owned choices are
evaluated by shared Kotlin (#33). Full authored entries and unsupported mechanics
remain preserved with explicit coverage. The normal production build bundles these authoritative definitions on web and
Android (#35), retaining published proof classes only as explicit legacy fixtures.
General progression/query pools/collections are shared engine responsibilities (#34).
Ancestries, Zeitgeist themes, feats, utility powers and equipment now compile to their own
production packages the same way (see the content README); their effects stay descriptive
with explicit coverage, and unresolved references/conditions are never converted to eligibility.
Exceptional-class fixtures establish data shapes;
general progression remains a shared engine concern. Production package adoption
uses local IDs directly and preserves unresolved legacy selections. The
96 revised Barbarian selectable attacks and all 174 Fighter selectable attacks
through level 15 use the ordered power contract. Fighter attacks are bundled in
runtime package revision 2 with explicit access/level/proficiency requirements;
their combat rules remain manual. Other selectable class catalogs remain linked
source material. Existing feat
data and its contracts remain independently
owned; the feat registry's pending external-reference statuses do not yet resolve
against class authoring definitions at runtime.

The shared runtime power contract separates candidate eligibility (`PowerQuery`
and `PowerProfile`) from collection validity (`SelectionSetResult`). Feature
`SelectionModifier` counts must agree; additive constraints apply only to the
targeted choice set. `PowerCollection` distinguishes learned, stored and prepared
occurrences. Acquisitions mirror authored GAIN events through level 10; general
retraining/progression timing and complete levels 1?30 remain incomplete (#20).
Wizard preparation, extra unresolved technique choices and Tome distinctness use
these shared data contracts rather than class-name branches.
