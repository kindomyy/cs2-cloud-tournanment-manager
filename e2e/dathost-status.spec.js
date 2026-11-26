import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";

const serverId = "6aeb4b88dfc88e8d331a5288";
async function adminFixture(page, { previousSuccess = false } = {}) {
  const config = defaultArena();
  config.server = { address: "127.0.0.1:27015", dathostServerId: serverId };
  const success = { at: "2026-11-17T09:00:00.000Z", ok: true, serverId, name: "Arena", address: "127.0.0.1:27015" };
  let refreshFails = false;
  await page.route("**/api/arena", (route) => route.fulfill({ json: {
    config, state: config.state, revision: 1, readies: [], vetos: [], verified: [], runtimes: {},
    steamConfigured: true, me: { role: "admin" },
  } }));
  await page.route("**/api/matches", (route) => route.fulfill({ json: { configured: true, matches: [] } }));
  await page.route("**/api/operations*", (route) => {
    if (route.request().method() === "POST") {
      refreshFails = true;
      return route.fulfill({ status: 502, json: { error: "DatHost’a ağ bağlantısı kurulamadı; oyun komutu gönderilmedi." } });
    }
    if (refreshFails) return route.fulfill({ status: 503, json: { error: "Durum yenilenemedi." } });
    return route.fulfill({ json: {
      health: {
        database: true, missingTables: [], steamConfigured: true, adminConfigured: true,
        webhookConfigured: true, dathostConfigured: true, serverId, origin: "https://arena.test",
        lastWebhook: null, lastDathostTest: previousSuccess ? success : null,
        lastDathostAttempt: previousSuccess ? success : null,
      },
      audit: [], jobs: [], backups: [],
    } });
  });
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Sistem & Yedek" }).click();
  return page.locator(".operations-panel .admin-settings-card").filter({ has: page.getByRole("heading", { name: "Gerçek sunucu erişimi", exact: true }) });
}

test("configured DatHost settings remain unverified until a real connection test", async ({ page }) => {
  const card = await adminFixture(page);
  const settings = page.locator(".operations-panel .admin-settings-card").filter({ has: page.getByRole("heading", { name: "Kurulum durumu", exact: true }) });
  await expect(settings.locator("dl > div").filter({ hasText: "DatHost erişim ayarları" })).toContainText("Ayarlar girildi");
  await expect(card).toContainText("Bağlantı henüz doğrulanmadı");
  await expect(card).toContainText(serverId);
  await expect(card).not.toContainText("Son bağlantı testi başarılı");
});

test("failed DatHost test replaces success even when refreshing server status also fails", async ({ page }) => {
  const card = await adminFixture(page, { previousSuccess: true });
  await expect(card).toContainText("Son bağlantı testi başarılı");
  await page.getByRole("button", { name: "DatHost bağlantısını test et" }).click();
  await expect(card).toContainText("Son bağlantı testi başarısız");
  await expect(card).not.toContainText("Son bağlantı testi başarılı");
  await expect(card).toContainText("Son başarılı test:");
  await expect(card).toContainText("sunucunun kapalı olduğunu kanıtlamaz");
  await expect(card).toContainText("oyun komutu gönderilmedi");
  const summary = page.getByLabel("Turnuva hazırlık durumu");
  await expect(summary).toContainText("Durum alınamadı; Sistem & Yedek bölümünden kontrol et");
  await expect(summary).not.toContainText("Son test başarılı");
});
