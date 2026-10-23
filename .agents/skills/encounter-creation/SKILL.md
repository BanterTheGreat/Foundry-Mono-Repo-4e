---
name: encounter-creation
description: Design D&D 4e encounters around difficulty, party levels, enemy goals and battlefield space; use an existing map or propose a read-only grid, validate the roster, and offer approved Foundry MCP enemy and Battle Briefing creation.
---

# Encounter Creation

Build a playable encounter around the enemies' goals and the user's situation.
Use [dnd4e-monster-search](../dnd4e-monster-search/SKILL.md) to select creatures
and [dnd4e-encounter-difficulty](../dnd4e-encounter-difficulty/SKILL.md) to validate
the final roster. These skills own source preferences, monster conversions, XP
math, and difficulty thresholds; follow them rather than substituting estimates.
Load the available `dnd4e-battlemap` skill for its map-design guidance, terrain
categories/colors, scale, and coordinates. This encounter workflow uses that
guidance with the read-only presentation below, rather than its editable-map
workflow.

## Establish the brief

Use the intended difficulty, each participating PC's current level, the encounter
situation, and what the enemies want. Accept optional class details, terrain,
creature preferences, constraints, and desired tone. Infer party size from the
provided level list or explicit count; ask for missing levels/count or intended
difficulty when needed to validate the result. Use supplied class information to
create opportunities for the party without requiring a class roster.

For every new encounter, establish whether the user already has a battlemap.
Always ask when they have not already answered for this encounter; include it in
the initial batch of questions: "Have you already made a battlemap? If yes,
describe its layout and important terrain. If not, can you give me some pointers
about the environment for a hypothetical map?" Wait for the answer before
designing the battlefield or choosing enemies dependent on its layout.

- **Existing map:** use only the map information the user supplies. Ask for
  missing details that affect the design, such as dimensions, entrances,
  obstacles, elevation, or starting areas. Fit the encounter to that space;
  do not create, redraw, replace, or display a battlemap or map legend.
- **No existing map:** use the user's environment pointers and constraints to
  propose a hypothetical battlefield alongside the encounter. If they delegate
  the environment choice, proceed within that scope. The proposal includes the
  read-only grid and legend specified below.

Before designing the encounter, review the full brief for missing or ambiguous
details. Whenever proceeding would require assuming or filling in encounter
details, ask the user to elaborate. This includes the situation, environment,
terrain, who is involved, enemy goals, constraints, and unclear preferences or
difficulty wording. Use information already supplied in the conversation and
distinguish choices the user has explicitly delegated from details still needing
clarification; invent details only within that delegated scope.

Prefer one concise batch of all currently identifiable questions over asking
them one at a time. Wait for the answers before making dependent design choices.
If the answers reveal further ambiguity, bundle the remaining questions into a
follow-up before proceeding. Resolve difficulty wording against the calculator's
labels before claiming a match.

## Design the battlefield and encounter together

Establish the usable space before finalizing the roster, and refine the proposed
map and enemy group together. For an existing map, keep its supplied layout
fixed. Check entrances, starting areas and separation, sight lines, attack ranges,
movement lanes, creature footprints, objective access, and reinforcement routes
against the actual shortlisted powers. Leave room for the entire roster and
party to deploy and maneuver; select proposed dimensions to suit the fight
rather than automatically using the battlemap skill's compact 9-by-9 default.

Use the battlemap skill's six tactical ingredients: multiple routes, cover and
blocking terrain, elevation, difficult terrain, hazards, and interactive
features. For a proposed map, usually combine three or four that fit the
environment and enemy goals. Preserve viable approaches and counterplay; make
choke points deliberate and elevated areas accessible. For an existing map,
look for opportunities in the described features rather than adding new ones.

