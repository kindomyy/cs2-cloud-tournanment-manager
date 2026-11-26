import { openAdminDemo } from "./demo-session.js";
import { test, expect } from "@playwright/test";
async function preview(page) {
  await page.goto("/#admin");
  await page
    .getByRole("button", { name: "Yerel yönetim provasını aç" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kontrol sende." }),
  ).toBeVisible();
}
test("admin edits roster, SteamID, captain and schedule, then preserves draft after reload", async ({
  page,
}) => {
  await preview(page);
  await page
    .getByRole("textbox", { name: "Takım adı", exact: true })
    .fill("NOVA AKADEMİ");
  await page
    .getByRole("textbox", { name: "1. oyuncu görünen isim", exact: true })
    .fill("captain-test");
  await page
    .getByRole("textbox", { name: "1. oyuncu SteamID64", exact: true })
    .fill("76561198000000001");
  await expect(page.locator(".admin-player-row").first()).toContainText(
    "Doğrulanmadı",
  );
  await page.getByLabel("Kaptan", { exact: true }).selectOption("nova-2");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  await page.getByRole("button", { name: "Maç yönetimi" }).click();
  await page.getByLabel("Oyunculara maç notu").fill("Kaptanlar hazır olduğunda haber versin.");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  await page.reload();
  await page
    .getByRole("button", { name: "Yerel yönetim provasını aç" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Takım adı", exact: true }),
  ).toHaveValue("NOVA AKADEMİ");
  await expect(
    page.getByRole("textbox", { name: "1. oyuncu SteamID64", exact: true }),
  ).toHaveValue("76561198000000001");
  await expect(page.getByLabel("Kaptan", { exact: true })).toHaveValue(
    "nova-2",
  );
  await page.goto("/#takimlar");
  await expect(page.locator(".team-card").first()).toContainText(
    "NOVA AKADEMİ",
  );
  await page.locator(".team-card").first().click();
  await expect(page.getByRole("dialog")).toContainText("captain-test");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("admin team/player creation and duplicate SteamID validation work", async ({
  page,
}) => {
  await preview(page);
  await page
    .getByRole("textbox", { name: "1. oyuncu SteamID64", exact: true })
    .fill("76561198000000001");
  await page
    .getByRole("textbox", { name: "2. oyuncu SteamID64", exact: true })
    .fill("76561198000000001");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("alert")).toContainText("SteamID64");
  await page
    .getByRole("textbox", { name: "2. oyuncu SteamID64", exact: true })
    .fill("");
  await page.getByRole("button", { name: "Takımı sil", exact: true }).click();
  await page.getByRole("button", { name: "Takım ekle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Takım adı", exact: true })
    .fill("YENİ KADRO");
  await page.getByRole("button", { name: "Oyuncu ekle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "1. oyuncu görünen isim", exact: true })
    .fill("fresh-player");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  await page.goto("/#takimlar");
  await expect(page.locator(".team-card").first()).toContainText("YENİ KADRO");
});
test("veto is a full page; six BO1 bans produce the decider using downloaded images", async ({
  page,
}) => {
  await preview(page);
  await page.getByRole("button", { name: "Maç yönetimi" }).click();
  await page.getByRole("tab", { name: "Veto", exact: true }).click();
  await page.getByRole("button", { name: "Prova vetosunu aç" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  await page.getByRole("link", { name: "Tam sayfa veto" }).click();
  await expect(page.locator(".site-header")).toHaveCount(0);
  await expect(page.locator(".veto-page")).toBeVisible();
  await expect(page.locator(".veto-map")).toHaveCount(7);
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
    await expect(
      page.getByRole("button", { name: map + " · elendi", exact: true }),
    ).toBeDisabled();
  }
  await expect(
    page.getByRole("heading", { name: "Sahne artık sizin." }),
  ).toBeVisible();
  await expect(page.locator(".veto-picked")).toContainText("Vertigo");
  const loaded = await page
    .locator(".veto-map>img")
    .evaluateAll((images) =>
      images.every((image) => image.complete && image.naturalWidth > 0),
    );
  expect(loaded).toBe(true);
  await expect(page).toHaveURL(/#turnuva$/);
  await expect(page.locator(".expanded-scoreboard")).toHaveAttribute(
    "style",
    /vertigo\.png/,
  );
  await expect(page.locator(".expanded-scoreboard .preparation-maps")).toContainText(
    "Vertigo",
  );
  await expect(page.locator(".expanded-scoreboard .map-results")).toHaveCount(0);
  await expect(page.locator(".expanded-scoreboard .map-badge")).toContainText(
    "VERTİGO",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("player entry does not pretend Steam verification in offline rehearsal", async ({
  page,
}) => {
  await page.goto("/#oyuncu");
  await expect(
    page.getByRole("heading", { name: "Steam hesabınla giriş yap." }),
  ).toBeVisible();
  await expect(page.locator(".setup-note")).toContainText(
    "kimlik doğrulanmış sayılmaz",
  );
  await expect(
    page.getByRole("button", { name: "Hazırım", exact: true }),
  ).toHaveCount(0);
});
test("scoreboard and match cards use local map photos", async ({ page }) => {
  await openAdminDemo(page);
  await page.evaluate(() => {
    location.hash = "turnuva";
  });
  const board = page.locator(".expanded-scoreboard");
  await expect(board).toHaveAttribute("style", /nuke\.png/);
  await board.getByRole("button", { name: /Maç merkezi/ }).click();
  await expect(page.getByRole("dialog")).toHaveAttribute("style", /nuke\.png/);
  await expect(page.locator(".map-result.live").last()).toHaveAttribute(
    "style",
    /nuke\.png/,
  );
  await page.getByRole("button", { name: "Kapat", exact: true }).click();
  await page.evaluate(() => {
    location.hash = "maclar";
  });
  await expect(page.locator(".match-list-row.live")).toHaveAttribute(
    "style",
    /nuke\.png/,
  );
});
test("admin uploads a team logo and it persists across pages and reload", async ({
  page,
}) => {
  await preview(page);
  await page
    .getByLabel("Takım logosu", { exact: true })
    .setInputFiles("public/maps/nuke.png");
  await expect(page.locator(".logo-preview img")).toBeVisible();
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  await page.goto("/#takimlar");
  const logo = page.locator(".team-card .team-custom-logo").first();
  await expect(logo).toBeVisible();
  expect(
    await logo.evaluate((el) => el.complete && el.naturalWidth === 256),
  ).toBe(true);
  await page.reload();
  await expect(
    page.locator(".team-card .team-custom-logo").first(),
  ).toBeVisible();
});
