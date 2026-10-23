import { DEFAULT_PORT, PROTOCOL_VERSION } from "../shared/protocol.js";

export const COMPANION_VERSION = `1:${PROTOCOL_VERSION}`;

/**
 * Read the same pairing configuration in adapters and the shared process.
 */
export function companionConfig(env = process.env) {
  const port = Number(env.FOUNDRY_MCP_PORT ?? DEFAULT_PORT);
  const token = env.FOUNDRY_MCP_TOKEN;
  const origin = env.FOUNDRY_ORIGIN;
  const idleMs = Number(env.FOUNDRY_MCP_IDLE_MS ?? 30000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Invalid bridge port.");
  }
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    throw new Error("FOUNDRY_MCP_TOKEN must be a 64-character hex token.");
  }
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
    throw new Error("FOUNDRY_ORIGIN must be an exact HTTP(S) origin.");
  }
  if (!Number.isInteger(idleMs) || idleMs < 100 || idleMs > 300000) {
    throw new Error("FOUNDRY_MCP_IDLE_MS must be between 100 and 300000.");
  }
  return { port, token, origin, idleMs };
}
