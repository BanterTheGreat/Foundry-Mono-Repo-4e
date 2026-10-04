import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
    env: { ...process.env, FOUNDRY_MCP_TOKEN: token, FOUNDRY_ORIGIN: "http://localhost:30000", FOUNDRY_MCP_PORT: String(port) },
    stderr: "pipe"
  });
  const client = new Client({ name: "stdio-test", version: "1" });
  t.after(() => client.close());
  await client.connect(transport);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/bridge`, { origin: "http://localhost:30000" });
  t.after(() => socket.terminate());
  await once(socket, "open");
  const paired = once(socket, "message");
  socket.send(JSON.stringify({ type: "hello", version: 1, token, worldId: "test-world", userId: "test-gm" }));
  await paired;
  socket.on("message", bytes => {
    const request = JSON.parse(bytes);
    socket.send(JSON.stringify({
      type: "response", id: request.id, worldId: request.worldId, userId: request.userId,
      result: { world: { id: "test-world" }, readOnly: true }
    }));
  });
  const result = await client.callTool({ name: "get_session", arguments: {} });
  assert.deepEqual(JSON.parse(result.content[0].text), { world: { id: "test-world" }, readOnly: true });
  const closed = once(socket, "close");
  await client.close();
  await closed;
});
