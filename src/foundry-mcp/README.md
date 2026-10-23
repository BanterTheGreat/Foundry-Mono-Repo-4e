# Foundry MCP

Connects local MCP conversations to one explicitly enabled, logged-in GM browser tab:

```text
MCP conversations <-- stdio --> per-session adapters
                                      |
                           authenticated loopback WebSocket
                                      |
                              shared companion <-- WebSocket --> GM tab
```

Requires Node.js 22+ and Foundry 13+. Reads preserve the installed system's fields. NPC/Item creation, PC setup/imports and NPC editing target DnD4e **0.9.3** only. Live Foundry compatibility needs manual verification by the user.

## Setup for Codex Desktop on Windows

1. From the repository root, install companion dependencies with `npm install --prefix src/foundry-mcp`. Run `npm --prefix src/foundry-mcp run generate-token` and copy the generated 64-character hex token. Keep the token private.
2. Add the configuration below to your Codex MCP settings (`%USERPROFILE%\.codex\config.toml`). Replace the repository path, token, and origin as appropriate. `FOUNDRY_ORIGIN` is the exact origin in the GM browser address bar: scheme, hostname and port, without a path or trailing slash. `http://localhost:30000` and `http://127.0.0.1:30000` are different origins.
3. Restart the MCP connection in Codex or T3. Each conversation starts a lightweight stdio adapter; the adapters automatically start or reuse one shared companion per bridge port. You do not need to run `npm start` separately. Use the same token, origin and port in every client sharing this GM connection.
4. Copy the module with `npm run copy-module -- foundry-mcp`, enable **Foundry MCP** in your world, and reload Foundry as the GM. In Configure Settings, enter the same pairing token and bridge port, then enable the MCP bridge. This permits document reads, creation of new NPCs with powers/traits and world Items, PC setup and power/feat imports, and active GM confirmed edits to existing NPCs. Settings are client scoped; opt in only in the GM tab you intend to share.
5. Ask Codex to call `get_session`, then list actors and read an actor UUID. Confirm the reported world and GM match your session.

```toml
[mcp_servers.foundry]
command = "node"
args = ['C:\Users\Imre\Documents\Workspace\Foundry Mono Repo 4e\src\foundry-mcp\server\main.js']
startup_timeout_sec = 15
tool_timeout_sec = 180

[mcp_servers.foundry.env]
FOUNDRY_MCP_TOKEN = "PASTE_GENERATED_TOKEN_HERE"
FOUNDRY_ORIGIN = "http://localhost:30000"
FOUNDRY_MCP_PORT = "17890"
```

Use the server from the repo: the module-copy command excludes `node_modules`, so the Foundry copy is not the companion's dependency installation. If `node` is unavailable to Codex, use its absolute executable path.

The GM tab must remain open and connected. Reloading disconnects pending requests; while **Enable MCP bridge connection** is checked, the browser retries the connection every five seconds. If the companion server is off, Chrome reports each refused attempt in its console. Uncheck that setting in **Configure Settings → Module Settings → Foundry MCP** to stop the attempts immediately; check it again when the companion is running. Losing the GM role also prevents subsequent operations and result delivery. A creation already sent to Foundry may still complete. The browser console logs successful pairing; inspect status with `game.modules.get("foundry-mcp").api.getStatus()` (no token is returned). The bridge uses protocol v27: restart the companion/MCP connection and reload Foundry together when upgrading.

Local HTTP Foundry is the initial setup target. A browser using HTTPS or a remote Foundry host may block its connection to the local `ws://` listener under browser mixed-content or local-network policies. That setup may need a trusted TLS bridge, which is not included in this version.

## Multiple conversations and companion lifecycle

T3 conversations and Codex Desktop can use the same bridge concurrently. Each adapter authenticates with the pairing token, expected Foundry origin and companion/browser protocol versions before forwarding requests. The shared companion still pairs with exactly one GM tab. Browser callers cannot use the adapter endpoint; browser pairing retains its exact origin, Host and token checks. Responses are routed only to the requesting adapter.

The Foundry client processes one request at a time, so the companion serializes calls from all conversations. It permits one active request and up to seven waiting requests. A queued request expires after 15 seconds without being dispatched; retry after the active request finishes. Disconnecting an adapter removes its queued calls, and queued requests cannot move to a different paired GM session. Once dispatched, writes may still finish if the caller leaves; inspect source and reuse the same request IDs/effect keys after uncertain outcomes. Reconnection never automatically replays a request.

Closing a conversation's stdio input releases that adapter without disconnecting other conversations or the GM. The shared companion retires 30 seconds after its last adapter disconnects and all dispatched requests settle. A conversation opened during that grace period keeps the existing pairing; later conversations automatically start a fresh companion and the GM tab reconnects using its normal retry loop. Optional `FOUNDRY_MCP_IDLE_MS` changes the grace period (100–300000 milliseconds); the default needs no configuration. An app retaining an inactive conversation's adapter keeps the shared process alive, while other conversations can still connect.

**Upgrading from the previous companion:** fully restart T3 and any other MCP client retaining the old process once. The old process has no shared adapter endpoint and cannot be reused. The new adapter reports a configuration/legacy-companion error rather than terminating an existing listener. Keep the current `server/main.js` MCP command and pairing settings. Subsequent conversation changes require no app restart. The browser protocol remains v24.

If startup fails, inspect which process owns the configured port and check token/origin/version consistency. Multiple stdio adapters are expected; only the shared `server/companion.js` process owns the port. A `server/main.js` process owning it is the legacy implementation still running. A listening port alone does not prove the current conversation is connected: verify with `get_session` from that conversation.

## Scene drawings

Read an existing scene with `get_document`, `source: true` and `fields: ["name", "grid", "width", "height", "padding", "background", "walls", "drawings"]`. `get_session.activeSceneUuid` identifies the active scene; `list_documents` with `documentType: "Scene"` discovers other scenes. The `drawings` array includes every serialized drawing, including hidden drawings, with IDs, shape/position, text, style and hidden state. Read a single drawing using `Scene.SCENE_ID.Drawing.DRAWING_ID`. An empty array means no drawings. Image fields contain paths/settings, not image pixels.

`add_scene_drawings` adds native rectangles to an existing world Scene after the paired active GM reviews and confirms the complete batch (two minutes). Text is an optional plain label displayed within each rectangle. `hidden: true` hides both rectangle and label from players; the default is visible. Rectangles are annotations, not movement barriers or automated terrain rules.

