import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { COMPANION_VERSION } from "./companion-config.js";
import { MAX_MESSAGE_BYTES } from "../shared/protocol.js";

/**
 * Connect one stdio MCP session to the shared, authenticated companion.
 */
export class CompanionClient {
  /**
   * Retain configuration without exposing pairing credentials in diagnostics.
   */
  constructor(config) {
    this.config = config;
    this.pending = new Map();
  }

  /**
   * Reuse a live connection, or start a shared companion if the port is free.
   */
  async start() {
    if (this.closed) {
      throw new Error("MCP adapter closed.");
    }
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }
    if (!this.connecting) {
      this.connecting = this.connect().finally(() => { this.connecting = null; });
    }
    await this.connecting;
  }

  /**
   * Bound startup retries and let simultaneous starters converge on one owner.
   */
  async connect() {
    let launched = false;
    const deadline = Date.now() + 5000;
    while (!this.closed) {
      try {
        await this.openSocket();
        return;
      } catch (error) {
        if (this.closed) {
          throw new Error("MCP adapter closed.");
        }
        if (!["ECONNREFUSED", "ECONNRESET"].includes(error.code)) {
          throw new Error("Shared Foundry companion unavailable or rejected configuration. Check token, origin and version; stop any legacy companion before upgrading.");
        }
        if (Date.now() >= deadline) {
          throw new Error("Shared Foundry companion did not start. Check Node dependencies, configuration and bridge port.");
        }
        if (!launched) {
          const child = spawn(process.execPath, [fileURLToPath(new URL("./companion.js", import.meta.url))], {
            detached: true, windowsHide: true, stdio: "ignore",
            env: {
              ...process.env,
              FOUNDRY_MCP_TOKEN: this.config.token,
              FOUNDRY_ORIGIN: this.config.origin,
              FOUNDRY_MCP_PORT: String(this.config.port),
              FOUNDRY_MCP_IDLE_MS: String(this.config.idleMs ?? 30000)
            }
          });
          child.on("error", () => {});
          child.unref();
          launched = true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    throw new Error("MCP adapter closed.");
  }

  /**
   * Authenticate before sending any game requests to an existing listener.
   */
  async openSocket() {
    const { port, origin, token } = this.config;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/clients`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-foundry-origin": origin,
        "x-foundry-companion": COMPANION_VERSION
      },
      handshakeTimeout: 1000, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false
    });
    this.socket = socket;
    socket.on("error", () => {});
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    if (this.closed) {
      socket.terminate();
      throw new Error("MCP adapter closed.");
    }
    socket.on("message", bytes => {
      try {
        const message = JSON.parse(bytes.toString());
        const pending = this.pending.get(message.id);
        if (!pending || pending.socket !== socket) {
          return;
        }
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (typeof message.error === "string") {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.result);
        }
      } catch {
        socket.terminate();
      }
    });
    socket.on("close", () => {
      this.rejectPending("Shared Foundry companion disconnected. Dispatched writes may have saved; inspect source before retrying with the same request IDs/effect keys.", socket);
    });
  }

  /**
   * Forward once only; reconnecting must never replay an uncertain write.
   */
  async request(operation, args = {}) {
    await this.start();
    const socket = this.socket;
    if (this.closed || socket?.readyState !== WebSocket.OPEN) {
      throw new Error("MCP adapter disconnected before dispatch.");
    }
    if (this.pending.size >= 8) {
      throw new Error("Too many pending requests.");
    }
    const id = randomUUID();
    const payload = JSON.stringify({ id, operation, args });
    if (Buffer.byteLength(payload) > MAX_MESSAGE_BYTES / 2) {
      throw new Error("Request is too large.");
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Shared companion timed out. Dispatched writes may have saved; inspect source before retrying with the same request IDs/effect keys."));
      }, 180000);
      this.pending.set(id, { resolve, reject, timer, socket });
      socket.send(payload, error => {
        if (error) {
          socket.terminate();
        }
      });
    });
  }

  /**
   * Settle this adapter's callers without affecting any other conversation.
   */
  rejectPending(message, socket) {
    for (const [id, pending] of this.pending) {
      if (!socket || pending.socket === socket) {
        clearTimeout(pending.timer);
        pending.reject(new Error(message));
        this.pending.delete(id);
      }
    }
  }

  /**
   * Disconnect this session; the shared listener owns its separate idle grace.
   */
  close() {
    this.closed = true;
    this.socket?.terminate();
    this.rejectPending("MCP adapter closed. Dispatched writes may have saved; inspect source before retrying.");
  }
}
