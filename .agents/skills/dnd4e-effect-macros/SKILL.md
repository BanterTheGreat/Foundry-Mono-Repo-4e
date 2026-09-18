---
name: dnd4e-effect-macros
description: Write or explain macros embedded in DnD4e Active Effects through the Effect Macro module. Use for effect lifecycle, combat-turn, round, defeat, and combat lifecycle triggers or for the helpers injected into an effect macro.
---

# DnD4e Effect Macros

Effect Macro embeds one or more macros directly in an Active Effect and runs them for configured triggers. Treat this as add-on behavior layered over Foundry VTT v14 and DnD4e 0.9.3, not as native DnD4e change-key behavior.

## Triggers

An effect can contain macros for any combination of:

- Effect created.
- Effect deleted.
- Effect toggled on, off, or either direction.
- Owning actor starts their turn.
- Owning actor ends their turn.
- Any combatant starts their turn.
- Every round starts.
- Every round ends.
- Owning actor is marked defeated in combat.
- Combat starts.
- Combat ends.
- `never`, for explicit calls by other scripts and never automatic execution.

Add or edit macros in the Active Effect configuration and choose the trigger for each. The module iterates over effects currently affecting the actor. It executes a macro for an owner of that actor, falling back to GM execution when no suitable owner exists.

## Injected helpers

| Variable | Meaning |
| --- | --- |
| `effect` | The Active Effect whose macro is running. |
| `actor` | The actor owning the effect, including effects on an embedded item; otherwise `null`. |
| `character` | The executing user's assigned actor; otherwise `null`. |
| `token` | The synthetic actor's token, or the first token for `actor` on the viewed scene; otherwise `null`. |
| `scene` | The scene containing `token`, otherwise the active scene; otherwise `null`. |
| `origin` | The document referenced by `ActiveEffect#origin`; otherwise `null`. |
| `speaker` | A ChatMessage speaker object representing `actor` when available. |
| `item` | The parent item when the effect is item-owned rather than actor-owned; otherwise `null`. |

Use lowercase Foundry properties such as `actor.name` and `origin.name`. Guard nullable helpers before dereferencing them. Await document mutations and chat creation.

```js
if (!actor) {
  return;
}

await ChatMessage.create({
  speaker,
  content: `${actor.name} is affected by ${origin?.name ?? effect.name}.`
});
```

For unlinked tokens, preserve the supplied synthetic `token.actor`; do not substitute a world actor with the same name. Use DnD4e status IDs such as `unconscious`, `dazed`, and `blinded` when querying `actor.statuses`.
