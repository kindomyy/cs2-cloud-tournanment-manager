import { test, expect } from "@playwright/test";
import { defaultArena, rosterSignature } from "../src/arena/model.ts";

// Controlled API responses test visible controls. Real session authorization
// and snapshot redaction are covered separately by server tests.
async function roleSession(page, role, { activeVeto = false, teamIndex = 0 } = {}) {
  const config = defaultArena();
  config.title = "YETKİ TESTİ";
  config.server = { address: "", dathostServerId: "" };
  let steamId = 76561198000000001n;
  for (const team of config.teams)
    for (const player of team.roster) player.steamId = String(steamId++);
  const team = config.teams[teamIndex];
  const player = team.roster[role === "captain" ? 0 : 1];
  const me = role === "visitor" ? null : role === "admin" ? { role: "admin" }
    : { role: "player", steamId: role === "unrostered" ? "76561198999999999" : player.steamId };
  if (role === "admin" || ["player", "captain"].includes(role))
    config.server.address = "127.0.0.1:27015";
  const verifiedPlayerIds = config.teams.flatMap((t) => t.roster.map((p) => p.id));
  const snapshot = {
    revision: 1, config, state: config.state, me,
    steamConfigured: true, readies: [], verified: [], verifiedPlayerIds,
    runtimes: {},
    vetos: activeVeto ? [{
      matchId: "U1", a: "nova", b: "orbit", format: "BO1", revision: 0,
      actions: [], rehearsal: false, rosterKey: rosterSignature(config),
    }] : [],
  };
  if (role !== "admin") for (const t of config.teams)
    for (const p of t.roster) if (p.steamId !== me?.steamId) p.steamId = null;
  const requests = [];
  await page.route("**/api/matches", (route) => route.fulfill({ json: { configured: true, matches: [] } }));
  await page.route("**/api/arena", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: snapshot });
    const data = route.request().postDataJSON();
    requests.push(data);
    if (data.action === "ready") {
      expect(me?.role).toBe("player");
      expect(data).not.toHaveProperty("playerId");
      expect(data.matchId).toBe("U1");
      snapshot.readies = data.ready ? [{ match_id: "U1", player_id: player.id }] : [];
    } else if (data.action === "team-profile") {
      expect(role).toBe("captain");
      expect(data.teamId).toBe(team.id);
      Object.assign(team, { name: data.name, tag: data.tag, logo: data.logo });
      snapshot.revision++;
    } else throw new Error("Unexpected privileged action: " + data.action);
    return route.fulfill({ json: { ok: true } });
  });
  return { snapshot, requests, team, player };
}

async function openMenu(page) {
  const toggle = page.getByRole("button", { name: "Menüyü aç", exact: true });
  if (await toggle.isVisible()) await toggle.click();
}

