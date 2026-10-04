# Foundry MCP

Connects a local MCP client to one explicitly enabled, logged-in GM browser tab:

```text
Codex Desktop <-- MCP / stdio --> Node companion <-- loopback WebSocket --> GM tab
```

Requires Node.js 22+ and Foundry 13+. Reads preserve the installed system's fields. NPC/Item creation and NPC editing target DnD4e **0.9.3** only. Live Foundry compatibility needs manual verification by the user.

## Setup for Codex Desktop on Windows

1. From the repository root, install companion dependencies with `npm install --prefix src/foundry-mcp`. Run `npm --prefix src/foundry-mcp run generate-token` and copy the generated 64-character hex token. Keep the token private.
2. Add the configuration below to your Codex MCP settings (`%USERPROFILE%\.codex\config.toml`). Replace the repository path, token, and origin as appropriate. `FOUNDRY_ORIGIN` is the exact origin in the GM browser address bar: scheme, hostname and port, without a path or trailing slash. `http://localhost:30000` and `http://127.0.0.1:30000` are different origins.
3. Restart the MCP connection in Codex. Codex starts the Node process; you do not need to run `npm start` separately. Only one companion process can use a given port.
4. Copy the module with `npm run copy-module -- foundry-mcp`, enable **Foundry MCP** in your world, and reload Foundry as the GM. In Configure Settings, enter the same pairing token and bridge port, then enable the MCP bridge. This permits document reads, creation of new NPCs with powers/traits and world Items, and active GM confirmed edits to existing NPCs. Settings are client scoped; opt in only in the GM tab you intend to share.
5. Ask Codex to call `get_session`, then list actors and read an actor UUID. Confirm the reported world and GM match your session.

```toml
[mcp_servers.foundry]
command = "node"
args = ['C:\Users\Imre\Documents\Workspace\Foundry Mono Repo 4e\src\foundry-mcp\server\main.js']
startup_timeout_sec = 15
tool_timeout_sec = 120

[mcp_servers.foundry.env]
FOUNDRY_MCP_TOKEN = "PASTE_GENERATED_TOKEN_HERE"
FOUNDRY_ORIGIN = "http://localhost:30000"
FOUNDRY_MCP_PORT = "17890"
```

Use the server from the repo: the module-copy command excludes `node_modules`, so the Foundry copy is not the companion's dependency installation. If `node` is unavailable to Codex, use its absolute executable path.

The GM tab must remain open and connected. Reloading disconnects pending requests; while **Enable MCP bridge connection** is checked, the browser retries the connection every five seconds. If the companion server is off, Chrome reports each refused attempt in its console. Uncheck that setting in **Configure Settings → Module Settings → Foundry MCP** to stop the attempts immediately; check it again when the companion is running. Losing the GM role also prevents subsequent operations and result delivery. A creation already sent to Foundry may still complete. The browser console logs successful pairing; inspect status with `game.modules.get("foundry-mcp").api.getStatus()` (no token is returned). The bridge uses protocol v4: restart the companion/MCP connection and reload Foundry together when upgrading.

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

## NPC creation from stat blocks

`create_npc_actor` creates a new world Actor of type `NPC`, including embedded `power` and `feature` items, through one awaited `Actor.create`. Supply `name`, a required destination `folder`, a unique `requestId`, nested source `system` data, and optional `items`/`img`. The folder accepts a unique Actor folder name, a full path such as `Monsters/Trolls`, or an existing world Actor folder ID. Missing folders and parents are created automatically; matching folders are reused. Ambiguous names/paths are rejected; use discovery tools to choose a full path or ID. Non-Actor and compendium folder IDs are rejected. Folder creation is serialized so concurrent NPC requests share newly created folders. If actor creation fails after folder creation, the folders remain available for retry.

