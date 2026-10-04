import { DEFAULT_PORT, MODULE_ID, PROTOCOL_VERSION, MAX_MESSAGE_BYTES } from "../shared/protocol.js";
import { assertEnabledGM, executeRead } from "./read-api.js";
import { createNpc } from "./create-api.js";
import { createItem } from "./item-create-api.js";
import { editNpc } from "./edit-api.js";

let socket;
let retry;
let busy = false;
let status = "disabled";

/**
 * Expose connection status without disclosing the pairing token.
 */
function getStatus() {
  return { status, worldId: game.world?.id, userId: game.user?.id, readOnly: false, creation: "NPC and world Items", editing: "NPC with active GM confirmation" };
}

/**
 * Close the bridge and cancel any scheduled retry.
 */
function disconnect() {
  clearTimeout(retry);
  const previous = socket;
  socket = undefined;
  previous?.close();
  status = "disabled";
}

/**
 * Connect this explicitly enabled GM tab to the local companion server.
 */
function connect() {
  disconnect();
  try {
    assertEnabledGM(game);
  } catch {
    return;
  }
  const token = game.settings.get(MODULE_ID, "token");
  const port = game.settings.get(MODULE_ID, "port");
  if (!/^[a-f0-9]{64}$/i.test(token) || !Number.isInteger(port) || port < 1024 || port > 65535) {
    status = "configuration required";
    ui.notifications.warn("Foundry MCP: set a 64-character hex pairing token and valid bridge port.");
    return;
  }
  const worldId = game.world.id;
  const userId = game.user.id;
  let connection;
  try {
    connection = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
  } catch {
    status = "browser blocked connection";
    ui.notifications.warn("Foundry MCP: the browser blocked the local bridge connection. Check browser connection policies.");
    return;
  }
  socket = connection;
  status = "connecting";
  connection.addEventListener("open", () => {
    if (socket !== connection) {
      return;
    }
    connection.send(JSON.stringify({ type: "hello", version: PROTOCOL_VERSION, token, worldId, userId }));
  });
  connection.addEventListener("message", async event => {
    if (socket !== connection || typeof event.data !== "string" || event.data.length > MAX_MESSAGE_BYTES) {
      return;
    }
    let request;
    try {
      request = JSON.parse(event.data);
      if (request.type === "paired") {
        assertEnabledGM(game);
        status = "connected";
        console.info("Foundry MCP: bridge connected (reads, NPC/Item creation and confirmed NPC edits).", getStatus());
        return;
      }
      if (request.type !== "request" || typeof request.id !== "string") {
        return;
      }
      assertEnabledGM(game);
      if (game.world.id !== worldId || game.user.id !== userId || request.worldId !== worldId || request.userId !== userId) {
        throw new Error("GM session changed.");
      }
      if (busy) {
        throw new Error("Another request is in progress; retry shortly.");
      }
      busy = true;
      try {
        const result = request.operation === "create_npc_actor"
          ? await createNpc(request.args)
          : request.operation === "create_item"
            ? await createItem(request.args)
            : request.operation === "edit_npc_actor"
              ? await editNpc(request.args, { assertConnection: () => {
                if (socket !== connection || connection.readyState !== WebSocket.OPEN) {
                  throw new Error("MCP connection changed.");
                }
              } })
              : await executeRead(request.operation, request.args);
        assertEnabledGM(game);
        if (game.world.id !== worldId || game.user.id !== userId) {
          throw new Error("GM session changed.");
        }
        const response = JSON.stringify({ type: "response", id: request.id, worldId, userId, result });
        if (new TextEncoder().encode(response).length > MAX_MESSAGE_BYTES) {
          throw new Error("Result exceeds 4 MiB; request fewer document fields.");
        }
        if (socket === connection && connection.readyState === WebSocket.OPEN) {
          connection.send(response);
        }
      } finally {
        busy = false;
      }
    } catch (error) {
      if (request?.type === "request" && typeof request.id === "string" && socket === connection && connection.readyState === WebSocket.OPEN) {
        // Fixed errors prevent third-party document errors from disclosing sensitive data.
        connection.send(JSON.stringify({ type: "response", id: request.id, worldId, userId, error: "Request rejected or unavailable. For NPC or Item creation, retry identical data with the same request ID. For NPC edits, inspect source before retrying an uncertain result." }));
      }
      console.warn("Foundry MCP: a request was rejected.");
    }
  });
  connection.addEventListener("close", () => {
    if (socket !== connection) {
      return;
    }
    status = "disconnected";
    retry = setTimeout(connect, 5000);
  });
  connection.addEventListener("error", () => {
    if (socket === connection) {
      status = "connection failed";
    }
  });
}

Hooks.once("init", () => {
  for (const [key, definition] of Object.entries({
    enabled: { name: "Enable MCP bridge connection", hint: "Connect to and retry the local MCP bridge every five seconds while unavailable. Turn this off to stop connection attempts and browser-console connection errors. Enable only in the intended GM tab.", type: Boolean, default: false },
    token: { name: "MCP pairing token", hint: "Paste the 64-character hex token used by the companion server. This is stored for this browser client.", type: String, default: "" },
    port: { name: "Local MCP bridge port", hint: "Loopback WebSocket port used by the companion server.", type: Number, default: DEFAULT_PORT }
  })) {
    game.settings.register(MODULE_ID, key, {
      ...definition, scope: "client", config: true, restricted: true,
      onChange: () => {
        if (game.ready) {
          connect();
        }
      }
    });
  }
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = Object.freeze({ getStatus });
  game.socket.on("disconnect", disconnect);
  game.socket.on("connect", connect);
  connect();
});

Hooks.on("updateUser", user => {
  if (user.id === game.user?.id && !game.user.isGM) {
    disconnect();
  }
});

globalThis.addEventListener("beforeunload", disconnect);
