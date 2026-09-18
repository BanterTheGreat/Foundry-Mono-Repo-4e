# Changelog

## Unreleased

- Added configurable Trigger Prompts for a combatant failing a non-death saving throw.
- Added an optional world setting for Charge and Opportunity Attack variant buttons on eligible DnD4e power chat cards, including NPC Basic Attacks.
- Opportunity Attack prompts now include powers with an alternate roll mode marked as an opportunity attack.

## 2.0 - Foundry VTT 14 Compatibility

- Updated the module manifest for Foundry VTT 14 and corrected its author metadata to the v13+ schema.
- Replaced deprecated chat-message render hooks with `renderChatMessageHTML` and native HTML control binding.
- Migrated Player Defense and Trigger Prompt configuration dialogs to the Application V2 framework.

## 1.4 - Trigger Prompts and Test Coverage

- Added configurable Trigger Prompts for becoming bloodied and for being hit by an enemy Weapon or Melee X attack, including Player Defense outcomes.
- Trigger prompts now omit exhausted encounter and daily powers, while continuing to offer other available powers assigned to the same trigger.
- Choosing a prompted DnD4e power now consumes its available use through the system's normal power-use workflow.
- Added automated coverage for Foundry lifecycle registration, DnD4e customizations, Player Defense resolution, Trigger Prompt dispatch, and Mark Ownership persistence.
- Added CI-ready test and coverage commands with minimum line and branch coverage thresholds.

## 1.3.1 - Workflow Naming and Module Clarity

- Refactored Trigger Prompts and Mark Ownership around explicit gameplay state transitions, clearer Foundry hook names, and named persistence and SocketLib operations.
- Preserved existing gameplay behavior while improving JSDoc coverage and the locality of workflow, renderer, configuration, and cleanup responsibilities.
- Added an actor-level reminder when a creature marked by that actor hits an ally; the private prompt deliberately offers only Ignore, with no attached power.
- Restored hit-trigger evaluation for attacks resolved through Player Defense, including normal and critical defended hits.
- Added configurable prompts for missing an enemy and for an enemy missing AC or Reflex, plus a configurable 10-square default range for enemy-hit prompts. Both attack-result additions support Player Defense outcomes.
- Prevented Player Defense's intercepted attack message from producing duplicate miss prompts by clearing its captured attack context before a later roll can consume it.

## 1.3 — Per-Power Trigger Assignments

Moved configurable trigger assignments into actor-owned records edited from each embedded power sheet, allowing several powers to use the same trigger with independent parameters such as range. The actor dialog now controls Opportunity Attacks and summarizes assigned power triggers, qualifying prompts offer every matching power, and deleting a power cleans up its assignments while stale references are ignored defensively.

NPC Basic Attacks are also offered as Opportunity Attacks because legacy DnD4e represents NPC opportunity attacks that way.

Mark ownership now reliably opens its v13 DialogV2 picker in scene-linked combats, defaults to the current combatant, and renders unblurred, fully opaque red arrows from marker to marked at two arrows per grid square.

## 1.2.2 — Trigger Ability Categories

Replaced trigger prompts' name-based default ability lookup with `Basic Attacks` and `Opportunity Attacks` selector options backed by the DnD4e system's existing attack metadata. Category selections use the first matching actor power, opportunity-attack prompts default to opportunity attacks.

## 1.2.1 — Additional Mark Triggers

Added trigger prompts for a creature marked by you becoming bloodied and for a creature marked by you moving or shifting while adjacent to you. Both triggers resolve the marking actor through the Mark ownership metadata and reuse the existing GM-authoritative trigger dispatch and actor-level ability configuration.

## 1.2 — Mark Ownership

Added combat-scoped ownership selection for all DnD4e Mark condition variants, persisting the selected actor through the system's existing `system.marker` change and storing exact token references in module flags. Mark relationships can be inspected through visibility-safe canvas lines, with GM-authoritative cleanup when either endpoint leaves combat or the encounter ends.

## 1.1 — Trigger System

Introduced a registry-driven combat trigger system with actor-level configuration, ability selection, and private actionable chat prompts. Trigger evaluation is performed by a single active GM and supports both standard DnD4e attack workflows and the module's active-defense results.

## 1.0 — Initial

Initial release of Banter's 4e Modifications.
