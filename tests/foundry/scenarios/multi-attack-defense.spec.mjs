import { test, expect } from "@playwright/test";
import { settings } from "../config.mjs";
import { openTestWorld } from "../helpers/session.mjs";

test("a player hit by a multi-attack gets one dialog and rolls every defense at once", async ({ page: gm, browser }, testInfo) => {
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

    // Three creatures attack the player's character in turn; the dialog must wait for all three.
    const fixture = await gm.evaluate(async ownerId => {
      const url = new URL("modules/banter-4e-modifications/test-foundry/active-defense-fixture.js", document.baseURI);
      const { createGroupDefenseScenario } = await import(url.href);
      window.groupDefenseScenario = await createGroupDefenseScenario({ ownerId, attackers: 3, dialogs: true });
      const { messages, heroToken } = window.groupDefenseScenario;
      return { messageIds: messages.map(message => message.id), tokenId: heroToken.id };
    }, owner.id);
    created = true;

    const dialog = player.locator(".player-defense-dialog-window");
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("3 attacks on you");
    for (const dc of ["DC 18", "DC 19", "DC 20"]) {
      await expect(dialog).toContainText(dc);
    }
    await expect(dialog).toContainText("Your character is struck.");
    await expect(gm.locator(".player-defense-dialog-window")).toHaveCount(0);
    await expect.poll(() => gm.evaluate(ids => ids.map(id => game.messages.get(id).flags.playerDefense.targets[0].dialogAttempted), fixture.messageIds))
      .toEqual([true, true, true]);
    await dialog.getByRole("button", { name: "Defend Yourself (3 rolls)", exact: true }).click();

    await expect.poll(() => gm.evaluate(ids => ids.map(id => game.messages.get(id).flags.playerDefense.targets[0].resolved), fixture.messageIds))
      .toEqual([true, true, true]);
    const result = await gm.evaluate(ids => ids.map(id => {
      const message = game.messages.get(id);
      const target = message.flags.playerDefense.targets[0];
      return { rollDC: target.rollDC, total: target.total, natural: target.natural,
        rolls: message.rolls.map(roll => ({ tokenId: roll.options.banterDefenseTarget, total: roll.total })),
        pending: message.flags["dnd4e-health-display"].attackResults.pending };
    }), fixture.messageIds);
    expect(result.map(entry => entry.rollDC), "each attack keeps its own DC").toEqual([18, 19, 20]);
    for (const entry of result) {
      expect(entry.total).toBe(entry.natural + 12);
      expect(entry.rolls, "each message gets exactly its own defense roll").toHaveLength(1);
      expect(entry.rolls[0].tokenId).toBe(fixture.tokenId);
      expect(entry.pending, "Active Defense must leave damage and effects for confirmation").toBe(true);
    }

    phase = "reload";
    await player.reload();
    // A world reload takes well over the default 15 seconds on a development machine.
    await expect.poll(() => player.evaluate(() => Boolean(game.ready)), { timeout: 90000 }).toBe(true);
    await expect(player.locator(".player-defense-dialog-window")).toHaveCount(0);
    await testInfo.attach("multi-attack-defense-result", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  } finally {
    phase = "cleanup";
    // Close the player before deleting documents so no late dialog actions can target fixtures.
    await playerContext.close();
    if (created) {
      await gm.evaluate(async () => {
        await window.groupDefenseScenario.fixtures.cleanup();
        delete window.groupDefenseScenario;
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
