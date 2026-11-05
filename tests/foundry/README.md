# Real Foundry integration tests

The Opportunity attack cases in `banter-4e-modifications.trigger-prompts` cover native
Shift versus Walk movement, repeated movement after Ignore, refresh on the next turn,
and one claimed opportunity attack across an actor's choices. Node tests additionally
cover simultaneous offers/claims, persisted enemy history, stale turn tickets,
initiative reordering, the optional once-per-turn override, and mixed Walk/Shift paths.

The **BANTER: Trigger restrictions and shared limits** Quench batch
(`banter-4e-modifications.trigger-limits`) covers native bloodying damage attribution;
non-minion, melee and adjacency restrictions; ally defeats; one allowance across bloodied
and defeat assignments; duplicate claims; Ignore; first occurrence per encounter;
persisted state with a replacement handler; the same feat in a new combat; stale turn
prompts; Short Rest versus the real Extended Rest; and saving the configuration in the
real feat dialog. Its browser wrapper checks document counts and unhandled errors.

```sh
npx playwright test --config tests/foundry/playwright.config.mjs trigger-prompts.spec.mjs --grep "trigger restrictions"
```

The **BANTER: Defeat triggers and feat prompts** Quench batch
(`banter-4e-modifications.defeat-triggers`) exercises real HP updates and native damage application:
recorded killer attribution (including group receipts, negative HP and off-turn kills), manual HP edits,
positive-to-zero crossings, friendly/distant casualties, healing, repeated damage below zero,
and diagonal adjacency to a large token. Real feat sheets expose Triggers and save both assignments;
clicking a prompted feat in the floating alert posts its native chat card once without calling Item.roll or changing its item data.
The dedicated browser wrapper also checks world document counts and browser errors.

```sh
npx playwright test --config tests/foundry/playwright.config.mjs trigger-prompts.spec.mjs --grep "defeat triggers"
```

Before live runs, inspect existing combats, connected users, running tests, open workflows and
leftover fixtures. Ask the user to end active/started combat or clear other observed interference,
then re-probe before creating test documents.

`trigger-alerts.spec.mjs` exercises compact floating prompts with real Foundry messages and assigned powers, without switching scenes or starting combat. It checks that synchronization records stay hidden in chat, plus the cause, native DnD4e power rules on hover/focus, direct claimed use, Ignore/deletion, used-state synchronization, recipient privacy, expiry and a draining animation aligned to an already-running deadline. Fixtures are marked and cleaned up; actor/message counts must match afterwards.

The development-only `foundry-test-harness` module loads each module's
`test-foundry/register.js`. Production entry points do not load these tests.
Quench runs assertions inside Foundry; Playwright drives a separate Chromium
client and collects its JSON report. Existing Node suites remain independent.

## First setup

1. Run `npm install` and `npx playwright install chromium`.
2. Copy `config.example.json` to `config.local.json`, and set the exact test-world
   ID and browser URL. Environment variables `FOUNDRY_URL` and `FOUNDRY_WORLD_ID`
   override the file. IDs are different from world titles.
3. Run `npm run test:foundry:deploy`. Enable **Quench**, **SocketLib**,
   **Banters 4e Modifications**, **Dnd4e Info Displays**, and
   **Foundry 4e Integration Tests (Development Only)** in your test world.
   A newly copied module may require restarting Foundry to appear in module management.
4. In Configure Settings, find the harness's **Test world ID**, enter the world's
   exact ID (for example `4e-test-realm`), save, and reload.
5. For a passwordless test GM, set `userName` in local configuration (or
   `FOUNDRY_USER`) and the runner joins automatically. For a password-protected
   GM, run `npm run test:foundry:login` and log into the Chromium window.
   The command saves a local browser session and closes Chromium. Passwords are
   entered directly into Foundry, never placed in repository configuration.
6. Log out other GM sessions, then run `npm run test:foundry`.

Active Defense also requires a viewed scene and a passwordless non-GM user named
`Player` (override with local `playerName` or `FOUNDRY_PLAYER`). Leave that user
logged out before running. Playwright logs the player into a separate browser
context and grants ownership only of newly created fixture PCs. It does not
change existing users or their assigned characters.

