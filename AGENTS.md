# Foundry VTT Modules and Modern 4e - Mono Repo

This repo holds independent Foundry VTT modules and the Modern 4e Typst rulebook under `src/`. The Foundry modules target the DnD4e system's [`0.9.3` source](https://github.com/EndlesNights/dnd4eBeta/tree/0.9.3); do not assume current upstream APIs or behavior apply without checking this tag.

## Layout

- `src/<module-name>/` — one Foundry module per folder, each with its own `module.json` manifest. Module folder names match their `module.json` `id`.
- `src/modern4e/` - the Typst rulebook, assets, and offline D&D 4e compendium. Load the [modern4e skill](.agents/skills/modern4e/SKILL.md) before reading or editing the rulebook or adapting published mechanics to its local rules. It must NEVER be copied to Foundry.
- Dungeondraft maps and the Crosshead asset packs (outside this repo, in `Documents\Dungeondraft Assets`): load the [dungeondraft skill](.agents/skills/dungeondraft/SKILL.md) before reading or writing a `.dungeondraft_map`, searching pack textures, or building an encounter battlemap.
- `.agents/skills/` — shared reference skills (DnD4e Active Effect keys, aura effects, effect macros) and one per-module skill (`<module-name>`) carrying that module's specific layout/architecture/style notes. Load the matching module skill before working inside `src/<module-name>/`.
- `Makefile` / `package.json` — copy built modules into the local Foundry `Data/modules` folder for manual testing; see "Deploying to Foundry" below.

## Working conventions (all modules)

- Use ES modules, Foundry hooks, and the DnD4e system API. Preserve the module's stated minimum-version compatibility (see its `module.json`) unless intentionally upgrading it.
- Use braced, multiline `if` blocks. Document methods with JSDoc, using multiline JSDoc blocks whenever practical.
- Prefer Foundry APIs (`foundry.utils`, document flags, embedded documents) and keep asynchronous document changes awaited.
- Match the existing simple JavaScript style per module: direct Foundry globals, small focused helpers, pragmatic comments, and short guard clauses.
- We don't need to make Markdown research documents.
- Changelog entries are release summaries, not per-change notes. Since the previous version, record new features and changed behavior in concise bullets/prose suitable for future regression review.
- Track project TODOs as appropriately labeled GitHub Issues rather than local TODO files.
- When adding, changing, removing, or disabling a feature, update [FEATURES.md](FEATURES.md) in the same change. Keep the inventory and any affected manual checklist entries aligned with implemented behavior, including optional settings and experimental or incomplete status.
- Every new feature must include a corresponding automated test covering its observable behavior and relevant edge cases. Add or extend the affected module's suite, run it, and resolve failures before handoff. If a behavior requires Foundry integration, use the designated test-world workflow below. Keep user-facing test commands current in [tests/README.md](tests/README.md).
- Changes that affect initial hooks or a module's manifest should be tested by reloading Foundry and checking the browser console. Where a module has an automated test suite (check its folder for `package.json`/`test/`), run it and resolve failures before handoff.
- The user operates the Foundry Electron application; do not automate or control Electron. Browser automation and Quench tests are allowed in an explicitly designated test world. For integration-test setup, execution, or new suites, read [tests/foundry/README.md](tests/foundry/README.md). Use manual reload/report checks for campaign worlds.
- Copy modules after changes intended to run in Foundry, using `npm run copy-module -- <module-name>` so the local install stays in sync for the user's next reload (see "Deploying to Foundry" below). Standalone throwaway prototypes are excluded from this step.

## Deploying to Foundry

`npm run copy-modules` (or `make copy-modules`) copies only folders in `src/` with a `module.json` manifest (always excluding `modern4e`, even if explicitly requested) into your local Foundry `Data/modules` directory, resolved from `%LOCALAPPDATA%\FoundryVTT\Data\modules` (override with the `FOUNDRY_DATA_PATH` environment variable). Re-run it after making changes, then reload Foundry.

To copy just one (or a few) modules instead of all of them, pass the module folder name(s): `npm run copy-module -- <module-name>` (or `make copy-module MODULE=<module-name>`).

## Project-specific context

Each project has its own skill under `.agents/skills/<project-name>/SKILL.md` with its layout, architecture, and any module-specific conventions (e.g. the HUD visual style guide for `dnd4e-health-display`, naming conventions for `banter-4e-modifications`). Load the relevant one before working in that project.

## Modern 4e development and shared references

Use `make typst-compile` / `npm run typst:compile` to build `src/modern4e/inDev.pdf`,
`make typst-watch` / `npm run typst:watch` for continuous builds, and
`make typst-fonts` / `npm run typst:fonts` to inspect available fonts.
`make typst-clean` / `npm run typst:clean` removes only that development PDF.
These commands require Typst on PATH (or `TYPST_BIN` pointing to its executable);
extra CLI options can be passed via `TYPST_ARGS` in Make or after `--` with npm.
Rulebook development is independent of Foundry deployment.

For published D&D 4e lookups, entry IDs, and `iws.mx/dnd` links, use the shared
[4e-compendium skill](.agents/skills/4e-compendium/SKILL.md) and its offline data
in `src/modern4e/content/compendium/`. Published mechanics and local rulebook
adaptations are distinct; the rulebook guidance governs adaptations.
For monster selection or recommendations, use the
[dnd4e-monster-search skill](.agents/skills/dnd4e-monster-search/SKILL.md): prefer
Monster Manual 3 / Monster Vault and recalculate other sources with the saved
user-supplied monster-math table.
For encounter design, use the
[Encounter Creation skill](.agents/skills/encounter-creation/SKILL.md) to build and
validate a roster, report tactics, and offer approved Foundry insertion with an
enemy-only Battle Briefing Journal.
The imported rulebook TODO and issue notes are historical reference; track new
work in GitHub Issues under the repository convention above.

For ZEITGEIST adventure path or setting lookups, use the
[zeitgeist skill](.agents/skills/zeitgeist/SKILL.md) for the local book location
and book-selection workflow.
