# Foundry VTT 4e Modules — Mono Repo

This repo holds a set of independent Foundry VTT modules for the DnD4e system, each in its own folder under `src/`. They all target the DnD4e system's [`0.9.3` source](https://github.com/EndlesNights/dnd4eBeta/tree/0.9.3); do not assume current upstream APIs or behavior apply without checking this tag.

## Layout

- `src/<module-name>/` — one Foundry module per folder, each with its own `module.json` manifest. Module folder names match their `module.json` `id`.
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
- Changes that affect initial hooks or a module's manifest should be tested by reloading Foundry and checking the browser console. Where a module has an automated test suite (check its folder for `package.json`/`test/`), run it and resolve failures before handoff.
- The user exclusively operates Foundry; do not launch, inspect, automate, or otherwise attempt to validate Foundry directly — ask the user to reload and report results instead.
- Run `npm run copy-module -- <module-name>` after making changes to a module, so the local Foundry install stays in sync for the user's next reload (see "Deploying to Foundry" below).

## Deploying to Foundry

`npm run copy-modules` (or `make copy-modules`) copies every folder in `src/` into your local Foundry `Data/modules` directory, resolved from `%LOCALAPPDATA%\FoundryVTT\Data\modules` (override with the `FOUNDRY_DATA_PATH` environment variable). Re-run it after making changes, then reload Foundry.

To copy just one (or a few) modules instead of all of them, pass the module folder name(s): `npm run copy-module -- <module-name>` (or `make copy-module MODULE=<module-name>`).

## Module-specific context

Each module has its own skill under `.agents/skills/<module-name>/SKILL.md` with its layout, architecture, and any module-specific conventions (e.g. the HUD visual style guide for `dnd4e-health-display`, naming conventions for `banter-4e-modifications`). Load the relevant one before editing that module.
