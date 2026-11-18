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
    expect(result.value.diagnostics.some((diagnostic: { code: string }) => diagnostic.code === "engine.coverage")).toBe(true);
    expect(JSON.parse(await catalog.evaluate('{"formatVersion":99}')).type).toBe("unavailable");
  });
});
