import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { FoundryBridge } from "../server/bridge.js";
import { CompanionClient } from "../server/companion-client.js";
import { CompanionHub } from "../server/companion-hub.js";
import { COMPANION_VERSION } from "../server/companion-config.js";
import { PROTOCOL_VERSION } from "../shared/protocol.js";

const origin = "http://localhost:30000";
const main = fileURLToPath(new URL("../server/main.js", import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Pair a simulated GM; return requests with their own marker to detect crosstalk.
 */
async function pair(config) {
  const socket = new WebSocket(`ws://127.0.0.1:${config.port}/bridge`, { origin });
  await once(socket, "open");
  const paired = once(socket, "message");
  socket.send(JSON.stringify({ type: "hello", version: PROTOCOL_VERSION, token: config.token, worldId: "world", userId: "gm" }));
  await paired;
  let busy = false;
  socket.on("message", bytes => {
    const request = JSON.parse(bytes);
    if (busy) {
      socket.send(JSON.stringify({ type: "response", id: request.id, worldId: "world", userId: "gm", error: "Another request is in progress." }));
      return;
    }
    busy = true;
    setTimeout(() => {
      busy = false;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "response", id: request.id, worldId: "world", userId: "gm", result: { marker: request.args.query ?? request.operation } }));
      }
    }, 10);
  });
  return socket;
}

/**
 * Reserve a test port without using the installed Foundry bridge.
 */
async function config() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return { port, origin, token: randomBytes(32).toString("hex"), idleMs: 500 };
}

/**
 * Exercise the real MCP initialization and stdio process lifetime.
 */
async function adapter(t, settings) {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [main], stderr: "pipe",
    env: { ...process.env, FOUNDRY_MCP_TOKEN: settings.token, FOUNDRY_ORIGIN: settings.origin, FOUNDRY_MCP_PORT: String(settings.port), FOUNDRY_MCP_IDLE_MS: String(settings.idleMs) }
  });
  const client = new Client({ name: "shared-companion-test", version: "1" });
  t.after(() => client.close());
  await client.connect(transport);
  return client;
}

test("simultaneous MCP sessions share one GM, survive a session closing, and release the port after idle", { timeout: 15000 }, async t => {
  const settings = await config();
  const [first, second] = await Promise.all([adapter(t, settings), adapter(t, settings)]);
  const gm = await pair(settings);
  t.after(() => gm.terminate());
  const result = await Promise.all([first, second].map((client, i) => client.callTool({ name: "list_documents", arguments: { documentType: "Actor", query: String(i) } })));
  assert.deepEqual(result.map(value => JSON.parse(value.content[0].text)), [{ marker: "0" }, { marker: "1" }]);
  await first.close();
  assert.equal(gm.readyState, WebSocket.OPEN);
  assert.equal(JSON.parse((await second.callTool({ name: "get_session", arguments: {} })).content[0].text).marker, "get_session");

  // A raw session abandoning stdin must exit without killing the shared owner.
  const raw = spawn(process.execPath, [main], {
    env: { ...process.env, FOUNDRY_MCP_TOKEN: settings.token, FOUNDRY_ORIGIN: origin, FOUNDRY_MCP_PORT: String(settings.port) },
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true
  });
  t.after(() => { raw.kill(); });
  await once(raw.stderr, "data");
  const exited = once(raw, "exit");
  raw.stdin.end();
  assert.equal((await exited)[0], 0);
  assert.equal(JSON.parse((await second.callTool({ name: "get_session", arguments: {} })).content[0].text).marker, "get_session");
  const closed = once(gm, "close");
  await second.close();
  await closed;

  // Idle shutdown releases the original port; a later session starts fresh.
  const third = await adapter(t, settings);
  const nextGm = await pair(settings);
  t.after(() => nextGm.terminate());
  assert.equal(JSON.parse((await third.callTool({ name: "get_session", arguments: {} })).content[0].text).marker, "get_session");
  const nextClosed = once(nextGm, "close");
  await third.close();
  await nextClosed;
});

test("shared adapters reject wrong credentials, browser origins and incompatible versions", async t => {
  const settings = await config();
  const bridge = new FoundryBridge(settings);
  const hub = new CompanionHub(bridge, { onIdle: () => {} });
  await bridge.start({ broker: hub });
  t.after(async () => { hub.close(); await bridge.close(); });
  for (const headers of [
    { authorization: `Bearer ${"0".repeat(64)}` },
    { origin },
    { "x-foundry-origin": "http://other:30000" },
    { "x-foundry-companion": "old" }
  ]) {
    const socket = new WebSocket(`ws://127.0.0.1:${settings.port}/clients`, {
      headers: { authorization: `Bearer ${settings.token}`, "x-foundry-origin": origin, "x-foundry-companion": COMPANION_VERSION, ...headers }
    });
    assert.match((await once(socket, "error"))[0].message, /401/);
  }
  const wrong = new CompanionClient({ ...settings, token: "0".repeat(64) });
  t.after(() => wrong.close());
  await assert.rejects(wrong.start(), /rejected configuration/);
  const good = new CompanionClient(settings);
  t.after(() => good.close());
  await good.start();
  const gm = await pair(settings);
  t.after(() => gm.terminate());
  assert.deepEqual(await good.request("get_session"), { marker: "get_session" });
});

