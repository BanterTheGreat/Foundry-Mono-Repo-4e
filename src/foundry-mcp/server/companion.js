import { FoundryBridge } from "./bridge.js";
import { CompanionHub } from "./companion-hub.js";
import { companionConfig } from "./companion-config.js";

let bridge;
let hub;
let stopping = false;

/**
 * Retire the shared listener only on shutdown or after the last adapter leaves.
 */
async function stop() {
  if (stopping) {
    return;
  }
  stopping = true;
  hub?.close();
  await bridge?.close();
}

try {
  const config = companionConfig();
  bridge = new FoundryBridge(config);
  hub = new CompanionHub(bridge, { idleMs: config.idleMs, onIdle: stop });
  await bridge.start({ broker: hub });
  hub.scheduleIdle();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (error) {
  // A concurrent starter may already own the port. Adapters connect to the
  // winner; never terminate or replace a listener belonging to another client.
  console.error(error.code === "EADDRINUSE"
    ? "Foundry MCP shared companion: port already owned."
    : "Foundry MCP shared companion could not start. Check configuration.");
  await stop();
  process.exitCode = 1;
}
