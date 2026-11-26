import { test, expect } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";

async function preview(page) {
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 503, json: { error: "offline" } }),
  );
  await page.goto("/#admin");
  await page
    .getByRole("button", { name: "Yerel yönetim provasını aç" })
    .click();
  await page.getByRole("button", { name: "Maç yönetimi" }).click();
}
test("admin selects opening opponents, swaps the displaced team, saves and sees the bracket after reload", async ({
  page,
}) => {
  await preview(page);
  const editor = page.locator(".opening-editor");
  await expect(editor.getByRole("combobox")).toHaveCount(8);
  await page
    .getByLabel("U1 ikinci takım", { exact: true })
    .selectOption("parallax");
  await expect(
    page.getByLabel("U2 birinci takım", { exact: true }),
  ).toHaveValue("orbit");
  expect(
    new Set(
      await editor
        .getByRole("combobox")
        .evaluateAll((elements) => elements.map((e) => e.value)),
    ).size,
  ).toBe(8);
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  await page.reload();
  await page
    .getByRole("button", { name: "Yerel yönetim provasını aç" })
    .click();
  await page.getByRole("button", { name: "Maç yönetimi" }).click();
  await expect(page.getByLabel("U1 ikinci takım", { exact: true })).toHaveValue(
    "parallax",
  );
  await page.evaluate(() => {
    location.hash = "turnuva";
  });
  await expect(
    page.getByRole("button", {
      name: "U1: NOVA - PARALLAX, maç detayları",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "U2: ORBIT - VOID, maç detayları",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("same-match swaps work and editing the seed also swaps rather than duplicating teams", async ({
  page,
}) => {
  await preview(page);
  await page
    .getByLabel("U1 birinci takım", { exact: true })
    .selectOption("orbit");
  await expect(page.getByLabel("U1 ikinci takım", { exact: true })).toHaveValue(
    "nova",
  );
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  await page.getByRole("button", { name: "Takımlar & Oyuncular" }).click();
  await page
    .getByRole("combobox", { name: "Seri başı", exact: true })
    .selectOption("4");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  await page.getByRole("button", { name: "Maç yönetimi" }).click();
  await expect(
    page.getByLabel("U2 birinci takım", { exact: true }),
  ).toHaveValue("nova");
  await expect(page.getByLabel("U1 ikinci takım", { exact: true })).toHaveValue(
    "parallax",
  );
});
test("changing prepared opponents requires reset approval, cancel keeps the existing veto", async ({
  page,
}) => {
  await preview(page);
  await page.getByRole("tab", { name: "Veto", exact: true }).click();
  await page.getByRole("button", { name: "Prova vetosunu aç" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  await page
    .getByLabel("U1 ikinci takım", { exact: true })
    .selectOption("parallax");
  await expect(page.locator(".opening-warning")).toContainText(
    "tüm turnuvanın",
  );
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.locator(".change-confirm")).toContainText(
    "vetoları sıfırlanacak",
  );
  await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await page.getByRole("button", { name: "Kaydı yeniden yükle" }).click();
  await expect(page.getByLabel("U1 ikinci takım", { exact: true })).toHaveValue(
    "orbit",
  );
  await expect(page.locator(".admin-match-editor")).toContainText(
    "Veto sürüyor",
  );
  await page
    .getByLabel("U1 ikinci takım", { exact: true })
    .selectOption("parallax");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await page
    .getByRole("button", { name: "Onayla ve uygula", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  await expect(page.locator(".admin-match-editor")).not.toContainText(
    "Veto sürüyor",
  );
  await expect(page.getByLabel("U1 ikinci takım", { exact: true })).toHaveValue(
    "parallax",
  );
});
test("online admin saves the same pairing configuration used by the public bracket", async ({
  page,
}) => {
  let snapshot = {
    revision: 1,
    config: defaultArena(),
    readies: [],
    vetos: [],
    verified: [],
    runtimes: {},
    me: { role: "admin" },
    steamConfigured: true,
  };
  snapshot.state = snapshot.config.state;
  const posts = [];
  await page.route("**/api/matches", (r) =>
    r.fulfill({ json: { configured: true, matches: [] } }),
  );
  await page.route("**/api/arena", async (r) => {
    if (r.request().method() === "POST") {
      const data = r.request().postDataJSON();
      posts.push(data);
      snapshot.config = data.config;
      snapshot.state = data.config.state;
      snapshot.revision++;
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: snapshot });
  });
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Maç yönetimi" }).click();
  await page
    .getByLabel("U3 ikinci takım", { exact: true })
    .selectOption("void");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("status")).toContainText("Kaydedildi");
  expect(posts).toHaveLength(1);
  expect(posts[0].config.teams.find((t) => t.id === "void").seed).toBe(7);
  await page.goto("/");
  await expect(
    page.getByRole("button", {
      name: "U3: APEX - VOID, maç detayları",
      exact: true,
    }),
  ).toBeVisible();
});
