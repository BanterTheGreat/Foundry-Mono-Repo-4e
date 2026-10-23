/**
 * Run as a Foundry Script macro. Imports native compendium consumables,
 * replaces The Alchemist's inventory, and retains an actor-flag backup.
 */
await (async () => {
  const backupKey = "alchemistRestock20261023";
  const selections = [
    ["Tanglefoot Bag", 12],
    ["Keen Oil", 10],
    ["Grayflower Perfume", 10],
    ["Clearsense Powder", 11],
    ["Jolt Flask", 10],
    ["Ossip Wax", 10],
    ["Noxious Grenade", 11],
    ["Primal Element", 12],
    ["Stone Eater", 10],
    ["Alchemist's Fire", 11]
  ];

  /** Normalize common level suffixes and typographic apostrophes. */
  function normalize(name) {
    return name.toLowerCase().replace(/\b(level|lvl)\b/g, "").replace(/[^a-z]/g, "");
  }

  try {
    if (!game.user.isGM) {
      throw new Error("Run this macro as a GM.");
    }
    const actors = game.actors.filter(actor => actor.name === "The Alchemist");
    if (actors.length !== 1) {
      throw new Error(`Expected exactly one actor named The Alchemist; found ${actors.length}.`);
    }
    const actor = actors[0];
    if (actor.getFlag("world", backupKey)) {
      throw new Error("This restock already started or completed. Its backup is retained on the actor; refusing to duplicate stock.");
    }

    const wantedNames = new Set(selections.map(([name]) => normalize(name)));
    const candidates = [];
    for (const pack of game.packs) {
      if (pack.documentName !== "Item") {
        continue;
      }
      const index = await pack.getIndex({ fields: ["system.level"] });
      for (const entry of index) {
        if (wantedNames.has(normalize(entry.name))) {
          candidates.push({ pack, entry });
        }
      }
    }

    const stock = [];
    for (const [name, level] of selections) {
      let source;
      for (const { pack, entry } of candidates) {
        if (normalize(entry.name) !== normalize(name)) {
          continue;
        }
        const document = await pack.getDocument(entry._id);
        if (document.type === "consumable" && Number(document.system.level) === level) {
          source = document.toObject();
          break;
        }
      }
      if (!source) {
        throw new Error(`No native consumable found for ${name}, level ${level}. Inventory unchanged.`);
      }
      delete source._id;
      source.system.quantity = Math.random() < 0.75 ? 1 : 2;
      stock.push(source);
    }

    // Powers and features are actor abilities, rather than shop inventory.
    const inventory = actor.items.filter(item => !["power", "feature"].includes(item.type));
    const backup = {
      createdAt: new Date().toISOString(),
      completed: false,
      inventory: inventory.map(item => item.toObject()),
      stock: stock.map(item => ({ name: item.name, level: item.system.level, quantity: item.system.quantity }))
    };
    await actor.setFlag("world", backupKey, backup);
    const created = await actor.createEmbeddedDocuments("Item", stock);
    if (created.length !== stock.length) {
      throw new Error("Not all new items were created. Old inventory retained; inspect the backup before retrying.");
    }
    if (inventory.length) {
      await actor.deleteEmbeddedDocuments("Item", inventory.map(item => item.id));
    }
    await actor.setFlag("world", backupKey, { ...backup, completed: true, createdIds: created.map(item => item.id) });
    console.table(backup.stock);
    ui.notifications.info(`The Alchemist now stocks ${stock.length} consumables, with 1–2 doses each. Old inventory backed up.`);
  } catch (error) {
    console.error("The Alchemist restock:", error);
    ui.notifications.error(error.message);
  }
})();
