import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";

async function mockOnline(page) {
  const config = defaultArena();
  const acceptLanguages = [];
  await page.route("**/api/matches", (route) => {
    acceptLanguages.push({
      path: "/api/matches",
      lang: route.request().headers()["accept-language"] || "",
    });
    return route.fulfill({ json: { configured: true, matches: [] } });
  });
  await page.route("**/api/arena", (route) => {
    acceptLanguages.push({
      path: "/api/arena",
      lang: route.request().headers()["accept-language"] || "",
    });
    return route.fulfill({
      json: {
        revision: 1,
        config,
        state: config.state,
        me: null,
        steamConfigured: true,
        readies: [],
        vetos: [],
        verified: [],
        runtimes: {},
      },
    });
  });
  return { acceptLanguages };
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 390, height: 844 });
  }
});

test("defaults to Turkish, switches cleanly to English, persists across reload, and sends Accept-Language", async ({
  page,
}) => {
  const { acceptLanguages } = await mockOnline(page);
  await page.goto("/#kurallar");

  // Default must stay Turkish even under Chromium en-US locale
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { name: /Kurallar/i })).toBeVisible();
  await expect(page.locator(".account-trigger")).toContainText("Misafir");

  // Switch to English using the language toggle
  const toggle = page.locator(".lang-toggle");
  await expect(toggle).toBeVisible();
  await toggle.getByRole("button", { name: "EN" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: /Rules/i })).toBeVisible();
  await expect(page.locator(".account-trigger")).toContainText("Guest");

  // Check mobile/desktop horizontal overflow
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);

  // Navigate to Teams and Matches pages in English
  await page.goto("/#takimlar");
  await expect(page.getByRole("heading", { name: /Teams on stage/i })).toBeVisible();

  await page.goto("/#maclar");
  await expect(page.getByRole("heading", { name: /Match center/i })).toBeVisible();

  // Reload and verify English preference persists and API requests carry Accept-Language: en
  const beforeReload = acceptLanguages.length;
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: /Match center/i })).toBeVisible();

  const afterReloadHeaders = acceptLanguages
    .slice(beforeReload)
    .map((entry) => entry.lang);
  expect(afterReloadHeaders.some((value) => value.startsWith("en"))).toBe(true);

  // Check Admin login screen in English
  await page.goto("/#admin");
  await expect(page.getByRole("heading", { name: /Admin\./i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Admin sign-in/i })).toBeVisible();

  // Switch back to Turkish
  await page.locator(".lang-toggle").getByRole("button", { name: "TR" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { name: /Yönetim\./i })).toBeVisible();
});
