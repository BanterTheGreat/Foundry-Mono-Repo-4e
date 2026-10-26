import { calculateCover } from "./cover-geometry.js";

const LABELS = { clear: "Clear", cover: "Cover −2", superior: "Superior cover −5", blocked: "Blocked" };

/** Targeting-session cover geometry shared by the preview and native attack dialog. */
export class CoverPreview {
  static #overlay = null;
  static #targeting = null;
  static #hovered = null;
  static #frame = null;
  static #shiftHeld = false;

  /**
   * Update the local targeting context; null hides cover immediately.
   * @param {{source: Token, targets: Token[], mode: string}|null} targeting
   */
  static setContext(targeting) {
    CoverPreview.#targeting = targeting;
    // Preserve the overlay until the next frame replaces it to avoid flicker.
    if (!targeting) {
      CoverPreview.clear();
    }
    CoverPreview.scheduleRefresh();
  }

  /** Install canvas/input listeners when targeting automation initializes. */
  static register() {
    Hooks.on("hoverToken", (token, hovered) => {
      if (hovered) {
        CoverPreview.#hovered = token;
      } else if (CoverPreview.#hovered === token) {
        CoverPreview.#hovered = null;
      }
      if (CoverPreview.#targeting) {
        CoverPreview.scheduleRefresh();
      }
    });
    for (const eventName of ["keydown", "keyup"]) {
      window.addEventListener(eventName, event => {
        if (event.key === "Shift") {
          CoverPreview.#setShiftHeld(event.shiftKey);
        }
      }, true);
    }
    // Losing focus can swallow keyup; never leave rays stuck on the canvas.
    window.addEventListener("blur", () => CoverPreview.#setShiftHeld(false));
    for (const hook of [
      "canvasReady", "controlToken", "updateToken", "createToken", "deleteToken",
      "refreshToken", "createWall", "updateWall", "deleteWall", "sightRefresh", "canvasPan",
    ]) {
      Hooks.on(hook, () => CoverPreview.scheduleRefresh());
    }
    Hooks.on("targetToken", user => {
      if (user.id === game.user.id) {
        CoverPreview.scheduleRefresh();
      }
    });
    Hooks.on("canvasTearDown", () => {
      if (CoverPreview.#frame !== null) {
        cancelAnimationFrame(CoverPreview.#frame);
        CoverPreview.#frame = null;
      }
      CoverPreview.#targeting = null;
      CoverPreview.#hovered = null;
      CoverPreview.clear();
    });
  }

  /** Refresh rays only when the modifier state actually changes. */
  static #setShiftHeld(held) {
    if (CoverPreview.#shiftHeld !== held) {
      CoverPreview.#shiftHeld = held;
      CoverPreview.scheduleRefresh();
    }
  }

  /** Coalesce movement, vision, and targeting updates into one canvas frame. */
  static scheduleRefresh() {
    if (CoverPreview.#frame !== null) {
      return;
    }
    CoverPreview.#frame = requestAnimationFrame(() => {
      CoverPreview.#frame = null;
      CoverPreview.refresh();
    });
  }

  /** Remove labels/rays when selection, visibility, or scene changes. */
  static clear() {
    if (CoverPreview.#overlay && !CoverPreview.#overlay.destroyed) {
      CoverPreview.#overlay.parent?.removeChild(CoverPreview.#overlay);
      CoverPreview.#overlay.destroy({ children: true });
    }
    CoverPreview.#overlay = null;
  }

  /** Read rendered coordinates so the preview also follows animated movement. */
  static #rectangle(token) {
    return { x: token.x, y: token.y, width: token.w, height: token.h };
  }

  /** Cover geometry cannot infer vertical cover or partial-square footprints. */
  static #unsupportedReason(attacker, target, size) {
    if (canvas.scene.grid.type !== CONST.GRID_TYPES.SQUARE) {
      return "Cover: square grid only";
    }
    if (attacker.document.elevation !== target.document.elevation) {
      return "Cover: elevation unsupported";
    }
    if ([attacker, target].some(token => [token.w, token.h].some(length => length < size || Math.abs(length / size - Math.round(length / size)) > 0.000001))) {
      return "Cover: footprint unsupported";
    }
    return null;
  }

  /** Recalculate supported cover from the same battlefield geometry used by the preview. */
  static evaluate(attacker, target, mode) {
    if (!canvas.ready || !["melee", "ranged"].includes(mode) || !target?.visible
      || CoverPreview.#unsupportedReason(attacker, target, canvas.dimensions.size)) {
      return null;
    }
    const size = canvas.dimensions.size;
    // Movement-blocking walls represent physical obstacles, including invisible walls.
    // Open doors do not block. Terrain height, wall direction, and special cover are out of scope.
    const wallDocuments = canvas.walls.placeables
      .map(wall => wall.document)
      .filter(wall => wall.move !== CONST.WALL_MOVEMENT_TYPES.NONE && wall.ds !== CONST.WALL_DOOR_STATES.OPEN);
    const walls = wallDocuments.map(wall => wall.c);
    const disposition = attacker.document.disposition;
    const creatures = canvas.tokens.placeables.filter(token => token !== attacker && token !== target
      && token.visible && token.actor && token.document.elevation === attacker.document.elevation
      && Math.abs(disposition) === 1 && token.document.disposition === -disposition)
      .map(token => CoverPreview.#rectangle(token));
    const geometry = { attacker: CoverPreview.#rectangle(attacker), target: CoverPreview.#rectangle(target), gridSize: size, walls };
    const melee = calculateCover(geometry);
    const ranged = calculateCover({ ...geometry, creatures });
    return mode === "melee" ? melee : ranged;
  }

  /** Recalculate only for the active targeting dialog and its resolved attack mode. */
  static refresh() {
    CoverPreview.clear();
    if (!canvas.ready) {
      return;
    }
    const targeting = CoverPreview.#targeting;
    if (!targeting || !["melee", "ranged"].includes(targeting.mode) || !(targeting.caster ?? targeting.source)?.isOwner
      || canvas.tokens.get(targeting.source.id) !== targeting.source) {
      return;
    }
    const attacker = targeting.source;
    const candidates = new Set(targeting.targets);
    const hovered = CoverPreview.#hovered;
    // Match the opposing-disposition definition used by creature cover blockers.
    if (hovered?.actor && Math.abs(attacker.document.disposition) === 1
      && hovered.document.disposition === -attacker.document.disposition) {
      candidates.add(hovered);
    }
    const targets = [...candidates].filter(token => token !== attacker && token.visible && canvas.tokens.get(token.id) === token);
    if (!targets.length) {
      return;
    }
    const overlay = new PIXI.Container();
    overlay.eventMode = "none";
    canvas.interface.addChild(overlay);
    CoverPreview.#overlay = overlay;
    const size = canvas.dimensions.size;
    for (const target of targets) {
      const unsupported = CoverPreview.#unsupportedReason(attacker, target, size);
      if (unsupported) {
        CoverPreview.#drawLabel(overlay, target, unsupported);
        continue;
      }
      const result = CoverPreview.evaluate(attacker, target, targeting.mode);
      const label = LABELS[result.kind];
      if (CoverPreview.#shiftHeld && result.kind !== "clear") {
        for (const ray of result.rays) {
          CoverPreview.#drawRay(overlay, ray, size);
        }
      }
      CoverPreview.#drawLabel(overlay, target, label);
    }
  }

  /** Red rays are obstructed; green rays are clear from the chosen best corner. */
  static #drawRay(overlay, ray, size) {
    const graphics = new PIXI.Graphics();
    graphics.lineStyle(Math.max(1, size / 60), ray.blocked ? 0xef6666 : 0x74dba3, 0.7);
    graphics.moveTo(ray.start.x, ray.start.y);
    graphics.lineTo(ray.end.x, ray.end.y);
    overlay.addChild(graphics);
  }

  /** Keep labels at 16 screen pixels, anchored above the target at any camera zoom. */
  static #drawLabel(overlay, target, text) {
    const screenScale = 1 / canvas.stage.scale.x;
    const Text = foundry.canvas.containers.PreciseText;
    const label = new Text(text, {
      fontFamily: "sans-serif", fontSize: 16,
      fill: 0xffffff, align: "center", stroke: 0x15191f, strokeThickness: 3,
    });
    label.scale.set(screenScale);
    label.anchor.set(0.5, 0);
    label.position.set(target.x + target.w / 2, target.y - label.height - 8 * screenScale);
    const background = new PIXI.Graphics();
    background.beginFill(0x15191f, 0.9);
    background.drawRoundedRect(label.x - label.width / 2 - 5 * screenScale, label.y - 3 * screenScale,
      label.width + 10 * screenScale, label.height + 6 * screenScale, 4 * screenScale);
    background.endFill();
    overlay.addChild(background, label);
  }
}
