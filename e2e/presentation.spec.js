import { test, expect } from "@playwright/test";
import { defaultArena, validateArena } from "../src/arena/model.ts";

async function siteAdmin(page, customize = () => {}) {
  const config = validateArena(defaultArena());
  config.title = "OKUL TURNUVASI";
  customize(config);
  const snapshot = {
    revision: 1, config, state: config.state, readies: [], vetos: [], verified: [],
    verifiedPlayerIds: [], me: { role: "admin" }, steamConfigured: true, runtimes: {},
  };
  const writes = [];
  const serverCommands = [];
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
  await page.route("**/api/operations", (route) => {
    if (route.request().method() !== "GET") {
      serverCommands.push(route.request().postDataJSON());
      return route.fulfill({ status: 403, json: { error: "Sunucu komutu beklenmiyor." } });
    }
    return route.fulfill({ json: {
      health: { dathostConfigured: false, lastDathostAttempt: null, lastWebhook: null },
      audit: [], jobs: [], backups: [],
    } });
  });
  await page.goto("/#admin");
  await expect(page.getByRole("heading", { name: "Kontrol sende." })).toBeVisible();
  await page.getByRole("button", { name: "Turnuva & API", exact: true }).click();
  return { snapshot, writes, serverCommands };
}

test("admin saves minimal mode and exactly one active match without changing results or launching a game", async ({ page }) => {
  const { snapshot, writes, serverCommands } = await siteAdmin(page);
  const originalState = structuredClone(snapshot.state);
  const originalSchedule = structuredClone(snapshot.config.schedule);
  const active = page.getByRole("combobox", { name: "Ana sayfadaki aktif maç", exact: true });
  const minimal = page.getByLabel("Minimal görünüm", { exact: true });
  const save = page.getByRole("button", { name: "Değişiklikleri kaydet", exact: true });
  await expect(minimal).not.toBeChecked();
  await expect(active).toHaveValue("");
  await minimal.check();
  await active.selectOption("U2");
  await save.click();
  await expect(page.locator(".admin-save-bar")).toContainText("Kayıt güncel");
  expect(writes.at(-1).config.presentation).toEqual({ minimal: true, activeMatchId: "U2" });

  await active.selectOption("U3");
  await save.click();
  await expect(page.locator(".admin-save-bar")).toContainText("Kayıt güncel");
  expect(snapshot.config.presentation).toEqual({ minimal: true, activeMatchId: "U3" });
  expect(snapshot.state).toEqual(originalState);
  expect(snapshot.config.schedule).toEqual(originalSchedule);
  expect(serverCommands).toHaveLength(0);
  expect(writes).toHaveLength(2);
  await page.goto("/#turnuva");
  await expect(page.getByLabel("Aktif maç", { exact: true }).locator(".featured-top")).toContainText("U3");
  await expect(page.locator(".featured-card")).toHaveCount(1);
  await expect(page.locator("#winner-bracket")).toBeVisible();
  await expect(page.locator("#loser-bracket")).toBeVisible();
  await expect(page.locator(".hero, .schedule-card, .live-connection, .tournament-strip")).toHaveCount(0);
  await page.goto("/#admin");
  await page.reload();
  await page.getByRole("button", { name: "Turnuva & API", exact: true }).click();
  await expect(minimal).toBeChecked();
  await expect(active).toHaveValue("U3");
});

test("a completed selected match disappears and leaves the minimal brackets visible", async ({ page }) => {
  const { snapshot } = await siteAdmin(page, config => {
    config.presentation = { minimal: true, activeMatchId: "U1" };
  });
  await page.goto("/#turnuva");
  await expect(page.getByLabel("Aktif maç", { exact: true })).toBeVisible();
  snapshot.config.state.results.U1 = { status: "completed", score: [13, 7] };
  snapshot.state = snapshot.config.state;
  await page.reload();
  await expect(page.locator(".brand")).toContainText("OKUL TURNUVASI");
  await expect(page.getByLabel("Aktif maç", { exact: true })).toHaveCount(0);
  await expect(page.locator("#winner-bracket")).toBeVisible();
  await expect(page.locator("#loser-bracket")).toBeVisible();
});

test("admin can persist no active match and minimal home shows both brackets directly", async ({ page }) => {
  const { snapshot, serverCommands } = await siteAdmin(page, (config) => {
    config.presentation = { minimal: true, activeMatchId: "U1" };
  });
  await page.getByRole("combobox", { name: "Ana sayfadaki aktif maç", exact: true }).selectOption("");
  const save = page.getByRole("button", { name: "Değişiklikleri kaydet", exact: true });
  await save.click();
  await expect(page.locator(".admin-save-bar")).toContainText("Kayıt güncel");
  expect(snapshot.config.presentation).toEqual({ minimal: true, activeMatchId: null });
  expect(serverCommands).toHaveLength(0);
  await page.goto("/");
  await expect(page.locator(".brand")).toContainText("OKUL TURNUVASI");
  await expect(page.locator("#winner-bracket")).toBeVisible();
  await expect(page.locator("#loser-bracket")).toBeVisible();
  for (const selector of [".hero", ".schedule-card", ".live-connection", ".tournament-strip", ".featured-card"]) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
  await page.reload();
  await expect(page.locator("#winner-bracket")).toBeVisible();
  await expect(page.locator("#loser-bracket")).toBeVisible();
  await expect(page.locator(".featured-card")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("admin can choose only paired unfinished matches and clear a stale completed selection", async ({ page }) => {
  const { snapshot } = await siteAdmin(page, (config) => {
    config.state.results.U1 = { status: "completed", score: [13, 7] };
    config.presentation = { minimal: true, activeMatchId: "U1" };
  });
  const active = page.getByRole("combobox", { name: "Ana sayfadaki aktif maç", exact: true });
  await expect(active.locator('option[value="U1"]')).toHaveJSProperty("disabled", true);
  await expect(active.locator('option[value="U5"]')).toHaveCount(0);
  expect(await active.locator("option:not([disabled])").evaluateAll((options) => options.map((option) => option.value))).toEqual(["", "U2", "U3", "U4"]);
  await active.selectOption("");
  const save = page.getByRole("button", { name: "Değişiklikleri kaydet", exact: true });
  await save.click();
  await expect(page.locator(".admin-save-bar")).toContainText("Kayıt güncel");
  expect(snapshot.config.presentation?.activeMatchId).toBeNull();
  expect(snapshot.state.results.U1).toEqual({ status: "completed", score: [13, 7] });
});
