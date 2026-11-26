import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";
import { project, updateResult } from "../src/tournament/engine.ts";

async function preparingTournament(page, configure = () => {}, snapshot = {}) {
  const config = defaultArena();
  config.title = "OKUL TURNUVASI";
  config.server = { address: "", dathostServerId: "" };
  for (const team of config.teams) {
    team.roster = [];
    team.players = [];
    team.captainId = "";
  }
  config.teams[0].roster = [{ id: "nova-1", name: "Tek oyuncu", steamId: null }];
  config.teams[0].players = ["Tek oyuncu"];
  config.teams[0].captainId = "nova-1";
  configure(config);
  await page.route("**/api/arena", route => route.fulfill({ json: {
    revision: 1, config, state: config.state, readies: [], vetos: [], verified: [],
    verifiedPlayerIds: [], me: null, steamConfigured: true, runtimes: {},
    ...snapshot,
  } }));
  await page.route("**/api/matches", route => route.fulfill({ json: { configured: true, matches: [] } }));
  await page.goto("/#turnuva");
  await expect(page.locator(".brand")).toContainText("OKUL TURNUVASI");
}

test("unstarted match gives a compact truthful preparation summary", async ({ page }) => {
  await preparingTournament(page);
  const board = page.locator(".expanded-scoreboard");
  await expect(board.locator(".featured-preparation")).toContainText("Maç hazırlığı");
  await expect(board.locator(".preparation-rosters")).toContainText("1/5 oyuncu");
  await expect(board.locator(".preparation-rosters")).toContainText("0/5 oyuncu");
  await expect(board.locator(".player-stats")).toHaveCount(0);
  await expect(board.locator(".score-numbers")).toHaveCount(0);
  await expect(page.locator(".live-connection")).toContainText("Henüz sunucudan maç verisi alınmadı");
  await expect(page.locator(".live-connection")).not.toContainText("Bağlantı hazır");
  await expect(page.locator(".connection-switch")).toHaveCount(0);
  await expect(page.locator(".server-join")).toHaveCount(0);
  await expect(page.getByLabel("Turnuvaya katılım adımları")).toContainText("Steam ile giriş yap → Kadronu kontrol et → Maçına hazır ol");
  await board.getByRole("button", { name: /Maç merkezi/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".player-stats")).toHaveCount(0);
  await expect(dialog.locator(".roster-heading").first()).toContainText("1/5 OYUNCU");
  await expect(dialog).toContainText("Kadro oluşturulmadı. Kaptan atanmadı.");
  await expect(dialog.getByRole("link", { name: "Vetoyu görüntüle", exact: true })).toBeVisible();
});

test("confirmed live runtime is shown before the first round score arrives", async ({ page }) => {
  await preparingTournament(page, () => {}, { runtimes: { U2: { matchId: "U2", externalId: "123", phase: "live", lastEvent: "going_live" } } });
  const board = page.locator(".expanded-scoreboard");
  await expect(board.locator(".featured-top")).toContainText("U2");
  await expect(board.getByLabel("Maç aşaması")).toContainText("Canlı maç");
  await expect(board.locator(".preparation-label")).toHaveCount(0);
  await expect(board.locator(".live-label")).toContainText("ŞİMDİ SAHNEDE");
  await expect(board.locator(".featured-preparation")).not.toContainText("Maç hazırlığı");
  await expect(page.locator(".strip-end")).toContainText("MÜCADELE DEVAM EDİYOR");
});

test("forfeit final never promises player or map statistics", async ({ page }) => {
  await preparingTournament(page, config => {
    for (;;) {
      const view = project(config.state, config.teams);
      const match = view.matches.find(m => m.status === "upcoming" && m.a && m.b);
      if (!match) break;
      config.state = updateResult(config.state, match.id, { status: "completed", score: match.format === "BO1" ? [13, 0] : [2, 0], resolution: "forfeit", note: "Kaptanın bildirdiği çekilme" }, config.teams).state;
    }
  });
  const board = page.locator(".expanded-scoreboard");
  await expect(board.locator(".featured-preparation")).toContainText("Hükmen sonuç");
  await expect(board).toContainText("Harita oynanmış veya oyuncu istatistiği oluşmuş sayılmaz");
  await expect(board.locator(".map-results, .player-stats")).toHaveCount(0);
  await expect(board).not.toContainText("Oyuncu istatistiği bekleniyor");
});

test("empty team cards and result sharing have accurate labels", async ({ page }) => {
  await preparingTournament(page);
  await page.goto("/#takimlar");
  const empty = page.locator(".team-card").nth(1);
  await expect(empty).toContainText("Kadro oluşturulmadı");
  await expect(empty).toContainText("Kaptan atanmadı");
  await expect(empty.locator("small").filter({ hasText: /^KAPTAN$/ })).toHaveCount(0);
  await page.goto("/#sonuclar");
  await expect(page.getByRole("button", { name: "Sonuçları paylaş", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Oda davetini kopyala", exact: true })).toHaveCount(0);
});

test("published rules describe the implemented veto and mobile rounds can be selected", async ({ page, isMobile }) => {
  await preparingTournament(page);
  await page.goto("/#kurallar");
  await page.getByRole("button", { name: /Harita havuzu ve veto/ }).click();
  await expect(page.locator("#rule-2")).toContainText("yasakla / yasakla / seç / seç / yasakla / yasakla / kalan harita");
  await expect(page.locator("body")).not.toContainText("turnuva taslağı");
  if (isMobile) {
    await page.goto("/#turnuva");
    const winner = page.locator("#winner-bracket");
    const loser = page.locator("#loser-bracket");
    await expect(winner.getByText("Diğer turları görmek için yana kaydır")).toBeVisible();
    await winner.getByRole("button", { name: "Üst final", exact: true }).click();
    await expect.poll(() => winner.locator(".bracket-scroll").evaluate(el => el.scrollLeft)).toBeGreaterThan(300);
    await expect(winner.getByRole("button", { name: "Üst final", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => loser.locator(".bracket-scroll").evaluate(el => el.scrollLeft)).toBe(0);
    await expect(loser.getByRole("button", { name: "1. tur", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("rules show the organizer contact entered by the admin", async ({ page }) => {
  await preparingTournament(page, config => {
    config.organizer = { name: "Okul turnuva ekibi", contact: "Maç günü spor salonu kayıt masası" };
  });
  await page.goto("/#kurallar");
  const contact = page.getByLabel("Organizatöre ulaş");
  await expect(contact).toContainText("Okul turnuva ekibi");
  await expect(contact).toContainText("Maç günü spor salonu kayıt masası");
  await expect(contact).not.toContainText("henüz duyurulmadı");
});

test("390 px public pages remain readable without page overflow", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Exact mobile width regression");
  await page.setViewportSize({ width: 390, height: 844 });
  await preparingTournament(page);
  expect((await page.locator(".expanded-scoreboard").boundingBox()).height).toBeLessThan(480);
  for (const route of ["turnuva", "maclar", "takimlar", "kurallar", "sonuclar"]) {
    await page.goto(`/#${route}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  await page.goto("/#maclar");
  expect(await page.locator(".list-match-time small").first().evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
  await page.goto("/#kurallar");
  expect(await page.locator(".draft-notice p").evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
});
