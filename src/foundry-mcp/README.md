# Foundry MCP (Read Only)

Connects a local MCP client to one explicitly enabled, logged-in GM browser tab:

```text
Codex Desktop <-- MCP / stdio --> Node companion <-- loopback WebSocket --> GM tab
```

Requires Node.js 22+ and Foundry 13+. Live Foundry compatibility still needs manual verification. Uses Foundry's document API and preserves the installed DnD4e system's fields rather than assuming a newer system schema.

## Setup for Codex Desktop on Windows

1. From the repository root, install companion dependencies with `npm install --prefix src/foundry-mcp`. Run `npm --prefix src/foundry-mcp run generate-token` and copy the generated 64-character hex token. Keep the token private.
2. Add the configuration below to your Codex MCP settings (`%USERPROFILE%\.codex\config.toml`). Replace the repository path, token, and origin as appropriate. `FOUNDRY_ORIGIN` is the exact origin in the GM browser address bar: scheme, hostname and port, without a path or trailing slash. `http://localhost:30000` and `http://127.0.0.1:30000` are different origins.
3. Restart the MCP connection in Codex. Codex starts the Node process; you do not need to run `npm start` separately. Only one companion process can use a given port.
4. Copy the module with `npm run copy-module -- foundry-mcp`, enable **Foundry MCP (Read Only)** in your world, and reload Foundry as the GM. In Configure Settings, enter the same pairing token and bridge port, then enable the read-only bridge. Settings are client scoped; opt in only in the GM tab you intend to share.
5. Ask Codex to call `get_session`, then list actors and read an actor UUID. Confirm the reported world and GM match your session.

```toml
[mcp_servers.foundry]
command = "node"
args = ['C:\Users\Imre\Documents\Workspace\Foundry Mono Repo 4e\src\foundry-mcp\server\main.js']
startup_timeout_sec = 15
tool_timeout_sec = 30

[mcp_servers.foundry.env]
FOUNDRY_MCP_TOKEN = "PASTE_GENERATED_TOKEN_HERE"
FOUNDRY_ORIGIN = "http://localhost:30000"
FOUNDRY_MCP_PORT = "17890"
```

Use the server from the repo: the module-copy command excludes `node_modules`, so the Foundry copy is not the companion's dependency installation. If `node` is unavailable to Codex, use its absolute executable path.

The GM tab must remain open and connected. Reloading disconnects pending reads; the browser retries the connection every five seconds. Disabling the bridge or losing the GM role prevents subsequent reads, including results of awaited reads. The browser console logs successful pairing; inspect status with `game.modules.get("foundry-mcp").api.getStatus()` (no token is returned).

Local HTTP Foundry is the initial setup target. A browser using HTTPS or a remote Foundry host may block its connection to the local `ws://` listener under browser mixed-content or local-network policies. That setup may need a trusted TLS bridge, which is not included in this version.

## Available reads

| Tool | Data |
| --- | --- |
| `get_session` | World and GM identity, Foundry/system versions, active scene/combat UUIDs, module metadata |
| `list_documents` | Paginated world document names and UUIDs, filtered by type/name |
| `get_document` | Full serialized world, embedded, or compendium document, optionally projected by field paths |
| `list_compendiums` | Accessible pack IDs and types |
| `list_compendium_documents` | Paginated pack index with UUIDs, without importing entries |

World types: Actor, Item, Scene, JournalEntry, ChatMessage, Combat, RollTable, Playlist, Macro, User, Folder, Cards. Embedded data includes actor items/effects, journal pages, tokens, walls, lights, combatants, sounds and table results. Use returned UUIDs rather than constructing them yourself. `get_document` defaults to prepared data (including derived system values); `source: true` returns stored data. `fields: ["system", "items", "effects"]` narrows large results; projected keys retain their requested dotted paths. Pagination limits are 1–100; each response is limited to 4 MiB. Name filtering is not full-text journal search.

Read-only means there are no document updates, creations/deletions, macro execution, dice rolls, chat posts, imports, or arbitrary script calls. GM-visible gameplay content, including secrets and private chat supplied to that GM, can be returned. User documents expose safe identity fields only; account credentials, arbitrary settings values, server files, and DOM/runtime inspection are excluded. It does not access other worlds or data unavailable to the connected browser session. Reading compendiums can populate Foundry's in-memory caches.

Read-only MCP annotations describe the tools; the fixed operation allowlist enforces the boundary in both processes. The transport uses an independent random pairing token, exact browser-origin and Host checks, a loopback listener, and one paired session at a time. The companion trusts the token-holding module to enforce the GM role; it does not independently authenticate to the Foundry server. A process that obtains the token is within that trust boundary.

## Verification

Run `npm --prefix src/foundry-mcp test`. Automated tests use document doubles and local transports, without operating Foundry.

Manual verification by the user: reload and check the browser console, pair the intended GM, list/read an actor, journal page, scene token and compendium entry, then disable the bridge and confirm reads fail. Check a non-GM login cannot serve reads. Confirm no documents/chat/combat change during these requests.

Protocol/setup references: [MCP SDK server guide](https://ts.sdk.modelcontextprotocol.io/server), [official Codex MCP configuration](https://developers.openai.com/codex/mcp/), [Foundry v13 API](https://foundryvtt.com/api/v13/).
