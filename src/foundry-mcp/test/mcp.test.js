import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../server/mcp.js";

test("MCP handshake exposes reads and NPC creation, validates arguments, and reports offline errors", async t => {
  const calls = [];
  const server = createMcpServer({ request: async (operation, args) => {
    calls.push({ operation, args });
    if (operation === "get_session") {
      throw new Error("No GM session connected.");
    }
    return { entries: [] };
  } });
  const client = new Client({ name: "test", version: "1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ["get_session", "list_documents", "get_document", "list_compendiums", "list_compendium_documents", "create_npc_actor"]);
  assert.ok(tools.filter(tool => tool.name !== "create_npc_actor").every(tool => tool.annotations.readOnlyHint));
  assert.equal(tools.at(-1).annotations.readOnlyHint, false);
  assert.equal(tools.at(-1).annotations.idempotentHint, true);
  const offline = await client.callTool({ name: "get_session", arguments: {} });
  assert.equal(offline.isError, true);
  await client.callTool({ name: "list_documents", arguments: { documentType: "Actor", limit: 10 } });
  assert.equal(calls.at(-1).args.documentType, "Actor");
  const before = calls.length;
  const invalid = await client.callTool({ name: "list_documents", arguments: { documentType: "Actor", limit: 1000 } });
  assert.equal(invalid.isError, true);
  const unknown = await client.callTool({ name: "execute_macro", arguments: {} });
  assert.equal(unknown.isError, true);
  assert.equal(calls.length, before);
  const args = { name: "Troll", requestId: "test-npc-request", folder: "Monsters/Trolls", system: { details: { level: 12 } }, items: [] };
  assert.notEqual((await client.callTool({ name: "create_npc_actor", arguments: args })).isError, true);
  assert.equal(calls.at(-1).operation, "create_npc_actor");
  const count = calls.length;
  for (const invalidArgs of [
    { ...args, system: { macro: "execute()" } },
    { ...args, folder: undefined },
    { ...args, folder: "  " },
    { ...args, items: [{ name: "Macro", type: "weapon", system: {} }] },
    { ...args, items: [{ name: "Power", type: "power", system: { macro: { command: "execute()" } } }] }
  ]) {
    assert.equal((await client.callTool({ name: "create_npc_actor", arguments: invalidArgs })).isError, true);
  }
  assert.equal(calls.length, count);
});