Paste a stat-block image and specify the destination folder in your request, e.g. "Create this Shadow Troll in Monsters/Trolls." The assistant asks for a folder if it is missing. It transcribes the image and maps it using the repository's [NPC actor skill](../../.agents/skills/dnd4e-npc-actors/SKILL.md), based on the pinned system source. The [Shadow Troll example](test/fixtures/shadow-troll.json) includes all stats, a regeneration trait and four powers. Its folder and request ID are examples. Conditional mechanics and compound attacks remain descriptive rules for manual use; no effects or macros are generated. An image of a stat block is not used as the actor portrait.

The tool's nested schema lists supported source fields and rejects others at both ends. Simple NPC math is enforced: printed defenses/initiative/skills go in `.base`, HP in `attributes.hp.value` and `.max`, resistances in `.res`. Tier and unlinked hostile prototype-token dimensions derive from level/size. Source data differs from prepared totals; use `get_document` on the resulting actor UUID to verify them.

Keep the same request ID and identical data when retrying after an uncertain timeout/disconnection. The actor stores a fingerprint so retries return its original UUID, including across browser reloads. Reusing an ID with changed data is rejected. A new ID requests a separate NPC, even with the same name. If an actor is manually deleted, its persisted retry receipt is also deleted. Creation never updates existing actors; use the separate confirmed NPC editing tool for changes.

## World Item creation

`create_item` creates one new world `weapon`, `equipment`, `power` or `feature` in DnD4e **0.9.3**. Supply `name`, `type`, a required Item `folder`, a unique `requestId`, nested source `system` data and optional `img`. Folder selectors accept a unique Item folder name, full slash-separated path or existing Item folder ID; missing folders/parents are created, while ambiguous names and Actor/compendium folder IDs are rejected. Creation uses one awaited `Item.create` and never changes an existing Item.

The type-specific nested schema is enforced by both MCP and the paired GM browser. Caller-supplied IDs, flags, effects, macros, container links and item-granting links are excluded. Retry the identical payload with the same request ID after an uncertain result; a persistent fingerprint returns the existing Item UUID across browser reloads. A changed payload under that ID is rejected, and a fresh ID creates an intentional new copy. Missing-folder creation may remain if Item creation fails.

Use the pinned system's [weapon schema](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/item/weapon.mjs) and [equipment schema](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/item/equipment.mjs). `system.description.chat` is the sheet's Flavor Text field used by Automatic Chat Cards. Item descriptions preserve conditional rules; no automated auras, conditions or encounter counters are created.

The [Hammer of the Lost Riders fixture](test/fixtures/hammer-of-the-lost-riders.json) is the level 16 **+4 warhammer**, priced at 45,000 gp. Native fields provide its enhancement, base warhammer damage and 4d6 cold critical bonus. `critDamageForm: "0"` replaces the default enhancement-d6 bonus, with typed cold dice supplied once through `damageCrit.parts`. Its self-stun/blind critical rider and encounter-dependent cold burst/concealment remain in the description for manual adjudication. Preserve the fixture's request ID when retrying this specific creation, and verify the returned UUID with `get_document`.

Protocol **v4** requires restarting the companion/MCP connection and reloading Foundry together. Confirm `get_session.itemCreation` before calling the new tool. Manual verification by the user: create in Magic Items, check the sheet's level/enhancement/price, base warhammer and critical fields, then retry the same payload and confirm there is one Item. Existing world Item edits remain unavailable.

## NPC editing with GM confirmation

`edit_npc_actor` edits an existing world NPC in DnD4e **0.9.3**. Read its stored data with `get_document` and `source: true` first. Supply its `uuid` and partial `name`, `img` or nested `system` data. Optional `items` patches require an existing embedded item `id` and matching `type` (`power` or `feature`), plus partial `name`, `img` or `system`. Omitted fields remain unchanged; supplied arrays replace the whole array. This operation does not add or delete items, move folders, or adjust prototype tokens automatically.

