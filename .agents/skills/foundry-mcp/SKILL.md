---
name: foundry-mcp
description: Module layout, bridge boundaries, and connection troubleshooting for src/foundry-mcp. Use when reading or editing its client/server/tests, or when Foundry MCP tools are missing or fail to connect.
---

# Foundry MCP

The module runs in an opted-in GM browser session. Each MCP conversation starts `server/main.js`, a stdio adapter that authenticates to one shared `server/companion.js` Node process per bridge port. The shared process connects to the GM browser through a token-authenticated loopback WebSocket. Foundry itself does not host these Node processes.

## Connection troubleshooting

First attempt a normal MCP connection by discovering the Foundry tools and calling `get_session`. If it succeeds, verify the intended world and GM and continue the requested work. Check competing instances and port ownership only after that connection attempt fails, including when discovery exposes no Foundry tools. These checks are failure diagnostics, not routine preflight steps.

After a failed connection attempt, check the configured bridge port (default `17890`) before suggesting repeated restarts or new chats. Multiple stdio adapters are expected and share the listener when token, origin and versions match. An enabled toggle confirms configuration, not a successful MCP handshake.

1. Inspect the MCP startup logs for `EADDRINUSE`, `address already in use`, and `handshaking with MCP server failed`. Check the configured port's listener, owning PID, command line, and parent process to identify which client owns it. On Windows, use `Get-NetTCPConnection -LocalPort <port> -State Listen` and `Get-CimInstance Win32_Process` for the owning PID and its parent. Treat access-denied results as inconclusive and request the required escalation; preserve errors instead of hiding them with `-ErrorAction SilentlyContinue`.
2. A listener owned by `server/companion.js` is the shared process: check token/origin/version consistency and startup errors. A listener owned by `server/main.js` is a retained legacy companion: have the user fully restart the MCP clients retaining it once for the upgrade. Keep the MCP command pointing at `server/main.js`; it now launches an adapter, not the listener. Recheck the listener and tool discovery. Inspect only connection/process diagnostics; the user operates Foundry. Keep pairing tokens and other credentials redacted.
3. Confirm recovery with the exposed Foundry `get_session` tool and verify the intended world and GM. A listening port or established TCP connection alone does not prove that this conversation has a working MCP session. If startup succeeds but pairing fails, check token/origin/port consistency next, using the [module setup instructions](../../../src/foundry-mcp/README.md).

Adapters release their connection on stdin EOF without stopping other conversations. The shared process retires after its last adapter leaves and dispatched calls settle, with a 30-second handover grace period. Calls are serialized for the browser's single-request guard; a bounded queue expires undispatched calls after 15 seconds and removes them on caller disconnect or GM-session change. Inspect source after uncertain dispatched writes; reconnecting never replays calls automatically. See [multiple conversations and lifecycle](../../../src/foundry-mcp/README.md#multiple-conversations-and-companion-lifecycle) for setup and upgrade behavior.

## Power and equipment effect requests

For requests such as "make X give 5 fire resistance" or "read X, Y and Z and add ActiveEffects", discover exact Item UUIDs and read every Item with `get_document`, `source:true`, including rules and existing effects. Read [dnd4e-active-effect-keys](../dnd4e-active-effect-keys/SKILL.md), then submit one `add_item_effects` batch. The agent interprets the rules; the browser validates declarative proposals and never runs a natural-language parser or caller script.

Include each requested Item in the report. Every proposed effect needs a stable semantic key, name, rules description, application and duration. Inventory properties use `equipped` (transfer only while equipped) or `passive` (always transfer). Powers/consumables use native recipient/trigger types such as `self`, `hit`, `allies` or `misc`, with transfer disabled. Activated equipment abilities belong on power Items. Never use daily/encounter usage as effect duration. Preserve source-versus-recipient turn expiry, save ends/DC, custom duration and formula data correctly. List unsupported conditions, auras, sustain, choices and any omitted mechanics in per-Item notes; use `effects:[]` for manual-only Items. Never invent unconditional automation for conditional rules.

