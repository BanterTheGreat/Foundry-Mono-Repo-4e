# Approved Foundry handoff

Read [dnd4e-npc-actors](../../dnd4e-npc-actors/SKILL.md) and its field reference
before preparing actors. Use the exposed Foundry MCP schemas and the repository's
[journal/preset documentation](../../../../src/foundry-mcp/README.md#journals-and-battle-briefing-presets)
for the current supported payload. Load
[foundry-mcp](../../foundry-mcp/SKILL.md) if tools are missing or connection fails.
This workflow uses MCP document operations; the user operates the Foundry UI.

## Create the enemies

After approval, discover the tools and call `get_session` to verify the intended
world, GM, and supported DnD4e version. Confirm that `create_npc_actor`,
`create_journal` with `battleBriefing`, and document reads are available before
starting writes. Report a missing capability; do not substitute a plain journal
and claim it is a native preset.

Use the user-specified Actor folder (name, full path, or ID); collect it if still
missing. Create one world NPC per distinct approved stat block with its complete
powers and traits, using the **final revised stats** for converted monsters.
Represent repeated enemies with the briefing's counts rather than duplicating
identical world actors. If the user wants existing actors reused, discover and
read them and verify their mechanics match before using their IDs; do not modify
existing actors as an implicit part of creation.

Keep scenario-specific actions and shared encounter mechanics in the Encounters
Journal chapter. NPC actors should
contain their own stat-block powers and traits; do not duplicate scenario actions
across the actors unless the user explicitly requests actor-sheet entries.

Give each creation a unique stable `requestId`, retaining the exact arguments
and returned UUID. After timeouts, retry identical arguments with the same ID to
avoid duplicates. Verify each resulting actor as the NPC skill requires before
creating the briefing. Report and resolve mismatches rather than recording an
incorrect actor as the approved creature.

## Create the Battle Briefing Journal

Use `create_journal` with `requestId`, `name`, and the structured `battleBriefing`
argument. Omit `folder` and `pages` for this mode: the tool creates the native
preset in **Battle Briefings** with a generated summary page. It requires active
DnD4e Info Displays (`dnd4e-health-display`).

Populate:

- `title`: the approved encounter name as plain text.
- `expectedCombatants`: the **enemy actors only**, each as `{actorId, count}`,
  using verified world Actor IDs, with one combined count per actor. Include all
  approved enemies, including hidden enemies and reinforcements; explain arrival
  timing in the tactics. Use the returned Actor ID or the final component of its
  returned world Actor UUID, never a compendium, token, or Combatant ID.
- Supply only title and expectedCombatants for encounter presets. Put tactics,
  environment rules, objectives and other prose in the Encounters chapter below.
  Leave strategy and other optional presentation fields unset.

Keep deployment slots, starting positions and coordinates in the encounter report
and Encounters chapter rather than the loadable preset.

**Exclude the party from the entire briefing:** no PC actors in combatants or
strategy pointers, and no party roster, PC names, levels, or class breakdown in
the text. Party inputs belong in the design report and difficulty calculation.
Use the main skill's tactics guidance for generic, behavior-based target priorities.

Retry journal creation with its identical payload and stable ID after an
uncertain result. Read the returned JournalEntry with `source:true` and verify
`flags.dnd4e-health-display.preset`, title, enemy IDs/counts, and party exclusion.
Verify the pages too, and confirm deployment details are absent throughout.
Keep the exact confirmed actor and journal IDs when only
part of the handoff succeeds; report partial completion and resume outstanding
work without recreating successful documents.

## Add or revise the Encounters chapter

Discover the world JournalEntry whose exact name is **Encounters** and read it
with `source:true`, including pages. Reuse it wherever it is filed. If multiple
exact matches exist, resolve the intended UUID before writing. If missing, create
a private journal named **Encounters** with the encounter as its first text page;
use an existing suitable campaign JournalEntry folder, or an **Encounters** folder.

Use one named text page per encounter. Read existing chapters for formatting:
the established **Grappa's Safehouse** and **Toll Bridge** examples use a short
situation paragraph, descriptive headings and concise, connected GM prose.
Link roster names to verified actors with `@UUID[Actor.<id>]{Name}`.

Include the full approved write-up: difficulty, enemy roster/counts, situation,
read-aloud text when supplied, terrain and deployment, objectives, tactics,
reinforcements or phase changes, accepted special rules and manual handling,
morale, rewards, evidence and aftermath as applicable. Preserve the reviewed
mechanics and distinguish optional proposals from included rules. Omit monster
stat blocks because the actors hold them. Use behavior-based tactical targets.

For an existing journal, use `edit_journal_pages` to add a chapter, or update the
exact existing page ID when revising that encounter. Match its known ID or exact
title and resolve ambiguous matches before writing. Preserve unrelated chapters.
Follow the tool's active-GM confirmation. Retain stable request IDs and identical
payloads across uncertain retries. Confirm this tool is available before writes.

Read back the journal to verify chapter content, actor links, absence of stat
blocks and preservation of unrelated pages. Retain confirmed actor, preset,
journal and page IDs after partial success; resume only outstanding work.

Return the created actor and journal names/UUIDs, chapter ID, counts, verification results,
and the NPC skill's deviation/automation report. Explain that the preset can be
loaded through **Prepare Battle Briefing**, while **Encounters** holds the GM
write-up. Creating it does not place tokens or
start combat; those UI actions remain with the user.
