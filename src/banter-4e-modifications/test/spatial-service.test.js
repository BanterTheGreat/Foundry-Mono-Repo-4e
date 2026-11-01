import test from "node:test";
import assert from "node:assert/strict";
import { SpatialService } from "../scripts/modules/trigger-prompts/spatial-service.js";

const grid = 100;
const spatial = new SpatialService(grid);
const token = (column, row, size = 1) => ({ x: column * grid, y: row * grid, width: size, height: size });

test("tokens sharing an edge or a corner are 1 square apart", () => {
  assert.equal(spatial.distanceSquares(token(0, 0), token(1, 0)), 1);
  assert.equal(spatial.distanceSquares(token(0, 0), token(1, 1)), 1);
});

test("distance counts the empty squares between footprints", () => {
  assert.equal(spatial.distanceSquares(token(0, 0), token(3, 0)), 3);
  assert.equal(spatial.distanceSquares(token(0, 0), token(3, 5)), 5);
});

test("overlapping tokens are 0 squares apart", () => {
  assert.equal(spatial.distanceSquares(token(2, 2), token(2, 2)), 0);
  assert.equal(spatial.distanceSquares(token(0, 0, 2), token(1, 1)), 0);
});

test("a large token is measured from its nearest square, not its center", () => {
  const ogre = token(0, 0, 2);

  assert.equal(spatial.distanceSquares(ogre, token(2, 0)), 1);
  assert.equal(spatial.distanceSquares(ogre, token(2, 1)), 1);
  assert.equal(spatial.distanceSquares(ogre, token(2, 2)), 1);
  assert.equal(spatial.distanceSquares(ogre, token(2, 3)), 2);
  assert.equal(spatial.distanceSquares(ogre, token(4, 0)), 3);
});

test("a path that starts adjacent to the candidate qualifies", () => {
  const mover = token(1, 0);
  const candidate = token(0, 0);

  assert.equal(spatial.doesPathPassAdjacent([{ x: 100, y: 0 }, { x: 500, y: 0 }], mover, candidate), true);
});

test("a path that passes beside the candidate on the way qualifies", () => {
  const mover = token(0, 2);
  const candidate = token(3, 1);

  assert.equal(spatial.doesPathPassAdjacent([{ x: 0, y: 200 }, { x: 800, y: 200 }], mover, candidate), true);
});

test("a path that only ends adjacent to the candidate does not qualify", () => {
  const mover = token(0, 0);
  const candidate = token(5, 0);

  assert.equal(spatial.doesPathPassAdjacent([{ x: 0, y: 0 }, { x: 400, y: 0 }], mover, candidate), false);
});

test("a path that never comes within one square does not qualify", () => {
  const mover = token(0, 0);
  const candidate = token(0, 5);

  assert.equal(spatial.doesPathPassAdjacent([{ x: 0, y: 0 }, { x: 800, y: 0 }], mover, candidate), false);
});

test("a multi-leg path is checked along every leg", () => {
  const mover = token(0, 0);
  const candidate = token(6, 4);
  const path = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 200 }, { x: 600, y: 700 }];

  assert.equal(spatial.doesPathPassAdjacent(path, mover, candidate), true);
  assert.equal(spatial.doesPathPassAdjacent(path.slice(0, 2), mover, candidate), false);
});

test("a large mover is adjacent through its whole footprint", () => {
  const mover = token(0, 0, 2);
  const candidate = token(2, 1);

  assert.equal(spatial.doesPathPassAdjacent([{ x: 0, y: 0 }, { x: -400, y: 0 }], mover, candidate), true);
});

test("a diagonal path sampled between squares still notices a clipped corner", () => {
  const mover = token(0, 0);
  const candidate = token(2, 1);

  assert.equal(spatial.doesPathPassAdjacent([{ x: 0, y: 0 }, { x: 400, y: 400 }], mover, candidate), true);
});
