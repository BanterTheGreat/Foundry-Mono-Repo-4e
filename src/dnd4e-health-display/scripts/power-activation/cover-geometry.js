const EPSILON = 0.000001;

/** Return the corners of an axis-aligned occupied square. */
function corners({ x, y, width, height }) {
  return [
    { x, y }, { x: x + width, y },
    { x: x + width, y: y + height }, { x, y: y + height },
  ];
}

/** Nudge wall-test endpoints inside their occupied square to resolve wall boundaries. */
function insideSquare(point, square) {
  return {
    x: point.x + (square.x + square.width / 2 - point.x) * 0.00001,
    y: point.y + (square.y + square.height / 2 - point.y) * 0.00001,
  };
}

/** Test a wall crossing, excluding rays along walls and ray endpoint touches. */
export function crossesWall(start, end, wall) {
  const [x1, y1, x2, y2] = wall;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const wx = x2 - x1;
  const wy = y2 - y1;
  const cross = dx * wy - dy * wx;
  if (Math.abs(cross) < EPSILON) {
    return false;
  }
  const ox = x1 - start.x;
  const oy = y1 - start.y;
  const alongRay = (ox * wy - oy * wx) / cross;
  const alongWall = (ox * dy - oy * dx) / cross;
  return alongRay > EPSILON && alongRay < 1 - EPSILON
    && alongWall >= -EPSILON && alongWall <= 1 + EPSILON;
}

/** Test passage through a token's interior; travelling along its edge is clear. */
export function crossesCreature(start, end, rectangle) {
  let entry = 0;
  let exit = 1;
  for (const [axis, size] of [["x", "width"], ["y", "height"]]) {
    const minimum = rectangle[axis];
    const maximum = minimum + rectangle[size];
    const direction = end[axis] - start[axis];
    if (Math.abs(direction) < EPSILON) {
      if (start[axis] <= minimum + EPSILON || start[axis] >= maximum - EPSILON) {
        return false;
      }
      continue;
    }
    const first = (minimum - start[axis]) / direction;
    const second = (maximum - start[axis]) / direction;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
  }
  return exit - entry > EPSILON;
}

/** Split a rectangular token footprint into occupied grid squares. */
function occupiedSquares(rectangle, gridSize) {
  const squares = [];
  for (let x = rectangle.x; x < rectangle.x + rectangle.width - EPSILON; x += gridSize) {
    for (let y = rectangle.y; y < rectangle.y + rectangle.height - EPSILON; y += gridSize) {
      squares.push({ x, y, width: gridSize, height: gridSize });
    }
  }
  return squares;
}

/**
 * Choose the best corner and target square for BOTH attack types (PoC house rule).
 * The caller excludes creatures for melee. No documents or roll data are changed.
 *
 * @param {object} options
 * @param {{x: number, y: number, width: number, height: number}} options.attacker
 * @param {{x: number, y: number, width: number, height: number}} options.target
 * @param {number} options.gridSize
 * @param {number[][]} [options.walls] Blocking wall segments [x1, y1, x2, y2].
 * @param {object[]} [options.creatures] Enemy token rectangles for ranged only.
 * @returns {{kind: string, penalty: number|null, rays: object[]}}
 */
export function calculateCover({ attacker, target, gridSize, walls = [], creatures = [] }) {
  if (!Number.isFinite(gridSize) || gridSize <= 0) {
    throw new RangeError("Cover preview requires a positive grid size.");
  }
  let best = { blocked: Infinity, rays: [] };
  for (const source of occupiedSquares(attacker, gridSize)) {
    for (const start of corners(source)) {
      for (const destination of occupiedSquares(target, gridSize)) {
        const rays = corners(destination).map(end => {
          const blockingWalls = [];
          const blockingCreatures = [];
          walls.forEach((wall, index) => {
            if (crossesWall(insideSquare(start, source), insideSquare(end, destination), wall)) {
              blockingWalls.push(index);
            }
          });
          creatures.forEach((creature, index) => {
            if (crossesCreature(start, end, creature)) {
              blockingCreatures.push(index);
            }
          });
          return { start, end, blocked: blockingWalls.length > 0 || blockingCreatures.length > 0, blockingWalls, blockingCreatures };
        });
        const blocked = rays.filter(ray => ray.blocked).length;
        if (blocked < best.blocked) {
          best = { blocked, rays };
        }
        if (blocked === 0) {
          return { kind: "clear", penalty: 0, rays };
        }
      }
    }
  }
  const kind = best.blocked === 4 ? "blocked" : best.blocked === 3 ? "superior" : "cover";
  return { kind, penalty: kind === "blocked" ? null : kind === "superior" ? -5 : -2, rays: best.rays };
}
