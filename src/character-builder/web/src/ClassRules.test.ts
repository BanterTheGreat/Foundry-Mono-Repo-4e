import { describe, expect, it } from "vitest";
import { WebContentCatalog } from "@modern4e/shared";
import chunkJson from "../../shared/fixtures/shared-fighter-chunk.json?raw";
import characterJson from "../../shared/fixtures/shared-fighter-character.json?raw";

describe("compiled shared class engine boundary", () => {
  it("returns Fighter formulas, contributors, nested powers and conditional coverage", async () => {
    const chunk = JSON.parse(chunkJson);
    const manifest = {
      formatVersion: 2, id: "modern4e.classes", revision: "1", title: "Classes",
      indexes: ["index"], chunks: ["entries"],
    };
    const catalog = new WebContentCatalog(async (operation) => {
      const value = operation === "listPackages" ? [manifest] : operation === "loadIndex" ? {
        entries: chunk.entries.map((entry: { id: string; category: string; presentation: { title: string } }) => ({
          id: entry.id, category: entry.category, title: entry.presentation.title, chunkId: "entries",
        })),
      } : chunk;
      return JSON.stringify({ type: "available", value });
    });
    expect(JSON.parse(await catalog.open("modern4e.classes", "[]")).type).toBe("available");
    const result = JSON.parse(await catalog.evaluate(characterJson));
    expect(result.type).toBe("available");
    const hp = result.value.statistics.find((stat: { target: { statistic: string } }) => stat.target.statistic === "HIT_POINTS");
    expect(hp.calculation.value.type).toBe("available");
    expect(hp.calculation.value.value.total).toBe(29);
    expect(hp.calculation.value.value.contributors.reduce((sum: number, term: { value: number }) => sum + term.value, 0)).toBe(29);
    expect(result.value.entries.filter((entry: { granted: boolean; definition: { entry: { category: string } } }) =>
      entry.granted && entry.definition.entry.category === "POWER")).toHaveLength(3);
    expect(result.value.selectionSets).toHaveLength(2);
    expect(result.value.equipmentProficiencies.SCALE).toEqual([
      { sourceInstanceId: "creation", choiceId: "class", ordinal: 0 },
    ]);
    expect(result.value.selectionSets.every((set: { remaining: number }) => set.remaining === 0)).toBe(true);
    expect(result.value.conditionalModifiers[0].benefit.condition).toBe("ONE_HANDED_WEAPON");
    // The fixture's content is fully supported now, so no coverage notice is expected; coverage stays reported per occurrence.
    expect(result.value.coverage.fighter.status).toBe("SUPPORTED");
    // The class-only Fighter has not chosen its other root slots; web evaluation reports them like Android.
    const missing = result.value.diagnostics.filter((diagnostic: { code: string }) => diagnostic.code === "engine.missingRootChoice");
    expect(missing.map((diagnostic: { slot: { choiceId: string } }) => diagnostic.slot.choiceId)).toEqual(["ancestry", "theme", "feat"]);
    expect(missing.map((diagnostic: { message: string }) => diagnostic.message)).toEqual([
      "Select an entry for this starting or advancement slot.", "Choose a Theme.", "Select an entry for this starting or advancement slot.",
    ]);
    expect(missing.every((diagnostic: { kind: string }) => diagnostic.kind === "INVALID_SELECTION")).toBe(true);
    // Root offers are reported only through diagnostics; the choices JSON keeps its inline offers and fields.
    expect(result.value.choices.some((choice: { slot: { sourceInstanceId: string; choiceId: string } }) => choice.slot.sourceInstanceId === "creation"
      && ["class", "ancestry", "theme", "feat"].includes(choice.slot.choiceId))).toBe(false);
    expect(result.value.choices.every((choice: object) => !("category" in choice) && !("required" in choice)
      && !("listing" in choice) && !("filled" in choice))).toBe(true);
    expect(JSON.parse(await catalog.evaluate('{"formatVersion":99}')).type).toBe("unavailable");
  });
});