On a power patch, `hitMark: true` adds a native on-hit Marked effect template, ending at the end of the source actor's next turn. It uses `statuses: ["mark"]`, `system.powerEffectType: "hit"`, `system.durationType: "endOfUserTurn"`, and a source-evaluated `system.marker` change. This matches the pinned [attack workflow](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/helpers/dice.mjs) and [effect application](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/utils/utils.mjs). The system's **Automatically Apply Effects** setting must be enabled and the attack must target a token for automatic hit/miss application. No world setting is changed by the MCP. Custom attack workflows need their own support for native hit effects. The managed template is reused on retry and existing effects are preserved. Removing or modifying arbitrary effects, caller-supplied effect data and macros remain unavailable.

Every request with changes opens a popup on the paired **active GM's** screen with the generated before/after summary and **Confirm changes** and **Cancel** buttons. Pair the active GM's tab; other GMs cannot approve edits. The summary includes all changed fields, including descriptions displayed as plain text. No writes occur until confirmation. Cancel, closing the popup, or its 60-second expiry leaves the NPC unchanged. Requests without changes return `unchanged` immediately. Set the MCP client's tool timeout to at least 120 seconds, as in the setup example.

After approval, the module rechecks GM identity/role, bridge enablement, connection, system version and document source. Intervening manual edits or deleted documents require a fresh request. Embedded item changes and actor changes use separate awaited Foundry operations; a failure can leave partial changes. The response reports `updated`, `cancelled`, `unchanged`, or `incomplete`, with a field summary and known saved fields for incomplete results. After timeout, disconnection or an incomplete result, read the actor again before retrying. Repeating identical already-saved patches returns `unchanged`. Confirmation is required again for any remaining changes.

Editing uses protocol **v4**. Restart the companion/MCP connection and reload Foundry together when installing this change; older clients cannot pair.

Other document updates/deletions, macro execution, explicit dice rolls, chat posts, compendium imports and arbitrary script calls are unavailable. Caller-supplied actor IDs, flags, effects, item macros and item-granting data are excluded; item IDs only select existing NPC powers/features for editing. GM-visible gameplay content, including secrets and private chat supplied to that GM, can be returned. User documents expose safe identity fields only; account credentials, arbitrary settings values, server files and DOM/runtime inspection are excluded. Reading compendiums can populate Foundry's in-memory caches.

MCP annotations distinguish reads from NPC/Item creation and NPC editing; the fixed operation allowlist and nested source schemas enforce the boundary. Read requests are limited to 16 KiB, creation/edit requests to 2 MiB, and responses to 4 MiB. The transport uses an independent random pairing token, exact browser-origin and Host checks, a loopback listener and one paired session. The companion trusts the token-holding module to enforce the GM role; it does not independently authenticate to the Foundry server. A process that obtains the token is within that trust boundary.

## Verification

Run `npm --prefix src/foundry-mcp test`. Automated tests use document doubles and local transports, without operating Foundry.

Manual verification by the user: restart the MCP connection, reload Foundry and check the browser console. Pair the intended GM and test discovery/reads, then create the Shadow Troll in a chosen test Actor folder. Verify HP 228/bloodied 114, all defenses 24, initiative +10, Perception +13, speed/climb 8, necrotic resistance 10, saves +2, one action point, a 2x2 prototype token, languages and all five items. Test attack/damage buttons (+15 vs Reflex with 4d6+12; +17 vs AC with 8d6+24). Retry identical data under the same ID and confirm no second actor. Disable the bridge and confirm requests fail; check a non-GM cannot serve reads or create NPCs.

Protocol/setup references: [MCP SDK server guide](https://ts.sdk.modelcontextprotocol.io/server), [official Codex MCP configuration](https://developers.openai.com/codex/mcp/), [Foundry v13 API](https://foundryvtt.com/api/v13/).

Manual NPC edit verification by the user: request an HP and power-formula change on a test NPC. Verify the popup lists old/new values and that the sheet remains unchanged before confirmation. Cancel and close separate requests, then confirm another request and inspect the actor and power. Leave a popup unanswered to check expiry. Change the NPC manually while a popup is open and confirm that it requires a fresh request. Verify a PC and a non-active GM cannot edit. Check the browser console after reload.
