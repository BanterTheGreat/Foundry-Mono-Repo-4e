# Machinery and commands

## Where things are

- `tests/foundry/README.md`: human setup guide and per-suite coverage notes. `tests/README.md`: commands for the user.
- `tests/foundry/`: `playwright.config.mjs`, `config.mjs`, `config.local.json` (gitignored), `login.mjs`, `helpers/session.mjs` (`openTestWorld(page, userName)`), `scenarios/*.spec.mjs`.
- `src/foundry-test-harness/`: dev-only module. `scripts/main.js` registers batches and exposes `game.modules.get("foundry-test-harness").api` (`ready`, `run(keys?)`). `scripts/fixtures.js` has `assertTestWorld`, `getTestFolderId`, `TestDocuments` (`createActor`, `createToken`, `createMessage`, `cleanup`).
- `src/<module>/test-foundry/register.js` exports `registerTests(quench, { assertTestWorld, TestDocuments })` and returns batch keys. Add the module ID to the harness `suiteModules` list.
- Trigger prompts: `src/banter-4e-modifications/test-foundry/trigger-prompt-fixture.js` (`TriggerWorld`: `open({shared})`, `encounter`, `startAttack`/`attack`, `move`, `setHp`, `rollSave`, `prompts`, `sweepMessages`, `cleanupRuns`) and `trigger-prompts.js` (the Quench batch). Specs: `scenarios/trigger-prompts.spec.mjs` (the batch) and `trigger-prompts-players.spec.mjs` (GM plus Player).

## Commands (repo root)

- Deploy changed modules first: `npm run test:foundry:deploy` (copies the harness, banter, health display). The browser loads from the Foundry data folder, not from `src/`.
- One spec: `npx playwright test --config tests/foundry/playwright.config.mjs <spec file>`. Everything: `npm run test:foundry` (over 5 minutes).
- Subset of batches from a page: `await game.modules.get("foundry-test-harness").api.run(["banter-4e-modifications.trigger-prompts"])`.
- Node suite for a module: `npm test --prefix src/banter-4e-modifications`.
- Reports: `output/foundry-test-results/` (JSON, traces, screenshots) and `output/foundry-test-report/`. Do not pass `--reporter=...` on the command line; it drops the JSON reporter. The Quench report is a base64 `body` on the `quench-report` attachment in `playwright.json`.

## Unattended runs

`config.local.json` joins as `Integrated Tests` (passwordless GM) with `Player` as the test player, world `4e-test-realm`, `http://localhost:30000`. The Foundry server must already be running with the world loaded; never drive the Electron app. Join page: click the `Select User` textbox, pick the user, press `Join Game Session`. Poll `game.ready`; reloads take 60-90 s to settle. Keep the config's 180 s default Playwright timeout (a lower `--timeout` fails slow logins), slice runs with `--grep`, and keep each foreground command under 10 minutes. Needs SocketLib, Quench, the harness, and the world's `testWorldId` setting set to the world ID.

## Reading the installed source

- Foundry client: `C:/Program Files/FoundryVTT/Foundry Virtual Tabletop/resources/app/client` (and `.../common`). Hook signatures are in `client/hooks.mjs`, typedefs in `client/documents/_types.mjs`.
- DnD4e system: `%LOCALAPPDATA%/FoundryVTT/Data/systems/dnd4e/module`.

## Diagnostics worth keeping

- Record unhandled rejections per running test (`beforeEach` stores the title; a `window` listener stamps each rejection with it), then fail the spec on any. This attributes a stray error to its test.
- On failure, attach a per-client trace of the module's own events (hook, dispatch, card, create duration) and a heartbeat that logs main-thread stalls.
- For a stall, attach the CDP profiler (`context.newCDPSession(page)`, `Profiler.start`/`stop`) and rank functions by self time.
