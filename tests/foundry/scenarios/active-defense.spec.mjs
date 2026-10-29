import { test, expect } from "@playwright/test";
import { settings } from "../config.mjs";
import { openTestWorld } from "../helpers/session.mjs";

test("the assigned player defends through the real dialog and GM socket", async ({ page: gm, browser }, testInfo) => {
  const playerContext = await browser.newContext({ storageState: { cookies: [], origins: [] },
    baseURL: `${settings.url.replace(/\/$/, "")}/`, viewport: { width: 1920, height: 1080 } });
  const player = await playerContext.newPage();
  const errors = [];
  let phase = "startup";
  for (const [role, page] of [["GM", gm], ["player", player]]) {
    page.on("pageerror", error => errors.push({ role, phase, message: error.message, stack: error.stack }));
  }
  let created = false;
  try {
    await openTestWorld(gm);
    expect(await gm.evaluate(() => game.world.id)).toBe(settings.worldId);
    expect(await gm.evaluate(() => game.user.isGM)).toBe(true);
    await openTestWorld(player, settings.playerName);
    expect(await player.evaluate(() => game.world.id)).toBe(settings.worldId);
    const owner = await player.evaluate(() => ({ id: game.user.id, isGM: game.user.isGM }));
    expect(owner.isGM, "Use a non-GM test player").toBe(false);
    await expect.poll(() => gm.evaluate(id => game.users.get(id)?.active, owner.id)).toBe(true);
    phase = "defense";

    const fixture = await gm.evaluate(async ownerId => {
      const url = new URL("modules/banter-4e-modifications/test-foundry/active-defense-fixture.js", document.baseURI);
      const { createDefenseScenario } = await import(url.href);
      window.activeDefenseScenario = await createDefenseScenario({ ownerId, dialogs: true, formulas: ["2d20kh1 + 6"] });
      const { message, actors, tokens } = window.activeDefenseScenario;
      return { messageId: message.id, actorId: actors[0].id, tokenId: tokens[0].id,
        targetId: message.flags.playerDefense.targets[0].id };
    }, owner.id);
    created = true;

    const dialog = player.locator(".player-defense-dialog-window");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("DC 18");
    await expect(dialog).toContainText("Roll 2d20kl1 + 12 to defend");
    await expect(dialog).toContainText("Your character is struck.");
    await expect(gm.locator(".player-defense-dialog-window")).toHaveCount(0);
    await expect.poll(() => gm.evaluate(id => game.messages.get(id)?.flags.playerDefense.targets[0].dialogAttempted, fixture.messageId)).toBe(true);
    await dialog.getByRole("button", { name: "Defend Yourself", exact: true }).click();

    await expect.poll(() => gm.evaluate(id => game.messages.get(id)?.flags.playerDefense.targets[0].resolved, fixture.messageId)).toBe(true);
    const result = await gm.evaluate(({ messageId, actorId }) => {
      const message = game.messages.get(messageId);
      const target = message.flags.playerDefense.targets[0];
      return { target, rolls: message.rolls.map(roll => ({ total: roll.total,
        tokenId: roll.options.banterDefenseTarget, formula: roll.formula })), content: message.content,
        pending: message.flags["dnd4e-health-display"].attackResults.pending,
        hp: game.actors.get(actorId).system.attributes.hp.value };
    }, fixture);
    expect(result.target.assignedUserId).toBe(owner.id);
    expect(result.target.total).toBe(result.target.natural + 12);
    expect(result.target.outcome).toBe(result.target.natural === 1 ? "critical"
      : result.target.natural === 20 || result.target.total >= 18 ? "miss" : "normal");
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0].tokenId).toBe(fixture.tokenId);
    expect(result.rolls[0].formula.replace(/\[[^\]]*\]/g, "").replace(/\s/g, "")).toBe("2d20kl1+12");
    expect(result.rolls[0].total).toBe(result.target.total);
    expect(result.content).not.toContain("Awaiting defense...");
    expect(result.pending, "Active Defense must leave damage and effects for confirmation").toBe(true);
    expect(result.hp).toBe(40);

    phase = "reload";
    await player.reload();
    await expect.poll(() => player.evaluate(() => Boolean(game.ready))).toBe(true);
    await expect(player.locator(".player-defense-dialog-window")).toHaveCount(0);
    expect(await gm.evaluate(id => game.messages.get(id).rolls.length, fixture.messageId)).toBe(1);
    await testInfo.attach("active-defense-result", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  } finally {
    phase = "cleanup";
    // Close the player before deleting documents so no late dialog actions can target fixtures.
    await playerContext.close();
    if (created) {
      await gm.evaluate(async () => {
        await window.activeDefenseScenario.fixtures.cleanup();
        delete window.activeDefenseScenario;
      });
    }
    await testInfo.attach("browser-errors", { body: JSON.stringify(errors, null, 2), contentType: "application/json" });
  }
  // DnD4e 0.9.3 unconditionally configures example_effects in its ready hook.
  // Preserve that known player-startup error in the report; do not excuse workflow errors.
  const unexpected = errors.filter(error => !(error.role === "player"
    && ["startup", "reload"].includes(error.phase)
    && error.message.startsWith("You must be at least an assistant GM and have ownership over this Compendium to configure it.")
    && error.stack?.includes("applyCustomStatusToCompendium")));
  expect(unexpected, "No unexpected browser errors on either client").toEqual([]);
});
