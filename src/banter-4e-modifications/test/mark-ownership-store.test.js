import test from "node:test";
import assert from "node:assert/strict";
import { MarkOwnershipStore } from "../scripts/modules/mark-ownership/mark-ownership-store.js";
import { MODULE_NAME } from "../scripts/shared/globals.js";
import { OWNERSHIP_FLAG } from "../scripts/modules/mark-ownership/constants.js";

function createMark({ id, parent, ownership } = {}) {
  const effect = {
    id, uuid: `Actor.${parent.uuid}.ActiveEffect.${id}`, parent, statuses: new Set(["mark_1"]), changes: [], flags: ownership ? { [MODULE_NAME]: { [OWNERSHIP_FLAG]: ownership } } : {},
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async update(update) { this.updateData = update; },
    async delete() { this.deleted = true; },
  };
  return effect;
}

test("MarkOwnershipStore persists a validated owner and removes competing Marks", async () => {
  const targetActor = { uuid: "Actor.target", effects: [] };
  const ownerActor = { uuid: "Actor.owner", effects: [] };
  const targetToken = { id: "target-token", actor: targetActor, parent: { id: "scene" } };
  const ownerToken = { id: "owner-token", actor: ownerActor, parent: { id: "scene" } };
  const selected = createMark({ id: "selected", parent: targetActor });
  const competing = createMark({ id: "competing", parent: targetActor });
  targetActor.effects = [selected, competing];
  globalThis.CONST = { ACTIVE_EFFECT_MODES: { OVERRIDE: 5 } };
  globalThis.fromUuid = async uuid => uuid === selected.uuid ? selected : null;
  globalThis.game = {
    combats: new Map([["combat", { started: true, combatants: [{ sceneId: "scene", tokenId: "target-token" }, { sceneId: "scene", tokenId: "owner-token" }] }]]),
    scenes: new Map([["scene", { tokens: new Map([[targetToken.id, targetToken], [ownerToken.id, ownerToken]]) }]]),
  };

  await MarkOwnershipStore.assignOwnersToMarks(
    [{ effectUuid: selected.uuid, combatId: "combat", targetSceneId: "scene", targetTokenId: targetToken.id }],
    { actorUuid: ownerActor.uuid, ownerSceneId: "scene", ownerTokenId: ownerToken.id, combatId: "combat" },
  );

  assert.equal(competing.deleted, true);
  assert.deepEqual(selected.updateData[`flags.${MODULE_NAME}.${OWNERSHIP_FLAG}`], {
    actorUuid: ownerActor.uuid, ownerSceneId: "scene", ownerTokenId: ownerToken.id, combatId: "combat", targetSceneId: "scene", targetTokenId: targetToken.id,
  });
  assert.deepEqual(selected.updateData.changes, [{ key: "system.marker", mode: 5, value: ownerActor.uuid, priority: null }]);
});

test("MarkOwnershipStore rejects stale socket assignments without changing a live Mark", async () => {
  const actor = { uuid: "Actor.target", effects: [] };
  const effect = createMark({ id: "mark", parent: actor });
  actor.effects = [effect];
  globalThis.fromUuid = async () => effect;
  globalThis.game = { combats: new Map([["combat", { started: false, combatants: [] }]]), scenes: new Map() };

  await MarkOwnershipStore.assignOwnersToMarks([{ effectUuid: effect.uuid, combatId: "combat", targetSceneId: "gone", targetTokenId: "gone" }], null);

  assert.equal(effect.deleted, true);
  assert.equal(effect.updateData, undefined);
});
