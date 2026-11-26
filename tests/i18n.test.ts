import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAcceptLanguage, translateServerMessage } from "../src/i18n/serverMessages";
import { localizeResponse } from "../server/i18n";
import worker, { type WorkerEnv } from "../server/worker";

function workerEnv(): WorkerEnv {
  return {
    ASSETS: {
      async fetch() {
        return new Response("<!doctype html>Among Us!", {
          headers: { "Content-Type": "text/html" },
        });
      },
    },
  };
}

test("parseAcceptLanguage defaults to Turkish and respects explicit English preferences", () => {
  assert.equal(parseAcceptLanguage(null), "tr");
  assert.equal(parseAcceptLanguage(""), "tr");
  assert.equal(parseAcceptLanguage("tr"), "tr");
  assert.equal(parseAcceptLanguage("tr-TR,tr;q=0.9,en;q=0.8"), "tr");
  assert.equal(parseAcceptLanguage("fr-FR,de;q=0.8"), "tr");
  assert.equal(parseAcceptLanguage("en"), "en");
  assert.equal(parseAcceptLanguage("en-US,en;q=0.9"), "en");
  assert.equal(parseAcceptLanguage("tr;q=0.4, en-GB;q=0.9"), "en");
  assert.equal(parseAcceptLanguage("de-DE,en;q=0.7"), "en");
});

test("translateServerMessage translates exact and parameterized backend messages to English while keeping Turkish untouched", () => {
  assert.equal(
    translateServerMessage("Yönetici girişi gerekli.", "tr"),
    "Yönetici girişi gerekli.",
  );
  assert.equal(
    translateServerMessage("Yönetici girişi gerekli.", "en"),
    "Admin sign-in is required.",
  );
  assert.equal(
    translateServerMessage("API adresi bulunamadı.", "en"),
    "API endpoint not found.",
  );
  assert.equal(
    translateServerMessage(
      "U1 maçının kimliği kullanımda. Kimliği elle değiştirmek yerine 'Yeni kimlikle tekrar oynat' işlemini kullan.",
      "en",
    ),
    "Match ID for U1 is in use. Use 'Replay with new ID' instead of editing the ID manually.",
  );
  assert.equal(
    translateServerMessage(
      "Sunucuda U2 için işlem/maç var. Önce o maçı kapat.",
      "en",
    ),
    "There is an active match/operation for U2 on the server. End that match first.",
  );
  assert.match(
    translateServerMessage(
      "DatHost erişimi başarısız (HTTP 401). Komutun sonucu belirsiz.",
      "en",
    ),
    /^DatHost request failed \(HTTP 401\)\. Check DATHOST_EMAIL.*uncertain/,
  );
  assert.equal(
    translateServerMessage(
      "Hükmen sonuç kaydedilecek. Sunucudaki oyun ayrıca durdurulmalı; harita/oyuncu istatistiği üretilmez. Katılımcısı değişen sonraki maçların sonucu ve hazırlığı temizlenecek: yok.",
      "en",
    ),
    "Forfeit result will be saved. Stop any live game on the server separately; no map or player stats will be generated. Downstream matches with changed participants to be cleared: none.",
  );
});

test("localizeResponse translates nested API JSON fields only for Accept-Language: en", async () => {
  const payload = {
    error: "Yönetici girişi gerekli.",
    message: "Komut DatHost’a iletildi. MatchZy olayıyla sunucu onayı beklenecek.",
    server: { name: "DatHost sunucusu" },
    health: { lastDathostAttempt: { error: "DatHost erişimi başarısız (HTTP 404)." } },
  };
  const trResponse = await localizeResponse(
    new Request("https://example.test/api/operations"),
    new Response(JSON.stringify(payload), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  );
  assert.equal(trResponse.status, 401);
  assert.deepEqual(await trResponse.json(), payload);

  const enResponse = await localizeResponse(
    new Request("https://example.test/api/operations", {
      headers: { "Accept-Language": "en" },
    }),
    new Response(JSON.stringify(payload), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  );
  assert.equal(enResponse.status, 401);
  const enBody = (await enResponse.json()) as typeof payload;
  assert.equal(enBody.error, "Admin sign-in is required.");
  assert.equal(enBody.message, "Command sent to DatHost. Waiting for MatchZy event confirmation.");
  assert.equal(enBody.server.name, "DatHost server");
  assert.match(enBody.health.lastDathostAttempt.error, /^DatHost request failed \(HTTP 404\)\./);
});

test("Workers API endpoints return Turkish by default and English when Accept-Language: en is sent", async () => {
  const env = workerEnv();
  const origin = "https://cs2-tournanmentmanager.fierce-condor.workers.dev";

  const trMissing = await worker.fetch(new Request(origin + "/api/missing"), env);
  assert.equal(trMissing.status, 404);
  assert.equal(((await trMissing.json()) as { error: string }).error, "API adresi bulunamadı.");

  const enMissing = await worker.fetch(
    new Request(origin + "/api/missing", { headers: { "Accept-Language": "en" } }),
    env,
  );
  assert.equal(enMissing.status, 404);
  assert.equal(((await enMissing.json()) as { error: string }).error, "API endpoint not found.");
  assert.equal(enMissing.headers.get("x-content-type-options"), "nosniff");

  const enMethod = await worker.fetch(
    new Request(origin + "/api/matches", {
      method: "POST",
      body: "{}",
      headers: { "Accept-Language": "en" },
    }),
    env,
  );
  assert.equal(enMethod.status, 405);
  assert.equal(((await enMethod.json()) as { error: string }).error, "Method not allowed.");

  const enArena = await worker.fetch(
    new Request(origin + "/api/arena", { headers: { "Accept-Language": "en" } }),
    env,
  );
  assert.equal(enArena.status, 503);
  assert.match(((await enArena.json()) as { error: string }).error, /D1/i);
});
