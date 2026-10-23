---
name: setup-pc
description: Create a Foundry DnD4e PC from a name, race and class, importing its class and core powers and applying the user's standard tier bonuses, HP calculation and power layout. Use for requests to set up a new PC.
---

# Setup PC

Create a new character using the Foundry MCP `setup_pc` tool. Required user inputs are the character's **name**, **race** and **class**. Ask only for missing inputs. Use the Actor folder **Player Characters** unless the user specifies another destination; the tool creates missing folder paths.

Call `get_session` to verify the intended world, paired active GM, DnD4e **0.9.3**, and `pcSetup` capability. If `setup_pc` is missing, have the user restart the MCP connection and reload the updated Foundry MCP module. Do not substitute `create_npc_actor`, browser automation, or arbitrary script execution. The user operates Foundry; MCP document reads and this creation operation are the supported workflow.

Call `setup_pc` with a fresh `requestId` and the supplied `name`, `race` and `class`. Pass `folder` only for a user-specified destination. For example:

```json
{
  "requestId": "setup-pc-unique-request-id",
  "name": "Aria",
  "race": "Human",
  "class": "Fighter"
}
```

The tool creates an Actor of type `Player Character` and applies all of these defaults:

- Fill the Race and Class text inputs with the supplied strings (`system.details.race` and `.class`).
- Import the matching class feature from the **Classes** Item compendium belonging to **dnd-4e-compendium** (also accept its plural package ID `dnd-4e-compendiums` if installed under that ID). Preserve the class source's effects and mechanics.
- Add an enabled bonus with formula **`@tier`** to **Global Attack Modifier**, **Fortitude**, **Reflex** and **Will**. These are `system.modifiers.attack.bonus` and `system.defences.{fort,ref,wil}.bonus` arrays with `{name: "Tier", value: "@tier", active: true, note: ""}`. Do not add this bonus to AC or replace it with a fixed number.
- Import **Melee Basic Attack**, **Ranged Basic Attack**, **Total Defense**, **Charge** and **Second Wind** from the **Powers (Core)** Item compendium, retaining their source mechanics and effects. Do not substitute the general Powers pack used by `import_pc_options`.
- Set **Group by Action (Modern)** (`system.powerGroupTypes: "actionMod"`) and **Sort by Usage** (`system.powerSortTypes: "useType"`).
- Enable **Automatically Calculate Total HP** (`system.attributes.hp.autototal: true`).

The setup uses system defaults for unspecified character values. Do not invent ability scores, choose optional class/race features, import a race Item, or assign a player owner without further user instructions. The class feature and five core powers are embedded together during actor creation; this is not a full character build or an interactive class advancement workflow.

If the result is `unresolved`, nothing has been created. Use `list_compendiums` and `list_compendium_documents` to inspect the required sources. Missing packs require the user's installation/configuration; do not silently switch sources. Class names match exactly ignoring case. Use `classId` for a specific Classes entry when needed; the standard Fighter is catalogued as `Fighter (Weaponmaster) Class`. Keep the supplied Class text as `Fighter`. Ask the user if choosing another class variant requires a character-building decision. The Charge action may be catalogued as `Charge Attack`; the tool accepts that alias and preserves the source title. Use `corePack` to select a pack ID when more than one accessible pack is labelled Powers (Core).

After creation, read the returned Actor UUID through `get_document` with `source: true`, requesting `name`, `type`, `system`, and `items`. Verify the supplied identity, four enabled formula bonuses, HP flag, grouping/sorting and all six imported Items. Report the actor UUID and any missing or mismatched setup. Ask the user to check the sheet and report console errors if live validation is needed; do not open or inspect Foundry directly.

Keep the exact arguments and `requestId` when retrying an uncertain timeout or disconnection. A saved request fingerprint returns the same actor across reloads; a new ID creates another character. If the result is `incomplete`, inspect and report the missing Items rather than creating another PC or claiming success. This operation does not modify an existing character.
