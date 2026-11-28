import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const book = fileURLToPath(new URL("../../src/modern4e/", import.meta.url));
const typst = process.env.TYPST_BIN || "typst";

test("Modern 4e 2.0 uses the new advancement, armor, and DCs by default", (t) => {
  const probe = spawnSync(typst, ["--version"], { encoding: "utf8" });
  if (!process.env.TYPST_BIN && probe.error?.code === "ENOENT") {
    t.skip("Typst is unavailable. Set TYPST_BIN to run the rulebook checks.");
    return;
  }
  assert.equal(probe.status, 0, probe.error?.message ?? probe.stderr);

  const expression = `{
    import "/helpers/revised_rules.typ" as revised
    import "/helpers/creation_content.typ" as creation
    import "/helpers/equipment.typ" as equipment
    let rows = creation.tableCells().chunks(5)
    (
      standardBackground: query(<standard-background>).len(),
      revisedSkills: query(<revised-skill-list>).len(),
      advancement: (4, 8, 14, 18, 21, 28).map(level => rows.at(level - 1).at(1).text),
      plate: equipment.armorRow(equipment.entries.at("modern4e.armor.plate")),
      hide: equipment.armorRow(equipment.entries.at("modern4e.armor.hide")).at(1),
      skillPoints: revised.skillIncreases,
      extraArmor: revised.extraArmorLevels,
      normalDcs: (1, 3, 4, 11, 21, 30).map(level => revised.normalDcs.at(level - 1)),
    )
  }`;
  const readRules = (flags) => JSON.parse(execFileSync(
    typst, ["eval", "--in", "main.typ", ...flags, expression], { cwd: book, encoding: "utf8" },
  ));

  const standard = readRules(["--input", "rules=standard"]);
  assert.equal(standard.standardBackground, 1);
  assert.equal(standard.revisedSkills, 0);
  assert.equal(standard.plate[1], "+9");

  const revised = readRules([]);
  assert.equal(revised.standardBackground, 0);
  assert.equal(revised.revisedSkills, 1);
  assert.deepEqual(revised.advancement, [
    "—", "+1 to two different abilities", "+1 to two different abilities",
    "—", "+1 to all six abilities", "+1 to two different abilities",
  ]);
  assert.deepEqual(revised.plate.slice(1), ["+7", "-1", "-1"]);
  assert.equal(revised.hide, "+3");
  assert.deepEqual(revised.skillPoints, { 4: 3, 8: 3, 11: 5, 14: 5, 18: 5, 21: 8, 24: 8, 28: 8 });
  assert.deepEqual(revised.extraArmor, [5, 9, 13, 17, 19, 25, 27, 29]);
  assert.deepEqual(revised.normalDcs, [14, 16, 17, 22, 30, 36]);
});
