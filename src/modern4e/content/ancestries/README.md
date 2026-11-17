# Shared ancestry authoring

Ancestry migration: [#36](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/36), part of #29. All 13 local ancestry definitions are authoritative JSON here. Typst's `helpers/ancestry_content.typ` loads only `catalog.json`'s declared files. Individual ancestry pages retain illustrations, layout and separate feat-section rendering.

Each file has `schemaVersion: 1` and `ancestries`, `features`, and `powers` arrays. Entries use the [shared entry base](../../../../docs/modern4e-content-model.md): persistent `id`, `title`, `description`, `access`, `prerequisites`, `selection` and explicit `coverage`. Never regenerate IDs on rename. The current ancestry slice accepts unconditional access/prerequisites and one occurrence per entry. Shared concepts do not imply identical runtime/package envelopes.

- Ancestry `attributes` contain size, speed, vision and languages. Languages record fixed identities and a count of additional player selections, not a fabricated complete language catalog.
- `grants` reference feature/power IDs, with a stable local `id` and `atLevel`. The ancestry grants its traits; a power-granting trait grants the power.
- Feature `choices` have a stable local `id`, `count`, and one `source`: explicit power `entryIds`, `damageTypes`, or `ancestriesExcept`. Dragonborn and Elf grant one selected power, not both. Revenant's Past Life excludes Revenant and qualifies ancestry prerequisites only; it does not grant the chosen ancestry's traits. Source resolution/qualification remains runtime work.
- Powers use usage/action enums, keywords, structured range and optional attack, target and trigger fields. `rows` preserve Effect/Hit/Special text, with `scaling` entries containing `atLevel` and `text`. Optional `attackText` preserves attack-bonus/range scaling prose. The power description is an introductory summary; rows remain authoritative for its card details.
- Text is literal data, never evaluated as Typst. Power row prose supports the existing safe bold/emphasis/paragraph/list renderer.

This migration supplies shared authoring data and printed content, not a Character Builder runtime package or automated ancestry effects. `coverage` remains `UNIMPLEMENTED` explicitly. Existing proof bundles are untouched. Feats remain in their own catalog with ancestry access gates.

Deva's original size `Normal` is preserved with an author note pending a rules correction. Revenant is included in the catalog but remains excluded by `ancestries/root.typ` in the current book. Campaign availability is separate from access.

Validate and test from the repository root:

```sh
python3 src/modern4e/scripts/ancestry_content.py
python3 -m unittest discover -s src/modern4e/scripts -p test_ancestry_content.py
npm run typst:compile
```

The validator checks closed entry fields/vocabulary, unique IDs, catalog completeness, grant/choice references, selection counts and cycles. Tests cover actual Typst rendering (when installed), all ancestry page consumers, local rules, power alternatives and malformed authoring. Review rendered pages after layout changes. Do not deploy this directory to Foundry.
