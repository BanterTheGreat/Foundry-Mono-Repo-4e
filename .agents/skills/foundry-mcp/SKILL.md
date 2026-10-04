---
name: foundry-mcp
description: Module layout, bridge boundaries, and connection troubleshooting for src/foundry-mcp. Use when reading or editing its client/server/tests, or when Foundry MCP tools are missing or fail to connect.
---

# Foundry MCP

The module runs in an opted-in GM browser session. Its companion Node process serves MCP over stdio and connects to that browser through a token-authenticated loopback WebSocket. Foundry itself does not host the Node process.

## Connection troubleshooting

First attempt a normal MCP connection by discovering the Foundry tools and calling `get_session`. If it succeeds, verify the intended world and GM and continue the requested work. Check competing instances and port ownership only after that connection attempt fails, including when discovery exposes no Foundry tools. These checks are failure diagnostics, not routine preflight steps.

After a failed connection attempt, check for competing companion instances before suggesting repeated restarts or new chats. Only one companion can bind the configured bridge port (default `17890`). Codex Desktop and T3 Code can each launch a separate companion from the same MCP configuration; an enabled toggle confirms configuration, not a successful MCP handshake.

1. Inspect the MCP startup logs for `EADDRINUSE`, `address already in use`, and `handshaking with MCP server failed`. Check the configured port's listener, owning PID, command line, and parent process to identify which client owns it. On Windows, use `Get-NetTCPConnection -LocalPort <port> -State Listen` and `Get-CimInstance Win32_Process` for the owning PID and its parent. Treat access-denied results as inconclusive and request the required escalation; preserve errors instead of hiding them with `-ErrorAction SilentlyContinue`.
2. If instances compete, explain the port conflict and keep one intended MCP client running. Have the user fully close the competing client, then restart the intended client's MCP connection. Recheck the listener and tool discovery. Inspect only connection/process diagnostics; the user operates Foundry. Keep pairing tokens and other credentials redacted.
3. Confirm recovery with the exposed Foundry `get_session` tool and verify the intended world and GM. A listening port or established TCP connection alone does not prove that this conversation has a working MCP session. If startup succeeds but pairing fails, check token/origin/port consistency next, using the [module setup instructions](../../../src/foundry-mcp/README.md).

## Module boundaries

Keep document reads in `scripts/read-api.js` and new NPC creation in `scripts/create-api.js`, with a fixed operation allowlist shared through `shared/protocol.js`. Check the current GM role and bridge enablement before access and after awaited operations. Return document data through Foundry serialization, preserving DnD4e 0.9.3 fields without assuming newer system APIs.

The available operations enforce the boundary. The authorized write is creation of a new world `NPC` in an explicitly specified Actor folder, with embedded powers/features and a persisted request fingerprint for safe retries. The required `folder` argument accepts a name, full path or existing ID; create missing Actor folders and parents using awaited `Folder.create` calls. Serialize folder creation to avoid duplicates; reject ambiguous names/paths. Validate nested source data through `shared/npc-data.js` at both ends; exclude caller-supplied IDs, flags, effects, macros and item-granting data. Existing-document updates/deletions, macro execution, explicit rolls, script evaluation, arbitrary runtime traversal and filesystem access remain outside scope. User documents use an explicit safe field list. Settings values are excluded because other modules can store credentials there.

For NPC stat-block mappings, read [dnd4e-npc-actors](../dnd4e-npc-actors/SKILL.md). Protocol v2 separates this capability from older read-only clients; reload the module and restart the companion together.

`scripts/main.js` registers client-scoped settings and owns connection/reconnection. `server/bridge.js` owns authentication, origin validation, a single paired GM session, request correlation, limits, and disconnect handling. `server/main.js` registers MCP tools using the official SDK. Pairing credentials stay outside tracked files and are never logged.

Run the module's `npm test` and syntax checks after changes. Tests use doubles and local transports; the user exclusively operates Foundry for live verification. Copy with the repository's copy-module command after changes intended for Foundry.
