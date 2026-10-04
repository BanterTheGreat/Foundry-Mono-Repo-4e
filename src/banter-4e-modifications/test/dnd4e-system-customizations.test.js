import test from "node:test";
import assert from "node:assert/strict";
import { Dnd4eSystemCustomizations } from "../scripts/modules/dnd4e-system-customizations/dnd4e-system-customizations.js";

test("Dnd4e customizations replace legacy skills and preserve system conditions", () => {
  globalThis.CONFIG = {
    DND4E: {
      skills: { hea: {}, rel: {}, his: {}, stw: {}, dun: {}, ath: { label: "Athletics" } },
    },
    statusEffects: [{ id: "cover" }, { id: "prone" }, { id: "flying" }],
  };

  Dnd4eSystemCustomizations.replaceSkills();

  assert.deepEqual(CONFIG.statusEffects.map(effect => effect.id), ["cover", "prone", "flying"]);
  assert.deepEqual(CONFIG.DND4E.skills.cra, { label: "Crafting", ability: "int", armourCheck: false });
  assert.deepEqual(CONFIG.DND4E.skills.soc, { label: "Society", ability: "int", armourCheck: false });
  assert.deepEqual(CONFIG.DND4E.skills.banter_rel, { label: "Religion", ability: "wis", armourCheck: false });
  assert.deepEqual(CONFIG.DND4E.skills.banter_hea, { label: "Medicine", ability: "int", armourCheck: false });
  assert.deepEqual(Object.keys(CONFIG.DND4E.skills).sort(), ["ath", "banter_hea", "banter_rel", "cra", "soc"]);
});
