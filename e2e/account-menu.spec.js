import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";

const steamId = "76561198000000002";
const avatar = `https://avatars.steamstatic.com/${"a".repeat(40)}_full.jpg`;
const nextAvatar = `https://avatars.steamstatic.com/${"b".repeat(40)}_full.jpg`;
async function fixture(page, { role = "player", profile = { name: "Steam Hesabım", avatar }, displayName, unrostered = false, brokenAvatar = false, logoutFails = false } = {}) {
  const config = defaultArena();
  config.title = "Hesap Testi";
  if (!unrostered) config.teams[0].roster[1].steamId = steamId;
  let me = role === "guest" ? null : role === "admin" ? { role: "admin" } : { role: "player", steamId, displayName, ...(profile ? { profile } : {}) };
  const writes = [];
  await page.route("https://avatars.steamstatic.com/**", (route) => brokenAvatar ? route.abort() : route.fulfill({
    contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJawAAAAASUVORK5CYII=", "base64"),
  }));
  await page.route("**/api/matches", (route) => route.fulfill({ json: { configured: true, matches: [] } }));
  await page.route("**/api/arena", (route) => route.fulfill({ json: {
    revision: 1, config, state: config.state, me, steamConfigured: true,
    readies: [], vetos: [], verified: me?.role === "player" ? [{ steam_id: steamId, verified_at: Date.now(), game_name: null }] : [],
    runtimes: {},
  } }));
  await page.route("**/api/auth/steam/profile", async (route) => {
    writes.push({ path: "profile", method: route.request().method(), body: route.request().postDataJSON() });
    me = { ...me, profile: { name: "Yeni Steam Adım", avatar: nextAvatar } };
    await route.fulfill({ json: { ok: true, profile: me.profile, refreshed: true } });
  });
  await page.route("**/api/auth/logout", async (route) => {
    writes.push({ path: "logout", method: route.request().method() });
    if (logoutFails) return route.fulfill({ status: 503, json: { error: "Oturum şu anda kapatılamadı." } });
    me = null;
    return route.fulfill({ json: { ok: true } });
  });
  return { config, writes };
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 390, height: 844 });
});

test("guest account menu shows Misafir, a safe Steam return link and accessible dismissal", async ({ page }) => {
  await fixture(page, { role: "guest" });
  await page.goto("/#sonuclar");
  const trigger = page.locator(".account-trigger");
  await expect(trigger).toContainText("Misafir");
  await expect(trigger.locator("img")).toHaveCount(0);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Hesap menüsü", exact: true });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.getByRole("link", { name: "Hesap ayarları" })).toHaveAttribute("href", "#hesap");
  await expect(dialog.getByRole("link", { name: "Steam ile giriş yap" })).toHaveAttribute("href", "/api/auth/steam/start?returnTo=%2F%23sonuclar");
  await expect(dialog.getByRole("link", { name: "Yönetim paneli" })).toHaveCount(0);
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(page.viewportSize().width - 5, 100);
  await expect(dialog).toHaveCount(0);
});

