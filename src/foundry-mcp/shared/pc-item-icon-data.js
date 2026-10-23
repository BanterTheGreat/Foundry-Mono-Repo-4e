import { validateShape } from "./npc-data.js";

export const DEFAULT_ITEM_ICON = "icons/svg/chest.svg";
export const PC_ITEM_ICONS = Object.freeze({
  feet: "icons/equipment/feet/boots-collared-pink.webp",
  head: "icons/equipment/head/helm-barbute-reinforced.webp",
  arms: "icons/equipment/wrist/bracer-straight-leather-steel.webp",
  neck: "icons/equipment/neck/amulet-round-engraved-spiral-gold.webp",
  waist: "icons/equipment/waist/belt-buckle-steel.webp",
  hands: "icons/equipment/hand/gauntlet-armored-steel-grey.webp"
});

/**
 * Accept only a world Actor selector, with no caller-defined images or patches.
 */
export function validatePcItemIcons(args) {
  validateShape(args, { uuid: "string" });
  if (!/^Actor\.[A-Za-z0-9_-]{1,128}$/.test(args.uuid ?? "")) {
    throw new Error("Supply a world Actor UUID.");
  }
}
