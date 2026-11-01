import { test, expect } from "@playwright/test";
import { settings } from "../config.mjs";
import { openTestWorld } from "../helpers/session.mjs";

const FIXTURE = "modules/banter-4e-modifications/test-foundry/trigger-prompt-fixture.js";
const OPPORTUNITY = "opportunity-attack";

/** Counts of every document type the scenario creates, to prove it cleans up after itself. */
const worldCounts = () => ({
  actors: game.actors.size, items: game.items.size, scenes: game.scenes.size, combats: game.combats.size,
  messages: game.messages.size, tokensOnScenes: game.scenes.reduce((total, scene) => total + scene.tokens.size, 0),
});

/** Every trigger prompt in one client's chat, as plain data. */
const prompts = (page, triggerId) => page.evaluate(id => game.messages
  .filter(message => message.flags?.triggerPrompts && (!id || message.flags.triggerPrompts.triggerId === id))
  .map(message => ({
    id: message.id, triggerId: message.flags.triggerPrompts.triggerId, actorId: message.flags.triggerPrompts.actorId,
    used: message.flags.triggerPrompts.used, recipients: message.flags.triggerPrompts.recipientIds, author: message.author?.id,
    choices: message.flags.triggerPrompts.choices.map(choice => choice.itemId), content: message.content,
  })), triggerId ?? null);

/** Show the chat tab so rendered prompt cards can be inspected and clicked. */
const showChat = page => page.evaluate(() => {
  ui.sidebar.expand();
  ui.sidebar.changeTab("chat", "primary");
});

/**
 * Record what the module does on a client (events, dispatcher calls, prompt cards, token moves), so a
 * failure can be explained from the attached log instead of guessed at.
 */
const traceModule = page => page.evaluate(() => {
  const log = window.triggerTrace = [];
  const stamp = text => log.push(`${new Date().toISOString().slice(14, 23)} ${game.user.name}: ${text}`);
  const triggerPrompts = game.TriggerPrompts;
  triggerPrompts.events.subscribe(event => { stamp(`event ${event.type} ${event.path ? `path ${event.path.length} points` : ""}`); });
  const handle = triggerPrompts.dispatcher.handle.bind(triggerPrompts.dispatcher);
  triggerPrompts.dispatcher.handle = async event => { stamp(`dispatch ${event.type} (combat started: ${game.combat?.started})`); return handle(event); };
  const create = triggerPrompts.promptChat.createPromptCard.bind(triggerPrompts.promptChat);
  triggerPrompts.promptChat.createPromptCard = async card => {
    const started = performance.now();
    stamp(`card ${card.trigger.id} for ${card.actor.name} to ${JSON.stringify(card.recipientIds)}`);
    const result = await create(card);
    stamp(`card created after ${Math.round(performance.now() - started)} ms`);
    return result;
  };
  // A frozen page (not a slow server) shows up as a gap between heartbeats.
  let last = performance.now();
  setInterval(() => {
    const gap = performance.now() - last;
    last = performance.now();
    if (gap > 1500) {
      stamp(`page stalled for ${Math.round(gap)} ms`);
    }
  }, 250);
  Hooks.on("moveToken", (document, movement, operation, user) => stamp(`moveToken ${document.name} by ${user?.name} ${movement.origin.x},${movement.origin.y} -> ${movement.destination.x},${movement.destination.y}`));
});

const card = (page, messageId) => page.locator(`li[data-message-id="${messageId}"]`);
const alert = (page, messageId) => page.locator(`.banter-trigger-alert[data-message-id="${messageId}"]`);

