import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { management, arenaSnapshot, matchConfig } from "../server/management";
import { onRequest as authFunction } from "../functions/api/auth/[[path]]";
import { authRoute, hash, session } from "../server/auth";
import { loadArena, type Env } from "../server/store";
import {
  validateArena,
  defaultArena,
  rosterSignature,
  teamLogo,
  validMatchId,
  freshSchedule,
} from "../src/arena/model";
import { vetoDone, vetoMaps, moveVeto } from "../src/arena/veto";
import {
  aggregateMaps,
  normalizeEvent,
  parseBindings,
} from "../server/matchzy";
import { matchRating } from "../src/tournament/liveTypes";
import { resolvedBindings } from "../server/live";
import { assignOpeningTeam } from "../src/tournament/opening";
import { accessFor, canReady, canManageTeam, canJoinServer } from "../src/arena/permissions";
import { saveRuntime } from "../server/opsStore";
const origin = "https://arena.test";
function setup() {
  const db = new DatabaseSync(":memory:");
  for (const name of [
    "0001_matchzy.sql",
    "0002_management.sql",
    "0004_operations.sql",
  ])
    db.exec(
      readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"),
    );
  const env: Env = {
    PUBLIC_ORIGIN: origin,
    ADMIN_PASSWORD: "test-only-admin-password",
    MATCHZY_WEBHOOK_SECRET: "test-only-webhook-secret-not-production",
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        const stmt = db.prepare(sql);
        return {
          bind(...args: unknown[]) {
            values = args;
            return this;
          },
          async run() {
            return stmt.run(...(values as never[]));
          },
          async all<T>() {
            return { results: stmt.all(...(values as never[])) as T[] };
          },
        };
      },
    },
  };
  return { env, db };
}
function request(
  path = "/api/arena",
  cookie = "",
  data?: unknown,
  source = origin,
) {
  return new Request(origin + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Cookie: cookie,
      Origin: source,
      "Content-Type": "application/json",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function login(env: Env) {
  const r = await authRoute(
    request("/api/auth/admin", "", { password: env.ADMIN_PASSWORD }),
    env,
    "admin",
  );
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie")!.split(";")[0];
}
async function player(env: Env, steamId: string, verified = true) {
  const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
  await env
    .DB!.prepare(
      "INSERT INTO arena_sessions(token_hash,role,steam_id,expires) VALUES(?,?,?,?)",
    )
    .bind(await hash(token), "player", steamId, Date.now() + 3600000)
    .run();
  // Role tests do not depend on Steam's optional public profile service.
  await env.DB!.prepare("INSERT OR IGNORE INTO arena_meta(key,value) VALUES(?,?)")
    .bind(`steam-profile:${steamId}`, JSON.stringify({ profile: null, attemptedAt: Date.now(), nextRefreshAt: Date.now() + 300000 })).run();
  if (verified)
    await env
      .DB!.prepare(
        "INSERT OR IGNORE INTO steam_users(steam_id,verified_at) VALUES(?,?)",
      )
      .bind(steamId, Date.now())
      .run();
  return `arena_session=${token}`;
}
async function assignSteam(env: Env, admin: string) {
  const record = await loadArena(env);
  let n = 0;
  for (const t of record.config.teams)
    for (const p of t.roster)
      p.steamId = String(76561198000000001n + BigInt(n++));
  assert.equal(
    (
      await management(
        request("/api/arena", admin, { action: "config", ...record }),
        env,
      )
    ).status,
    200,
  );
  return (await loadArena(env)).config;
}
async function readyMatch(env: Env, admin: string, id = "U1") {
  const config = await assignSteam(env, admin);
  if (id === "U5") {
    config.state.results.U1 = { status: "completed", score: [13, 8] };
    config.state.results.U2 = { status: "completed", score: [13, 8] };
    const { revision } = await loadArena(env);
    assert.equal(
      (
        await management(
          request("/api/arena", admin, { action: "config", config, revision }),
          env,
        )
      ).status,
      200,
    );
  }
  const ids = id === "U5" ? ["nova", "parallax"] : ["nova", "orbit"];
  const roster = ids.flatMap(
    (team) => config.teams.find((t) => t.id === team)!.roster,
  );
  const cookies = [];
  for (const p of roster) cookies.push(await player(env, p.steamId!));
  for (let i = 0; i < 10; i++) {
    assert.equal(
      (
        await management(
          request("/api/arena", cookies[i], {
            action: "ready",
            matchId: id,
            ready: true,
          }),
          env,
        )
      ).status,
      200,
    );
    if (i === 8)
      assert.equal((await arenaSnapshot(request(), env)).vetos.length, 0);
  }
  return { config, roster, cookies };
}
test("admin sessions are HttpOnly; cross-origin and unauthenticated writes are refused", async () => {
  const { env } = setup();
  assert.equal(
    (await management(request("/api/arena", "", { action: "config" }), env))
      .status,
    401,
  );
  assert.equal(
    (
      await authRoute(
        request(
          "/api/auth/admin",
          "",
          { password: env.ADMIN_PASSWORD },
          "https://evil.test",
        ),
        env,
        "admin",
      )
    ).status,
    403,
  );
  const cookie = await login(env);
  assert.equal((await session(request("/", cookie), env))?.role, "admin");
  const good = await authRoute(
    request("/api/auth/admin", "", { password: env.ADMIN_PASSWORD }),
    env,
    "admin",
  );
  assert.match(
    good.headers.get("set-cookie")!,
    /HttpOnly.*SameSite=Lax.*Secure/,
  );
  assert.equal(
    (
      await management(
        request(
          "/api/arena",
          cookie,
          { action: "config" },
          "https://evil.test",
        ),
        env,
      )
    ).status,
    403,
  );
  await authRoute(request("/api/auth/logout", cookie, {}), env, "logout");
  assert.equal(await session(request("/", cookie), env), null);
});
test("admin login throttles repeated failures", async () => {
  const { env } = setup();
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await authRoute(
          request("/api/auth/admin", "", { password: "wrong" }),
          env,
          "admin",
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await authRoute(
        request("/api/auth/admin", "", { password: env.ADMIN_PASSWORD }),
        env,
        "admin",
      )
    ).status,
    429,
  );
});
test("Steam OpenID uses authoritative verification, single-use state and rejects duplicate identity fields", async () => {
  const { env } = setup();
  async function callback(valid = true) {
    const start = await authRoute(
      request("/api/auth/steam/start"),
      env,
      "steam/start",
    );
    assert.equal(start.status, 302);
    const outbound = new URL(start.headers.get("location")!),
      returnTo = outbound.searchParams.get("openid.return_to")!,
      url = new URL(returnTo),
      cookie = start.headers.get("set-cookie")!.split(";")[0];
    for (const [k, v] of Object.entries({
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "id_res",
      "openid.op_endpoint": "https://steamcommunity.com/openid/login",
      "openid.return_to": returnTo,
      "openid.claimed_id":
        "https://steamcommunity.com/openid/id/76561198000000001",
      "openid.identity":
        "https://steamcommunity.com/openid/id/76561198000000001",
      "openid.response_nonce":
        new Date().toISOString().replace(/\.\d{3}Z$/, "Z") + "unique",
      "openid.assoc_handle": "test-association",
      "openid.sig": "test-signature",
      "openid.signed":
        "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    }))
      url.searchParams.set(k, v);
    let calls = 0, profileCalls = 0;
    const fetcher = async (input: RequestInfo | URL, options?: RequestInit) => {
      if (String(input) === "https://steamcommunity.com/profiles/76561198000000001/?xml=1") {
        profileCalls++;
        return new Response("<profile><steamID64>76561198000000001</steamID64><steamID><![CDATA[Steam Persona]]></steamID></profile>");
      }
      calls++;
      assert.equal(String(input), "https://steamcommunity.com/openid/login");
      assert.equal(
        (options?.body as URLSearchParams).get("openid.mode"),
        "check_authentication",
      );
      return new Response(
        `ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n`,
      );
    };
    return {
      url,
      cookie,
      fetcher,
      get calls() {
        return calls;
      },
      get profileCalls() { return profileCalls; },
    };
  }
  const verified = await callback();
  const response = await authRoute(
    request(verified.url.pathname + verified.url.search, verified.cookie),
    env,
    "steam/callback",
    verified.fetcher as typeof fetch,
  );
  assert.equal(response.status, 302);
  const token = response.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await session(request("/", token), env))?.steamId,
    "76561198000000001",
  );
  assert.equal(verified.calls, 1);
  assert.equal(verified.profileCalls, 1);
  assert.equal((await session(request("/", token), env))?.profile?.name, "Steam Persona");
  assert.equal(
    (
      await authRoute(
        request(verified.url.pathname + verified.url.search, verified.cookie),
        env,
        "steam/callback",
        verified.fetcher as typeof fetch,
      )
    ).status,
    401,
  );
  const invalid = await callback(false);
  assert.equal(
    (
      await authRoute(
        request(invalid.url.pathname + invalid.url.search, invalid.cookie),
        env,
        "steam/callback",
        invalid.fetcher as typeof fetch,
      )
    ).status,
    401,
  );
  const duplicate = await callback();
  duplicate.url.searchParams.append(
    "openid.claimed_id",
    "https://steamcommunity.com/openid/id/76561198000000002",
  );
  assert.equal(
    (
      await authRoute(
        request(
          duplicate.url.pathname + duplicate.url.search,
          duplicate.cookie,
        ),
        env,
        "steam/callback",
        duplicate.fetcher as typeof fetch,
      )
    ).status,
    401,
  );
  assert.equal(duplicate.calls, 0);
});
test("a typed SteamID is not verification; outsiders cannot mark other players ready", async () => {
  const { env } = setup(),
    admin = await login(env),
    config = await assignSteam(env, admin),
    p = config.teams[0].roster[0];
  const unverified = await player(env, p.steamId!, false);
  assert.equal(
    (
      await management(
        request("/api/arena", unverified, {
          action: "ready",
          matchId: "U1",
          ready: true,
        }),
        env,
      )
    ).status,
    403,
  );
  const outsider = await player(env, "76561198999999999");
  assert.equal(
    (
      await management(
        request("/api/arena", outsider, {
          action: "ready",
          matchId: "U1",
          ready: true,
          playerId: p.id,
        }),
        env,
      )
    ).status,
    403,
  );
  const actual = await player(env, p.steamId!);
  assert.equal(
    (
      await management(
        request("/api/arena", actual, {
          action: "ready",
          matchId: "U1",
          ready: true,
          playerId: "somebody-else",
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    (await arenaSnapshot(request(), env)).readies[0].player_id,
    p.id,
  );
});
test("ten verified ready players start veto; captain authorization and CAS protect moves", async () => {
  const { env } = setup(),
    admin = await login(env),
    { cookies } = await readyMatch(env, admin);
  assert.equal((await arenaSnapshot(request(), env)).vetos[0].rehearsal, false);
  assert.equal(
    (
      await management(
        request("/api/arena", cookies[1], {
          action: "move",
          matchId: "U1",
          map: "Mirage",
          revision: 0,
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await management(
        request("/api/arena", cookies[5], {
          action: "move",
          matchId: "U1",
          map: "Mirage",
          revision: 0,
        }),
        env,
      )
    ).status,
    403,
  );
  const racing = await Promise.all(
    ["Mirage", "Nuke"].map((map) =>
      management(
        request("/api/arena", cookies[0], {
          action: "move",
          matchId: "U1",
          map,
          revision: 0,
        }),
        env,
      ),
    ),
  );
  assert.deepEqual(racing.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await arenaSnapshot(request(), env)).vetos[0].actions.length,
    1,
  );
});
test("standard BO3 veto emits ordered maplist and SteamID-keyed forced names", async () => {
  const { env } = setup(),
    admin = await login(env),
    { cookies, config } = await readyMatch(env, admin, "U5");
  for (const [i, map] of [
    "Mirage",
    "Inferno",
    "Nuke",
    "Dust2",
    "Ancient",
    "Anubis",
  ].entries())
    assert.equal(
      (
        await management(
          request("/api/arena", cookies[i % 2 === 0 ? 0 : 5], {
            action: "move",
            matchId: "U5",
            map,
            revision: i,
          }),
          env,
        )
      ).status,
      200,
    );
  const veto = (await arenaSnapshot(request(), env)).vetos[0];
  assert.ok(vetoDone(veto));
  assert.deepEqual(vetoMaps(veto), ["Nuke", "Dust2", "Vertigo"]);
  const output = await (
    await matchConfig(request("/api/match-config?match=U5", admin), env)
  ).json();
  assert.deepEqual(output.maplist, ["de_nuke", "de_dust2", "de_vertigo"]);
  assert.equal(output.num_maps, 3);
  assert.equal(output.clinch_series, true);
  const nova = config.teams.find((t) => t.id === "nova")!;
  const p = nova.roster[0];
  assert.equal(output.team1.players[p.steamId!], `${nova.tag} | ${p.name}`);
  const revision = (await loadArena(env)).revision;
  assert.equal(
    (
      await management(
        request("/api/arena", admin, {
          action: "result",
          matchId: "U5",
          revision,
          result: { status: "live", score: [1, 0] },
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal((await arenaSnapshot(request(), env)).vetos.length, 1);
  assert.equal(
    (await matchConfig(request("/api/match-config?match=U5", admin), env))
      .status,
    200,
  );
  assert.equal(
    JSON.stringify(output).includes(env.MATCHZY_WEBHOOK_SECRET!),
    false,
  );
  assert.equal(
    (await matchConfig(request("/api/match-config?match=U5"), env)).status,
    401,
  );
});
test("rehearsal never produces real match config or webhook binding", async () => {
  const { env } = setup(),
    admin = await login(env);
  const record = await loadArena(env);
  record.config.rehearsal = true;
  assert.equal(
    (
      await management(
        request("/api/arena", admin, { action: "config", ...record }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await management(
        request("/api/arena", admin, { action: "rehearse", matchId: "U1" }),
        env,
      )
    ).status,
    200,
  );
  let v = (await arenaSnapshot(request(), env)).vetos[0];
  for (const map of ["Mirage", "Inferno", "Nuke", "Dust2", "Ancient", "Anubis"])
    v = moveVeto(v, map, "admin");
  await env
    .DB!.prepare("UPDATE match_veto SET state=?,revision=? WHERE match_id=?")
    .bind(JSON.stringify(v), v.revision, "U1")
    .run();
  assert.equal(
    (await matchConfig(request("/api/match-config?match=U1", admin), env))
      .status,
    422,
  );
  assert.deepEqual(await resolvedBindings(env), {});
});
const logo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XkAAAAASUVORK5CYII=";
test("captains edit only their own branding without changing roster, readiness or veto", async () => {
  const { env } = setup(),
    admin = await login(env);
  const { cookies } = await readyMatch(env, admin);
  const before = await arenaSnapshot(request(), env);
  const payload = {
    action: "team-profile",
    teamId: "nova",
    revision: before.revision,
    name: "Among Legends",
    tag: "AMG",
    logo,
    roster: [],
    seed: 7,
    captainId: "outsider",
    state: {},
  };
  assert.equal(
    (await management(request("/api/arena", cookies[1], payload), env)).status,
    403,
  );
  assert.equal(
    (await management(request("/api/arena", cookies[5], payload), env)).status,
    403,
  );
  assert.equal(
    (await management(request("/api/arena", cookies[0], payload), env)).status,
    200,
  );
  const after = await arenaSnapshot(request(), env);
  assert.equal(after.config.teams[0].name, "Among Legends");
  assert.equal(after.config.teams[0].logo, logo);
  assert.equal(after.config.teams[0].seed, before.config.teams[0].seed);
  assert.equal(rosterSignature(after.config), rosterSignature(before.config));
  assert.deepEqual(after.readies, before.readies);
  assert.deepEqual(after.vetos, before.vetos);
  assert.equal(
    (await management(request("/api/arena", cookies[0], payload), env)).status,
    409,
  );
  assert.equal(
    (
      await management(
        request("/api/arena", admin, {
          ...payload,
          revision: after.revision,
          logo: null,
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal((await loadArena(env)).config.teams[0].logo, null);
});
test("force start is admin-only, confirms readiness bypass, requires SteamIDs and produces real match config", async () => {
  const { env } = setup(),
    admin = await login(env);
  const payload = { action: "force-veto", matchId: "U1", confirm: true };
  assert.equal(
    (await management(request("/api/arena", admin, payload), env)).status,
    422,
  );
  const config = await assignSteam(env, admin);
  const captain = await player(env, config.teams[0].roster[0].steamId!);
  assert.equal(
    (await management(request("/api/arena", captain, payload), env)).status,
    403,
  );
  assert.equal(
    (
      await management(
        request("/api/arena", admin, { ...payload, confirm: false }),
        env,
      )
    ).status,
    409,
  );
  assert.equal(
    (await management(request("/api/arena", admin, payload), env)).status,
    200,
  );
  const started = await arenaSnapshot(request(), env);
  assert.deepEqual(started.readies, []);
  assert.equal(started.verified.length, 1);
  assert.equal(started.vetos[0].forced, true);
  assert.equal(started.vetos[0].rehearsal, false);
  assert.equal(
    (await management(request("/api/arena", admin, payload), env)).status,
    409,
  );
  assert.equal(
    (await matchConfig(request("/api/match-config?match=U1", admin), env))
      .status,
    422,
  );
  for (const [i, map] of [
    "Mirage",
    "Inferno",
    "Nuke",
    "Dust2",
    "Ancient",
    "Anubis",
  ].entries())
    assert.equal(
      (
        await management(
          request("/api/arena", admin, {
            action: "move",
            matchId: "U1",
            map,
            revision: i,
          }),
          env,
        )
      ).status,
      200,
    );
  const response = await matchConfig(
    request("/api/match-config?match=U1", admin),
    env,
  );
  assert.equal(response.status, 200);
  const match = await response.json();
  assert.deepEqual(match.maplist, ["de_vertigo"]);
  assert.equal(Object.keys(match.team1.players).length, 5);
  assert.equal(match.min_players_to_ready, 5);
  assert.equal(validMatchId(String(match.matchid)), true);
  assert.equal(Object.keys(await resolvedBindings(env)).length, 1);
});
test("raster logos are bounded; legacy default brand migrates without losing tournament data", () => {
  const config = defaultArena();
  assert.equal(config.title, "Among Us!");
  assert.equal(config.rehearsal, false);
  assert.ok(
    Object.values(config.schedule).every((s) => validMatchId(s.externalId)),
  );
  const fresh = freshSchedule(config.schedule);
  assert.ok(
    Object.values(fresh).every(
      (s) =>
        validMatchId(s.externalId) &&
        !Object.values(config.schedule).some(
          (old) => old.externalId === s.externalId,
        ),
    ),
  );
  config.title = "KAMPÜS ARENA";
  config.teams[0].logo = logo;
  assert.equal(validateArena(config).title, "Among Us!");
  assert.equal(validateArena(config).teams[0].logo, logo);
  for (const invalid of [
    "https://other.test/logo.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,SGVsbG8=",
    "data:image/png;base64," + "A".repeat(90000),
  ])
    assert.throws(() => teamLogo(invalid));
});
test("unused legacy match IDs migrate to MatchZy range, while active and legacy webhook setups keep their IDs", async () => {
  for (const activity of ["none", "ready", "legacy"] as const) {
    const { env, db } = setup();
    const config = defaultArena();
    config.title = "KAMPÜS ARENA";
    config.schedule.U2.maps = ["Nuke"];
    for (const [i, s] of Object.values(config.schedule).entries())
      s.externalId = String(1793788800000 + i);
    db.prepare(
      "INSERT INTO arena_config(id,revision,config) VALUES(1,1,?)",
    ).run(JSON.stringify(config));
    if (activity === "ready")
      db.prepare(
        "INSERT INTO match_ready(match_id,player_id,expires) VALUES('U1','nova-1',?)",
      ).run(Date.now() + 10000);
    if (activity === "legacy") env.MATCHZY_BINDINGS = "{}";
    const loaded = await loadArena(env);
    assert.equal(loaded.config.title, "Among Us!");
    if (activity === "none") {
      assert.equal(loaded.revision, 2);
      assert.ok(
        Object.values(loaded.config.schedule).every((s) =>
          validMatchId(s.externalId),
        ),
      );
      assert.deepEqual(loaded.config.teams, config.teams);
      assert.deepEqual(loaded.config.schedule.U2.maps, ["Nuke"]);
    } else {
      assert.equal(loaded.revision, 1);
      assert.equal(
        loaded.config.schedule.U1.externalId,
        config.schedule.U1.externalId,
      );
    }
  }
});
test("roster edits preserve frozen active lineups; structural changes still require reset", async () => {
  const { env } = setup(),
    admin = await login(env);
  await readyMatch(env, admin);
  let r = await loadArena(env);
  r.config.teams[0].roster[0].name = "New Site Name";
  assert.equal(
    (
      await management(
        request("/api/arena", admin, { action: "config", ...r }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await management(
        request("/api/arena", admin, { action: "config", ...r }),
        env,
      )
    ).status,
    409,
  );
  r = await loadArena(env);
  r.config.teams[0].captainId = r.config.teams[0].roster[1].id;
  const blocked = await management(
    request("/api/arena", admin, { action: "config", ...r }),
    env,
  );
  assert.equal(blocked.status, 200);
  const frozen = await arenaSnapshot(request(), env);
  assert.equal(frozen.runtimes.U1.teams![0].captainId, "nova-1");
  assert.equal(frozen.vetos.length, 1);
  r = await loadArena(env);
  [r.config.teams[0].seed, r.config.teams[1].seed] = [
    r.config.teams[1].seed,
    r.config.teams[0].seed,
  ];
  const structural = await management(
    request("/api/arena", admin, { action: "config", ...r }),
    env,
  );
  assert.equal(structural.status, 409);
  assert.equal((await structural.json()).requiresReset, true);
  assert.equal(
    (
      await management(
        request("/api/arena", admin, {
          action: "config",
          ...r,
          resetTournament: true,
        }),
        env,
      )
    ).status,
    200,
  );
  const snap = await arenaSnapshot(request(), env);
  assert.equal(snap.vetos.length, 0);
  assert.equal(snap.readies.length, 0);
  assert.equal(Object.keys(snap.state.results).length, 0);
  env.MATCHZY_BINDINGS = JSON.stringify({
    27: { matchId: "U1", team1: "nova", team2: "orbit", maps: ["Nuke"] },
  });
  assert.deepEqual(await resolvedBindings(env), {});
  const duplicate = structuredClone(snap.config);
  duplicate.teams[1].roster[0].steamId = duplicate.teams[0].roster[0].steamId;
  assert.throws(() => validateArena(duplicate));
});
test("damage and Arena rating aggregate player rounds within this match only", () => {
  const bindings = parseBindings(
    JSON.stringify({
      27: {
        matchId: "U5",
        team1: "nova",
        team2: "parallax",
        maps: ["Mirage", "Inferno", "Nuke"],
      },
    }),
  );
  const payload = (map: number) => ({
    event: "map_result",
    matchid: 27,
    map_number: map,
    team1: {
      score: 13,
      players: [
        {
          steamid: "76561198000000001",
          name: "Player",
          stats: {
            kills: 20,
            deaths: 10,
            assists: 3,
            headshot_kills: 10,
            damage: 1800,
            rounds_played: 20,
          },
        },
      ],
    },
    team2: { score: 8, players: [] },
  });
  const a = normalizeEvent(payload(0), bindings)!,
    b = normalizeEvent(payload(1), bindings)!;
  const result = aggregateMaps([a, b], bindings["27"])!;
  assert.equal(result.players[0].damage, 3600);
  assert.equal(result.players[0].roundsPlayed, 40);
  assert.equal(matchRating(result.players[0])?.toFixed(2), "1.35");
  assert.equal(matchRating({ ...result.players[0], damage: undefined }), null);
  assert.equal(aggregateMaps([{ ...a, matchId: "U6" }], bindings["27"]), null);
});

test("admin saves chosen first-round opponents and MatchZy uses those exact teams and Steam rosters", async () => {
  const { env } = setup(),
    admin = await login(env);
  await assignSteam(env, admin);
  const record = await loadArena(env),
    oldIds = Object.fromEntries(
      Object.entries(record.config.schedule).map(([id, s]) => [
        id,
        s.externalId,
      ]),
    );
  record.config.teams = assignOpeningTeam(record.config.teams, "parallax", 8);
  assert.equal(
    (
      await management(
        request("/api/arena", admin, { action: "config", ...record }),
        env,
      )
    ).status,
    200,
  );
  const snapshot = await arenaSnapshot(request("/api/arena", admin), env);
  assert.equal(snapshot.config.teams.find((t) => t.id === "parallax")?.seed, 8);
  assert.equal(snapshot.config.teams.find((t) => t.id === "orbit")?.seed, 4);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(snapshot.config.schedule).map(([id, s]) => [
        id,
        s.externalId,
      ]),
    ),
    oldIds,
  );
  assert.equal(
    (
      await management(
        request("/api/arena", admin, {
          action: "force-veto",
          matchId: "U1",
          confirm: true,
        }),
        env,
      )
    ).status,
    200,
  );
  for (const map of [
    "Mirage",
    "Inferno",
    "Nuke",
    "Dust2",
    "Ancient",
    "Anubis",
  ]) {
    const veto = (await arenaSnapshot(request(), env)).vetos.find(
      (v) => v.matchId === "U1",
    )!;
    assert.equal(
      (
        await management(
          request("/api/arena", admin, {
            action: "move",
            matchId: "U1",
            revision: veto.revision,
            map,
          }),
          env,
        )
      ).status,
      200,
    );
  }
  const response = await matchConfig(
    request("/api/match-config?match=U1", admin),
    env,
  );
  assert.equal(response.status, 200);
  const file = await response.json();
  assert.equal(file.team1.id, "nova");
  assert.equal(file.team2.id, "parallax");
  assert.deepEqual(
    Object.keys(file.team2.players),
    snapshot.config.teams
      .find((t) => t.id === "parallax")!
      .roster.map((p) => p.steamId),
  );
  const binding = (await resolvedBindings(env))[
    snapshot.config.schedule.U1.externalId
  ];
  assert.equal(binding.team1, "nova");
  assert.equal(binding.team2, "parallax");
});

test("browser snapshots hide global accounts, server settings, Steam rosters and rehearsal from visitors", async () => {
  const { env } = setup(), admin = await login(env);
  await assignSteam(env, admin);
  const record = await loadArena(env);
  record.config.server = { address: "match.example.test:27015", dathostServerId: "a".repeat(24) };
  record.config.rehearsal = true;
  await management(request("/api/arena", admin, { action: "config", ...record }), env);
  await management(request("/api/arena", admin, { action: "rehearse", matchId: "U1" }), env);
  const visitor = await (await management(request(), env)).json();
  assert.equal(visitor.config.server.address, "");
  assert.equal(visitor.config.server.dathostServerId, "");
  assert.equal(visitor.config.rehearsal, false);
  assert.deepEqual(visitor.verified, []);
  assert.deepEqual(visitor.vetos, []);
  assert.ok(visitor.config.teams.every((t: { roster: { steamId: string | null }[] }) => t.roster.every((p) => p.steamId === null)));
  assert.doesNotThrow(() => validateArena(visitor.config));
  const captainId = record.config.teams[0].roster[0].steamId!;
  const captain = await player(env, captainId);
  const own = await (await management(request("/api/arena", captain), env)).json();
  assert.equal(own.config.server.address, "match.example.test:27015");
  assert.equal(own.config.server.dathostServerId, "");
  assert.deepEqual(own.config.teams.flatMap((t: { roster: { steamId: string | null }[] }) => t.roster.map((p) => p.steamId)).filter(Boolean), [captainId]);
  assert.deepEqual(own.verified.map((v: { steam_id: string }) => v.steam_id), [captainId]);
  assert.ok(own.verifiedPlayerIds.includes(record.config.teams[0].roster[0].id));
  const operator = await (await management(request("/api/arena", admin), env)).json();
  assert.equal(operator.config.server.dathostServerId, "a".repeat(24));
  assert.equal(operator.vetos.length, 1);
  assert.ok(operator.config.teams[0].roster[1].steamId);
  assert.equal((await arenaSnapshot(request(), env)).vetos.length, 1, "internal snapshot keeps operational data");
});

test("player and captain cannot invoke management actions or operate admin rehearsals", async () => {
  const { env } = setup(), admin = await login(env);
  const config = await assignSteam(env, admin);
  const captain = await player(env, config.teams[0].roster[0].steamId!);
  const member = await player(env, config.teams[0].roster[1].steamId!);
  for (const cookie of [captain, member]) {
    for (const action of ["config", "result", "follow-api", "reset-veto", "force-veto", "rehearse"])
      assert.equal((await management(request("/api/arena", cookie, { action, matchId: "U1" }), env)).status, 403, action);
  }
  const record = await loadArena(env);
  record.config.rehearsal = true;
  await management(request("/api/arena", admin, { action: "config", ...record }), env);
  await management(request("/api/arena", admin, { action: "rehearse", matchId: "U1" }), env);
  assert.equal((await management(request("/api/arena", captain, { action: "move", matchId: "U1", revision: 0, map: "Mirage" }), env)).status, 403);
  assert.equal((await management(request("/api/arena", admin, { action: "ready", matchId: "U1", ready: true }), env)).status, 403);
});

test("shared access policy derives captain and player rights from the saved roster", () => {
  const config = defaultArena();
  config.teams[0].roster[0].steamId = "76561198000000001";
  config.teams[0].roster[1].steamId = "76561198000000002";
  const captain = { role: "player" as const, steamId: "76561198000000001" };
  const member = { role: "player" as const, steamId: "76561198000000002" };
  const outsider = { role: "player" as const, steamId: "76561198000000003" };
  assert.equal(accessFor(config, null).role, "visitor");
  assert.equal(accessFor(config, outsider).role, "visitor");
  assert.equal(accessFor(config, captain).role, "captain");
  assert.equal(accessFor(config, member).role, "player");
  assert.equal(accessFor(config, { role: "admin" }).role, "admin");
  assert.equal(canReady({ role: "admin", steamId: captain.steamId }, config.teams[0]), false);
  assert.equal(canManageTeam(captain, config.teams[0]), true);
  assert.equal(canManageTeam(captain, config.teams[1]), false);
  assert.equal(canManageTeam(member, config.teams[0]), false);
  assert.equal(canJoinServer(config, outsider), false);
  assert.equal(canJoinServer(config, member), true);
});

test("roster replacements do not inherit frozen verification, readiness or captain powers", async () => {
  const { env } = setup(), admin = await login(env);
  const { cookies, config } = await readyMatch(env, admin);
  const oldCaptain = cookies[0], currentCaptain = cookies[1];
  const record = await loadArena(env);
  const replacedId = record.config.teams[0].roster[0].id;
  record.config.teams[0].roster[0].steamId = "76561198999999999";
  record.config.teams[0].captainId = record.config.teams[0].roster[1].id;
  record.config.server = { address: "match.example.test:27015", dathostServerId: "a".repeat(24) };
  assert.equal((await management(request("/api/arena", admin, { action: "config", ...record }), env)).status, 200);

  const replacement = await player(env, "76561198999999999", false);
  const visitor = await (await management(request(), env)).json();
  assert.ok(!visitor.verifiedPlayerIds.includes(replacedId), "new current account is unverified");
  assert.ok(visitor.runtimes.U1.verifiedPlayerIds.includes(replacedId), "frozen original account stays verified");
  assert.equal(visitor.runtimes.U1.teams[0].roster[0].steamId, null);
  const replacementView = await (await management(request("/api/arena", replacement), env)).json();
  assert.equal(replacementView.runtimes.U1.teams[0].roster[0].steamId, null, "replacement cannot acquire original Steam identity");
  assert.equal((await management(request("/api/arena", replacement, { action: "ready", matchId: "U1", ready: true, playerId: replacedId }), env)).status, 403);
  assert.equal((await management(request("/api/arena", replacement, { action: "move", matchId: "U1", revision: 0, map: "Mirage" }), env)).status, 403);
  assert.equal((await management(request("/api/arena", currentCaptain, { action: "move", matchId: "U1", revision: 0, map: "Mirage" }), env)).status, 403, "current captain cannot take over frozen captain's veto");

  const profile = { action: "team-profile", teamId: "nova", revision: record.revision + 1, name: "Güncel Takım", tag: "GNC", logo: null };
  assert.equal((await management(request("/api/arena", oldCaptain, profile), env)).status, 403, "frozen captain cannot edit current team profile");
  assert.equal((await management(request("/api/arena", currentCaptain, profile), env)).status, 200);
  assert.equal((await management(request("/api/arena", oldCaptain, { action: "move", matchId: "U1", revision: 0, map: "Mirage" }), env)).status, 200);
  const oldView = await (await management(request("/api/arena", oldCaptain), env)).json();
  assert.equal(oldView.config.server.address, "match.example.test:27015", "active frozen participant retains connection access");
  assert.equal(canJoinServer(oldView.config, oldView.me, oldView.runtimes), true);
  assert.equal(oldView.runtimes.U1.teams[0].roster[0].steamId, config.teams[0].roster[0].steamId);

  const frozen = (await arenaSnapshot(request(), env)).runtimes.U1;
  await saveRuntime(env, { ...frozen, phase: "completed" });
  const former = await (await management(request("/api/arena", oldCaptain), env)).json();
  assert.equal(former.config.server.address, "", "completed historical participation grants no current connection access");
  assert.equal(canJoinServer(former.config, former.me, former.runtimes), false);
});

test("published completion revokes former participant access despite a stale active runtime", async () => {
  const { env } = setup(), admin = await login(env);
  const { cookies } = await readyMatch(env, admin);
  const record = await loadArena(env);
  record.config.teams[0].roster[0].steamId = "76561198999999999";
  record.config.server = { address: "match.example.test:27015", dathostServerId: "a".repeat(24) };
  record.config.state.results.U1 = { status: "completed", score: [13, 8] };
  assert.equal((await management(request("/api/arena", admin, { action: "config", ...record }), env)).status, 200);
  assert.equal((await arenaSnapshot(request(), env)).runtimes.U1.phase, "veto", "internal server phase remains unchanged");
  const former = await (await management(request("/api/arena", cookies[0]), env)).json();
  assert.equal(former.config.server.address, "");
  assert.equal(former.runtimes.U1.phase, "completed");
  assert.equal(canJoinServer(former.config, former.me, former.runtimes), false);
  const operator = await (await management(request("/api/arena", admin), env)).json();
  assert.equal(operator.runtimes.U1.phase, "veto", "admin can still inspect the actual last server phase");
});

test("matchConfig rejects short webhook secrets, prototype matchId returns 404, and malformed auth JSON returns 400", async () => {
  const { env } = setup();
  const admin = await login(env);
  const shortEnv = { ...env, MATCHZY_WEBHOOK_SECRET: "short-secret" };
  const badConfig = await matchConfig(
    new Request(origin + "/api/match-config?match=U1", {
      headers: { Authorization: "Bearer short-secret" },
    }),
    shortEnv,
  );
  assert.equal(badConfig.status, 401);
  assert.equal(
    (
      await management(
        request("/api/arena", admin, { action: "reset-veto", matchId: "toString" }),
        env,
      )
    ).status,
    404,
  );
  const badJson = await authFunction({
    request: new Request(origin + "/api/auth/admin", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: "{not-json",
    }),
    env,
    params: { path: "admin" },
  });
  assert.equal(badJson.status, 400);
});
