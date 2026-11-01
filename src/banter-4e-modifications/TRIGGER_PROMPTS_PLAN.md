# Trigger Prompts Submodule Plan

## Scope

A reload-gated world setting for combat trigger prompts. Combat events become
private, claimable chat prompts for the actors whose powers can answer them.
Prompts work without a GM connected.

## Flow

```text
Foundry hook (moveToken, updateActor) / chat message / Player Defense
        -> adapter (trigger-prompts.js)          normalizes to a combat event
        -> CombatEventBus                         one event at a time
        -> CombatTriggerDispatcher.handle         the only evaluation entry point
        -> evaluateTriggerDefinition              declarative definitions, no Foundry
        -> ActorTriggerConfiguration              which of the actor's powers apply
        -> TriggerPromptChat                      whispered card, claim, expiry
```

- **Events** (`combat-events.js`): `attack-resolved`, `movement-committed`,
  `hp-changed`, `save-resolved`. Events carry token references and derived facts
  (`isMelee`, `becameBloodied`), never documents. Each attack carries an
  `attackId` from capture to event.
- **Definitions** (`trigger-definitions.js`): plain data - event type, `where`
  field matches, recipients, relations, optional path adjacency and range, and
  the prompt text. Adding a trigger is adding an entry; the dispatcher and
  evaluator do not change.
- **Geometry** (`spatial-service.js`): distances between token footprints on a
  square grid, and "starts or passes adjacent" along a path (final square
  excluded). Reach is not modelled.
- **Movement** comes from Foundry's `moveToken` hook, which fires on every client
  once a move is committed and carries the real path (origin plus the waypoints
  passed). An undo is not a move. The movement type is recorded on every
  movement event and ignored by every trigger: the table does not use shifts,
  forced movement, or teleports yet.

## No GM dependency

- The client that causes an event evaluates it: the attacker's roll, the user who
  requested the move (`moveToken` names them), the user who changed the HP, the roller of the save. Player
  Defense reports from the GM client that resolved it. No election, no
  `executeAsGM`, and each event is evaluated exactly once.
- The evaluating client must be able to read the other combatants' actors. This
  is the assumption to check in a test world; actors it cannot read are skipped.
- A prompt is a whisper authored by the evaluating client, so only that author
  or a GM may modify it. Claiming and dismissing therefore run on the author
  through SocketLib `executeAsUser` (a connected GM if the author left).
  Claims are serialized, so simultaneous answers produce one winner.
- The deadline is the stored `expiresAt`. Every client removes controls past it
  and a claim is refused after it (with a short grace for latency). The author's
  timer, and a sweep at load, only delete the leftover card.
- The author sees their own whisper, so a client that is not a recipient hides
  the card.

## Configuration

- Power assignments are a flag on the **power** (`{version, assignments:
  [{triggerId, parameters, source}]}`), so they follow duplicates, drags between
  actors, and compendium imports. A saved power's list is authoritative, even
  when empty.
- The actor flag keeps actor-level options only: whether opportunity attacks
  are offered and which reminder triggers are on.
- Assignments still in an actor flag are read as a fallback and moved onto the
  powers once, by a GM client, at load.
- **Suggestions** (`trigger-text-suggestions.js`) read a power's own trigger
  line. They are opt-in per power: the dialog's checkbox starts off, ticking it
  shows the match and any wording the trigger does not enforce, and pre-ticks
  rows. Nothing is stored until Save. Wording left over after the match is
  reported in the power's own words, so partial matches stay visible.

## Delivery rules

- Only started combats; every token involved must be a combatant.
- Relationships use token disposition. One prompt per eligible actor; every
  active owner and every active GM can see it (NPC prompts reach GMs only).
- Limited-use powers with no uses left are not offered. No other resource,
  action-economy, or condition checks.
- Accepting marks the prompt used and removes the buttons; Ignore deletes it.

## Known limits

- Square grids only; hex and gridless scenes use the same rectangles.
- Each committed checkpoint of a move is its own event, so a move split into
  several checkpoints can prompt the same enemy once per checkpoint it is
  adjacent at. `moveToken` is verified against Foundry 14.367 only.
- Prompts for powers on unlinked tokens resolve the actor by UUID, falling back
  to the world actor.
- Triggers the compendium uses often but this list lacks (taking damage, rolling
  initiative, an ally dropping to N hit points, melee-qualified misses) need new
  event types or definition entries.
