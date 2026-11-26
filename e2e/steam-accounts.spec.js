import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";

test("admin can search Steam registrations, refresh a nickname and choose the match name source", async ({ page }) => {
  const steamId = "76561198000000001";
  const pendingId = "76561198000000002";
  const config = defaultArena();
  const team = config.teams[0];
  team.tag = "123";
  team.roster[0] = { ...team.roster[0], steamId, name: "abcd", useSteamName: true };
  team.roster[1].steamId = pendingId;
  const account = {
    steam_id: steamId, verified_at: Date.now(), game_name: "123 | eski",
    profile: { name: "abcd", avatar: null },
  };
  let revision = 1;
  const writes = [];
  await page.route("**/api/matches", (route) => route.fulfill({ json: { configured: true, matches: [] } }));
  await page.route("**/api/arena?view=steam-accounts", (route) => route.fulfill({ json: { accounts: [account] } }));
  await page.route("**/api/arena", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: {
      revision, config, state: config.state, me: { role: "admin" },
      steamConfigured: true, readies: [], vetos: [], verified: [account], runtimes: {},
    } });
    const body = route.request().postDataJSON();
    writes.push(body);
    if (body.action === "refresh-steam-account") {
      account.profile = { name: "efgh", avatar: null };
      return route.fulfill({ json: { refreshed: true, profile: account.profile } });
    }
    if (body.action === "set-steam-display-name") {
      account.displayName = body.displayName || undefined;
      return route.fulfill({ json: { displayName: body.displayName } });
    }
    Object.assign(config, body.config);
    revision++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Steam kayıtları", exact: true }).click();
  const table = page.getByRole("table", { name: "Steam hesapları" });
  await expect(table.getByText("Doğrulama bekliyor")).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Steam kayıtlarında ara" });
  await search.fill(steamId);
  await expect(table.getByText(pendingId)).toHaveCount(0);
  await expect(table.getByText("123 | abcd", { exact: true })).toBeVisible();
  await expect(table.getByText("123 | eski", { exact: true })).toBeVisible();
  await table.getByRole("button", { name: "Site adını düzenle" }).click();
  await table.getByRole("textbox", { name: "Sitede görünen ad" }).fill("Sitedeki adım");
  await table.getByRole("button", { name: "Adı kaydet", exact: true }).click();
  await expect(table.getByText("Sitedeki adım", { exact: true })).toBeVisible();
  await expect(table.getByText("123 | abcd", { exact: true })).toBeVisible();
  await table.getByRole("button", { name: "Profil adını yenile" }).click();
  await expect(table.getByText("123 | efgh", { exact: true })).toBeVisible();
  await expect(table.getByText("abcd", { exact: true })).toBeVisible();
  await expect(table.getByText("Sitedeki adım", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await table.getByRole("button", { name: team.name, exact: true }).click();
  await page.getByRole("checkbox", { name: "1. oyuncu oyun içinde Steam adını kullan", exact: true }).uncheck();
  await page.getByRole("button", { name: "Değişiklikleri kaydet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Değişiklikleri kaydet", exact: true })).toBeDisabled();
  expect(writes[0]).toEqual({ action: "set-steam-display-name", steamId, displayName: "Sitedeki adım" });
  expect(writes[1]).toEqual({ action: "refresh-steam-account", steamId });
  expect(writes[2].config.teams[0].roster[0].useSteamName).toBeUndefined();
});

test("admin searches, adds, replaces, moves and removes roster players without typing a SteamID", async ({ page }) => {
  const config = defaultArena();
  const [target, source] = config.teams;
  target.roster = target.roster.slice(0, 1);
  source.roster = source.roster.slice(0, 2);
  const assignedId = "76561198000000001";
  const freeId = "76561198000000002";
  const incomingId = "76561198000000003";
  const removed = target.roster[0];
  const incoming = source.roster[0];
  removed.steamId = assignedId;
  incoming.steamId = incomingId;
  incoming.name = "Taşınan kadro adı";
  incoming.useSteamName = true;
  const accounts = [
    { steam_id: assignedId, profile: { name: "Kadroda olan", avatar: null } },
    { steam_id: freeId, displayName: "Serbest takma ad", profile: { name: "Serbest Steam", avatar: null } },
    { steam_id: incomingId, profile: { name: "Taşınan Steam", avatar: null } },
  ].map((account) => ({ ...account, verified_at: Date.now(), game_name: null }));
  const writes = [];
  let revision = 1;
  await page.route("**/api/matches", (route) => route.fulfill({ json: { configured: true, matches: [] } }));
  await page.route("**/api/arena?view=steam-accounts", (route) => route.fulfill({ json: { accounts } }));
  await page.route("**/api/arena", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: {
      revision, config, state: config.state, me: { role: "admin" },
      steamConfigured: true, readies: [], vetos: [], verified: accounts, runtimes: {},
    } });
    const body = route.request().postDataJSON();
    writes.push(body);
    Object.assign(config, body.config);
    revision++;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/#admin");
  const add = page.getByRole("button", { name: "Oyuncu ekle", exact: true });
  const chooser = page.getByRole("dialog");
  const search = chooser.getByRole("searchbox", { name: "Kayıtlı oyuncularda ara" });
  const rowName = (number) => page.getByRole("textbox", { name: `${number}. oyuncu görünen isim`, exact: true });
  await add.click();
  await expect(search).toBeFocused();
  await expect(chooser.getByText("Bu kadroda")).toBeVisible();
  await search.fill("Serbest Steam");
  await chooser.getByRole("button", { name: "Serbest takma ad · Kadroya ekle" }).click();
  await expect(rowName(2)).toHaveValue("Serbest takma ad");
  await page.getByRole("button", { name: `${removed.name} · Oyuncuyu değiştir` }).click();
  await search.fill(source.name);
  await chooser.getByRole("button", { name: `Taşınan Steam · ${source.name} takımından taşı` }).click();
  await expect(rowName(1)).toHaveValue(incoming.name);
  await expect(page.getByLabel("Kaptan", { exact: true })).toHaveValue(incoming.id);
  await page.getByRole("button", { name: "2. oyuncuyu kaldır", exact: true }).click();
  await expect(rowName(2)).toHaveCount(0);
  await add.click();
  await search.fill("Serbest takma ad");
  await expect(chooser.getByRole("button", { name: "Serbest takma ad · Kadroya ekle" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chooser).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Değişiklikleri kaydet", exact: true }).click();
  await expect(page.getByText("Kaydedildi. Tüm ekranlar güncellendi.")).toBeVisible();

  expect(writes).toHaveLength(1);
  const [savedTarget, savedSource] = writes[0].config.teams;
  expect(savedTarget.roster).toEqual([incoming]);
  expect(savedTarget.players).toEqual([incoming.name]);
  expect(savedTarget.captainId).toBe(incoming.id);
  expect(savedSource.roster).toEqual([source.roster[1]]);
  expect(savedSource.captainId).toBe(source.roster[1].id);
  await page.reload();
  await expect(rowName(1)).toHaveValue(incoming.name);
  await add.click();
  await chooser.getByRole("button", { name: "SteamID64’ü elle gir", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "2. oyuncu SteamID64", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
