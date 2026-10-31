import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { CREATION_OPERATIONS, WRITE_OPERATIONS, DEFAULT_PORT, EDIT_CONFIRM_TIMEOUT_MS, EFFECT_CONFIRM_TIMEOUT_MS, MAX_MESSAGE_BYTES, OPERATIONS, PROTOCOL_VERSION } from "../shared/protocol.js";

/**
 * Token-authenticated loopback transport to exactly one opted-in GM tab.
 */
export class FoundryBridge {
  /**
   * Configure the pairing secret, expected browser origin, and request deadline.
   */
  constructor({ token, origin, port = DEFAULT_PORT, timeoutMs = 15000 }) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
      throw new Error("FOUNDRY_MCP_TOKEN must be a 64-character hex token.");
    }
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
      throw new Error("FOUNDRY_ORIGIN must be an exact HTTP(S) origin, without a path or trailing slash.");
    }
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error("Invalid bridge port.");
    }
    this.token = Buffer.from(token.toLowerCase(), "hex");
    this.origin = origin;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.session = null;
    this.browserSockets = new Set();
  }

  /**
   * Listen locally; verify browser origin and Host before upgrading to WebSocket.
   */
  async start({ broker } = {}) {
    this.http = createServer((_request, response) => {
      response.writeHead(404);
      response.end();
    });
    this.wss = new WebSocketServer({
      server: this.http, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false,
      verifyClient: ({ req, origin }) => req.headers.host === `127.0.0.1:${this.http.address()?.port}`
        && (req.url === "/bridge"
          ? origin === this.origin && this.browserSockets.size < 4
          : req.url === "/clients" && !!broker?.authorize(req))
    });
    // HTTP listen errors are also forwarded by ws. Handle both without an
    // unhandled error event when simultaneous starters race for the port.
    this.wss.on("error", () => {});
    this.wss.on("connection", (socket, request) => {
      if (request.url === "/clients") {
        broker.accept(socket);
      } else {
        this.accept(socket);
      }
    });
    await new Promise((resolve, reject) => {
      this.http.once("error", reject);
      this.http.listen(this.port, "127.0.0.1", resolve);
    });
    this.port = this.http.address().port;
    this.heartbeat = setInterval(() => {
      for (const socket of this.wss.clients) {
        if (!socket.alive) {
          socket.terminate();
          continue;
        }
        socket.alive = false;
        socket.ping();
      }
    }, 10000);
    this.heartbeat.unref();
  }

  /**
   * Authenticate before accepting results; never replace an existing GM session.
   */
  accept(socket) {
    this.browserSockets.add(socket);
    socket.alive = true;
    socket.on("pong", () => { socket.alive = true; });
    const deadline = setTimeout(() => socket.terminate(), 5000);
    socket.on("error", () => socket.terminate());
    socket.on("message", (bytes, binary) => {
      try {
        if (binary) {
          throw new Error("Text messages required.");
        }
        const message = JSON.parse(bytes.toString());
        if (this.session?.socket !== socket) {
          if (message?.type !== "hello" || message.version !== PROTOCOL_VERSION || this.session
            || typeof message.token !== "string" || !/^[a-f0-9]{64}$/i.test(message.token)
            || !timingSafeEqual(Buffer.from(message.token, "hex"), this.token)
            || typeof message.worldId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(message.worldId)
            || typeof message.userId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(message.userId)) {
            throw new Error("Pairing rejected.");
          }
          this.session = { socket, worldId: message.worldId, userId: message.userId };
          clearTimeout(deadline);
          socket.send(JSON.stringify({ type: "paired", version: PROTOCOL_VERSION }));
          return;
        }
        if (message?.type !== "response" || message.worldId !== this.session.worldId || message.userId !== this.session.userId) {
          throw new Error("Session mismatch.");
        }
        const pending = this.pending.get(message.id);
        if (!pending) {
          return;
        }
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (typeof message.error === "string") {
          pending.reject(new Error(CREATION_OPERATIONS.includes(pending.operation)
            ? "Creation or import unavailable or rejected. Check GM access, DnD4e 0.9.3, destination actor/folder, required compendium packs and source data. If the outcome is uncertain, retry identical data with the same requestId."
            : pending.operation === "add_item_effects"
              ? "Item effects rejected. Check the paired active GM, Item UUIDs, DnD4e 0.9.3 and effect data. Inspect source before retrying with the same stable effect keys."
            : pending.operation === "edit_target_automation"
              ? "Automation change rejected. Check the paired active GM, display module, world actors/powers and supported fields. Read source before retrying."
            : ["edit_pc_actor", "edit_pc_powers", "set_pc_basic_attack_ability"].includes(pending.operation)
              ? "PC change rejected. Check the paired active GM, world PC and supported fields/powers. Read source before retrying."
            : pending.operation === "edit_merchant_inventory"
              ? "Merchant inventory edit rejected. Check Item Piles, world NPC merchant and Item selections. Read inventory before retrying identical operations with the same requestId."
            : pending.operation === "add_elevation_regions"
              ? "Elevation regions rejected. Requires Foundry v14+, active Scene Elevation Region and the paired active GM. Inspect scene regions before retrying identical data/requestId."
            : pending.operation === "edit_scene_regions"
              ? "Scene region edit rejected. Check the paired active GM, world Scene, Region IDs, Scene Elevation Region for elevation edits and stale scene changes. Read scene regions before retrying identical arguments."
            : pending.operation === "add_scene_drawings"
              ? "Scene drawings rejected. Check the paired active GM, world Scene, rectangle data and stale scene changes. Read drawings before retrying identical data with the same requestId."
            : pending.operation === "edit_journal_pages"
              ? "Journal page edit rejected. Read journal source before retrying identical arguments; confirmed changes may have saved."
            : pending.operation === "edit_npc_actor"
              ? "NPC edit rejected. Check the paired active GM, world NPC UUID, DnD4e 0.9.3 and source data. Read the NPC before retrying an uncertain result."
              : "Foundry rejected the read. Check GM access, UUID, arguments, and result size."));
        } else if (Object.hasOwn(message, "result")) {
          pending.resolve(message.result);
        } else {
          pending.reject(new Error("Invalid read response."));
        }
      } catch {
        socket.terminate();
      }
    });
    socket.on("close", () => {
      this.browserSockets.delete(socket);
      clearTimeout(deadline);
      if (this.session?.socket === socket) {
        this.session = null;
        this.rejectPending("The paired GM session disconnected.");
      }
    });
  }

  /**
   * Send a bounded request with session identity and a correlation ID.
   */
  async request(operation, args = {}) {
    if (!OPERATIONS.includes(operation)) {
      throw new Error("Unsupported operation.");
    }
    const session = this.session;
    if (!session || session.socket.readyState !== WebSocket.OPEN) {
      throw new Error("No GM session connected. Open Foundry and enable the paired MCP bridge.");
    }
    if (this.pending.size >= 8) {
      throw new Error("Too many pending requests.");
    }
    const id = randomUUID();
    const message = JSON.stringify({ type: "request", id, operation, args, worldId: session.worldId, userId: session.userId });
    if (Buffer.byteLength(message) > (WRITE_OPERATIONS.includes(operation) ? MAX_MESSAGE_BYTES / 2 : 16384)) {
      throw new Error("Request is too large.");
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(CREATION_OPERATIONS.includes(operation)
          ? "Creation timed out; it may have succeeded. Retry identical data with the same requestId."
          : operation === "add_item_effects"
            ? "Effect batch timed out. Inspect Item source before retrying with the same stable effect keys; confirmed effects may have saved."
          : ["edit_pc_actor", "edit_pc_powers", "set_pc_basic_attack_ability"].includes(operation)
            ? "PC change timed out. Read PC source before retrying; confirmed changes may have saved."
          : operation === "edit_merchant_inventory"
            ? "Merchant edit timed out. Read inventory before retrying identical operations with the same requestId; confirmed changes may have saved."
          : operation === "add_elevation_regions"
            ? "Elevation region creation timed out; confirmed regions may have saved. Read scene regions before retrying identical data/requestId."
          : operation === "edit_scene_regions"
            ? "Scene region edit timed out; confirmed changes may have saved. Read scene regions before retrying identical arguments."
          : operation === "add_scene_drawings"
            ? "Scene drawing creation timed out. Read scene drawings before retrying identical data with the same requestId; confirmed drawings may have saved."
          : operation === "edit_journal_pages"
            ? "Journal page edit timed out. Read journal source before retrying identical arguments; confirmed changes may have saved."
          : operation === "edit_target_automation"
            ? "Automation edit timed out. Read actor and power source before retrying; confirmed changes may have saved."
          : operation === "edit_npc_actor"
            ? "NPC edit timed out. Inspect the NPC source before retrying; confirmed changes may have saved."
            : "Foundry read timed out. Check the GM browser tab."));
      }, operation === "add_item_effects" ? Math.max(this.timeoutMs, EFFECT_CONFIRM_TIMEOUT_MS + 30000)
        : ["edit_target_automation", "edit_journal_pages", "edit_npc_actor", "edit_pc_actor", "edit_pc_powers", "set_pc_basic_attack_ability", "edit_merchant_inventory", "add_scene_drawings", "add_elevation_regions", "edit_scene_regions"].includes(operation) ? Math.max(this.timeoutMs, EDIT_CONFIRM_TIMEOUT_MS + 30000) : this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer, operation });
      session.socket.send(message, error => {
        if (error && this.pending.has(id)) {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(new Error("Could not send the read request."));
        }
      });
    });
  }

  /**
   * Settle all callers when their GM connection is lost.
   */
  rejectPending(message) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(CREATION_OPERATIONS.includes(pending.operation)
        ? `${message} Creation may have succeeded; retry identical data with the same requestId.`
        : pending.operation === "add_item_effects"
          ? `${message} Confirmed effects may have saved; read Item source before retrying with the same stable keys.`
        : pending.operation === "edit_target_automation"
            ? `${message} A confirmed automation change may have saved; read actor and power source before retrying.`
          : ["edit_pc_actor", "edit_pc_powers", "set_pc_basic_attack_ability"].includes(pending.operation)
          ? `${message} A confirmed PC ${pending.operation === "edit_pc_actor" ? "actor" : pending.operation === "edit_pc_powers" ? "power" : "basic attack"} change may have saved; read PC source before retrying.`
        : pending.operation === "edit_merchant_inventory"
          ? `${message} Confirmed merchant changes may have saved; read inventory before retrying identical operations with the same requestId.`
        : pending.operation === "add_elevation_regions"
          ? `${message} Confirmed elevation regions may have saved; read scene regions before retrying identical data/requestId.`
        : pending.operation === "edit_scene_regions"
          ? `${message} Confirmed region changes may have saved; read scene regions before retrying identical arguments.`
        : pending.operation === "add_scene_drawings"
          ? `${message} Confirmed drawings may have saved; read scene drawings before retrying identical data with the same requestId.`
        : pending.operation === "edit_journal_pages"
              ? `${message} Confirmed journal page changes may have saved; read journal source before retrying identical arguments.`
            : pending.operation === "edit_npc_actor"
          ? `${message} A confirmed NPC edit may have saved; read its source before retrying.`
          : message));
    }
    this.pending.clear();
  }

  /**
   * Release sockets and timers on MCP shutdown.
   */
  async close() {
    clearInterval(this.heartbeat);
    this.rejectPending("MCP bridge shut down.");
    this.session = null;
    for (const socket of this.wss?.clients ?? []) {
      socket.terminate();
    }
    if (this.wss) {
      await new Promise(resolve => this.wss.close(resolve));
    }
    if (this.http?.listening) {
      await new Promise(resolve => this.http.close(resolve));
    }
  }
}
