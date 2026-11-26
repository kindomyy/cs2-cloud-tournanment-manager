import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";

async function preparingAdmin(page, healthOverride = {}) {
  const config = defaultArena();
  config.title = "OKUL TURNUVASI";
  for (const [index, team] of config.teams.entries()) {
    team.name = index < 2 ? ["Mavi Takım", "Turuncu Takım"][index] : "YENİ TAKIM";
    team.roster = index < 2 ? [{
      id: `${team.id}-1`, name: `Oyuncu ${index + 1}`, steamId: null,
    }] : [];
    team.players = team.roster.map((player) => player.name);
    team.captainId = team.roster[0]?.id || "";
  }
  config.server = { address: "", dathostServerId: "" };
  const snapshot = {
    revision: 1, config, state: config.state, readies: [], vetos: [], verified: [],
    verifiedPlayerIds: [], me: { role: "admin" }, steamConfigured: true, runtimes: {},
  };
  const writes = [];
  await page.route("**/api/arena", async (route) => {
    if (route.request().method() === "POST") {
      const data = route.request().postDataJSON();
      writes.push(data);
      expect(data.action).toBe("config");
      expect(data.revision).toBe(snapshot.revision);
      snapshot.config = data.config;
      snapshot.state = data.config.state;
      snapshot.revision++;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: snapshot });
  });
  await page.route("**/api/matches", (route) => route.fulfill({
    json: { configured: true, matches: [] },
  }));
  await page.route("**/api/operations", (route) => route.fulfill({ json: {
    health: {
      database: true, missingTables: [], steamConfigured: true, adminConfigured: true,
      webhookConfigured: true, dathostConfigured: true, lastWebhook: null,
      lastDathostAttempt: null, lastDathostTest: null, ...healthOverride,
    },
    audit: [], backups: [], jobs: [],
  } }));
  await page.goto("/#admin");
  await expect(page.getByRole("heading", { name: "Kontrol sende." })).toBeVisible();
  return { snapshot, writes };
}

test("admin preparation summary distinguishes incomplete rosters, unset dates and untested connection", async ({ page }) => {
  await preparingAdmin(page);
  const summary = page.getByLabel("Turnuva hazırlık durumu");
  await expect(summary.getByRole("heading")).toHaveText("Turnuva hazırlanıyor");
  await expect(summary).toContainText("8/8 takım · 2 kayıtlı oyuncu");
  await expect(summary).toContainText("6 takımın adı belirlenmedi");
  await expect(summary).not.toContainText("Belirlenmeyen saatler");
  await expect(summary).toContainText("Beklenen bağlantı testi · Ayarlar girildi");
  await expect(summary).toContainText("Henüz alınmadı");
  await expect(summary).not.toContainText("Son test başarılı");
  await expect(summary).not.toContainText("SAHNE HAZIR");
});

test("failed connection test is visible independently of configured settings", async ({ page }) => {
  await preparingAdmin(page, {
    lastDathostAttempt: { at: "2026-11-17T08:30:00.000Z", ok: false },
  });
  const summary = page.getByLabel("Turnuva hazırlık durumu");
  await expect(summary).toContainText("Son test başarısız");
  await expect(summary).not.toContainText("Son test başarılı");
  await expect(summary).not.toContainText("Erişim ayarları eksik");
});

test("confirmed live phase updates the tournament summary before the first score", async ({ page }) => {
  const { snapshot } = await preparingAdmin(page);
  snapshot.runtimes.U2 = {
    matchId: "U2", externalId: snapshot.config.schedule.U2.externalId,
    phase: "live", lastEvent: "going_live",
  };
  await page.reload();
  await expect(page.getByLabel("Turnuva hazırlık durumu").getByRole("heading")).toHaveText("Turnuva sürüyor");
});

test("selected match separates schedule, veto, score and server actions while keeping its checklist", async ({ page }) => {
  await preparingAdmin(page);
  await page.getByRole("button", { name: "Maç yönetimi" }).click();
  const checklist = page.getByLabel("Seçili maçın hazırlık özeti");
  await expect(checklist).toContainText("Mavi Takım · Turuncu Takım");
  await expect(checklist).toContainText("kadro 1/5");
  await expect(checklist).toContainText("Şu anki aşama");
  await expect(checklist).toContainText("Eksik / beklenen");
  await expect(checklist).toContainText("Sıradaki işlem");
  await expect(page.getByRole("tabpanel", { name: "Ayarlar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerçek vetoyu zorla başlat" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Maçı sunucuya yükle" })).toHaveCount(0);

  for (const name of ["Veto", "Skor", "Sunucu", "Ayarlar"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await expect(page.getByRole("tabpanel", { name, exact: true })).toBeVisible();
    await expect(checklist).toBeVisible();
  }
  await page.locator(".matches-admin > .admin-team-list").getByRole("button").filter({ hasText: "U5" }).click();
  await expect(checklist).toContainText("SEÇİLİ MAÇ / U5");
  await expect(checklist).toContainText("Önceki maçların sonuçlarıyla iki takımın da belli olması bekleniyor");
  await expect(page.getByRole("tab", { name: "Ayarlar", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("save action remains in the 390px viewport after editing a roster field", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { snapshot, writes } = await preparingAdmin(page);
  await page.getByLabel("1. oyuncu görünen isim", { exact: true }).fill("Yeni oyuncu adı");
  const bar = page.locator(".admin-save-bar");
  const save = bar.getByRole("button", { name: "Değişiklikleri kaydet" });
  await expect(bar).toContainText("Değişikliklerin henüz yayınlanmadı");
  await expect(save).toBeEnabled();
  await expect(save).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await save.click();
  await expect(bar).toContainText("Kayıt güncel");
  expect(writes).toHaveLength(1);
  expect(snapshot.config.teams[0].roster[0].name).toBe("Yeni oyuncu adı");
});

test("organizer contact saves and remains visible on the rules page after reload", async ({ page }) => {
  const { snapshot, writes } = await preparingAdmin(page);
  await page.getByRole("button", { name: "Turnuva & API" }).click();
  await page.getByLabel("Organizatör / yetkili adı", { exact: true }).fill("Turnuva Komitesi");
  await page.getByLabel("Organizatöre ulaşma yolu", { exact: true }).fill("turnuva@okul.test · Öğrenci işleri");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  expect(writes.at(-1).config.organizer).toEqual({
    name: "Turnuva Komitesi", contact: "turnuva@okul.test · Öğrenci işleri",
  });
  expect(snapshot.config.organizer).toEqual(writes.at(-1).config.organizer);
  await page.goto("/#kurallar");
  await expect(page.getByLabel("Organizatöre ulaş")).toContainText("Turnuva Komitesi");
  await expect(page.getByLabel("Organizatöre ulaş")).toContainText("turnuva@okul.test · Öğrenci işleri");
  await page.reload();
  await expect(page.getByLabel("Organizatöre ulaş")).toContainText("turnuva@okul.test · Öğrenci işleri");
});
