# Changelog

## 0.4.0

- Read scene drawings, including hidden shapes and labels, through document reads. Add native rectangle drawings with optional text, visibility and appearance controls through `add_scene_drawings`, with active-GM confirmation, stale-scene rejection and persisted partial-batch retry protection. Preserve existing drawings and scene data.

- Create private world text Journals and native Battle Briefing presets with `create_journal`, including expected actor counts, portrait framing and reusable strategy notes. Validate destinations and actor references, generate preset summaries, and persist receipts for safe retries.

- Build standalone magic weapons, implements, armor and equipment from exact base/variant compendium UUIDs with `build_magic_item`, adapting DnD 4e Compendium's Build Magic Item merge rules. Preserve base mechanics, variant properties and native critical damage/effects, apply masterwork AC and suitable art, and persist creation receipts without temporary Items. Reuse the same merger for confirmed merchant additions with `baseUuid`.
- Manage Item Piles world NPC merchant inventory with paginated stock reads and GM-confirmed additions, removals and absolute quantity changes. Preserve source mechanics and Item Piles properties, reject stale approvals, persist retry receipts, and report partial saves. New additions remain separate stock entries; prices, currency and infinite-stock configuration stay outside this tool.
- Give all edit confirmations two minutes, with a plain-language change summary above the detailed diff/effect report. Keep the bridge waiting beyond the approval window, reject late clicks even when browser timers lag, and allow agent-authored summary text on NPC edits, PC basic attacks and Item effects.
- Set the attack/damage ability of both core basic attacks on world PCs through `set_pc_basic_attack_ability`, with GM confirmation, matching rules text, stale-source rejection and partial-write recovery. Preserve weapon formulas, effects and unrelated fields.
- Remove explicitly selected embedded NPC traits through `edit_npc_actor`, with the active GM's usual confirmation showing full trait source before deletion. Preserve Lore edits before removal, reject stale approvals and non-trait targets, and report partial deletions with safe retries.
- Replace default chest icons on world PC and Item Piles NPC merchant equipment with slot-specific feet/head/arms/neck/waist/hands icons through `fix_pc_item_icons`. Preserve custom images and unsupported slots, report saved changes and allow safe retries.
- Add powers, feats, rituals and magic items from dnd-4e-compendium to existing world PCs through `import_pc_options`, with per-item levels, imports from Equipment Powers as well as Powers, automatic class/level title cleanup, name or entry-ID selection, ambiguity reporting, existing-item detection and recovery from partial imports. Preserve compendium mechanics and effects, retain source power/ritual levels when no override is supplied, and clean class/racial prefixes on unlevelled powers.
- Create configured world PCs with `setup_pc`: race/class text, a class from Classes, five Powers (Core) actions, enabled tier bonuses to attack/Fortitude/Reflex/Will, automatic HP and modern action grouping with usage sorting. Include the reusable `setup-pc` skill.
- Create authored feats, traits or Theme Features with `create_feat`, including level, flavor/chat text, full description and a fixed notebook image. Save in a world Item folder or directly on a PC, with persistent retry protection across destinations; support unlevelled traits in the Traits category.
- Import native inventory from explicitly selected compendium packs, preserving levels, enhancements, quantities and effects while adding items unequipped. Detect inventory duplicates by source so same-name variants can coexist.
- Add native ActiveEffects to powers and equipment, including Items on PCs/NPCs, through `add_item_effects`. Support description-only reminders and condition shortcuts that copy configured Name, Icon, and Mods like the native UI buttons without repeating condition descriptions. Discover condition IDs and details through `list_conditions`. Review one client report with modifiers, application types, durations, conditions, ongoing damage and manual limitations before Confirm; cancel/close or a two-minute expiry saves nothing. Preserve existing effects, skip matching effects on retries, reject stale Item or condition approvals and report partial writes.
- Author Aura Effects auras on powers/equipment through validated settings for distance, display/color, recipient filters, source evaluation, collisions and stacking. Support visual-only auras without recipient copies, keep bearer protections separate, show settings in GM confirmation, and reject unsupported module schemas or changed aura retries. Damage triggers and early dismissal remain manual.
- Upgrade to bridge protocol v24; restart the companion and reload Foundry together. Allow at least 180 seconds for tool calls that await approval.

## 0.3.0

- Edit existing DnD4e 0.9.3 world NPC stats, names, portraits and embedded powers/features through MCP, including attaching a native on-hit Marked effect that records the source actor and ends at the end of its next turn. Require the paired active GM to confirm a complete before/after popup before saving; cancel, close and expiry leave the NPC unchanged. Reject stale approvals, prevent duplicate mark templates on retry and report partial save failures.
- Create DnD4e 0.9.3 world weapons, equipment, powers and features in an explicit Item folder through `create_item`, with nested source validation, shared folder resolution and persistent retry protection. Include a level 16 +4 Hammer of the Lost Riders warhammer example.
- Upgrade the bridge to protocol v4 for world Item creation and confirmed NPC edits. Restart the companion and reload Foundry together; allow at least 120 seconds for MCP tool calls while the GM reviews a request.
- Clarify that the client-scoped MCP connection setting starts and stops local bridge retry attempts, so a GM can silence expected browser-console errors while the companion is off.

## 0.2.0

- Create new DnD4e 0.9.3 NPCs with source stats, embedded powers and traits, and correctly sized prototype tokens. Require an explicit destination folder name/path or ID; reuse matching Actor folders and automatically create missing folders and parents.
- Persist creation request fingerprints to prevent duplicate NPCs on retries after timeouts, disconnections or browser reloads.
- Add a system-source-based NPC configuration skill and complete Shadow Troll example for importing pasted stat-block images.
- Replace the read-only bridge label with explicit read/NPC-creation capabilities; protocol v2 requires restarting the companion and reloading Foundry together. Existing-document changes and script execution remain unavailable.
