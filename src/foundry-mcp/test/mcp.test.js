import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../server/mcp.js";

test("MCP handshake exposes only read tools, validates arguments, and reports offline errors", async t => {
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
  assert.deepEqual(tools.map(tool => tool.name), ["get_session", "list_documents", "get_document", "list_compendiums", "list_compendium_documents"]);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
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
});
