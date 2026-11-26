import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";
import { project, updateResult } from "../src/tournament/engine.ts";

async function openTournament(page, { minimal = false, resetFinal = false } = {}) {
  const config = defaultArena();
  config.title = "Braket turnuvası";
  config.presentation = { minimal, activeMatchId: null };
  if (resetFinal) {
    for (;;) {
      const view = project(config.state, config.teams);
      const match = view.matches.find(m => m.status === "upcoming" && m.a && m.b);
      if (!match || match.id === "GF2") break;
      config.state = updateResult(config.state, match.id, {
        status: "completed", score: match.format === "BO1" ? [13, 0] : match.id === "GF" ? [0, 2] : [2, 0],
        resolution: "forfeit", note: "Organizatör kararı",
      }, config.teams).state;
    }
  } else {
    for (const id of ["U1", "U2"]) config.state = updateResult(config.state, id, {
      status: "completed", score: [13, 7], map: "Mirage",
    }, config.teams).state;
  }
  await page.route("**/api/arena", route => route.fulfill({ json: {
    revision: 1, config, state: config.state, readies: [], vetos: [], verified: [],
    verifiedPlayerIds: [], me: null, steamConfigured: true, runtimes: {},
  } }));
  await page.route("**/api/matches", route => route.fulfill({ json: { configured: true, matches: [] } }));
  await page.goto("/#turnuva");
  await expect(page.locator(".brand")).toContainText("Braket turnuvası");
}

for (const minimal of [false, true]) test(`${minimal ? "minimal" : "full"} view displays winner and loser brackets in order without duplicate matches`, async ({ page }) => {
  await openTournament(page, { minimal });
  const winner = page.getByRole("region", { name: "Kazananlar braketi", exact: true });
  const loser = page.getByRole("region", { name: "Kaybedenler braketi", exact: true });
  await expect(winner).toBeVisible();
  await expect(loser).toBeVisible();
  await expect(winner.locator(".bracket-match")).toHaveCount(7);
  await expect(loser.locator(".bracket-match")).toHaveCount(6);
  await expect(page.locator("#final-bracket .bracket-match")).toHaveCount(1);
  await expect(page.locator("#fikstur .bracket-match")).toHaveCount(14);
  await expect(page.locator("#fikstur").getByRole("tab")).toHaveCount(0);
  const winnerBox = await winner.boundingBox();
  const loserBox = await loser.boundingBox();
  expect(loserBox.y).toBeGreaterThanOrEqual(winnerBox.y + winnerBox.height);
  const lowerMatch = loser.getByRole("button", { name: /^L1:/ });
  await expect(lowerMatch).toContainText("ORBIT");
  await expect(lowerMatch).toContainText("VOID");
  await lowerMatch.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("L1 / MAÇ MERKEZİ");
});

test("390 px brackets scroll independently and preserve both branches", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTournament(page, { minimal: true });
  const winner = page.locator("#winner-bracket");
  const loser = page.locator("#loser-bracket");
  await winner.getByRole("button", { name: "Üst final", exact: true }).click();
  await expect.poll(() => winner.locator(".bracket-scroll").evaluate(el => el.scrollLeft)).toBeGreaterThan(300);
  const winnerScroll = await winner.locator(".bracket-scroll").evaluate(el => el.scrollLeft);
  await expect(loser.getByRole("button", { name: "1. tur", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await loser.locator(".bracket-scroll").evaluate(el => el.scrollLeft)).toBe(0);
  await loser.getByRole("button", { name: "Alt final", exact: true }).click();
  await expect.poll(() => loser.locator(".bracket-scroll").evaluate(el => el.scrollLeft)).toBeGreaterThan(300);
  expect(await winner.locator(".bracket-scroll").evaluate(el => el.scrollLeft)).toBe(winnerScroll);
  await expect(winner.locator(".bracket-match")).toHaveCount(7);
  await expect(loser.locator(".bracket-match")).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("reset final remains visible after the lower-bracket winner takes the first final", async ({ page }) => {
  await openTournament(page, { minimal: true, resetFinal: true });
  const finals = page.locator("#final-bracket");
  await expect(finals.locator(".bracket-match")).toHaveCount(2);
  await expect(finals.getByRole("button", { name: /^GF:/ })).toContainText("2");
  await expect(finals.getByRole("button", { name: /^GF2:/ })).toBeVisible();
  await expect(finals).toContainText("TEKRAR SERİSİ");
  await expect(page.locator("#fikstur .bracket-match")).toHaveCount(15);
});
