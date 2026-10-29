import { validateChangeSummary } from "./confirmation-data.js";

export const ELEVATION_BEHAVIOR_TYPE = "scene-elevation-region.elevation";
export const ELEVATION_BEHAVIOR_SCHEMA = {
  slope: "boolean", slopeHeight: "number", slopeDirection: "integer",
  overhead: "boolean", underOverheadMode: "string", shadowStrength: "number",
  modifyTokenElevation: "boolean", modifyTokenScaling: "boolean"
};

/** Reject unknown document fields and bound all caller-provided geometry. */
function only(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))) {
    throw new Error("Unsupported elevation region fields.");
  }
}

/** Scene coordinates are absolute pixels, including padding. */
function number(value, positive = false) {
  if (!Number.isFinite(value) || Math.abs(value) > 1000000 || (positive && value <= 0)) {
    throw new Error("Geometry and elevation must be finite numbers within 1000000; dimensions must be positive.");
  }
}

/** Validate the same bounded declaration in the companion and browser. */
export function validateElevationRegions(args) {
  only(args, ["uuid", "requestId", "summary", "regions"]);
  if (typeof args.uuid !== "string" || !/^Scene\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid)
    || typeof args.requestId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(args.requestId)) {
    throw new Error("A world Scene UUID and requestId (8-128 characters) are required.");
  }
  validateChangeSummary(args.summary);
  if (!Array.isArray(args.regions) || args.regions.length < 1 || args.regions.length > 100) {
    throw new Error("Supply 1-100 elevation regions.");
  }
  for (const region of args.regions) {
    only(region, ["name", "color", "shapes", "elevation", "behavior"]);
    if (typeof region.name !== "string" || !region.name.trim() || region.name.length > 200
      || (region.color !== undefined && !/^#[a-fA-F0-9]{6}$/.test(region.color))) {
      throw new Error("Regions need a name (1-200 characters) and optional #RRGGBB color.");
    }
    number(region.elevation);
    if (!Array.isArray(region.shapes) || !region.shapes.length || region.shapes.length > 100) {
      throw new Error("Supply 1-100 shapes per region.");
    }
    let solid = false;
    for (const shape of region.shapes) {
      const keys = { rectangle: ["x", "y", "width", "height", "rotation"],
        ellipse: ["x", "y", "radiusX", "radiusY", "rotation"], polygon: ["points"] }[shape?.type];
      if (!keys) {
        throw new Error("Use rectangle, ellipse or polygon shapes.");
      }
      only(shape, ["type", "hole", ...keys]);
      if (shape.hole !== undefined && typeof shape.hole !== "boolean") {
        throw new Error("hole must be boolean.");
      }
      solid ||= !shape.hole;
      if (shape.type === "polygon") {
        if (!Array.isArray(shape.points) || shape.points.length < 6 || shape.points.length > 2000 || shape.points.length % 2) {
          throw new Error("Polygon points must contain 3-1000 x/y pairs.");
        }
        shape.points.forEach(value => number(value));
        const points = shape.points;
        let area = 0;
        for (let i = 0; i < points.length; i += 2) {
          const next = (i + 2) % points.length;
          area += points[i] * points[next + 1] - points[next] * points[i + 1];
        }
        if (Math.abs(area) < 0.000001) {
          throw new Error("Polygon must have nonzero area.");
        }
      } else {
        for (const key of keys.filter(key => key !== "rotation")) {
          number(shape[key], !["x", "y"].includes(key));
        }
        if (shape.rotation !== undefined) {
          number(shape.rotation);
        }
      }
    }
    if (!solid) {
      throw new Error("A region needs at least one non-hole shape.");
    }
    const behavior = region.behavior ?? {};
    only(behavior, Object.keys(ELEVATION_BEHAVIOR_SCHEMA));
    for (const [key, value] of Object.entries(behavior)) {
      const type = ELEVATION_BEHAVIOR_SCHEMA[key];
      if (typeof value !== (type === "integer" ? "number" : type)) {
        throw new Error(`Invalid elevation behavior ${key}.`);
      }
      if (typeof value === "number") {
        number(value);
      }
    }
    if ((behavior.slopeDirection !== undefined && (!Number.isInteger(behavior.slopeDirection) || behavior.slopeDirection < 0 || behavior.slopeDirection > 359))
      || (behavior.shadowStrength !== undefined && (behavior.shadowStrength < 0 || behavior.shadowStrength > 5))
      || (behavior.underOverheadMode !== undefined && !["fade", "hide", "keep"].includes(behavior.underOverheadMode))
      || (behavior.slope !== true && behavior.slopeHeight)) {
      throw new Error("Invalid slope, overhead mode or shadow strength.");
    }
  }
  return args;
}
