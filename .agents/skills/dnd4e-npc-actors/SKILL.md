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

Populate each power's flavor field using the Automatic Chat Cards mapping in the field reference, including utility actions and separate attack modes. Preserve full rules text alongside automation. The creation tool accepts no effects, macros or item-granting data. Configure ordinary attack and damage formulas for the system's roll buttons; creation itself does not click them.

### Required power automation

An instruction to add an NPC to the user's Foundry world includes immediately configuring its powers' Triggers, Target Automation and Active Effects wherever supported. Do this as part of the same task after creation, using the saved embedded Item UUIDs; do not wait for a separate automation request. Read [foundry-mcp](../foundry-mcp/SKILL.md) for the tool boundaries and [dnd4e-active-effect-keys](../dnd4e-active-effect-keys/SKILL.md) before authoring effects.

- Read the actor and powers with `get_document`, `source:true`. Use `get_trigger_automation` and `get_target_automation` to discover installed support and current configuration before their respective edits.
- Configure applicable triggers through `edit_trigger_automation`, targeting rules through `edit_target_automation`, and effect templates through `add_item_effects`. Discover condition IDs with `list_conditions` when needed. Follow each tool's supported schema and GM confirmation workflow.
- Assess all three categories for every power. Preserve exact trigger conditions, target restrictions, effect recipients and durations. Do not substitute unconditional or broader automation for unsupported conditional rules. Powers without an applicable trigger, target selection or effect need no invented configuration.
- If any category or mechanic cannot be automated because a tool, module, trigger, filter or other specific support is missing, report the affected power, unsupported part and reason. Preserve that mechanic in rules text, complete the supported parts, and continue with the other powers. A limitation on one power must not stop the remaining work.
- Read back saved automation and effects to verify them. Include unsupported mechanics, manual steps and any unverified or declined changes in the final deviation report; distinguish saved configuration from behavior requiring enabled world settings or manual adjudication.

After a successful creation, read the returned actor UUID with `source: false` and compare prepared HP, bloodied value, defenses, initiative, skills, movement, saves, resistances and the complete item list to the block. Inspect `source: true` when diagnosing a mismatch. The user operates Foundry and tests the sheet/buttons; do not automate Foundry.

Always include a deviation report in the final response after NPC creation. Track choices while preparing the payload and compare the verified actor to the user's supplied creature and instructions. Account for every assumption, inferred or defaulted value not supplied by the user, changed value or formula, substituted representation, omitted detail, and mechanic preserved only as descriptive text rather than automation. For each, state what the user supplied (or that it was unspecified), what was entered in Foundry, and why. Group identical decisions when that still accounts for every affected field or power. Distinguish equivalent field mappings that preserve the supplied behavior from actual changes; ordinary source-field conversions do not need individual entries. Report any remaining verification mismatch or inability to verify, and identify anything requiring manual adjudication. When there are no deviations, explicitly say "No deviations from the supplied creature." When there are no limitations, say so explicitly.

If a request times out or disconnects, keep the exact payload and `requestId` for retry. The actor stores the request fingerprint, so a retry returns its original UUID. Changing data under that ID is rejected. A fresh ID means an intentional new actor. Creation does not update an existing NPC; report mismatches rather than silently making another copy.

The [Shadow Troll fixture](../../../src/foundry-mcp/test/fixtures/shadow-troll.json) is a complete example translated from the user's screenshot: one trait and four powers. Replace its example folder and request ID for real use.
