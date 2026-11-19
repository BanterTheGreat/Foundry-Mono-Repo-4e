# Running tests yourself

Power badges, advancement requirements and ancestry combinations: from `src/character-builder`, run `.\gradlew.bat :shared:jvmTest :shared:jsNodeTest :android:testDebugUnitTest :android:assembleDebug`. `PowerReaderOptionsTest` checks utility levels with nested prerequisites; `PowerRequirementsTest` checks omitted power class/level routing and missing Theme/Path/Destiny conditions. `AncestryComboFeatTest` verifies production Ancestry-tab placement, class eligibility and ancestry scoping.

Feat tier ceilings and power requirements: run `.\gradlew.bat :android:testDebugUnitTest :android:assembleDebug` from `src/character-builder`. `ProgressionOptionsTest` covers tier boundaries, earlier-slot levels and conservative missing-definition behavior; `PowerRequirementsTest` covers readable skill/class/level/ability requirements, grouped alternatives, unmet conditions and suppression of unrelated coverage diagnostics.

Always-visible picker options: from `src/character-builder`, run `.\gradlew.bat :android:testDebugUnitTest :android:assembleDebug`. `ProgressionOptionsTest`, `PowerReaderOptionsTest` and `ClassPickerOptionsTest` verify tier/level/name ordering within eligibility groups, ineligible rows last in ordinary pickers, search across ineligible rows, and inline class sections, and preserved pending/unavailable/explicit-selection safeguards. Device UI tests remain opt-in.

Ancestry size and defense corrections: from `src/character-builder`, run `.\gradlew.bat :shared:jvmTest :shared:jsNodeTest :android:testDebugUnitTest :android:assembleDebug`. `DefenseRulesTest` verifies light/unarmored Int/Dex selection, heavy armor, odd/even half-level AC and tier bonuses on all defenses. Shared class tests verify explicit class bonus contributors. Android overview/session tests cover read-only ancestry size and retained legacy fields; `StatsDisplayTest` covers the defense breakdown.

Armor order and Ability Increase previews: run `.\gradlew.bat :android:testDebugUnitTest` from `src/character-builder`. `EquipmentOptionsTest` checks numeric AC order, ties, unknown bonuses and existing category/proficiency grouping. `ProgressionTest` checks fresh and saved +1 previews, moving/clearing drafts, invalid saved choices and preservation of other ability totals.

Feat tier and power level sorting: from `src/character-builder`, run `.\gradlew.bat :android:testDebugUnitTest`. `ProgressionOptionsTest` verifies Epic/Paragon/Heroic feat order, descending power levels, alphabetical ties, missing power profiles and the existing eligibility/loading groups.

Paragon Path class scoping uses the shared JVM/JS commands below. `PathScopedLoadingTest` counting-source regressions verify that metadata excludes unrelated class paths before any path chunk read or eligibility evaluation, retains shared-class and unscoped/legacy paths, and honors multiclass acquisition timing. The content `test_path_runtime.py` suite checks index scopes and class-separated chunks; regenerate/check production assets with `python -X utf8 content/build.py --check` from `src/character-builder`.

Background Levels saves: from `src/character-builder`, run `.\gradlew.bat :android:testDebugUnitTest --tests "dev.modern4e.builder.BuilderSessionTest"`. The queued-edit tests there use a gated store to check that a submitted edit returns at once and publishes only after its durable write, quick edits apply in order, a failed or rejected edit drops those behind it and clears its row preview, Export is blocked while saving, exclusive actions wait for pending saves, an open dialog survives a queued commit, and a cancelled caller cannot leave memory and storage disagreeing. Device UI tests remain opt-in.

Character Builder advancement through level 19 (from `src/character-builder`, with JDK 21 and the Android SDK configured):

```powershell
.\gradlew.bat :shared:jvmTest :shared:jsNodeTest :android:testDebugUnitTest :android:assembleDebug
python -X utf8 content/build.py --check
python -X utf8 content/samples.py --check
python -X utf8 -m unittest discover -s content -p 'test_*.py'
```

`AdvancementRulesTest` covers ability milestones and invalid or missing advancement choices. `Level19AcceptanceTest` exercises production Fighter level-17 acquisition, level-19 daily replacement, invalid replacement timing, portable reopen, level reduction and path grants at 11/12/16. `PowerSelectionTest` covers replacement target changes and historical eligibility when later replacements exist. Android `ProgressionTest` and `BuilderSessionTest` cover later-level shared editing and persistence. Content tests cover the added acquisition slots, attacks through 19 and paragon path grants and summary-only limitations. UI/instrumentation tests remain opt-in.

Character Builder install command routing and failure propagation: `node --test scripts/test/builder-install.test.mjs`. This uses a stub process runner; a real device install is a separate manual check with `npm run builder:install` (or `make builder-install`).

Ordered power authoring (16 published-reference fixtures plus all 19 local class
migrations and 96 selectable revised Barbarian attacks; Psionics and Monks excluded):

```sh
python -X utf8 src/modern4e/scripts/power_content.py
python -X utf8 -m unittest discover -s src/modern4e/scripts -p test_power_content.py -v
python -X utf8 src/modern4e/scripts/class_content.py
python -X utf8 -m unittest discover -s src/character-builder/content -p test_modern_classes.py -v
python -X utf8 -m unittest discover -s src/character-builder/content -p test_modern_leaders.py -v
python -X utf8 -m unittest discover -s src/character-builder/content -p test_modern_defenders.py -v
python -X utf8 -m unittest discover -s src/character-builder/content -p test_modern_controllers.py -v
python -X utf8 -m unittest discover -s src/character-builder/content -p test_modern_strikers.py -v
npm run typst:compile
```

These tests verify source preservation, branching/roll relationships, grants,
limits/scaling, random tables and malformed-authoring rejection. They do not
claim combat automation or adaptation of published formulas to Modern4e. Leader
tests cover class statistics, choices, shared pools, stable feat-reference IDs,
and feature-section validation. With Typst available they compile the whole book and
fail on any error or warning; with `pypdf` as well they verify pre/post attack
ordering in an actual rendered power. (The pre-migration word-for-word comparison
against `rendered-before.json` was retired once all classes were JSON-backed, since
it flagged deliberate content corrections.) Typst is resolved from `TYPST_BIN`
or the process PATH; run outside the restricted sandbox when its executable is
hidden there. `pypdf` is needed only for the rendered-order test (`python -m pip
install pypdf`). The normal build writes the development PDF at
`src/modern4e/inDev.pdf`.

Striker tests additionally cover all option packages, Warlock's disabled standard
at-will slot, shared Channel Divinity usage, local damage tables, Barbarian class
access/levels, pre-attack movement and distinct secondary attack geometry.

Shared utility authoring (1,046 definitions):

```sh
python3 src/modern4e/scripts/utility_content.py
python3 src/modern4e/scripts/utility_content.py --output /tmp/modern4e-utilities.json
python3 src/modern4e/scripts/utility_content.py --output /tmp/modern4e-utilities.json --check
python3 -m unittest discover -s src/modern4e/scripts -p test_utility_content.py -v
npm run typst:compile
```

Tests cover pre-migration presentation hashes for every card, class/source variant
identity, access/proficiency/level conditions, pick types, formerly withheld utilities in their class sections,
malformed inventories/powers, deterministic export and safe importer destinations.
With Typst available, they render every available section and reject a withheld
section on a copy with one section flipped. Runtime effects and builder package integration remain unimplemented.
See the [utility contract](../src/modern4e/content/utilities/README.md).

