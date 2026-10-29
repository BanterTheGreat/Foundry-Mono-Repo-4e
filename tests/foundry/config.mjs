import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const localPath = new URL("./config.local.json", import.meta.url);
const local = existsSync(localPath) ? JSON.parse(readFileSync(localPath, "utf8")) : {};

export const settings = {
  url: process.env.FOUNDRY_URL || local.url || "http://localhost:30000",
  worldId: process.env.FOUNDRY_WORLD_ID || local.worldId,
  userName: process.env.FOUNDRY_USER || local.userName,
  playerName: process.env.FOUNDRY_PLAYER || local.playerName || "Player",
};
export const authPath = fileURLToPath(new URL("./.auth/gm.json", import.meta.url));

/** Require an explicit target rather than guessing which loaded world may be mutated. */
export function requireTarget() {
  if (!settings.worldId) {
    throw new Error("Set FOUNDRY_WORLD_ID or tests/foundry/config.local.json worldId. See tests/foundry/README.md.");
  }
  const url = new URL(settings.url);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("FOUNDRY_URL must be an HTTP(S) URL.");
  }
}