test("visitor keeps public results during a veto and has no private navigation", async ({ page }) => {
  await roleSession(page, "visitor", { activeVeto: true });
  await page.goto("/#sonuclar");
  await expect(page.locator(".brand")).toContainText("YETKİ TESTİ");
  await expect(page).toHaveURL(/#sonuclar$/);
  await openMenu(page);
  await expect(page.locator(".main-nav").getByRole("link", { name: "Sonuçlar", exact: true })).toBeVisible();
  await expect(page.locator(".main-nav").getByRole("link", { name: "Özel 1v1", exact: true })).toHaveCount(0);
  await expect(page.locator(".header-admin-link")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sunucuya katıl", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hazırım", exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("7656119");
});

for (const role of ["visitor", "unrostered", "player", "captain"]) {
  test(`${role} cannot open admin editing tools directly`, async ({ page }) => {
    const { requests } = await roleSession(page, role);
    await page.goto("/#admin");
    await expect(page.getByLabel("Yönetici parolası")).toBeVisible();
    await expect(page.getByRole("button", { name: "Değişiklikleri kaydet", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Maç yönetimi", exact: true })).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });
}

test("unrostered Steam account waits for membership without readiness or captain controls", async ({ page }) => {
  await roleSession(page, "unrostered");
  await page.goto("/#oyuncu");
  await expect(page.getByRole("heading", { name: "Kadroya eklenmen bekleniyor." })).toBeVisible();
  await expect(page.locator(".captain-profile")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Hazırım/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sunucuya katıl", exact: true })).toHaveCount(0);
});

test("registered player changes only their own ready status and has no captain form", async ({ page }) => {
  const { requests, player } = await roleSession(page, "player");
  await page.goto("/#oyuncu");
  await expect(page.locator(".player-team-card")).toContainText(player.name);
  await expect(page.locator(".captain-profile")).toHaveCount(0);
  const firstMatch = page.locator(".player-match").filter({ hasText: "U1 / BO1" });
  await firstMatch.getByRole("button", { name: "Hazırım", exact: true }).click();
  await expect(firstMatch.getByRole("button", { name: "Hazırım · Geri al", exact: true })).toBeVisible();
  expect(requests).toEqual([{ action: "ready", matchId: "U1", ready: true }]);
});

test("captain edits own branding without roster, seeding or score controls", async ({ page }) => {
  const { requests, team } = await roleSession(page, "captain");
  await page.goto("/#oyuncu");
  const form = page.locator(".captain-profile");
  await expect(form).toBeVisible();
  await form.getByLabel("Takım adı", { exact: true }).fill("KAPTAN TAKIMI");
  await form.getByRole("button", { name: "Takım bilgilerini kaydet", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("kaydedildi");
  expect(requests).toHaveLength(1);
  expect(requests[0].teamId).toBe(team.id);
  expect(requests[0]).not.toHaveProperty("roster");
  await expect(page.getByLabel("Seri başı", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skoru kaydet", exact: true })).toHaveCount(0);
});

test("captain from another team watches veto without map controls", async ({ page }) => {
  const { requests } = await roleSession(page, "captain", { activeVeto: true, teamIndex: 2 });
  await page.goto("/#veto/U1");
  await expect(page.locator(".veto-map")).toHaveCount(7);
  for (const map of await page.locator(".veto-map").all()) await expect(map).toBeDisabled();
  expect(requests).toHaveLength(0);
});

test("admin has management tools but cannot impersonate player readiness", async ({ page }) => {
  await roleSession(page, "admin");
  await page.goto("/#admin");
  await expect(page.getByRole("heading", { name: "Kontrol sende." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Takımlar & Oyuncular", exact: true })).toBeVisible();
  await page.goto("/#oyuncu");
  await expect(page.getByRole("button", { name: /^Hazırım/ })).toHaveCount(0);
  await expect(page.locator(".captain-profile")).toHaveCount(0);
});

test("frozen participant keeps match access after replacement without current captain controls", async ({ page }) => {
  const { snapshot, team, player, requests } = await roleSession(page, "captain");
  const frozenTeams = structuredClone([team, snapshot.config.teams.find((t) => t.id === "orbit")]);
  snapshot.runtimes.U1 = {
    matchId: "U1", externalId: snapshot.config.schedule.U1.externalId,
    phase: "preparing", teams: frozenTeams, verifiedPlayerIds: [player.id],
  };
  team.roster[0].steamId = null;
  team.captainId = team.roster[1].id;
  snapshot.verifiedPlayerIds = snapshot.verifiedPlayerIds.filter((id) => id !== player.id);
  await page.goto("/#oyuncu");
  await expect(page.getByRole("heading", { name: "Bu maçın kadrosunda yerin korunuyor." })).toBeVisible();
  await expect(page.locator(".captain-profile")).toHaveCount(0);
  const match = page.locator(".player-match").filter({ hasText: "U1 / BO1" });
  await match.getByRole("button", { name: "Hazırım", exact: true }).click();
  expect(requests).toEqual([{ action: "ready", matchId: "U1", ready: true }]);
  await page.goto("/#veto/U1");
  await expect(page.getByRole("link", { name: "Sunucuya katıl", exact: true })).toBeVisible();
  const lineupPlayer = page.locator(".lobby-player").filter({ hasText: player.name });
  await expect(lineupPlayer).toContainText("Hazır");
});

test("replacement does not inherit readiness from the frozen player with the same record ID", async ({ page }) => {
  const { snapshot, team, player } = await roleSession(page, "player");
  const frozenTeams = structuredClone([team, snapshot.config.teams.find((t) => t.id === "orbit")]);
  frozenTeams[0].roster.find((p) => p.id === player.id).steamId = null;
  snapshot.runtimes.U1 = {
    matchId: "U1", externalId: snapshot.config.schedule.U1.externalId,
    phase: "preparing", teams: frozenTeams, verifiedPlayerIds: [player.id],
  };
  snapshot.readies = [{ match_id: "U1", player_id: player.id }];
  snapshot.verifiedPlayerIds = snapshot.verifiedPlayerIds.filter((id) => id !== player.id);
  await page.goto("/#oyuncu");
  await expect(page.locator(".player-team-card")).toContainText(player.name);
  await expect(page.locator(".player-match").filter({ hasText: "U1 / BO1" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Hazırım/ })).toHaveCount(0);
});

test("visitor cannot select demo state by opening the rehearsal URL", async ({ page }) => {
  await roleSession(page, "visitor");
  await page.goto("/#dene");
  await expect(page.getByRole("heading", { name: "Prova alanı yöneticiye özel." })).toBeVisible();
  await expect(page.locator(".demo-tag")).toHaveText("MATCHZY / API");
});

test("logging out removes local rehearsal state from the public tournament", async ({ page }) => {
  const { snapshot } = await roleSession(page, "admin");
  await page.route("**/api/auth/logout", (route) => {
    snapshot.me = null;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/#dene");
  await expect(page.getByRole("heading", { name: "Turnuvayı dene." })).toBeVisible();
  await expect(page.locator(".demo-tag")).toHaveText("DENEME SÜRÜMÜ");
  await page.goto("/#oyuncu");
  await page.getByRole("button", { name: "Admin oturumunu kapat", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Steam hesabınla giriş yap." })).toBeVisible();
  await expect(page.locator(".demo-tag")).toHaveText("MATCHZY / API");
});
