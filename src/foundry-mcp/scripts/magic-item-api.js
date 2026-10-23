import { MODULE_ID, MAX_MESSAGE_BYTES } from "../shared/protocol.js";
import { COMPENDIUM_ITEM_UUID, mergeMagicItemSources, validateMagicItemRequest } from "../shared/magic-item-data.js";
import { assertEnabledGM } from "./read-api.js";
import { canonical, resolveCreationFolder } from "./creation-utils.js";

const pending = new WeakSet();

/**
 * Prepare a merge for standalone creation or confirmed merchant stocking.
 */
export async function prepareMagicItem({ baseUuid, enchantmentUuid, quantity = 1 }, {
  game = globalThis.game, fromUuid = globalThis.fromUuid, assertSession
}) {
  const sources = [];
  for (const uuid of [baseUuid, enchantmentUuid]) {
    if (!COMPENDIUM_ITEM_UUID.test(uuid ?? "")) {
      throw new Error("Select compendium Item UUIDs for both components.");
    }
    const item = await fromUuid(uuid);
    assertSession();
    const readable = () => item?.documentName === "Item" && !item.parent && item.pack
      && game.packs.get(item.pack)?.documentName === "Item"
      && game.packs.get(item.pack).testUserPermission(game.user, "OBSERVER")
      && item.testUserPermission(game.user, "OBSERVER");
    if (!readable()) {
      throw new Error("Choose accessible compendium Item documents.");
    }
    sources.push({ item, snapshot: JSON.stringify(item.toObject(true)), readable });
  }
  const data = mergeMagicItemSources(...sources.map(source => JSON.parse(source.snapshot)), quantity);
  if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_MESSAGE_BYTES / 2) {
    throw new Error("Built Item exceeds 2 MiB.");
  }
  const assertSources = () => {
    assertSession();
    if (sources.some(source => !source.readable() || JSON.stringify(source.item.toObject(true)) !== source.snapshot)) {
      throw new Error("Magic item sources changed or became unavailable; read and select them again.");
    }
  };
  assertSources();
  return { data, assertSources };
}

/**
 * Create one independent world magic Item with persistent retry protection.
 */
export async function buildMagicItem(args, {
  game = globalThis.game, Item = globalThis.Item, Folder = globalThis.Folder,
  fromUuid = globalThis.fromUuid, crypto = globalThis.crypto, assertConnection = () => {}
} = {}) {
  assertEnabledGM(game);
  validateMagicItemRequest(args);
  args = structuredClone(args);
  const worldId = game.world.id;
  const userId = game.user.id;
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3") {
      throw new Error("Magic item creation requires the paired active GM on DnD4e 0.9.3.");
    }
  };
  assertSession();
  if (pending.has(game)) {
    throw new Error("Another magic item build is in progress; retry shortly.");
  }
  pending.add(game);
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical({ ...args, quantity: args.quantity ?? 1 }))));
    assertSession();
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const receipt = (item, reused) => ({ id: item.id, uuid: item.uuid, name: item.name, type: item.type,
      folder: item.folder?.id ?? null, baseUuid: args.baseUuid, enchantmentUuid: args.enchantmentUuid, reused,
      notes: ["Separate equipment power Items are not imported. Verify enchantment weapon/armor restrictions from its rules."] });
    const existing = Array.from(game.items.values()).find(item => {
      const marker = item.getFlag(MODULE_ID, "magicItemRequest");
      return marker?.id === args.requestId && marker.userId === userId;
    });
    if (existing) {
      if (existing.parent || existing.pack || existing.getFlag(MODULE_ID, "magicItemRequest").hash !== hash) {
        throw new Error("Request ID already used with different magic item selections or destination.");
      }
      return receipt(existing, true);
    }
    const { data, assertSources } = await prepareMagicItem(args, { game, fromUuid, assertSession });
    const folder = await resolveCreationFolder(game, args.folder, Folder, assertSession, "Item");
    assertSources();
    data.folder = folder.id;
    data.flags ??= {};
    data.flags[MODULE_ID] = { magicItemRequest: { id: args.requestId, userId, hash, baseUuid: args.baseUuid, enchantmentUuid: args.enchantmentUuid } };
    const item = await Item.create(data, { renderSheet: false });
    assertSession();
    if (!item) {
      throw new Error("Magic item creation was cancelled.");
    }
    return receipt(item, false);
  } finally {
    pending.delete(game);
  }
}
