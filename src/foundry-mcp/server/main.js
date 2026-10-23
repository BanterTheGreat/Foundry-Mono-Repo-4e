import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CompanionClient } from "./companion-client.js";
import { companionConfig } from "./companion-config.js";
import { createMcpServer } from "./mcp.js";

let bridge;
let server;
let stopping = false;

/**
 * Release only this conversation's adapter when the MCP client exits.
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
  // The SDK's stdio transport does not close itself on stdin EOF. Register
  // before startup so abandoning an initializing session also releases it.
  process.stdin.once("end", stop);
  process.stdin.once("close", stop);
  bridge = new CompanionClient(companionConfig());
  server = createMcpServer(bridge);
  await bridge.start();
  if (stopping) {
    await bridge.close();
  } else {
    await server.connect(new StdioServerTransport());
    server.server.onclose = stop;
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    // Stdout is reserved for the MCP protocol; no world data or tokens are logged.
    console.error(`Foundry MCP: connected to shared companion on 127.0.0.1:${bridge.config.port}.`);
  }
} catch (error) {
  console.error(`Foundry MCP could not start: ${error.message}`);
  await stop();
  process.exitCode = 1;
}
