# Changelog

## Unreleased

- Edit existing DnD4e 0.9.3 world NPC stats, names, portraits and embedded powers/features through MCP, including attaching a native on-hit Marked effect that records the source actor and ends at the end of its next turn. Require the paired active GM to confirm a complete before/after popup before saving; cancel, close and expiry leave the NPC unchanged. Reject stale approvals, prevent duplicate mark templates on retry and report partial save failures.
- Upgrade the bridge to protocol v3 for confirmed NPC edits. Restart the companion and reload Foundry together; allow at least 120 seconds for MCP tool calls while the GM reviews a request.
- Clarify that the client-scoped MCP connection setting starts and stops local bridge retry attempts, so a GM can silence expected browser-console errors while the companion is off.

## 0.2.0

- Create new DnD4e 0.9.3 NPCs with source stats, embedded powers and traits, and correctly sized prototype tokens. Require an explicit destination folder name/path or ID; reuse matching Actor folders and automatically create missing folders and parents.
- Persist creation request fingerprints to prevent duplicate NPCs on retries after timeouts, disconnections or browser reloads.
- Add a system-source-based NPC configuration skill and complete Shadow Troll example for importing pasted stat-block images.
- Replace the read-only bridge label with explicit read/NPC-creation capabilities; protocol v2 requires restarting the companion and reloading Foundry together. Existing-document changes and script execution remain unavailable.
