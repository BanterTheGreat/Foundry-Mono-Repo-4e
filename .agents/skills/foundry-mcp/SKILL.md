---
name: foundry-mcp
description: Module layout and bridge boundaries for src/foundry-mcp. Use when reading or editing its Foundry client, companion MCP server, or transport tests.
---

# Foundry MCP

The module runs in an opted-in GM browser session. Its companion Node process serves MCP over stdio and connects to that browser through a token-authenticated loopback WebSocket. Foundry itself does not host the Node process.

Keep document reads in `scripts/read-api.js` and new NPC creation in `scripts/create-api.js`, with a fixed operation allowlist shared through `shared/protocol.js`. Check the current GM role and bridge enablement before access and after awaited operations. Return document data through Foundry serialization, preserving DnD4e 0.9.3 fields without assuming newer system APIs.

The available operations enforce the boundary. The authorized write is creation of a new world `NPC` in an explicitly specified Actor folder, with embedded powers/features and a persisted request fingerprint for safe retries. The required `folder` argument accepts a name, full path or existing ID; create missing Actor folders and parents using awaited `Folder.create` calls. Serialize folder creation to avoid duplicates; reject ambiguous names/paths. Validate nested source data through `shared/npc-data.js` at both ends; exclude caller-supplied IDs, flags, effects, macros and item-granting data. Existing-document updates/deletions, macro execution, explicit rolls, script evaluation, arbitrary runtime traversal and filesystem access remain outside scope. User documents use an explicit safe field list. Settings values are excluded because other modules can store credentials there.

For NPC stat-block mappings, read [dnd4e-npc-actors](../dnd4e-npc-actors/SKILL.md). Protocol v2 separates this capability from older read-only clients; reload the module and restart the companion together.

`scripts/main.js` registers client-scoped settings and owns connection/reconnection. `server/bridge.js` owns authentication, origin validation, a single paired GM session, request correlation, limits, and disconnect handling. `server/main.js` registers MCP tools using the official SDK. Pairing credentials stay outside tracked files and are never logged.

Run the module's `npm test` and syntax checks after changes. Tests use doubles and local transports; the user exclusively operates Foundry for live verification. Copy with the repository's copy-module command after changes intended for Foundry.
