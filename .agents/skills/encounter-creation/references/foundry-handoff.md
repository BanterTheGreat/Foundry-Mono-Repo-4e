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

Keep scenario-specific actions and shared encounter mechanics in the Battle
Briefing's environment rules or relevant tactics pointers. NPC actors should
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

- `title` and `description`: the approved encounter name, situation, and enemy
  objective. Keep these and other preset strings plain text.
- `expectedCombatants`: the **enemy actors only**, each as `{actorId, count}`,
  using verified world Actor IDs, with one combined count per actor. Include all
  approved enemies, including hidden enemies and reinforcements; explain arrival
  timing in the tactics. Use the returned Actor ID or the final component of its
  returned world Actor UUID, never a compendium, token, or Combatant ID.
- `strategy.environment`: included terrain/hazard rules and shared battle
  conditions. Leave optional proposals out unless accepted.
- `strategy.pointers`: `{actorIds, notes}` groups associating approved tactics,
  coordination, arrival timing, and retreat conditions with the relevant enemies.
  Reference only actors included in this enemy roster.

Keep deployment slots, starting positions, and deployment coordinates in the
encounter design report only. Exclude them from the entire Battle Briefing,
including turn pointers, description, environment notes, and generated pages.
Turn pointers should focus on decisions and actions during play.

**Exclude the party from the entire briefing:** no PC actors in combatants or
strategy pointers, and no party roster, PC names, levels, or class breakdown in
the text. Party inputs belong in the design report and difficulty calculation.
Use the main skill's tactics guidance for generic, behavior-based target priorities.

Retry journal creation with its identical payload and stable ID after an
uncertain result. Read the returned JournalEntry with `source:true` and verify
`flags.dnd4e-health-display.preset`, enemy IDs/counts, tactics, and party exclusion.
Verify the pages too, and confirm deployment details are absent throughout.
Keep the exact confirmed actor and journal IDs when only
part of the handoff succeeds; report partial completion and resume outstanding
work without recreating successful documents.

Return the created actor and journal names/UUIDs, counts, verification results,
and the NPC skill's deviation/automation report. Explain that the preset can be
loaded through **Prepare Battle Briefing**. Creating it does not place tokens or
start combat; those UI actions remain with the user.
