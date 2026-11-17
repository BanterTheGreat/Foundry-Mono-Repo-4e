# Provisional Fighter proof (#15)

This is an engineering fixture for levels 1–2, not a release-wide class rollout or an approved new Modern 4e rule. `modern4e.fighter-proof` is independent of the earlier pipeline demonstration. `modern4e.fighter-proof.override` replaces the whole `class3` definition and adds **+1 Medicine at level 2 only**. It is architecture-test data.

## Recorded decisions and hand calculations

Torbera is a Dwarf Fighter, raised in an Urban environment (Society) with Labor upbringing (Crafting). The two free proficiencies are Medicine and Religion. Skill Training grants Athletics. No imported class training or racial ability/skill bonuses are applied. Theme is optional and omitted. Descriptive choices include Combat Reactivity; combat features remain unsupported.

Strength 4 is the main ability. Dexterity 2 + Constitution 2 + Intelligence 1 + Wisdom 0 + Charisma 0 spends exactly 5 non-main points, each at most 2. No optional negative tradeoff is taken. No ability increases occur at level 2.

Checks use direct ability points and one +5 proficiency bonus, with no half-level or stock score conversion. Athletics = 4 + 5 = 9; Crafting and Society = 1 + 5 = 6; Religion = 0 + 5 = 5. Medicine = 1 + 5 + 2 Manual Adjustment = **8**. The test override adds 1 at level 2, producing **9**; at level 1 both packages produce 8. Other skills equal their mapped ability points. `sample-coverage.json` records all 16 independently hand-checked skill expectations. Speed 5 is the only automated ancestry statistic.

Level 1 selects Cleave and Tide of Iron (two at-wills), Passing Attack (encounter), Villain's Menace and Brute Strike (two dailies), and Skill Training. Level 2 adds Boundless Endurance (utility) and Power Attack. Power Attack deliberately keeps its unadapted “Str 15” prerequisite and incomplete diagnostics. It is an explicitly incomplete selection, not a validated feat. Longsword, Scale Armor and Heavy Shield are equipped in both samples. Their benefits and penalties remain unavailable automation. The samples are complete recorded level-1/2 decisions for this scoped proof, not fully automated playable character sheets.

## Sources and coverage

The machine-readable [coverage manifest](../shared/fixtures/sample-coverage.json) lists every selected published entry, stable compendium ID, original URL, exact publication attribution and unsupported mechanics. Generated descriptions retain source HTML, including original vanilla terminology; presentation is source material, not the mechanical definition.

- Fighter `class3`: Player's Handbook p.75 / Class Compendium.
- Dwarf `race2`: Player's Handbook p.36 / Heroes of the Fallen Lands p.248.
- Skill Training `feat166`: Player's Handbook p.201 / Heroes of the Fallen Lands p.317 / Heroes of the Forgotten Kingdoms p.318.
- Power Attack `feat261`: Player's Handbook p.199.
- Cleave `power992`, Tide of Iron `power1000`: Player's Handbook p.77 / Class Compendium.
- Passing Attack `power1015`, Villain's Menace `power1429`, Brute Strike `power1524`, Boundless Endurance `power1522`: Player's Handbook p.78 / Class Compendium.
- Longsword `weapon3610`: Player's Handbook p.218 / Heroes of the Fallen Lands p.331 / Heroes of the Forgotten Kingdoms p.334.
- Scale Armor `armor5`, Heavy Shield `armor8`: Player's Handbook p.214 / Heroes of the Fallen Lands p.325.

Active local authority: `modern4e/helpers/classes.typ` imports `helpers/class_reference.typ` (4/5/cap 2 allocation); `glossary/creation_&_advancement.typ` (free skills and power/feat schedule); `glossary/background.typ` (Urban/Labor options); `glossary/skill_checks.typ` and `glossary/balance_changes.typ` (mappings, proficiency and merged skills); `classes/fighter.typ` and `ancestries/dwarf.typ` (local class/ancestry). The stale skill's 6/cap 3 allocation is not used.

Capability gaps: v1 modifiers cannot express the Fighter's ability-dependent health/defense formulas. Combat Challenge, Reactivity, weapon mastery, Dwarf traits/power, power combat effects and equipment conditions remain explicit partial/unimplemented coverage. No fixed sample HP is supplied as a substitute formula. Manual Adjustment does not clear incomplete status. No platform adapters or shared engine changes are included.

## Identical platform assets

`content/samples.py` produces four portable files (base/override × levels 1/2), with actual supplier fingerprints, and the coverage manifest in `shared/fixtures/`. It also copies identical generated packages and samples into `web/public/proof/` and `android/src/main/assets/proof/`. Vite and Android package these standard static asset directories without adapter changes. Runtime sample selection/import UI is owned by the platform tickets. The portable files contain decisions only, with no content descriptions or derived totals.

Regenerate packages with `python3 src/character-builder/content/build.py`, then run `python3 src/character-builder/content/samples.py`. Add `--check` to each command to detect stale bytes. Python tests verify coverage completeness and byte-identical platform bundles. `FighterProofTest` runs these exact assets through the real codec, catalog and engine on JVM/JS, checks all abilities/skills, progression, override isolation, fingerprints, unsupported diagnostics and missing-supplier preservation.

## Validation (2026-11-17, macOS)

From the repository root, `python3 src/character-builder/content/build.py --check`, `python3 src/character-builder/content/samples.py --check` and `python3 -m unittest discover -s src/character-builder/content -p 'test_*.py' -v` passed (16 Python tests). `git diff --check` passed.

From `src/character-builder/`, `bash ./gradlew :shared:jvmTest :shared:jsNodeTest :shared:jsBrowserProductionLibraryDistribution :shared:compileDebugKotlinAndroid :android:assembleDebug -x kotlinStoreYarnLock` passed (69 tests per shared target). The unmodified strict command initially failed at `kotlinStoreYarnLock` because platform dependency resolution wanted to change the committed Yarn lock. Only lock publication was excluded; no lockfile or shared engine code was changed. Existing Gradle configuration-time dependency warnings remain.

`npm ci --prefix web` installed the locked web dependencies, but the default Node 22.9 could not run current Vitest/Vite. With `PATH=/Users/imre/.gradle/nodejs/node-v22.14.0-darwin-arm64/bin:$PATH`, installing the missing Mac optional dependency using `npm install --prefix web --no-save --package-lock=false @rolldown/binding-darwin-arm64@1.2.19` allowed `npm test --prefix web` (7 tests) and `npm run build --prefix web` to pass. No package manifest/lock changes were retained. Existing generated Kotlin source-map warnings remain.

A ZIP inspection of `android/build/outputs/apk/debug/android-debug.apk` and the web `dist/proof/` directory verified all 11 JSON assets match the authored static bundle byte for byte. No UI, adapter, Electron, emulator or Foundry runtime behavior changed; no runtime UI checks or Foundry deployment were performed.
