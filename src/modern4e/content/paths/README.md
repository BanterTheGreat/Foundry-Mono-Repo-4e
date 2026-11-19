# Zeitgeist paragon path authoring

`zeitgeist.json` owns the nine ZEITGEIST paragon paths, their 32 features, 27
supplementary rule blocks (planar zones, Polyhistor stances, posse rules and
similar) and 26 granted powers. The class paths in the neighboring
`barbarian.json`, `fighter.json` and the other class files keep the older
`paths` array shape consumed by `theme.pathBlocksFromJson`; they are not part of
this catalog.

Entries share stable identity, description, access, prerequisites, selection and
explicit unsupported runtime coverage. Each path records its associated theme,
literal flavor, printed prerequisite text, ordered `grants` (feature or power with
`atLevel`) and the supplementary `ruleIds` it owns. Alternative narrative
qualifications are `unresolved` conditions needing GM confirmation. Powers use the
[ordered power contract](../../../../docs/modern4e-power-authoring.md).

`glossary/zeitgeist_paths.typ` keeps page breaks, column breaks and ordering and
renders this data through `helpers/path_content.typ`. Prose supports only safe
bold/emphasis/list formatting and is never evaluated as Typst. Apostrophes are
stored as typographic `’`, matching the printed book.

Known source gaps stay explicit: Hyper Beam does not state the action for each
attack, Beam Shot and Power Fist have no target count, and Aspect of Srasama has no
summoning range. Printed card order places a power's `Special` rule before its
`Attack` line. The builder now compiles these paths into `modern4e.paths`, including their
level-gated grants and supplementary rules. Combat effects remain manual.
Neighboring class-path summaries are selectable in that package with explicit
unimplemented coverage; their feature and power stat blocks have not been adapted.

```sh
python3 src/modern4e/scripts/path_content.py
python3 -m unittest discover -s src/modern4e/scripts -p test_path_content.py
npm run typst:compile
```
