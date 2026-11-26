import { expect } from "@playwright/test";

// Offline rehearsals require explicit local admin entry, never a server session.
export async function openAdminDemo(page) {
  await page.route("**/api/arena", route => route.fulfill({ status: 503, json: { error: "Local rehearsal fixture" } }));
  await page.goto("/#admin");
  await page.reload();
  await page.getByRole("button", { name: "Yerel yönetim provasını aç", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kontrol sende." })).toBeVisible();
  await page.evaluate(() => { location.hash = "dene"; });
  await expect(page.getByRole("heading", { name: "Turnuvayı dene." })).toBeVisible();
}
