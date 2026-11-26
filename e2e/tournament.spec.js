import { openAdminDemo } from "./demo-session.js";
import { test, expect } from "@playwright/test";
async function demoGoto(page, path) {
  await openAdminDemo(page);
  await expect(
    page.getByRole("heading", { name: "Turnuvayı dene." }),
  ).toBeVisible();
  await page.evaluate((path) => {
    location.hash = path.split("#")[1] || "turnuva";
  }, path);
}

test("maç merkezi kadroları gösterir ve Escape ile kapanır", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await demoGoto(page, "/");
  const trigger = page.locator(".expanded-scoreboard").getByRole("button", {
    name: /Maç merkezi/,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".roster-player")).toHaveCount(10);
  await expect(dialog.locator(".dialog-score")).toHaveText("9 : 7");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test("kazananlar, kaybedenler ve final eşleşmeleri aynı sayfada gösterilir", async ({
  page,
}) => {
  await demoGoto(page, "/");
  await expect(page.locator("#winner-bracket .bracket-match")).toHaveCount(7);
  await expect(page.locator("#loser-bracket .bracket-match")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "Kazananlar braketi", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kaybedenler braketi", exact: true })).toBeVisible();
  await expect(page.getByText("Tek kupa. Tek şampiyon.")).toBeVisible();
  await expect(page.locator("#final-bracket .bracket-match")).toHaveCount(1);
  await expect(page.locator("#fikstur").getByRole("tab")).toHaveCount(0);
});

test("maç filtreleri, takım araması ve boş sonuçtan dönüş çalışır", async ({
  page,
}) => {
  await demoGoto(page, "/#maclar");
  await expect(page.locator(".match-list-row")).toHaveCount(14);
  await page.getByRole("button", { name: "Canlı", exact: true }).click();
  await expect(page.locator(".match-list-row")).toHaveCount(1);
  await expect(page.locator(".match-list-row")).toContainText("PARALLAX");
  await page.getByRole("button", { name: "Tamamlanan", exact: true }).click();
  await expect(page.locator(".match-list-row")).toHaveCount(1);
  await expect(page.locator(".match-list-row")).toContainText("NOVA");
  await page.getByRole("button", { name: "Tümü", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Maç veya takım ara" });
  await search.fill("nova");
  await expect(page.locator(".match-list-row")).toHaveCount(2);
  await search.fill("eşleşmeyen takım");
  await expect(page.getByText("Eşleşme bulunamadı.")).toBeVisible();
  await page.getByRole("button", { name: "Filtreleri temizle" }).click();
  await expect(page.locator(".match-list-row")).toHaveCount(14);
});

test("takım kartında kaptan ve beş kişilik kadro açılır", async ({ page }) => {
  await demoGoto(page, "/#takimlar");
  await expect(page.locator(".team-card")).toHaveCount(8);
  await page.locator(".team-card").first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "NOVA", exact: true }).first(),
  ).toBeVisible();
  await expect(dialog.locator(".roster-player")).toHaveCount(5);
  await expect(dialog.locator(".captain")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test("kurallar açılır, kapanır ve uygulanan veto sırası açıklanır", async ({
  page,
}) => {
  await demoGoto(page, "/#kurallar");
  const veto = page.getByRole("button", { name: /Harita havuzu ve veto/ });
  await veto.click();
  await expect(veto).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#rule-2")).toContainText("Veto hamlelerini sırası gelen kaptan yapar");
  await expect(page.locator("#rule-0")).not.toBeVisible();
  await veto.click();
  await expect(page.locator("#rule-2")).not.toBeVisible();
});

test("menüden sayfa değiştirilir ve sayfa yenilendiğinde korunur", async ({
  page,
  isMobile,
}) => {
  await demoGoto(page, "/");
  if (isMobile) await page.getByRole("button", { name: "Menüyü aç" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Takımlar" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sahnedeki takımlar." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sahnedeki takımlar." }),
  ).toBeVisible();
  if (isMobile) await expect(page.getByRole("navigation")).not.toBeVisible();
});

test("sayfalarda yatay taşma yok, fikstür kendi içinde kaydırılır", async ({
  page,
}) => {
  for (const route of ["turnuva", "maclar", "takimlar", "kurallar"]) {
    await demoGoto(page, "/#" + route);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
