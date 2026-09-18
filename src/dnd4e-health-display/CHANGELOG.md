# Changelog

## Unreleased

Added an optional horizontal actor display docked to the bottom-left of the screen, as an alternative to the existing vertical display, for player-character tokens. It shows the same identity, HP/temp HP/surges, defenses, and Powers/Skills/Feats/Items tabs as a popup drawer above its tab strip, with action-point, save, heal, and rest controls as icon buttons with dropdown submenus, and a placeholder for a future power/item hotbar. The vertical and horizontal displays are now each controlled by their own independent client setting and can be shown together or separately; enabling only the horizontal display still falls back to the vertical display for NPC tokens, which the horizontal display doesn't support yet.

Added an independent Battle Briefing submodule with a GM combat-tracker control, reusable world presets for encounter titles, descriptions, commander subtitles, commander-art alignment and zoom, and expected actor counts. Loading a preset flags any expected actor copies that are missing from the current roster. The preparation window provides a GM-only Strategy tab, a header preset loader, and a shared footer for saving presets and starting the briefing. The Strategy tab lets the GM select any combination of the encounter's tokens and attach a turn pointer note to them, shown in a dialog the moment combat reaches that token's turn, plus an Environment note that stays visible in its own overlay for the whole encounter once it starts. The tracker control creates an encounter for the active scene when needed. Its preparation window shows the current encounter roster in a dedicated side column, can bulk-add all friendly, neutral, or hostile scene tokens, lets the GM toggle combatant visibility, and lets the GM choose which visible hostile appears as the enemy commander. Hidden tokens are omitted from the briefing. Supporting-enemy and player portraits provide enlarged artwork previews on hover or keyboard focus. The player briefing shows current initiative values and lets each player roll initiative for their owned combatant, while the GM action rolls initiative for every NPC, begins the encounter, and dismisses the briefing for all connected users.

Battle Briefing Setup now lets the GM remove individual combatants from the encounter without deleting their scene tokens.

Reopening the Battle Briefing from the combat tracker for an encounter already in progress now only opens a private GM view, instead of also reopening the presentation for connected players.

NPC attacking powers and feature abilities now open the DnD4e attack-roll dialog from the Actor display instead of posting their item cards directly to chat, consuming limited power uses as normal. NPC powers now also provide separate controls to send their cards to chat or roll their damage, while player-character powers can expand individually to show the same complete rules details used for NPC powers.

Added a live, case-insensitive search field to player-character Powers tabs, filtering cards and their empty categories by power name as the user types.

Added a client-persisted Powers-tab control for player characters which hides or restores their short power flavour text.

Added an independent mark-display overlay that uses DnD4e's mark ownership data to draw directional marker-to-marked token connections, including plain and numbered mark statuses, with a client setting to show or hide them.

Refined mark connectors with a subtle dark under-stroke for map contrast, rounded slimmer gold lines, outlined barbed spearheads that remain clear of marked token artwork, and small offsets between a marker's concurrent connections. Visible arrowheads now animate with a subtle pulse.

Mark connections now appear only while either linked token is hovered or controlled.

Battle Briefing now left-aligns its encounter title and subtitle, disables and relabels the Roll Enemy Initiative action once every NPC already has an initiative roll, and shows a more compact initiative order track.

Battle Briefing's initiative order now shows a scrolling row of numbered portrait chips instead of a single fixed-width pin track, so large encounters no longer crowd or overlap; combatant names stay hidden and appear in the existing hover/focus artwork preview instead.

Fixed the Environment overlay never appearing when its notes were prepared before the encounter started. The Turn Pointer dialog and Environment overlay no longer show the default window close/control buttons, since neither is meant to be dismissed by hand, and both now reopen wherever the GM last left them instead of snapping back to the center of the screen.

Fixed saved Battle Briefing presets losing which token each turn pointer was assigned to. Presets now remember pointer targets by actor instead of by that encounter's own combatant IDs, so they still apply correctly once loaded into a different encounter.

The GM's private Battle Briefing view now has a working Strategy tab once the encounter is already underway, letting the GM add, edit, or remove turn pointers and environment notes mid-fight and apply them to the live encounter immediately, refreshing the strategy overlay right away instead of only on the next turn.

The separate Turn Pointer dialog and Environment overlay are now a single overlay, titled Combat Pointers, with the encounter's environment notes on top and, underneath, whoever's turn it currently is. Environment notes are now a bolder, bordered callout instead of quiet italic text, so they no longer read as a disconnected afterthought, and the Now Acting section stays visible for the current combatant even when no pointer notes are prepared for them, saying so instead of disappearing.

Combat Pointers now has Previous, End Turn, and Next buttons under the Now Acting section, letting the GM step the encounter back and forward without switching to the combat tracker.

## 2.0

Streamlined the actor display typography to Signika for interface and supporting text, reserving Modesto Condensed for character identity and headline resource values while retaining italic flavour copy.

Added a client-persisted status-only mode for the actor display. Collapse it from the new control at the bottom of the display to hide tabs, detail content, and quick actions while retaining the identity, hit points, player-character healing surges, defenses, and initiative; use the compact control to restore the full display. NPCs omit the unused healing-surge counter and meter. Refreshing an expended power now privately notifies every online GM with the character and ability involved.

Added an NPC Features tab to the actor display, grouping trait and racial-feat feature items with their descriptions above the NPC's categorized power list, with consistent feat roll, sheet, and tooltip interactions. NPC power entries now show enriched attack and rules details inline, using the compact generated power-card format with the DnD4e system card as a fallback for custom-authored powers; expended powers omit flavour text, while PC entries show their short flavour text below the title. Added an independent Team display that follows the legacy player-token selection policy and presents party portraits and names with segmented hit-point and healing-surge vitality seals; the seals show their enlarged resource labels without numeric values. Refined the compact defense and initiative rail with consistent inline labels, reworked the editable health resources into an actor-appropriate, quantized segmented dial with compact temporary-HP and surge counters that save on Enter or focus loss, and improved item-power and inventory-row treatments. Offset the Actor and Team resource circles slightly so their segment and progress boundaries fall more naturally. Added a close button to the actor display that keeps it hidden until a token is selected again.

## 1.1.0

Rebranded the module as DnD4e Info Displays and separated the health-display and actor-display implementations. Added a controlled-token actor display with editable health resources, defenses and initiative, power usage, skill rolls, categorized feats and inventory, equipment toggles, rest and recovery actions, direct character-sheet access, and lazily rendered rules tooltips for powers, feats, and items. Expanded the hover health display with actor classifications, effect summaries, NPC traits, combat modifiers, and richer health states.
