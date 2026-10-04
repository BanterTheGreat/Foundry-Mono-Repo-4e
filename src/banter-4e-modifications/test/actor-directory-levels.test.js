import test from "node:test";
import assert from "node:assert/strict";
import { ActorDirectoryLevels } from "../scripts/modules/actor-directory-levels/actor-directory-levels.js";

/**
 * Model directory rows with enough DOM behavior to exercise badge lifecycle.
 */
function createDirectory(ids) {
  const rows = ids.map(id => {
    const classes = new Set();
    const row = {
      dataset: { documentId: id },
      badges: [],
      classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
      querySelector: selector => selector === ".document-name" ? row.name : row.badges[0],
    };
    row.name = { textContent: id, after: badge => row.badges.push(badge) };
    return row;
  });
  const element = {
    querySelectorAll: () => rows,
    ownerDocument: {
      createElement: () => {
        const badge = {
          remove() {
            for (const row of rows) {
              row.badges = row.badges.filter(existing => existing !== badge);
            }
          },
        };
        return badge;
      },
    },
  };
  return { element, rendered: true, rows };
}

test("skips actors without levels and refreshes badges without duplicates or name changes", () => {
  const actor = { system: { details: { level: 8 } } };
  globalThis.game = { actors: new Map([["npc", actor]]) };
  const directory = createDirectory(["missing", "npc"]);

  ActorDirectoryLevels.onRenderActorDirectory(directory, directory.element);
  assert.equal(directory.rows[0].badges.length, 0);
  assert.equal(directory.rows[1].badges[0].textContent, "Lv 8");

  actor.system.details.level = 0;
  ActorDirectoryLevels.onRenderActorDirectory(directory, directory.element);
  assert.equal(directory.rows[1].badges.length, 1);
  assert.equal(directory.rows[1].badges[0].textContent, "Lv 0");
  assert.equal(directory.rows[1].name.textContent, "npc");

  delete actor.system.details.level;
  ActorDirectoryLevels.onRenderActorDirectory(directory, directory.element);
  assert.equal(directory.rows[1].badges.length, 0);
});

test("level updates refresh both sidebar and popout while token updates leave world rows alone", () => {
  const actor = { system: { details: { level: 9 } } };
  globalThis.game = { actors: new Map([["npc", actor]]) };
  globalThis.foundry = { utils: { hasProperty: (changes) => changes.system?.details?.level !== undefined } };
  const sidebar = createDirectory(["npc"]);
  sidebar.popout = createDirectory(["npc"]);
  globalThis.ui = { actors: sidebar };

  ActorDirectoryLevels.onUpdateActor(actor, { system: { details: { level: 9 } } });
  assert.equal(sidebar.rows[0].badges[0].textContent, "Lv 9");
  assert.equal(sidebar.popout.rows[0].badges[0].textContent, "Lv 9");

  actor.system.details.level = 10;
  ActorDirectoryLevels.onUpdateActor({ isToken: true }, { "system.details.level": 10 });
  assert.equal(sidebar.rows[0].badges[0].textContent, "Lv 9");
  ActorDirectoryLevels.onUpdateActor(actor, { "system.details.level": 10 });
  assert.equal(sidebar.rows[0].badges[0].textContent, "Lv 10");
});
