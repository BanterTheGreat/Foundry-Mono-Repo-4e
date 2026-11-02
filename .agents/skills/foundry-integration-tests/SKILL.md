---
name: foundry-integration-tests
description: Live Foundry testing in this repo - Quench batches, Playwright scenarios, the foundry-test-harness, test-world fixtures and cleanup, and the workflow for building and debugging them. Use when writing, running, or debugging anything under test-foundry/ or tests/foundry/, or when a feature needs proof in the real Foundry runtime.
---

# Foundry integration tests

Live tests run real Foundry 14 and DnD4e 0.9.3 in the designated test world (4e Test Realm). Node suites (`npm test` inside a module) fake Foundry and prove logic. Live tests prove the seams: hooks, documents, permissions, sockets, rendered DOM.

The machinery (files, commands, config, adding a suite) is in [reference.md](reference.md). Verified Foundry and DnD4e facts and pitfalls are in [gotchas.md](gotchas.md); read it before writing a fixture.

## Pick the layer

- **Node test**: pure logic, adapters against hand-made fakes. Start here for fast feedback; establish the real input contract with a live tracer before expanding the mocked matrix.
- **Quench batch** (`src/<module>/test-foundry/`): one GM client, real documents and hooks. Default for "does this work in Foundry".
- **Playwright scenario** (`tests/foundry/scenarios/`): needs a second client (the `Player` user), real clicks, a closed GM, or a reload. It costs several times a Quench batch; use it only for what one client cannot show.

## Workflow

1. **Probe the world** (read-only, `page.evaluate`). Inspect connected users, active and viewed scene, grid size, existing combats (including `started` and `active`), running test batches, open targeting/roll workflows, relevant settings and module state, and leftover `[Integration test ...]` documents. If an existing combat is active or started, ask the user to end it before running tests. For any other observed interference (such as another test run, a competing GM session, an in-progress targeting/roll workflow, or stale fixtures), name what you found and ask the user to clear it. Wait for their response and re-probe before creating fixtures or starting tests; do not end their combat, close their workflows, disconnect users, or change settings to clear the blocker yourself. Continue independent code and test-writing work while waiting. Done when the preflight is clear and you can state the observed world state.
2. **Test the riskiest assumption** with a ten-line probe before writing a suite around it (can a player client read NPC actors? does the hook fire with the shape you coded against?). Check Foundry and DnD4e APIs in the installed source (paths in reference.md), not from memory. Done when the assumption is observed true or false in the real runtime.
3. **Run a tracer early**: one fixture and one production path, including native roll, review/confirmation and resulting mutation when those boundaries matter. Seeded messages prove only the boundary they enter. Establish the actual event fields, actor/origin identity and commitment point before widening. Done when the tracer is green and restores the world.
4. **Widen** with a positive and a negative case per behaviour. Test how native and automated inputs become events and observable results; comparing identical normalized events alone leaves the adapters untested. Pair every "does not happen" test with a positive control in the same setup. Wait on facts (`waitForFact`), including persisted confirmation before damage application; `settle()` only to assert absence.
5. **Go red**: inject specific faults and confirm each fails a test whose name matches it. Prefer browser-scoped response overrides for faults that can be isolated there, leaving other clients' deployed files intact. If modifying deployed files, restore by redeploying and compare deployable files using the copy script's exclusions. Finish with the affected tests green on unmodified responses. A suite that has never been red is unproven.
6. **Verify clean from the first tracer**: capture world counts and existing message IDs before fixture setup. Compare counts after teardown (actors, items, scenes, combats, messages, tokens), restore the previous scene, and check for stray unhandled rejections. Account for messages emitted during actor/item creation as well as during the test; use run markers or the exclusive test account's recorded run boundary to identify cleanup targets.
7. **Document**: `tests/foundry/README.md` coverage notes, `tests/README.md` commands, and `FEATURES.md` checklist.

## Discipline

- **Two strikes**: after the second failed hypothesis for one failure, measure (CPU profile through CDP, timestamped trace, minimal repro) or report the blocker to the user. Another guess is the wrong move.
- **Scope**: finish what was asked, report it, then offer the larger version. Ask first before building a scenario costlier than the request implied.
- **Pace**: send the user a short status when 20-30 minutes pass without a finished deliverable.
- **Shared world**: the user's Gamemaster session may be connected. Ask before activating a scene, starting combats, or deleting anything unflagged while another GM is connected.
- **Fast loop**: run the affected case or batch after a small fix. Run broader regressions once the implementation stabilizes; repeat them when a later change affects their behavior. Reuse existing fixture and login helpers; browser startup and scene construction often cost more than the assertions.
- **Token budget**: discover tool names before loading their full schemas, read targeted source sections, and extract failing test names/errors from the structured report. Prefer one reusable trace over separate ad hoc browser probes. Diagnostic details are in [reference.md](reference.md#diagnostics-worth-keeping).
- **Edits**: use the Edit tool or write files. Backslashes passed through `node -e` or `sed` get halved and corrupt regexes and `\n`.
- **Fixtures**: flag fixture documents with the run ID and delete those flagged documents. Handle module-generated chat through the recorded run boundary above. Attach a module trace on failure so a failure explains itself.
