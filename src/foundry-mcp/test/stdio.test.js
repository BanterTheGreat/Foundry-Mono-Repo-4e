import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PROTOCOL_VERSION } from "../shared/protocol.js";
import { readFile } from "node:fs/promises";
import { validateNpcRequest } from "../shared/npc-data.js";
import { validateItemRequest } from "../shared/item-data.js";
import { validateFeatRequest } from "../shared/feat-data.js";
import { validateItemEffects } from "../shared/item-effect-data.js";

test("real stdio server bridges an MCP read to a simulated GM and shuts down", { timeout: 10000 }, async t => {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const token = randomBytes(32).toString("hex");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../server/main.js", import.meta.url))],
    env: { ...process.env, FOUNDRY_MCP_TOKEN: token, FOUNDRY_ORIGIN: "http://localhost:30000", FOUNDRY_MCP_PORT: String(port), FOUNDRY_MCP_IDLE_MS: "200" },
    stderr: "pipe"
  });
  const client = new Client({ name: "stdio-test", version: "1" });
  t.after(() => client.close());
  await client.connect(transport);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/bridge`, { origin: "http://localhost:30000" });
  t.after(() => socket.terminate());
  await once(socket, "open");
  const paired = once(socket, "message");
  socket.send(JSON.stringify({ type: "hello", version: PROTOCOL_VERSION, token, worldId: "test-world", userId: "test-gm" }));
  await paired;
  socket.on("message", bytes => {
    const request = JSON.parse(bytes);
    if (request.operation === "create_npc_actor") {
      validateNpcRequest(request.args);
    }
    if (request.operation === "create_item") {
      validateItemRequest(request.args);
    }
    if (request.operation === "create_feat") {
      validateFeatRequest(request.args);
    }
    if (request.operation === "add_item_effects") {
      validateItemEffects(request.args);
    }
    socket.send(JSON.stringify({
      type: "response", id: request.id, worldId: request.worldId, userId: request.userId,
      result: request.operation === "create_npc_actor"
        ? { uuid: "Actor.npc", name: request.args.name, folder: request.args.folder, type: "NPC" }
        : request.operation === "create_item"
          ? { uuid: "Item.hammer", name: request.args.name, folder: request.args.folder, type: request.args.type }
          : request.operation === "create_feat"
            ? { uuid: request.args.actorUuid ? `${request.args.actorUuid}.Item.feat` : "Item.feat", name: request.args.name, level: request.args.level }
            : request.operation === "add_item_effects"
              ? { status: "cancelled", items: request.args.items }
              : { world: { id: "test-world" }, readOnly: false }
    }));
  });
  const result = await client.callTool({ name: "get_session", arguments: {} });
  assert.deepEqual(JSON.parse(result.content[0].text), { world: { id: "test-world" }, readOnly: false });
  const npc = JSON.parse(await readFile(new URL("fixtures/shadow-troll.json", import.meta.url), "utf8"));
  const created = await client.callTool({ name: "create_npc_actor", arguments: npc });
  assert.deepEqual(JSON.parse(created.content[0].text), { uuid: "Actor.npc", name: "Shadow Troll", folder: "Monsters", type: "NPC" });
  const hammer = JSON.parse(await readFile(new URL("fixtures/hammer-of-the-lost-riders.json", import.meta.url), "utf8"));
  const item = await client.callTool({ name: "create_item", arguments: hammer });
  assert.deepEqual(JSON.parse(item.content[0].text), { uuid: "Item.hammer", name: hammer.name, folder: "Magic Items", type: "weapon" });
  const feat = { requestId: "stdio-feat-request", name: "Steady Aim", level: 4, text: "Focus.", description: "<p>Benefit.</p>" };
  const worldFeat = await client.callTool({ name: "create_feat", arguments: feat });
  assert.deepEqual(JSON.parse(worldFeat.content[0].text), { uuid: "Item.feat", name: "Steady Aim", level: 4 });
  const pcFeat = await client.callTool({ name: "create_feat", arguments: { ...feat, requestId: "stdio-pc-feat-request", actorUuid: "Actor.pc" } });
  assert.deepEqual(JSON.parse(pcFeat.content[0].text), { uuid: "Actor.pc.Item.feat", name: "Steady Aim", level: 4 });
  const effects = { items: [{ uuid: "Item.hammer", notes: "Triggered concealment requires manual handling.", effects: [] }] };
  const reviewed = await client.callTool({ name: "add_item_effects", arguments: effects });
  assert.deepEqual(JSON.parse(reviewed.content[0].text), { status: "cancelled", items: effects.items });
  const closed = once(socket, "close");
  await client.close();
  await closed;
});
