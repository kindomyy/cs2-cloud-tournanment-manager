import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";
test("legacy match dates are ignored in admin and public views", async ({ page }) => {
  const config = defaultArena();
  config.title = "TARİHSİZ TURNUVA";
  config.schedule.U1 = { ...config.schedule.U1, startsAt: "2026-11-15T11:30:00.000Z", mode: "scheduled", durationMinutes: 45, location: "Okul salonu", notes: "Kaptanlar haber versin." };
  let revision = 1;
  const writes = [];
  await page.route("**/api/arena", route => {
    if (route.request().method() === "POST") {
      const data = route.request().postDataJSON(); writes.push(data);
      Object.assign(config, data.config); revision++;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { revision, config, state: config.state, me: { role: "admin" }, verified: [], readies: [], vetos: [], runtimes: {}, steamConfigured: true } });
  });
  await page.route("**/api/matches", route => route.fulfill({ json: { configured: true, matches: [] } }));
  await page.route("**/api/operations", route => route.fulfill({ json: { health: { dathostConfigured: false, lastWebhook: null }, jobs: [], audit: [], backups: [] } }));
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Maç yönetimi", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Ayarlar", exact: true })).toBeVisible();
  await expect(page.locator('input[type="datetime-local"], input[type="date"], input[type="time"]')).toHaveCount(0);
  await expect(page.locator(".admin-page")).not.toContainText(/Tarih belirlenmedi|Belirlenmeyen saatler|Planlama şekli|Planlanan süre|Maç tarihi ve saati/);
  await page.getByLabel("Oyunculara maç notu").fill("Hazır olduğunda haber ver.");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.locator(".save-notice")).toContainText("Kaydedildi");
  expect(writes.at(-1).config.schedule.U1).toMatchObject({ startsAt: "", mode: "unset", location: "Okul salonu" });
  expect(writes.at(-1).config.schedule.U1).not.toHaveProperty("durationMinutes");
  for (const route of ["turnuva", "maclar", "kurallar"]) {
    await page.goto("/#" + route);
    await expect(page.locator(".brand")).toContainText("TARİHSİZ TURNUVA");
    await expect(page.locator(".site-main")).not.toContainText(/Tarih belirlenmedi|Tarih belirtilmedi|TÜM SAATLER|14:30|2026-11-15|45 dakika/);
  }
  await page.goto("/#turnuva");
  await page.locator(".expanded-scoreboard").getByRole("button", { name: /Maç merkezi/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Okul salonu");
  await expect(dialog).toContainText("Hazır olduğunda haber ver.");
  await expect(dialog).not.toContainText(/Maç takvimi|Planlanan bitiş|14:30|45 dakika/);
});
