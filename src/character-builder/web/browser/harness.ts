import { IndexedDbCharacterStore } from "../src/adapters/IndexedDbCharacterStore";
import { BundledContentSource } from "../src/adapters/BundledContentSource";
import { BrowserFileExchange } from "../src/adapters/BrowserFileExchange";
import { WebCharacterImporter, WebContentCatalog } from "@modern4e/shared";
import { decode } from "../src/adapters/contracts";
import fixture from "../../shared/fixtures/character.json";
Object.assign(window, { IndexedDbCharacterStore, BundledContentSource, BrowserFileExchange, WebCharacterImporter, WebContentCatalog, decode, fixture });
