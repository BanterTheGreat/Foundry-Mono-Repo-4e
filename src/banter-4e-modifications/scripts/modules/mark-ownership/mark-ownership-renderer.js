import { MODULE_NAME } from "../../shared/globals.js";
import { OWNERSHIP_FLAG } from "./constants.js";
import { MarkOwnershipStore } from "./mark-ownership-store.js";

/**
 * Renders visibility-safe Mark relationships on the canvas.
 */
export class MarkOwnershipRenderer {
  /**
   * Creates a renderer without attaching it to a canvas. The graphics layer is
   * initialized separately because Foundry may replace the canvas between scenes.
   */
  constructor() {
    this.lines = null;
  }

  /**
   * Replaces any stale graphics layer with one attached to the active canvas.
   */
  attachToCanvas() {
    this.destroyGraphicsLayer();
    if (!canvas?.ready || !canvas.interface) {
      return;
    }
    this.lines = canvas.interface.addChild(new PIXI.Graphics());
  }

  /**
   * Releases the scene-specific graphics layer and its PIXI resources.
   */
  destroyGraphicsLayer() {
    this.lines?.destroy({ children: true });
    this.lines = null;
  }

  /**
   * Clears and redraws eligible relationships for the current scene. A line is
   * drawn only when both endpoints are visible and either endpoint is hovered,
   * controlled, or targeted.
   */
  drawRelationships() {
    if (!this.lines || !canvas?.ready) {
      return;
    }

    this.lines.clear();
    for (const effect of MarkOwnershipStore.getCurrentSceneMarkEffects()) {
      const ownership = effect.getFlag(MODULE_NAME, OWNERSHIP_FLAG);
      if (ownership?.targetSceneId !== canvas.scene.id || ownership.ownerSceneId !== canvas.scene.id) {
        continue;
      }

      const owner = canvas.tokens.get(ownership.ownerTokenId);
      const target = canvas.tokens.get(ownership.targetTokenId);
      if (!owner || !target || !MarkOwnershipRenderer.#canSee(owner) || !MarkOwnershipRenderer.#canSee(target)) {
        continue;
      }
      if (!MarkOwnershipRenderer.#isInteractive(owner) && !MarkOwnershipRenderer.#isInteractive(target)) {
        continue;
      }
      this.#drawArrows(owner, target);
    }
  }

  /**
   * Prevents a relationship line from revealing a hidden or unseen endpoint.
   * GMs retain visibility because Foundry exposes hidden tactical information to
   * them already.
   *
   * @param {Token} token
   *   Endpoint whose visibility should be checked for the current user.
   * @returns {boolean}
   *   Whether drawing the endpoint can safely reveal its position.
   */
  static #canSee(token) {
    return game.user.isGM || (!token.document.hidden && token.visible);
  }

  /**
   * Determines whether a token currently requests its relationship lines.
   *
   * @param {Token} token
   *   Owner or marked token being inspected.
   * @returns {boolean}
   *   Whether the token is hovered, controlled, or targeted.
   */
  static #isInteractive(token) {
    return token.hover || token.controlled || token.isTargeted;
  }

  /**
   * Adds red arrowheads pointing from the marker toward the marked token. Two
   * arrowheads are centered within every grid-square length. PIXI v8 strokes
   * completed paths, while the v7-compatible branch sets line style first.
   *
   * @param {Token} owner
   *   Token applying the Mark.
   * @param {Token} target
   *   Token carrying the Mark.
   */
  #drawArrows(owner, target) {
    const from = MarkOwnershipRenderer.#edgePoint(target.center, owner);
    const to = MarkOwnershipRenderer.#edgePoint(owner.center, target);
    const arrowLength = 18;
    const arrowAngle = Math.PI / 6;
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const distance = Math.hypot(deltaX, deltaY);
    const direction = Math.atan2(deltaY, deltaX);
    const gridSize = Number(canvas.grid.size);
    const arrowSpacing = Number.isFinite(gridSize) && gridSize > 0 ? gridSize / 2 : distance;
    const arrowPositions = [];
    for (let travelled = arrowSpacing / 2; travelled < distance; travelled += arrowSpacing) {
      arrowPositions.push(travelled / distance);
    }
    if (!arrowPositions.length) {
      arrowPositions.push(0.5);
    }
    const arrows = arrowPositions.map(position => {
      const point = { x: from.x + (to.x - from.x) * position, y: from.y + (to.y - from.y) * position };
      return {
        point,
        left: { x: point.x - arrowLength * Math.cos(direction - arrowAngle), y: point.y - arrowLength * Math.sin(direction - arrowAngle) },
        right: { x: point.x - arrowLength * Math.cos(direction + arrowAngle), y: point.y - arrowLength * Math.sin(direction + arrowAngle) },
      };
    });
    if (this.lines.stroke) {
      this.#drawArrowPaths(arrows);
      this.lines.stroke({ color: 0xff2222, width: 4, alpha: 1 });
    } else {
      this.lines.lineStyle(4, 0xff2222, 1);
      this.#drawArrowPaths(arrows);
    }
  }

  /**
   * Adds the two strokes that form each arrowhead to the active PIXI path.
   *
   * @param {{point: object, left: object, right: object}[]} arrows
   *   Arrowhead points to add to the path.
   */
  #drawArrowPaths(arrows) {
    for (const arrow of arrows) {
      this.lines.moveTo(arrow.point.x, arrow.point.y).lineTo(arrow.left.x, arrow.left.y)
        .moveTo(arrow.point.x, arrow.point.y).lineTo(arrow.right.x, arrow.right.y);
    }
  }

  /**
   * Finds the point on a token's border closest to another token. This keeps
   * relationship markers visible instead of drawing them beneath token art.
   *
   * @param {{x: number, y: number}} from
   *   Center of the token at the other end of the relationship.
   * @param {Token} token
   *   Token whose border should be intersected.
   * @returns {{x: number, y: number}}
   *   Point on the token border facing `from`.
   */
  static #edgePoint(from, token) {
    const to = token.center;
    const halfWidth = token.w / 2;
    const halfHeight = token.h / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if ((!dx && !dy) || !halfWidth || !halfHeight) {
      return to;
    }
    const scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight);
    return { x: to.x - dx * scale, y: to.y - dy * scale };
  }
}
