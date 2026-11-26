import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { cachedSteamProfile, parseSteamProfile, refreshSteamProfile, steamAvatar } from "../server/steamProfile";
import { authRoute, hash, session } from "../server/auth";
import { management } from "../server/management";
import type { Env } from "../server/store";

const steamId = "76561198000000001";
const otherId = "76561198000000002";
const origin = "https://profile.test";
const avatar = `https://avatars.cloudflare.steamstatic.com/${"a".repeat(40)}_full.jpg`;
const profileXml = (id = steamId, name = "Steam &amp; Name", image = avatar) =>
  `<profile><steamID64>${id}</steamID64><steamID>${name}</steamID><avatarFull><![CDATA[${image}]]></avatarFull></profile>`;
function setup() {
  const db = new DatabaseSync(":memory:");
  for (const name of ["0001_matchzy.sql", "0002_management.sql", "0004_operations.sql"])
    db.exec(readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"));
  const env: Env = {
    PUBLIC_ORIGIN: origin,
    DB: {
      prepare(sql: string) {
        const stmt = db.prepare(sql);
        let values: unknown[] = [];
        return {
          bind(...args: unknown[]) { values = args; return this; },
          async run() { return stmt.run(...values as never[]); },
          async all<T>() { return { results: stmt.all(...values as never[]) as T[] }; },
        };
      },
    },
  };
  const request = (cookie = "", data?: unknown, source = origin, path = "/api/auth/steam/profile") =>
    new Request(origin + path, {
      method: data === undefined ? "GET" : "POST",
      headers: { Origin: source, Cookie: cookie, "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const login = async (role: "admin" | "player" = "player", id = steamId) => {
    const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
    db.prepare("INSERT INTO arena_sessions(token_hash,role,steam_id,expires) VALUES(?,?,?,?)")
      .run(await hash(token), role, role === "player" ? id : null, Date.now() + 3600000);
    return `arena_session=${token}`;
  };
  const expire = () => {
    const row = db.prepare("SELECT value FROM arena_meta WHERE key=?").get(`steam-profile:${steamId}`) as { value: string };
    const value = JSON.parse(row.value);
    value.attemptedAt = Date.now() - 7 * 3600000;
    value.nextRefreshAt = Date.now() - 1;
    db.prepare("UPDATE arena_meta SET value=? WHERE key=?").run(JSON.stringify(value), `steam-profile:${steamId}`);
  };
  return { env, db, request, login, expire };
}

test("Steam public XML preserves display names, removes control characters and accepts only Steam avatar CDNs", () => {
  assert.deepEqual(parseSteamProfile(profileXml(), steamId), { name: "Steam & Name", avatar });
  assert.equal(parseSteamProfile(profileXml(steamId, "<![CDATA[  Ada\u202e  💫  ]]>") , steamId)?.name, "Ada 💫");
  assert.equal(parseSteamProfile(profileXml(steamId, "&#65;&#x64;a"), steamId)?.name, "Ada");
  assert.equal([...parseSteamProfile(profileXml(steamId, "💫".repeat(100)), steamId)!.name].length, 80);
  for (const url of ["http://avatars.steamstatic.com/a.jpg", "https://evil.test/avatar.jpg", "https://avatars.steamstatic.com.evil.test/" + "a".repeat(40) + ".jpg", "https://127.0.0.1/avatar.jpg", avatar + "?redirect=http://127.0.0.1", avatar.replace("https://", "https://user:password@")])
    assert.equal(steamAvatar(url), null, url);
  assert.equal(parseSteamProfile(profileXml(steamId, "Safe", "https://evil.test/avatar.jpg"), steamId)?.avatar, null);
  assert.equal(parseSteamProfile(profileXml(otherId), steamId), null);
  assert.equal(parseSteamProfile("<!DOCTYPE x [<!ENTITY secret SYSTEM 'file:///etc/passwd'>]>" + profileXml(), steamId), null);
  assert.equal(parseSteamProfile(profileXml(steamId, "<script>Bad</script>"), steamId), null);
  assert.equal(parseSteamProfile(profileXml(), "../private"), null);
});

test("profile lookups use one fixed endpoint, cache successful results and atomically throttle concurrent refreshes", async () => {
  const s = setup();
  let calls = 0;
  const fetcher: typeof fetch = async (input, options) => {
    calls++;
    assert.equal(String(input), `https://steamcommunity.com/profiles/${steamId}/?xml=1`);
    assert.equal(options?.method, "GET");
    assert.equal(options?.redirect, "manual");
    assert.ok(options?.signal);
    assert.equal(new Headers(options?.headers).has("Authorization"), false);
    return new Response(profileXml());
  };
  const results = await Promise.all(Array.from({ length: 5 }, () => refreshSteamProfile(s.env, steamId, { force: true, fetcher })));
  assert.equal(calls, 1);
  assert.equal(results.filter((r) => r.refreshed).length, 1);
  assert.deepEqual(await cachedSteamProfile(s.env, steamId), { name: "Steam & Name", avatar });
  await refreshSteamProfile(s.env, steamId, { fetcher });
  await refreshSteamProfile(s.env, steamId, { force: true, fetcher });
  await refreshSteamProfile(s.env, "https://evil.test", { force: true, fetcher });
  assert.equal(calls, 1);
  s.expire();
  const failed = await refreshSteamProfile(s.env, steamId, { fetcher: async () => { calls++; throw new Error("Offline"); } });
  assert.equal(failed.failed, true);
  assert.deepEqual(failed.profile, { name: "Steam & Name", avatar });
  assert.deepEqual(await cachedSteamProfile(s.env, steamId), failed.profile);
  await refreshSteamProfile(s.env, steamId, { fetcher });
  assert.equal(calls, 2, "failed metadata refresh is throttled during arena polling");
});

test("oversized, redirected and wrong-identity metadata never become a Steam profile", async () => {
  for (const response of [
    new Response(profileXml(), { headers: { "content-length": "999999" } }),
    new Response("x".repeat(128 * 1024 + 1)),
    new Response(profileXml(otherId)),
    new Response(null, { status: 302, headers: { Location: "https://evil.test" } }),
  ]) {
    const { env } = setup();
    const result = await refreshSteamProfile(env, steamId, { fetcher: async () => response });
    assert.equal(result.profile, null);
    assert.equal(result.failed, true);
    assert.equal(await cachedSteamProfile(env, steamId), null);
  }
});

test("own profile refresh requires a player session and same origin; supplied account IDs cannot redirect it", async () => {
  const s = setup(), cookie = await s.login(), admin = await s.login("admin");
  let calls = 0;
  const fetcher: typeof fetch = async (input) => {
    calls++;
    assert.equal(String(input), `https://steamcommunity.com/profiles/${steamId}/?xml=1`);
    return new Response(profileXml());
  };
  assert.equal((await authRoute(s.request(), s.env, "steam/profile", fetcher)).status, 405);
  assert.equal((await authRoute(s.request("", {}), s.env, "steam/profile", fetcher)).status, 403);
  assert.equal((await authRoute(s.request(admin, {}), s.env, "steam/profile", fetcher)).status, 403);
  assert.equal((await authRoute(s.request(cookie, {}, "https://other.test"), s.env, "steam/profile", fetcher)).status, 403);
  assert.equal(calls, 0);
  const result = await authRoute(s.request(cookie, { steamId: otherId, url: "http://127.0.0.1" }), s.env, "steam/profile", fetcher);
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).profile, { name: "Steam & Name", avatar });
  assert.equal((await session(s.request(cookie), s.env))?.profile?.name, "Steam & Name");
  assert.equal(s.db.prepare("SELECT count(*) n FROM steam_users").get()!.n, 0, "display metadata is not verification");
  s.expire();
  const failed = await authRoute(s.request(cookie, {}), s.env, "steam/profile", async () => { throw new Error("Offline"); });
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).profile.name, "Steam & Name");
  assert.equal((await session(s.request(cookie), s.env))?.steamId, steamId);
});

