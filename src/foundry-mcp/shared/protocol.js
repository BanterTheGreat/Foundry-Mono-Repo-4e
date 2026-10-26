export const MODULE_ID = "foundry-mcp";
export const PROTOCOL_VERSION = 31;
export const EDIT_CONFIRM_TIMEOUT_MS = 120000;
export const EFFECT_CONFIRM_TIMEOUT_MS = EDIT_CONFIRM_TIMEOUT_MS;
export const DEFAULT_PORT = 17890;
export const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
export const READ_OPERATIONS = Object.freeze([
  "get_target_automation", "get_session", "list_documents", "get_document", "list_compendiums", "list_compendium_documents", "list_conditions", "get_merchant_inventory"
]);
export const CREATION_OPERATIONS = Object.freeze(["create_journal", "create_npc_actor", "create_item", "build_magic_item", "import_pc_options", "setup_pc", "create_feat", "create_ritual"]);
export const WRITE_OPERATIONS = Object.freeze([...CREATION_OPERATIONS, "edit_target_automation", "edit_journal_pages", "edit_npc_actor", "add_item_effects", "fix_pc_item_icons", "set_pc_basic_attack_ability", "edit_pc_actor", "edit_pc_powers", "edit_merchant_inventory", "add_scene_drawings"]);
export const OPERATIONS = Object.freeze([...READ_OPERATIONS, ...WRITE_OPERATIONS]);
export const DOCUMENT_TYPES = Object.freeze([
  "Actor", "Item", "Scene", "JournalEntry", "ChatMessage", "Combat",
  "RollTable", "Playlist", "Macro", "User", "Folder", "Cards"
]);
export const EMBEDDED_TYPES = Object.freeze([
  "ActiveEffect", "Item", "Token", "Actor", "JournalEntryPage", "Combatant", "TableResult",
  "PlaylistSound", "Card", "Drawing", "Tile", "Wall", "AmbientLight", "AmbientSound",
  "Note", "MeasuredTemplate", "Region", "RegionBehavior"
]);

/**
 * Validate pagination at both ends of the bridge.
 */
export function pagination({ offset = 0, limit = 50, query = "" } = {}) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Use a non-negative offset and a limit between 1 and 100.");
  }
  if (typeof query !== "string" || query.length > 200) {
    throw new Error("Query must be a string of at most 200 characters.");
  }
  return { offset, limit, query };
}