Shared Modern 4e equipment catalog, migration goldens, builder export and actual Typst table rendering:

```sh
python3 -m unittest discover -s src/character-builder/content -p 'test_modern_equipment.py' -v
python3 src/character-builder/content/build.py --modern-equipment
python3 src/character-builder/content/build.py --modern-equipment --check
npm run typst:compile
```

The renderer test requires Typst on PATH or `TYPST_BIN`. This authoring export
does not enable equipment combat calculations in the current builder runtime.

Modern 4e feat JSON, complete rulebook references, and safe Typst rendering (the renderer check requires Typst on PATH or `TYPST_BIN`):

```sh
node --test scripts/test/modern4e-feats.test.mjs
npm run typst:compile
```

Dungeondraft tooling, including explicit multilevel generation, validation, and level previews:

```sh
npm run test:dungeondraft
```

Preview an explicitly requested level with any map's preview entry script:

```sh
node src/dungeondraft-tools/maps/dockyard-warehouse/preview-dungeondraft-map.mjs path/to/map.dungeondraft_map --level 1 --pps 64
```

Level 0 keeps `<map>-preview.png`; other levels use `<map>-level-<index>-preview.png` unless `--out` is supplied.

Cauldron Hill complete Dungeondraft artifact (room inventory, connected doors, floor coverage, native format and mapping rules):

The expanded version with Borne's chamber, lifts and bridge:

The detailed revision adds room dressing, industrial networks and Borne machinery:

Focused golem-room revision (includes berth, fuel, winch, collar and bridge-drive checks):

Revision without golem depictions and with solid prototype hallway flooring:

Solid-floor checkpoint hall revision:

Revised servicing-bay and spare-component assets:

Cafeteria spacing revision:

Wall-lantern layering revision:

Native four-level Cauldron Hill revision:

Compact four-level revision, with translated-layout and crop checks:

```sh
node output/maps/cauldron-hill-complex-v11/build.mjs
node --test output/maps/cauldron-hill-complex-v11/verify.test.mjs
node output/maps/cauldron-hill-complex-v11/render.mjs
```

The native map uses a shared 112 x 90 canvas; PNGs are cropped independently around each level. `render.mjs 16` makes small previews.

```sh
node output/maps/cauldron-hill-complex-v10/build.mjs
node --test output/maps/cauldron-hill-complex-v10/verify.test.mjs
node output/maps/cauldron-hill-complex-v10/render.mjs
```

Levels are Ground (0), Lake Entrance (1), Upper Borne Chamber (2) and VIP Suites (3). `render.mjs 16` makes small previews; the default writes one 64-pixel-per-square PNG per level. Open the native map and switch among all four levels for the final application check.

```sh
node output/maps/cauldron-hill-complex-v9/build.mjs
node --test output/maps/cauldron-hill-complex-v9/verify.test.mjs
```

```sh
node output/maps/cauldron-hill-complex-v8/build.mjs
node --test output/maps/cauldron-hill-complex-v8/verify.test.mjs
```

```sh
node output/maps/cauldron-hill-complex-v7/build.mjs
node --test output/maps/cauldron-hill-complex-v7/verify.test.mjs
```

```sh
node output/maps/cauldron-hill-complex-v6/build.mjs
node --test output/maps/cauldron-hill-complex-v6/verify.test.mjs
```

```sh
node output/maps/cauldron-hill-complex-v5/build.mjs
node --test output/maps/cauldron-hill-complex-v5/verify.test.mjs
```

```sh
node output/maps/cauldron-hill-complex-v4/build.mjs
node --test output/maps/cauldron-hill-complex-v4/verify.test.mjs
```

```sh
node output/maps/cauldron-hill-complex-v3/build.mjs
node --test output/maps/cauldron-hill-complex-v3/verify.test.mjs
```

```sh
node output/maps/cauldron-hill-complex-v2/build.mjs
node --test output/maps/cauldron-hill-complex-v2/verify.test.mjs
```

```sh
node output/maps/cauldron-hill-complex/build.mjs
node --test output/maps/cauldron-hill-complex/verify.test.mjs
```

Requires the local Crosshead asset index and reference Dungeondraft map. Manually open the generated `.dungeondraft_map` to check pattern scale and portal rendering; place door art and wall shadows by hand. This artifact is not deployed to Foundry.

Combat Challenge actor toggle, native multi-target misses, native marker/expiry, off-turn refresh, friendly exclusions, Target Automation confirmation and player-to-GM marking:

```sh
npm test --prefix src/banter-4e-modifications
npx playwright test --config tests/foundry/playwright.config.mjs combat-challenge.spec.mjs
```

Deploy first with `npm run copy-module -- banter-4e-modifications`. In the actor sheet's **Trigger prompts** menu, find **Class Features → Combat Challenge → Enabled**. The world setting **Enable trigger prompts** must be on (reload after enabling it). The actor option is off by default and applies immediately after Save. Live tests require the designated test world, an idle GM test session and the passwordless `Player` test account.

Expanded trigger families, shared attack/defense/damage filters, explicit companion bindings and Target Automation confirmation:

```sh
npm test --prefix src/banter-4e-modifications
node --test src/dnd4e-health-display/test/*.test.js
npx playwright test --config tests/foundry/playwright.config.mjs trigger-prompts.spec.mjs --grep "expanded triggers"
npx playwright test --config tests/foundry/playwright.config.mjs target-automation.spec.mjs --grep "combat trigger prompts"
```

Deploy first with `npm run test:foundry:deploy`. In each power or feat's Triggers dialog, choose the trigger and optional filters. For companion events, explicitly select the companion actor; it need not have an initiative slot. Damage-type filters require recorded typed damage from Target Automation. Attack prompts use confirmed automation verdicts, including opportunity variants, instead of preliminary results. These are prompts; interrupts do not pause the native roll.


Trigger restrictions and shared item limits (non-minions, melee, adjacency, your bloodying hits, ally defeats, shared turn usage, first occurrence per encounter, and daily refresh on Extended Rest):

```sh
npm test --prefix src/banter-4e-modifications
npx playwright test --config tests/foundry/playwright.config.mjs trigger-prompts.spec.mjs --grep "trigger restrictions"
```

Configure these on a power or feat's **Triggers** dialog. Restrictions are per assignment; the shared limit applies across every assignment on that item. Turn/day limits are spent when a prompt is selected; Ignore leaves them available. **First time per encounter** offers only the first qualifying occurrence, even if ignored. Daily usage refreshes through **Extended Rest**, not Short Rest or a calendar date change. Recorded damage is required to identify who bloodied an enemy and whether HP loss came from a melee attack.

Defeat triggers and feat assignments/chat posting (HP crossings, hostility, adjacency, recorded damage attribution, text suggestions and sheet controls):

```sh
node --test src/banter-4e-modifications/test/trigger-definitions.test.js src/banter-4e-modifications/test/hp-damage-source.test.js src/banter-4e-modifications/test/trigger-prompts-adapter.test.js src/banter-4e-modifications/test/actor-trigger-configuration.test.js src/banter-4e-modifications/test/power-trigger-dialog.test.js src/banter-4e-modifications/test/trigger-prompt-chat.test.js src/banter-4e-modifications/test/trigger-text-suggestions.test.js
```

Live Quench coverage (**BANTER: Defeat triggers and feat prompts**), including native HP hooks, feat sheet configuration and claimed chat posting:

```sh
npx playwright test --config tests/foundry/playwright.config.mjs trigger-prompts.spec.mjs --grep "defeat triggers"
```