test("existing sessions populate their own Steam profile through arena polling without publishing other accounts", async () => {
  const s = setup(), own = await s.login(), other = await s.login("player", otherId);
  let calls = 0;
  const fetcher: typeof fetch = async (input) => {
    calls++;
    assert.equal(String(input), `https://steamcommunity.com/profiles/${steamId}/?xml=1`);
    return new Response(profileXml());
  };
  const get = (cookie: string) => management(s.request(cookie, undefined, origin, "/api/arena"), s.env, fetcher);
  const snapshot = await (await get(own)).json();
  assert.deepEqual(snapshot.me.profile, { name: "Steam & Name", avatar });
  assert.equal(snapshot.me.steamId, steamId);
  assert.equal(snapshot.me.role, "player");
  await get(own);
  assert.equal(calls, 1);
  assert.equal((await session(s.request(other), s.env))?.profile, undefined);
  const guest = await (await get("")).json();
  assert.equal(guest.me, null);
  assert.equal(JSON.stringify(guest).includes("Steam & Name"), false);
  assert.equal(calls, 1, "anonymous and session-only reads never fetch account metadata");
  assert.equal(s.db.prepare("SELECT count(*) n FROM steam_users").get()!.n, 0);
});

test("only an admin can list and refresh verified Steam registrations", async () => {
  const { db, env, request, login } = setup();
  const player = await login();
  const admin = await login("admin");
  const verifiedAt = Date.now();
  const list = "/api/arena?view=steam-accounts";
  const refresh = (cookie: string, id = steamId, source = origin) =>
    management(request(cookie, { action: "refresh-steam-account", steamId: id }, source, "/api/arena"), env, fetcher);
  let calls = 0;
  const fetcher: typeof fetch = async (url) => {
    calls++;
    assert.equal(String(url), `https://steamcommunity.com/profiles/${steamId}/?xml=1`);
    return new Response(profileXml(steamId, "abcd"));
  };
  db.prepare("INSERT INTO steam_users(steam_id,verified_at,game_name) VALUES(?,?,?)")
    .run(steamId, verifiedAt, "123 | eski");
  for (const cookie of ["", player])
    assert.equal((await management(request(cookie, undefined, origin, list), env, fetcher)).status, 403);
  assert.equal((await refresh(player)).status, 403);
  assert.equal((await refresh(admin, steamId, "https://other.test")).status, 403);
  assert.equal((await refresh(admin, otherId)).status, 404);
  assert.equal(calls, 0);

  assert.equal((await (await refresh(admin)).json()).refreshed, true);
  assert.equal((await (await refresh(admin)).json()).refreshed, false);
  const { accounts } = await (await management(request(admin, undefined, origin, list), env, fetcher)).json();
  assert.deepEqual(accounts, [{
    steam_id: steamId,
    verified_at: verifiedAt,
    game_name: "123 | eski",
    profile: { name: "abcd", avatar },
  }]);
  assert.equal(calls, 1);
});

