import { describe, expect, it } from "vitest";
import { decodeCharacterJson, encodeCharacterJson } from "@modern4e/shared";
import characterJson from "../../shared/fixtures/character.json?raw";

describe("compiled character codec boundary", () => {
  it("exchanges the shared golden without changing decisions or timestamps", () => {
    const imported = JSON.parse(decodeCharacterJson(characterJson));
    expect(imported.type).toBe("available");
    expect(imported.value).toEqual(JSON.parse(characterJson));
    const exported = JSON.parse(encodeCharacterJson(JSON.stringify(imported.value)));
    expect(exported.type).toBe("available");
    expect(JSON.parse(exported.value)).toEqual(imported.value);
  });

  it("returns serializable diagnostics for incompatible imports and exports", () => {
    for (const operation of [decodeCharacterJson, encodeCharacterJson]) {
      for (const input of ["{", '{"formatVersion":2}', '{"formatVersion":"1"}']) {
        const result = JSON.parse(operation(input));
        expect(result.type).toBe("unavailable");
        expect(result.value).toBeUndefined();
        expect(result.diagnostics[0].kind).toBe("INCOMPATIBLE_FORMAT");
        expect(result.diagnostics[0].message.length).toBeGreaterThan(0);
      }
    }
  });

  it("reports field paths instead of coercing a quoted numeric value", () => {
    const input = JSON.parse(characterJson);
    input.abilities.points.STRENGTH = "4";
    const result = JSON.parse(decodeCharacterJson(JSON.stringify(input)));
    expect(result.type).toBe("unavailable");
    expect(result.diagnostics.some((diagnostic: { message: string }) =>
      diagnostic.message.includes("$.abilities.points.STRENGTH"))).toBe(true);
  });
});
