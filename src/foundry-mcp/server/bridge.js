import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { DEFAULT_PORT, MAX_MESSAGE_BYTES, OPERATIONS, PROTOCOL_VERSION } from "../shared/protocol.js";

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
  }

  /**
   * Listen locally; verify browser origin and Host before upgrading to WebSocket.
   */
  async start() {
    this.http = createServer((_request, response) => {
      response.writeHead(404);
      response.end();
    });
    this.wss = new WebSocketServer({
      server: this.http, path: "/bridge", maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false,
      verifyClient: ({ req, origin }) => origin === this.origin
        && req.headers.host === `127.0.0.1:${this.http.address()?.port}`
        && this.wss.clients.size < 4
    });
    this.wss.on("connection", socket => this.accept(socket));
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
          pending.reject(new Error(pending.operation === "create_npc_actor"
            ? "NPC creation unavailable or rejected. Check GM access, DnD4e 0.9.3, Actor folder and source data. If the outcome is uncertain, retry identical data with the same requestId."
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
    if (Buffer.byteLength(message) > (operation === "create_npc_actor" ? MAX_MESSAGE_BYTES / 2 : 16384)) {
      throw new Error("Request is too large.");
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(operation === "create_npc_actor"
          ? "NPC creation timed out; it may have succeeded. Retry identical data with the same requestId."
          : "Foundry read timed out. Check the GM browser tab."));
      }, this.timeoutMs);
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
      pending.reject(new Error(pending.operation === "create_npc_actor"
        ? `${message} NPC creation may have succeeded; retry identical data with the same requestId.`
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
