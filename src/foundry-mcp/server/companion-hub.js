import { timingSafeEqual } from "node:crypto";
import { WebSocket } from "ws";
import { COMPANION_VERSION } from "./companion-config.js";
import { MAX_MESSAGE_BYTES } from "../shared/protocol.js";

/**
 * Multiplex authenticated MCP adapters through one paired Foundry bridge.
 */
export class CompanionHub {
  /**
   * Keep pairing credentials and idle shutdown local to this process.
   */
  constructor(bridge, { idleMs = 30000, onIdle }) {
    this.bridge = bridge;
    this.idleMs = idleMs;
    this.onIdle = onIdle;
    this.clients = new Set();
    this.inFlight = 0;
    this.queue = [];
  }

  /**
   * Reject browser callers, mismatched configuration, and excess adapters.
   */
  authorize(request) {
    const token = request.headers.authorization;
    return !request.headers.origin
      && request.headers["x-foundry-origin"] === this.bridge.origin
      && request.headers["x-foundry-companion"] === COMPANION_VERSION
      && typeof token === "string" && /^Bearer [a-f0-9]{64}$/i.test(token)
      && timingSafeEqual(Buffer.from(token.slice(7), "hex"), this.bridge.token)
      && this.clients.size < 32;
  }

  /**
   * Correlate each client's calls independently, including concurrent IDs.
   */
  accept(socket) {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.clients.add(socket);
    socket.alive = true;
    socket.on("pong", () => { socket.alive = true; });
    socket.on("error", () => socket.terminate());
    const pending = new Set();
    socket.on("message", async (bytes, binary) => {
      let id;
      try {
        if (binary) {
          throw new Error("Text messages required.");
        }
        const message = JSON.parse(bytes.toString());
        id = message.id;
        if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(id) || pending.has(id) || pending.size >= 8) {
          throw new Error("Invalid companion request.");
        }
        pending.add(id);
      } catch {
        socket.terminate();
        return;
      }
      this.inFlight++;
      try {
        const { operation, args } = JSON.parse(bytes.toString());
        const result = await this.dispatch(socket, operation, args);
        this.reply(socket, { id, result });
      } catch (error) {
        this.reply(socket, { id, error: error.message });
      } finally {
        pending.delete(id);
        this.inFlight--;
        this.scheduleIdle();
      }
    });
    socket.on("close", () => {
      this.clients.delete(socket);
      for (const entry of [...this.queue]) {
        if (entry.socket === socket) {
          this.removeQueued(entry, "MCP adapter disconnected before dispatch.");
        }
      }
      this.scheduleIdle();
    });
  }

  /**
   * Foundry handles one request at a time. Bound the queue and its wait so a
   * queued write cannot execute after its MCP caller has already timed out.
   */
  dispatch(socket, operation, args) {
    if (this.queue.length >= 7) {
      return Promise.reject(new Error("Shared companion busy. Request was not dispatched; retry shortly."));
    }
    return new Promise((resolve, reject) => {
      const entry = { socket, operation, args, session: this.bridge.session, resolve, reject };
      entry.timer = setTimeout(() => {
        this.removeQueued(entry, "Shared companion busy. Request expired before dispatch; retry shortly.");
      }, 15000);
      this.queue.push(entry);
      this.drain();
    });
  }

  /**
   * Remove an undispatched request without replaying it in another GM session.
   */
  removeQueued(entry, message) {
    const index = this.queue.indexOf(entry);
    if (index >= 0) {
      this.queue.splice(index, 1);
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
  }

  /**
   * Preserve the original GM identity while serializing cross-session calls.
   */
  async drain() {
    if (this.active || this.closed || !this.queue.length) {
      return;
    }
    this.active = true;
    const entry = this.queue.shift();
    clearTimeout(entry.timer);
    try {
      if (entry.socket.readyState !== WebSocket.OPEN || this.bridge.session !== entry.session) {
        throw new Error("MCP adapter or GM session changed before dispatch; read the current session before retrying.");
      }
      entry.resolve(await this.bridge.request(entry.operation, entry.args));
    } catch (error) {
      entry.reject(error);
    } finally {
      this.active = false;
      this.drain();
    }
  }

  /**
   * Send only to the originating adapter, with bounded response size.
   */
  reply(socket, message) {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    let payload = JSON.stringify(message);
    if (Buffer.byteLength(payload) > MAX_MESSAGE_BYTES) {
      payload = JSON.stringify({ id: message.id, error: "Companion response too large. Narrow the read; inspect source after uncertain writes." });
    }
    socket.send(payload, error => {
      if (error) {
        socket.terminate();
      }
    });
  }

  /**
   * Allow handover, and finish dispatched writes before retiring an idle hub.
   */
  scheduleIdle() {
    if (!this.closed && !this.clients.size && !this.inFlight && !this.idleTimer) {
      this.idleTimer = setTimeout(this.onIdle, this.idleMs);
    }
  }

  /**
   * Prevent idle callbacks while the bridge closes its sockets.
   */
  close() {
    this.closed = true;
    clearTimeout(this.idleTimer);
    for (const entry of [...this.queue]) {
      this.removeQueued(entry, "Shared companion closed before dispatch.");
    }
  }
}
