import { openAdminDemo } from "./demo-session.js";
import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";

test.beforeEach(async ({ page }) => {
  const config = defaultArena();
  await page.route("**/api/arena", route => route.fulfill({ json: {
    revision: 1, config, state: config.state, readies: [], vetos: [], verified: [],
    me: null, steamConfigured: true, runtimes: {},
  } }));
});

function players(a, b) {
  return [a, b].flatMap((teamId, team) =>
    Array.from({ length: 5 }, (_, i) => ({
      steamId: String(76561198000000001n + BigInt(team * 5 + i)),
      name: `${teamId}-oyuncu-${i + 1}`,
      teamId,
      kills: i === 4 ? 0 : 20 - i * 2,
      deaths: 10 + i,
      assists: 3 + i,
      headshotKills: i === 4 ? 0 : 10 - i,
      damage: 1800 - i * 100,
      roundsPlayed: 20,
    })),
  );
}
function bo1(id = "U2", a = "parallax", b = "void", completed = false) {
  const score = completed ? [13, 7] : [9, 7];
  return {
    id,
    a,
    b,
    score,
    status: completed ? "completed" : "live",
    map: "Nuke",
    maps: [{ name: "Nuke", status: completed ? "completed" : "live", score }],
    players: players(a, b),
    updatedAt: new Date().toISOString(),
  };
}
async function feed(page, matches) {
  await page.route("**/api/matches", (route) =>
    route.fulfill({ json: { configured: true, matches } }),
  );
}

test("real API response populates K/D/A, weighted HS%, including zero kills", async ({
  page,
}) => {
  await feed(page, [bo1()]);
  await page.goto("/");
  const board = page.locator(".expanded-scoreboard");
  await board.scrollIntoViewIfNeeded();
  const first = board.locator(".player-stats tbody tr").first();
  await expect(first).toContainText("parallax-oyuncu-1");
  await expect(first).toContainText("50%");
  await expect(first.locator("td")).toHaveText([
    "20",
    "10",
    "3",
    "50%",
    "1800",
    "90.0",
    "1.35",
  ]);
  await expect(board.locator(".player-stats tbody tr").nth(4)).toContainText(
    "0%",
  );
  await expect(board.locator(".round-label")).toHaveText("RAUNT SKORU");
  await expect(page.locator(".demo-tag")).toHaveText("MATCHZY / API");
  await page.getByRole("button", { name: /Maç merkezi/ }).click();
  await expect(
    page.getByRole("dialog").locator(".player-stats tbody tr"),
  ).toHaveCount(10);
});

test("BO3 shows series score separately from the current map round score", async ({
  page,
}) => {
  const series = {
    id: "U5",
    a: "nova",
    b: "parallax",
    status: "live",
    score: [1, 1],
    maps: [
      { name: "Mirage", score: [13, 8], status: "completed" },
      { name: "Inferno", score: [14, 16], status: "completed" },
      { name: "Nuke", score: [9, 7], status: "live" },
    ],
    players: players("nova", "parallax"),
    updatedAt: new Date().toISOString(),
  };
  await feed(page, [
    bo1("U1", "nova", "orbit", true),
    bo1("U2", "parallax", "void", true),
    series,
  ]);
  await page.goto("/");
  const board = page.locator(".expanded-scoreboard");
  await board.scrollIntoViewIfNeeded();
  await expect(board.locator(".round-label")).toHaveText("HARİTA SKORU");
  await expect(board.locator(".score-numbers")).toHaveText("1 : 1");
  await expect(board.locator(".map-result")).toHaveCount(3);
  await expect(board.locator(".map-result").last()).toContainText("9 : 7");
  await expect(board.locator(".map-result").last()).toContainText("CANLI");
  await expect(board.locator(".stats-heading").first()).toContainText(
    "SERİ TOPLAMI",
  );
});

test("completed 2–0 series marks the third map as unplayed", async ({
  page,
}) => {
  const series = {
    id: "U5",
    a: "nova",
    b: "parallax",
    status: "completed",
    score: [2, 0],
    maps: [
      { name: "Mirage", score: [13, 8], status: "completed" },
      { name: "Inferno", score: [16, 14], status: "completed" },
    ],
    players: players("nova", "parallax"),
    updatedAt: new Date().toISOString(),
  };
  await feed(page, [
    bo1("U1", "nova", "orbit", true),
    bo1("U2", "parallax", "void", true),
    series,
  ]);
  await page.goto("/#maclar");
  await page
    .locator(".match-list-row")
    .filter({ has: page.locator(".list-match-time small", { hasText: "U5" }) })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".dialog-score")).toHaveText("2 : 0");
  await expect(dialog.locator(".map-result").last()).toContainText("OYNANMADI");
  await expect(dialog.locator(".map-result").nth(1)).toContainText("16 : 14");
});

