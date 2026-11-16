import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getSmokeFixture } from "@modern4e/shared";
import { App } from "./App";

describe("compiled shared boundary", () => {
  it("returns plain data with the common fixture values", () => {
    const fixture = getSmokeFixture();
    expect(Object.getPrototypeOf(fixture)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(fixture))).toEqual({
      fixtureId: "shared-core-v1", message: "Shared core is ready.",
    });
  });
  it("does not share mutable JS results between callers", () => {
    const first = getSmokeFixture();
    Object.assign(first, { message: "changed" });
    expect(getSmokeFixture().message).toBe("Shared core is ready.");
  });
  it("renders the shared result in the web shell", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Shared core is ready.");
    expect(html).toContain("shared-core-v1");
  });
});
