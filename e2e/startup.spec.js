import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";

async function fixture(page, { arenaFails = false, holdArena, holdMatches } = {}) {
  const config = defaultArena();
  config.title = "GERÇEK TURNUVA";
  config.presentation = { minimal: true, activeMatchId: null };
  config.teams = [];
  await page.route("**/api/arena", async route => {
    if (holdArena) await holdArena;
    return route.fulfill(arenaFails ? { status: 503, json: { error: "offline" } } : { json: {
      revision: 1, config, state: config.state, me: null, readies: [], vetos: [], verified: [], runtimes: {}, steamConfigured: true,
    } });
  });
  await page.route("**/api/matches", async route => {
    if (holdMatches) await holdMatches;
    return route.fulfill({ json: { configured: true, matches: [] } });
  });
}
async function freezeClock(page) {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
}
test("fast data still shows the loader for at least one second without old content", async ({ page }) => {
  await freezeClock(page);
  const stale = defaultArena();
  stale.title = "ESKİ TURNUVA";
  await page.addInitScript(config => localStorage.setItem("kampus-arena-management-preview-v1", JSON.stringify(config)), stale);
  await fixture(page);
  await page.goto("/#turnuva");
  await expect(page.getByRole("progressbar")).toBeVisible();
  await page.clock.runFor(900);
  await expect(page.locator(".site-header")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("NOVA");
  await expect(page.locator("body")).not.toContainText("Among Us!");
  await expect(page.locator("body")).not.toContainText("ESKİ TURNUVA");
  await page.clock.runFor(150);
  await expect(page.locator(".brand")).toContainText("GERÇEK TURNUVA");
  await expect(page.locator(".startup-screen")).toHaveClass(/is-leaving/);
  await expect(page.locator(".startup-page")).toHaveAttribute("inert", "");
  await expect(page.locator(".startup-screen")).toHaveCount(1);
  await page.clock.runFor(700);
  await expect(page.locator(".startup-screen")).toHaveCount(0);
  await expect(page.locator(".brand")).toBeVisible();
  await expect(page.locator(".startup-page")).not.toHaveAttribute("inert", "");
  await page.clock.runFor(6000);
  await expect(page.locator(".startup-screen")).toHaveCount(0);
});
for (const source of ["arena", "matches"]) test(`slow ${source} data keeps the loading screen until ready`, async ({ page }) => {
  await freezeClock(page);
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  await fixture(page, source === "arena" ? { holdArena: hold } : { holdMatches: hold });
  await page.goto("/#maclar");
  await page.clock.runFor(1500);
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(page.locator(".site-header")).toHaveCount(0);
  release();
  await expect(page.locator(".brand")).toContainText("GERÇEK TURNUVA");
});
test("failed initial data shows retry instead of demo teams and can recover", async ({ page }) => {
  await freezeClock(page);
  await fixture(page, { arenaFails: true });
  await page.goto("/");
  await page.clock.runFor(1100);
  await expect(page.getByRole("button", { name: "Yeniden dene" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("NOVA");
  await expect(page.locator(".site-header")).toHaveCount(0);
  await fixture(page);
  await page.getByRole("button", { name: "Yeniden dene" }).click();
  await expect(page.locator(".brand")).toContainText("GERÇEK TURNUVA");
});
test("390px loading screen fits and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freezeClock(page);
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  await fixture(page, { holdArena: hold });
  await page.goto("/");
  await expect(page.getByRole("progressbar")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator(".star-body").first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await expect(page.locator(".startup-screen .startup-topline, .startup-screen .startup-content, .startup-screen .startup-progress")).toHaveCount(0);
  expect((await page.locator(".startup-screen").innerText()).trim()).toBe("");
  await expect(page.locator(".startup-reference-shape")).toHaveCount(1);
  const wings = page.locator("[data-wing-side]");
  await expect(wings).toHaveCount(2);
  const right = page.locator('[data-wing-side="right"]');
  const left = page.locator('[data-wing-side="left"]');
  expect(await left.innerHTML()).toBe(await right.innerHTML());
  await expect(left).toHaveAttribute("transform", "translate(400 0) scale(-1 1)");
  await expect(left.locator(".wing-guides circle:not(.grid-node)")).toHaveCount(2);
  const leftBox = await left.boundingBox(), rightBox = await right.boundingBox();
  const svgBox = await page.locator(".startup-reference-shape").boundingBox();
  expect(Math.abs((leftBox.x + leftBox.width / 2 + rightBox.x + rightBox.width / 2) / 2 - (svgBox.x + svgBox.width / 2))).toBeLessThan(1);
  expect(await left.evaluate(el => getComputedStyle(el).transform)).not.toBe("none");
  await expect(page.locator("feDisplacementMap")).toHaveAttribute("scale", "3.6");
  await page.screenshot({ path: "work/startup-390.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "work/startup-1440.png" });
  release();
});