test("prompts reach the right people, stay hidden from everyone else, and work with no GM connected", async ({ page: gm, browser }, testInfo) => {
  test.setTimeout(600000);
  const playerContext = await browser.newContext({ storageState: { cookies: [], origins: [] },
    baseURL: `${settings.url.replace(/\/$/, "")}/`, viewport: { width: 1920, height: 1080 } });
  const player = await playerContext.newPage();
  const errors = [];
  let phase = "startup";
  let gmPage = gm;
  for (const [role, page] of [["GM", gm], ["player", player]]) {
    page.on("pageerror", error => errors.push({ role, phase, message: error.message, stack: error.stack }));
  }
  let cleanup = null;
  let countsBefore;
  try {
    // --- Both users join, and the GM is provably the only GM ---------------------------------------------
    await openTestWorld(gm);
    const environment = await gm.evaluate(() => ({
      worldId: game.world.id, isGM: game.user.isGM, gmCount: game.users.filter(user => user.isGM && user.active).length,
      triggerPrompts: game.settings.get("banter-4e-modifications", "enable-trigger-prompts") && Boolean(game.TriggerPrompts),
      activeSceneId: game.scenes.active?.id ?? null,
    }));
    expect(environment.worldId, "Refusing to run against a different world").toBe(settings.worldId);
    expect(environment.gmCount, "Log out every other GM first: the no-GM phase needs this GM to be the only one").toBe(1);
    expect(environment.triggerPrompts, "Enable trigger prompts in the test world and reload").toBe(true);
    expect(environment.activeSceneId, "The world needs an active scene to restore afterwards").not.toBeNull();
    await openTestWorld(player, settings.playerName);
    const owner = await player.evaluate(() => ({ id: game.user.id, isGM: game.user.isGM }));
    expect(owner.isGM, "Use a non-GM test player").toBe(false);
    await expect.poll(() => gm.evaluate(id => game.users.get(id)?.active, owner.id)).toBe(true);
    const gmId = await gm.evaluate(() => game.user.id);
    countsBefore = await gm.evaluate(worldCounts);

    // --- A player-owned hero and a hostile wolf, both with trigger-assigned powers ------------------------
    phase = "setup";
    const since = Date.now();
    const fixture = await gm.evaluate(async ({ fixtureUrl, ownerId }) => {
      const { TriggerWorld, powerData } = await import(new URL(fixtureUrl, document.baseURI).href);
      const world = await TriggerWorld.open({ shared: true });
      window.triggerScenario = world;
      await world.encounter([
        { key: "hero", col: 5, row: 6, ownerId, powers: [
          powerData("Hero Reaction", { triggers: ["enemy-hits-you", "enemy-misses-you", "you-miss", "you-become-bloodied"] }),
          powerData("Hero Opportunity Strike", { opportunity: true }),
        ] },
        { key: "wolf", type: "NPC", col: 8, row: 5, disposition: -1, powers: [powerData("Wolf Opportunity Bite", { opportunity: true })] },
      ]);
      const { actor: hero, token: heroToken } = world.get("hero");
      const { actor: wolf, token: wolfToken } = world.get("wolf");
      return { runIds: world.runIds, sceneId: world.scene.id, previousActiveSceneId: world.previousActiveSceneId, heroId: hero.id, heroTokenId: heroToken.id, wolfId: wolf.id, wolfTokenId: wolfToken.id,
        heroOpportunityId: world.powerId("hero", "Hero Opportunity Strike"), heroReactionId: world.powerId("hero", "Hero Reaction"),
        strikeId: world.powerId("hero", "Test Strike") };
    }, { fixtureUrl: FIXTURE, ownerId: owner.id });
    cleanup = { runIds: fixture.runIds, since, restoreActiveSceneId: fixture.previousActiveSceneId };
    expect(fixture.previousActiveSceneId, "The fixture scene replaced this active scene").toBe(environment.activeSceneId);

    // --- Can a player's client read the other combatants' actors? The central assumption. ----------------
    await expect.poll(() => player.evaluate(sceneId => canvas.ready && canvas.scene?.id === sceneId, fixture.sceneId), { message: "the player's canvas follows the activated scene", timeout: 60000 }).toBe(true);
    await expect.poll(() => player.evaluate(() => game.combat?.started && game.combat.combatants.size === 2), { timeout: 30000 }).toBe(true);
    const visibility = await player.evaluate(({ wolfId, wolfTokenId }) => ({
      wolfActorReadable: Boolean(game.actors.get(wolfId)),
      wolfCombatantActor: Boolean(game.combat.combatants.find(combatant => combatant.tokenId === wolfTokenId)?.actor),
      wolfPowers: game.combat.combatants.find(combatant => combatant.tokenId === wolfTokenId)?.actor?.items.size ?? 0,
    }), fixture);
    await testInfo.attach("player-visibility-of-npc-actor", { body: JSON.stringify(visibility, null, 2), contentType: "application/json" });
    expect(visibility.wolfCombatantActor, "A player's client must be able to read an NPC combatant's actor, or it cannot evaluate triggers about it").toBe(true);
    expect(visibility.wolfPowers).toBeGreaterThan(0);

    // Record power use on both clients instead of opening DnD4e's power dialog.
    for (const page of [gm, player]) {
      await page.evaluate(heroId => {
        window.usePowerCalls = [];
        game.actors.get(heroId).usePower = async item => { window.usePowerCalls.push(item.id); };
      }, fixture.heroId);
      await showChat(page);
      await traceModule(page);
    }

    // --- A: the player moves, so the player's client evaluates ------------------------------------------
    phase = "player-move";
    // A page function must not return a Foundry document: Playwright would serialize its whole object graph
    // (scene, canvas, ...) and freeze the page for many seconds. Await the update and return nothing.
    await player.evaluate(async ({ heroTokenId }) => { await canvas.scene.tokens.get(heroTokenId).update({ x: 300 + 12 * 100, y: 300 + 6 * 100 }, { animate: false }); }, fixture);
    await expect.poll(async () => (await prompts(gm, OPPORTUNITY)).length, { message: "the GM receives the wolf's opportunity prompt", timeout: 15000 }).toBe(1);
    const [wolfPrompt] = await prompts(gm, OPPORTUNITY);
    expect(wolfPrompt.actorId).toBe(fixture.wolfId);
    expect(wolfPrompt.author, "authored by the player whose move caused it").toBe(owner.id);
    expect(wolfPrompt.recipients, "meant for the GM only").toEqual([gmId]);
    expect(wolfPrompt.choices).toEqual([await gm.evaluate(id => game.actors.get(id).items.find(item => item.name === "Wolf Opportunity Bite").id, fixture.wolfId)]);
    // The player authored it, so Foundry would show it to them; the module hides it.
    await expect.poll(() => card(player, wolfPrompt.id).count()).toBe(1);
    await expect(card(player, wolfPrompt.id)).toHaveClass(/trigger-prompts-message--hidden/);
    await expect(card(player, wolfPrompt.id)).toBeHidden();
    await expect(card(gm, wolfPrompt.id)).toBeHidden();
    await expect(alert(gm, wolfPrompt.id).locator("[data-trigger-prompt-action='use']")).toBeVisible();
    // Nobody answers, so the author's own client removes it after the deadline: no GM involved.
    await expect.poll(async () => (await prompts(gm, OPPORTUNITY)).length, { message: "the unanswered card is removed by its author", timeout: 25000 }).toBe(0);

    // --- B: the GM moves, a prompt for the player's hero; both recipients answer at once ------------------
    phase = "simultaneous-claim";
    await gm.evaluate(async ({ wolfTokenId }) => { await canvas.scene.tokens.get(wolfTokenId).update({ x: 300 + 16 * 100, y: 300 + 5 * 100 }, { animate: false }); }, fixture);
    await expect.poll(async () => (await prompts(player, OPPORTUNITY)).length, { timeout: 15000 }).toBe(1);
    const [heroPrompt] = await prompts(player, OPPORTUNITY);
    expect(heroPrompt.actorId).toBe(fixture.heroId);
    expect(heroPrompt.author, "authored by the GM who moved the wolf").toBe(gmId);
    expect(heroPrompt.recipients.sort()).toEqual([gmId, owner.id].sort());
    expect(heroPrompt.choices).toEqual([fixture.heroOpportunityId]);
    const useButton = id => `.banter-trigger-alert[data-message-id="${id}"] [data-trigger-prompt-action='use']`;
    await expect(gm.locator(useButton(heroPrompt.id))).toBeVisible();
    await expect(player.locator(useButton(heroPrompt.id))).toBeVisible();
    await expect(alert(player, heroPrompt.id).locator("[data-trigger-prompt-action='dismiss']")).toHaveText("Ignore");
    await Promise.all([gm.locator(useButton(heroPrompt.id)).click(), player.locator(useButton(heroPrompt.id)).click()]);
    await expect.poll(async () => (await prompts(gm, OPPORTUNITY))[0]?.used, { message: "the claim is stored", timeout: 15000 }).toBe(true);
    await expect(gm.locator(useButton(heroPrompt.id))).toHaveCount(0);
    await expect(player.locator(useButton(heroPrompt.id))).toHaveCount(0);
    await expect.poll(async () => {
      const [gmCalls, playerCalls] = await Promise.all([gm, player].map(page => page.evaluate(() => window.usePowerCalls)));
      return [...gmCalls, ...playerCalls];
    }, { message: "exactly one of the two simultaneous clicks used the power", timeout: 10000 }).toEqual([fixture.heroOpportunityId]);
    // A claimed prompt retains its hidden synchronization record; only unanswered ones expire.
    expect((await prompts(gm, OPPORTUNITY)).map(prompt => prompt.used)).toEqual([true]);

    // --- C: the GM disconnects; the player's own actions still produce prompts -----------------------------
    phase = "no-gm";
    await gm.close();
    gmPage = null;
    await expect.poll(() => player.evaluate(() => game.users.filter(user => user.isGM && user.active).length), { message: "the GM must be gone", timeout: 30000 }).toBe(0);
    await player.evaluate(heroId => { window.usePowerCalls = []; }, fixture.heroId);

    // C1: the player attacks the wolf and misses -> "you miss" for the hero, delivered to the player alone.
    await player.evaluate(async ({ heroId, heroTokenId, wolfTokenId, strikeId }) => {
      const item = game.actors.get(heroId).items.get(strikeId);
      const speaker = { actor: heroId, token: heroTokenId, scene: canvas.scene.id };
      Hooks.callAll("dnd4e.rollAttack", item, { targets: [canvas.tokens.get(wolfTokenId)], targDefValArray: [15], targDefArray: ["ac"], targetHit: [], targetMissed: [] }, speaker);
      await ChatMessage.create({ flavor: item.name, speaker, rolls: [await new Roll("5").evaluate()] }, { notify: false });
    }, fixture);
    await expect.poll(async () => (await prompts(player, "you-miss")).length, { message: "a prompt with no GM connected", timeout: 15000 }).toBe(1);
    const [missPrompt] = await prompts(player, "you-miss");
    expect(missPrompt.author).toBe(owner.id);
    expect(missPrompt.recipients, "only the connected owner").toEqual([owner.id]);
    await showChat(player);
    await expect(card(player, missPrompt.id)).toBeHidden();
    await expect(alert(player, missPrompt.id).locator("[data-trigger-prompt-action='use']")).toBeVisible();

    // C2: the same player claims it with nobody else connected to keep the prompt.
    await alert(player, missPrompt.id).locator("[data-trigger-prompt-action='use']").click();
    await expect.poll(async () => (await prompts(player, "you-miss"))[0]?.used, { timeout: 15000 }).toBe(true);
    await expect(alert(player, missPrompt.id)).toHaveCount(0);
    expect(await player.evaluate(() => window.usePowerCalls), "the claimed power was used exactly once").toEqual([fixture.heroReactionId]);

    // C3: a move past the wolf would prompt the wolf's owner, the GM, who is not here: nothing is created.
    await player.evaluate(async ({ heroTokenId }) => { await canvas.scene.tokens.get(heroTokenId).update({ x: 300 + 20 * 100, y: 300 + 6 * 100 }, { animate: false }); }, fixture);
    await new Promise(resolve => setTimeout(resolve, 2500));
    expect((await prompts(player, OPPORTUNITY)).filter(prompt => prompt.actorId === fixture.wolfId), "no prompt for a recipient who is not connected").toEqual([]);

    // C4: the player's own damage crosses the bloodied line -> a prompt, which expires without any GM.
    await player.evaluate(async heroId => { await game.actors.get(heroId).update({ "system.attributes.hp.value": 10 }); }, fixture.heroId);
    await expect.poll(async () => (await prompts(player, "you-become-bloodied")).length, { timeout: 15000 }).toBe(1);
    await expect.poll(async () => (await prompts(player, "you-become-bloodied")).length, { message: "expired and removed by the player's own client", timeout: 25000 }).toBe(0);

  } catch (error) {
    for (const [role, page] of [["GM", gmPage], ["player", player]]) {
      if (page && !page.isClosed()) {
        const trace = await page.evaluate(() => ({ trace: window.triggerTrace ?? [], prompts: game.messages.filter(message => message.flags?.triggerPrompts).map(message => ({ trigger: message.flags.triggerPrompts.triggerId, used: message.flags.triggerPrompts.used, whisper: message.whisper })), tokens: canvas.scene?.tokens.map(token => `${token.name}@${token.x},${token.y}`), scene: canvas.scene?.name })).catch(() => null);
        await testInfo.attach(`${role}-trace-at-failure`, { body: JSON.stringify(trace, null, 2), contentType: "application/json" });
      }
    }
    throw error;
  } finally {
    phase = "cleanup";
    await playerContext.close();
    if (cleanup) {
      if (gmPage && !gmPage.isClosed()) {
        // The GM is still here (the scenario failed before the no-GM phase): use its own world object.
        await gmPage.evaluate(async () => {
          await window.triggerScenario?.close();
          delete window.triggerScenario;
        });
      } else {
        // The GM was closed on purpose, so bring a new GM back and delete by run ID.
        const returning = await gm.context().newPage();
        returning.on("pageerror", error => errors.push({ role: "GM", phase, message: error.message, stack: error.stack }));
        try {
          await openTestWorld(returning);
          await returning.evaluate(async ({ fixtureUrl, ...options }) => {
            const { TriggerWorld } = await import(new URL(fixtureUrl, document.baseURI).href);
            await TriggerWorld.cleanupRuns({ ...options, accounts: ["Integrated Tests", "Player"] });
          }, { fixtureUrl: FIXTURE, ...cleanup });
          expect(await returning.evaluate(worldCounts), "Cleanup must leave the world as it was found").toEqual(countsBefore);
        } finally {
          await returning.close().catch(() => {});
        }
      }
    }
    await testInfo.attach("browser-errors", { body: JSON.stringify(errors, null, 2), contentType: "application/json" });
  }
  // DnD4e 0.9.3 configures example_effects in its ready hook, which throws for a non-GM on startup.
  const unexpected = errors.filter(error => !(error.role === "player" && ["startup", "setup"].includes(error.phase)
    && error.message.startsWith("You must be at least an assistant GM and have ownership over this Compendium to configure it.")
    && error.stack?.includes("applyCustomStatusToCompendium")));
  expect(unexpected, "No unexpected browser errors on either client").toEqual([]);
});
