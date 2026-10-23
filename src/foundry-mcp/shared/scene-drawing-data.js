import { validateChangeSummary } from "./confirmation-data.js";

export const RECTANGLE_SCHEMA = {
  x: "number", y: "number", width: "number", height: "number", hidden: "boolean",
  text: "string", fontSize: "number", textColor: "string",
  strokeColor: "string", strokeWidth: "number", strokeAlpha: "number",
  fillColor: "string", fillAlpha: "number"
};

/**
 * Validate a bounded, declarative rectangle batch in the companion and GM browser.
 * Coordinates are scene pixels, including scene padding; dimensions are positive.
 */
export function validateSceneDrawings(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)
    || Object.keys(args).some(key => !["uuid", "requestId", "summary", "drawings"].includes(key))) {
    throw new Error("Expected a scene rectangle request with no extra fields.");
  }
  if (!/^Scene\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")
    || typeof args.uuid !== "string" || typeof args.requestId !== "string"
    || !/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId)) {
    throw new Error("A world Scene UUID and unique requestId (8-128 characters) are required.");
  }
  validateChangeSummary(args.summary);
  if (!Array.isArray(args.drawings) || args.drawings.length < 1 || args.drawings.length > 100) {
    throw new Error("Supply between 1 and 100 rectangles.");
  }
  for (const drawing of args.drawings) {
    if (!drawing || typeof drawing !== "object" || Array.isArray(drawing)
      || Object.keys(drawing).some(key => !Object.hasOwn(RECTANGLE_SCHEMA, key))) {
      throw new Error("Only rectangle geometry, text, visibility and style fields are supported.");
    }
    for (const key of ["x", "y", "width", "height"]) {
      if (!Number.isFinite(drawing[key]) || Math.abs(drawing[key]) > 1000000
        || (["width", "height"].includes(key) && drawing[key] <= 0)) {
        throw new Error("Rectangle coordinates must be finite scene pixels; width/height must be positive (maximum 1000000).");
      }
    }
    for (const [key, value] of Object.entries(drawing)) {
      if (typeof value !== RECTANGLE_SCHEMA[key] || (typeof value === "number" && !Number.isFinite(value))) {
        throw new Error(`Invalid rectangle ${key}.`);
      }
      if (key.endsWith("Color") && !/^#[a-fA-F0-9]{6}$/.test(value)) {
        throw new Error("Drawing colors must be #RRGGBB.");
      }
      if (key.endsWith("Alpha") && (value < 0 || value > 1)) {
        throw new Error("Drawing opacity must be between 0 and 1.");
      }
    }
    if ((drawing.text?.length ?? 0) > 2000
      || (drawing.fontSize !== undefined && (drawing.fontSize < 1 || drawing.fontSize > 512))
      || (drawing.strokeWidth !== undefined && (drawing.strokeWidth < 0 || drawing.strokeWidth > 100))) {
      throw new Error("Text is limited to 2000 characters, fontSize to 1-512 and strokeWidth to 0-100.");
    }
  }
  return args;
}
