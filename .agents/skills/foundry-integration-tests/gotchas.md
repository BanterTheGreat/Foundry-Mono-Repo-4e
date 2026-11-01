# Verified facts and pitfalls

Checked against Foundry 14.367 and DnD4e 0.9.3 in this repo.

## World hygiene (the test world is shared)

- Starting or ending a combat, changing HP, and rolling saves make Foundry and DnD4e post chat cards ("Round Start/End", "Took N damage", "Rolling Saving Throw"). Fixtures do not track them: 736 piled up over seven runs. Sweep messages the test account posted since the run began, after normal cleanup.
- Deleting a combat makes core clear each token's movement history asynchronously. Wait until `token._source._movementHistory` is empty before deleting tokens, or an unhandled "id does not exist in the EmbeddedCollection" rejection follows.
- After a move, `await token.movement.finished` (bounded) before cleanup.
- `scene.view()` changes only this client. `scene.activate()` changes the world's active scene for everyone; record the previous one, restore it (also when the page that built the fixture is gone: delete by run-ID flag), and wait for `canvas.scene.id` to match before the next switch (a second switch while loading is refused).
- A player sees only the active scene. Fixture scenes for two-client tests are private scenes, activated and restored. The user's "WIP" scene has a 256px grid and walls, so geometry tests use a private 100px-grid scene with `navigation: false`.
- The user's `Gamemaster` session may be connected; check `game.users` first.
- Leftover `[Integration test ...]` actors and scenes from killed runs carry `foundry-test-harness.runId`. Look before deleting; delete only flagged documents.
- Prompt cards are whispers to every active GM, so a live GM sees test cards.

## Foundry v14

- `moveToken(document, movement, operation, user)` fires on every client after a committed move. `movement.passed.waypoints` excludes the origin; the full path is `[movement.origin, ...passed.waypoints]`, grid-snapped and routed by core. `method` is `api|config|hud|dragging|keyboard|paste|undo`.
- DialogV2 wraps `content` in its own `<form class="dialog-form">`; a nested `<form>` is dropped by the HTML parser. Use a `<div>`; `dialog.element.querySelector("form")` is the outer form, and `form.elements["a.b"]` resolves dotted names. `dialog.addEventListener("render", ...)` works.
- ChatMessage: players may create messages only as themselves (whispers allowed); only the author or a GM may update or delete; an author always sees their own whisper (hide cards client-side for non-recipients).
- `Collection` iterates values and a plain `Map` iterates entries; use `.values()` to serve both.
- Flags: arrays are replaced and objects merged, so store lists as arrays and write empty arrays to clear.
- Token `update({x, y})` yields a `moveToken` with `method: "api"`. Positions off the grid snap and re-route.

## DnD4e 0.9.3

- `Actor#_preUpdate` stores `options.dnd4e.hp = { hp, temp }` (the previous HP) on every actor update.
- `actor.rollSave(null, null, { dc })` posts a real save message (`fastForward`); `dc: 99` fails, `dc: 1` succeeds.
- `system.marker` is a nullable actor-UUID field; set it with a plain actor update to Mark a creature.
- Player Defense intercepts only an NPC attacking a Player Character. Attack fixtures use Player Character actors with a hostile token disposition to stay clear of it. With Target Automation managing attacks, `handleActiveDefenseOutcome` is called when results are applied, not when the defense rolls.
- `Hooks.callAll("dnd4e.rollAttack", item, { targets, targDefValArray, targDefArray, targetHit, targetMissed }, speaker)` followed by a chat message whose `flavor` includes the power name reproduces the attack seam without the native dialog.
- Power `system.rangeType` is `weapon` for melee; `system.uses = { value, max: "1", per: "encounter" }` gives a limited-use power.
- Opting out of Drac's auto-bloodied is the per-actor flag `dracsTools.autoBloodied.ignore` (the harness sets it).
- On a non-GM client DnD4e's ready hook throws "You must be at least an assistant GM ... configure it" (`applyCustomStatusToCompendium`); the only tolerated startup error.
- Monk's Little Details wraps `ApplicationV2.setPosition` without a null check; guard calls on closed apps.
- Mocha's "done() called multiple times" hides the real error; install `error` and `unhandledrejection` listeners to see it.

## Shell and tooling on this machine

- Backslashes are halved through `node -e`, heredocs, and `sed`; make regex or newline edits with the Edit tool or by writing a file.
- `rm` with a shell variable is blocked; write `"${VAR:?}"/path` so an empty variable aborts.
- Quench needs its window rendered before API runs (the harness handles it). Run serially; never run the Quench UI and a browser suite together.

## Playwright pitfalls

- A function passed to `page.evaluate` that returns a Foundry document (for example `token.update(...)`, which resolves to the updated document) makes Playwright serialize the whole object graph (scene, canvas, ...). The page freezes for 12-40 s, so prompts, polls and timeouts all look broken. Await the call inside braces and return nothing or a plain object: `async () => { await token.update(...); }`.
- This cost over an hour once, chased through viewport, chat-tab and hook theories. A CDP CPU profile found it in one run: the page was idle, and the only busy frames were Playwright's own `serialize`/`safeJson`. Profile first when a page "stalls".
- A Foundry `Collection` has `map`, `filter`, `reduce`, `find` and `contents`, but no `flatMap`; use `collection.contents.flatMap`.
- An error thrown in a spec's `finally` replaces the original failure. Cleanup code is tested code: run the recovery path on purpose.
- Recover a crashed two-client run by run-ID flag, restoring the active scene before deleting the fixture scene (`TriggerWorld.cleanupRuns`).
