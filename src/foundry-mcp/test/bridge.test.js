import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import { FoundryBridge } from "../server/bridge.js";
import { PROTOCOL_VERSION } from "../shared/protocol.js";

const origin = "http://localhost:30000";

/**
 * Start an isolated loopback transport with a new test token.
 */
async function fixture(t) {
  const token = randomBytes(32).toString("hex");
  const bridge = new FoundryBridge({ token, origin, port: 0, timeoutMs: 100 });
  await bridge.start();
  t.after(() => bridge.close());
  return { token, bridge };
}

/**
 * Simulate a paired browser without contacting Foundry.
 */
async function pair(bridge, token) {
  const socket = new WebSocket(`ws://127.0.0.1:${bridge.port}/bridge`, { origin });
  await once(socket, "open");
  const reply = once(socket, "message");
  socket.send(JSON.stringify({ type: "hello", version: PROTOCOL_VERSION, token, worldId: "world", userId: "gm" }));
  const [bytes] = await reply;
  assert.equal(JSON.parse(bytes).type, "paired");
  return socket;
}

test("rejects an unexpected browser origin before upgrading", async t => {
  const { bridge } = await fixture(t);
  const socket = new WebSocket(`ws://127.0.0.1:${bridge.port}/bridge`, { origin: "http://untrusted.example" });
  const [error] = await once(socket, "error");
  assert.match(error.message, /401/);
  assert.equal(bridge.session, null);
});

test("bad tokens cannot pair or read", async t => {
  const { bridge } = await fixture(t);
  const socket = new WebSocket(`ws://127.0.0.1:${bridge.port}/bridge`, { origin });
  await once(socket, "open");
  const closed = once(socket, "close");
  socket.send(JSON.stringify({ type: "hello", version: PROTOCOL_VERSION, token: "0".repeat(64), worldId: "world", userId: "gm" }));
  await closed;
  assert.equal(bridge.session, null);
  await assert.rejects(bridge.request("get_session"), /No GM session/);
});

test("a second GM connection cannot replace the paired session", async t => {
  const { bridge, token } = await fixture(t);
  const first = await pair(bridge, token);
  const second = new WebSocket(`ws://127.0.0.1:${bridge.port}/bridge`, { origin });
  await once(second, "open");
  const closed = once(second, "close");
  second.send(JSON.stringify({ type: "hello", version: PROTOCOL_VERSION, token, worldId: "other", userId: "other" }));
  await closed;
  assert.equal(bridge.session.worldId, "world");
  assert.equal(first.readyState, WebSocket.OPEN);
});

test("correlates reads and refuses write operations", async t => {
  const { bridge, token } = await fixture(t);
  const socket = await pair(bridge, token);
  socket.on("message", bytes => {
    const request = JSON.parse(bytes);
    socket.send(JSON.stringify({ type: "response", id: request.id, worldId: request.worldId, userId: request.userId, result: { readOnly: true } }));
  });
  assert.deepEqual(await bridge.request("get_session"), { readOnly: true });
  await assert.rejects(bridge.request("update_document"), /Unsupported operation/);
});

test("disconnects settle outstanding reads", async t => {
  const { bridge, token } = await fixture(t);
  const socket = await pair(bridge, token);
  const request = bridge.request("get_session");
  const rejected = assert.rejects(request, /disconnected/);
  socket.close();
  await rejected;
  assert.equal(bridge.pending.size, 0);
});

test("silent browsers time out and mismatched session responses fail closed", async t => {
  const { bridge, token } = await fixture(t);
  const socket = await pair(bridge, token);
  await assert.rejects(bridge.request("get_session"), /timed out/);
  socket.on("message", bytes => {
    const request = JSON.parse(bytes);
    socket.send(JSON.stringify({ type: "response", id: request.id, worldId: "other", userId: "gm", result: {} }));
  });
  await assert.rejects(bridge.request("get_session"), /disconnected/);
});

test("creation transport accepts a stat block larger than a read request and reports uncertain outcomes", async t => {
  const { bridge, token } = await fixture(t);
  const socket = await pair(bridge, token);
  const args = { requestId: "transport-npc-request", name: "NPC", folder: "Monsters", system: { biography: "x".repeat(20000) } };
  const reply = once(socket, "message");
  const result = bridge.request("create_npc_actor", args);
  const rejected = assert.rejects(result, /may have succeeded.*same requestId/);
  assert.deepEqual(JSON.parse((await reply)[0]).args, args);
  await rejected;
  await assert.rejects(bridge.request("get_document", { uuid: "Actor.npc", fields: ["x".repeat(20000)] }), /too large/);
  await assert.rejects(bridge.request("create_npc_actor", { ...args, system: { biography: "x".repeat(2 * 1024 * 1024) } }), /too large/);
});

test("old read-only protocol clients cannot pair with the creation-capable companion", async t => {
  const { bridge, token } = await fixture(t);
  const socket = new WebSocket(`ws://127.0.0.1:${bridge.port}/bridge`, { origin });
  await once(socket, "open");
  const closed = once(socket, "close");
  socket.send(JSON.stringify({ type: "hello", version: 1, token, worldId: "world", userId: "gm" }));
  await closed;
  assert.equal(bridge.session, null);
});
