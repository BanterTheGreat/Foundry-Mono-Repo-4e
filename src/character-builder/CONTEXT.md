# Modern 4e Character Builder

Builds and checks Modern 4e characters from authored content packages, sharing one rules core between the Android and web shells.

## Character and content

**Character document**:
The portable, saved record of a character: level, abilities, and every decision made in its slots.
_Avoid_: save, sheet

**Package**:
A versioned bundle of authored content entries a document is evaluated against.
_Avoid_: pack, module

**Entry**:
One authored piece of content (class, ancestry, theme, feat, power, paragon path, equipment, …).
_Avoid_: item, record

**Edit**:
One requested change to a character document, accepted or rejected as a whole.
_Avoid_: mutation, action

## Slots and occurrences

**Slot**:
A place in a character where a decision is made, identified by its source, name and ordinal.
_Avoid_: choice point, field

**Root slot**:
A slot the advancement schedule itself opens, such as class, ancestry, theme, a level's feat or the paragon path, rather than one opened by an entry.
_Avoid_: builder slot, top-level choice

**Occurrence**:
One instance of an entry in a character, chosen or granted, with its own stable identity.
_Avoid_: instance, copy

**Grant**:
An occurrence an entry gives automatically, possibly from a later level.
_Avoid_: bonus, freebie

**Substitution**:
A deliberate exchange of an authored grant for a different entry, keeping the grant's slot and occurrence identity.
_Avoid_: override, swap

**Retirement**:
The point at which an occurrence stops being active because a later replacement takes its place.
_Avoid_: removal, deletion

**Acquisition level**:
The character level at which an occurrence or slot becomes active.
_Avoid_: unlock level, gained-at

**Occurrence timeline**:
The answer to "which occurrences are active at level N", covering acquisition, grants, substitutions and retirements.
_Avoid_: grant walk, activation tree

**Advancement schedule**:
What each character level opens: powers, feats, ability increases, replacements and path or destiny features.
_Avoid_: level table, progression table

## Offering and checking choices

**Slot offer**:
A slot the rules present for a decision, with its category, acquisition level and whether it is required.
_Avoid_: engine choice, prompt

**Listing**:
The candidate entries for a slot offer with their eligibility. An offer's listing is either inline (always produced) or deferred (produced only when asked for).
_Avoid_: options list, picker rows

**Eligibility**:
Whether one candidate may fill one slot right now.
_Avoid_: validity, legality

**Unmet condition**:
One prerequisite or access condition a candidate fails, could not be checked against, or that awaits adaptation.
_Avoid_: failed requirement, prerequisite error

**Slot issue**:
A reason a saved decision does not fit its slot: wrong timing, an option no longer offered, an orphaned decision, or selections still remaining.
_Avoid_: slot error, invalid slot

**Diagnostic**:
A human-readable report about a document or its content, for presentation only, never for deciding anything.
_Avoid_: error, warning

## Reuse across edits

**Effect profile**:
What kinds of facts an entry can supply to the rest of a character: none (passive), only its own identity and power profile (plain power), or others (active).
_Avoid_: passivity check

**Retention verdict**:
Whether a listing computed before an edit is still correct afterwards: dropped, kept as is, or rebased with some rows re-evaluated.
_Avoid_: cache validity, staleness check
