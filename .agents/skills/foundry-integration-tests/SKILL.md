---
name: foundry-integration-tests
description: Live Foundry testing in this repo - Quench batches, Playwright scenarios, the foundry-test-harness, test-world fixtures and cleanup, and the workflow for building and debugging them. Use when writing, running, or debugging anything under test-foundry/ or tests/foundry/, or when a feature needs proof in the real Foundry runtime.
---

# Foundry integration tests

Live tests run real Foundry 14 and DnD4e 0.9.3 in the designated test world (4e Test Realm). Node suites (`npm test` inside a module) fake Foundry and prove logic. Live tests prove the seams: hooks, documents, permissions, sockets, rendered DOM.

The machinery (files, commands, config, adding a suite) is in [reference.md](reference.md). Verified Foundry and DnD4e facts and pitfalls are in [gotchas.md](gotchas.md); read it before writing a fixture.

## Pick the layer

- **Node test**: pure logic, adapters against hand-made fakes. Always first; fastest.
- **Quench batch** (`src/<module>/test-foundry/`): one GM client, real documents and hooks. Default for "does this work in Foundry".
- **Playwright scenario** (`tests/foundry/scenarios/`): needs a second client (the `Player` user), real clicks, a closed GM, or a reload. It costs several times a Quench batch; use it only for what one client cannot show.

## Workflow

1. **Probe the world** (read-only, `page.evaluate`). Done when you can state: connected users, active and viewed scene, its grid size, relevant settings and module state, leftover `[Integration test ...]` documents.
2. **Test the riskiest assumption** with a ten-line probe before writing a suite around it (can a player client read NPC actors? does the hook fire with the shape you coded against?). Check Foundry and DnD4e APIs in the installed source (paths in reference.md), not from memory. Done when the assumption is observed true or false in the real runtime.
3. **Run a tracer**: one fixture, one test, run alone until it is green and the world is clean afterwards. Widen only from a green tracer.
4. **Widen** with a positive and a negative case per behaviour. Pair every "does not happen" test with a positive control in the same setup. Wait on facts (`waitForFact`); `settle()` only to assert absence.
5. **Go red**: break the deployed copy in several specific ways, run, and confirm each fault fails a test whose name matches it. Restore by redeploying and confirm the files are identical to source. A suite that has never been red is unproven.
6. **Verify clean**: the spec compares world counts (actors, items, scenes, combats, messages, tokens) before and after and expects them equal; the active scene is restored; no stray unhandled rejections.
7. **Document**: `tests/foundry/README.md` coverage notes, `tests/README.md` commands, and `FEATURES.md` checklist.

## Discipline

- **Two strikes**: after the second failed hypothesis for one failure, measure (CPU profile through CDP, timestamped trace, minimal repro) or report the blocker to the user. Another guess is the wrong move.
- **Scope**: finish what was asked, report it, then offer the larger version. Ask first before building a scenario costlier than the request implied.
- **Pace**: send the user a short status when 20-30 minutes pass without a finished deliverable.
- **Shared world**: the user's Gamemaster session may be connected. Ask before activating a scene, starting combats, or deleting anything unflagged while another GM is connected.
- **Fast loop**: run one spec or batch after a small fix; the full suite takes minutes.
- **Edits**: use the Edit tool or write files. Backslashes passed through `node -e` or `sed` get halved and corrupt regexes and `\n`.
- **Fixtures**: create only documents flagged with the run ID, delete only flagged documents, and attach a module trace on failure so a failure explains itself.