```json
{
  "uuid": "Scene.SCENE_ID",
  "requestId": "terrain-rectangles-001",
  "summary": "Mark rubble as difficult terrain and add a hidden GM reminder.",
  "drawings": [
    { "x": 400, "y": 300, "width": 300, "height": 200,
      "text": "Difficult terrain", "hidden": false,
      "strokeColor": "#FFAA00", "fillColor": "#FFAA00", "fillAlpha": 0.15 },
    { "x": 800, "y": 300, "width": 200, "height": 100,
      "text": "Secret entrance", "hidden": true, "fontSize": 24 }
  ]
}
```

Positions are top-left **scene pixels including padding**; width/height are positive pixels. Read the grid size and scene placement before converting squares to pixels. Batch size is 1-100. Optional style fields are `strokeColor`, `strokeWidth` (0-100px), `strokeAlpha`, `fillColor`, `fillAlpha`, `fontSize` (1-512px) and `textColor`; colors use `#RRGGBB` and opacity uses 0-1. Defaults are white text/outline, transparent white fill, 4px stroke and 48px font. Text is limited to 2000 characters; choose a font size that fits the rectangle. The native drawing schema is documented in the [Foundry v13 DrawingData reference](https://foundryvtt.com/api/v13/interfaces/foundry.documents.types.DrawingData.html).

Existing drawings are preserved. This tool does not update or delete existing drawings or modify other scene data. Scene changes during review require a fresh read/review. Cancel, close and expiry save nothing. Results include `updated`, `unchanged`, `cancelled` or `incomplete`, plus known drawing IDs/UUIDs and original batch indexes. Creation is not atomic: after timeout, disconnect or incomplete results, read the scene and retry identical geometry/text/style with the same `requestId`. Persisted per-drawing markers skip saved additions and recover missing ones. Changed request data under an existing marker is rejected; use a fresh ID for a new batch. Deleting a drawing deletes its marker, so retrying that batch can recreate it.

Protocol **v24** requires restarting the companion/MCP connection and reloading Foundry together. Allow at least 180 seconds for tool calls awaiting approval. Manual verification by the user: check the browser console after reload; read a scene with existing drawings, add one labelled visible rectangle and one hidden rectangle to a test scene, cancel a separate batch, confirm visibility/geometry/text and retry the confirmed batch to check there are no duplicates.

## Journals and Battle Briefing presets

`create_journal` creates a private world JournalEntry with text pages, or a native **DnD4e Info Displays** Battle Briefing preset. The paired active GM is required. Ordinary journals work independently of the game system; presets require active `dnd4e-health-display` (whose briefing UI targets Foundry 14). This creates a new document without an edit confirmation.

For an ordinary journal, supply `requestId`, `name`, an explicit JournalEntry `folder` (ID, unique name or full path), and `pages: [{"name": "Page title", "content": "<p>HTML content</p>"}]`. Missing folder paths are created. Up to 100 text pages are supported.

For a preset, omit `folder` and `pages` and supply `battleBriefing` instead:

```json
{
  "requestId": "bridge-ambush-briefing-001",
  "name": "Bridge Ambush",
  "battleBriefing": {
    "title": "Hold the Bridge",
    "description": "Prevent the reinforcements from crossing.",
    "commanderSubtitle": "Captain of the bridge guard",
    "commanderPositionX": 50,
    "commanderPositionY": 50,
    "commanderZoom": 100,
    "expectedCombatants": [{ "actorId": "GUARD_ACTOR_ID", "count": 3 }],
    "strategy": {
      "environment": ["The bridge is slippery."],
      "pointers": [{ "actorIds": ["GUARD_ACTOR_ID"], "notes": ["Defend the gate."] }]
    }
  }
}
```

Only title and description are required inside `battleBriefing`; other fields default to empty notes/combatants, centered portrait positioning and 100% zoom. Discover world Actors first with `list_documents` and use their IDs (the final part of their Actor UUID), not combatant/token IDs. Counts are per actor; strategy pointers apply to all combatants using the selected actors. Preset fields are plain text. Portrait position ranges from 0-100 and zoom from 100-200.

Presets are stored in the unique **Battle Briefings** JournalEntry folder with `flags.dnd4e-health-display.preset`, a readable summary page and default ownership NONE. Open **Prepare Battle Briefing**, select the saved preset and load it. Creating a preset does not change a combat, spawn tokens or select a commander. Existing Journals and arbitrary caller flags, ownership or document source are outside this tool.

Reuse identical arguments and the same `requestId` after a timeout/disconnect; persisted receipts prevent duplicate Journals. Changed content or destinations with a saved request ID are rejected. Use `get_document` with `source:true` to verify stored pages and flags. Restart the companion/MCP connection and reload Foundry together for **protocol v23**.

### Add, edit and remove journal pages

Use `edit_journal_pages` with a discovered world JournalEntry `uuid`, a unique
`requestId`, and any combination of `add`, `update`, and `remove`. Read the journal
with `get_document` and `source:true` first. An example for an existing journal:

```json
{
  "uuid": "JournalEntry.discoveredId",
  "requestId": "grappa-safehouse-001",
  "summary": "Add the Grappa's Safehouse chapter to Encounters.",
  "add": [{"name": "Grappa's Safehouse", "content": "<h2>Move Grappa</h2><p>Push the trolley toward the rear exit.</p>"}]
}
```

`update: [{"id": "pageId", "name": "New title", "content": "<p>New text</p>"}]`
renames or replaces the HTML content of existing text pages; omit either field to
preserve it. `remove: ["pageId"]` deletes only the selected pages, including
non-text pages. Up to 100 entries per action are accepted. IDs must be unique
across updates/removals. Other pages, journal ownership and preset flags remain
intact; changing a Battle Briefing's summary text does not change its native preset.

The paired active GM reviews the full additions, before/after edits and deleted
page sources in one two-minute Confirm/Cancel dialog. Cancel, close and expiry
save nothing. Changed source during review invalidates approval. Writes are
separate embedded-document operations and can partially succeed. Inspect source
after `incomplete`, timeout or disconnect, then retry identical arguments with the
same request ID. Completed receipts prevent replay; addition markers prevent
duplicates after partial writes. Missing removal IDs are no-ops. Deleting an added
page before an incomplete request is retried can cause that page to be recreated.
Use a new request ID for new changes. No arbitrary flags, journal deletion,
compendium edits, image creation or script execution are accepted.

Protocol **v25** requires reloading Foundry and restarting the shared companion
and MCP clients together. Allow at least 180 seconds for approval. User verification:
check the browser console after reload, add a test chapter, edit its title/content,
cancel one deletion, then confirm deletion. Retry a completed addition and verify
no duplicate appears; change a journal during review to check stale rejection.

## Add powers to existing NPCs

`edit_npc_actor` accepts `addPowers: [{key, name, img?, system}]` alongside ordinary
actor edits, existing Item patches and trait deletions. Each entry creates a new
embedded Item of type `power` directly on the selected world NPC, using the same
validated DnD4e 0.9.3 power fields as NPC creation. Read the NPC source first.
The GM reviews each complete proposed power before any writes; cancel, close,
expiry, stale source or a changed session prevents creation.

Use a stable semantic key such as `alchemists-fire` for each intended power.
Identical additions reuse persisted power receipts, including after partial saves
or browser reloads; changed data under a saved key is rejected. To revise a saved
power, use its embedded Item ID in `items`. Deleting an added power also deletes
its retry marker, so retrying that addition can recreate it. Use a new key only
for an intended additional power. Requests accept at most 100 new powers and no
caller flags, effects, macros, IDs, features, equipment, PCs or token actors.
Responses include `addedPowers` with stable keys, embedded IDs and UUIDs. Partial
writes return `incomplete`; inspect source before retrying identical additions.

Protocol **v27** requires restarting the shared companion/MCP clients and
reloading Foundry together. User verification: add a power to a test NPC,
check its sheet and roll buttons, retry to check it is not duplicated, and cancel
a separate addition. Check the browser console after reload.

## Standalone magic item builder

`build_magic_item` creates an independent world Item by combining a mundane base with a specific magic variant from compendiums. It does **not** require Item Piles or a merchant. Discover exact component UUIDs with the compendium tools and read their sources, including enchantment restrictions, before building. Select the variant's actual enhancement/level entry rather than supplying a bonus override. Both sources must be accessible compendium Items of the same type (`weapon` or `equipment`). An explicit world Item folder is required; missing folder paths are created.

```json
{
  "requestId": "battering-craghammer-001",
  "baseUuid": "Compendium.dnd-4e-compendium.module-equipment.Item.BASE_ID",
  "enchantmentUuid": "Compendium.dnd-4e-compendium.module-equipment.Item.VARIANT_ID",
  "folder": "Magic Items/Weapons",
  "quantity": 1
}
```

The UI in the screenshot belongs to **DnD 4e Compendium**, installed version **1.37.13**: `esmodules/tools/cbuilder_xml_import.js` (`buildMagicItem`, `mergeItems`, `composeItemName`) and `esmodules/tools/lookup_tables.js` (`lookupMasterworkAC`). The MCP builder adapts those rules into a shared, source-only merger without creating temporary documents:

- Keep base weapon damage dice, groups, proficiency, properties, range, implement type and armor penalties. Compose names such as **Battering Craghammer +3** from **Craghammer** and **Battering Weapon +3**.
- Copy the variant's description, price, rarity, level, enhancement and weapon critical damage. Apply the compendium's masterwork AC table for recognized armor names.
- Use the variant's non-generic image, or tiered base artwork from `modules/dnd-4e-compendium/`. Preserve custom base images when the variant has a generic icon, rather than guessing a nonexistent custom filename.
- Retain both sources' embedded effects with fresh IDs. Copy the pinned DnD4e 0.9.3 `critDamageFormImp`, `damageCrit` and `damageCritImp` fields, correcting the original builder's implement-critical field typo and retaining structured critical damage.

The final Item is created unequipped in one write, with quantity defaulting to one. Sources are unchanged. No additional confirmation is required for this new world Item, consistent with `create_item`; the paired active GM is required. Reuse the same `requestId` with identical selections, folder and quantity after an uncertain result. A persisted receipt returns the existing Item on retry, even if the source compendium is later unavailable. Changing those selections under a saved request ID is rejected. Use a fresh request ID for an intentional second item.

As with the original standalone button, separately stored equipment power Items are not imported. Variant restrictions are checked from rules by the agent; the merger validates document types and native enhancement data, not natural-language weapon/armor eligibility. The builder itself adds no new effect automation beyond effects already present in the two sources. Its implementation is independent of the compendium module's private runtime functions, and does not require that module to be active when using other accessible compendiums. [Original module source](https://github.com/wigmeister2000/foundry-4e-compendium).

For direct merchant stocking, use the same merger inside `edit_merchant_inventory`:

```json
{
  "uuid": "Actor.MERCHANT_ID",
  "requestId": "merchant-battering-craghammer-001",
  "summary": "Stock two Battering Craghammers +3.",
  "add": [{
    "uuid": "Compendium.dnd-4e-compendium.module-equipment.Item.VARIANT_ID",
    "baseUuid": "Compendium.dnd-4e-compendium.module-equipment.Item.BASE_ID",
    "quantity": 2
  }]
}
```

The merchant confirmation shows the finished merged Item, and rechecks both sources before saving. No world Item is created in this flow. Alternatively, build a standalone Item first and stock its returned UUID with a normal merchant addition. Reload Foundry and restart the companion together for **protocol v22**.

## Item Piles merchant inventory

Requires active Item Piles, its public `game.itempiles.API` with `isItemPileMerchant`, `getActorItems` and `ITEM_QUANTITY_ATTRIBUTE`, and a world Actor of type `NPC` configured as a merchant. The paired active GM and DnD4e 0.9.3 are required. Unsupported module APIs or quantity attributes fail closed. Reload Foundry and restart the companion together for **protocol v22**.

1. Discover the merchant Actor UUID with `list_documents`, then call `get_merchant_inventory`. This returns paginated physical stock with exact embedded Item IDs, stored quantities and Item Piles flags. Read full Item source with `get_document` when choosing stock.
2. Discover world or compendium Item UUIDs for additions. `edit_merchant_inventory` copies those Items with explicit quantities, preserving their mechanics, effects and Item Piles properties. New stock uses separate entries; use `quantities` to increase an existing stack.
3. Submit one batch with `summary`, a unique `requestId`, and any combination of `add`, `quantities`, and `remove`. The GM reviews every addition, before/after quantity and full removed source in one two-minute Confirm/Cancel dialog. Cancel, close, expiry and stale source save no inventory changes.

```json
{
  "uuid": "Actor.MERCHANT_ID",
  "requestId": "merchant-stock-update-001",
  "summary": "Stock six healing potions, set arrows to twenty, and remove the old sword.",
  "add": [{ "uuid": "Compendium.PACK.COLLECTION.Item.POTION_ID", "quantity": 6 }],
  "quantities": [{ "id": "ARROWS_ID", "quantity": 20 }],
  "remove": ["SWORD_ID"]
}
```

Quantities are absolute whole numbers from 0 to 1,000,000; additions require at least 1. Zero keeps the stock entry; `remove` deletes it. Missing removal IDs are safe no-ops. Only `weapon`, `equipment`, `consumable`, `tool`, `loot`, and `backpack` stock is supported. Powers, features, prices, currency balances, merchant configuration, and infinite quantity settings are outside this tool. Infinite stock can still appear unlimited after changing its stored quantity. Stock writes use native Foundry embedded-document operations and do not perform a purchase, charge currency, auto-stack items, or invoke Item Piles trade APIs. Compatibility follows the [public Item Piles API](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/blob/master/src/API/api.js).

Completed requests persist receipts on the merchant, and additions carry retry markers. Reuse identical operations and the same request ID after an uncertain outcome; changed operations under a saved ID are rejected. Use a new request ID for every intentional later change. Batches are not atomic: after `incomplete`, timeout or disconnect, read inventory before retrying. The returned `applied` list contains verified operations and may omit writes that succeeded before an error. Keep MCP tool timeout at least 180 seconds. Live verification is performed by the user.

## Available reads

| Tool | Data |
| --- | --- |
| `get_session` | World and GM identity, Foundry/system versions, active scene/combat UUIDs, module metadata |
| `list_documents` | Paginated world document names and UUIDs, filtered by type/name |
| `get_document` | Full serialized world, embedded, or compendium document, optionally projected by field paths |
| `list_compendiums` | Accessible pack IDs and types |
| `list_compendium_documents` | Paginated pack index with UUIDs, without importing entries |

World types: Actor, Item, Scene, JournalEntry, ChatMessage, Combat, RollTable, Playlist, Macro, User, Folder, Cards. Embedded data includes actor items/effects, journal pages, tokens, walls, lights, combatants, sounds and table results. Use returned UUIDs rather than constructing them yourself. `get_document` defaults to prepared data (including derived system values); `source: true` returns stored data. `fields: ["system", "items", "effects"]` narrows large results; projected keys retain their requested dotted paths. Pagination limits are 1–100; each response is limited to 4 MiB. Name filtering is not full-text journal search.

## Standard PC setup

Use the [setup-pc skill](../../.agents/skills/setup-pc/SKILL.md), or call `setup_pc` with `requestId`, `name`, `race` and `class`. It creates a new world Player Character in **Player Characters** (override with `folder`, accepting an Actor folder ID, name or path). The paired active GM must run DnD4e 0.9.3.

```json
{
  "requestId": "setup-aria-001",
  "name": "Aria",
  "race": "Human",
  "class": "Fighter"
}
```

The operation fills the race/class text fields and embeds the class feature from the **Classes** Item pack owned by `dnd-4e-compendium` (or `dnd-4e-compendiums`), plus **Melee Basic Attack**, **Ranged Basic Attack**, **Total Defense**, **Charge**, and **Second Wind** from **Powers (Core)**. All sources resolve before folders or actors are created. Exact names match case-insensitively; `classId` selects a Classes entry when needed. `corePack` can disambiguate packs but must still select an Item pack labelled Powers (Core). Missing/ambiguous sources return `unresolved` without creating anything. Native effects and mechanics are retained.

The PC gets enabled `@tier` formula bonuses to Global Attack Modifier, Fortitude, Reflex and Will; automatic total HP; power grouping **Action (Modern)** and sorting **Usage**. It uses a linked friendly prototype token. Ability scores and other unspecified values use system defaults; the operation does not assign ownership, import a race Item, choose optional class features, or run an interactive advancement workflow.

Actor and all six Items are created together. Retry identical arguments with the same requestId after uncertain outcomes to recover the saved actor rather than create another. A changed payload under a saved ID is rejected. The receipt lists actor/item UUIDs and any missing source Items (`incomplete`). Existing PCs are never updated by this tool. Verify stored fields and Items with `get_document`; do not interpret an incomplete result as a successful full setup.

Restart the companion/MCP connection and reload Foundry for protocol **v13**. Check `get_session.pcSetup`. Manual verification by the user: create a test PC, check its identity, class, five core actions, enabled tier formulas, automatic HP checkbox and power layout, then repeat the same request and confirm no duplicate actor. Check the browser console after reload.

## PC powers, feats, rituals and magic items from compendiums

`import_pc_options` adds choices to an existing world **Player Character**, using only the **Powers**, **Feats** and **Rituals** Item packs owned by `dnd-4e-compendium`. Pair the active GM on DnD4e 0.9.3. Discover the character UUID with `list_documents`; then supply names or pack entry IDs:

```json
{
  "uuid": "Actor.CHARACTER_ID",
  "requestId": "hero-powers-feats-001",
  "powers": [{ "name": "Cleave", "level": 1 }],
  "feats": [{ "name": "Toughness", "level": 2 }],
  "rituals": [{ "name": "Gentle Repose" }]
}
```

Use `equipmentPowers: [{ "name": "POWER_NAME" }]` (or an entry `id`) to import powers from the **Equipment Powers** pack, also accepting the label **Powers (Equipment)**. The source must belong to `dnd-4e-compendium` and contain `power` Items. Omit `level` to preserve its source value, or supply 1-30 as an override. These use the same name cleanup, duplicate checks and retry receipts as regular powers. Equipment powers are imported only when explicitly selected; importing a magic item does not automatically search for its powers. The combined request limit is 100 choices, including equipment powers.

To give a PC magic items, add `magicItems: [{ "pack": "PACK_ID", "id": "ENTRY_ID" }]` to the request (or use `name` instead of `id`). Discover the exact pack ID with `list_compendiums` and its entries with `list_compendium_documents`. Inventory sources must be accessible Item packs owned by `dnd-4e-compendium`; supported types are weapon, equipment, consumable, tool, loot and backpack. The tool retains source level, enhancement, quantity, description, mechanics, effects and flags, and sets `system.equipped` to false. Magic item choices accept no level, quantity or arbitrary source overrides. This adds inventory immediately; it does not equip items or deduct currency. Items already linked to the same compendium source are skipped; different entries with the same name can coexist. Missing or ambiguous inventory choices prevent the entire mixed batch from being written. The 100-choice limit covers all arrays together.

Each choice requires exactly one `name` or `id`. Feats require a level from 1 to 30. Powers and rituals may omit `level` to preserve the source level, including an unset level for class/racial powers; an explicit level from 1 to 30 overrides it. All choices are added immediately; this does not change actor level, enforce prerequisites, schedule future grants, or replace old selections. Up to 100 choices may be submitted together.

Names match case-insensitively against full or cleaned power titles. Power titles such as `Cleave (Fighter Attack 1)`, `Cleave - Fighter Attack 1`, or `Fighter Attack 1: Cleave` become `Cleave`. Also clean class-only and racial labels such as `Shaman-Healing Spirit`, `Druid-Verdant Touch`, and `Half-Orc Power-Furious Assault`; feat and ritual titles stay intact. Missing or ambiguous choices return `unresolved` with no writes. Use `list_compendium_documents` and an entry `id` to select the intended version. The entire batch is resolved before creation. Compendium source mechanics, effects and automation flags are preserved; callers cannot supply custom document data.

Existing items matched by source UUID or title are reported as `existing` and retain their current levels and data. New entries return `imported` with item UUIDs and levels. A partial save returns `incomplete` and identifies missing entries. Inspect the actor, then retry identical data with the same requestId; per-item persisted fingerprints prevent duplicates across reloads and reject changed data under an already saved request ID. Removing imported items also removes their retry markers. No confirmation popup is required for this additive import.

Protocol **v14** requires restarting the companion/MCP connection and reloading Foundry together. `get_session.pcImport` advertises the new tool. Manual verification by the user: import a power and feat onto a test PC, check names, levels, descriptions and effects; retry and confirm no duplicates. Check an ambiguous name produces no new items, and inspect the browser console after reload.

## PC and merchant equipment icons

Call `fix_pc_item_icons` with `{ "uuid": "Actor.PC_ID" }` to scan all Items on a world
Player Character or an Item Piles world NPC merchant (use its Actor UUID). Other NPCs are excluded. On `equipment` Items whose stored image is exactly `icons/svg/chest.svg`,
the native `system.armour.type` slot selects one of these built-in icons:

- Feet: `icons/equipment/feet/boots-collared-pink.webp`
- Head: `icons/equipment/head/helm-barbute-reinforced.webp`
- Arms: `icons/equipment/wrist/bracer-straight-leather-steel.webp`
- Neck: `icons/equipment/neck/amulet-round-engraved-spiral-gold.webp`
- Waist: `icons/equipment/waist/belt-buckle-steel.webp`
- Hands: `icons/equipment/hand/gauntlet-armored-steel-grey.webp`

Custom icons, other slots and non-equipment Items remain unchanged. Equipped and unequipped
Items are both eligible. Only `img` is updated; item names, mechanics and effects are preserved.
The tool requires the paired active GM on DnD4e 0.9.3 and accepts no custom image paths or
patches. It returns `updated`, `unchanged` or `incomplete`, with per-item receipts. After an
uncertain or incomplete result, inspect the Items and retry; already changed icons are skipped.

Restart the companion/MCP connection and reload Foundry together for protocol **v19**.
Manual verification by the user: run this on a test PC with default and custom icons across
the six slots, check the images and browser console, then repeat and confirm `unchanged`.

## NPC creation from stat blocks

`create_npc_actor` creates a new world Actor of type `NPC`, including embedded `power` and `feature` items, through one awaited `Actor.create`. Supply `name`, a required destination `folder`, a unique `requestId`, nested source `system` data, and optional `items`/`img`. The folder accepts a unique Actor folder name, a full path such as `Monsters/Trolls`, or an existing world Actor folder ID. Missing folders and parents are created automatically; matching folders are reused. Ambiguous names/paths are rejected; use discovery tools to choose a full path or ID. Non-Actor and compendium folder IDs are rejected. Folder creation is serialized so concurrent NPC requests share newly created folders. If actor creation fails after folder creation, the folders remain available for retry.

Paste a stat-block image and specify the destination folder in your request, e.g. "Create this Shadow Troll in Monsters/Trolls." The assistant asks for a folder if it is missing. It transcribes the image and maps it using the repository's [NPC actor skill](../../.agents/skills/dnd4e-npc-actors/SKILL.md), based on the pinned system source. The [Shadow Troll example](test/fixtures/shadow-troll.json) includes all stats, a regeneration trait and four powers. Its folder and request ID are examples. Conditional mechanics and compound attacks remain descriptive rules for manual use; no effects or macros are generated. An image of a stat block is not used as the actor portrait.

The tool's nested schema lists supported source fields and rejects others at both ends. Simple NPC math is enforced: printed defenses/initiative/skills go in `.base`, HP in `attributes.hp.value` and `.max`, resistances in `.res`. Tier and unlinked hostile prototype-token dimensions derive from level/size. Source data differs from prepared totals; use `get_document` on the resulting actor UUID to verify them.

Keep the same request ID and identical data when retrying after an uncertain timeout/disconnection. The actor stores a fingerprint so retries return its original UUID, including across browser reloads. Reusing an ID with changed data is rejected. A new ID requests a separate NPC, even with the same name. If an actor is manually deleted, its persisted retry receipt is also deleted. Creation never updates existing actors; use the separate confirmed NPC editing tool for changes.

## Authored feats, including direct PC creation

`create_feat` creates a new feat with `name`, `level` (1-30), `text` (flavor/chat text), and `description` (full rules description, including HTML if wanted). Supply a unique `requestId`. Use optional `featureType: "theme"` to create a Theme Feature at level 1-30 (world folder defaults to Theme Features), or `featureType: "trait"` to create a Trait instead; traits may use `level: null` when unlevelled. Omit featureType for a feat, which still requires level 1-30. The world folder defaults to Traits for traits. It stores a native DnD4e 0.9.3 `feature` Item with the selected `system.featureType`, `system.level`, `system.description.chat` and `system.description.value`.

```json
{
  "requestId": "custom-feat-001",
  "name": "Steady Aim",
  "level": 4,
  "text": "A moment of focus.",
  "description": "<p>The feat's full rules go here.</p>",
  "actorUuid": "Actor.PC_ID"
}
```

With `actorUuid`, the paired active GM creates the feat directly on that existing world PC; no separate world Item or folder is created. Omit `actorUuid` to create a world Item in **Feats**, or supply `folder` for another Item folder ID, name or path. Missing paths are created. `actorUuid` and `folder` cannot be combined.

Every feat uses `modules/fox-commons/images/Icons/Items/Documents/Notebook-08_Poneti.webp`; there is no image input. The notebook asset must be supplied by the installed fox-commons module. Text and description may be empty strings. Existing Items, compendiums, token actors and NPCs are not modified, and caller-supplied effects, flags, macros and arbitrary system fields are rejected.

Reuse identical arguments with the same requestId after uncertain results. A persisted marker on the created feat reuses its UUID across browser reloads and rejects changed data or destinations; deleting the feat also deletes that receipt. Return values include the Item UUID, level, image, actor UUID or world folder, and `reused`. Verify the complete content with `get_document` and `source: true`. `get_session.featCreation` advertises the capability.

Manual verification by the user: restart the companion and reload Foundry for protocol **v13**, create a feat in a world Item folder and one directly on a test PC, check their level, flavor, description and image, then retry identical requests and confirm no duplicates. Check the browser console after reload.

## World Item creation

`create_item` creates one new world `weapon`, `equipment`, `power` or `feature` in DnD4e **0.9.3**. Supply `name`, `type`, a required Item `folder`, a unique `requestId`, nested source `system` data and optional `img`. Folder selectors accept a unique Item folder name, full slash-separated path or existing Item folder ID; missing folders/parents are created, while ambiguous names and Actor/compendium folder IDs are rejected. Creation uses one awaited `Item.create` and never changes an existing Item.

The type-specific nested schema is enforced by both MCP and the paired GM browser. Caller-supplied IDs, flags, effects, macros, container links and item-granting links are excluded. Retry the identical payload with the same request ID after an uncertain result; a persistent fingerprint returns the existing Item UUID across browser reloads. A changed payload under that ID is rejected, and a fresh ID creates an intentional new copy. Missing-folder creation may remain if Item creation fails.

Use the pinned system's [weapon schema](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/item/weapon.mjs) and [equipment schema](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/data/item/equipment.mjs). `system.description.chat` is the sheet's Flavor Text field used by Automatic Chat Cards. Item descriptions preserve conditional rules; no automated auras, conditions or encounter counters are created.

The [Hammer of the Lost Riders fixture](test/fixtures/hammer-of-the-lost-riders.json) is the level 16 **+4 warhammer**, priced at 45,000 gp. Native fields provide its enhancement, base warhammer damage and 4d6 cold critical bonus. `critDamageForm: "0"` replaces the default enhancement-d6 bonus, with typed cold dice supplied once through `damageCrit.parts`. Its self-stun/blind critical rider and encounter-dependent cold burst/concealment remain in the description for manual adjudication. Preserve the fixture's request ID when retrying this specific creation, and verify the returned UUID with `get_document`.

Protocol **v14** requires restarting the companion/MCP connection and reloading Foundry together. Confirm `get_session.itemCreation` before calling the new tool. Manual verification by the user: create in Magic Items, check the sheet's level/enhancement/price, base warhammer and critical fields, then retry the same payload and confirm there is one Item. Other existing world Item edits remain unavailable.

## Power and equipment ActiveEffects

Ask for **"Make X give 5 fire resistance"** or **"Read X, Y and Z and add ActiveEffects for all of them."** The agent discovers the Items, reads their stored rules and existing effects, then calls `add_item_effects` with one batch. This is agent interpretation of the rules, not a keyword parser running inside Foundry. Ambiguous names need discovery/disambiguation before proposing changes. Unsupported conditions, aura damage triggers, sustain rules and choices are listed as manual handling in the report; they must not be silently turned into unconditional bonuses.

The paired **active GM client** receives a report showing each Item, each effect's rules, application/recipient, duration, modifier keys/modes/values, conditions, ongoing damage, source-versus-recipient formula data, and manual limitations. **Confirm** appends the proposed effects; **Cancel**, closing the window, or the **two-minute timeout** saves nothing. A late click is rejected even if a background tab delays its timers. Items that changed while the report was open require a fresh proposal. Existing effects remain intact.

Targets can be world Items or Items embedded on world PCs/NPCs. Inventory supports weapon, equipment, tool, loot and backpack properties; use `equipped` to transfer only while equipped, or `passive` to transfer regardless of equip state. Power/consumable templates use native application types such as `self`, `hit`, `miss`, `allies` or `misc` with transfer disabled. Put an equipment's activated ability on its power Item. Power effects need the system's Automatically Apply Effects setting and appropriate targets; `misc` needs manual application. The bridge does not change system settings or immediately apply power templates to actors.

```json
{
  "items": [{
    "uuid": "Item.discoveredArmourId",
    "effects": [{
      "key": "fire-resistance",
      "name": "Fire resistance 5",
      "description": "Gain resist 5 fire while this armour is equipped.",
      "application": "equipped",
      "duration": "permanent",
      "changes": [{ "key": "system.resistances.fire.res", "type": "upgrade", "value": "5" }]
    }]
  }]
}
```

Every effect requires an explicit application and duration. Native durations include end/start of the source or target's next turn, end of the source's current turn, save ends (`saveEnd`, DC 10 by default), encounter end and extended rest. `custom` requires `durationValue` and `durationUnits` (`seconds`, `rounds`, `turns`). `permanent` has no expiry. **Daily/encounter usage does not determine duration.** Optional `durationAction` ends an effect on a native action event. Changes are native `system.changes` with string modes. Typed bonuses use `upgrade`, untyped bonuses/penalties use `add`, resistance uses `upgrade`, and vulnerability uses `downgrade` with a negative value. Conditions use native status IDs; ongoing damage uses `dots`. See the [effect keys reference](../../.agents/skills/dnd4e-active-effect-keys/SKILL.md).

Description-only reminders are supported: omit `changes`, `statuses` and `dots`, or pass empty arrays. Supply the reminder text in `description` and the normal `application` and `duration` (for example, `hit` and `endOfUserTurn` for Haunting Spirits). No mechanical modifier or status is required. Different reminder descriptions remain distinct during duplicate detection.

Use a stable semantic `key` for each effect on an Item. Identical existing mechanics are skipped; a changed managed key is rejected for inspection rather than overwritten. Effects-only writes are bounded and validated at both ends; caller flags, scripts, macros, arbitrary effect source, compendium/token writes, replacement and deletion are excluded. Batch writes across Items are separate operations: an error can leave some effects saved. Responses report `updated`, `unchanged`, `cancelled`, `expired` or `incomplete`, with proposals and saved receipts. After uncertain or incomplete outcomes, read source and retry the same keys. Use at least **180 seconds** for MCP tool timeout.

Protocol **v14** requires restarting the companion/MCP connection and reloading Foundry together. User verification: check the console after reload, request fire resistance on test equipment and a self/on-hit effect on a test power. Inspect the report, cancel once, confirm another request and verify transfer/equipped settings, application type, duration and changes on the sheets. Leave a report unanswered for two minutes and confirm no effects were added. Repeat an applied request to check duplicates are skipped; manually change an Item during review to check stale approval is rejected. Check the power's actual application and expiry during your normal workflow.

### Condition shortcuts

Use `list_conditions` (optionally `{ "query": "slowed" }`) to read the world's configured condition IDs, localized Names, Icons, and Mods. This reads `CONFIG.statusEffects`, the same definitions as the native effect sheet's copy buttons, including configured custom conditions.

For example, an effect in `add_item_effects` can be:

```json
{
  "key": "howling-wall-slowed",
  "condition": "slowed",
  "application": "hit",
  "duration": "endOfUserTurn"
}
```

The shortcut copies Name, Icon, and Mods and sets the condition status. Omit `name`, `statuses`, and `changes`; these fields cannot override the shortcut. The description defaults empty; supply only concise extra mechanics if needed. Duration remains in its dedicated fields. Condition descriptions, module flags, and scripts are never copied. Runtime modifier data is copied without changing the configured definition; native status behavior still applies when that condition has no explicit modifiers.

The GM report shows the resolved Name, Icon path, and Mods before approval. Changing the Item or the condition definition during review invalidates approval. Condition shortcuts also compare Name, Icon, and description during duplicate detection, so an old effect with the power's icon is not treated as a complete condition copy. Existing managed keys with different data still require inspection; this remains an additions-only tool.

After installing protocol **v19**, restart the MCP companion and reload Foundry together. For manual verification, use `list_conditions`, add a condition effect on a test power, and compare its Name, Icon, and Mods with the native copy buttons. Check the browser console after reload.

### Aura Effects settings

`add_item_effects` accepts an optional `aura` object on each effect. This creates the `auraeffects.aura` type, retaining DnD4e application and duration fields. Aura Effects must be active and register a compatible DnD4e data model; the mapping is verified against Aura Effects **2.2.1**. The GM report includes the complete resolved aura settings. Module support is checked again after approval, and retry matching includes aura type and configuration.

For a display-only Fire Mantle aura, add a separate effect with:

```json
{
  "key": "fire-mantle-aura",
  "name": "Fire Mantle Aura",
  "description": "Enemies entering the aura or ending their turn there take Hicham's Int Mod fire damage, at most once per turn. Handle damage manually.",
  "application": "all",
  "duration": "endOfEncounter",
  "aura": {
    "distanceFormula": "1",
    "visualOnly": true,
    "showRadius": true,
    "color": "#ff6600",
    "applyToSelf": false
  }
}
```

Target only the bearer when applying this power. Distance uses **scene distance units**: `1` means one square only on a scene whose distance per grid space is 1. Use the scene's actual units otherwise. Partial Concealment and resist 10 fire stay in separate effects **without** `aura`, applying only to the bearer. Remove all three if the bearer dismisses the mantle early. Damage timing, once-per-turn limits and dismissal remain manual.

`visualOnly` defaults false. When true, it uses the module's fixed `false` recipient predicate, preventing all recipient copies while retaining the displayed region; conditions, modifiers and ongoing damage are rejected on that aura. Normal auras can carry the existing validated native modifiers or condition shortcut for recipients.

The remaining fields mirror the Aura Effects UI: `disposition` (`any`, `friendly`, `hostile`; default `any`), `applyToSelf` (true), `evaluatePreApply` (false), `canStack` (false), `bestFormula` (empty), `collisionType` (`""`, `move`, `sight`, `light`, `sound`; default `move`), `showRadius` (false), optional `color` (`#RRGGBB`), `combatOnly` (false), `disableOnHidden` (true), and `overrideName` (empty). `distanceFormula` is required. Distance and Best Formula accept simple deterministic numeric expressions and actor variables, such as `max(1, @chaMod)`; dice and caller JavaScript are excluded. Evaluate Changes Early uses the **aura bearer** as the source, which may differ from the power's caster.

Protocol **v20** requires restarting the MCP companion and reloading Foundry together. User verification: check the browser console after reload; create a display-only aura on a test power and review/cancel once, then confirm. Apply it to one bearer, check the radius and color, and verify nearby creatures gain no copied effects. For a recipient aura, check disposition/source filters and native changes with your usual tokens. Repeat the request to verify it adds no duplicate.

## PC basic attack abilities

All edit confirmation dialogs allow **two minutes**. Supply `summary` on `edit_npc_actor`, `set_pc_basic_attack_ability` and `add_item_effects`: one plain-language sentence describing the proposal, shown at the top before **Detailed changes**. For example, `"summary": "Use Intelligence for attack and damage on both of Hicham's basic attacks."` The complete before/after diff or effect report remains underneath. Summary text is displayed as text and never saved to actor, Item or effect data. Without a supplied summary, the dialog generates a short fallback. The bridge allows 150 seconds for these requests; configure the MCP tool timeout to at least 180 seconds.

`set_pc_basic_attack_ability` sets both **Melee Basic Attack** and **Ranged Basic Attack** on a world PC to one ability, for example `{ "uuid": "Actor.pc", "ability": "int" }`. Use `str`, `con`, `dex`, `int`, `wis` or `cha`. The core powers must each exist exactly once and use `@powerMod` for attack, damage and critical damage. The tool changes their ability selector and matching ability names in Hit/rules text; formulas, weapon use, effects and all other fields remain intact.

Read the PC's source first. The paired active GM must approve the usual before/after confirmation (120-second expiry, Cancel by default). Stale or cancelled approvals do not write. Missing/duplicate/custom powers, NPCs, token actors, compendiums and caller-defined patches are rejected. Read the PC again after an incomplete or uncertain result; retries change only the remaining fields. Allow at least 180 seconds for tool calls. Protocol **v19** requires restarting the MCP companion and reloading Foundry together.

## NPC editing with GM confirmation

`edit_npc_actor` edits an existing world NPC in DnD4e **0.9.3**. Read its stored data with `get_document` and `source: true` first. Supply its `uuid` and partial `name`, `img` or nested `system` data. Optional `items` patches require an existing embedded item `id` and matching `type` (`power` or `feature`), plus partial `name`, `img` or `system`. Omitted fields remain unchanged; supplied arrays replace the whole array. This operation does not add items, move folders, or adjust prototype tokens automatically.

To remove embedded traits, pass `deleteTraits: ["traitItemId"]`. Only world NPC `feature` Items whose stored `system.featureType` is `trait` can be deleted. Powers, feats, PCs, compendiums and token actors are excluded. The usual GM confirmation lists each trait's name, full source and deletion before any writes. Cancellation, closing or expiry deletes nothing; changed traits invalidate approval. Do not edit and delete the same ID in one request. Missing IDs are no-ops for safe retries after partial deletion. Preserve required rules in `system.biography` (Lore Description) first, or in the same request: actor updates are awaited before deletion. A failed request can leave partial changes, so read the NPC before retrying.

On a power patch, `hitMark: true` adds a native on-hit Marked effect template, ending at the end of the source actor's next turn. It uses `statuses: ["mark"]`, `system.powerEffectType: "hit"`, `system.durationType: "endOfUserTurn"`, and a source-evaluated `system.marker` change. This matches the pinned [attack workflow](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/helpers/dice.mjs) and [effect application](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/utils/utils.mjs). The system's **Automatically Apply Effects** setting must be enabled and the attack must target a token for automatic hit/miss application. No world setting is changed by the MCP. Custom attack workflows need their own support for native hit effects. The managed template is reused on retry and existing effects are preserved. Removing or modifying arbitrary effects, caller-supplied effect data and macros remain unavailable.

Every request with changes opens a popup on the paired **active GM's** screen with the generated before/after summary and **Confirm changes** and **Cancel** buttons. Pair the active GM's tab; other GMs cannot approve edits. The summary includes all changed fields, including descriptions displayed as plain text. No writes occur until confirmation. Cancel, closing the popup, or its 120-second expiry leaves the NPC unchanged. Requests without changes return `unchanged` immediately. Set the MCP client's tool timeout to at least 180 seconds, as in the setup example.

After approval, the module rechecks GM identity/role, bridge enablement, connection, system version and document source. Intervening manual edits or deleted documents require a fresh request. Embedded item changes and actor changes use separate awaited Foundry operations; a failure can leave partial changes. The response reports `updated`, `cancelled`, `unchanged`, or `incomplete`, with a field summary and known saved fields for incomplete results. After timeout, disconnection or an incomplete result, read the actor again before retrying. Repeating identical already-saved patches returns `unchanged`. Confirmation is required again for any remaining changes.

Editing uses protocol **v19**. Restart the companion/MCP connection and reload Foundry together when installing this change; older clients cannot pair.

Other document updates/deletions, macro execution, explicit dice rolls, chat posts, general compendium imports and arbitrary script calls are unavailable. Caller-supplied actor IDs, flags, effects, item macros and item-granting data are excluded; item IDs only select existing NPC powers/features for editing. GM-visible gameplay content, including secrets and private chat supplied to that GM, can be returned. User documents expose safe identity fields only; account credentials, arbitrary settings values, server files and DOM/runtime inspection are excluded. Reading compendiums can populate Foundry's in-memory caches.

MCP annotations distinguish reads from creation, PC imports and NPC editing; the fixed operation allowlist and nested source schemas enforce the boundary. Read requests are limited to 16 KiB, creation/edit requests to 2 MiB, and responses to 4 MiB. The transport uses an independent random pairing token, exact browser-origin and Host checks, a loopback listener and one paired session. The companion trusts the token-holding module to enforce the GM role; it does not independently authenticate to the Foundry server. A process that obtains the token is within that trust boundary.

## Verification

Run `npm --prefix src/foundry-mcp test`. Automated tests use document doubles and local transports, without operating Foundry.

Shared-session regression tests start simultaneous real stdio MCP clients on an isolated port, route requests through a simulated GM that rejects overlapping calls, close one client, abandon another client's stdin, verify the survivor, retire the idle listener and start a fresh session. They also cover configuration rejection, companion loss without write replay, abandoned queued writes and GM identity changes. Manual verification by the user: after the initial upgrade restart, call `get_session` in two T3 conversations, leave one and verify the other and a new conversation still work. Reload Foundry and check the browser console and reported world/GM.

Manual verification by the user: restart the MCP connection, reload Foundry and check the browser console. Pair the intended GM and test discovery/reads, then create the Shadow Troll in a chosen test Actor folder. Verify HP 228/bloodied 114, all defenses 24, initiative +10, Perception +13, speed/climb 8, necrotic resistance 10, saves +2, one action point, a 2x2 prototype token, languages and all five items. Test attack/damage buttons (+15 vs Reflex with 4d6+12; +17 vs AC with 8d6+24). Retry identical data under the same ID and confirm no second actor. Disable the bridge and confirm requests fail; check a non-GM cannot serve reads or create NPCs.

Protocol/setup references: [MCP SDK server guide](https://ts.sdk.modelcontextprotocol.io/server), [official Codex MCP configuration](https://developers.openai.com/codex/mcp/), [Foundry v13 API](https://foundryvtt.com/api/v13/).

Manual NPC edit verification by the user: request an HP and power-formula change on a test NPC. Verify the popup lists old/new values and that the sheet remains unchanged before confirmation. Cancel and close separate requests, then confirm another request and inspect the actor and power. Leave a popup unanswered to check expiry. Change the NPC manually while a popup is open and confirm that it requires a fresh request. Verify a PC and a non-active GM cannot edit. Check the browser console after reload.

## Custom rituals and Techniques

Use `create_ritual` for authored native Ritual Items, including homebrew Techniques.
Supply `name`, `level` (1?30), `text` (flavor/chat, may be empty), `description`
(full rules HTML), and a unique `requestId`. Include casting time, duration,
component costs, market price and key skill in the description.
Use `actorUuid` to create directly on a world PC, or `folder` for a world Item
folder (defaults to Rituals). Do not combine the two destinations. A fixed
notebook icon is used. No effects, macros or arbitrary source fields are accepted.
Retry identical arguments and request ID after uncertain saves; persisted receipts
prevent duplicates and reject changed data or destinations. Verify with `get_document`.
Protocol v26 requires reloading Foundry and restarting the shared companion/MCP
clients together before the new tool is available.
