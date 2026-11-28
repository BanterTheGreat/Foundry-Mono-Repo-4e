import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const book = fileURLToPath(new URL("../../src/modern4e/", import.meta.url));
const typst = process.env.TYPST_BIN || "typst";

test("Modern 4e 2.0 uses the new advancement, armor, and DCs", (t) => {
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
    import "/helpers/class_content.typ" as classes
    let rows = creation.tableCells().chunks(5)
    (
      revisedSkills: query(<revised-skill-list>).len(),
      advancement: (4, 8, 14, 18, 21, 28).map(level => rows.at(level - 1).at(1).text),
      plate: equipment.armorRow(equipment.entries.at("modern4e.armor.plate")),
      hide: equipment.armorRow(equipment.entries.at("modern4e.armor.hide")).at(1),
      lightArmorCaps: equipment.sectionRows(
        equipment.catalog.sections.find(section => section.id == "light-armor"),
        showAbilityCap: true,
      ).chunks(5).map(row => row.last()),
      skillPoints: revised.skillIncreases,
      extraArmor: revised.extraArmorLevels,
      tableAcIncreases: rows.enumerate()
        .filter(((_, row)) => repr(row.at(2)).contains("+1 AC"))
        .map(((index, _)) => index + 1),
      normalDcs: (1, 3, 4, 11, 21, 30).map(level => revised.normalDcs.at(level - 1)),
      classTraining: ("rogue", "wizard").map(name => {
        let class = classes.entry("modern4e.class." + name)
        repr(classes.classReference(class))
      }),
    )
  }`;
  const revised = JSON.parse(execFileSync(
    typst, ["eval", "--in", "main.typ", expression], { cwd: book, encoding: "utf8" },
  ));
  assert.equal(revised.revisedSkills, 1);
  assert.deepEqual(revised.advancement, [
    "—", "+1 to two different abilities", "+1 to two different abilities",
    "—", "+1 to all six abilities", "+1 to two different abilities",
  ]);
  assert.deepEqual(revised.plate.slice(1), ["+7", "-1", "-1"]);
  assert.equal(revised.hide, "+3");
  assert.deepEqual(revised.lightArmorCaps, ["+3", "+3", "+3"]);
  assert.deepEqual(revised.skillPoints, { 4: 3, 8: 3, 11: 5, 14: 5, 18: 5, 21: 8, 24: 8, 28: 8 });
  assert.deepEqual(revised.extraArmor, [5, 9, 13, 17, 19, 25, 27, 29]);
  assert.deepEqual(revised.tableAcIncreases, revised.extraArmor);
  assert.deepEqual(revised.normalDcs, [14, 16, 17, 22, 30, 36]);
  assert.match(revised.classTraining[0], /strong\(body: \[Skills\]\).*?\[Stealth, Finesse or Deception\]/s);
  assert.match(revised.classTraining[1], /strong\(body: \[Skills\]\).*?\[Arcana\]/s);
});
