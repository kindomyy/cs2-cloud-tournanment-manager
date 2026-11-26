import { openAdminDemo } from "./demo-session.js";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const key = "kampus-arena-tournament-v1";

async function select(page, id) {
  await page
    .locator(".test-match-list")
    .getByRole("button", { name: new RegExp(`^${id} `) })
    .click();
}
async function score(page, a, b, status = "completed") {
  await page.getByLabel("Maç durumu").selectOption(status);
  await page
    .getByRole("spinbutton", { name: "Birinci takım skoru" })
    .fill(String(a));
  await page
    .getByRole("spinbutton", { name: "İkinci takım skoru" })
    .fill(String(b));
  await page.getByRole("button", { name: "Skoru kaydet" }).click();
}

test("completed BO1 advances both teams and persists after reload", async ({
  page,
}) => {
  await openAdminDemo(page);
  await score(page, 13, 7);
  await expect(page.getByRole("status")).toContainText("Değişiklik uygulandı");
  await select(page, "U5");
  await expect(page.locator(".editor-score-row")).toContainText("PARALLAX");
  await select(page, "L1");
  await expect(page.locator(".editor-score-row")).toContainText("VOID");
  await openAdminDemo(page);
  await select(page, "U2");
  await expect(
    page.getByRole("spinbutton", { name: "Birinci takım skoru" }),
  ).toHaveValue("13");
  await expect(page.getByLabel("Maç durumu")).toHaveValue("completed");
  await page.evaluate(()=>{location.hash="maclar";});
  await page.getByRole("button", { name: "Tamamlanan", exact: true }).click();
  await expect(page.locator(".match-list-row")).toHaveCount(2);
  await expect(page.locator(".match-list-row").last()).toContainText("13 : 7");
});

test("correction previews dependent invalidation, cancellation preserves data", async ({
  page,
}) => {
  await openAdminDemo(page);
  await score(page, 13, 7);
  await select(page, "U5");
  await score(page, 1, 0, "live");
  await select(page, "U2");
  await score(page, 7, 13);
  await expect(page.locator(".change-confirm")).toContainText("U5");
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await select(page, "U5");
  await expect(
    page.getByRole("spinbutton", { name: "Birinci takım skoru" }),
  ).toHaveValue("1");
  await expect(page.locator(".editor-score-row")).toContainText("PARALLAX");
  await select(page, "U2");
  await score(page, 7, 13);
  await page.getByRole("button", { name: "Onayla ve uygula" }).click();
  await select(page, "U5");
  await expect(page.locator(".editor-score-row")).toContainText("VOID");
  await expect(
    page.getByRole("spinbutton", { name: "Birinci takım skoru" }),
  ).toHaveValue("0");
  await select(page, "U1");
  await expect(
    page.getByRole("spinbutton", { name: "Birinci takım skoru" }),
  ).toHaveValue("13");
});

test("invalid results are refused and unresolved matches cannot be edited", async ({
  page,
}) => {
  await openAdminDemo(page);
  await score(page, 12, 12);
  await expect(page.getByRole("alert")).toContainText("MR12");
  await score(page, 13, 12);
  await expect(page.getByRole("alert")).toContainText("MR12");
  await select(page, "U7");
  await expect(
    page.getByRole("button", { name: "Skoru kaydet" }),
  ).toBeDisabled();
  await select(page, "U2");
  await expect(
    page.getByRole("spinbutton", { name: "Birinci takım skoru" }),
  ).toHaveValue("9");
});

test("a complete tournament opens reset final and announces its champion", async ({
  page,
}) => {
  // This scenario enters all 15 results through the UI, including both finals.
  test.slow();
  await openAdminDemo(page);
  await page.getByRole("button", { name: "Sıfırdan başlat" }).click();
  await page.getByRole("button", { name: "Onayla ve uygula" }).click();
  for (const id of [
    "U1",
    "U2",
    "U3",
    "U4",
    "U5",
    "U6",
    "U7",
    "L1",
    "L2",
    "L3",
    "L4",
    "L5",
    "L6",
    "GF",
    "GF2",
  ]) {
    await select(page, id);
    await score(
      page,
      id.startsWith("U") && Number(id.slice(1)) <= 4 ? 13 : id === "GF" ? 1 : 2,
      id.startsWith("U") && Number(id.slice(1)) <= 4 ? 8 : id === "GF" ? 2 : 0,
    );
    if (id === "GF") {
      await expect(page.locator(".champion-banner")).not.toBeVisible();
      await expect(
        page.locator(".test-match-list").getByRole("button", { name: /^GF2 / }),
      ).toBeVisible();
    }
  }
  await expect(page.locator(".champion-banner")).toContainText("NOVA");
  await page.evaluate(() => { location.hash = "turnuva"; });
  await page.locator("#final-bracket").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", { name: "Şampiyon: NOVA" }),
  ).toBeVisible();
  await expect(page.locator(".final-series")).toHaveCount(2);
  await page.evaluate(() => { location.hash = "takimlar"; });
  await expect(
    page.locator(".team-tag").filter({ hasText: "ELENDİ" }),
  ).toHaveCount(7);
});

test("JSON backup exports, rejects bad files and restores valid results", async ({
  page,
}) => {
  await openAdminDemo(page);
  await score(page, 13, 7);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON yedeği indir" }).click();
  const download = await downloaded;
  const buffer = await readFile(await download.path());
  expect(JSON.parse(buffer.toString()).results.U2.score).toEqual([13, 7]);
  await page.getByRole("button", { name: "Sıfırdan başlat" }).click();
  await page.getByRole("button", { name: "Onayla ve uygula" }).click();
  await page.getByLabel("Turnuva yedeği").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(page.getByRole("alert")).toContainText("Yedek yüklenemedi");
  await page.getByLabel("Turnuva yedeği").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer,
  });
  await page.getByRole("button", { name: "Onayla ve uygula" }).click();
  await select(page, "U2");
  await expect(
    page.getByRole("spinbutton", { name: "Birinci takım skoru" }),
  ).toHaveValue("13");
});

test("unreadable storage is reported and not overwritten on initial load", async ({
  page,
}) => {
  await page.addInitScript((key) => localStorage.setItem(key, "{broken"), key);
  await openAdminDemo(page);
  await expect(page.getByRole("alert")).toContainText("kayıt okunamadı");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    "{broken",
  );
});

test("disabled storage reports that changes are in memory only", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("storage unavailable");
    };
  });
  await openAdminDemo(page);
  await score(page, 13, 7);
  await expect(page.getByRole("alert")).toContainText(
    "yalnızca bu sayfa açıkken",
  );
  await select(page, "U5");
  await expect(page.locator(".editor-score-row")).toContainText("PARALLAX");
});
