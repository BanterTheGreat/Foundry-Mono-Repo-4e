# Real Foundry integration tests

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

- `npm run test:foundry` runs headless Chromium.
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
crash. Existing actors, scenes, combat, and settings are not reset. Run serially;
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

## Target Automation coverage

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
