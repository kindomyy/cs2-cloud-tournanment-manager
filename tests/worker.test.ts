import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { type WorkerEnv } from "../server/worker";

function environment() {
  const requests: string[] = [];
  const env: WorkerEnv = {
    ASSETS: {
      async fetch(request) {
        requests.push(new URL(request.url).pathname);
        return new Response("<!doctype html>Among Us!", {
          headers: { "Content-Type": "text/html" },
        });
      },
    },
  };
  return { env, requests };
}
const origin = "https://cs2-tournanmentmanager.fierce-condor.workers.dev";
test("Workers serves site assets while API errors remain JSON instead of SPA HTML", async () => {
  const { env, requests } = environment();
  const site = await worker.fetch(new Request(origin + "/"), env);
  assert.match(await site.text(), /Among Us!/);
  for (const [path, expected] of [
    ["/api/arena", 503],
    ["/api/duels", 503],
    ["/api/duel-config", 401],
    ["/api/matches", 503],
    ["/api/match-config?match=U1", 401],
    ["/api/auth/steam/start", 503],
    ["/api/missing", 404],
    ["/api", 404],
  ] as const) {
    const response = await worker.fetch(new Request(origin + path), env);
    assert.equal(response.status, expected, path);
    assert.match(
      response.headers.get("content-type") || "",
      /application\/json/,
    );
    await response.json();
  }
  assert.deepEqual(requests, ["/"]);
});
test("Workers routes auth and webhook writes through existing guards, rejects writes to read-only API", async () => {
  const { env, requests } = environment();
  for (const [path, expected] of [
    ["/api/webhooks/matchzy", 503],
    ["/api/auth/admin", 503],
    ["/api/matches", 405],
    ["/api/match-config", 405],
  ] as const) {
    const response = await worker.fetch(
      new Request(origin + path, { method: "POST", body: "{}" }),
      env,
    );
    assert.equal(response.status, expected, path);
    assert.match(
      response.headers.get("content-type") || "",
      /application\/json/,
    );
    await response.json();
  }
  assert.deepEqual(requests, []);
});
test("Workers attaches security headers on HTML and API responses", async () => {
  const { env } = environment();
  const html = await worker.fetch(new Request(origin + "/"), env);
  assert.equal(html.headers.get("x-content-type-options"), "nosniff");
  assert.equal(html.headers.get("x-frame-options"), "DENY");
  assert.equal(html.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(html.headers.get("content-security-policy") || "", /default-src 'self'/);
  const api = await worker.fetch(new Request(origin + "/api/missing"), env);
  assert.equal(api.headers.get("x-content-type-options"), "nosniff");
  assert.equal(api.headers.get("x-frame-options"), "DENY");
});
