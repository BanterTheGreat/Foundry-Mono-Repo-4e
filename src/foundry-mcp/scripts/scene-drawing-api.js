import { MODULE_ID } from "../shared/protocol.js";
import { validateSceneDrawings } from "../shared/scene-drawing-data.js";
import { assertEnabledGM } from "./read-api.js";
import { confirmNpcEdit } from "./edit-api.js";
import { canonical } from "./creation-utils.js";

const pending = new WeakSet();

/**
 * Add native rectangles to one world scene after active-GM review.
 * Persist per-drawing retry markers with creation, including partial batches.
 */
export async function addSceneDrawings(args, {
  game = globalThis.game, assertConnection = () => {}, confirm = confirmNpcEdit,
  crypto = globalThis.crypto
} = {}) {
  assertEnabledGM(game);
  validateSceneDrawings(args);
  args = JSON.parse(JSON.stringify(args));
  const worldId = game.world.id;
  const userId = game.user.id;
  const scene = game.scenes.get(args.uuid.slice(6));
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || !scene || scene.pack || scene.parent || scene.uuid !== args.uuid || game.scenes.get(scene.id) !== scene) {
      throw new Error("Drawing creation requires a world Scene and the paired active GM.");
    }
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another scene drawing request is in progress.");
  }
  pending.add(game);
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical({
      uuid: args.uuid, drawings: args.drawings
    }))));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    assertSession();
    const sources = args.drawings.map(drawing => ({
      author: userId, x: drawing.x, y: drawing.y,
      shape: { type: "r", width: drawing.width, height: drawing.height },
      hidden: drawing.hidden ?? false, text: drawing.text ?? "",
      fontSize: drawing.fontSize ?? 48, textColor: drawing.textColor ?? "#FFFFFF", textAlpha: 1,
      strokeColor: drawing.strokeColor ?? "#FFFFFF", strokeWidth: drawing.strokeWidth ?? 4,
      strokeAlpha: drawing.strokeAlpha ?? 1, fillType: 1,
      fillColor: drawing.fillColor ?? "#FFFFFF", fillAlpha: drawing.fillAlpha ?? 0
    }));
    const existing = () => {
      const matches = new Map();
      for (const drawing of scene.drawings.values()) {
        const marker = drawing.getFlag(MODULE_ID, "sceneDrawingRequest");
        if (marker?.id !== args.requestId || marker.userId !== userId) {
          continue;
        }
        if (marker.hash !== hash || !Number.isInteger(marker.index) || !sources[marker.index] || matches.has(marker.index)) {
          throw new Error("Drawing requestId already used with different data or duplicate markers; inspect the scene.");
        }
        matches.set(marker.index, drawing);
      }
      return matches;
    };
    const result = (status, reused) => ({
      status, uuid: scene.uuid, requestId: args.requestId, reused,
      drawings: Array.from(existing(), ([index, drawing]) => ({ index, id: drawing.id, uuid: drawing.uuid }))
    });
    const matches = existing();
    if (matches.size === sources.length) {
      return result("unchanged", true);
    }
    const additions = sources.flatMap((source, index) => matches.has(index) ? [] : [{ ...source,
      flags: { [MODULE_ID]: { sceneDrawingRequest: { id: args.requestId, userId, hash, index } } }
    }]);
    // Geometry/grid changes can invalidate placement even when drawings are unchanged.
    const snapshot = JSON.stringify(scene.toObject(true));
    const approved = await confirm({ name: scene.name, title: "Foundry MCP: Confirm scene drawings",
      summary: args.summary ?? `Add ${additions.length} rectangle drawing(s) to ${scene.name}.`,
      changes: additions.map((source, index) => ({ document: scene.name, path: `New rectangle ${index + 1}`,
        before: null, after: source })) });
    assertSession();
    if (approved !== true) {
      return result("cancelled", false);
    }
    if (JSON.stringify(scene.toObject(true)) !== snapshot) {
      throw new Error("Scene changed while awaiting confirmation; read the scene and request a fresh review.");
    }
    let failed = false;
    try {
      await scene.createEmbeddedDocuments("Drawing", additions);
    } catch {
      failed = true;
    }
    assertSession();
    return result(failed || existing().size !== sources.length ? "incomplete" : "updated", false);
  } finally {
    pending.delete(game);
  }
}
