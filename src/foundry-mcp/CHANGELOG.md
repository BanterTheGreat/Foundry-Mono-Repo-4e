# Changelog

## Unreleased

- Clarify that the client-scoped MCP connection setting starts and stops local bridge retry attempts, so a GM can silence expected browser-console errors while the companion is off.

## 0.2.0

- Create new DnD4e 0.9.3 NPCs with source stats, embedded powers and traits, and correctly sized prototype tokens. Require an explicit destination folder name/path or ID; reuse matching Actor folders and automatically create missing folders and parents.
- Persist creation request fingerprints to prevent duplicate NPCs on retries after timeouts, disconnections or browser reloads.
- Add a system-source-based NPC configuration skill and complete Shadow Troll example for importing pasted stat-block images.
- Replace the read-only bridge label with explicit read/NPC-creation capabilities; protocol v2 requires restarting the companion and reloading Foundry together. Existing-document changes and script execution remain unavailable.
