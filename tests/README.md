# Running tests yourself

Open a terminal in the repository root. You need Node.js installed (`node --version` checks this). The Node test commands below run locally without Foundry or an agent; results appear directly in your terminal.

Battle Briefing title-only loading (including legacy presets) and journal creation:

```sh
node --test src/dnd4e-health-display/test/combat-start.test.js
node --test src/foundry-mcp/test/journal-create-api.test.js
```

After reload, load an old preset, verify only its title appears, save/reopen, and confirm enemy counts still load. Check the browser console.

## Info Displays and targeting

Run the full `dnd4e-health-display` suite:

```sh
node --test src/dnd4e-health-display/test/*.test.js
```

Run only the power activation tests, including automatic target selection, target focusing, and attack variant buttons:

```sh
node --test src/dnd4e-health-display/test/power-activation.test.js
```

NPC Sheet action labels, condition summaries, scene-PC weakness rules, and controller wiring:

```sh
node --test src/dnd4e-health-display/test/npc-power-hints.test.js src/dnd4e-health-display/test/actor-hud.test.js
```

NPC Sheet hover range previews (shared targeting renderer, async cancellation and cleanup):

```sh
node --test src/dnd4e-health-display/test/power-range-hover.test.js
```

Hover an NPC Sheet power to preview its range around its token, including long range.
Leaving the row, switching tabs/tokens or closing the HUD clears the overlay.
Active Target Automation takes priority. Both targeting and hover previews use map bounds
for a GM when the origin/caster has no active vision source, so NPCs do not need Sight enabled.
Players still require token vision, and active token vision still clips either preview.
Area powers preview their placement range;
close powers show their reachable extent without choosing a blast direction.

For a manual NPC Sheet check, select an NPC and open Sheet.
Action types should align right; conditions and `Weak: PC names` share a smaller second line.
Basic Attacks appear first under their own heading, followed by Other Powers; empty groups are omitted. Traits retain the right column. Check AC attacks, friendly and neutral NPC dispositions,
PC defense changes, adding/removing scene PCs, and long names. Chat/use buttons must still work.
Reload Foundry and check the console, switch actors and menus, drag/reopen the HUD, and hover each power twice.
Weak means tied for the lowest Fortitude/Reflex/Will. If nobody qualifies, orange `Lowest` names show the scene PCs tied for the lowest targeted defense in the party. Neither hint checks attack range or line of sight. Listed names include base d20 hit percentages from the native power attack bonus and prepared target defense (natural 1 misses, natural 20 hits). Situational modifiers, combat advantage, cover, concealment and roll modes are excluded; if the bonus cannot be resolved, names remain without percentages.
Condition text detection recognizes explicit English applications in hit/miss/effect rules and custom cards;
native target-effect statuses also supply configured condition names.

Run just tests whose names contain a phrase:

```sh
node --test --test-name-pattern="direct targeting" src/dnd4e-health-display/test/power-activation.test.js
```

To save readable results to a file while also displaying them (macOS/Linux):

```sh
node --test --test-reporter=spec src/dnd4e-health-display/test/*.test.js 2>&1 | tee /tmp/info-display-tests.txt
```

## Reading the results

The final summary lists the number of tests that passed, failed, or were skipped. A successful run has `fail 0`; failed tests include their names, assertion details, and file locations. Tests skipped by a name filter have not been checked by that run. Without the `tee` pipe, a failing run also returns a nonzero exit status.

## Other suites and Foundry checks

`npm test` runs the repository tooling tests under `scripts/test/`; it does **not** run all module suites. For another module using Node's test runner, run its `test/*.test.js` files in the same way, or use its own `package.json` test command if provided.

Local tests use mocked Foundry boundaries and cannot verify the running application's rendering or system integration. For browser and Quench tests in the designated test world, follow [the Foundry integration guide](foundry/README.md).

Actor HUD live coverage is registered as `dnd4e-health-display.actor-hud` in Quench
(**INFO DISPLAYS: Actor HUD tabs and controls**). It covers all PC power groups,
Feats, Skills, Items and Extras, plus the NPC-only Sheet with basic attacks and
trait disclosures. It also exercises search, menu dismissal, token switching,
equipment toggles, resource edits, native sheets/dialogs, skill rolls, power
refresh/chat and entry into Target Automation using real HUD buttons.

After configuring the designated test world as described in that guide, run:

```sh
npm run test:foundry:deploy
npm run test:foundry -- integration.spec.mjs
```

The batch runs as GM; player-only End Turn and ownership restrictions are outside
this batch. Dialog tests open and cancel native dialogs rather than submitting
every healing/rest option. Existing targeting suites cover the subsequent attack
and damage workflow.

Hovering or keyboard-focusing an NPC Sheet power shows base hit chances inside the bottom edge of all visible scene PC tokens, including AC attacks. Labels use the canvas interface
layer above token art, stay the same screen size while zooming, and follow token movement/selection.
They disappear on leaving the row, closing/rerendering the HUD, scene teardown or starting activation.
Check overlapping tokens, pan/zoom, changing targets, and hovering different powers in Foundry. During Target Automation, the GM sees chances only on session targets and highlighted PCs.
Situational modifiers remain excluded. Run the focused tests with
`node --test src/dnd4e-health-display/test/power-hit-chance-hover.test.js`.

For a manual check of targeting in your normal world:

1. Copy the updated module with `npm run copy-module -- dnd4e-health-display`.
2. Reload Foundry yourself and check the browser console for errors.
3. Use a Melee 1 power with one eligible enemy in range: it should select that enemy automatically. With more eligible enemies than the power allows, choose targets manually.
4. Check manual target removal, then proceed through the attack dialog, result confirmation, damage, and completion. Also cancel and reopen the attack dialog.

The browser checks for target portrait mouse/keyboard focusing and native attack variant buttons can be run in the designated test world with:

```sh
npm run test:foundry -- target-automation.spec.mjs --grep "target portraits|attack variant buttons"
```

During initial targeting, eligible attacks offer separate Normal attack, Charge attack, and Opportunity attack buttons. PC and NPC powers marked Basic Attack always offer Charge, even with the Charge variant checkbox off; chat-card variants use the same rule. Normal attack appears on the right with two buttons and in the middle with three; a lone attack button retains the Attack! label. Each button opens the matching native dialog; cancelling spends no use. Click a target portrait to pan to its token; hover or keyboard focus outlines it. These controls remain available in result review.

The Quench batch `dnd4e-health-display.damage-confirmation` (**INFO DISPLAYS: GM direct damage and approval**)
clicks the production Apply Damage button against real actors and messages. It verifies
NPC-to-PC hits and zero-damage misses apply without an approval popup, repeated clicks
and receipts cannot apply twice, and PC-to-NPC damage waits for GM approval.
Run it with `npm run test:foundry -- integration.spec.mjs`.
