---
name: foundry-mcp
description: Module layout and read-only bridge boundaries for src/foundry-mcp. Use when reading or editing its Foundry client, companion MCP server, or transport tests.
---

# Foundry MCP

The module runs in an opted-in GM browser session. Its companion Node process serves MCP over stdio and connects to that browser through a token-authenticated loopback WebSocket. Foundry itself does not host the Node process.

Keep all Foundry document access in `scripts/read-api.js`, with a fixed operation allowlist shared through `shared/protocol.js`. Check the current GM role and bridge enablement before reads and after awaited reads. Return document data through Foundry serialization, preserving DnD4e 0.9.3 fields without assuming newer system APIs.

The read-only boundary is enforced by available operations, not MCP annotations. Expose data retrieval; document mutations, macro execution, rolls, script evaluation, arbitrary property traversal of runtime objects, and filesystem access are outside the authorized scope. User documents use an explicit safe field list. Settings values are excluded because other modules can store credentials there.

`scripts/main.js` registers client-scoped settings and owns connection/reconnection. `server/bridge.js` owns authentication, origin validation, a single paired GM session, request correlation, limits, and disconnect handling. `server/main.js` registers MCP tools using the official SDK. Pairing credentials stay outside tracked files and are never logged.

Run the module's `npm test` and syntax checks after changes. Tests use doubles and local transports; the user exclusively operates Foundry for live verification. Copy with the repository's copy-module command after changes intended for Foundry.