The harness currently targets Foundry 14 and DnD4e 0.9.3. Quench 0.10.0's
manifest verifies Foundry 13; the initial eight integration checks have been
exercised on Foundry 14.367. Its results window must render before API execution,
which the harness handles. A ready server and loaded test world are required;
the runner does not launch or control the Electron application.

## Running and reports

- `npm run test:foundry` runs headless Chromium. It passes GPU flags (`--enable-gpu`, `--ignore-gpu-blocklist`, `--use-angle=d3d11`, set in
  `playwright.config.mjs`), because headless Chromium otherwise draws Foundry's canvas on the CPU and the full run takes about
  three times as long (roughly 2.5 minutes with a GPU, 7 without). Without a GPU Chromium falls back to software
  rendering; the 600 second scenario timeout leaves room for that.
- `npm run test:foundry -- --headed` shows Chromium during the run.
- `npm run test:foundry:report` opens the Playwright HTML report.
- `npm run test:foundry:deploy` refreshes the three deployed modules before a run.
- In the Foundry console, `await game.modules.get("foundry-test-harness").api.run()`
  runs the same batches without Playwright. They are also available in Quench's UI.

Reports, failure screenshots, browser errors, and failure traces are under
`output/foundry-test-results/` and `output/foundry-test-report/`.
Authentication state, local configuration, and reports are gitignored. Reports
and traces may contain world data; review them before sharing.

## Fixtures and adding tests

Keep module tests in `src/<module>/test-foundry/register.js`, exporting
`registerTests(quench, helpers)` and returning registered batch keys. Add the
module ID to the harness's explicit `suiteModules` list. Keep browser workflows
spanning modules in `tests/foundry/scenarios/`.

The harness requires exact world opt-in and the active GM before creating
fixtures. Each test tracks and deletes only its own documents in `afterEach`;
cleanup failure fails the run. Fixtures have a name prefix and a
`flags.foundry-test-harness.runId` marker for manual recovery after a browser
crash. Existing actors, scenes, combat, and settings are not reset. Fixture actors and scenes
are created inside a top-level **INTEGRATION TESTS** folder (one per document type,
made on first use through `getTestFolderId(type)` and kept between runs; only the
fixture documents are deleted). Use `createActor` or pass `folder: await
getTestFolderId("Actor" | "Scene")` when creating a new top-level fixture. Run serially;
never run the Quench UI and browser suites simultaneously or use this world for
play during tests. Node/VM tests do not establish real runtime compatibility.

The HP/schema fixtures opt out of Drac's automatic bloodied/dead effects using
its per-actor `flags.dracsTools.autoBloodied.ignore` flag. That module launches
detached status writes from HP hooks, which otherwise race fixture deletion.
These tests cover native HP changes and display behavior; they do not cover
Drac's status automation. No world-wide automation setting is changed.

Current coverage checks runtime prerequisites, Banter's init-time skill schema
changes, native damage versus the health preview, negative HP limits, and real
hover-template rendering.

The `dnd4e-health-display.actor-hud` Quench batch clicks the production PC/NPC
Actor HUD controls in a temporary scene. Coverage includes the four PC power
groups, Feats/Skills/Items/Extras, NPC Sheet power grouping and trait disclosures,
case-insensitive search and empty results, equipment/resource persistence,
Escape/outside dismissal, actor switching, native sheet/dialog opening, skill
rolls, power refresh/chat and Target Automation handoff. It restores the HUD
visibility setting and uses the targeting fixture's scene/document cleanup.
It runs with `integration.spec.mjs`, or can be selected in Quench as
**INFO DISPLAYS: Actor HUD tabs and controls**. This GM batch does not cover
player-only End Turn or submit every native healing/rest dialog option.

Active Defense Quench tests exercise the registered attack and chat hooks with
real actors, scene tokens, powers, rolls, and messages. They check PC interception
in a mixed PC/NPC attack, reversed dice selection and per-target DCs, natural
1/20 overrides, the success threshold, duplicate responses, serialized dialog
claims, removed targets, and GM adjustments without rerolling. Boundary tests
supply deterministic structured results to the GM handler.

