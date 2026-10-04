---
name: dnd4e-npc-actors
description: Configure DnD4e 0.9.3 NPC actors and embedded powers from stat-block images or text, including creation through Foundry MCP.
---

# DnD4e NPC Actors

Use this skill when translating a monster stat block into a Foundry NPC. These mappings were checked against tag `0.9.3`, commit `3476b34c1c2b4e3d1cb1e3a780eb4c3a4ae5e156` of [EndlesNights/dnd4eBeta](https://github.com/EndlesNights/dnd4eBeta/tree/0.9.3). Read [the field reference](references/npc-fields.md) before preparing actor or item source data.

## From a pasted stat block to an actor

Read the attached image directly. Transcribe the header, creature classification, numerical stats, ability scores, skills, resistances, languages, traits and every action. Preserve requirements, triggers, recharge conditions, hit/miss/effect text, durations and exceptions. Ask about illegible values rather than guessing. A stat-block screenshot is a data source; use a separate supplied artwork path for an actor portrait.

Use `get_session` to confirm the intended world, GM and DnD4e version. The user must specify the destination folder when requesting creation; ask for it if missing. Pass the name or full path (e.g. `Monsters/Trolls`) as the required `folder` argument. The tool reuses the Actor folder or automatically creates it and missing parents. Existing folder IDs are also accepted. For ambiguous names, discover folders and their parent chains and use a full path or ID chosen by the user. Example request: "Create this NPC in Monsters/Trolls."

Prepare `create_npc_actor` arguments using nested source data, a unique `requestId`, the chosen `folder`, and embedded `power`/`feature` items. Read the tool schema for supported fields; it intentionally accepts a subset of native system data. The tool forces simple NPC math and derives tier and token dimensions. Read all numbers as printed totals, then map them to the correct source fields in the reference. Set every skill base: listed totals from the block, unlisted skills to the associated ability modifier plus half level. Defaults otherwise leave unlisted NPC skills at zero.

Populate each power's flavor field using the Automatic Chat Cards mapping in the field reference, including utility actions and separate attack modes. Preserve conditional and compound mechanics as descriptions. Double attacks, grabs, regeneration suppression, target conditions and unusual immunities need manual adjudication unless a separate automation implementation is explicitly requested. The creation tool accepts no effects, macros or item-granting data. Configure ordinary attack and damage formulas for the system's roll buttons; creation itself does not click them.

After a successful creation, read the returned actor UUID with `source: false` and compare prepared HP, bloodied value, defenses, initiative, skills, movement, saves, resistances and the complete item list to the block. Inspect `source: true` when diagnosing a mismatch. The user operates Foundry and tests the sheet/buttons; do not automate Foundry.

If a request times out or disconnects, keep the exact payload and `requestId` for retry. The actor stores the request fingerprint, so a retry returns its original UUID. Changing data under that ID is rejected. A fresh ID means an intentional new actor. Creation does not update an existing NPC; report mismatches rather than silently making another copy.

The [Shadow Troll fixture](../../../src/foundry-mcp/test/fixtures/shadow-troll.json) is a complete example translated from the user's screenshot: one trait and four powers. Replace its example folder and request ID for real use.