test("lost companion rejects in-flight calls and reconnects without replaying writes", { timeout: 10000 }, async t => {
  const settings = await config();
  let bridge = new FoundryBridge(settings);
  let hub = new CompanionHub(bridge, { onIdle: () => {} });
  await bridge.start({ broker: hub });
  t.after(async () => { hub.close(); await bridge.close(); });
  const client = new CompanionClient(settings);
  t.after(() => client.close());
  await client.start();
  const gm = await pair(settings);
  gm.removeAllListeners("message");
  const incoming = once(gm, "message");
  const pending = client.request("create_item", { requestId: "uncertain-write" });
  const rejected = assert.rejects(pending, /may have saved/);
  await incoming;
  hub.close();
  await bridge.close();
  await rejected;
  bridge = new FoundryBridge(settings);
  hub = new CompanionHub(bridge, { onIdle: () => {} });
  await bridge.start({ broker: hub });
  const nextGm = await pair(settings);
  t.after(() => nextGm.terminate());
  const operations = [];
  nextGm.on("message", bytes => operations.push(JSON.parse(bytes).operation));
  assert.deepEqual(await client.request("get_session"), { marker: "get_session" });
  assert.deepEqual(operations, ["get_session"]);
});

test("an abandoned dispatched write keeps the companion alive until it settles", async t => {
  const settings = await config();
  const bridge = new FoundryBridge(settings);
  let retired = false;
  const hub = new CompanionHub(bridge, { idleMs: 30, onIdle: () => { retired = true; } });
  await bridge.start({ broker: hub });
  t.after(async () => { hub.close(); await bridge.close(); });
  const client = new CompanionClient(settings);
  await client.start();
  const gm = await pair(settings);
  gm.removeAllListeners("message");
  const incoming = once(gm, "message");
  const pending = client.request("edit_npc_actor", {});
  const rejected = assert.rejects(pending, /may have saved/);
  const request = JSON.parse((await incoming)[0]);
  client.close();
  await rejected;
  await delay(80);
  assert.equal(retired, false);
  gm.send(JSON.stringify({ type: "response", id: request.id, worldId: "world", userId: "gm", result: { status: "cancelled" } }));
  await delay(80);
  assert.equal(retired, true);
});

test("legacy listeners are left untouched and report a required companion upgrade", async t => {
  const settings = await config();
  const bridge = new FoundryBridge(settings);
  await bridge.start();
  t.after(() => bridge.close());
  const gm = await pair(settings);
  t.after(() => gm.terminate());
  const client = new CompanionClient(settings);
  t.after(() => client.close());
  await assert.rejects(client.start(), /stop any legacy companion/);
  assert.equal(gm.readyState, WebSocket.OPEN);
  assert.deepEqual(await bridge.request("get_session"), { marker: "get_session" });
});

test("abandoned queued writes never dispatch, and queued requests cannot move to another GM", async t => {
  const settings = await config();
  const bridge = new FoundryBridge(settings);
  const hub = new CompanionHub(bridge, { onIdle: () => {} });
  await bridge.start({ broker: hub });
  t.after(async () => { hub.close(); await bridge.close(); });
  const first = new CompanionClient(settings);
  const second = new CompanionClient(settings);
  t.after(() => { first.close(); second.close(); });
  await Promise.all([first.start(), second.start()]);
  const gm = await pair(settings);
  gm.removeAllListeners("message");
  const incoming = once(gm, "message");
  const active = first.request("get_session");
  const activeRejected = assert.rejects(active, /disconnected/);
  await incoming;
  const queued = second.request("create_item", { requestId: "abandoned-queued" });
  const queuedRejected = assert.rejects(queued, /may have saved/);
  await delay(30);
  assert.equal(hub.queue.length, 1);
  second.close();
  await queuedRejected;
  await delay(30);
  assert.equal(hub.queue.length, 0);
  // Another request is still tied to the original paired socket, even if a new
  // GM pairs as the previous in-flight request fails.
  const queuedRead = first.request("get_session");
  const readRejected = assert.rejects(queuedRead, /session changed before dispatch/);
  await delay(30);
  gm.close();
  await activeRejected;
  await readRejected;
});

test("queued calls expire without later dispatch and overflow is rejected", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const session = {};
  const calls = [];
  let finish;
  const bridge = {
    session,
    request(operation) {
      calls.push(operation);
      return new Promise(resolve => { finish = resolve; });
    }
  };
  const hub = new CompanionHub(bridge, { onIdle: () => {} });
  t.after(() => hub.close());
  const socket = { readyState: WebSocket.OPEN };
  const active = hub.dispatch(socket, "get_session", {});
  const waiting = Array.from({ length: 7 }, () => assert.rejects(hub.dispatch(socket, "create_item", {}), /expired before dispatch/));
  await assert.rejects(hub.dispatch(socket, "create_item", {}), /not dispatched/);
  t.mock.timers.tick(15000);
  await Promise.all(waiting);
  finish({});
  await active;
  assert.deepEqual(calls, ["get_session"]);
});