The separate browser scenario logs in both GM and player, triggers interception,
clicks the actual player's defense dialog, and verifies the SocketLib update,
serialized defense roll, pending review, unchanged HP, and no duplicate dialog
after player reload. Fixture setup starts at `dnd4e.rollAttack`; native NPC attack
dialogs, canvas targeting, damage confirmation, and status-effect application
remain outside this coverage.

DnD4e 0.9.3's ready hook calls `applyCustomStatusToCompendium` on non-GM clients,
causing a compendium-configuration permission error. The browser scenario records
all errors, but permits this exact error and stack only on player startup/reload.
Other errors, including this error during defense processing, fail the scenario.

## Compact combat tracker coverage

The `dnd4e-health-display.compact-tracker` Quench batch (**INFO DISPLAYS: Compact combat tracker**, 46 tests) drives
Foundry's real CombatTracker with a real Combat, combatants, actors and tokens built on the Target Automation sandbox
scene plus a second player character. It turns the **Compact combat tracker** setting on for the run and restores it,
the sidebar tab, targets and the viewed scene afterwards, then deletes only its own documents.

Coverage: the setting (world scope, off by default, stock tracker untouched while off, applied and removed
immediately, also in the pop-out); one-line rows (no portraits, role / name / HP / eye on one line, aligned names,
real computed styles); role icons and their colours; HP text in green, yellow, orange and red, probed on both sides of
every 75 / 50 / 25 percent boundary, with live refresh; team stripes; Hide Token; the Ledger, Momentum and Battle
Briefing buttons coexisting; the Battle Briefing title (present, absent, added later, HTML-escaped); the round and turn
subtitle; the first-player and next-player lines including the wrap into the next round; editable initiative before
combat and the Roll Initiative button for someone who joins unrolled; dragging (midpoint initiative, the acting
combatant staying acting with no turn change announced, tied combatants split exactly where dropped, repeated tiny gaps,
releasing over the header or footer, edge auto-scroll, surviving a re-render mid-drag, foreign drags ignored, a no-op
drop); the turn timer (counting, per-turn restart, yellow at 1:00 and orange at 2:00, freezing for a real Target
Automation session and for Dice So Nice, Target Automation taking precedence, ignoring someone else's session); and
the player view (no timer, grips, drags or initiative editing; HP only where observable).

Notes for maintainers: Foundry switches the sidebar to Chat when combat starts, which collapses every row to zero size,
so the fixture re-shows the Combat tab before anything is measured or aimed. Drags are synthetic `DragEvent`s with a real
`DataTransfer`. The timer's minutes are reached by briefly offsetting `Date.now`. The player view stubs
`game.user.isGM` for one render, after a settle delay, because Aura Effects' `deleteCombat` hook keeps running
asynchronously and crashes while `game.users.activeGM` is null; each test's last act is to clear targets and let two
animation frames pass so scene-elevation-region's `targetToken` callback never runs against deleted tokens. Not covered
here: the player-to-GM socket relay of Target Automation (covered by the Node suite), real Dice So Nice animations (the
test fires its public hooks), and a physical mouse drag.

## Target Automation coverage

`combat-challenge.spec.mjs` checks the actor's **Class Features → Combat Challenge** checkbox (off by default, saved on the actor), a real native multi-target missed attack, hostile/neutral marks and friendly exclusion, marker attribution, native expiry at the end of the fighter's next turn, off-turn refresh, automation confirmation/removal/duplicate-update boundaries, disabling the option, and SocketLib marking from a player client. It restores document counts and the viewed scene. The automation and player cases seed native-shaped messages; the first tracer uses the real attack dialog and roll. All test creatures are temporary PCs to avoid Player Defense interception. The test world must be idle before setup.

Verified in the test world. Setting `COMBAT_CHALLENGE_FAULT=friendly` injects a browser-only response fault that removes the friendly exclusion; the native-attack exclusion assertion fails under that fault. The unmodified scenario and expanded trigger batch pass. The multi-target tracer also caught a missing combat start on a later mark; production now supplies the validated combat explicitly through Foundry's native effect-start API.

```sh
npx playwright test --config tests/foundry/playwright.config.mjs combat-challenge.spec.mjs
```

The Target Automation batch builds a temporary square-grid scene with friendly,
hostile, neutral, large, elevated, and slowed creatures, plus a companion origin.
It restores the prior scene, controlled tokens, targets, and automation setting
and deletes its own actors, tokens, cards, summons, and Regions after the run.

The integration matrix covers native formula and weapon resolution, touch/reach,
normal/long range, five area shapes, invalid ranges/areas/counts, exact/up-to
counts, conditions, adjacency, footprint distances, elevation warnings, inherited
and custom origins, live movement and range refresh, manual area exclusions,
wall geometry/occupancy/range/height, cancellation, use consumption, Region holes,
and exactly-once summoning.

`target-automation.spec.mjs` drives real native attack forms and the production
targeting panel. It covers cancellation, stale battlefield rejection, hit, miss,
half-on-miss, separate miss damage, mixed outcomes, critical hits/failures,
removing reviewed targets, shared/individual damage modifiers, confirmation,
completion, repeated GM HP-application requests, target portrait focusing/highlighting,
and switching Regular/Basic, Charge, and Opportunity Attack modes through native
attack and damage rolls. Dice use Foundry's
configurable RNG while these scenarios run, then restore it during cleanup.

DnD4e 0.9.3 enumerates the attack form's own properties as if they are all input
elements. The driver removes Playwright's `__playwright_target__` marker from
that form immediately before submission; no production form field or system
callback is changed. Cards/rolls created by sandbox actors are marked for cleanup
and use `notify: false` to avoid deleting a popup notification during its animation.

Run only these browser cases with
`npm run test:foundry -- target-automation.spec.mjs`; the integration matrix runs
with `npm run test:foundry -- integration.spec.mjs`. The suite is substantial and
still does not claim every combination: player wall/vision permissions, all
effect-module combinations, and network/server failure injection remain outside
the live coverage. Existing Node tests cover additional controlled failure paths.

The `dnd4e-health-display.damage-confirmation` Quench batch seeds evaluated attack
and damage messages at the damage-review boundary, then clicks the production
Apply Damage action. Real document hooks and native HP/temp-HP changes verify
NPC-to-PC chat confirmation without HP changes, zero-damage misses, duplicate-click protection,
and the retained PC-to-NPC approval dialog. It does not exercise the preceding
native attack/defense dice animations. It runs with `integration.spec.mjs`.

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

## Expanded trigger coverage

`banter-4e-modifications.expanded-triggers` (**BANTER: Expanded triggers and Target Automation**) exercises opportunity-hit positives and exclusions; confirmation and duplicate updates; full-roster mark exclusions; range entry; successful saves and allied failed saves; ranged AC/Reflex filters; shared filters on existing triggers; companion-owner routing with no companion combatant; typed temporary-HP damage; and saving filters/companion selections in the real Triggers dialog. Messages seeded at the automation review boundary use real native roll serialization and document updates.

The browser case `confirmed native Target Automation delivers combat trigger prompts and typed damage` in `target-automation.spec.mjs` exercises the complete production Opportunity Attack workflow from both the caster and a companion origin, including the native form, deferred prompts, confirmation, companion/mark routing, typed damage application and bloodied transitions. All native/automation attack-result definitions additionally share a Node parity matrix. Neither test claims that an interrupt pauses the underlying native attack; targeted prompts observe the system's attack hook.

The expanded Quench batch has also been checked with three isolated browser-response faults: inverted opportunity mode, disabled successful-save completion, and disabled companion routing. Four corresponding tests fail under those faults; fixture counts are unchanged. The faults affect only that browser's served responses and never change the deployed module files.

The `automatic-benefit.spec.mjs` scenario covers the explicit mandatory checkbox, immediate public announcement with native DnD4e feat-card markup and rules, six-second recipient alert without Use/Ignore, persistent chat after expiry/local dismissal, shared daily allowance consumption, duplicate suppression, and optional prompt privacy. It enters at `createPromptCard` and does not exercise combat detection. Run only in the designated test world after preflight; this scenario has not yet been run against Foundry (the campaign world was active during implementation).

The expanded-trigger Quench batch also checks You hit an enemy from native attack hooks and Critical hit only against ordinary, missed, pending, and confirmed critical automation results.
