import { expect } from "@playwright/test";
import { settings } from "../config.mjs";

/**
 * Reuse saved authentication, or join as an explicitly configured passwordless test user.
 * Password-protected worlds use the interactive login command and local storage state.
 */
export async function openTestWorld(page, userName = settings.userName) {
  await page.goto("./");
  if (new URL(page.url()).pathname.endsWith("/join") && userName) {
    const selector = page.getByRole("textbox", { name: "Select User", exact: true });
    await selector.click();
    await page.getByRole("listitem").filter({ hasText: new RegExp(`^${userName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).click();
    await page.getByRole("button", { name: "Join Game Session", exact: true }).click();
  }
  await expect.poll(async () => page.evaluate(() => Boolean(globalThis.game?.ready)), {
    message: "Foundry must be ready. For password-protected users run npm run test:foundry:login; log out competing GM sessions.",
    timeout: 60000,
  }).toBe(true);
}
