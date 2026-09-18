import { MODULE_ID } from "./constants.js";
import { TrackingHelper } from "./tracking-helper.js";

/**
 * Renders temporary Active Effect notes above tokens on the canvas.
 */
export class TrackingOverlay {
  /**
   * Gets the canvas grid scale relative to a 100-pixel grid.
   *
   * @returns {number} The current grid scale.
   */
  static get gridScale() {
    return canvas.scene.dimensions.size / 100;
  }

  /**
   * Gets the base overlay font size.
   *
   * @returns {number} The base font size in pixels.
   */
  static get fontSize() {
    return 18;
  }

  /**
   * Gets the high-resolution font size used before scaling the PIXI text.
   *
   * @returns {number} The scaled font size.
   */
  static get scaledFontSize() {
    return (TrackingOverlay.fontSize * TrackingOverlay.gridScale) * 4;
  }

  /**
   * Refreshes an overlay when Foundry refreshes a token.
   *
   * @param {Token} token The canvas token.
   * @param {object} flags Foundry refresh flags.
   */
  static refreshToken(token, flags) {
    TrackingOverlay.handleOverlay(token, token.hover);
  }

  /**
   * Initializes overlays for tokens on a ready canvas.
   */
  static onCanvasReady() {
    canvas.tokens?.placeables.forEach((token) => {
      TrackingOverlay.handleOverlay(token, token.hover);
    });
  }

  /**
   * Refreshes overlays for tokens sharing an updated actor.
   *
   * @param {Actor} actor The updated actor.
   * @param {object} data The changed data.
   * @param {object} options Update options.
   * @param {string} userId The user that made the update.
   */
  static onUpdateActor(actor, data, options, userId) {
    // Get all the tokens because there can be two tokens of the same linked actor.
    const tokens = canvas.tokens?.placeables.filter((token) => token?.actor?.id === actor.id);
    // Call the _handleOverlay method for each token.
    tokens?.forEach((token) => TrackingOverlay.handleOverlay(token, token.hover));
  }

  /**
   * Refreshes overlays after this module updates token flags.
   *
   * @param {TokenDocument} token The updated token document.
   * @param {object} data The changed data.
   * @param {object} options Update options.
   * @param {string} userId The user that made the update.
   */
  static onUpdateToken(token, data, options, userId) {
    if (data?.flags && data.flags[MODULE_ID]) {
      // Get all the tokens because there can be two tokens of the same linked actor.
      const tokens = canvas.tokens?.placeables.filter((canvasToken) => canvasToken?.actor?.id === token.actorId);
      // Call the _handleOverlay method for each token.
      tokens?.forEach((canvasToken) => TrackingOverlay.handleOverlay(canvasToken));
    }
  }

  /**
   * Creates or updates a token's note overlay.
   *
   * @param {Token} token The canvas token.
   * @param {boolean} [hovering=false] Whether to offset for a hover state.
   */
  static handleOverlay(token, hovering = false) {
    // Create PIXI
    try {
      const { desc, color, stroke } = {
        desc: TrackingHelper.formatNotesForDisplay(token.document),
        color: "#ffffff",
        stroke: "#000000"
      };
      if (desc && color && stroke) {
        const { width } = token.document.getSize();
        const y = -2 + (35 * TrackingOverlay.gridScale); // 25 = this.height;
        const position = 2;
        const x = (width / 2) * position;
        const visible = token.hover || token.controlled;
        const config = { desc, color, stroke, width, x, y, visible };
        if (!token.notesDisplay?._texture) {
          TrackingOverlay.createNotesDisplay(token, config, hovering);
        } else {
          TrackingOverlay.updateNotesDisplay(token, config, hovering);
        }
      } else if (token.notesDisplay) {
        token.notesDisplay.visible = false;
      }
    } catch (err) {
      console.error(
        `Notes Display | Error on function _handleOverlay(). Token Name: "${token.name}". ID: "${token.id}". Type: "${token.document.actor.type}".`,
        err
      );
    }
  }

  /**
   * Creates a PIXI text display for a token's notes.
   *
   * @param {Token} token The canvas token.
   * @param {object} [config={}] Overlay configuration.
   * @param {boolean} [hovering=false] Whether to offset for a hover state.
   */
  static createNotesDisplay(token, config = {}, hovering = false) {
    const { desc, color, stroke, width, x, y, visible } = config;
    const padding = 5;
    const style = {
      // Multiply font size to increase resolution quality
      fontSize: TrackingOverlay.scaledFontSize,
      fontFamily: "Signika",
      fill: color,
      stroke: stroke,
      strokeThickness: 12,
      padding: padding,
      align: "center",
      dropShadow: true,
      dropShadowColor: "black",
      lineJoin: "round",
    };

    token.notesDisplay = token.addChild(new PIXI.Text(desc, style));
    token.notesDisplay.scale.set(0.25);
    token.notesDisplay.anchor.set(0.5, 1);
    token.notesDisplay.visible = visible;

    var lineCount = desc.split("\n").length - 1;
    token.notesDisplay.position.set(width / 2, x + y + (lineCount * ((TrackingOverlay.fontSize * TrackingOverlay.gridScale) + padding)) + (hovering ? 24 : 0));
  }

  /**
   * Updates an existing PIXI text display for a token's notes.
   *
   * @param {Token} token The canvas token.
   * @param {object} [config={}] Overlay configuration.
   * @param {boolean} [hovering=false] Whether to offset for a hover state.
   */
  static updateNotesDisplay(token, config = {}, hovering = false) {
    const { desc, color, stroke, width, x, y, visible } = config;
    const padding = 5;
    token.notesDisplay.style.fontSize = TrackingOverlay.scaledFontSize;
    token.notesDisplay.text = desc;
    token.notesDisplay.style.fill = color;
    token.notesDisplay.style.stroke = stroke;
    token.notesDisplay.visible = visible;

    var lineCount = desc.split("\n").length - 1;
    token.notesDisplay.position.set(width / 2, x + y + (lineCount * ((TrackingOverlay.fontSize * TrackingOverlay.gridScale) + padding)) + (hovering ? 24 : 0));
  }
}