The paired active GM reviews one complete client report with Confirm/Cancel. Approval expires after 120 seconds; cancel/close/expiry saves nothing. The browser rechecks session identity and source snapshots before writing. Identical mechanics are skipped; a changed managed key is rejected rather than overwritten. Existing effects are preserved. Batches are not atomic: read source after uncertain/incomplete results and retry stable keys. Configure the MCP client timeout to at least 180 seconds. Only world Items and Items on world actors are supported; compendium/token writes, effect deletion/replacement, arbitrary source/flags/macros remain excluded. Power application requires native auto-apply effects and appropriate targets; miscellaneous effects are manual. See [request example and verification](../../../src/foundry-mcp/README.md#power-and-equipment-activeeffects).

For condition effects, use `list_conditions` to discover the world's configured IDs, Names, Icons, and Mods. Submit `condition: "slowed"` (or another discovered ID), key, application, and duration in `add_item_effects`; omit name, statuses, and changes. The browser copies Name, Icon, and Mods from `CONFIG.statusEffects`, like the DnD4e sheet buttons, without copying condition descriptions or flags. Description is optional for this shortcut and should contain only additional mechanics. The report shows the resolved fields, and condition changes during approval invalidate the request. Protocol v19 requires restarting the companion and reloading Foundry together.
## Aura Effects authoring

For aura requests, read [dnd4e-aura-effects](../dnd4e-aura-effects/SKILL.md) and use the optional `aura` object on `add_item_effects`. Supply `distanceFormula` in scene distance units. `showRadius` and `color` control display; `visualOnly:true` prevents all recipient copies and requires no condition, changes, statuses or dots on that effect. Keep bearer-only protections in separate effects without `aura`. Other controls mirror Aura Effects: `disposition` (`any`/`friendly`/`hostile`), `applyToSelf`, `evaluatePreApply`, `canStack`, `bestFormula`, `collisionType`, `combatOnly`, `disableOnHidden`, and `overrideName`. Distance and Best Formula must be deterministic numeric expressions. Source evaluation uses the aura bearer, which can differ from the caster. Conditional JavaScript, damage triggers and early dismissal remain manual. The browser requires active Aura Effects with a DnD4e-compatible data model, verified against 2.2.1; review, stale-source checks and stable-key retries include aura settings. See the [aura example](../../../src/foundry-mcp/README.md#aura-effects-settings). Protocol v20 requires restarting the companion and reloading Foundry together.

## Journal pages

Use `edit_journal_pages` to add chapters, edit text pages or remove exact page IDs
in existing world journals. Read the journal with `get_document`, `source:true`
first. Supply its `uuid`, a new `requestId`, optional review `summary`, and any of
`add: [{name, content}]`, `update: [{id, name?, content?}]`, `remove: [id]`.
Content is HTML; omitted update fields are preserved. The active GM confirms one
full report; cancel/close/expiry saves nothing and stale source prevents writes.
Allow 180 seconds. Inspect source after incomplete/uncertain results before
retrying identical arguments and request ID. Completed receipts prevent replay;
per-page addition markers recover partial saves without duplicates. Other pages,
ownership and native Battle Briefing flags are preserved. Page text edits do not
change a briefing preset. Whole-journal deletion, arbitrary source/flags and
compendium mutations remain excluded. Protocol v25 requires reloading Foundry and
restarting the shared companion/MCP clients together. Implementation lives in
`scripts/journal-page-api.js` and `shared/journal-page-data.js`.

## Module boundaries

All edit confirmations allow two minutes. On `edit_npc_actor`, `set_pc_basic_attack_ability` and `add_item_effects`, provide `summary`: one plain-language sentence describing the proposed change, shown above the detailed diff/report. Use proposal wording rather than claiming unsaved changes are complete. Summary text is escaped for display and never written to game documents. Configure tool timeout to at least 180 seconds; the bridge waits beyond the approval window. Missing summaries get a generated fallback.

Keep document reads in `scripts/read-api.js`, NPC creation in `scripts/create-api.js`, world Item creation in `scripts/item-create-api.js`, authored feat creation in `scripts/feat-create-api.js`, confirmed NPC edits in `scripts/edit-api.js`, confirmed power/equipment effect additions in `scripts/item-effect-api.js`, PC imports in `scripts/pc-import-api.js`, and PC creation in `scripts/pc-setup-api.js`, with a fixed operation allowlist shared through `shared/protocol.js`. Check the current GM role and bridge enablement before access and after awaited operations. Return document data through Foundry serialization, preserving DnD4e 0.9.3 fields without assuming newer system APIs.

The available operations enforce the boundary. Creation supports a new world `NPC` with embedded powers/features in an explicit Actor folder, or one new world Item (`weapon`, `equipment`, `power`, `feature`) in an explicit Item folder. Both persist request fingerprints for safe retries. The required `folder` argument accepts a name, full path or existing ID. `scripts/creation-utils.js` shares serialized folder resolution by document type; create missing folders/parents with awaited `Folder.create` and reject ambiguous names/paths. Validate nested source data through `shared/npc-data.js` or `shared/item-data.js` at both ends; exclude caller-supplied IDs, flags, effects, macros and item-granting links. NPC edits require the paired active GM's before/after confirmation. Other existing world Item edits/deletions, other document updates/deletions, macro execution, explicit rolls, script evaluation, arbitrary runtime traversal and filesystem access remain outside scope. User documents use an explicit safe field list. Settings values are excluded because other modules can store credentials there.

### Adding NPC powers

Use `edit_npc_actor.addPowers: [{key, name, img?, system}]` to create new embedded
powers directly on an existing world NPC. Read actor source first and use the
NPC skill's power fields. Keep each semantic key stable on identical retries;
saved power markers prevent duplicates after partial saves or browser reloads.
Changed data under a saved key is rejected; edit that power by Item ID instead.
The active GM reviews full new powers with the other proposed edits. Inspect
source after incomplete outcomes; responses include `addedPowers` IDs/UUIDs.
Protocol v27 requires reloading Foundry and restarting the companion/MCP clients.

### Confirmed NPC trait deletion

`edit_npc_actor` accepts `deleteTraits: ["embeddedItemId"]` for world NPC Items of type `feature` with stored `system.featureType: "trait"`. Read the actor with `source:true` first and select exact IDs. When moving passive feat/item notes out of Traits, preserve their rules in `system.biography` (Lore Description), then delete the redundant traits in the same request or after verifying the Lore saved. Keep intrinsic creature traits unless the user requested their removal.

The active GM reviews each trait's full source and deletion in the usual Confirm/Cancel dialog; cancel, close and expiry delete nothing. Actor/Item edits save before deletion, and changed source invalidates approval. Do not edit and delete the same ID. Missing IDs are safe no-ops; after an incomplete result, read the actor and retry only the intended remaining traits. Powers, feats, PCs, compendiums, token actors and other deletion targets remain excluded. Protocol v18 requires restarting the companion and reloading Foundry together.

### Confirmed PC basic attack ability

Use `set_pc_basic_attack_ability` with a world PC `uuid` and one ability key (`str`, `con`, `dex`, `int`, `wis`, `cha`) to change both core basic attacks' attack and damage ability. Read stored powers first. It requires exactly one Melee Basic Attack and Ranged Basic Attack, each using `@powerMod` for attack, damage and critical damage. The paired active GM confirms the selector and matching Hit/rules text changes; formulas, weapon use, effects and unrelated fields stay intact. Cancel/expiry or stale source prevents writes. After uncertain or incomplete results, read both powers before retrying; unchanged retries do not prompt. This does not enable arbitrary PC edits. The implementation is in `scripts/pc-basic-attack-api.js` and `shared/pc-basic-attack-data.js`.

PC setup (`setup_pc`) creates a new world Player Character from name/race/class, importing its class and five core powers and applying fixed bonus/HP/layout defaults. It defaults the Actor folder to Player Characters and persists a creation fingerprint; source compendium Items retain their mechanics and effects. PC imports (`import_pc_options`) add selected powers/feats from the named dnd-4e-compendium packs. Both require the paired active GM and DnD4e 0.9.3, reject missing/ambiguous selections and accept no arbitrary caller source data. See [setup-pc](../setup-pc/SKILL.md) for the recipe.

`create_feat` creates an authored `feature` with `featureType: "feat"`, level, flavor/chat `text` and full `description`. It always uses `modules/fox-commons/images/Icons/Items/Documents/Notebook-08_Poneti.webp`; there is no image input. Without `actorUuid`, it creates a world Item in the Feats folder (or explicit Item folder). With `actorUuid`, it creates directly on a world PC and requires the paired active GM; do not combine that destination with `folder`. It accepts no effects, macros or arbitrary source data. Persisted request fingerprints prevent duplicate feats and reject changed data/destinations on retry.

For authored Traits, use `create_feat` with `featureType: "trait"`; unlevelled traits use `level: null`. Omit featureType for feats. Traits appear under Traits and default to the Traits world Item folder when no PC is specified. Their descriptions do not create automated effects or grant linked powers.

Power selections in `import_pc_options` may omit `level` to preserve the source level, including null on unlevelled class/racial powers; supplied levels still override it. Name cleanup handles numbered labels, class-only prefixes and racial Power prefixes.

For Theme Features, use `create_feat` with `featureType: "theme"` and level 1-30. These use the native Theme Features category and default to the Theme Features world Item folder when no PC is specified. Describing a granted power does not create that power; handle any requested power creation separately.

For NPC stat-block mappings, read [dnd4e-npc-actors](../dnd4e-npc-actors/SKILL.md). For world Items, check the pinned system's item schema and `shared/item-data.js`; Automatic Chat Cards use `system.description.chat` for flavor. Protocol v14 includes authored Theme Features; reload the module and restart the companion together.

`scripts/main.js` registers client-scoped settings and owns browser connection/reconnection. `server/bridge.js` owns the loopback listener, browser authentication/origin validation, single paired GM session and browser request correlation/limits. `server/companion.js` owns shared-process startup and shutdown; `companion-hub.js` authenticates adapters, serializes calls and manages idle retirement. `companion-client.js` starts/reuses the shared process and forwards one session's calls without automatic replay. `server/main.js` connects that adapter to MCP tools through the official SDK and handles stdin closure. Pairing credentials stay outside tracked files and are never logged.

Run the module's `npm test` and syntax checks after changes. Tests use doubles and local transports; the user exclusively operates Foundry for live verification. Copy with the repository's copy-module command after changes intended for Foundry.