test("admin site names are validated, independent from Steam profile refreshes and visible only to the account owner and admin", async () => {
  const s = setup();
  const own = await s.login();
  const other = await s.login("player", otherId);
  const admin = await s.login("admin");
  const path = "/api/arena";
  const list = path + "?view=steam-accounts";
  let steamName = "Steam ilk ad";
  const fetcher: typeof fetch = async () => new Response(profileXml(steamId, steamName));
  const rename = (cookie: string, name: unknown, id = steamId, source = origin) =>
    management(s.request(cookie, { action: "set-steam-display-name", steamId: id, displayName: name }, source, path), s.env, fetcher);
  const snapshot = async (cookie: string, url = path) =>
    (await management(s.request(cookie, undefined, origin, url), s.env, fetcher)).json();
  s.db.prepare("INSERT INTO steam_users(steam_id,verified_at) VALUES(?,?)").run(steamId, Date.now());

  assert.equal((await rename("", "abcd")).status, 401);
  assert.equal((await rename(own, "abcd")).status, 403);
  assert.equal((await rename(admin, "abcd", steamId, "https://other.test")).status, 403);
  assert.equal((await rename(admin, "abcd", otherId)).status, 404);
  for (const invalid of [undefined, "", " 	 ", "a".repeat(41), 'a"b']) {
    assert.equal((await rename(admin, invalid)).status, 422);
  }
  assert.deepEqual(await (await rename(admin, "  abcd  ")).json(), { displayName: "abcd" });
  const first = await snapshot(own);
  assert.equal(first.me.displayName, "abcd");
  assert.equal(first.me.profile.name, "Steam ilk ad");
  steamName = "Steam yeni ad";
  s.expire();
  const updated = await snapshot(own);
  assert.equal(updated.me.displayName, "abcd");
  assert.equal(updated.me.profile.name, "Steam yeni ad");
  const { accounts } = await snapshot(admin, list);
  assert.equal(accounts[0].displayName, "abcd");
  assert.equal(accounts[0].profile.name, "Steam yeni ad");
  assert.equal((await snapshot(other)).me.displayName, undefined);
  assert.equal((await snapshot("")).me, null);
  assert.deepEqual(await (await rename(admin, null)).json(), { displayName: null });
  assert.equal((await snapshot(own)).me.displayName, undefined);
});
