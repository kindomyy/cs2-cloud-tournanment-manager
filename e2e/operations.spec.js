import { openAdminDemo } from "./demo-session.js";
import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";
async function fixture(page) {
  const config = defaultArena();
  config.server = {
    address: "127.0.0.1:27015",
    dathostServerId: "6aeb4b88dfc88e8d331a5288",
  };
  let snapshot = {
    config,
    state: config.state,
    revision: 1,
    readies: [],
    vetos: [],
    verified: [],
    runtimes: {},
    steamConfigured: true,
    me: { role: "admin" },
  };
  const writes = [];
  await page.route("**/api/matches", (r) =>
    r.fulfill({ json: { configured: true, matches: [] } }),
  );
  await page.route("**/api/arena", async (r) => {
    if (r.request().method() === "POST") {
      const v = r.request().postDataJSON();
      writes.push(v);
      snapshot.config = v.config;
      snapshot.state = v.config.state;
      snapshot.revision++;
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: snapshot });
  });
  await page.route("**/api/operations*", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({
        json: {
          health: {
            database: true,
            missingTables: [],
            steamConfigured: true,
            adminConfigured: true,
            webhookConfigured: true,
            dathostConfigured: true,
            lastWebhook: null,
            lastDathostTest: null,
          },
          audit: [],
          backups: [],
          jobs: [],
        },
      });
    const data = r.request().postDataJSON();
    writes.push(data);
    if (data.action === "validate-backup")
      return r.fulfill({ json: { summary: { teams: 8, maps: 1, rooms: 0 } } });
    if (data.action === "restore-backup")
      return r.fulfill({
        json: { ok: true, previousBackupId: "automatic-backup" },
      });
    if (data.action === "test-server")
      return r.fulfill({
        json: {
          ok: true,
          server: { name: "İstanbul", address: "127.0.0.1:27015" },
        },
      });
    if (!data.confirm)
      return r.fulfill({
        status: 409,
        json: {
          error: "Seçili maç sunucuya yüklenecek. Onayla.",
          requiresConfirm: true,
        },
      });
    return r.fulfill({
      json: { ok: true, message: "Komut DatHost’a iletildi." },
    });
  });
  return { writes, snapshot };
}
test("production API failure shows empty scores until an explicit personal rehearsal", async ({
  page,
}) => {
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 503, json: { error: "offline" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Yeniden dene" })).toBeVisible();
  await expect(page.locator(".featured-score")).toHaveCount(0);
  await expect(page.locator(".match-list-row.live")).toHaveCount(0);
  await expect(page.locator(".expanded-scoreboard")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kişisel denemeye geç" })).toHaveCount(0);
  await openAdminDemo(page);
  await expect(
    page.getByRole("heading", { name: "Turnuvayı dene." }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = "turnuva";
  });
  await expect(page.locator(".demo-tag")).toContainText("DENEME");
});
test("admin match settings retain notes and location without date controls", async ({ page }) => {
  const { writes } = await fixture(page);
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Maç yönetimi" }).click();
  await expect(page.locator('input[type="datetime-local"], input[type="date"], input[type="time"]')).toHaveCount(0);
  await expect(page.getByLabel("Planlama şekli")).toHaveCount(0);
  await page.getByLabel("Yer / sunucu etiketi").fill("İstanbul");
  await page.getByLabel("Oyunculara maç notu").fill("Kaptanlar hazır olduğunda haber versin.");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  expect(writes.at(-1).config.schedule.U1).toMatchObject({ mode: "unset", startsAt: "", location: "İstanbul" });
  expect(writes.at(-1).config.schedule.U1).not.toHaveProperty("durationMinutes");
});
test("admin reviews server action before sending it and sees real connection diagnostics", async ({
  page,
}) => {
  const { writes } = await fixture(page);
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Maç yönetimi" }).click();
  await page.getByRole("tab", { name: "Sunucu", exact: true }).click();
  await page
    .getByRole("button", { name: "Maçı sunucuya yükle", exact: true })
    .click();
  await expect(page.locator(".match-operations .change-confirm")).toContainText(
    "Seçili maç",
  );
  expect(writes.at(-1)).not.toHaveProperty("confirm");
  await page
    .getByRole("button", { name: "Onayla ve uygula", exact: true })
    .click();
  await expect(page.locator(".match-operations [role=status]")).toContainText(
    "DatHost",
  );
  expect(writes.at(-1)).toMatchObject({
    action: "server",
    command: "load",
    matchId: "U1",
    confirm: true,
  });
  await page.getByRole("button", { name: "Sistem & Yedek" }).click();
  await expect(
    page.getByRole("heading", { name: "Kurulum durumu" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "DatHost bağlantısını test et" })
    .click();
  await expect(page.locator(".operations-panel [role=status]")).toContainText(
    "erişimi doğrulandı",
  );
  expect(writes.at(-1).action).toBe("test-server");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("backup import validates first and requires explicit stopped-server acknowledgment", async ({
  page,
}) => {
  const { writes } = await fixture(page);
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Sistem & Yedek" }).click();
  await page
    .getByLabel("Geri yüklemek için JSON yedeği seç")
    .setInputFiles({
      name: "test-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "among-us-backup", version: 1 }),
      ),
    });
  await expect(
    page.getByRole("heading", { name: "Doğrulanan yedek" }),
  ).toBeVisible();
  expect(writes.at(-1).action).toBe("validate-backup");
  await page.getByRole("button", { name: "Geri yüklemeyi hazırla" }).click();
  const apply = page.getByRole("button", {
    name: "Yedeği geri yükle",
    exact: true,
  });
  await expect(apply).toBeDisabled();
  await page
    .getByLabel(
      "Sunucudaki mevcut maçı durdurdum ve kayıtların değişmesini onaylıyorum.",
    )
    .check();
  await apply.click();
  await expect(page.locator(".operations-panel [role=status]")).toContainText(
    "geri yüklendi",
  );
  expect(writes.at(-1)).toMatchObject({
    action: "restore-backup",
    confirm: true,
    serverStoppedConfirmed: true,
  });
});
test("results show truthful empty coverage, public schedule details, join address and a copyable share link", async ({
  page,
}) => {
  const { snapshot } = await fixture(page);
  snapshot.config.schedule.U1 = {
    ...snapshot.config.schedule.U1,
    mode: "scheduled",
    startsAt: "2026-11-15T11:30:00.000Z",
    durationMinutes: 45,
    location: "İstanbul",
    notes: "Erken bağlan.",
  };
  await page.goto("/#sonuclar");
  await expect(
    page.getByRole("heading", { name: "Sahnenin izleri." }),
  ).toBeVisible();
  await expect(page.locator(".results-page")).toContainText("0/0 oynanmış maç");
  await expect(page.locator(".results-podium")).toContainText(
    "Henüz belli değil",
  );
  await page.getByRole("button", { name: "Sonuçları paylaş" }).click();
  await expect(page.locator(".invite-copy [role=status]")).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Sunucuya katıl" }).first(),
  ).toHaveAttribute("href", "steam://connect/127.0.0.1:27015");
  await page
    .getByRole("button", { name: /Maç merkezi/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).not.toContainText("14:30");
  await expect(dialog).not.toContainText("45 dakika");
  await expect(dialog.locator(".schedule-details")).toContainText(
    "Erken bağlan.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