After reload, assign either defeat trigger to a power or feat using its sheet's Triggers control. Apply lethal damage through the damage panel: the recorded attacker and hostile adjacent combatants should receive their assigned prompts. Manual HP edits can prompt adjacent combatants but do not guess an attacker. Selecting a feat posts its card without rolling, spending resources or starting Target Automation. Check the browser console.

NPC opportunity-prompt defaults and saved overrides: `node --test src/banter-4e-modifications/test/actor-trigger-configuration.test.js`.

Compact floating trigger alerts (hidden chat records, cause text, actual power tooltips, Target Automation handoff with native-use fallback, Ignore, privacy, duplicate renders and the 25-second deadline timer):

```sh
node --test src/banter-4e-modifications/test/trigger-prompt-alerts.test.js src/banter-4e-modifications/test/trigger-prompt-chat.test.js
npx playwright test --config tests/foundry/playwright.config.mjs trigger-alerts.spec.mjs
```

The browser check requires the designated test world and a deployed module. After reloading a campaign world, verify the alert appears above the hotbar with chat closed, power details appear on hover and keyboard focus, and the bottom gold line drains until the alert expires. Check the browser console.

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

Combat Ledger and Battle Momentum, including their "Enable" world settings:

```sh
node --test src/dnd4e-health-display/test/combat-ledger.test.js src/dnd4e-health-display/test/battle-momentum.test.js
```

After reload, untick "Enable Combat Ledger" and/or "Enable Battle Momentum" in module settings, reload again, and confirm the matching combat tracker buttons are gone and the console is clean. With only the Ledger off, the momentum button should still appear.

Compact combat tracker (pure logic, turn timer and pause rules, removal of Mark as Defeated only in compact mode, and the tracker wiring against hand-made DOM nodes):

```sh
node --test src/dnd4e-health-display/test/compact-tracker-data.test.js src/dnd4e-health-display/test/turn-timer.test.js src/dnd4e-health-display/test/compact-tracker.test.js
```

