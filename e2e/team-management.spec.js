import { test, expect } from "@playwright/test";
import { defaultArena, rosterSignature } from "../src/arena/model.ts";

// Controlled API sessions exercise the UI; authorization is covered with real
// SQLite sessions in management.test.ts. This does not call or simulate Steam login.
async function managedSession(page, role, captain = true) {
  const config = defaultArena();
  let id = 76561198000000001n;
  for (const team of config.teams)
    for (const player of team.roster) player.steamId = String(id++);
  const snapshot = {
    revision: 1,
    config,
    state: config.state,
    readies: [],
    vetos: [],
    verified: [],
    steamConfigured: true,
    me:
      role === "admin"
        ? { role }
        : { role, steamId: config.teams[0].roster[captain ? 0 : 1].steamId },
  };
  const requests = [];
  await page.route("**/api/arena", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: snapshot });
    const data = route.request().postDataJSON();
    requests.push(data);
    if (data.action === "team-profile") {
      expect(data.revision).toBe(snapshot.revision);
      expect(data.teamId).toBe("nova");
      Object.assign(config.teams[0], {
        name: data.name,
        tag: data.tag,
        logo: data.logo,
      });
      snapshot.revision++;
    } else if (data.action === "force-veto") {
      expect(data.confirm).toBe(true);
      snapshot.vetos = [
        {
          matchId: "U1",
          a: "nova",
          b: "orbit",
          format: "BO1",
          revision: 0,
          actions: [],
          rehearsal: false,
          forced: true,
          rosterKey: rosterSignature(config),
        },
      ];
    } else throw new Error("Unexpected action: " + data.action);
    await route.fulfill({ json: { ok: true } });
  });
  return { snapshot, requests };
}

test("captain saves own name and logo, sees them across pages, then saves again", async ({
  page,
}) => {
  const { requests } = await managedSession(page, "player");
  await page.goto("/#oyuncu");
  const form = page.locator(".captain-profile");
  await expect(form).toBeVisible();
  await form.getByLabel("Takım adı", { exact: true }).fill("AMONG LEGENDS");
  await form.getByLabel("Kısa ad", { exact: true }).fill("AMG");
  await form
    .getByLabel("Takım logosu", { exact: true })
    .setInputFiles("public/maps/nuke.png");
  await expect(form.locator(".logo-preview img")).toBeVisible();
  await form.getByRole("button", { name: "Takım bilgilerini kaydet" }).click();
  await expect(form.getByRole("status")).toContainText("kaydedildi");
  await form.getByLabel("Takım adı", { exact: true }).fill("AMONG LEGENDS II");
  await form.getByRole("button", { name: "Takım bilgilerini kaydet" }).click();
  await expect(page.locator(".player-team-card")).toContainText(
    "AMONG LEGENDS II",
  );
  expect(requests).toHaveLength(2);
  expect(requests[1]).not.toHaveProperty("roster");
  await page.goto("/#takimlar");
  await expect(page.locator(".team-card").first()).toContainText(
    "AMONG LEGENDS II",
  );
  await expect(
    page.locator(".team-card .team-custom-logo").first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("regular players have no team branding form", async ({ page }) => {
  await managedSession(page, "player", false);
  await page.goto("/#oyuncu");
  await expect(page.locator(".player-team-card")).toContainText("OYUNCU");
  await expect(page.locator(".captain-profile")).toHaveCount(0);
});

test("admin confirms real veto bypass and lobby clearly labels the intervention", async ({
  page,
}) => {
  const { requests, snapshot } = await managedSession(page, "admin");
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Maç yönetimi" }).click();
  await page.getByRole("tab", { name: "Veto", exact: true }).click();
  await page
    .getByRole("button", { name: "Gerçek vetoyu zorla başlat" })
    .click();
  await expect(page.locator(".change-confirm")).toContainText(
    "Hazır kontrolü atlanarak gerçek veto",
  );
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Onayla ve uygula" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  expect(requests).toHaveLength(1);
  expect(snapshot.readies).toHaveLength(0);
  await page.getByRole("link", { name: "Tam sayfa veto" }).click();
  await expect(page.locator(".veto-title")).toContainText(
    "HAZIR KONTROLÜ ADMİN TARAFINDAN GEÇİLDİ",
  );
  await expect(page.locator(".veto-map")).toHaveCount(7);
  await expect(page.locator(".site-header")).toHaveCount(0);
});