Tie enemy jobs and tactics to this space: where a screen can hold, how a mobile
enemy changes routes, what protects a ranged position, and what players can
reach, bypass, or exploit. Check that objectives and terrain create meaningful
choices for both sides. Distinguish cover, blocked sight, impassability, and
height, and identify proposed environmental rules as proposals. Account for
terrain pressure separately from the enemy XP rating as described below.

## Assemble and validate the enemy group

Search the local compendium and read shortlisted stat blocks. Favor a coherent,
fun mix of creatures and combat roles whose abilities support the enemy goal.
Give the group a reason to cooperate and distinct jobs in the fight. Prefer no
more than **four distinct monster stat blocks**, or **five if at least one is a
minion**. This is a variety preference, not a cap on total creatures; count
reskinned copies with identical mechanics as the same type. Vary roles and
creature identities where they fit rather than forcing unrelated species into
the encounter. Honor an explicitly requested simpler or different composition.

Keep role synergy as a secondary consideration, behind the situation, enemy
goals, fun, and requested difficulty. Use actual stat-block powers to identify
useful cooperation; role labels suggest possibilities rather than guaranteeing
them. Common pairings include soldiers screening artillery or occupying PCs for
skirmishers, controllers positioning or restraining targets for brutes or
artillery, and frontline threats giving lurkers openings. Leader-tagged monsters
can support these groups through their specific buffs or granted attacks. Favor
natural opportunities without forcing an optimized combination into every fight.

Include minions in nearly every encounter unless they genuinely clash with the
situation or the user's requested composition; briefly explain an omission.
They can form a substantial group or be just **2-3 extra fodder creatures**
alongside the main enemies. Give them a fitting identity and job, such as
screening, flanking, guarding an objective, or adding expendable bodies. Include
even these small additions in the final roster and XP validation below.

Run the encounter-difficulty helper with the complete proposed roster: exact
counts, final levels, and ranks, including hidden enemies and planned
reinforcements. Adjust the group and rerun until its returned difficulty matches
the requested target. Recalculate after every roster change; the reported rating
must describe the final version. Resolve warnings rather than presenting a
partial XP total as validation. Explain any constraints preventing a match and
offer a concrete alternative without calling it a validated match.

Optional environmental hazards, terrain interactions, or encounter gimmicks
should support the situation and give players understandable choices. Describe
their triggers, effects, timing, counterplay, and how enemies use them. Mark each
as proposed or included. Distinguish the calculator's **enemy XP rating** from
the additional pressure of terrain, objectives, or hazards; its roster helper
does not price hazards. Avoid claiming those additions were numerically validated
by the monster-only calculation. For waves, discuss simultaneous pressure and
recovery opportunities separately from the full encounter's XP rating.

## Present a reviewable encounter

Use the following report order and format. Omit creature sources and compendium
links from user-facing reports, including the stat blocks. Source preferences and
conversion rules still govern creature selection and preparation internally;
this report format takes precedence over the supporting skills' output formats.

1. Start with a horizontal rule (`---`), then the **validated difficulty**.
   Keep supporting difficulty figures compact alongside it: encounter level and
   difference from party level, total enemy XP versus party budget, and any
   material assumptions or extra pressure beyond the enemy XP rating.
2. Show a roster table with exactly these three columns:
   **Amount - Name - Role** | **Short Summary** | **Total XP**.
   Prefix each first-column entry with its alphabetical creature-type ID:
   `A`, `B`, `C`, and so on in roster order (continue with `AA` after `Z`).
   Label individuals `A.1`, `A.2`, `B.1`, including `.1` for unique creatures.
   Keep IDs stable through revisions and consistent across the roster, map,
   deployment, and tactics. This encounter format overrides the battlemap skill's
   numeric IDs. Assign IDs even without a proposed map. Use one row per distinct
   stat block, a brief description of its job in the
   summary column, and the whole group's XP in the last column. Include a total
   row for encounter XP.
3. Summarize the encounter's situation and central idea in **six sentences
   maximum**.
