# Zeitgeist theme authoring

`zeitgeist.json` owns the nine local themes, 27 level benefits, five Gunsmith
modification options and 11 powers. Entries share stable identity, description,
access, prerequisites, selection and explicit unsupported runtime coverage.
The existing Modern4e adaptations are preserved; no published rules are newly
imported here. `glossary/zeitgeist_themes.typ` retains page/column breaks and
illustrations, using `helpers/theme_content.typ` to render this data safely.

Themes carry role/concept, literal flavor sections and explicit feature/power
`grants` with `atLevel`. Gunsmith's `modifications` lists feature options, not
automatic grants; the level-5/10 benefit text defines their selection and use.
This catalog does not yet automate prestige, item modifications, companion
actions or later feature effects. Campaign selection remains in the existing
configuration. JSON is authoring data, not a Character Builder runtime package.

Powers use the [ordered power contract](../../../../docs/modern4e-power-authoring.md),
including scoped attack outcomes, range/bindings and ordered literal blocks.
Skyseer Vision uses `EXTENDED`; non-augmenting theme powers may retain the
`PSIONIC` source keyword. Power-point augments and full disciplines remain
unsupported. Hands of Retribution records encounter/round limits and scaling;
its missing burst radius remains `RULES_TEXT`, requiring a GM ruling.

Validation rejects unknown fields, duplicate IDs, orphan entries, wrong-category
grants/options, invalid levels and malformed ordered powers. Prose supports only
safe bold/emphasis/list formatting and is never evaluated as Typst code.

```sh
python3 src/modern4e/scripts/theme_content.py
python3 -m unittest discover -s src/modern4e/scripts -p test_theme_content.py
npm run typst:compile
```
