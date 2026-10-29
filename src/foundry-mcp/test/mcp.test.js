import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../server/mcp.js";

test("MCP handshake exposes reads and NPC creation, validates arguments, and reports offline errors", async t => {
  const calls = [];
  const server = createMcpServer({ request: async (operation, args) => {
    calls.push({ operation, args });
    if (operation === "get_session") {
      throw new Error("No GM session connected.");
    }
    return { entries: [] };
  } });
  const client = new Client({ name: "test", version: "1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ["get_target_automation", "edit_target_automation", "add_elevation_regions", "add_scene_drawings", "edit_journal_pages", "create_journal", "build_magic_item", "get_merchant_inventory", "edit_merchant_inventory", "get_session", "list_documents", "get_document", "list_compendiums", "list_compendium_documents", "list_conditions", "add_item_effects", "create_ritual", "create_feat", "setup_pc", "import_pc_options", "edit_pc_actor", "edit_pc_powers", "set_pc_basic_attack_ability", "fix_pc_item_icons", "edit_npc_actor", "create_item", "create_npc_actor"]);
  assert.ok(tools.filter(tool => !["edit_target_automation", "add_elevation_regions", "add_scene_drawings", "edit_journal_pages", "create_journal", "build_magic_item", "edit_merchant_inventory", "add_item_effects", "create_npc_actor", "create_item", "create_ritual", "create_feat", "setup_pc", "import_pc_options", "edit_pc_actor", "edit_pc_powers", "set_pc_basic_attack_ability", "fix_pc_item_icons", "edit_npc_actor"].includes(tool.name)).every(tool => tool.annotations.readOnlyHint));
  assert.equal(tools.at(-1).annotations.readOnlyHint, false);
  assert.equal(tools.at(-1).annotations.idempotentHint, true);
  const reminder = { uuid: "Actor.hero", system: { actionpoints: { custom: "" } }, deleteFeatures: ["oldFeat"] };
  assert.notEqual((await client.callTool({ name: "edit_pc_actor", arguments: reminder })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "edit_pc_actor", args: reminder });
  const removeEffects = { items: [{ uuid: "Actor.hero.Item.feat", effects: [], remove: ["oldEffect"] }] };
  assert.notEqual((await client.callTool({ name: "add_item_effects", arguments: removeEffects })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "add_item_effects", args: removeEffects });
  const damageDiceEdit = { uuid: "Actor.hero", powers: [{ id: "power", system: {
    hit: { baseQuantity: "2", baseDiceType: "weapon", shareDamageRoll: false },
    attack: { shareAttackRoll: false }, effectType: { reliable: true, invigorating: false }
  } }] };
  assert.notEqual((await client.callTool({ name: "edit_pc_powers", arguments: damageDiceEdit })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "edit_pc_powers", args: damageDiceEdit });
  const automation = { powers: [{ uuid: "Item.power", config: { enabled: true, targetCountMode: "upTo", targetCount: 2 } }] };
  assert.notEqual((await client.callTool({ name: "edit_target_automation", arguments: automation })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "edit_target_automation", args: automation });
  const automationCalls = calls.length;
  for (const config of [{ targetCount: 0 }, { placementMode: "script" }, { flags: {} }]) {
    assert.equal((await client.callTool({ name: "edit_target_automation", arguments: { powers: [{ uuid: "Item.power", config }] } })).isError, true);
  }
  assert.equal(calls.length, automationCalls);
  assert.equal(tools.find(tool => tool.name === "edit_target_automation").annotations.readOnlyHint, false);
  const ritual = { requestId: "custom-ritual-001", name: "Project Reflection", level: 5,
    text: "", description: "<p>Create an illusion.</p>", actorUuid: "Actor.hero" };
  assert.notEqual((await client.callTool({ name: "create_ritual", arguments: ritual })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "create_ritual", args: ritual });
  const ritualCalls = calls.length;
  for (const invalid of [{ ...ritual, level: null }, { ...ritual, folder: "Rituals" },
    { ...ritual, effects: [] }, { ...ritual, system: {} }]) {
    assert.equal((await client.callTool({ name: "create_ritual", arguments: invalid })).isError, true);
  }
  assert.equal(calls.length, ritualCalls);
  const elevation = { uuid: "Scene.map", requestId: "elevation-001", regions: [{ name: "Platform", elevation: 5,
    shapes: [{ type: "rectangle", x: 100, y: 100, width: 200, height: 200 }] }] };
  assert.notEqual((await client.callTool({ name: "add_elevation_regions", arguments: elevation })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "add_elevation_regions", args: elevation });
  const elevationCalls = calls.length;
  assert.equal((await client.callTool({ name: "add_elevation_regions", arguments: { ...elevation, flags: {} } })).isError, true);
  assert.equal(calls.length, elevationCalls);
  const rectangles = { uuid: "Scene.map", requestId: "scene-drawings-001", drawings: [
    { x: 100, y: 200, width: 300, height: 100, text: "Hazard", hidden: true }
  ] };
  assert.notEqual((await client.callTool({ name: "add_scene_drawings", arguments: rectangles })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "add_scene_drawings", args: rectangles });
  const drawingCalls = calls.length;
  for (const invalid of [{ ...rectangles, uuid: "Actor.pc" }, { ...rectangles, requestId: undefined },
    { ...rectangles, drawings: [{ ...rectangles.drawings[0], width: 0 }] },
    { ...rectangles, drawings: [{ ...rectangles.drawings[0], flags: {} }] },
    { ...rectangles, drawings: [{ ...rectangles.drawings[0], hidden: "true" }] },
    { ...rectangles, drawings: [] }, { ...rectangles, flags: {} }]) {
    assert.equal((await client.callTool({ name: "add_scene_drawings", arguments: invalid })).isError, true);
  }
  assert.equal(calls.length, drawingCalls);
  assert.equal(tools.find(tool => tool.name === "add_scene_drawings").annotations.readOnlyHint, false);
  const journal = { requestId: "briefing-mcp-1", name: "Ambush", battleBriefing: { title: "Ambush", description: "Hold the line." } };
  assert.notEqual((await client.callTool({ name: "create_journal", arguments: journal })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "create_journal", args: journal });
  const journalCalls = calls.length;
  for (const invalid of [{ ...journal, flags: {} }, { ...journal, folder: "Other" }, { ...journal, requestId: undefined }]) {
    assert.equal((await client.callTool({ name: "create_journal", arguments: invalid })).isError, true);
  }
  assert.equal(calls.length, journalCalls);
  assert.equal(tools.find(tool => tool.name === "create_journal").annotations.readOnlyHint, false);
  const pageEdit = { uuid: "JournalEntry.book", requestId: "journal-pages-test-1",
    add: [{ name: "Grappa's Safehouse", content: "<h2>Move Grappa</h2>" }] };
  assert.notEqual((await client.callTool({ name: "edit_journal_pages", arguments: pageEdit })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "edit_journal_pages", args: pageEdit });
  const pageCalls = calls.length;
  for (const invalid of [{ ...pageEdit, uuid: "Actor.pc" }, { ...pageEdit, flags: {} },
    { ...pageEdit, requestId: undefined }, { ...pageEdit, add: [{ name: "Empty" }] }]) {
    assert.equal((await client.callTool({ name: "edit_journal_pages", arguments: invalid })).isError, true);
  }
  assert.equal(calls.length, pageCalls);
  assert.equal(tools.find(tool => tool.name === "edit_journal_pages").annotations.destructiveHint, true);
  const offline = await client.callTool({ name: "get_session", arguments: {} });
  const build = { requestId: "build-magic-test-1", baseUuid: "Compendium.gear.items.Item.hammer", enchantmentUuid: "Compendium.gear.items.Item.battering", folder: "Magic Items", quantity: 2 };
  assert.notEqual((await client.callTool({ name: "build_magic_item", arguments: build })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "build_magic_item", args: build });
  const buildCalls = calls.length;
  for (const invalid of [{ ...build, folder: undefined }, { ...build, baseUuid: "Item.hammer" }, { ...build, effects: [] }]) {
    assert.equal((await client.callTool({ name: "build_magic_item", arguments: invalid })).isError, true);
  }
  assert.equal(calls.length, buildCalls);
  const magicStock = { uuid: "Actor.shop", requestId: "magic-stock-test-1", add: [{ uuid: build.enchantmentUuid, baseUuid: build.baseUuid, quantity: 1 }] };
  assert.notEqual((await client.callTool({ name: "edit_merchant_inventory", arguments: magicStock })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "edit_merchant_inventory", args: magicStock });
  const stockEdit = { uuid: "Actor.shop", requestId: "merchant-test-1", add: [{ uuid: "Item.potion", quantity: 3 }], quantities: [{ id: "sword", quantity: 0 }], remove: ["shield"] };
  assert.notEqual((await client.callTool({ name: "edit_merchant_inventory", arguments: stockEdit })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "edit_merchant_inventory", args: stockEdit });
  assert.equal(tools.find(tool => tool.name === "edit_merchant_inventory").annotations.destructiveHint, true);
  const stockCalls = calls.length;
  for (const invalid of [{ ...stockEdit, flags: {} }, { ...stockEdit, remove: ["sword"] },
    { ...stockEdit, add: [{ uuid: "Item.potion", quantity: -1 }] },
    { ...stockEdit, add: [{ uuid: "Actor.pc.Item.item", quantity: 1 }] }]) {
    assert.equal((await client.callTool({ name: "edit_merchant_inventory", arguments: invalid })).isError, true);
  }
  assert.equal(calls.length, stockCalls);
  assert.notEqual((await client.callTool({ name: "get_merchant_inventory", arguments: { uuid: "Actor.shop" } })).isError, true);
  assert.equal(offline.isError, true);
  await client.callTool({ name: "list_documents", arguments: { documentType: "Actor", limit: 10 } });
  assert.equal(calls.at(-1).args.documentType, "Actor");
  const before = calls.length;
  const invalid = await client.callTool({ name: "list_documents", arguments: { documentType: "Actor", limit: 1000 } });
  assert.equal(invalid.isError, true);
  const unknown = await client.callTool({ name: "execute_macro", arguments: {} });
  assert.equal(unknown.isError, true);
  assert.equal(calls.length, before);
  const effectArgs = { summary: "Add fire resistance while the armor is equipped.", items: [{ uuid: "Item.armour", effects: [{
    key: "fire-resistance", name: "Fire resistance 5", description: "You gain resist 5 fire while equipped.",
    application: "equipped", duration: "permanent", changes: [{ key: "system.resistances.fire.res", type: "upgrade", value: "5" }]
  }] }] };
  assert.notEqual((await client.callTool({ name: "add_item_effects", arguments: effectArgs })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "add_item_effects", args: effectArgs });
  const reminderArgs = { items: [{ uuid: "Actor.pc.Item.haunting", effects: [{
    key: "haunting-spirits", name: "Haunting Spirits", description: "Grants combat advantage to one chosen ally.",
    application: "hit", duration: "endOfUserTurn"
  }] }] };
  assert.notEqual((await client.callTool({ name: "add_item_effects", arguments: reminderArgs })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "add_item_effects", args: reminderArgs });
  const conditionArgs = { items: [{ uuid: "Actor.pc.Item.wall", effects: [{ key: "slowed", condition: "slowed", application: "hit", duration: "endOfUserTurn" }] }] };
  assert.notEqual((await client.callTool({ name: "add_item_effects", arguments: conditionArgs })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "add_item_effects", args: conditionArgs });
  const auraArgs = structuredClone(reminderArgs);
  auraArgs.items[0].effects[0].aura = { distanceFormula: "1", visualOnly: true, showRadius: true, color: "#ff6600" };
  assert.notEqual((await client.callTool({ name: "add_item_effects", arguments: auraArgs })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "add_item_effects", args: auraArgs });
  for (const patch of [{ script: "false" }, { distanceFormula: "1d6" }, { disposition: "evil" }, { visualOnly: "true" }]) {
    const invalid = structuredClone(auraArgs);
    Object.assign(invalid.items[0].effects[0].aura, patch);
    const count = calls.length;
    assert.equal((await client.callTool({ name: "add_item_effects", arguments: invalid })).isError, true);
    assert.equal(calls.length, count);
  }
  assert.notEqual((await client.callTool({ name: "list_conditions", arguments: { query: "slowed" } })).isError, true);
  assert.equal(calls.at(-1).operation, "list_conditions");
  const effectCalls = calls.length;
  for (const mutate of [
    args => { args.items[0].uuid = "Compendium.pack.Item.armour"; },
    args => { args.items[0].effects[0].duration = "daily"; },
    args => { args.items[0].effects[0].changes[0].key = "flags.macro.command"; },
    args => { args.items[0].effects[0].changes[0].value = "alert(1)"; },
    args => { args.items[0].effects[0].flags = {}; }
  ]) {
    const invalid = structuredClone(effectArgs);
    mutate(invalid);
    assert.equal((await client.callTool({ name: "add_item_effects", arguments: invalid })).isError, true);
  }
  assert.equal(calls.length, effectCalls);
  assert.equal(tools.find(tool => tool.name === "add_item_effects").annotations.readOnlyHint, false);
  const args = { name: "Troll", requestId: "test-npc-request", folder: "Monsters/Trolls", system: { details: { level: 12 } }, items: [] };
  assert.notEqual((await client.callTool({ name: "create_npc_actor", arguments: args })).isError, true);
  assert.equal(calls.at(-1).operation, "create_npc_actor");
  const count = calls.length;
  for (const invalidArgs of [
    { ...args, system: { macro: "execute()" } },
    { ...args, folder: undefined },
    { ...args, folder: "  " },
    { ...args, items: [{ name: "Macro", type: "weapon", system: {} }] },
    { ...args, items: [{ name: "Power", type: "power", system: { macro: { command: "execute()" } } }] }
  ]) {
    assert.equal((await client.callTool({ name: "create_npc_actor", arguments: invalidArgs })).isError, true);
  }
  assert.equal(calls.length, count);
  const edit = { uuid: "Actor.npc", summary: "Increase the troll's HP and claw accuracy and add an on-hit mark.", system: { attributes: { hp: { max: 120 } } }, items: [{ id: "claw", type: "power", hitMark: true, system: { attack: { formula: "12" } } }] };
  assert.notEqual((await client.callTool({ name: "edit_npc_actor", arguments: edit })).isError, true);
  assert.equal(calls.at(-1).operation, "edit_npc_actor");
  assert.equal(calls.at(-1).args.items[0].hitMark, true);
  const edits = calls.length;
  for (const invalidEdit of [
    { ...edit, uuid: "Compendium.monsters.Actor.npc" },
    { ...edit, system: { macro: "execute()" } },
    { ...edit, items: [{ id: "claw", type: "power", effects: [] }] },
    { ...edit, items: [{ id: "claw", type: "feature", hitMark: true }] },
    { ...edit, items: [{ id: "claw", type: "power", hitMark: false }] }
  ]) {
    assert.equal((await client.callTool({ name: "edit_npc_actor", arguments: invalidEdit })).isError, true);
  }
  assert.equal(calls.length, edits);
  const editTool = tools.find(tool => tool.name === "edit_npc_actor");
  const addPower = { uuid: "Actor.npc", addPowers: [{ key: "alchemist-fire", name: "Alchemist's Fire",
    system: { actionType: "standard", attack: { formula: "14", def: "ref" }, hit: { formula: "3d6" } } }] };
  assert.notEqual((await client.callTool({ name: "edit_npc_actor", arguments: addPower })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "edit_npc_actor", args: addPower });
  const powerCalls = calls.length;
  for (const addPowers of [[{ ...addPower.addPowers[0], flags: {} }], [addPower.addPowers[0], addPower.addPowers[0]],
    [{ name: "Missing key", system: {} }], [{ ...addPower.addPowers[0], system: { macros: [] } }]]) {
    assert.equal((await client.callTool({ name: "edit_npc_actor", arguments: { uuid: "Actor.npc", addPowers } })).isError, true);
  }
  assert.equal(calls.length, powerCalls);
  assert.equal(editTool.annotations.readOnlyHint, false);
  assert.equal(editTool.annotations.destructiveHint, true);
  const pcActor = { uuid: "Actor.pc", system: {
    abilities: { str: { value: 18 } }, skills: { ath: { training: 5 } },
    details: { weaponProf: { value: ["simpleM"], custom: "Longsword" } },
    languages: { spoken: { value: ["Common", "Elven"] } }
  } };
  assert.notEqual((await client.callTool({ name: "edit_pc_actor", arguments: pcActor })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "edit_pc_actor", args: pcActor });
  const pcActorCalls = calls.length;
  for (const invalid of [{ ...pcActor, flags: {} }, { ...pcActor, items: [] },
    { uuid: "Actor.pc", system: { skills: { ath: { training: 1 } } } },
    { uuid: "Actor.pc", system: { abilities: { str: { mod: 5 } } } },
    { uuid: "Actor.pc", system: { details: { level: 0 } } },
    { uuid: "Actor.pc", system: { languages: { spoken: { value: [1] } } } }]) {
    assert.equal((await client.callTool({ name: "edit_pc_actor", arguments: invalid })).isError, true);
  }
  assert.equal(calls.length, pcActorCalls);
  const pcActorTool = tools.find(tool => tool.name === "edit_pc_actor");
  assert.equal(pcActorTool.annotations.readOnlyHint, false);
  assert.equal(pcActorTool.annotations.idempotentHint, true);
  const pcPowers = { uuid: "Actor.pc", powers: [{ id: "power", system: { autoGenChatPowerCard: true, description: { chat: "Flavor" } } }] };
  assert.notEqual((await client.callTool({ name: "edit_pc_powers", arguments: pcPowers })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "edit_pc_powers", args: pcPowers });
  const pcPowerCalls = calls.length;
  for (const invalid of [{ ...pcPowers, powers: [] }, { ...pcPowers, system: {} },
    { ...pcPowers, powers: [{ id: "power", effects: [] }] },
    { ...pcPowers, powers: [{ id: "power", system: { macros: [] } }] }]) {
    assert.equal((await client.callTool({ name: "edit_pc_powers", arguments: invalid })).isError, true);
  }
  assert.equal(calls.length, pcPowerCalls);
  const basicAttacks = { uuid: "Actor.pc", ability: "wis", summary: "Switch both basic attacks to Wisdom." };
  assert.notEqual((await client.callTool({ name: "set_pc_basic_attack_ability", arguments: basicAttacks })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "set_pc_basic_attack_ability", args: basicAttacks });
  const basicCalls = calls.length;
  for (const invalidBasic of [{ ...basicAttacks, ability: "INT" }, { ...basicAttacks, ability: "constructor" }, { ...basicAttacks, items: [] }, { ...basicAttacks, uuid: "Compendium.pack.Actor.pc" }]) {
    assert.equal((await client.callTool({ name: "set_pc_basic_attack_ability", arguments: invalidBasic })).isError, true);
  }
  assert.equal(calls.length, basicCalls);
  const deletion = { uuid: "Actor.npc", deleteTraits: ["trait"] };
  assert.notEqual((await client.callTool({ name: "edit_npc_actor", arguments: deletion })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "edit_npc_actor", args: deletion });
  const deletionCalls = calls.length;
  for (const deleteTraits of ["trait", [42], ["Actor.npc.Item.trait"], Array(101).fill("trait")]) {
    assert.equal((await client.callTool({ name: "edit_npc_actor", arguments: { uuid: "Actor.npc", deleteTraits } })).isError, true);
  }
  assert.equal(calls.length, deletionCalls);
  const itemTool = tools.find(tool => tool.name === "create_item");
  assert.equal(itemTool.annotations.readOnlyHint, false);
  assert.equal(itemTool.annotations.destructiveHint, false);
  assert.equal(itemTool.annotations.idempotentHint, true);
  assert.ok(itemTool.inputSchema.properties.system);
  assert.deepEqual(itemTool.inputSchema.properties.type.enum, ["weapon", "equipment", "power", "feature"]);
  const item = { name: "Hammer", type: "weapon", folder: "Magic Items", requestId: "mcp-world-item-request", system: { enhance: 4, description: { chat: "Flavor" } } };
  assert.notEqual((await client.callTool({ name: "create_item", arguments: item })).isError, true);
  assert.equal(calls.at(-1).operation, "create_item");
  assert.deepEqual(calls.at(-1).args, item);
  const itemCalls = calls.length;
  for (const invalidItem of [
    { ...item, type: "Macro" }, { ...item, effects: [] },
    { ...item, folder: " " }, { ...item, flags: {} },
    { ...item, system: { itemPowers: ["Item.power"] } },
    { ...item, system: { macros: [] } },
    { ...item, system: { price: -1 } },
    { ...item, type: "feature", system: { enhance: 4 } }
  ]) {
    assert.equal((await client.callTool({ name: "create_item", arguments: invalidItem })).isError, true);
  }
  assert.equal(calls.length, itemCalls);
  const feat = { requestId: "create-feat-request", name: "Steady Aim", level: 4, text: "Focus.", description: "<p>Benefit.</p>", actorUuid: "Actor.pc" };
  assert.notEqual((await client.callTool({ name: "create_feat", arguments: feat })).isError, true);
  assert.equal(calls.at(-1).operation, "create_feat");
  assert.deepEqual(calls.at(-1).args, feat);
  const trait = { ...feat, requestId: "create-trait-request", featureType: "trait", level: null };
  assert.notEqual((await client.callTool({ name: "create_feat", arguments: trait })).isError, true);
  assert.deepEqual(calls.at(-1).args, trait);
  const theme = { ...feat, requestId: "create-theme-request", featureType: "theme", level: 5 };
  assert.notEqual((await client.callTool({ name: "create_feat", arguments: theme })).isError, true);
  assert.deepEqual(calls.at(-1).args, theme);
  const featCalls = calls.length;
  for (const invalidFeat of [
    { ...feat, level: 0 }, { ...feat, level: 31 }, { ...feat, level: null }, { ...feat, featureType: "race" }, { ...feat, featureType: "theme", level: null }, { ...feat, name: " " },
    { ...feat, text: undefined }, { ...feat, description: undefined },
    { ...feat, folder: "Feats" }, { ...feat, effects: [] },
    { ...feat, actorUuid: "Compendium.pack.Actor.pc" }
  ]) {
    assert.equal((await client.callTool({ name: "create_feat", arguments: invalidFeat })).isError, true);
  }
  assert.equal(calls.length, featCalls);
  const featTool = tools.find(tool => tool.name === "create_feat");
  assert.equal(featTool.inputSchema.properties.img, undefined);
  assert.equal(featTool.annotations.readOnlyHint, false);
  assert.equal(featTool.annotations.destructiveHint, false);
  assert.equal(featTool.annotations.idempotentHint, true);
  const setup = { requestId: "setup-hero-request", name: "Aria", race: "Human", class: "Fighter" };
  assert.notEqual((await client.callTool({ name: "setup_pc", arguments: setup })).isError, true);
  assert.equal(calls.at(-1).operation, "setup_pc");
  assert.deepEqual(calls.at(-1).args, setup);
  const setupCalls = calls.length;
  for (const invalidSetup of [
    { ...setup, class: undefined }, { ...setup, race: " " },
    { ...setup, system: {} }, { ...setup, items: [] }, { ...setup, folder: " " }
  ]) {
    assert.equal((await client.callTool({ name: "setup_pc", arguments: invalidSetup })).isError, true);
  }
  assert.equal(calls.length, setupCalls);
  assert.equal(tools.find(tool => tool.name === "setup_pc").annotations.readOnlyHint, false);
  const pc = { uuid: "Actor.pc", requestId: "pc-import-request", powers: [{ name: "Cleave", level: 1 }], feats: [{ id: "featId", level: 2 }] };
  assert.notEqual((await client.callTool({ name: "import_pc_options", arguments: pc })).isError, true);
  assert.equal(calls.at(-1).operation, "import_pc_options");
  assert.deepEqual(calls.at(-1).args, pc);
  const sourceLevelPower = { ...pc, powers: [{ name: "Healing Spirit" }] };
  assert.notEqual((await client.callTool({ name: "import_pc_options", arguments: sourceLevelPower })).isError, true);
  const ritualImport = { uuid: pc.uuid, requestId: "ritual-import-request", rituals: [{ name: "Gentle Repose" }, { id: "ritualId", level: 5 }] };
  assert.notEqual((await client.callTool({ name: "import_pc_options", arguments: ritualImport })).isError, true);
  assert.deepEqual(calls.at(-1).args, ritualImport);
  const gear = { uuid: pc.uuid, requestId: "magic-item-request", magicItems: [{ pack: "dnd-4e-compendium.magic-weapons", id: "weaponId" }] };
  assert.notEqual((await client.callTool({ name: "import_pc_options", arguments: gear })).isError, true);
  assert.deepEqual(calls.at(-1).args, gear);
  const equipment = { uuid: pc.uuid, requestId: "equipment-power-request", equipmentPowers: [{ name: "Frost Weapon Power" }] };
  assert.notEqual((await client.callTool({ name: "import_pc_options", arguments: equipment })).isError, true);
  assert.deepEqual(calls.at(-1).args, equipment);
  const pcCalls = calls.length;
  for (const invalidPc of [
    { ...pc, uuid: "Scene.scene.Token.token.Actor.pc" },
    { ...pc, powers: [{ name: "Cleave", level: 31 }] },
    { ...pc, feats: [{ name: "Toughness" }] },
    { ...pc, powers: [{ name: "Cleave", id: "power", level: 1 }] },
    { ...pc, feats: [{ name: "Toughness", level: 1, system: {} }] },
    { ...pc, rituals: [{ name: "Gentle Repose", id: "ritualId" }] },
    { ...pc, rituals: [{ name: "Gentle Repose", level: 0 }] },
    { ...pc, rituals: [{ name: "Gentle Repose", system: {} }] },
    { ...pc, rituals: Array.from({ length: 99 }, () => ({ name: "Gentle Repose" })) },
    { ...pc, magicItems: [{ id: "weaponId" }] },
    { ...pc, magicItems: [{ pack: "pack", name: "Weapon", id: "weaponId" }] },
    { ...pc, magicItems: [{ pack: "pack", name: "Weapon", level: 1 }] },
    { ...pc, magicItems: [{ pack: "pack", name: "Weapon", quantity: 2 }] },
    { ...pc, magicItems: Array.from({ length: 99 }, () => ({ pack: "pack", name: "Weapon" })) },
    { ...pc, equipmentPowers: [{ name: "Frost", level: 31 }] },
    { ...pc, equipmentPowers: [{ name: "Frost", id: "power" }] },
    { ...pc, equipmentPowers: [{ name: "Frost", system: {} }] },
    { ...pc, equipmentPowers: Array.from({ length: 99 }, () => ({ name: "Frost" })) },
    { ...pc, powers: [], feats: [] }
  ]) {
    assert.equal((await client.callTool({ name: "import_pc_options", arguments: invalidPc })).isError, true);
  }
  assert.equal(calls.length, pcCalls);
  assert.equal(tools.find(tool => tool.name === "import_pc_options").annotations.readOnlyHint, false);
  assert.notEqual((await client.callTool({ name: "fix_pc_item_icons", arguments: { uuid: "Actor.pc" } })).isError, true);
  assert.deepEqual(calls.at(-1), { operation: "fix_pc_item_icons", args: { uuid: "Actor.pc" } });
  const iconCalls = calls.length;
  for (const invalid of [{ uuid: "Compendium.pack.Actor.pc" }, { uuid: "Actor.pc", img: "custom.webp" }]) {
    assert.equal((await client.callTool({ name: "fix_pc_item_icons", arguments: invalid })).isError, true);
  }
  assert.equal(calls.length, iconCalls);
  assert.equal(tools.find(tool => tool.name === "fix_pc_item_icons").annotations.readOnlyHint, false);
});
