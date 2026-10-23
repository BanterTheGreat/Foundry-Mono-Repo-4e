import { DEFAULT_ITEM_ICON, PC_ITEM_ICONS, validatePcItemIcons } from "../shared/pc-item-icon-data.js";
import { assertEnabledGM } from "./read-api.js";

/**
 * Replace default chest icons using native DnD4e 0.9.3 equipment slots.
 * Repeating a request only considers items still carrying the default icon.
 */
export async function fixPcItemIcons(args, {
  game = globalThis.game, assertConnection = () => {}
} = {}) {
  assertEnabledGM(game);
  validatePcItemIcons(args);
  const uuid = args.uuid;
  const worldId = game.world.id;
  const userId = game.user.id;
  const actor = game.actors.get(uuid.slice(6));
  const assertSession = () => {
    assertEnabledGM(game);
    assertConnection();
    if (!game.user.isActiveGM || game.world.id !== worldId || game.user.id !== userId
      || game.system.id !== "dnd4e" || game.system.version !== "0.9.3"
      || !actor || !(actor.type === "Player Character" || (actor.type === "NPC"
        && game.modules?.get("item-piles")?.active === true
        && game.itempiles?.API?.isItemPileMerchant?.(actor) === true)) || actor.parent || actor.pack
      || actor.uuid !== uuid || game.actors.get(actor.id) !== actor) {
      throw new Error("Icon cleanup requires a world Player Character or Item Piles NPC merchant and the paired active GM on DnD4e 0.9.3.");
    }
  };
  assertSession();
  const items = [];
  for (const item of actor.items.values()) {
    const source = item.toObject(true);
    const slot = source.system?.armour?.type;
    if (source.type !== "equipment" || source.img !== DEFAULT_ITEM_ICON || !Object.hasOwn(PC_ITEM_ICONS, slot)) {
      continue;
    }
    items.push({ id: item.id, uuid: item.uuid, name: source.name, slot, before: source.img, img: PC_ITEM_ICONS[slot] });
  }
  if (!items.length) {
    return { uuid, name: actor.name, status: "unchanged", items: [] };
  }
  assertSession();
  let failed = false;
  try {
    await actor.updateEmbeddedDocuments("Item", items.map(item => ({ _id: item.id, img: item.img })));
  } catch {
    failed = true;
  }
  assertSession();
  const receipts = items.map(item => ({ ...item,
    status: actor.items.get(item.id)?.toObject(true).img === item.img ? "updated" : "missing"
  }));
  return { uuid, name: actor.name,
    status: failed || receipts.some(item => item.status === "missing") ? "incomplete" : "updated", items: receipts };
}
