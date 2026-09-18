# DnD4e duration and automation audit (Foundry VTT 14)

**Scope.** This compares Too Much Too Track (TMTT) with the DnD4e system **0.9.3** source—the version targeted by this module. The DnD4e repository links below are pinned to that tag.

> **Historical baseline.** This audit describes the module before the native Active Effect migration. The migration now creates native effects for all HUD entries, maps the existing duration controls to native duration data, removes TMTT's custom combat save/ongoing-damage hooks, and derives the overlay from temporary effect descriptions.

## Conclusion

Nearly every *timed mechanical effect* TMTT creates can now be represented by a native DnD4e Active Effect, and native automation is materially richer. The parts that remain distinct are TMTT's compact multi-token editor, its token overlay/list of arbitrary notes, and tracking text that has no mechanical effect. The recommended direction is therefore **not to remove TMTT**, but to let it create native effects for mechanical conditions, modifiers, resistances, and ongoing damage; retain flags/overlay only for manual notes and as a presentation layer.

## What native DnD4e now handles

DnD4e stores a duration selection in `system.durationType`; on creation it initialises core `duration` data and anchors target/user turn durations to the relevant combatant. [Effect creation](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/active-effect.mjs#L76-L117) and [duration definitions](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/config.mjs#L742-L813) show these choices:

| Timing or trigger | Native capability | TMTT today |
| --- | --- | --- |
| End/start of target's next turn | Automatic expiry | Only end of the selected target/origin turn; no start-of-turn option. |
| End/start of user's next turn | Automatic expiry, using the effect origin | Only end of selected origin turn. |
| End of current turn | Automatic expiry | Not offered. |
| Exact rounds, turns, or seconds | Core custom duration fields | `Round` expires at the next round update; text `Custom` is display-only. |
| Save ends | End-of-turn save prompt/roll and expiry, subject to the system's save-reminder setting | TMTT independently rolls a hard-coded `1d20 + saves` and deletes its note on 10+. |
| End of encounter / extended rest | Native expiry events | TMTT cleans its notes only when the Combat document is deleted; it does not hook encounter end or extended rest. |
| Next attack, damage roll, check, save, death save, healing; attacked/hit/missed; damage/healing received | `system.durationAction`, optionally combined with a time duration | Not offered. |

The full action-trigger list is in the [system configuration](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/config.mjs#L818-L853), and the system calls the expiry helper from roll and damage paths—for example [attack](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/item.mjs#L1770-L1775), [damage](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/item.mjs#L2400-L2405), and [damage/healing received](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/actor.mjs#L2552-L2559).

Native effects also cover the mechanics TMTT creates today: status effects and ordinary data changes, plus DnD4e-specific effect modifiers. Native effects have `system.dots` (ongoing damage or healing), typed damage, formula evaluation, resistance/vulnerability calculation, same-type DoT selection, chat output, and optional automatic HP application. See [Active Effect system data](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/active-effect/active-effect.mjs#L39-L60) and [DoT processing](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/actor.mjs#L2643-L2773).

## TMTT-specific behaviour still worth keeping

- The GM-facing compact HUD can add a note to several selected tokens at once.
- The canvas overlay exposes a concise list of notes, including free-form reminders. A native Active Effect does not replace arbitrary narrative text or that overlay.
- TMTT's manual notes and custom-duration text are intentional human-managed reminders. They are not equivalent to an executable native duration.

## Important migration caveats

1. **Do not merely change TMTT-created effects from `custom` to a native duration.** Native expiry deletes/disables the Active Effect, but TMTT stores a separate module flag and currently removes flags through `CombatManager`. That would leave stale overlay entries and later cleanup would not find the already-expired effect. A native-effect deletion/expiry hook (or making the effect itself the source of overlay state) is required.
2. **Origin must be correct.** `endOfUserTurn` and `startOfUserTurn` derive their combatant from `effect.origin`; creating an actor-owned effect without an appropriate source UUID cannot faithfully implement TMTT's chosen “origin” combatant. [Source](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/active-effect.mjs#L91-L112)
3. **Avoid duplicate saves and damage.** TMTT's combat hooks presently roll Save Ends and post ongoing damage themselves, while DnD4e `Combat4e.nextTurn` prompts saves at the ending turn and processes DoTs for the next combatant. Enabling native effects while retaining these hooks would run both paths. [Source](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/combat.mjs#L5-L68)
4. **Native DoT application is a world setting.** The system can post only a reminder or apply HP automatically (`autoDoTs`); TMTT currently only posts a roll message and never applies HP. Preserve that choice in the HUD rather than silently changing campaign behaviour.
5. **Validate this against the installed system version, not just the module manifest.** 0.9.3 is the declared compatibility target; changing DnD4e versions can change effect schema and automation semantics.

## Suggested next implementation slice

Start with a native-effect mode for a **single selected token**: map duration controls to `system.durationType`/`system.durationAction`, set an origin UUID where needed, create `system.dots` for ongoing damage, and render TMTT's overlay from the created effect. Then remove the corresponding TMTT combat automation for those native-backed records. Keep the existing flag-only workflow for multi-token batches, manual notes, and unsupported free-form durations until their lifecycle is deliberately redesigned.

## Local module evidence

- `tracking-dialog.js` accepts only encounter, round, save ends, EoT origin/target, and free-text custom duration.
- `combat-manager.js` implements only next-round cleanup, end-of-turn cleanup, a bespoke save roll, and a bespoke ongoing-damage chat roll.
- `handlers/ongoing.js` creates no Active Effect, so the system cannot apply its native DoT automation to those records.
- `main.js` registers TMTT's combat hooks, which must be gated when a native effect becomes authoritative.
