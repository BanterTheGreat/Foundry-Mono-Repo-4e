import { MODULE_NAME, ENABLE_DEBUG_LOGGING } from "../../shared/globals.js";
import { Logger } from "../../shared/logger.js";
import { calculateCover } from "./cover-geometry.js";

const SETTING = "enable-cover-preview";
const LABELS = { clear: "Clear", cover: "Cover −2", superior: "Superior cover −5", blocked: "Blocked" };

/** GM-only targeting aid. Never applies attack or defense modifiers. */
export class CoverPreview {
  static #overlay = null;
  static #frame = null;
  static #shiftHeld = false;
  static #lastDiagnostic = null;

  /** Register settings before login data exists; defer user-dependent setup. */
  static register() {
    game.settings.register(MODULE_NAME, SETTING, {
      name: "Enable cover preview (PoC)",
      hint: "GM only: select one attacker and target a token to preview cover above it. Hold Shift to show corner rays. Uses the best corner for both melee and ranged. Square grids and equal elevations only; enemies use opposing token dispositions. Does not modify rolls.",
      scope: "client",
      config: true,
      restricted: true,
      type: Boolean,
      default: false,
      onChange: () => CoverPreview.scheduleRefresh(),
    });
    Hooks.once("ready", () => CoverPreview.#install());
  }

  /** Attach the GM's input and canvas listeners after Foundry loads the user. */
  static #install() {
    if (!game.user.isGM) {
      return;
    }
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
      "refreshToken", "createWall", "updateWall", "deleteWall", "sightRefresh",
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

  /** Remove labels/rays when selection, visibility, settings, or scene changes. */
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

  /** The PoC cannot infer vertical cover or partial-square footprints. */
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

  /** Recalculate locally for visible targets of exactly one controlled attacker. */
  static refresh() {
    CoverPreview.clear();
    if (!game.user?.isGM || !canvas.ready || !game.settings.get(MODULE_NAME, SETTING)) {
      return;
    }
    const controlled = canvas.tokens.controlled;
    if (controlled.length !== 1 || !controlled[0].isOwner) {
      return;
    }
    const attacker = controlled[0];
    const targets = [...game.user.targets].filter(token => token !== attacker && token.visible);
    if (!targets.length) {
      return;
    }
    const overlay = new PIXI.Container();
    overlay.eventMode = "none";
    canvas.interface.addChild(overlay);
    CoverPreview.#overlay = overlay;
    const size = canvas.dimensions.size;
    // Movement-blocking walls represent physical obstacles, including invisible walls.
    // Open doors do not block. Terrain height, wall direction, and special cover are out of scope.
    const wallDocuments = canvas.walls.placeables
      .map(wall => wall.document)
      .filter(wall => wall.move !== CONST.WALL_MOVEMENT_TYPES.NONE && wall.ds !== CONST.WALL_DOOR_STATES.OPEN);
    const walls = wallDocuments.map(wall => wall.c);
    const disposition = attacker.document.disposition;
    for (const target of targets) {
      const unsupported = CoverPreview.#unsupportedReason(attacker, target, size);
      if (unsupported) {
        CoverPreview.#drawLabel(overlay, target, unsupported, size);
        continue;
      }
      const creatures = canvas.tokens.placeables.filter(token => token !== attacker && token !== target
        && token.visible && token.actor && token.document.elevation === attacker.document.elevation
        && Math.abs(disposition) === 1 && token.document.disposition === -disposition)
        .map(token => CoverPreview.#rectangle(token));
      const geometry = { attacker: CoverPreview.#rectangle(attacker), target: CoverPreview.#rectangle(target), gridSize: size, walls };
      const melee = calculateCover(geometry);
      const ranged = calculateCover({ ...geometry, creatures });
      CoverPreview.#logObstructions(attacker, target, { ...geometry, creatures }, wallDocuments, melee, ranged);
      const label = melee.kind === ranged.kind
        ? LABELS[melee.kind]
        : `Melee: ${LABELS[melee.kind]}\nRanged: ${LABELS[ranged.kind]}`;
      // Ranged includes all melee obstacles plus enemy creatures. Show its four
      // best-corner rays only, avoiding contradictory colors where results differ.
      if (CoverPreview.#shiftHeld && ranged.kind !== "clear") {
        for (const ray of ranged.rays) {
          CoverPreview.#drawRay(overlay, ray, size);
        }
      }
      CoverPreview.#drawLabel(overlay, target, label, size);
    }
  }

  /** Log exact blockers once per changed preview while the GM inspects its rays. */
  static #logObstructions(attacker, target, geometry, walls, melee, ranged) {
    if (!CoverPreview.#shiftHeld || !game.settings.settings?.has(`${MODULE_NAME}.${ENABLE_DEBUG_LOGGING}`) || !Logger.isEnabled()) {
      CoverPreview.#lastDiagnostic = null;
      return;
    }
    const describe = result => ({
      kind: result.kind,
      rays: result.rays.map(ray => ({
        start: ray.start, end: ray.end, blocked: ray.blocked,
        walls: ray.blockingWalls.map(index => ({ id: walls[index].id, c: walls[index].c, move: walls[index].move, sight: walls[index].sight, door: walls[index].door, ds: walls[index].ds })),
        creatures: ray.blockingCreatures.map(index => geometry.creatures[index]),
      })),
    });
    const diagnostic = {
      sceneId: canvas.scene.id,
      attacker: { id: attacker.id, name: attacker.name, ...geometry.attacker },
      target: { id: target.id, name: target.name, ...geometry.target },
      gridSize: geometry.gridSize,
      melee: describe(melee), ranged: describe(ranged),
    };
    const signature = JSON.stringify(diagnostic);
    if (signature !== CoverPreview.#lastDiagnostic) {
      Logger.info("[DEBUG-cover] Best-corner obstruction details", diagnostic);
      CoverPreview.#lastDiagnostic = signature;
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

  /** Place a compact, non-interactive label just above the target footprint. */
  static #drawLabel(overlay, target, text, size) {
    const Text = foundry.canvas.containers.PreciseText;
    const label = new Text(text, {
      fontFamily: "sans-serif", fontSize: Math.max(11, Math.min(16, size * 0.16)),
      fill: 0xffffff, align: "center", stroke: 0x15191f, strokeThickness: 3,
    });
    label.anchor.set(0.5, 0);
    label.position.set(target.x + target.w / 2, target.y - label.height - 5);
    const background = new PIXI.Graphics();
    background.beginFill(0x15191f, 0.9);
    background.drawRoundedRect(label.x - label.width / 2 - 5, label.y - 3, label.width + 10, label.height + 6, 4);
    background.endFill();
    overlay.addChild(background, label);
  }
}