The Quench batch **INFO DISPLAYS: Compact combat tracker** covers the same feature in Foundry's real tracker, including real
layout, drag events and a real Target Automation session; it runs with `npm run test:foundry` or from Quench's UI (see
[tests/foundry/README.md](foundry/README.md#compact-combat-tracker-coverage)).

The Node tests cannot show real styling. After reload, enable **Compact combat tracker** in module settings and check, as GM: rows have no portraits and show role icons and coloured current/max HP; before Begin, editing an initiative re-sorts the list; after Begin, dragging a row between two others keeps the highlighted turn on the same combatant. Open Select Targets for the acting player's token and confirm the timer reads "Paused · Target Automation", then roll with Dice So Nice on and confirm "Paused · Dice So Nice". As a player, confirm no drag handles, no timer and no enemy HP. Disable the setting and confirm the stock tracker returns without a reload. Check the browser console.

Token hover display (ring, gems, the stepped name tag outline, effect endings and ordering, strip placement, pan/zoom handling and the absence of the old top-centre panel against mocked Foundry globals):

```sh
node --test src/dnd4e-health-display/test/token-ring-data.test.js src/dnd4e-health-display/test/token-hover-effects.test.js src/dnd4e-health-display/test/token-ring.test.js
```

The Node tests cannot show real rendering. After reload, hover tokens: no extra circle should surround the token; the slim, see-through name tag should hang from its lower rim with the diamond gems on the rim and the name below (a coloured border only for Solo, Leader, Elite and Minion creatures, none for ordinary ones), and the effect list should sit beside it; nothing should appear at the top of the screen. Check a PC, an elite or solo, a minion, a bloodied creature and a defeated NPC (no state word anywhere); a creature with 8+ effects; custom effects (description line) versus conditions (one line); amber "ending soon" rows after advancing the turn; a token near the right, top and bottom screen edges; pan, zoom and dragging the hovered token; and the browser console.

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

## Banter trigger prompts

Run the full Banter's 4e Modifications suite (trigger definitions, events, geometry, text suggestions, configuration, prompt chat, and the hook adapter):

```sh
npm test --prefix src/banter-4e-modifications
```

Live checks in the designated test world (deploy first with `npm run test:foundry:deploy`; the Foundry server must be running with the world loaded). The first runs every trigger, positive and negative, through real hooks (about 2 minutes). The second needs the non-GM test player and no other GM connected; it checks prompts for a player's own moves, hiding from non-recipients, a simultaneous claim by GM and player, and prompts with no GM connected (about 1 minute):

```sh
npx playwright test --config tests/foundry/playwright.config.mjs trigger-prompts.spec.mjs
npx playwright test --config tests/foundry/playwright.config.mjs trigger-prompts-players.spec.mjs
```

After reload with "Enable trigger prompts" on, check in a test world with a started combat (no GM needs to stay connected once a player is acting):

- Open a power's **Triggers** header button. Tick "Suggest triggers from this trigger text": the matched trigger, the matched wording and anything "Not checked" appear, matching rows are ticked, and nothing is stored until Save. Untick it and the rows return to how they were.
- Move a token past an enemy as a player and as the GM; both should offer the enemy's opportunity attack, and moving away without passing adjacent should not.
- Click a prompt's power as the owning player, and as the GM, while the other client watches: exactly one use is recorded and the card loses its buttons on every client.
- Let a prompt run out, then reload: its buttons are gone and the card is removed.

## Reading the results

The final summary lists the number of tests that passed, failed, or were skipped. A successful run has `fail 0`; failed tests include their names, assertion details, and file locations. Tests skipped by a name filter have not been checked by that run. Without the `tee` pipe, a failing run also returns a nonzero exit status.

## Other suites and Foundry checks

`npm test` runs the repository tooling tests under `scripts/test/`; it does **not** run all module suites. For another module using Node's test runner, run its `test/*.test.js` files in the same way, or use its own `package.json` test command if provided.

Local tests use mocked Foundry boundaries and cannot verify the running application's rendering or system integration. For browser and Quench tests in the designated test world, follow [the Foundry integration guide](foundry/README.md).

Actor HUD live coverage is registered as `dnd4e-health-display.actor-hud` in Quench
(**INFO DISPLAYS: Actor HUD tabs and controls**). It covers all PC power groups,
Feats, Skills, Items and Extras, plus the NPC-only Sheet with basic attacks and
trait disclosures. It also exercises search, menu dismissal, token switching,
equipment toggles, Wizard preparation flags/limits and scroll retention, resource edits, native sheets/dialogs, skill rolls, power
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

The Quench batch `dnd4e-health-display.damage-confirmation` (**INFO DISPLAYS: Manual PC damage and NPC approval**)
clicks the production Apply Damage button against real actors and messages. It verifies
NPC-to-PC hits and zero-damage misses confirm in chat without changing HP or temporary HP,
repeated clicks cannot apply PC damage, and PC-to-NPC damage waits for GM approval.
Run it with `npm run test:foundry -- integration.spec.mjs`.

The `dnd4e-health-display.multi-attack` Quench batch (**INFO DISPLAYS: Multi-creature attacks**)
selects three unlinked minions sharing one NPC. It covers the group HUD (one portrait, one
bar each, Sheet-only menu, Use Power for a Melee power, hidden for a mixed selection), the
attackers-per-target input and range warnings, random range-checked assignment, one native
dialog with later dialogs hidden and the user's manual edits shared, cancelling, per-minion
uses, per-attack damage rows, and applying each hit to the target separately. A second case
uses a Melee 5 power with three targets each for nine attacks. The banter batch
`banter-4e-modifications.active-defense` also checks that every attack of a multi-attack is
intercepted with its own DC and resolves on its own message. The Playwright scenario
`multi-attack-defense.spec.mjs` needs the non-GM test player and checks that the player gets
one dialog for all attacks, rolls each defense, and that a reload does not reopen it.
Run the Quench batches with `npm run test:foundry -- integration.spec.mjs`.

Power/feat trigger catalog and editor (categories, assignment indicators, preserved form values): `node --test src/banter-4e-modifications/test/power-trigger-dialog.test.js`.

Automatic benefit announcements: `npm test --prefix src/banter-4e-modifications` covers native feat/feature item-card rendering, public versus private routing, immediate usage claims, duplicate item assignments, exhausted limits, and persistent non-claimable announcements. Live rendering: `npx playwright test --config tests/foundry/playwright.config.mjs automatic-benefit.spec.mjs` (designated test world required).

The trigger catalog browser regression runs in `npm test --prefix src/banter-4e-modifications`, or alone with `node --test src/banter-4e-modifications/test/power-trigger-picker.test.js`. Install root dependencies and Chromium first (`npm install`, `npx playwright install chromium`). It exercises the production dialog with native form controls and a DialogV2 shell, covering pane borders, selected-row contrast, visually hidden accessibility labels, navigation, category/search empty states, assignment indicators, suggestion undo, and submission of hidden assignments, filters, automatic benefit and shared limit. It does not require a live Foundry server.

## Opportunity Attack prompt regression checks

Run `node --test src/banter-4e-modifications/test/trigger-item-limits.test.js src/banter-4e-modifications/test/trigger-prompts-adapter.test.js src/banter-4e-modifications/test/trigger-definitions.test.js src/banter-4e-modifications/test/trigger-prompt-chat.test.js`
for shared turn usage, per-enemy prompt history, Shift exclusion and prompt claims.
Live movement checks are part of the trigger-prompts Quench batch; see `tests/foundry/README.md`.

Foundry MCP Trigger Automation discovery, validation, confirmed saves, cancellation,
stale source/session rejection, usage preservation and partial-write receipts:

```powershell
node --test src/foundry-mcp/test/trigger-automation.test.js
npm test --prefix src/foundry-mcp
```

After deploying, manually reload Foundry and restart MCP clients (protocol v37).
Read `get_trigger_automation`, review an `edit_trigger_automation` request, and
verify its fields in the Triggers dialog and check the browser console.

Foundry MCP equipment power localization (copy/relink, deduplication, retry recovery,
cancellation, source/session guards, preserved data and rejected destinations):

```powershell
node --test src/foundry-mcp/test/localize-item-powers.test.js src/foundry-mcp/test/mcp.test.js
npm test --prefix src/foundry-mcp
```

Live verification is pending: reload Foundry and restart MCP clients for protocol v38,
check the browser console, cancel one review, then approve and inspect world power
copies plus the equipment links. Retry to confirm no duplicate copies.

Foundry MCP world-power name-only edits (preserved data, cancellation, stale source,
session loss, unsupported destinations, concurrent review and partial-save retries):

```powershell
node --test src/foundry-mcp/test/world-power-name.test.js src/foundry-mcp/test/mcp.test.js
npm test --prefix src/foundry-mcp
```

After deploying protocol v39, reload Foundry and restart MCP clients. Check the
browser console, cancel then approve a rename batch, verify equipment links remain
valid, and retry to confirm no changes. Live verification is pending.

The banter module suite also covers You hit an enemy and the Critical hit only filter.

Damage-only Target Automation (no attack roll): the health-display Node suite covers direct damage review, cancellation/retry without repeated costs, confirmed chat receipts, and PC/manual versus NPC/GM application.

```sh
node --test src/dnd4e-health-display/test/power-activation.test.js src/dnd4e-health-display/test/damage-application.test.js
```

Wizard spellbook limits, eligibility and native prepared-flag changes also have Node coverage:

```sh
node --test src/dnd4e-health-display/test/actor-hud.test.js
```

Uses Power trigger: `node --test src/banter-4e-modifications/test/uses-power.test.js`. Live: `npx playwright test --config tests/foundry/playwright.config.mjs trigger-prompts.spec.mjs --grep "expanded triggers"`.
`node --test src/foundry-mcp/test/trigger-automation.test.js` covers MCP trigger discovery and confirmed Uses Power assignment/filter creation, invalid filters, retries and cancellation.

Summon automation Node coverage includes separate square selection, per-power maximums, removal, range, duplicate rejection, batch creation, ownership and footprint validation.

## Character Builder shared core and content production

Android character navigation order, initial tab after creation and reopening, Levels missing-choice
counts, picker eligibility progress and ordering, same-slot picker reuse and sibling invalidation, ready
ancestry and new-character class details, main-only starting ability scores, utility picker color mapping,
bundled Zeitgeist theme descriptions, and the current-power list helper are covered by
`gradlew.bat :android:testDebugUnitTest` from `src/character-builder` on Windows
(`bash ./gradlew :android:testDebugUnitTest` on Unix).

Android Character Builder level changes and portraits (from `src/character-builder`, run
`bash ./gradlew :shared:jvmTest :shared:jsNodeTest :android:testDebugUnitTest`):
`BuilderOperationsTest` and `BuilderSessionTest` cover levels 1–30,
padded level records, pruning choices above the target level and the confirm/cancel dialog state; `PortraitStoreTest`,
`PortraitSessionTest` and `BitmapPortraitEncoderTest` cover portrait file handling
(save/replace/delete, hostile ids, oversize and unusable images), that choosing, exporting
and importing never change or carry portrait data, deletion cleanup and downscaling.

Android JVM and Python feat runtime tests cover indexed Class feat scoping, including
alternative class access and Android picker refresh after gaining multiclass access.
Feat consolidation tests cover shared section references, OR class access, shield
requirements, retained ancestry placement, corrected titles and explicit old-ID
migration. Typst parity checks resolve referenced placements before comparing output.

Ticket #29 adds `ContentMigrationTest`, `ProficiencySelectionTest` and
`SharedContentAcceptanceTest` to the existing JVM/JS tasks, plus historical,
circular, multiclass and campaign eligibility regressions. The Python discovery
command below also runs campaign policy, reviewed ID-map, compiler and acceptance
fixture checks. `samples.py --check` verifies all regression/acceptance characters.
Acceptance uses one utility total at level 2, with separate combat/non-combat
examples and explicit partial automation. No migration UI or full feat-effect
automation is claimed.


Shared class runtime and authoritative production classes (#33–#35), from the repository root:

Ancestry, theme, feat, utility and equipment runtime packages add one Python suite each, plus a shared JVM/JS test:

```powershell
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_ancestry_runtime.py' -v
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_theme_runtime.py' -v
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_feat_runtime.py' -v
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_utility_runtime.py' -v
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_equipment_runtime.py' -v
python -X utf8 src/character-builder/content/build.py --check
bash ./gradlew :shared:jvmTest :shared:jsNodeTest   # from src/character-builder
```

The Python suites cover authored counts, unique IDs, determinism, structured access/prerequisite preservation,
unresolved/unsupported reporting, no query-pool leakage for granted powers and cross-package references.
`ProductionContentPackagesTest` loads the bundled bytes through the shared catalog, offers and accepts ancestry,
theme, feat, utility and equipment entries, checks class-gated feat/utility eligibility and that formerly deferred off-slot utilities (Fighter Shield Block, level 8) reach the level-10 pool,
and keeps 798-feat option listing fast. Android tests need an Android SDK; review the sample template's package
list when adding packages.

The Android option-list warm-up (Home preloads Class and Ancestry for the default package configuration; new unfilled ancestry power choices warm first after an ancestry change, then Class Feature choices, other power pools, and Class, Ancestry and General feats; every level 1-2 list checked on opening a character and after saved edits; Class/Ancestry lists that never refresh, later-level edits that keep earlier-level lists, rename-style edits that refresh nothing, warm targets limited to the active class's own choices, a settle delay, cancellation by later edits, quiet background read failures and no further content reads when a warmed list opens, and a level 19 warm-up decoding each chunk a few times at most rather than once per feat slot) is covered by `BuilderSessionTest`, with shared browsing-session reuse in `BuilderOptionListingTest`; the shared power fast path (equivalence with per-power activation, fallbacks) is covered by `PreparedPowerChoicesTest` in the shared JVM/JS suites:

```powershell
bash ./gradlew :android:testDebugUnitTest --tests "dev.modern4e.builder.BuilderSessionTest"   # from src/character-builder
```

The other 17 non-Barbarian classes' attacks (Defenders, Controllers, Strikers and Leaders, levels 1-15) add ten Python regressions in `test_class_attacks.py`; run it after any change to `import_class_attacks.py` or an `<class>-attack-powers.json` file:

```powershell
python -X utf8 -m unittest discover -s src/character-builder/content -p test_class_attacks.py -v
```

They cover every source identity per class (minus titles already authored as Modern 4e powers), the level-15 boundary, source preservation, local wording (no stock skills or "modifier"), range/action completeness, skill prerequisites, granted follow-up activations and errata removal, faithful attack statistics and counts, deferral of powers that need builds Modern 4e lacks (no `powerProfile`, still resolvable by ID), source-independent runtime compilation and the chunked, consistently indexed classes package. Class-scoped loading is covered by the Python per-class chunk/`classId` test above and by the shared `ClassScopedLoadingTest` (`:shared:jvmTest`, `:shared:jsNodeTest`): index rows, scoped search, a Fighter reading under a third of the chunks and loading no other class's power, a Wizard's pools excluding Fighter powers, and deferred powers staying resolvable by ID but never offered.

Regenerate review files with `python -X utf8 src/modern4e/scripts/import_class_attacks.py --class <Name>... --output-dir <new scratch dir>`; it refuses to overwrite authoritative data. After changing authoritative content, rebuild into an empty `modern4e.classes` folder (`build.py` rejects stale chunk layouts), then run `samples.py`.

Fighter selectable attacks through level 15 add five Python regressions:

```powershell
python -X utf8 -m unittest discover -s src/character-builder/content -p test_fighter_attacks.py -v
```

They cover all 174 source identities, the level-15 boundary, source preservation,
direct-point rules, attack sequences/scaling, prerequisites and source-independent
runtime compilation. `ProductionClassPackageTest` also checks actual generated
Fighter pools, level/proficiency/class filtering, level-13/15 replacements and
portable reopening on JVM and JS. Historical eligibility and retraining timing
remain explicitly incomplete. Typst compilation and Fighter card/page inspection
are required when Typst is available.

```powershell
python -X utf8 src/character-builder/content/build.py --modern-classes-runtime
python -X utf8 src/character-builder/content/build.py --modern-classes-runtime --check
python -X utf8 -m unittest discover -s src/character-builder/content -p test_class_runtime.py -v
python -X utf8 src/character-builder/content/build.py
python -X utf8 src/character-builder/content/build.py --check
python -X utf8 src/character-builder/content/samples.py --check
python -X utf8 -m unittest discover -s src/character-builder/content -p test_production_classes.py -v
```

From `src/character-builder/`, run `./gradlew.bat :shared:jvmTest
:shared:jsNodeTest :shared:jsBrowserProductionLibraryDistribution`, then
`npm test --prefix web` and `npm run build --prefix web`. The shared tests load
the Python-compiled Fighter golden on both targets, covering class formulas and
recalculation, both independent feature choices, multiple/repeated automatic
powers, acquisition gates, structured eligibility, cycles/duplicates/conflicts,
missing dependencies, editing/class changes, reconciliation and portable reopen.
The web test verifies the compiled JSON calculation API against the same data.
`PowerSelectionTest` covers generic power slots, feature overrides/conflicts,
selection-set constraints, owned collections, replacement history and request-local
chunk reuse with fresh content on subsequent evaluations. Compiler tests compare
shared acquisition slots with authoritative GAIN events through level 10.
`ProductionClassPackageTest`
loads the exact generated production bytes on JVM and JavaScript, including the
current Modern Fighter sample and preserved synthetic legacy identity. Python production
tests cover poisoned compendium classes, local edits, missing/malformed data,
duplicate identities, explicit unsupported coverage and stale outputs. Tests do
not imply combat automation, complete level 1–30 retraining or automatic legacy
character migration.

Normal generation writes only the six authoritative packages to `content/production-generated/`.
Both platforms bundle that shared directory. Regenerate current-data test characters,
the test-only presentation override and the app starter with:

```powershell
python -X utf8 src/character-builder/content/samples.py
python -X utf8 src/character-builder/content/samples.py --check
```

`CurrentDataSampleTest` verifies current suppliers/fingerprints, two Skill Training picks,
known skill modifiers, portable level 1/2 round trips and missing-override protection on JVM/JS.
`ProductionCatalogTest` checks lazy replacement loading with unchanged real mechanics.
`test_samples.py` checks source edits reach fingerprints and app bundles exclude all test
packages. The old proof packages/characters and their regeneration command are removed.
Tiny synthetic contract inputs remain for codec and malformed-input tests.


`samples.py` also generates/checks `sample-modern-fighter.json`; the four legacy
proof samples keep their original class identities and provenance.

Shared class authoring / Fighter migration (#30/#31), from the repository root:

```sh
python3 src/modern4e/scripts/class_content.py
python3 src/modern4e/scripts/class_content.py --output /tmp/modern4e-classes.json
python3 src/modern4e/scripts/class_content.py --output /tmp/modern4e-classes.json --check
python3 -m unittest discover -s src/character-builder/content -p 'test_modern_classes.py' -v
npm run typst:compile
```

The class tests cover complete Fighter flavor/statistics, independent build choices,
granted power/scaling references, stable identities after moves/renames, shared
conditions, strict authoring errors/cycles, deterministic exports and actual
Typst/JSON agreement. Test-only Druid/Wizard/Shaman fixtures cover choice-set limits,
known/stored/prepared collections, cantrip counts and nested grants. They do not
claim runtime automation or additional migrated classes. See the
[class authoring contract](../src/modern4e/content/classes/README.md).


Shared Modern 4e feat authoring (#28), from the monorepo root:

```sh
python3 src/character-builder/content/build.py --modern-feats
python3 src/character-builder/content/build.py --modern-feats --check
python3 -m unittest discover -s src/character-builder/content -p 'test_*.py' -v
npm run typst:compile
```

The authoring catalog is generated into ignored `content/modern-feats-generated/`;
it is not a v1 runtime package and does not change installed web/Android proof
bundles. Tests cover all 798 stored IDs, explicit access independent of file
location, same-title variants, grouped conditions, Modern 4e skill/point identities,
multiclass/power queries, missing and ambiguous references, malformed authoring,
deterministic export/check failures and preserved descriptive benefit conditions.
Feat selection tests additionally cover explicit occurrence caps, the five repeatable
exceptions, character/entry/power distinctness, Linguist's skill-only exhaustion
fallback, finite option counts, armor advancement, the superior-weapon/bundle
alternative, malformed selection data and pending option catalogs. Feat authoring
and catalog schemas are v2; runtime packages are unchanged. A second Typst query
compares generated selection text with the export for every feat.
When Typst is on PATH, a query test compares its generated requirement text with
the builder export for every entry; that test explicitly skips without Typst.
The book build also needs the configured fonts; inspect representative feat pages
after shared renderer changes. See [shared feat authoring](../src/modern4e/content/feats/README.md).

Build-time compendium production (Python 3.9+, standard library; run from repository root):

```powershell
python -X utf8 src/character-builder/content/build.py
python -X utf8 src/character-builder/content/build.py --check
python -X utf8 src/character-builder/content/samples.py --check
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_*.py' -v
```

See [content production](../src/character-builder/content/README.md) for full extraction and asset layout. Tests cover malformed/non-executable JSONP, exact HTML/identity preservation, authored Modern 4e mechanics, explicit incomplete coverage, duplicate IDs, invalid vocabulary/ranges/targets, dependency cycles/revisions, mechanical references, category expansion and deterministic regeneration. `ProductionPackageTest` runs with the JVM/JS commands below and consumes the exact generated proof manifests/indexes/chunks using unchanged shared contracts. Production tooling is separate from runtime catalog logic.

See [the standalone build guide](../src/character-builder/README.md) for toolchains and SDK setup. From `src/character-builder/`:

```powershell
.\gradlew.bat :shared:jvmTest :shared:jsNodeTest :shared:jsBrowserProductionLibraryDistribution
npm ci --prefix web
npm test --prefix web
npm run build --prefix web
.\gradlew.bat :android:assembleDebug :android:assembleDebugAndroidTest
# Requires a running Android emulator or connected device:
.\gradlew.bat :android:connectedDebugAndroidTest
```

On Linux/macOS substitute `bash ./gradlew` for `.\gradlew.bat`. These tests do not require Foundry and this project is never copied into Foundry.

The shared JVM/JS tasks also run the checked-in `shared/fixtures/` contract goldens: character/package round trips, unresolved selections and retraining, source/ordinal slot identity, Modern 4e skill mappings, incompatible/malformed formats, unavailable diagnostics, and canonical SHA-256 fingerprints against an independently generated digest and standard hash vectors. Gradle embeds the same fixture bytes in both test targets; no platform filesystem access is needed in common tests.

`CharacterCodecTest` additionally checks repeated semantic round trips (including Unicode, metadata, Modern 4e choices and unresolved content), required/defaulted fields, unknown/duplicate fields, strict scalar types and enums/maps, blank IDs, timestamps, invalid contract structure and checked export failures. Mechanical allocation legality remains engine work and does not block exchange. Web tests exercise `decodeCharacterJson`/`encodeCharacterJson` against the actual generated Kotlin distribution, including successful value serialization and structured failure envelopes. No storage or Foundry runtime is involved.

`ContentCatalogTest` runs under the same `:shared:jvmTest :shared:jsNodeTest` commands.
It uses the existing JSON manifest/index/chunk fixtures through an in-memory `ContentSource`,
with no package conversion or platform IO. Coverage includes character-local package order,
whole-entry overrides, lazy metadata search, provenance/fingerprints, saved supplier/entry
failures versus ordinary misses, deliberate switches, changed definitions, dependency revisions,
disabled dependencies/cycles, duplicate metadata/configurations, invalid chunks, IO failures,
internal references and unadapted-prerequisite diagnostics. Catalog behavior is shared Kotlin;
there is no catalog UI or rules execution in this ticket.

`CharacterImportTest` runs under the same shared JVM/JS commands. It exercises complete format validation before storage access, collision details/timestamps, explicit import/replace/copy/cancel actions, fresh IDs, atomic compare-and-recovery saves, stale previews, discoverable backups, safe restoration and read/recovery/save failures using a failing in-memory adapter. Platform adapters must satisfy the documented `CharacterStore` contract; the browser suite below verifies real IndexedDB and browser exchange; Android persistence remains separate.

`RulesEngineTest` and `EngineModifiersTest` use the same shared JVM/JS tasks. They cover current Modern 4e allocation budgets/caps/tradeoff, all skill mappings, explained proficiency sources, duplicate proficiency handling, grants/choices, eligibility and unsupported prerequisites, missing definitions/cycles, level-2 content, typed/untyped stacking, penalties, explicit base/floor operations, manual labels and unavailable/overflow results. Run unfiltered `:shared:jvmTest :shared:jsNodeTest` for cross-platform verification; Gradle `--tests` filtering may silently select zero Node/JS tests.

Shared `ContentReconciliationTest` runs on JVM and JS with the same Gradle commands.
It covers current-definition recalculation without acknowledgment, revision-only
changes, persistent acknowledgment, missing suppliers/entries and detail failures,
explicit fallback on package switches, order/cancel/stale commits, invalid choices,
and inventory/replacement occurrences. See [reconciliation API](../src/character-builder/shared/BUILDER.md).

Shared `BuilderOperationsTest` runs on JVM and JS with the commands above. It covers incremental/direct level-2 creation, repeated choice slots, stable IDs, eligible/forced choices, allocation limits, changed backgrounds, and edits/export with missing content. Operation contracts: [BUILDER.md](../src/character-builder/shared/BUILDER.md).

On macOS/Linux, from `src/character-builder/`, run `bash gradlew :shared:jvmTest :shared:jsNodeTest :shared:jsBrowserDevelopmentLibraryDistribution` to test both targets and build the shared browser library.
### Android adapters (#14)

From `src/character-builder/`, with JDK 21 and SDK 34 configured:

```sh
bash ./gradlew :android:testDebugUnitTest :android:assembleDebug :android:assembleDebugAndroidTest :shared:jvmTest
# With an API 34 emulator/device available:
bash ./gradlew :android:connectedDebugAndroidTest
```

`AndroidAdaptersJvmTest` runs the Android file/content/exchange adapters under
Robolectric API 34. `AndroidAdaptersTest` repeats the contract on device: reopen
persistence, collision actions, stale comparisons, recovery restoration/retention,
failed and interrupted publication, malformed storage, permissions/cancellation,
and generated asset loading. Instrumentation compilation alone is not device execution.
Current-data regression characters: `CurrentDataSampleTest` runs the four generated level 1/2 characters on JVM and JS, using current rules, supplier fingerprints and missing-override protection. Regenerate with `python -X utf8 src/character-builder/content/samples.py`; see [fixture generation](../src/character-builder/content/README.md#current-data-test-fixtures).

### Character Builder browser adapters (#13)

After generating the shared JS distribution and installing web dependencies, from
`src/character-builder/`:

```sh
npm exec --prefix web -- playwright install chromium
npm run test:browser --prefix web
```

Playwright starts and stops its own Vite server on port 4173. The isolated test
harness lives under `web/browser/` and is not part of the application UI. Tests run
the documented shared store behavioral contract against real Chromium IndexedDB,
including detached reads, complete-document conflicts, concurrent creates,
transaction rollback after recovery/publication failures, reload persistence and
retained recovery copies. The actual generated Kotlin importer runs collision,
copy, cancellation and restoration workflows through that adapter. Browser file
selection/downloads exercise the shared codec; content tests exercise the shared
catalog over generated JSON assets and distinguish asset failures. Injected quota
and database failures are deterministic fault tests, not attempts to fill the host
browser's disk. No Foundry or Android emulator is required.

### Android Home and Character Overview (#22/#23)

`BuildInfoTest` checks the generated app build timestamp resource with `:android:testDebugUnitTest`. `SmokeScreenTest.homeDisplaysPackagedBuildTimeAfterRecreation` checks the Home label remains visible and unchanged after activity recreation with `:android:connectedDebugAndroidTest`. The timestamp uses Europe/Amsterdam time and refreshes on every build.

The presentation split (#27) uses the same workflow and Compose regression suites. Run `bash ./gradlew :android:testDebugUnitTest :android:assembleDebug :android:assembleDebugAndroidTest :shared:jvmTest` to check the extracted screens, dialogs, components and theme; device execution remains the separate command below.

From `src/character-builder`, run `bash ./gradlew :android:testDebugUnitTest` for adapter and workflow tests. `BuilderSessionTest` covers durable create/open/edit/cancel/reopen, failed-save protection and mandatory error reset, newer/older import collision previews, copy/cancel/replace, recovery restoration, unsupported input, retained equipment/adjustment operations, confirmed deletion/cancellation/failure/reset with recovery retention, personal-detail cancel/save/clear/reopen missing content with unrelated edits, blocked actions after operational failure, session reset, committed-save preservation and fresh workflows after reset. `StatsDisplayTest` covers Max HP, Max Surges and defense formatting (value and dash) in Stats, plus equipment proficiency grouping in About (empty categories, id fallbacks, class-profile precedence for ambiguous values, shields with armor, chosen-option titles). `FolioScrollbarTest` checks overflow visibility, proportional start/middle/end positions, minimum thumb length, small viewports and overscroll clamping. `CharacterDateTest` covers European calendar dates, offsets, fractional seconds, leap days and invalid input. Shared `CharacterIdentityTest` covers legacy JSON compatibility, personal-detail round trips and strict field types.

The Android unit suite also checks theme advancement previews, including level grouping, linked content, optional modifications and which inspected entries can draft a choice.

When UI testing is authorized, `ANDROID_SERIAL=<test-device> bash ./gradlew :android:connectedDebugAndroidTest` runs the native overview route test and adapter instrumentation tests. `SmokeScreenTest` covers accessible portrait/personal-detail controls, simplified About contents, cancel/save/reopen and swipes between About, Stats, Progression and Validation (the Stats-tab updates to this test have not been run). These UI tests have not been rerun for the latest layout revision, at the user’s request. The system document picker and physical-device visual acceptance remain manual checks.

The shared `RulesEngineTest` also checks Overview ability defaults and skill modifiers from known abilities, proficiencies, and skill bonuses with an open choice. `SharedClassTest`, `SharedContentAcceptanceTest` and `ProductionContentPackagesTest` cover class defense formulas, tier bonuses and equipped armor and shields. Run these with `:shared:jvmTest` and `:shared:jsNodeTest`.

Android Progression non-UI checks (from `src/character-builder/`):

```sh
JAVA_HOME=$(/usr/libexec/java_home -v 21) bash ./gradlew :shared:jvmTest :android:testDebugUnitTest :android:assembleDebug
```

`ProgressionTest` covers printed schedule milestones and the direct-point allocation/tradeoff. `BuilderSessionTest` covers independent origin persistence, stale-skill clearing, engine-backed drafts, stable occurrences, atomic batch rejection and explicitly incomplete later-level decisions. UI/instrumentation tests are deliberately not run for this handoff. Device launch is a separate manual acceptance step.

### Modern 4e ancestry authoring (#36)

Also included in the root `npm test` suite via `scripts/test/modern4e-ancestries.test.mjs`.

```sh
python3 src/modern4e/scripts/ancestry_content.py
python3 -m unittest discover -s src/modern4e/scripts -p test_ancestry_content.py
npm run typst:compile
```

Covers all 13 ancestry page consumers, catalog/reference integrity, invalid data and choices, local rules and scaling, and actual Typst renderer output (requires Typst). See [ancestry authoring](../src/modern4e/content/ancestries/README.md). Manually inspect ancestry cards, columns and feat-page breaks after rendering changes; Revenant remains catalogued but excluded from the current book.

Ancestry file schema v2 uses the shared ordered-power validator for all 15 powers.
Zeitgeist themes also use ordered powers and are included in `npm test`:

```sh
python3 src/modern4e/scripts/theme_content.py
python3 -m unittest discover -s src/modern4e/scripts -p test_theme_content.py
python3 -m unittest discover -s src/modern4e/scripts -p test_power_content.py
```

Theme tests cover all nine page consumers, 27 level benefits, five modification
options, 11 powers, grant integrity, invalid references/blocks, extended actions,
usage scaling, explicit unknown range and literal Typst rendering. Set `TYPST_BIN`
when Typst is outside PATH; renderer tests otherwise skip. Inspect theme cards,
illustrations and columns in `src/modern4e/inDev.pdf` after compiling. See
[theme authoring](../src/modern4e/content/themes/README.md).

Zeitgeist paragon paths use the same ordered powers and are covered by:

```sh
python3 src/modern4e/scripts/path_content.py
python3 -m unittest discover -s src/modern4e/scripts -p test_path_content.py
```

Path tests cover the nine paths, 32 features, 27 supplementary rule blocks and
26 powers, the page consumers that render each exactly once, grant level and
ownership integrity, typographic apostrophes, explicit source gaps, invalid
references/levels/blocks, deterministic export and literal Typst rendering
(requires Typst; set `TYPST_BIN` when it is outside PATH). Inspect the nine path
pages in `src/modern4e/inDev.pdf` after compiling. See
[path authoring](../src/modern4e/content/paths/README.md).

Android Progression presentation helpers: `ProgressionTest` covers remaining allocation points (fixed main, unassigned abilities, tradeoffs and overspending) and compact skill source labels. It also verifies Level 1 power tiles preserve slot order and that non-power choices and later levels stay in regular rows. It checks which missing or invalid choices receive attention styling, including optional and future slots. Stepper regression coverage verifies single-negative/single-3 limits, the required -1 before raising to 3, removing the tradeoff in order, fixed main ability and min/max bounds. Run `.\gradlew.bat :android:testDebugUnitTest` from `src/character-builder/`.
### Modern 4e creation and advancement authoring

```sh
python -X utf8 src/modern4e/scripts/creation_content.py
python -X utf8 -m unittest discover -s src/modern4e/scripts -p test_creation_content.py -v
node --test scripts/test/modern4e-creation.test.mjs
npm run typst:compile
```

Also runs through root `npm test`. Covers all seven source creation steps and all
30 progression rows, gain/replacement totals, initial class-choice agreement,
provisional higher levels, paired allocation tradeoffs, malformed authoring,
duplicate JSON keys and deterministic export/source protection. Actual Typst
renderer tests require `typst` on PATH or `TYPST_BIN`; inspect the creation table,
class reference panels and technique introduction after rendering changes. See
[authoring contract](../src/modern4e/content/creation/README.md).

Armor advancement and structured prerequisites (#29) run on both shared targets:

```powershell
cd src/character-builder
.\gradlew.bat :shared:jvmTest :shared:jsNodeTest
```

`ArmorAdvancementTest` covers each starting category, independent grants, repeated
selections, the Plate cap, absent starting proficiency, sourced facts and historical
acquisition. `StructuredPrerequisiteTest` covers structured ancestry size, explicit
class-specific multiclass selection, leveled encounter-power queries, missing facts,
self-benefit exclusion and closed query validation. The production content suites
verify the same authored conditions and armor progression compile into runtime data.

The same content command covers retired Feral Companion/Eladrin/Half-elf-dependent
options and the reviewed ten-language catalog:

```powershell
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_*.py'
```

`ModernFeatsTest` checks absence from definitions and printed sections, absence of
remaining ancestry/unresolved prerequisites, exact language identities/scripts/source,
and rejection of malformed catalogs. `FeatRuntimeTest` checks catalog propagation
and accurate unsupported coverage. Shared `ProductionContentPackagesTest` checks
retired saved selections stay unresolved and portable without substitutions on JVM/JS.

Structured feat/ancestry choices and Alchemist grant substitution (#29):

```powershell
python -X utf8 src/character-builder/content/build.py
python -X utf8 src/character-builder/content/samples.py
python -X utf8 src/character-builder/content/build.py --check
python -X utf8 src/character-builder/content/samples.py --check
python -X utf8 -m unittest discover -s src/character-builder/content -p 'test_*.py'
cd src/character-builder
$env:GRADLE_USER_HOME='C:\Users\Imre\.gradle'
.\gradlew.bat :shared:jvmTest :shared:jsNodeTest :shared:jsBrowserProductionLibraryDistribution
.\gradlew.bat :android:testDebugUnitTest :android:assembleDebug :android:assembleDebugAndroidTest
npm test --prefix web
npm run build --prefix web
npm run test:browser --prefix web
```

`ValueChoicesTest` covers scoped language/damage/proficiency/qualification facts,
distinctness, exhaustion/fallback, independent damage grants, historical facts,
self-benefit protection, portable round trips and retained invalid/orphan choices.
`GrantSubstitutionTest` covers default/explicit alternatives, stable grant identity,
save/reopen, removed/changed sources/options, missing suppliers and occurrence limits.
Python tests verify authoritative option identities, compiled ancestry/feat facts,
exact Alchemist grant sources and replacement-reference validation. Android
`BuilderSessionTest` exercises durable structured edits, rejected duplicates and
reopen. Chromium exercises the compiled web editing bridge and IndexedDB
save/reload for both value choices and the Alchemist substitution. The web app
remains a scaffold; these checks cover its supported editing API, not a full
browser builder screen. Android build/unit checks require a configured SDK;
device instrumentation execution and physical-device visual acceptance are separate.

`SmokeScreenTest.structuredLanguageSheetSavesAndReopensItsDecision` opens the native
Linguist language sheet, selects a catalog language, saves and reloads the character,
and checks both the displayed decision and granted fact. The overview smoke test
uses the current Progression screen and waits for durable saves to finish before
interacting with enabled controls. Run with `:android:connectedDebugAndroidTest`
on an explicitly selected test emulator/device.

### Builder calculation and Save regressions

From `src/character-builder/`, run `.\gradlew.bat :shared:jvmTest :shared:jsNodeTest :android:testDebugUnitTest :shared:jsBrowserProductionLibraryDistribution`, then `npm test --prefix web`, `npm run build --prefix web` and `npm run test:browser --prefix web`.

`ChoiceEvaluationTest` covers direct selection work counts, targeted/full eligibility,
filtering, fresh reads between commands and atomic sequential batches.
`SelectionTimeFactsTest` covers historical exclusions, repeated occurrences and
equivalent snapshot reuse; `RulesContentPreparationTest` and `ContentCatalogTest`
cover deferred dependencies, complete active queries, candidate isolation, supplier
protection, chunk indexing and freshness. Android `BuilderSessionTest` verifies
Save publishes calculated state only after storage succeeds without more content reads.
Manual device checklist: open a feat/power choice, save it, reopen and check choices
and totals; cancel a changed draft and verify the saved character is unchanged.

### Android Levels grants and equipment

From `src/character-builder`, run `bash ./gradlew :android:testDebugUnitTest :shared:jvmTest`. The Android tests cover automatic grant placement and presentation roles, required Theme, ancestry previews and language placement, derived About languages, Equipment placement in Stats and category sections, saved equipment and proficiency, and defense recalculation on equip, replace, clear and reopen. The shared JVM suite covers rules, portable document behavior, and the compiled Fighter and Skyseer presentation roles. To verify the authoring validation and build propagation, run `python3 -m unittest discover -s src/character-builder/content -p 'test_*.py'` from the repository root.

### Progressive feat listing

Use the same shared JVM/JS, Android unit and web commands above.
`BuilderOptionListingTest` verifies metadata-first loading without chunk reads,
selected-tab isolation, ancestry scoping before definition reads, partial checks, cached reopen, content/document freshness
and a real production first-batch timing sample (informational, without flaky time
limits). `PreparedFeatChoicesTest` checks shared-fact reuse and parity with normal
activation, including historical prerequisites and dependent-benefit exclusion.
`BuilderSessionTest` covers progressive callbacks, cancellation/resume, stale-result
suppression, cache invalidation and blocking read failures. Android
`ProgressionOptionsTest` verifies pending/unavailable rows cannot be selected;
`FolioScrollbarTest` covers fractional lazy-list scrolling. Content tests verify
authored feat groups and legacy metadata compatibility without fingerprint changes.

Manual device check: open each feat tab, scroll while checks complete, switch tabs
mid-load, cancel/reopen, and edit the character before reopening. Names should appear
before eligibility completes; pending rows stay disabled and saved selections persist.

### Android power choice reader

From `src/character-builder/`, run `.\gradlew.bat :android:testDebugUnitTest` for the Android unit suite. Device UI/instrumentation execution remains opt-in.

`PowerBlockTest` checks labeled rule order, Lightning Strider’s three attack stages, repeated attack labels, Malicious Shadow’s granted at-will power, and legacy descriptions. It also checks that rules excerpts show the authored activation and level scaling. `AdvancementDetailTest` verifies the bundled Dragonfear card includes its Target, Attack, and Hit rows. `PowerReaderOptionsTest` covers explicit selection of revealed ineligible entries, replacement target requirements, and Heroic, Paragon, and Epic feat badges.

Manual device check: open an attack or utility power choice and confirm the compact list sits above a separately scrollable reading pane, with no Power Choice heading, level subtitle or available-power count. Tap two eligible powers and verify the latest tap becomes the draft. Save commits that power, and Cancel preserves the saved choice. Opening the pane, changing the search, or revealing ineligible powers leaves the draft alone. Tap a revealed ineligible power, save it, and verify that Validation reports the failed requirements. For a replacement, choose the replacement target before tapping a power. Reopen to verify the saved selection. Check the Classic Block’s usage header and labeled rows, then scroll through Lightning Strider’s primary, secondary, and tertiary attacks. Check utility usage colors, ineligible options, inline feat expansion, and the ancestry split reader.

The same Android suite checks class feature reader routing, full Spell Source text, granted power cards from production choices, shortened introductions and feat prerequisite text. The shared suite checks that feature previews resolve nested grants, including when another grant is missing.

### Android character library, About and Stats

From `src/character-builder`, run `bash ./gradlew :android:testDebugUnitTest :shared:jvmTest :shared:jsNodeTest`.
The Android unit suite covers the saved library summary, the default Levels
destination and Back confirmation, About size and trimmed detail saves, the
read-only skill list data, Max Surges display, and main ability changes across
save and reopen. `ProgressionTest` covers switching the main ability after
a complete tradeoff that leaves every non-main score below 3.

Manual device check: open the library through Select Character and check the
compact name, level, ancestry and class rows, timestamp placement, and adjacent
New and Import actions. Open a character and check Levels, the cog menu and
both outcomes of the native Back prompt. Slide the full-height cog drawer
closed and check that the Levels badge clears the label. In About, check ancestry size, field
focus, Notes, and the read-only Skills list. In Stats, check Max HP, Max Surges
and Equipment. On a Cleric or Warlock, change the main ability in Ability
Points, save, and reopen the character.