4. **GRID BATTLEMAP**, only when the user has no existing map: place the proposed
   read-only square grid immediately below the short summary, with **Legend** and
   **Deployment** side by side directly beneath it, before enemy objectives.
   Use two equal-width columns: the terrain legend on the left and the deployment
   table on the right, aligned at the top. On narrow screens, stack them with the
   legend first. Label dimensions as columns by
   rows, use 5-foot squares unless otherwise requested, and show one-based row
   and column coordinates. Mark entrances, starting areas, objectives, and
   tactically significant features; distinguish creature markers from underlying
   terrain. Use the battlemap skill's **Legend, creature IDs, and deployment**
   table columns, using this skill's alphabetical IDs and two-column layout.
   Keep one deployment row per creature. Explain every used symbol/color,
   including heights and access
   points. Use the battlemap skill's terrain colors when rendering
   colored cells, with symbols so color is not the only cue. Prefer an inline
   read-only grid when supported; otherwise use an aligned monospaced text grid
   with the same coordinates and legend in this report position. Include no
   painting, palette-editing, or reset controls. Verify dimensions, legend
   coverage, reachable routes/features, creature space, and agreement with the
   roster and tactics. Omit this entire item for an existing map; when describing
   deployment on that supplied map, still use the same alphabetical creature IDs and
   deployment table, with positions based on the user's map information.
5. **ENEMY OBJECTIVES**: explain the enemy party's overall goal in **two or three
   sentences maximum**, including victory, retreat, or surrender conditions
   where appropriate.
6. **TACTICS**: give a general, playable account of who does what, how the group
   cooperates, its target priorities, and its use of actual powers and terrain.
   Prefer this overview to a turn-by-turn script. Tie choices to enemy motives
   and intelligence, with adaptable priorities if an opening is unavailable.
7. If the fight has a major shakeup, add a descriptive heading and explain its
   trigger and effect on the fight, such as reinforcements, a phase change, or
   shifting terrain. Omit this section when none applies.
8. **SPECIAL RULES**, only when applicable: give the encounter's special rules,
   including hazard/gimmick triggers, effects, timing, counterplay, and enemy
   use. Mark optional proposals versus included rules and identify manual
   adjudication instead of inventing unsupported mechanics or automation.
9. Finish the encounter details with monster stats in a **collapsed-by-default**
   section, using `<details>` with `<summary>Monster stats</summary>` and no
   `open` attribute. Include a complete usable stat block per distinct creature:
   level, role, rank, XP, HP, defenses, speed and other movement, initiative,
   senses, traits, powers, attacks, damage, action types, recharge/use limits,
   and other relevant statistics. For converted creatures, present the final
   revised values and identify mechanical adjustments without citing sources.

In both the report and Battle Briefing, describe targets by observable behavior,
position, or immediate threat, without naming specific PCs or party classes:
for example, "the skirmisher pressures anyone supporting from the backline."

After presenting the encounter, ask whether the user wants to use the available
`generate-npc-image` skill for all creatures or any selected creatures in the
encounter. Let them select by roster name or alphabetical creature ID. Explain that
the skill writes Midjourney portrait prompts, and wait for their selection before
loading and applying it to the requested creatures. Include this offer alongside
the Foundry insertion question below so it is offered even without insertion.

End the report by asking whether to insert this encounter into Foundry using MCP,
creating its enemies and a Battle Briefing Journal. If the destination Actor
folder is not already specified, ask for that folder in the same closing
question. State that the briefing will contain the enemy roster and tactics and
will exclude the party. This approval gate is explicitly requested by the user:
present the full encounter before asking, and wait for agreement before writes.

## After approval

Follow [the Foundry handoff](references/foundry-handoff.md) to create and verify
the approved enemies and native Battle Briefing preset. Carry approval and any
specified folder across turns; ask only for genuinely missing destination
information. Changes to the user's reviewed composition should return to a
revised report and difficulty check before insertion.
