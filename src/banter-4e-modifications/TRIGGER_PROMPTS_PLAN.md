# Trigger Prompts Submodule Plan

## Scope

Add a reload-gated world setting for a GM-authoritative combat trigger system.
Each trigger is a separately defined module loaded through a registry. The
initial release provides possible opportunity-attack and enemy-miss prompts.

## Trigger architecture

- A shared trigger-definition contract supplies the trigger ID, label,
  enablement requirements, default ability resolver, and event evaluation.
- Non-OA triggers are opt-in per actor. OA is globally active while the master
  setting is enabled, but its response ability remains configurable per actor.
- Each trigger can use any actor inventory item. A blank selection means use
  that trigger's hard-coded default ability lookup.
- Future trigger candidates and reusable predicate directions are recorded in
  `TODO.md`.

## Actor configuration

- Add an actor/prototype-sheet header control available to actors' owners and
  GMs.
- Store configuration on the Actor; do not add token-specific overrides.
- The dialog contains a row per trigger. Toggleable triggers receive a checkbox
  and every trigger receives an item selector.

## Evaluation and delivery

- A single active GM evaluates only events in a started active combat, whose
  involved tokens are combatants in that combat.
- Relationships use token disposition.
- Create one hidden prompt per eligible actor. Every active non-GM owner and
  every active GM can see it. NPC prompts consequently reach GMs only.
- The prompt gives the selected ability and a `No` control. The ability posts
  its normal item card using normal chat visibility; it is not rolled.
- Accepting marks the prompt used and disables controls. `No` deletes it.
- Existing prompts remain after combat ends.

## Initial detection rules

- Possible OA: when a hostile combatant's straight grid movement starts or
  passes adjacent to an eligible actor, emit one prompt for that actor. Ending
  adjacent alone does not qualify. Each eligible actor receives its own prompt.
- Enemy miss: derive each defender's result from DnD4e's structured standard
  attack workflow and target-defense values (including natural 1/20 when
  available). A miss against one target still qualifies even if other targets
  were hit.
- Active Defense reports its resolved enemy-miss result through the same
  internal combat-event contract.
- Ignore manually authored chat cards and third-party attack lookalikes in this
  initial release.

## Error handling

- If the configured item is missing and the default resolver finds no item,
  suppress the prompt and issue a concise GM-facing warning.
