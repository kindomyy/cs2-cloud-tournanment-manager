import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";
import { moveVeto } from "../src/arena/veto.ts";
import { readFile } from "node:fs/promises";
const id = "duel-12345678-1234-4234-8234-123456789abc";
const players = [
  { name: "Alpha", steamId: "76561198000000111" },
  { name: "Bravo", steamId: "76561198000000222" },
];
async function fixture(page, role = "admin", initial = null) {
  let room = initial,
    me =
      role === "admin"
        ? { role: "admin" }
        : role === "player"
          ? { role: "player", steamId: players[0].steamId }
          : null;
  const posts = [];
  const config = defaultArena();
  await page.route("**/api/arena", (route) => route.fulfill({ json: { revision: 1, config, state: config.state, me, readies: [], vetos: [], verified: [], runtimes: {}, steamConfigured: true } }));
  await page.route("**/api/duels*", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { me, steamConfigured: true, rooms: room ? [room] : [] },
      });
    const data = route.request().postDataJSON();
    posts.push(data);
    if (data.action === "create")
      room = {
        id,
        externalId: "123456",
        players: data.players,
        revision: 0,
        ready: {},
        veto: null,
        closed: false,
        createdAt: Date.now(),
        live: null,
      };
    else if (data.action === "force-veto" || data.action === "ready") {
      if (data.action === "ready")
        room.ready[me.steamId] = data.ready ? Date.now() + 1800000 : 0;
      if (
        data.action === "force-veto" ||
        players.every((p) => room.ready[p.steamId] > Date.now())
      )
        room.veto = {
          matchId: id,
          a: "duel-a",
          b: "duel-b",
          format: "BO1",
          revision: 0,
          actions: [],
          rehearsal: false,
          forced: data.action === "force-veto",
          rosterKey: "test",
        };
      room.revision++;
    } else if (data.action === "move") {
      room.veto = moveVeto(room.veto, data.map, "admin");
      room.revision++;
    } else throw new Error("Unexpected action: " + data.action);
    await route.fulfill({ json: { ok: true, id } });
  });
  return {
    posts,
    player: (index) => {
      me = { role: "player", steamId: players[index].steamId };
    },
  };
}
function pendingRoom() {
  return {
    id,
    externalId: "123456",
    players,
    revision: 0,
    ready: {},
    veto: null,
    closed: false,
    createdAt: Date.now(),
    live: null,
  };
}
test("admin opens bot training without a second SteamID or creating a real match", async ({
  page,
}) => {
  const { posts } = await fixture(page);
  await page.goto("/#1v1");
  await page.getByRole("button", { name: "Botla dene", exact: true }).click();
  const panel = page.locator(".bot-training-panel");
  await expect(panel).toContainText(
    "İkinci Steam hesabı ve maç JSON’u gerekmez",
  );
  await expect(
    page.getByRole("button", { name: "1v1 odası oluştur" }),
  ).toHaveCount(0);
  await panel.getByLabel("Benim tarafım").selectOption("t");
  await panel.getByLabel("Bot zorluğu").selectOption("3");
  const config = panel.getByRole("textbox", {
    name: "Bot antrenmanı konsol komutları",
  });
  await expect(config).toHaveValue(/bot_add_ct/);
  await expect(config).toHaveValue(/bot_difficulty 3/);
  const downloaded = page.waitForEvent("download");
  await panel.getByRole("button", { name: "CFG indir" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("among-us-bot.cfg");
  const content = await readFile(await file.path(), "utf8");
  expect(content).toContain("bot_freeze 0");
  expect(content).toContain("bot_add_ct");
  expect(posts).toHaveLength(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel.getByRole("button", { name: "Bot antrenmanını kapat" }).click();
  await expect(
    page.getByRole("button", { name: "1v1 odası oluştur" }),
  ).toBeVisible();
});
test("player sees no admin bot controls and real room explains URL loading without file uploads", async ({
  page,
}) => {
  let veto = {
    matchId: id,
    a: "duel-a",
    b: "duel-b",
    format: "BO1",
    revision: 0,
    actions: [],
    rehearsal: false,
    rosterKey: "test",
  };
  for (const map of ["Mirage", "Inferno", "Nuke", "Dust2", "Ancient", "Anubis"])
    veto = moveVeto(veto, map, "admin");
  await fixture(page, "admin", { ...pendingRoom(), veto });
  await page.goto("/#1v1/" + id);
  await expect(page.locator(".server-connect-card")).toContainText(
    "Her maç için JSON dosyası yüklemen gerekmez",
  );
  await page.getByRole("button", { name: "Maç komutunu kopyala" }).click();
  await expect(
    page.locator(".server-connect-card").getByRole("status"),
  ).toContainText("Kopyalandı");
  await page.unroute("**/api/duels*");
  await fixture(page, "player", pendingRoom());
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Hazırım", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Botla dene", exact: true }),
  ).toHaveCount(0);
});

