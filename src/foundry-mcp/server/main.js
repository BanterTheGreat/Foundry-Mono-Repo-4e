import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FoundryBridge } from "./bridge.js";
import { createMcpServer } from "./mcp.js";
import { DEFAULT_PORT } from "../shared/protocol.js";

let bridge;
let server;
let stopping = false;

/**
 * Close the loopback listener when the MCP client exits.
 */
async function stop() {
  if (stopping) {
    return;
  }
  stopping = true;
  await bridge?.close();
  await server?.close();
}

try {
  const port = Number(process.env.FOUNDRY_MCP_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Invalid bridge port.");
  }
  bridge = new FoundryBridge({
    token: process.env.FOUNDRY_MCP_TOKEN,
    origin: process.env.FOUNDRY_ORIGIN,
    port
  });
  server = createMcpServer(bridge);
  await bridge.start();
  await server.connect(new StdioServerTransport());
  server.server.onclose = stop;
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  // Stdout is reserved for the MCP protocol; no world data or tokens are logged.
  console.error(`Foundry MCP: read-only bridge listening on 127.0.0.1:${bridge.port}.`);
} catch {
  console.error("Foundry MCP could not start. Check configuration and whether the bridge port is already in use.");
  await stop();
  process.exitCode = 1;
}
