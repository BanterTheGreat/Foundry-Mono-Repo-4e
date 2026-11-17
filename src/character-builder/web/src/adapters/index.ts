/** Public browser IO surface; application screens can consume this without owning IO rules. */
export { IndexedDbCharacterStore } from "./IndexedDbCharacterStore";
export { BundledContentSource } from "./BundledContentSource";
export { BrowserFileExchange } from "./BrowserFileExchange";
export { WebCharacterImporter, WebContentCatalog } from "@modern4e/shared";
export type { Character, Result, Diagnostic, Summary } from "./contracts";
