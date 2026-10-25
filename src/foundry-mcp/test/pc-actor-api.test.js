import test from "node:test";
import assert from "node:assert/strict";
import { editPcActor } from "../scripts/pc-actor-api.js";
import { validatePcActorEdit } from "../shared/pc-actor-data.js";

/**
 * Model stored actor updates separately from derived system data.
 */
function fixture() {
  const calls = [];
  const source = { name: "Hero", type: "Player Character", system: {
    abilities: { str: { value: 10 }, dex: { value: 12 } },
    skills: { ath: { training: 0, base: 1 } },
    details: { weaponProf: { value: ["simpleM"], custom: "Longsword" } },
    languages: { spoken: { value: ["Common"], custom: "" } }
  }, flags: { keep: true }, items: [{ name: "Power" }], effects: [{ name: "Effect" }], ownership: { player: 3 } };
  const game = { ready: true, socket: { connected: true }, settings: { get: () => true },
    user: { id: "gm", isGM: true, isActiveGM: true }, world: { id: "world" },
    system: { id: "dnd4e", version: "0.9.3" }, actors: new Map() };
  const actor = { id: "pc", uuid: "Actor.pc", name: "Hero", type: "Player Character",
    toObject: () => structuredClone(source),
    update: async patch => {
      calls.push(patch);
      for (const [path, value] of Object.entries(patch)) {
        const keys = path.split(".");
        const last = keys.pop();
        keys.reduce((obj, key) => obj[key] ??= {}, source)[last] = value;
        if (actor.fail) {
          throw new Error("Partial save");
        }
      }
    }
  };
  game.actors.set(actor.id, actor);
  return { game, actor, calls, source, confirm: async () => true };
}

const request = () => ({ uuid: "Actor.pc", summary: "Train Athletics, increase Strength and add languages and proficiencies.", system: {
  abilities: { str: { value: 18 } }, skills: { ath: { training: 5 } },
  details: { weaponProf: { value: ["simpleM", "militaryM"] } },
  languages: { spoken: { value: ["Common", "Elven"] }, script: { value: ["Rellanic"], custom: "Local runes" } }
} });

test("PC edits review every changed field, preserve unrelated source and retry without prompting", async () => {
  const deps = fixture();
  const original = structuredClone(deps.source);
  deps.confirm = async proposal => {
    assert.equal(deps.calls.length, 0);
    assert.equal(proposal.title, "Foundry MCP: Confirm PC edit");
    assert.equal(proposal.summary, request().summary);
    assert.equal(proposal.changes.length, 6);
    assert.deepEqual(proposal.changes[0], { document: "Hero", uuid: "Actor.pc", path: "system.abilities.str.value", before: 10, after: 18 });
    return true;
  };
  assert.equal((await editPcActor(request(), deps)).status, "updated");
  assert.equal(deps.source.system.abilities.str.value, 18);
  assert.equal(deps.source.system.skills.ath.training, 5);
  assert.deepEqual(deps.source.system.languages.spoken.value, ["Common", "Elven"]);
  assert.equal(deps.source.system.details.weaponProf.custom, "Longsword");
  assert.deepEqual(deps.source.system.abilities.dex, original.system.abilities.dex);
  for (const key of ["flags", "items", "effects", "ownership"]) {
    assert.deepEqual(deps.source[key], original[key]);
  }
  deps.confirm = async () => assert.fail("No-op must not prompt");
  assert.equal((await editPcActor(request(), deps)).status, "unchanged");
  assert.equal((await editPcActor({ uuid: "Actor.pc", system: {} }, deps)).status, "unchanged");
});

test("cancel, expiry, stale source, replacement and revoked sessions save nothing", async () => {
  for (const action of ["cancel", "expired", "stale", "removed", "replaced", "session", "world", "user", "connection"]) {
    const deps = fixture();
    let disconnected = false;
    deps.assertConnection = () => {
      if (disconnected) {
        throw new Error("Disconnected");
      }
    };
    deps.confirm = async () => {
      if (action === "stale") {
        deps.source.system.abilities.dex.value = 16;
      }
      if (action === "removed") {
        deps.game.actors.delete("pc");
      }
      if (action === "replaced") {
        deps.game.actors.set("pc", { ...deps.actor });
      }
      if (action === "session") {
        deps.game.user.isActiveGM = false;
      }
      if (action === "world") {
        deps.game.world.id = "other";
      }
      if (action === "user") {
        deps.game.user.id = "other";
      }
      disconnected = action === "connection";
      return action === "expired" ? undefined : action !== "cancel";
    };
    const result = editPcActor(request(), deps);
    if (["cancel", "expired"].includes(action)) {
      assert.equal((await result).status, "cancelled");
    } else {
      await assert.rejects(result);
    }
    assert.equal(deps.calls.length, 0);
  }
});

test("rejects non-world PCs, wrong system and arbitrary or executable fields", async () => {
  for (const mutate of [
    deps => { deps.actor.type = "NPC"; }, deps => { deps.actor.pack = "pack"; },
    deps => { deps.actor.parent = {}; }, deps => { deps.game.user.isGM = false; },
    deps => { deps.game.user.isActiveGM = false; }, deps => { deps.game.system.version = "0.9.4"; },
    deps => { deps.game.system.id = "other"; }
  ]) {
    const deps = fixture();
    mutate(deps);
    deps.confirm = async () => assert.fail("Must not prompt");
    await assert.rejects(editPcActor(request(), deps));
  }
  for (const patch of [
    { flags: {} }, { ownership: {} }, { items: [] }, { effects: [] },
    { system: { abilities: { str: { mod: 5 } } } }, { system: { attributes: { hp: { max: 50 } } } },
    { system: { skills: { ath: { training: 1 } } } }, { system: { skills: { ath: { ability: "bad" } } } },
    { system: { details: { level: 0 } } }, { system: { details: { exp: -1 } } },
    { system: { abilities: { str: { value: 1.5 } } } },
    { system: { languages: { spoken: { value: [true] } } } },
    { uuid: "Scene.s.Token.t.Actor.pc" }, { name: " " },
    JSON.parse('{"system":{"__proto__":{"polluted":true}}}')
  ]) {
    assert.throws(() => validatePcActorEdit({ uuid: "Actor.pc", ...patch }));
  }
});

test("partial saves report applied fields and retry only remaining changes", async () => {
  const deps = fixture();
  deps.actor.fail = true;
  const result = await editPcActor(request(), deps);
  assert.equal(result.status, "incomplete");
  assert.equal(result.applied.length, 1);
  deps.actor.fail = false;
  assert.equal((await editPcActor(request(), deps)).status, "updated");
  assert.equal(Object.hasOwn(deps.calls.at(-1), "system.abilities.str.value"), false);
});

test("concurrent edits are rejected and failed dialogs release the pending guard", async () => {
  const deps = fixture();
  let finish;
  deps.confirm = () => new Promise(resolve => { finish = resolve; });
  const first = editPcActor(request(), deps);
  await assert.rejects(editPcActor(request(), deps), /awaiting confirmation/);
  finish(false);
  await first;
  deps.confirm = async () => { throw new Error("Dialog failed"); };
  await assert.rejects(editPcActor(request(), deps), /Dialog failed/);
  deps.confirm = async () => true;
  assert.equal((await editPcActor(request(), deps)).status, "updated");
});
