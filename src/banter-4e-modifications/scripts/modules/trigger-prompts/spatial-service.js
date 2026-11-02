/**
 * Square-grid geometry for trigger evaluation.
 *
 * Distances are measured between token footprints, so large creatures are
 * measured from their nearest square rather than their center. Two tokens that
 * share an edge or corner are 1 square apart; overlapping tokens are 0.
 *
 * The footprint model assumes a square grid. Hex and gridless scenes are
 * approximated by the same rectangles.
 */
export class SpatialService {
  /**
   * @param {number} gridSize
   *   Pixel size of one grid square.
   */
  constructor(gridSize) {
    this.gridSize = gridSize;
  }

  /**
   * Returns the pixel rectangle a token covers.
   *
   * @param {{x: number, y: number, width?: number, height?: number}} token
   * @param {{x: number, y: number}} [position=token]
   *   Top-left position to use instead of the token's own.
   * @returns {{left: number, top: number, right: number, bottom: number}}
   */
  footprint(token, position = token) {
    return {
      left: position.x,
      top: position.y,
      right: position.x + (token.width ?? 1) * this.gridSize,
      bottom: position.y + (token.height ?? 1) * this.gridSize,
    };
  }

  /**
   * Measures the distance in squares between two tokens' footprints.
   *
   * @param {object} left
   * @param {object} right
   * @param {{x: number, y: number}} [leftPosition=left]
   *   Optional top-left position for the first token.
   * @returns {number}
   *   0 when the footprints overlap, 1 when they touch, otherwise the number of
   *   squares between their nearest squares plus one.
   */
  distanceSquares(left, right, leftPosition = left) {
    const first = this.footprint(left, leftPosition);
    const second = this.footprint(right);
    const gapX = Math.max(0, first.left - second.right, second.left - first.right) / this.gridSize;
    const gapY = Math.max(0, first.top - second.bottom, second.top - first.bottom) / this.gridSize;
    const overlaps = first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
    return overlaps ? 0 : Math.max(gapX, gapY) + 1;
  }

  /**
   * Checks whether a mover starts or passes adjacent to a candidate while
   * travelling a path.
   *
   * The final position is excluded, so a move that only ends adjacent does not
   * qualify, while a move that starts adjacent does. The path is sampled twice
   * per square so a corner clipped mid-segment is still noticed.
   *
   * @param {Array<{x: number, y: number}>} path
   *   Top-left positions from origin to destination.
   * @param {object} mover
   * @param {object} candidate
   * @returns {boolean}
   */
  doesPathPassAdjacent(path, mover, candidate) {
    for (const position of this.#samplePath(path)) {
      const distance = this.distanceSquares(mover, candidate, position);
      if (distance > 0 && distance <= 1 + 1e-6) {
        return true;
      }
    }
    return false;
  }

  /** Check every entered grid position, including the destination but excluding the origin. */
  doesPathEnterRange(path, mover, candidate, range) {
    if (!Number.isFinite(range) || range < 0) {
      return false;
    }
    for (let index = 1; index < path.length; index += 1) {
      const start = path[index - 1];
      const end = path[index];
      const length = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
      if (length === 0) {
        continue;
      }
      const steps = Math.max(1, Math.ceil(length / this.gridSize));
      for (let step = 1; step <= steps; step += 1) {
        const position = { x: start.x + (end.x - start.x) * step / steps, y: start.y + (end.y - start.y) * step / steps };
        if (this.distanceSquares(mover, candidate, position) <= range + 1e-6) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Yields positions along a path, from the origin up to but not including the
   * final destination.
   *
   * @param {Array<{x: number, y: number}>} path
   * @returns {Generator<{x: number, y: number}>}
   */
  *#samplePath(path) {
    for (let index = 0; index < path.length - 1; index += 1) {
      const start = path[index];
      const end = path[index + 1];
      const length = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
      const steps = Math.max(1, Math.ceil(length / (this.gridSize / 2)));
      for (let step = 0; step < steps; step += 1) {
        const progress = step / steps;
        yield { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress };
      }
    }
  }
}