test("legacy aggregate scores do not label played maps as unplayed", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "kampus-arena-tournament-v1",
      JSON.stringify({
        version: 1,
        resetFinal: true,
        results: {
          U1: { status: "completed", score: [13, 8] },
          U2: { status: "completed", score: [13, 7] },
          U5: { status: "completed", score: [2, 0] },
        },
      }),
    ),
  );
  await openAdminDemo(page);
  await expect(
    page.getByRole("heading", { name: "Turnuvayı dene." }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = "maclar";
  });
  await page
    .locator(".match-list-row")
    .filter({ has: page.locator(".list-match-time small", { hasText: "U5" }) })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".map-result").first()).toContainText(
    "DETAY YOK",
  );
  await expect(dialog.locator(".map-result").nth(1)).toContainText("DETAY YOK");
  await expect(dialog.locator(".map-result").last()).toContainText("OYNANMADI");
});

test("lost connection keeps the last snapshot and marks it as stale", async ({
  page,
}) => {
  let fail = false;
  await page.route("**/api/matches", (route) =>
    fail
      ? route.fulfill({ status: 503, json: { error: "offline" } })
      : route.fulfill({ json: { configured: true, matches: [bo1()] } }),
  );
  await page.goto("/");
  await expect(page.locator(".demo-tag")).toHaveText("MATCHZY / API");
  fail = true;
  await page.getByRole("button", { name: "Maç verilerini yenile" }).click();
  await expect(page.locator(".live-connection")).toContainText(
    "Bağlantı kesildi",
  );
  await expect(page.locator(".featured-stats tbody tr").first()).toContainText(
    "50%",
  );
  await expect(page.getByRole("button", { name: "Kişisel denemeye geç" })).toHaveCount(0);
  await openAdminDemo(page);
  await expect(
    page.getByRole("heading", { name: "Turnuvayı dene." }),
  ).toBeVisible();
  await page.evaluate(() => {
    location.hash = "turnuva";
  });
  await expect(page.locator(".featured-stats")).toHaveCount(0);
});

test("missing or malformed stats are never rendered as real zeroes", async ({
  page,
}) => {
  const bad = bo1();
  bad.players[0].headshotKills = 999;
  await feed(page, [bad]);
  await page.goto("/");
  await page.locator(".expanded-scoreboard").scrollIntoViewIfNeeded();
  await expect(page.locator(".featured-stats")).toHaveCount(0);
  await expect(page.locator(".live-connection")).toContainText(
    "Veriler güncellenemiyor",
  );
});

test("scoreboard reveals on scroll and stays readable with reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  const board = page.locator(".expanded-scoreboard");
  await board.scrollIntoViewIfNeeded();
  await expect(board).toHaveClass(/scoreboard-revealed/);
  await expect(board).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(board).toHaveCSS("opacity", "1");
  await expect(board).toHaveCSS("transform", "none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("BO3 map editor derives the result and saves per-map round scores", async ({
  page,
}) => {
  await openAdminDemo(page);
  await page.getByLabel("Maç durumu").selectOption("completed");
  await page
    .getByRole("spinbutton", { name: "Birinci takım skoru" })
    .fill("13");
  await page.getByRole("button", { name: "Skoru kaydet" }).click();
  await page
    .locator(".test-match-list")
    .getByRole("button", { name: /^U5 / })
    .click();
  await page.getByLabel("Maç durumu").selectOption("completed");
  await page.getByLabel("Harita detaylarını gir").check();
  await page.getByLabel("Harita 1 durumu").selectOption("completed");
  await page.getByLabel("Harita 1 birinci takım raunt skoru").fill("13");
  await page.getByLabel("Harita 1 ikinci takım raunt skoru").fill("8");
  await page.getByRole("button", { name: "Harita ekle" }).click();
  await page.getByLabel("Harita 2 durumu").selectOption("completed");
  await page.getByLabel("Harita 2 birinci takım raunt skoru").fill("16");
  await page.getByLabel("Harita 2 ikinci takım raunt skoru").fill("14");
  await expect(
    page.getByRole("spinbutton", { name: "Birinci takım skoru" }),
  ).toHaveValue("2");
  await page.getByRole("button", { name: "Skoru kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Değişiklik uygulandı");
  await openAdminDemo(page);
  await page
    .locator(".test-match-list")
    .getByRole("button", { name: /^U5 / })
    .click();
  await expect(
    page.getByLabel("Harita 2 birinci takım raunt skoru"),
  ).toHaveValue("16");
});

test("open match dialog stays stable across live polls without crashing or re-fetching matches on every arena poll", async ({
  page,
}) => {
  await page.clock.install();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let scoreA = 9;
  let matchCalls = 0;
  await page.route("**/api/matches", (route) => {
    matchCalls++;
    const live = bo1();
    live.score = [scoreA, 7];
    live.maps = [{ name: live.map, score: [scoreA, 7], status: "live" }];
    return route.fulfill({ json: { configured: true, matches: [live] } });
  });
  await page.goto("/");
  await page.clock.runFor(2000);
  const board = page.locator(".expanded-scoreboard");
  await board.getByRole("button", { name: /Maç merkezi/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".dialog-score")).toContainText("9 : 7");
  const initialMatchCalls = matchCalls;
  scoreA = 10;
  await page.clock.runFor(5200);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".dialog-score")).toContainText("10 : 7");
  expect(pageErrors).toEqual([]);
  // At most 1 scheduled 5s poll should have fired (not aborted/restarted by arena polling).
  expect(matchCalls - initialMatchCalls).toBeLessThanOrEqual(2);
});