test("Steam avatar and account name lead to settings where the real profile can refresh", async ({ page }) => {
  const { config, writes } = await fixture(page);
  await page.goto("/#sonuclar");
  const trigger = page.locator(".account-trigger");
  await expect(trigger).toContainText("Steam Hesabım");
  await expect(trigger.getByRole("img")).toHaveAttribute("src", avatar);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Hesap menüsü", exact: true });
  await expect(dialog.getByRole("link", { name: "Yönetim paneli" })).toHaveCount(0);
  await dialog.getByRole("link", { name: "Hesap ayarları" }).click();
  await expect(page).toHaveURL(/#hesap$/);
  await expect(page.getByRole("heading", { name: "Hesap ayarları." })).toBeVisible();
  const account = page.getByRole("region", { name: "Steam hesap bilgileri" });
  await expect(account).toContainText("Steam Hesabım");
  await expect(account).toContainText(config.teams[0].roster[1].name);
  await expect(account).toContainText(steamId);
  await expect(account.getByRole("textbox")).toHaveCount(0);
  await account.getByRole("button", { name: "Steam profilini yenile" }).click();
  await expect(account.getByRole("status")).toContainText("yenilendi");
  await expect(trigger).toContainText("Yeni Steam Adım");
  await expect(account.getByRole("img", { name: "Yeni Steam Adım Steam profil fotoğrafı", exact: true })).toHaveAttribute("src", nextAvatar);
  expect(writes).toEqual([{ path: "profile", method: "POST", body: {} }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("unavailable Steam profile uses the verified Steam ID without an invented name or picture", async ({ page }) => {
  await fixture(page, { profile: null, unrostered: true });
  await page.goto("/#hesap");
  const trigger = page.locator(".account-trigger");
  await expect(trigger).toContainText(`Steam kullanıcısı ${steamId}`);
  await expect(trigger.locator("img")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Steam hesap bilgileri" })).toContainText(steamId);
  await expect(page.getByRole("region", { name: "Steam hesap bilgileri" }).locator("img")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Kadroya eklenmen bekleniyor." })).toBeVisible();
});

test("admin site name is used in the account menu and stays visible after a Steam profile refresh", async ({ page }) => {
  await fixture(page, { displayName: "abcd" });
  await page.goto("/#hesap");
  const trigger = page.locator(".account-trigger");
  const account = page.getByRole("region", { name: "Steam hesap bilgileri" });
  await expect(trigger).toContainText("abcd");
  await expect(account.getByRole("heading", { name: "abcd", exact: true })).toBeVisible();
  await account.getByRole("button", { name: "Steam profilini yenile" }).click();
  await expect(account.getByRole("img", { name: "abcd Steam profil fotoğrafı", exact: true })).toHaveAttribute("src", nextAvatar);
  await expect(trigger).toContainText("abcd");
});

test("a broken Steam avatar falls back to an account icon while keeping the account name", async ({ page }) => {
  await fixture(page, { brokenAvatar: true });
  await page.goto("/#hesap");
  await expect(page.locator(".account-trigger")).toContainText("Steam Hesabım");
  await expect(page.locator(".account-trigger .account-avatar img")).toHaveCount(0);
  await expect(page.locator(".account-trigger .account-avatar > svg")).toBeVisible();
  await expect(page.locator(".account-profile-card .account-avatar img")).toHaveCount(0);
});

test("admin account identifies its actual role and exposes management without pretending to be Steam", async ({ page }) => {
  await fixture(page, { role: "admin" });
  await page.goto("/#sonuclar");
  const trigger = page.locator(".account-trigger");
  await expect(trigger).toContainText("Site admini");
  await expect(trigger.locator("img")).toHaveCount(0);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Hesap menüsü", exact: true });
  await expect(dialog.getByRole("link", { name: "Yönetim paneli" })).toHaveAttribute("href", "#admin");
  await expect(dialog.getByRole("link", { name: "Steam ile giriş yap" })).toHaveCount(0);
  await dialog.getByRole("link", { name: "Hesap ayarları" }).click();
  await expect(page.getByRole("button", { name: "Steam profilini yenile" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Admin oturumunu kapat" })).toBeVisible();
});

test("account menu signs out to Misafir and keeps a failed signout visible for retry", async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto("/#sonuclar");
  await page.locator(".account-trigger").click();
  await page.getByRole("dialog", { name: "Hesap menüsü", exact: true }).getByRole("button", { name: "Çıkış yap", exact: true }).click();
  await expect(page.locator(".account-trigger")).toContainText("Misafir");
  expect(writes).toEqual([{ path: "logout", method: "POST" }]);
  await fixture(page, { logoutFails: true });
  await page.reload();
  await page.locator(".account-trigger").click();
  const dialog = page.getByRole("dialog", { name: "Hesap menüsü", exact: true });
  await dialog.getByRole("button", { name: "Çıkış yap", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("kapatılamadı");
  await expect(page.locator(".account-trigger")).toContainText("Steam Hesabım");
  await expect(dialog.getByRole("button", { name: "Çıkış yap", exact: true })).toBeEnabled();
});