test("private 1v1 requires a real session, with no offline pretend verification", async ({
  page,
}) => {
  await fixture(page, null);
  await page.goto("/#1v1");
  await expect(page.getByRole("heading", { name: "Özel 1v1." })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Odan için giriş yap." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "1v1 odası oluştur" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Steam ile giriş", exact: true }).last(),
  ).toHaveAttribute("href", "/api/auth/steam/start?returnTo=%2F%231v1");
});
test("admin creates a separate 1v1 room, confirms readiness bypass and completes map veto", async ({
  page,
}) => {
  const { posts } = await fixture(page);
  await page.goto("/#1v1");
  await expect(page.locator(".startup-screen")).toHaveCount(0);
  for (let i = 0; i < 2; i++) {
    const form = page.locator(".duel-player-fields fieldset").nth(i);
    await form.getByLabel("Görünen isim").fill(players[i].name);
    await form.getByLabel("SteamID64").fill(players[i].steamId);
  }
  await page.getByRole("button", { name: "1v1 odası oluştur" }).click();
  await expect(page).toHaveURL(new RegExp("#1v1/" + id));
  await page
    .getByRole("button", { name: "Hazır kontrolünü geç, vetoyu başlat" })
    .click();
  await expect(page.locator(".change-confirm")).toContainText(
    "Steam ile doğrulanmış sayılmaz",
  );
  expect(posts).toHaveLength(1);
  await page.getByRole("button", { name: "Onayla ve uygula" }).click();
  await expect(page.locator(".duel-veto")).toContainText(
    "ADMİN HAZIR KONTROLÜNÜ GEÇTİ",
  );
  await expect(page.locator(".duel-scoreboard")).toHaveCount(0);
  await expect(page.locator('.main-nav a[href="#1v1"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  for (const map of [
    "Mirage",
    "Inferno",
    "Nuke",
    "Dust2",
    "Ancient",
    "Anubis",
  ]) {
    await page.getByRole("button", { name: map, exact: true }).click();
    await page
      .getByRole("button", { name: "Haritayı ele", exact: true })
      .click();
  }
  await expect(page.locator(".duel-finished")).toContainText(
    "Harita hazır: Vertigo",
  );
  await expect(page.locator(".duel-scoreboard")).toHaveAttribute(
    "style",
    /vertigo\.png/,
  );
  await expect(page.locator(".server-connect-card > code")).toContainText(
    `/api/duel-config?id=${id}`,
  );
  await expect(page.locator(".server-connect-card")).toContainText(
    "Takım başına 1 oyuncu gerekir",
  );
  await expect(page.locator(".tournament-strip")).toHaveCount(0);
  expect(posts.find((p) => p.action === "force-veto").confirm).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("two player readiness opens veto, and the second player waits for the first turn", async ({
  page,
}) => {
  const control = await fixture(page, "player", pendingRoom());
  await page.goto("/#1v1/" + id);
  await page.getByRole("button", { name: "Hazırım", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hazırım · Geri al" }),
  ).toBeVisible();
  await expect(page.locator(".duel-veto")).toHaveCount(0);
  control.player(1);
  await page.reload();
  await page.getByRole("button", { name: "Hazırım", exact: true }).click();
  await expect(page.locator(".duel-veto")).toContainText("Alpha eliyor.");
  await expect(
    page.getByRole("button", { name: "Mirage", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Hazır kontrolünü geç, vetoyu başlat" }),
  ).toHaveCount(0);
});
test("1v1 scoreboard shows only its two players, map photo and match statistics", async ({
  page,
}) => {
  const room = pendingRoom();
  room.live = {
    id,
    a: "duel-a",
    b: "duel-b",
    status: "live",
    score: [9, 7],
    map: "Nuke",
    maps: [{ name: "Nuke", score: [9, 7], status: "live" }],
    updatedAt: new Date().toISOString(),
    players: players.map((p, i) => ({
      steamId: p.steamId,
      name: p.name,
      teamId: i ? "duel-b" : "duel-a",
      kills: 9,
      deaths: 7,
      assists: 0,
      headshotKills: 4,
      damage: 950,
      roundsPlayed: 16,
    })),
  };
  await fixture(page, "player", room);
  await page.goto("/#1v1/" + id);
  await expect(page.locator(".duel-scoreboard")).toHaveAttribute(
    "style",
    /nuke\.png/,
  );
  await expect(page.locator(".duel-score-main strong")).toContainText("9 : 7");
  await expect(page.locator(".duel-stats tbody tr")).toHaveCount(2);
  await expect(page.locator(".duel-stats tbody tr").first()).toContainText(
    "44.4%",
  );
  await expect(page.locator(".duel-stats tbody tr").first()).toContainText(
    "950",
  );
  await expect(page.locator(".duel-stats tbody tr").first()).toContainText(
    "0.97",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
