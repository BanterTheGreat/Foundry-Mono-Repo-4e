# Feature Inventory

## Character Builder (shared core preview)

- Shared class authoring (#30/#31): Fighter’s full flavor, statistics, proficiencies, nine features, three granted powers and two explanatory rules live in validated JSON and render its Typst chapter. Initial power counts are shared advancement data; class-independent entry choices, collection/preparation shapes and selection modifiers have exceptional-class schema fixtures. Deterministic authoring export preserves explicit unsupported coverage; runtime interpretation, remaining classes and production package conversion remain #32–#35. Existing feat/path data is unchanged by the class migration. See [class contract](src/modern4e/content/classes/README.md).

- Feat selection authoring (#29): feat JSON/catalog schema v2 explicitly stores occurrence limits and separate granted choices. Armor Proficiency, Weapon Proficiency, Skill Training, Linguist and Adaptable Breath have validated advancement/distinct-choice constraints, character/entry/power scopes and exhaustion policies; Typst and the authoring export generate identical repetition text. Weapon pools preserve the superior-weapon/simple-and-military-bundle alternative. Language/weapon option catalogs remain pending, and v1 runtime enforcement remains unimplemented. Class JSON/progression is unaffected. See [selection contract](docs/modern4e-selection-rules.md).

- Shared Modern 4e feat authoring (#28): all 818 entries carry persistent `modern4e.feat.*` IDs, explicit general/class/ancestry access and validated prerequisite trees (AND/OR, level, points, proficiencies, entry references, class sources, size and selected-content queries). Typst generates requirement text from the same definitions; `content/build.py --modern-feats` exports a deterministic authoring catalog with section order and explicit unresolved-reference diagnostics. Same-title variants remain distinct; descriptions and book curation are preserved. This is build-time migration data, not an enabled runtime package: eligibility integration, effects, deduplication and existing-character migration remain [#29](https://github.com/BanterTheGreat/Foundry-Mono-Repo-4e/issues/29).

- Shared content reconciliation reports changed definitions/revisions and unavailable saved occurrences, exposes details only for available definitions, and preserves unresolved provenance through edits/export. Explicit acknowledgment advances available baselines; package-order previews show recalculated diagnostics and affected selections, support discard-to-cancel, and reject stale character commits. Includes inventory and replacement history; UI wiring remains in the platform workflow tickets. See `src/character-builder/shared/BUILDER.md`.

- Shared builder operations create/edit level-1 and direct level-2 characters, preserve stable occurrences and dependent decisions, recalculate after identity, Modern 4e allocation/proficiency/background, equipment and manual-adjustment edits, and offer eligible entry choices with explicit acceptance of invalid/incomplete choices. Invalid and missing selections remain exportable; progression beyond level 2 and UI wiring remain outside this slice. See `src/character-builder/shared/BUILDER.md`.

- Android runtime adapters (#14): locked private JSON journal commits characters and recovery copies together; create conflicts and stale replacements fail explicitly, deletion retains backups, and shared import/recovery actions restore or copy documents. Generated packages ship byte-for-byte as app assets. Storage Access Framework open/create adapters pass imported JSON to shared handling and validate exports before writing; cancellation and IO/permission failures return structured results. Builder UI wiring remains #17.
- Provisional Fighter levels 1–2 proof: published ancestry, feat, powers and equipment IDs/citations; real Modern 4e background and free proficiencies; four portable samples and a complete coverage manifest. A separately named architecture-test override adds +1 Medicine at level 2 (8 → 9). Identical static bundles ship in web/Android asset directories; JVM/JS golden tests cover expected totals, incomplete mechanics and missing overrides. Combat effects, equipment penalties and ability-dependent health/defenses remain explicitly incomplete. See [proof inputs and hand calculations](src/character-builder/content/FIGHTER-PROOF.md).

- Deterministic offline compendium production in `src/character-builder/content/`: safe JSONP parsing, unchanged source HTML/IDs/publications/references, lightweight browse indexes and lazy entry chunks using the existing v1 contracts. Validates authored mechanics, duplicates, dependencies and references with source locations; absent automation is explicitly UNIMPLEMENTED. Includes a partial Modern 4e Fighter/feat proof, an authored direct-point prerequisite, modern proficiency adaptations and a small demonstration whole-entry override. Generated proof bytes load unchanged on JVM/JS; full source extraction is available separately. Runtime catalog/UI, full rules automation and general score conversion are not supplied by this pipeline.

- Standalone `src/character-builder/` Kotlin Multiplatform core, React/TypeScript web shell and native Compose Android shell. The web shell displays the deterministic smoke fixture; Android now has native Home, character library/import/recovery and Character Overview screens; the web uses a generated plain-data JS/TypeScript boundary. Versioned shared character/content contracts and a strict character codec now preserve Modern 4e ability points, sourced proficiency choices, unresolved entries, retraining, equipment and manual adjustments. Package contracts include indexes/chunks, closed mechanical data, coverage, deterministic SHA-256 definition fingerprints and structured unavailable results. Content/storage/file exchange interfaces are defined; Android adapters now provide private atomic JSON persistence, retained recovery snapshots, bundled generated packages and platform document exchange. Application editing/UI workflows and offline provisioning remain separate work.
- Checked-in character, proof Fighter and small override contract fixtures run identically on JVM/JS, including serialization, choice-slot identity, missing-content preservation and fingerprints. The proof is partial contract data, not an automated playable class.
- Portable character codec rejects invalid JSON number syntax and unescaped string controls before decoding. Explicit model annotations enforce nonblank opaque identifiers/revisions independently of property names. It validates required fields, exact JSON types and calendar-valid timestamps. Unsupported versions, unknown or duplicate fields and malformed documents return structured errors before any persistence; omitted optional fields use contract defaults. Checked exports and JSON result wrappers for web preserve all decisions and unresolved content. Codec tests cover repeated exchanges and failure cases on JVM/JS and the compiled web boundary; platform adapters are implemented separately below.
- Shared catalog applies standard content then each character's ordered packages with whole-entry overrides; searches metadata without loading descriptions; resolves lazy details/references with supplier and fingerprint. Missing/cyclic or revision-incompatible dependencies exclude affected packages with diagnostics while unrelated content stays accessible. Saved custom selections require their expected supplier and entry; deliberate switches can adopt another definition. Changed fingerprints request acknowledgment without marking selections invalid. Incomplete automation remains explicit; UI catalog screens remain pending.
- Pure shared proof engine evaluates levels 1-2 from resolved content: stable grants/choice slots, eligibility diagnostics, Modern 4e direct-point allocation (main 4, non-main 5/cap 2 with optional tradeoff), background/free proficiency slots and explained ability/skill contributions with a single +5 proficiency bonus. Typed/untyped modifiers retain applied/suppressed explanations; manual contributions use `Manual Adjustment`. Missing definitions and cycles cannot masquerade as zero. Partial mechanics, ambiguous proficiency replacements, self-dependent/historical prerequisites and unsupported higher progression remain explicit diagnostics; full-class automation remains incomplete; Android displays shared calculations and contributors in its native overview.
- Shared import coordination validates complete files before storage, previews ID collisions with character details/timestamps, and supports explicit replace/copy/cancel. Replacement requires atomic recovery retention and an unchanged expected document; recovery copies can be discovered and restored through the same preview workflow. Failures remain explicit. Web and Android persistence adapters are implemented; application UI wiring remains pending.
- Browser adapters: IndexedDB character CRUD with atomic complete-document comparison, strict-durability recovery/replacement, retained discoverable backups and explicit quota/database errors; generated bundled JSON metadata/lazy chunks feed the shared catalog. Native file selection feeds the shared decoder/import coordinator, and downloads use the shared codec. Chromium tests cover contract behavior, reloads, rollback, collisions, copying, restoration, malformed files and export round trips. These are adapter APIs; builder UI and offline application caching remain pending.
- Automated common JVM/JS fixture tests, compiled JS boundary/web rendering tests, and Android Compose instrumentation smoke test. CI builds both shells and runs an emulator check.
- Android presentation structure (#27): app shell delegates to `ui/screens`, `ui/dialogs`, `ui/components` and `ui/theme`; retained workflow state remains in `BuilderSession` and rules remain in shared Kotlin.
- Android Home and Character Overview (#22/#23): printed-rulebook palette with a solid oxblood wrench at the top-right for the Settings placeholder, character library with rectangular rows, day–month–year dates and right-aligned trash icons requiring explicit Delete/Cancel confirmation, persisted proof creation, SAF import with explicit collision replace/copy/cancel and retained recovery storage. Successful deletion refreshes the list; failed deletion opens a blocking error modal requiring return to the main menu. Retained recovery copies survive deletion. Recovery controls are hidden from the character list pending a future Settings screen. The overview contains matched-height level/portrait panels, Speed with right-aligned Size, editable gender/age/deity/languages, Modern 4e abilities, proficient skills and tappable notes without a separate Edit label. Identity fields persist through native Save/Cancel dialogs; blank additions are omitted from v1 JSON so legacy documents keep their representation. Overview, Progression and Validation tabs support taps and horizontal swipes with sliding transitions; Progression now presents the native advancement folio and Validation owns rules diagnostics. Equipment, manual-adjustment, contributor, selection/description and raw-calculation controls are hidden from this simplified overview; existing saved data and shared operations remain intact. Edits appear only after durable saves. Operational errors block further work until Return to main menu clears the active session; activity recreation retains the active session/draft. Success and cancellation messages are silent; operational failures use a nondismissible error modal with a single Return to main menu action. Scrollable lists, Overview, Validation and modal content show a slim oxblood scrollbar over a muted parchment rule when content overflows; the thumb tracks position and remains visible for long content. Modals fade in 90ms. Export, package switching and content acknowledgment UI remain pending under #17.
- Manual check: launch Android, tap Your Characters, create/open a character, edit personal details or notes with Cancel/Save, reopen, and swipe between Overview, Progression and Validation. Import files and review timestamp/collision decisions; recovery storage remains retained, with UI access deferred to Settings. Progression shows origin editors, power tallies, level banners, allocation/skill boxes, catalog entry/feat sheets and upcoming levels. The web shell remains unchanged.

## Dungeondraft map artifacts

- Cauldron Hill complex v11: `output/maps/cauldron-hill-complex-v11/`, reduces the shared four-level canvas from 174 x 96 to 112 x 90 squares and centres each level without scaling rooms or changing internal geometry. PNGs have separate tight crops. Tests compare every entity against its translated v10 counterpart and check room bounds, sprite clipping, terrain preservation and native multilevel rules.

- Cauldron Hill complex v10: `output/maps/cauldron-hill-complex-v10/`, uses four native levels: Ground, Lake Entrance, Upper Borne Chamber and VIP Suites. Preserves v9 entity coordinates, props, floor scales and lantern layering; splits shared walls/doorways safely and isolates terrain per level. Tests cover room ownership, lossless object/floor migration, wall coverage, portals, terrain and the multilevel format. Native rendering remains a manual check.

- Cauldron Hill complex v9: `output/maps/cauldron-hill-complex-v9/`, moves wall lanterns to layer 300 beneath walls. Tests verify the layer and preserve every v8 object placement and other property. Previous maps remain intact.

- Cauldron Hill complex v8: `output/maps/cauldron-hill-complex-v8/`, redistributes the cafeteria's 21 tables evenly across seven columns and three rows, with wider, consistent aisles. Includes table-position assertions; prior revisions remain intact.

- Cauldron Hill complex v7: `output/maps/cauldron-hill-complex-v7/`, replaces the pointed metal decorations in the prototype bays with service cylinders and valves, and the staging armour piles with cloth-covered component crates. Tests exclude both rejected assets; prior revisions are retained.

- Cauldron Hill complex v6: `output/maps/cauldron-hill-complex-v6/`, changes Area 3's checkpoint hall, both side booths and barracks connector to solid slab flooring; retains the wooden cargo lift and wall equipment. Includes floor-material assertions; prior maps are retained.

- Cauldron Hill complex v5: `output/maps/cauldron-hill-complex-v5/`, removes all schematic golem bodies, shell depictions, body-mounted gearing and collars. Area 5 and its vestibules/control alcoves use solid slab flooring. Chamber infrastructure remains; tests cover absence of the golem depiction and the solid hallway floor. Previous revisions are retained.

- Cauldron Hill complex v4: `output/maps/cauldron-hill-complex-v4/`, adds encounter dressing specifically to Area 5 and Borne's chamber: three prototype berths, spare shells, repair bench and interlock controls; fuel reservoirs, service hoists, adamantine stacks, restraint winches, warding collars and bridge drive mechanisms. Added equipment is an adaptation, not extra published rules. Prior maps remain intact; doorway and central-lane checks cover the revision.

- Cauldron Hill complex v3: `output/maps/cauldron-hill-complex-v3/`, preserves v2's complete room plan and adds stocked shelves, dining and desk contents, personal storage, laboratory equipment, industrial manifolds, service pipes, lift guides, wall fasteners, cargo equipment and Borne armour/gearing. Detail and doorway-clearance tests cover the revision; prior files remain intact. Native rendering remains a manual check.

- Cauldron Hill complex v2: `output/maps/cauldron-hill-complex-v2/`, 174 x 96 five-foot squares, includes every area 1–26. Adds Borne's staging platform and sump, both freight lifts, and a separate +100-ft bridge view connected to the VIP wing, with control cabins, safety rails, restraints and crane. Borne is a schematic assembly of metallic patterns. Original version is retained; native rendering remains a manual check.

- Cauldron Hill complex (ZEITGEIST Book 5 Part 3): `output/maps/cauldron-hill-complex/`, 112 x 96 five-foot squares. Includes areas 1–5 and 9–26, all five utility plants, service passages, and a prose-based Parity Lake dock inset. Areas 6–8 are deliberately omitted. Barracks subdivisions and furnishings are adaptations. Native map and PNG are checked by `verify.test.mjs`; opening in Dungeondraft remains a manual check. Doorway art and wall shadows are left for manual placement.

This file tracks the features currently implemented in this repository. Availability in a Foundry world depends on enabled modules and settings. Presence here does not certify live verification. Prototypes and inactive code are not shipped features.

**Access:** **GM only** means the feature's controls or reports are restricted to GMs. Players & GM means both roles can use it, subject to document ownership, visibility, and permissions. GM required means a player can start the workflow, but a connected GM performs the restricted action. All Foundry MCP operations run through an opted-in GM session; supported edits additionally require GM confirmation.

## DnD4e Info Displays

| Feature | Description | Access |
| --- | --- | --- |
| Character HUD | portrait, HP, temporary HP, healing surges, defenses, initiative, and speed. | Players & GM; owned PCs for players |
| Party health overview | health bars and condition labels alongside the character HUD. | Players & GM |
| Power menus | usage and action grouping, spent indicators, refreshing, chat posting, and rules tooltips. | Players & GM; owned actors |
| NPC power view | grouped powers, condition summaries, and expandable features. | **GM only** in the module HUD |
| Group NPC HUD | selecting several tokens of one NPC type shows one HUD: the first token's portrait, "N creatures selected", one health bar per creature (no temporary HP), and only the Sheet menu. Send to Chat uses the first creature. Mixed types and player characters show no HUD. | **GM only** |
| Character menus | searchable skills, feats, and inventory; skill rolls and equipment toggles. | Players & GM; owned actors |
| Quick actions | healing, Second Wind, saving throws, death saves, rests, and action points. | Players & GM; owned actors |
| Turn controls | player End Turn action and GM combat-tracker controls. | Players: own End Turn; **GM only**: tracker controls |
| Token-hover information | hovering a token shows a name tag at its lower rim without drawing a circle around the token. The tag is one stepped shape: a row of diamond gems (4 for monsters, 6 for player characters, 1 for minions; filled gems are remaining health, a wider gap after the middle gem marks the bloodied point) sits on the token's rim above a wider row with the role icon and name (struck through when defeated). The tag is slim and see-through, with a coloured border only for Solo / Leader / Elite / Minion creatures (ordinary creatures have none), and shows no Bloodied / Defeated / state word. Effects hang beside the token in a compact list, one line each, soonest ending first: effect icon, title and an ending label (`Save`, `EoT <name>`, `SoT <name>`, an infinity sign for encounter-long, a dash when open-ended, or a custom duration label). Anything ending this turn or next is amber with an hourglass. Standard conditions show only their title; condition-only lists start at half width and grow to fit names and durations, up to the usual maximum. Other effects add their description underneath. More than 10 effects collapse into "+N more". The list flips to the left near the screen edge and stays clear of the top and bottom controls, and the tag and list follow the token through pan, zoom and movement. There is no panel above the map and no setting for it; effect names are always titles (descriptions only show under non-condition effects) and Shift has no effect. | Players & GM |
| Mark connections | arrows connecting markers and marked creatures. | Players & GM |
| Power hit-chance previews | Preview attack success chances. | Players & GM |
| Wizard spellbook preparation | Extras opens separate daily and utility lists using normal power rows and rules tooltips, with immediate preparation toggles, Modern 4e level limits, and the same viewport-aware 310px scrolling cap as Extras, preserving position. | Wizard PCs |

## Power Targeting and Resolution

| Feature | Description | Access |
| --- | --- | --- |
| Per-power Automation configuration | Configure targeting behavior on individual powers. | Players & GM; editable powers |
| Interactive target selection and area placement | range, target-count, area, and cover previews or warnings. Only GM viewers see the effects tray on automation chat cards (including completed cards). Provisional power chat cards show an expanded, read-only effects tray with names, durations and tooltips; Apply buttons return on completion. | Players & GM; owned actors |
| Target restrictions | allies/enemies, required conditions, adjacency, target counts, and origin inclusion. | Players & GM; configured per power |
| Alternate origins | caster, companions, and per-power custom origins. | Players & GM; owned actors |
| Attack variants | Charge and Opportunity Attack for eligible powers; automatic basic-attack variants require Melee X or Weapon range. | Players & GM; eligible powers |
| Area placement | bursts, blasts, and walls, with optional persistent Regions. | Players & GM; persistent Regions require creation permission |
| Summoning | select distinct squares for multiple copies of the configured actor, up to a per-power maximum (default 1); click again to remove a square or clear the selection. All copies are GM-created together on confirmation; cancellation creates none. Close-burst summons use the burst area as their placement range (for example, Close Burst 20 permits placement within 20 squares). | Players & GM; owned actor; **GM required** to create token |
| Attack workflow | native attack-dialog integration, resource processing, result review, adjustments, and confirmation. | Players & GM; owned actors |
| Multi-creature attacks | several unlinked creatures of one NPC type use a Melee, Weapon, or Ranged power together from the Group NPC HUD. Total attacks are creatures × the power's target count, and a per-target input sets how many creatures attack each target (one creature can take every attack). Which creature makes which attack is random within range, one native attack dialog is shown and its manual edits are shared, and each creature rolls its own attacks, damage, and resource use. Review and damage application list every attack separately, and a defending player rolls all attacks on them from one dialog. Area, wall, and summon powers and linked duplicates of one actor stay manual. | **GM only**; defenders: Players & GM |
| Defense result timing | NPC-to-PC defense results wait for local Dice So Nice animations before reveal and confirmation. | Players & GM |
| Damage workflow | critical and miss damage, shared-roll adjustments, and damage review. Target Automation chat Apply buttons stay disabled for players until damage is confirmed; GMs can apply unconfirmed damage. Powers that deal damage without an attack roll proceed directly from target confirmation to normal damage rolling, adjustment and confirmation, with cancellation/retry support; they do not produce attack/hit events. | Players & GM; owned actors |
| GM damage application | PC targets retain confirmed damage in chat for manual application and never enter GM damage application; non-PC targets open GM review; per-target HP and temporary HP previews, individual application, and Apply to All. | **GM only** |
| Cancellation and retries | guarded workflow transitions and prevention of duplicate resource spending. | Players & GM |

Some targeting checks are advisory. Special power rules require manual adjudication. Wall Regions store geometry and metadata; movement, sight blocking, damage, and vertical targeting remain manual. Summoning requires an owned actor and a logged-in GM.

## Encounter and Combat Tools

| Feature | Description | Access |
| --- | --- | --- |
| Battle Briefings | titles, commander presentation, and encounter combatants; encounter write-ups live in the Encounters Journal. Skill imports use concise GM prose like Grappa's Safehouse, omitting grids, legends, deployment and design-report material. | GM prepares; players view the presentation |
| Briefing presets | reusable journal-backed preparations and expected enemy rosters. | **GM only** |
| Roster management | add friendly, neutral, or hostile tokens; remove combatants; control visibility. | **GM only** |
| Encounter calculator | difficulty, encounter level, and XP calculations. | **GM only** |
| Combat Pointers | encounter strategy notes and turn pointers. | **GM only** |
| GM combat tracker | turn order, HP and initiative editing, visibility, defeat, removal, turn navigation, and combat ending. | **GM only** |
| Combat Ledger | saved GM combat reports with elapsed time, turns, average turn time, and time spent contemplating. Optional world setting "Enable Combat Ledger" (on by default, reload required); when off, nothing is recorded and the tracker button is hidden, but saved reports are kept. | **GM only** |
| Combat statistics | hits, incoming hits, estimated damage, average d20 results, and kills. | **GM only** |
| Round charts | damage dealt and party/enemy resource snapshots. | **GM only** |
| Companion attribution | merge companion statistics into their owner. | **GM only** |
| Compact combat tracker | optional world setting "Compact combat tracker" (off by default; applies without a reload). Replaces portraits with one dense row per combatant: role icon (skull Solo, star Leader, diamond Elite, pawn Minion; one icon each, same priority as the token-hover display), name, current/max HP coloured green / yellow / orange / red at 75 / 50 / 25%, and the Hide Token button. Before combat the initiative number is shown and GMs can edit it; once combat starts it is hidden and GMs drag a combatant between two others to give it an initiative midway between them, which keeps the acting turn with the same combatant. The list scrolls while dragging near its edges, the drop can be released anywhere over the tracker (above the list means first, below it last), and combatants that share an initiative are renumbered by tiny steps so a drop between tied combatants lands exactly there. The header shows the Battle Briefing title (when the encounter has one) with the round and turn as its subtitle; the footer names the next player character and how many turns away they are, and shows a GM-only turn timer that counts up per turn, turns yellow at 1:00 and orange at 2:00, and freezes (labelled "Paused") while the acting player has Target Automation open (taking precedence) or Dice So Nice is animating. HP is shown only for combatants the user can observe. The timer lives on the GM client and restarts at 0:00 after a GM reload. The Mark as Defeated button is removed; ping and pan controls are hidden. | Players & GM; initiative editing, dragging and the timer are **GM only** |
| Battle momentum | configurable GM strength estimator with provisional calibration; estimates are not victory probabilities. Optional world setting "Enable Battle Momentum" (on by default, reload required); when off, combats are not observed and no button is shown. With the Ledger off, the button appears alone in the tracker header. | **GM only** |

Ledger recording depends on observed actions; missing history and offline time cannot be reconstructed.

## Negotiation Encounters

| Feature | Description | Access |
| --- | --- | --- |
| GM preparation and player-facing presentation | Actor portraits and separate preparation/presentation views. | GM prepares; players view the presentation |
| Interest and Patience tracking | Track negotiation resources. | **GM only** |
| Motivations and pitfalls | revealable concerns, custom concerns, discovery controls, and used-concern tracking. | GM manages; players see revealed concerns |
| Offers by Interest level | Prepare offers for different negotiation outcomes. | **GM only** |
| Argument-outcome controls | Resolve negotiation arguments. | **GM only** |

## Banter's 4e Modifications

| Feature | Description | Access |
| --- | --- | --- |
| Player active defense | targeted players defend against NPC attacks; results update in chat. Waiting cards with only pending player defenses suppress the inherited attack dice sound. | Targeted owners roll; GM resolves message updates |
| Compact chat cards | styled power, attack, damage, and skill cards with multi-target summaries and shared Roll Damage actions. | Players & GM; roll actions respect ownership |
| Modifier badges | attack and skill modifier sources captured at roll time. | Players & GM; subject to chat visibility |
| Targeting warnings | warn when attacking without selected targets. | Players & GM |
| Actor directory levels | Show actor levels in the directory. | Players & GM; visible directory entries |
| Optional attack chat variants | regular, Charge, and Opportunity Attack actions on eligible powers. | Players & GM; eligible powers |
| Revised skills | Crafting, Society, Intelligence-based Medicine, and Wisdom-based Religion; Streetwise and Dungeoneering are merged away. | Players & GM; world-wide rules |
| Combat Challenge | Actor-scoped **Trigger prompts → Class Features → Combat Challenge** toggle, off by default. With trigger prompts enabled, native attacks and confirmed Target Automation attacks mark every non-friendly target (hostile or neutral), hit or miss. Friendly targets and the attacker are skipped. Uses the native Marked effect with the attacking actor as marker, replaces existing marks, and refreshes until the end of the attacker's next turn. Requires a started combat containing the attacker and a connected GM for player attacks. | Owners & GM configure; GM applies marks |
| Optional private trigger prompts | **Uses Power** observes native power activations once per use, with optional usage-type and power-action filters (multiple choices; no selection allows any).  declarative triggers over one combat-event stream (attack targeting/results, committed token movement with a recorded movement type, hit-point changes, saving throws): opportunity attacks, hit/miss events, bloodied transitions, marked-creature events, melee hits, failed saving throws, reducing an enemy to 0 HP or fewer, and an adjacent enemy dropping to 0 HP or fewer. New triggers include your bloodying hit, an ally dropping to 0 HP or below, your opportunity hit, a marked enemy attacking without targeting you, entry into a configured distance, taking damage (including temporary HP), completed non-death saving throws, allied failed saves, ranged AC/Reflex hits, and a selected companion being targeted/hit. Companion assignments explicitly bind a world actor and can observe its scene token without an initiative slot. Shared attack-type (melee/ranged/close/area), defense and damage-type filters fail closed when metadata is absent. Native and Target Automation attack prompts use the same event definitions; automation verdicts prompt only after confirmation, preserving per-target defenses, removed targets, actual opportunity variants and the owning caster when attacking through a companion origin. Typed damage comes from recorded damage-application receipts, not a guess from the power. You hit an enemy supports ordinary and critical hits, with an optional Critical hit only filter on resolved attack triggers. Each assignment can require a non-minion, a melee attack, and/or adjacency. Powers and feats share an optional once-per-turn, first-time-per-encounter, or once-per-day allowance across their assignments; turn/day allowances are spent on selection, first-encounter allowances on the first qualifying event even if ignored. Usage survives reloads; daily usage resets only after Extended Rest. Personal bloodied/defeat prompts require recorded damage attribution; manual HP edits do not guess an attacker. The actor-scoped settings menu scrolls within the viewport and keeps Save below the scrolling area. Opportunity-attack prompts default off for NPCs and on for PCs; saved actor choices take precedence. Opportunity Attacks default to one claimed attack per actor per combat turn across all offered powers (the actor dialog can disable this limit), with only one prompt per enemy token per turn even after Ignore, expiry or reload. Shift segments never provoke; mixed movement checks only non-Shift segments. Causes say moved while adjacent to. Power/feat trigger dialogs provide a searchable, categorized catalog with assignment indicators on the left and one conditions editor on the right, with bordered sections, a high-contrast selection and grouped shared settings; switching or filtering preserves unsaved values. Assignments are stored on each power or feat; feat sheets expose Triggers. An explicit Automatic benefit (mandatory) option immediately posts the benefit and cause publicly to everyone (feats use the native DnD4e item-card rendering, including their image and rules), gives recipients a six-second informational alert with disabled, checkmarked already-used item buttons and no Use/Ignore choice, and spends shared allowances on triggering; its public chat entry survives alert dismissal and expiry. This announces rules without applying effects. Optional response prompts go only to connected player owners when any are online, otherwise to connected GMs. Optional triggers remain private, and selecting a feat posts its card to chat without rolling or spending resources; an opt-in, per-power "Suggest triggers from this trigger text" reads the power's own trigger line, shows what it understood and what it does not check, and pre-ticks rows for review. Recipient-only compact floating alerts show the actor and triggering event above the hotbar and its action buttons, with direct power buttons that try Target Automation and fall back to native use when unavailable or disabled, Actor HUD-formatted power tooltips with chat-style range-icon headers and colored At-Will/Encounter/Daily badges on hover/focus (when Info Displays is active); multi-option alerts show rules only for the hovered or focused option, Ignore, and a gold line draining to the 25-second deadline. Hidden private messages retain the shared claim record without appearing in chat; re-renders do not restart alerts. Events are evaluated by the client that caused them and prompts are claimed, dismissed, and expired without a GM connected. | Owners & GM configure; relevant recipients receive private prompts |

## Too Much To Track

| Feature | Description | Access |
| --- | --- | --- |
| GM token-HUD editor | for one or multiple selected tokens. | **GM only** |
| Tracked Active Effects | conditions, typed ongoing damage, numeric modifiers, resistances, vulnerabilities, and manual reminders. | **GM only** |
| Duration configuration | start/end of turn, save ends, encounter, custom, and origin-based durations through the native effect lifecycle. | **GM only** |
| Tracked-effect review and removal | Review and remove module-tracked effects. | **GM only** |

## Foundry MCP

`rename_world_powers` renames up to 100 selected world power Items after GM review,
preserving UUIDs, equipment links, mechanics, uses, flags and effects. Rejects stale
source/session, unsupported targets and duplicate selections; reports partial saves
and supports idempotent retries. GM only.

- [ ] After deploying protocol v39, reload Foundry and restart companion/MCP clients; check the browser console, cancel one rename, then approve a batch and verify names, unchanged equipment links and a no-op retry. Live verification pending.

`localize_item_powers` copies selected world PCs' equipment-linked compendium powers into
world **Equipment / Item Powers** (or an explicit Item folder) and relinks only those
compendium references after GM review. Preserves full power mechanics/effects/macros,
local links and actor-owned power copies. Reuses marked copies across equipment and
partial-save retries; rejects stale approvals and reports partial saves. GM only.

- [ ] After deploying protocol v38, reload Foundry and restart companion/MCP clients; check the browser console, cancel one localization, then approve it and verify folder, power data and equipment links. Retry and verify no duplicates. Live verification pending.

| Feature | Description | Access |
| --- | --- | --- |
| World inspection | read/search world and embedded documents, compendiums, and configured conditions. | **GM only**; authenticated MCP bridge |
| NPC creation | actors with embedded powers and traits. | **GM only**; authenticated MCP bridge |
| Reviewed NPC editing | actor fields, existing powers, additional powers, and selected trait deletion. | **GM only**; authenticated MCP bridge |
| PC setup | class, core powers, and standard bonus, HP, and layout defaults. | **GM only**; authenticated MCP bridge |
| Compendium imports | supported powers, feats, rituals, and magic items. | **GM only**; authenticated MCP bridge |
| Reviewed PC editing | supported character fields and powers, including custom powers and basic-attack abilities. | **GM only**; authenticated MCP bridge |
| Authored character options | feats, traits, theme features, rituals, and Techniques. | **GM only**; authenticated MCP bridge |
| Item creation | world Items and standalone magic-item building. | **GM only**; authenticated MCP bridge |
| Merchant inventory | read and edit supported Item Piles merchant inventories. | **GM only**; authenticated MCP bridge |
| Equipment icons | repair supported PC and merchant item icons. | **GM only**; authenticated MCP bridge |
| Effect authoring | Active Effects, condition shortcuts, supported aura settings, and supported effect replacement. | **GM only**; authenticated MCP bridge |
| PC reminders and selected feature deletion | Manage supported reminders and remove selected features. | **GM only**; authenticated MCP bridge |
| Target Automation | read and configure power targeting settings. | **GM only**; authenticated MCP bridge |
| Journals | create journals and Battle Briefing presets; add, edit, and remove pages. | **GM only**; authenticated MCP bridge |
| Scene annotations | labelled rectangles, plus reading and editing elevation Regions. | **GM only**; authenticated MCP bridge |
| Connection management | authenticated, opted-in GM bridge shared across conversations. | **GM only**; authenticated MCP bridge |
| Write safeguards | GM review for supported edits, source-change checks, and duplicate protection for supported retries. | **GM only**; authenticated MCP bridge |

Operations use explicit supported fields and document types. Creation and editing target the pinned DnD4e system where applicable; integrations such as Item Piles and Aura Effects require their corresponding modules.

## Modern 4e Rulebook

All 13 ancestry definitions, traits and powers are authored in shared JSON and rendered by Typst (#36). Power alternatives, damage-type choices and language choice counts are explicit; runtime ancestry effect automation remains unimplemented. Revenant remains excluded from the current book.

| Feature | Description | Access |
| --- | --- | --- |
| Character creation and advancement | in a centralized rulebook. | Players & GM |
| 12 active ancestries | and **19 classes**, grouped by combat role. | Players & GM |
| Backgrounds | combining environment and upbringing. | Players & GM |
| Revised ability points and skill checks | Proficiency and graded check outcomes. | Players & GM |
| Equipment, feats, utility powers, and Techniques | Character equipment and progression options. | Players & GM |
| JSON feat catalog | All general, class, ancestry, and multiclass feats use JSON entries; the rulebook preserves section order, prerequisites, emphasis, lists, and source notes. Schema v2 adds explicit occurrence limits and generated repetition text from typed selection rules for the five repeatable feats. | Developers / maintainers |
| Separate combat and out-of-combat utility choices | Independent utility selections for each area of play. | Players & GM |
| Draw Steel-inspired negotiation rules | Social-encounter rules adapted for Modern 4e. | Players & GM |
| Homebrew balance changes and quick-reference rules | Local mechanical changes and rules reference. | Players & GM |
| ZEITGEIST themes and paths | Campaign-specific character options; paragon path powers include their original Player's Guide flavor text. | Players & GM |
| Navigable PDF | contents, bookmarks, and version history. | Players & GM |
| Offline published D&D 4e compendium | Local reference data for published game content. | Players & GM |
| Build tooling | PDF compilation, watch mode, font inspection, and release generation. | Developers / maintainers |

The book is largely complete through level 10; later advancement is not fully verified. Bonds and Revenant are excluded from the assembled book. The rulebook is independent of Foundry deployment.

## Development Support

| Feature | Description | Access |
| --- | --- | --- |
| Local module deployment | for individual modules or all deployable modules. | Developers / maintainers |
| Automated tests | for repository tooling and supported module behavior. | Developers / maintainers |
| Foundry integration-test harness | and browser test workflow for the designated test world. Fixture actors and scenes are created in an "INTEGRATION TESTS" folder. | Developers / maintainers |
| UI prototypes | for design exploration, separate from production features. | Developers / maintainers |
| Dungeondraft tooling | (`src/dungeondraft-tools`) searchable index and previews of the local Crosshead asset packs, a dependency-free PNG compositor, a shared map serialiser, preview renderer, verifier checks and edge-wall grid reader (`lib/map-writer.mjs`, `lib/map-preview.mjs`, `lib/map-checks.mjs`, `lib/edge-grid.mjs`, and `lib/scene-kit.mjs` for the clutter calibration, rule 1 scale check and prop shadows every scene shares), and per-map generators and verifiers (walls are ordered so outer walls draw over the partitions that join them) that turn an encounter grid into a battlemap PNG and a native Dungeondraft map (the dockyard, Cloudwood and Grappa safehouse maps include Baileywiki shadow paths and prop circles; the safehouse map adds an east street and a south corridor around the original grid; the Grappa safehouse v2 map is built afresh from the v2 edge-wall encounter grid at 20 x 16, with its own textures, a south corridor, an east street and carriage, and is the first map to use the edge-grid reader). Never deployed to Foundry. | Developers / maintainers |

## Manual Feature Test Checklist

The checklist below preserves existing manual checks. It is supplemental to the inventory and may contain historical UI descriptions that need reconciliation when those areas change; unchecked entries do not establish current availability or verification.

Check each item after enabling its module (and, where noted, its setting).

### Banter's 4e Modifications

- [ ] Combat Challenge — enable under an actor's Trigger prompts → Class Features. Attack hostile, neutral and friendly targets: hits and misses mark only the non-friendly targets. Repeat an attack to refresh the mark; check source arrows and expiry at the end of the attacker's next turn, including an off-turn attack. Target Automation waits for confirmation and skips removed targets. Disable the actor toggle and verify subsequent attacks stop marking. Check a player's attack with a connected GM and the browser console.

- [ ] Homebrew skills — replaces History, Heal, Religion, Streetwise, and Dungeoneering with Crafting, Society, Religion (Wisdom), and Medicine (Intelligence).
- [ ] Target warning — warns a player who rolls an attack without selecting a target.
- [ ] Active defense — an NPC attack prompts the targeted player to roll a defense; the chat result is updated.
- [ ] Defense waiting audio — targeting only PCs creates a silent waiting card; mixed PC/NPC attacks retain audio for the native NPC rolls.
- [ ] Opportunity-attack chat actions — eligible power cards cycle between regular, Charge, and Opportunity Attack rolls.
- [ ] Trigger prompts — enabled, configured combat triggers show private, claimable compact floating alerts to the relevant player, with no visible trigger chat cards, even with chat closed. Player-owned response prompts go only to their connected players, including when a GM causes the event; disconnect all owning players and verify the GM receives subsequent prompts. GM-controlled actors retain GM prompts. GMs see automatic benefits once in public chat, without a floating copy. Alerts show the actor and cause (mark violations read “{attacker} violated {recipient}'s mark”), offer each assigned power directly (opening Target Automation when enabled, otherwise native use), and show its actual rules using the Actor HUD tooltip layout on hover or keyboard focus when Info Displays is active, with a chat-style header showing the range icon and colored usage badge. A gold line drains to the stored 25-second deadline; Multi-option prompts show no default tooltip over the prompt body; hovering or focusing an option shows its own rules. The prompt sits above the hotbar action buttons. Ignore, claim, expiry and deletion remove the alert without restarting it on chat re-renders.
- [ ] Trigger prompts without a GM — with no GM connected, a player's attack, move, hit-point change or save still prompts the right recipients; two recipients answering at once record one use; an expired prompt loses its buttons after a reload.
- [ ] Trigger text suggestions — in a power's Triggers dialog, "Suggest triggers from this trigger text" is off on open, shows the matched trigger, wording and anything not checked when ticked, ticks the matching rows, restores them when unticked, and stores nothing until Save (saved rows show "from trigger text").
- [ ] Power-stored triggers — assignments follow a duplicated power, one dragged to another actor, and one imported from a compendium; existing actor-flag assignments move onto their powers on first GM load.
- [ ] Movement triggers — opportunity-attack and marked-creature prompts fire for player and GM moves, for large tokens measured by footprint, and not for a move that only ends adjacent.
- [ ] Opportunity attack trigger — NPCs default off and PCs default on; saved actor choices persist. When enabled, prompt when an enemy movement permits an opportunity attack. Once per turn defaults on and is shared across attack choices; switching turns refreshes it, initiative reordering does not. Repeated movement by the same enemy produces one prompt even after Ignore/expiry/reload; different enemies can offer until one attack is claimed. Shift never provokes, including Shift portions of mixed movement. Verify the moved while adjacent to wording.
- [ ] Enemy misses you — prompt when an enemy misses the configured actor.
- [ ] Enemy misses — prompt when an enemy misses.
- [ ] Enemy hits you — prompt when an enemy hits the configured actor.
- [ ] AC or Reflex miss — prompt when an attack against the configured actor's AC or Reflex misses.
- [ ] You miss — prompt when the configured actor misses with an attack.
- [ ] Marked enemy hits ally — prompt when a creature marked by the configured actor hits an ally.
- [ ] Marked creature becomes bloodied — prompt when a creature marked by the configured actor becomes bloodied.
- [ ] You become bloodied — prompt when the configured actor becomes bloodied.
- [ ] Melee attack hits you — prompt when a melee attack hits the configured actor.
- [ ] Marked creature moves adjacent — prompt when a marked creature moves adjacent to the configured actor.
- [ ] Failed saving throw — prompt when the configured actor fails a saving throw.

### DnD4e Info Displays

- [ ] Group NPC HUD — as GM, select two or three tokens of one NPC type: the HUD shows the first token's portrait, "N creatures selected", one health bar each with no temporary HP, and only the Sheet button; Send to Chat posts the first creature's power. A different monster in the selection, or any PC, hides the HUD.
- [ ] Target Automation damage chat — Apply buttons remain disabled for players while damage is unconfirmed; GMs can use them before confirmation. Confirming damage enables them for players in each outcome group. Ordinary damage rolls remain usable.
- [ ] Damage without an attack roll — select targets for a damage-only power and confirm: roll normal damage, review and adjust it, then confirm chat damage. Cancel the damage dialog and retry without spending the power again. PCs keep HP unchanged; NPC damage retains GM review.
- [ ] GM damage application — confirm damage against PCs: chat damage is confirmed while HP and temporary HP stay unchanged, with no GM Apply Damage popup for PCs. Mixed PC/NPC attacks list only NPCs for GM application. Players can apply PC damage from chat.
- [ ] Multi-creature attack — with three unlinked minions selected and a Melee 1 power, the Use Power button appears; Select Targets shows an attackers input per target; targeting one creature with three attackers makes three attacks (three rolls, one dialog) and each minion spends its own use. Check a Melee 3 power (nine attacks), a minion out of range for a target, per-attack damage and the Apply Damage list, and that area powers still show no Use Power button.
- [ ] Multi-attack defense — a player character hit by several attacks gets one dialog listing every attack and rolls each defense with a separate roll.
- [ ] Token hover display — no extra circle surrounds the token; hovering a token draws a thin ring around it, a slim, see-through name tag hanging from its lower rim with diamond health gems on the rim above the name, and the effect list beside it; nothing appears at the top of the screen and there is no hover-display setting. Check a PC (six gems), an elite or solo (four gems, role-coloured ring and tag border), a minion (one gem), a defeated NPC (empty gems, struck-through name, no state word) and a bloodied creature (wider gap after the second gem, no state word), an ordinary creature (tag without a border) next to a Solo / Elite / Leader / Minion (coloured border); a tag whose name is barely wider than the gems; effect order and amber "ending soon" rows after advancing the turn; conditions as one line in a half-width list that grows for longer names and durations, mixed/custom effects at normal width with a description line; a creature with 8+ effects; a token near the right screen edge (list flips left) and near the top/bottom; panning, zooming and dragging the hovered token while it is shown; hovering two tokens in quick succession; and the browser console.
- [ ] NPC traits — the optional GM-only NPC-trait descriptions appear in the hover display.
- [ ] Horizontal actor HUD — selecting a PC opens the docked powers, skills, inventory, feats, and resources display.
- [ ] Actor HUD actions — powers and skills roll; feats/items open or roll; equipment can be toggled; resources can be edited.
- [ ] Actor HUD usability — power search, category filtering, expandable power details, tooltips, tabs, scrolling, dragging, and reopen behavior work.
- [ ] Experimental Actor HUD — optional client setting moves PC powers above the macro bar with Standard, Minor, Reaction and Other lists, range symbols, rules tooltips and chat/use icon buttons; disabling it restores the normal Powers tab. The narrow portrait panel shows a four-segment HP bar, inline temporary HP/surges, four-segment party bars with condition labels, and searchable Feats/Skills/Items menus above the macro bar, separated from the action groups by a small gap, with an Extras menu for action points, healing, saves, and rests.
- [ ] GM actor HUD — selecting any token as GM shows its HUD; during combat it includes the combat tracker and encounter notes.
- [ ] Team display — optional draggable party panel shows HP and healing surges; click selects a member and right-click opens their sheet.
- [ ] Mark connections — hovering or selecting a marker or marked token draws arrows from the marker to its marked targets.
- [ ] Compact combat tracker — (setting "Compact combat tracker") rows show no portraits; role icons (Solo skull, Leader star, Elite diamond, Minion pawn) appear before names; HP reads current/max in green, yellow, orange, red; the eye still hides a token; Mark as Defeated is absent, including on hover or focus. Before Begin the initiative numbers are editable and rows cannot be dragged. After Begin the numbers disappear, dragging a row between two others re-slots it without changing whose turn it is, and players cannot drag. Header shows the Battle Briefing title and "Round N · Turn i of n". Footer shows "Next player: name, in N turns" and, for the GM, a timer that turns yellow at 1:00 and orange at 2:00, resets each turn, and shows "Paused · Target Automation" while a player is in Select Targets (and "Paused · Dice So Nice" while dice animate). Turning the setting off restores the stock tracker immediately.
- [ ] Battle Briefing — opening it shows encounter party/enemy information and initiative without exposing hidden enemies to players.
- [ ] Combat Pointers — GM can maintain encounter strategy notes and turn pointers, including reusable presets.
- [ ] Combat tracker HUD — GM gets a draggable tracker when combat starts, with turn order and combatant HP.
- [ ] Combat tracker controls — GM can set the current turn, edit HP/initiative, hide, defeat, remove, navigate turns, open the briefing, and end combat.

### Too Much To Track

- [ ] Token-notes button — GM sees the book button in the token HUD and can open it for one or more selected tokens.
- [ ] Condition notes — add one or two DnD4e status conditions as tracked Active Effects.
- [ ] Ongoing damage — add typed ongoing damage as a tracked Active Effect.
- [ ] Numeric modifiers — add typed/untyped modifiers to AC, all defenses, attacks, damage, saving throws, or speed.
- [ ] Resistances and vulnerabilities — add a resistance or vulnerability Active Effect for a damage type.
- [ ] Manual notes — add a free-form temporary reminder as an Active Effect.
- [ ] Duration tracking — apply start/end-of-turn, save-ends, encounter, custom, and origin-based durations; confirm combat advances or removes them correctly.
- [ ] Multi-token editing — add and remove the same notes across every selected token.
- [ ] Note cleanup — deleting a tracked note also removes its matching Active Effect.

- [ ] Defeat triggers — positive HP falling to 0 or below prompts the recorded attacker and hostile adjacent combatants with assignments; further damage below 0, healing, friendly casualties and distant creatures do not qualify. Manual HP edits can prompt adjacent combatants but do not guess an attacker.
- [ ] Feat triggers — owned feat sheets expose Triggers; assignments persist on the feat and appear in actor summaries. Selecting a feat posts its card without a roll, resource use or Target Automation. The Quench batch BANTER: Defeat triggers and feat prompts covers native HP hooks, saved feat assignments and claimed chat posting (including native feature item types).

- [ ] Trigger restrictions and shared limits — configure non-minion, melee and adjacency restrictions in a power/feat Triggers dialog; verify both positive and excluded cases. Your bloodying hits require attributed damage; ally defeats exclude yourself. A shared turn limit offers one prompt when a hit both bloodies and defeats, stays spent through other triggers, and refreshes on the next creature's turn (not initiative reordering). Ignore releases turn/day allowances. First time per encounter stays spent even if ignored, survives reloads and refreshes in a new encounter. Daily usage survives Short Rest/new encounters and refreshes on Extended Rest; old prompts cannot spend the refreshed allowance. Covered by BANTER: Trigger restrictions and shared limits Quench batch.

- [ ] Expanded triggers ? verify opportunity hits exclude regular attacks and misses; marked attacks exclude any full target list containing the marker and prompt once per attack; range-entry includes destinations and pass-through paths but excludes a starting square alone; save completion includes successes and allied failed-save prompts exclude enemies.
- [ ] Trigger filters and companions ? save attack-type/defense/damage-type filters and a companion in the power/feat Triggers dialog. Check positive and excluded cases; unknown damage types cannot satisfy a typed filter, temporary HP damage qualifies, and companion events prompt the configuring actor with or without a companion initiative slot.
- [ ] Target Automation trigger parity ? the real native Opportunity Attack produces no hit prompt during result review, then exactly one on confirmation; actual attack types/defenses survive the native form; damage application supplies bloodied and typed-damage prompts. Quench batch: BANTER: Expanded triggers and Target Automation; browser test: confirmed native Target Automation delivers combat trigger prompts and typed damage.

- [ ] Trigger catalog and editor - verify clear pane/settings borders, readable selected-row contrast and no visible accessibility-only status text; search and filter categories, choose a trigger, assign it and edit conditions in the right pane. Switching triggers or clearing search preserves values; no matches shows an empty state. Suggestion toggles refresh assignment indicators. Save retains assignments from every pane, plus automatic benefit and shared limits.

- [ ] Automatic benefit triggers ? enable Automatic benefit (mandatory) in a power/feat Triggers dialog; the owner receives a six-second informational alert and everyone sees a persistent chat announcement with the actor, cause and rules. Item labels appear as disabled normal-use buttons with a checkmark and an Already used label. No Use/Ignore choice or roll occurs. Dismiss/expiry leaves the chat entry and spent allowance intact; exhausted limits suppress repeated announcements. Optional triggers still offer private choices without an automatic public post.

### Foundry MCP Trigger Automations

- `get_trigger_automation` discovers Banter's installed trigger catalog, filters and stored actor/item configuration. `edit_trigger_automation` supports confirmed power/feat/feature assignments, companion bindings, shared limits, automatic benefits, opportunity options and actor reminders. Preserves usage and unrelated data; legacy actor assignments require UI migration before actor-option edits.
- [ ] After reloading Foundry and restarting MCP clients for protocol v37, read an actor's trigger catalog, review and save an assignment with filters/limit, cancel a second edit, and verify the saved configuration in Triggers and the browser console.

- [ ] Actor trigger settings � on a short viewport, scroll the actor-scoped Trigger prompts menu through its settings and assignment summary; Save remains visible below the scrolling area.

- [ ] You hit an enemy ? assign to a power or feat; ordinary and critical enemy hits prompt, misses and allied targets do not. Enable Critical hit only and verify only confirmed critical hits prompt, including native attacks and confirmed Target Automation results.

- [ ] Targeting effects tray — start a power with effects: its provisional chat card shows GMs effect names, durations and tooltips without Apply buttons or attack/damage/template controls. Complete the session and verify native controls return for GMs. Verify players never see the tray, including after completion and chat re-renders; check a power without effects and the browser console.

- [ ] Actor HUD Extras — compact two-column groups with aligned headings and separators only above lower rows (no inherited inter-group top margin) at 345px wide, retaining the 310px scrolling cap. Healing, Saves and Rests remain direct actions; Preparation offers Prepare Dailies and Prepare Utilities only for Wizard PCs. Each opens at the right edge of the HUD with the normal power-row list, hover/focus tooltips, a leading prepared toggle, and the action type on the right using the NPC power-menu labels and styling; native prepared flags immediately control normal power-menu visibility. Modern 4e level limits are enforced independently, with unpreparing always allowed, including over-limit imported selections. Lists share Extras’ viewport-aware 310px maximum height and retain scroll position after toggles. Verify class/NPC switching hides Preparation, cantrips and non-class powers are excluded, and scrolling remains stable while preparing/unpreparing.

- [ ] Uses Power trigger ? in a started encounter, verify matching usage/action combinations prompt once for attack and non-attack powers; mismatches and cancelled resource checks do not prompt.

- Foundry MCP Trigger Automation supports adding `uses-power` assignments with discovered `usageTypes` and `powerActions` filters; invalid or duplicate filter values are rejected before review.
- [ ] MCP Uses Power ? read filter choices, add a daily/minor assignment, confirm, and verify both filters in the power Triggers dialog; cancelling an edit preserves the saved configuration.

- Automatic benefit chat cards use the triggering event sentence as their heading (for example, ?Idrani Fullhorn used a power.?), followed directly by the benefit rules without a duplicate actor/event line.
- [ ] Automatic benefit chat ? trigger Gritty Determination with Uses Power; verify the heading names the actor and event once and the native feat rules remain below it.

- [ ] Summoning: set Maximum summoned creatures above 1; select separate in-range squares, remove one by clicking again, clear and reselect, confirm fewer than the maximum, and verify one copy per selected square. Reject an extra square at the maximum; cancel without spending a use or creating tokens. Existing summon powers default to 1.
## Dungeondraft tooling: optional levels

- Native map generation supports explicitly requested named levels with shared dimensions, asset manifest, and unique entity IDs. Single-level Ground remains the default.
- Preview scripts accept `--level <index>` and respect disabled terrain for isolated export levels. Shared validation checks every level and detects duplicate IDs across levels.
- [ ] Open a generated multilevel map in Dungeondraft, switch between levels, and export an isolated terrain-disabled level. Native multilevel loading/export awaits user confirmation.


- Android Progression (experimental): one scrolling folio with printed level 1–30 grant schedule, power tally, origin rows, level-1 completion boxes and required-choice navigation count. Native bottom sheets offer framed expandable catalog cards, Class-first feat tabs, ineligible filtering, Modern background descriptions, independent origin/skill storage, live engine skill previews and exact-two free picks. Allocation uses the main-4/non-main-5 budget and optional single −1/3 tradeoff. Atomic edit batches persist before publishing; old documents infer origin from legacy skill slots. Active later levels preserve ability increases, catalog powers/feats and targeted progression replacements with explicit incomplete automation/unavailable totals. The proof engine still evaluates only levels 1–2; Fighter Reactivity/Combat Superiority and paragon/epic content are not authored, so those gaps remain visible. The modified prototype is retained as a reference while this incomplete slice awaits visual acceptance.
- Manual Progression check: change each origin, confirm its stale skill clears, select one background skill and exactly two free skills, inspect live modifiers, exercise allocation limits, open feat tabs/filter, cancel/save/reopen, inspect upcoming levels and confirm unsupported progression stays visibly incomplete. No UI tests were performed for this change, as requested.

- [ ] Modern 4e ancestry JSON (#36) — attributes, traits, power cards and alternatives render from the catalog; check Dragonborn/Elf choices, Dwarf speed 5, language counts, power scaling, illustrations and following feat-page breaks. Revenant stays excluded from the current book.
