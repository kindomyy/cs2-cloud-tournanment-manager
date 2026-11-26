import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { authRoute, hash } from "../server/auth";
import {
  loadArena,
  saveArena,
  type Env,
  type Statement,
} from "../server/store";
import { operations } from "../server/operations";
import { controlServer, serverMatch, dathostRequest } from "../server/dathost";
import {
  exportBackup,
  validateBackup,
  restoreBackup,
  archivedBackup,
} from "../server/backups";
import { management, arenaSnapshot, matchConfig } from "../server/management";
import { webhook, liveMatches } from "../server/api";
import { runtimeFor, saveRuntime, freezeTeams } from "../server/opsStore";
import { moveVeto, type VetoState } from "../src/arena/veto";
import { rosterSignature, validateArena } from "../src/arena/model";
import {
  safeReturnPath,
  connectionAddress,
} from "../src/arena/schedule";
import { project } from "../src/tournament/engine";
import { tournamentResults } from "../src/tournament/results";
import { stateFromFeed } from "../src/tournament/liveState";
import { emptyState } from "../src/tournament/engine";
const origin = "https://arena.test",
  serverId = "6aeb4b88dfc88e8d331a5288";
function setup() {
  const db = new DatabaseSync(":memory:");
  for (const name of [
    "0001_matchzy.sql",
    "0002_management.sql",
    "0003_private_duels.sql",
    "0004_operations.sql",
  ])
    db.exec(
      readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"),
    );
  const env: Env = {
    PUBLIC_ORIGIN: origin,
    ADMIN_PASSWORD: "test-admin-password-only",
    MATCHZY_WEBHOOK_SECRET: "test-webhook-key-never-production",
    DATHOST_EMAIL: "test@example.test",
    DATHOST_PASSWORD: "test-dathost-password",
    DATHOST_SERVER_ID: serverId,
  };
  const handles = new WeakMap<Statement, () => unknown>();
  env.DB = {
    prepare(sql) {
      let values: unknown[] = [];
      const statement = db.prepare(sql);
      const execute = () =>
        statement.all(
          ...(values.map((v) =>
            v instanceof ArrayBuffer ? new Uint8Array(v) : v,
          ) as never[]),
        );
      const handle: Statement = {
        bind(...args) {
          values = args;
          return handle;
        },
        async run() {
          execute();
        },
        async all<T>() {
          return { results: execute() as T[] };
        },
      };
      handles.set(handle, execute);
      return handle;
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = statements.map((s) => handles.get(s)!());
        db.exec("COMMIT");
        return results;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { env, db };
}
function req(path: string, cookie = "", data?: unknown, source = origin) {
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
async function ready() {
  const { env, db } = setup();
  const login = await authRoute(
    req("/api/auth/admin", "", { password: env.ADMIN_PASSWORD }),
    env,
    "admin",
  );
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const record = await loadArena(env);
  let i = 0;
  for (const team of record.config.teams)
    for (const p of team.roster)
      p.steamId = String(76561198000000000n + BigInt(++i));
  record.config.legacyBindings = false;
  await saveArena(env, record.config, record.revision);
  return { env, db, cookie };
}
async function veto(env: Env, cookie: string, id = "U1") {
  assert.equal(
    (
      await management(
        req("/api/arena", cookie, {
          action: "force-veto",
          matchId: id,
          confirm: true,
        }),
        env,
      )
    ).status,
    200,
  );
  const row = await env
    .DB!.prepare("SELECT state FROM match_veto WHERE match_id=?")
    .bind(id)
    .all<{ state: string }>();
  let state = JSON.parse(row.results[0].state) as VetoState;
  for (const map of ["Mirage", "Inferno", "Nuke", "Dust2", "Ancient", "Anubis"])
    state = moveVeto(state, map, "admin");
  await env
    .DB!.prepare("UPDATE match_veto SET state=?,revision=? WHERE match_id=?")
    .bind(JSON.stringify(state), state.revision, id)
    .run();
  const r = await loadArena(env);
  await saveRuntime(env, {
    matchId: id,
    externalId: r.config.schedule[id].externalId,
    phase: "veto-complete",
    teams: freezeTeams([
      r.config.teams.find((t) => t.id === state.a)!,
      r.config.teams.find((t) => t.id === state.b)!,
    ]),
  });
  return r.config.schedule[id].externalId;
}
async function send(env: Env, data: unknown) {
  return webhook(
    new Request(origin + "/api/webhooks/matchzy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MATCHZY_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify(data),
    }),
    env,
  );
}
function event(id: string, a: number, b: number) {
  return {
    event: "round_end",
    matchid: Number(id),
    map_number: 0,
    team1: { score: a, players: [] },
    team2: { score: b, players: [] },
  };
}
test("join addresses and invitation return paths reject unsafe input", () => {
  assert.equal(safeReturnPath("https://evil.test"), "/#oyuncu");
  assert.equal(safeReturnPath("//evil.test"), "/#oyuncu");
  assert.equal(safeReturnPath("/#veto/U1"), "/#veto/U1");
  assert.equal(
    connectionAddress("server.dathost.net:27015"),
    "server.dathost.net:27015",
  );
  assert.throws(() => connectionAddress("host:27015;quit"));
  assert.throws(() => connectionAddress("host:99999"));
});
test("admin health separates configured secrets from a real DatHost check and never returns provider credentials", async () => {
  const { env, cookie } = await ready();
  assert.equal((await operations(req("/api/operations"), env)).status, 401);
  assert.equal(
    (
      await operations(
        req(
          "/api/operations",
          cookie,
          { action: "test-server" },
          "https://evil.test",
        ),
        env,
      )
    ).status,
    403,
  );
  let data = await (
    await operations(req("/api/operations", cookie), env)
  ).json();
  assert.deepEqual(data.health.missingTables, []);
  assert.equal(data.health.lastDathostTest, null);
  assert.equal(data.health.dathostConfigured, true);
  const fetcher = (async (url: unknown, options: RequestInit) => {
    assert.equal(url, `https://dathost.com/api/0.1/game-servers/${serverId}`);
    assert.equal(options.redirect, "manual");
    assert.equal(
      new Headers(options.headers).get("Authorization"),
      "Basic " + btoa(env.DATHOST_EMAIL + ":" + env.DATHOST_PASSWORD),
    );
    return Response.json({
      name: "İstanbul",
      ip: "127.0.0.1",
      ports: { game: 27015 },
      rcon: "must-not-leak",
      ftp_password: "must-not-leak",
    });
  }) as typeof fetch;
  const response = await operations(
    req("/api/operations", cookie, { action: "test-server" }),
    env,
    fetcher,
  );
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(!text.includes("must-not-leak"));
  assert.ok(!text.includes(env.DATHOST_PASSWORD!));
  data = await (await operations(req("/api/operations", cookie), env)).json();
  assert.equal(data.health.lastDathostTest.address, "127.0.0.1:27015");
});
test("DatHost load uses a single-use short-lived ticket, a form line, and prevents duplicate active loads", async () => {
  const { env, cookie, db } = await ready(),
    externalId = await veto(env, cookie);
  let calls = 0,
    ticketURL = "";
  const fetcher = (async (_url: unknown, options: RequestInit) => {
    calls++;
    assert.equal(options.redirect, "manual");
    assert.ok(options.body instanceof URLSearchParams);
    const line = (options.body as URLSearchParams).get("line")!;
    assert.ok(!line.includes(env.MATCHZY_WEBHOOK_SECRET!));
    ticketURL = line.match(/"(https:[^"]+)"/)![1];
    return new Response("");
  }) as typeof fetch;
  const request = req("/api/operations", cookie, { action: "server" });
  assert.equal(
    (
      await controlServer(
        request,
        env,
        { action: "load", matchId: "U1", confirm: true },
        fetcher,
      )
    ).status,
    200,
  );
  assert.equal(calls, 1);
  assert.equal((await runtimeFor(env, externalId))?.phase, "loading");
  assert.equal(
    (
      await controlServer(
        request,
        env,
        { action: "load", matchId: "U1", confirm: true },
        fetcher,
      )
    ).status,
    200,
  );
  assert.equal(calls, 1);
  const response = await serverMatch(new Request(ticketURL), env);
  assert.equal(response.status, 200);
  const config = await response.json();
  assert.equal(config.players_per_team, 5);
  assert.equal(
    config.cvars.matchzy_remote_log_header_value,
    `Bearer ${env.MATCHZY_WEBHOOK_SECRET}`,
  );
  assert.equal((await serverMatch(new Request(ticketURL), env)).status, 401);
  const exported = JSON.stringify(await exportBackup(env));
  assert.ok(!exported.includes(env.MATCHZY_WEBHOOK_SECRET!));
  assert.ok(!exported.includes("ticket="));
  assert.ok(
    !JSON.stringify(db.prepare("SELECT * FROM arena_audit").all()).includes(
      "ticket=",
    ),
  );
  await send(env, { event: "series_start", matchid: Number(externalId) });
  assert.equal((await runtimeFor(env, externalId))?.phase, "warmup");
  await send(env, {
    event: "going_live",
    matchid: Number(externalId),
    map_number: 0,
  });
  assert.equal((await runtimeFor(env, externalId))?.phase, "live");
});

test("forced tournament veto loads a 1v1 competitive match through DatHost with both configured names", async () => {
  const { env, cookie } = await ready();
  const initial = await loadArena(env);
  const opening = project(initial.config.state, initial.config.teams).byId.U1;
  const teamA = initial.config.teams.find((team) => team.id === opening.a)!;
  const teamB = initial.config.teams.find((team) => team.id === opening.b)!;
  const captains = [teamA, teamB].map((team) => team.roster.find((p) => p.id === team.captainId)!);
  const action = (data: Record<string, unknown>) =>
    management(req("/api/arena", cookie, { matchId: "U1", ...data }), env);
  const force = () => action({ action: "force-veto", confirm: true });
  const save = async () => {
    for (const team of [teamA, teamB]) team.players = team.roster.map((p) => p.name);
    const { revision } = await loadArena(env);
    await saveArena(env, validateArena(initial.config), revision);
  };

  teamA.roster = [captains[0]];
  await save();
  assert.equal((await force()).status, 422);
  teamB.roster = [{ ...captains[1], steamId: null }];
  await save();
  assert.equal((await force()).status, 422);
  teamB.roster = [captains[1]];
  teamA.tag = "123";
  captains[0].name = "abcd";
  await save();
  assert.equal((await action({ action: "ready", ready: true })).status, 422);
  assert.equal((await force()).status, 200);
  assert.deepEqual((await arenaSnapshot(req("/api/arena", cookie), env)).readies, []);
  for (const [revision, map] of ["Mirage", "Inferno", "Nuke", "Dust2", "Ancient", "Anubis"].entries())
    assert.equal((await action({ action: "move", revision, map })).status, 200);

  let ticketURL = "";
  const fetcher: typeof fetch = async (_url, options) => {
    const line = (options?.body as URLSearchParams).get("line")!;
    ticketURL = line.match(/"(https:[^"]+)"/)![1];
    return new Response("");
  };
  const result = await controlServer(req("/api/operations", cookie, {}), env,
    { action: "load", matchId: "U1", confirm: true }, fetcher);
  assert.equal(result.status, 200);
  const ticket = await serverMatch(new Request(ticketURL), env);
  assert.equal(ticket.status, 200);
  const config = await ticket.json();
  assert.equal(config.players_per_team, 1);
  assert.equal(config.min_players_to_ready, 1);
  assert.equal(config.wingman, false);
  assert.deepEqual(config.team1.players, { [captains[0].steamId!]: "123 | abcd" });
  assert.deepEqual(config.team2.players, { [captains[1].steamId!]: `${teamB.tag} | ${captains[1].name}` });
});
test("a refreshed Steam name reaches the next match, while the site keeps the untagged roster name", async () => {
  const { env, cookie, db } = await ready();
  const { config, revision } = await loadArena(env);
  const team = config.teams.find((t) => t.id === "nova")!;
  const player = team.roster[0];
  const steamId = player.steamId!;
  team.tag = "123";
  player.name = "abcd";
  player.useSteamName = true;
  await saveArena(env, validateArena(config), revision);
  db.prepare("INSERT INTO steam_users(steam_id,verified_at) VALUES(?,?)").run(steamId, Date.now());
  const refreshName = async (name: string) => {
    const response = await management(
      req("/api/arena", cookie, { action: "refresh-steam-account", steamId }),
      env,
      async () => new Response(`<profile><steamID64>${steamId}</steamID64><steamID>${name}</steamID></profile>`),
    );
    assert.equal((await response.json()).refreshed, true);
  };
  const cacheKey = `steam-profile:${steamId}`;
  const id = await veto(env, cookie);
  await refreshName("abcd");
  let ticket = "";
  const loaded = await controlServer(
    req("/api/operations", cookie, {}),
    env,
    { action: "load", matchId: "U1", confirm: true },
    async (_url, init) => {
      const line = (init?.body as URLSearchParams).get("line")!;
      ticket = line.match(/"(https:[^"]+)"/)![1];
      return new Response();
    },
  );
  assert.equal(loaded.status, 200);
  db.prepare("UPDATE arena_meta SET value=json_set(value,'$.attemptedAt',0) WHERE key=?").run(cacheKey);
  await refreshName("efgh");
  const issued = await (await serverMatch(new Request(ticket), env)).json();
  assert.equal(issued.team1.players[steamId], "123 | abcd");

  const result = {
    event: "map_result", matchid: Number(id), map_number: 0,
    team1: { score: 13, players: [{
      steamid: steamId, name: "123 | abcd",
      stats: { kills: 15, deaths: 7, assists: 3, headshot_kills: 6 },
    }] },
    team2: { score: 7, players: [] },
  };
  assert.equal((await send(env, result)).status, 200);
  const live = await (await liveMatches(env)).json();
  assert.equal(live.matches[0].players[0].name, "abcd");
  assert.equal(db.prepare("SELECT game_name FROM steam_users WHERE steam_id=?").get(steamId)?.game_name, "123 | abcd");

  const next = await loadArena(env);
  next.config.state.results.U1 = { status: "completed", score: [13, 7] };
  next.config.state.results.U2 = { status: "completed", score: [13, 7] };
  await saveArena(env, next.config, next.revision);
  await veto(env, cookie, "U5");
  const file = await (await matchConfig(req("/api/match-config?match=U5", cookie), env)).json();
  assert.equal(file.team1.players[steamId], "123 | efgh");

  db.prepare("UPDATE arena_meta SET value=json_set(value,'$.attemptedAt',0) WHERE key=?").run(cacheKey);
  await refreshName("&quot;uyumsuz&quot;");
  const fallback = await (await matchConfig(req("/api/match-config?match=U5", cookie), env)).json();
  assert.equal(fallback.team1.players[steamId], "123 | abcd");
});

test("concurrent loads lock across matches; a callback during the DatHost request is not overwritten", async () => {
  const { env, cookie } = await ready(),
    id = await veto(env, cookie);
  await veto(env, cookie, "U2");
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => (release = resolve));
  let started: () => void = () => {};
  const beginning = new Promise<void>((resolve) => (started = resolve));
  const fetcher = (async () => {
    started();
    await wait;
    await send(env, { event: "series_start", matchid: Number(id) });
    return new Response("");
  }) as typeof fetch;
  const request = req("/api/operations", cookie, {}),
    first = controlServer(
      request,
      env,
      { action: "load", matchId: "U1", confirm: true },
      fetcher,
    );
  await beginning;
  assert.equal(
    (
      await controlServer(
        request,
        env,
        { action: "load", matchId: "U2", confirm: true },
        fetcher,
      )
    ).status,
    409,
  );
  release();
  assert.equal((await first).status, 200);
  assert.equal((await runtimeFor(env, id))?.phase, "warmup");
  const jobs = await env
    .DB!.prepare("SELECT status FROM server_jobs")
    .all<{ status: string }>();
  assert.equal(jobs.results[0].status, "active");
});
test("an uncertain DatHost response is recorded and cannot trigger an accidental duplicate load", async () => {
  const { env, cookie } = await ready();
  await veto(env, cookie);
  let calls = 0;
  const fail = (async () => {
    calls++;
    throw new Error("network lost with secrets");
  }) as typeof fetch;
  const request = req("/api/operations", cookie, {});
  assert.equal(
    (
      await controlServer(
        request,
        env,
        { action: "load", matchId: "U1", confirm: true },
        fail,
      )
    ).status,
    502,
  );
  assert.equal(
    (
      await controlServer(
        request,
        env,
        { action: "load", matchId: "U1", confirm: true },
        fail,
      )
    ).status,
    200,
  );
  assert.equal(calls, 1);
  const health = await (
    await operations(req("/api/operations", cookie), env)
  ).json();
  assert.equal(health.jobs[0].status, "unknown");
  assert.ok(!JSON.stringify(health).includes("network lost"));
});
test("backup_loaded removes stale scores, rejects replayed large snapshots and resumes at the restored round", async () => {
  const { env, cookie } = await ready(),
    id = await veto(env, cookie);
  assert.equal((await send(env, event(id, 9, 7))).status, 200);
  const backup = {
    event: "backup_loaded",
    matchid: Number(id),
    map_number: 0,
    round_number: 5,
    filename: "round5.txt",
  };
  assert.equal((await send(env, backup)).status, 200);
  assert.equal((await (await liveMatches(env)).json()).matches.length, 0);
  assert.equal((await send(env, backup)).status, 202);
  assert.equal((await send(env, event(id, 9, 7))).status, 202);
  assert.equal((await send(env, event(id, 4, 2))).status, 200);
  assert.deepEqual(
    (await (await liveMatches(env)).json()).matches[0].score,
    [4, 2],
  );
  assert.equal((await send(env, event(id, 10, 7))).status, 202);
  assert.equal((await send(env, event(id, 5, 2))).status, 200);
});
test("completed round data releases the server lock on series_end, and pause lifecycle reports its state", async () => {
  const { env, cookie } = await ready(),
    id = await veto(env, cookie);
  await env
    .DB!.prepare("INSERT INTO server_jobs VALUES(?,?,?,?,?,?)")
    .bind(serverId, "token", 0, "U1", id, "active")
    .run();
  await send(env, { event: "going_live", matchid: Number(id), map_number: 0 });
  await send(env, { event: "game_paused", matchid: Number(id), map_number: 0 });
  assert.equal((await runtimeFor(env, id))?.phase, "paused");
  await send(env, event(id, 1, 0));
  assert.equal((await runtimeFor(env, id))?.phase, "paused");
  await send(env, {
    event: "game_unpaused",
    matchid: Number(id),
    map_number: 0,
  });
  assert.equal((await runtimeFor(env, id))?.phase, "live");
  assert.equal((await send(env, event(id, 13, 7))).status, 200);
  assert.equal((await runtimeFor(env, id))?.phase, "completed");
  await send(env, {
    event: "series_end",
    matchid: Number(id),
    winner: { team: "team1" },
  });
  const jobs = await env
    .DB!.prepare("SELECT status FROM server_jobs")
    .all<{ status: string }>();
  assert.equal(jobs.results[0].status, "idle");
});
test("forfeit marks real tournament results without inventing statistics; replay rotates descendant IDs and keeps history", async () => {
  const { env, cookie } = await ready(),
    id = await veto(env, cookie);
  await send(env, event(id, 9, 7));
  let record = await loadArena(env);
  let response = await operations(
    req("/api/operations", cookie, {
      action: "forfeit",
      matchId: "U1",
      winner: "nova",
      note: "Rakip katılmadı",
      revision: record.revision,
    }),
    env,
  );
  assert.equal(response.status, 409);
  response = await operations(
    req("/api/operations", cookie, {
      action: "forfeit",
      matchId: "U1",
      winner: "nova",
      note: "Rakip katılmadı",
      revision: record.revision,
      confirm: true,
    }),
    env,
  );
  assert.equal(response.status, 200);
  let snapshot = await arenaSnapshot(req("/api/arena", cookie), env);
  assert.equal(snapshot.state.results.U1.resolution, "forfeit");
  const view = project(snapshot.state, snapshot.config.teams);
  assert.deepEqual(view.byId.U1.score, [13, 0]);
  assert.equal(
    tournamentResults(view.matches, snapshot.config.teams, {}, undefined)
      .players.length,
    0,
  );
  record = await loadArena(env);
  const before = record.config.schedule.U5.externalId;
  response = await operations(
    req("/api/operations", cookie, {
      action: "replay",
      matchId: "U1",
      revision: record.revision,
      confirm: true,
      serverStoppedConfirmed: true,
      keepVeto: true,
    }),
    env,
  );
  assert.equal(response.status, 200);
  record = await loadArena(env);
  assert.notEqual(record.config.schedule.U1.externalId, id);
  assert.notEqual(record.config.schedule.U5.externalId, before);
  assert.equal(record.config.state.results.U1, undefined);
  snapshot = await arenaSnapshot(req("/api/arena", cookie), env);
  assert.equal(snapshot.vetos.length, 1);
  assert.equal((await (await liveMatches(env)).json()).matches.length, 0);
  assert.equal((await exportBackup(env)).maps.length, 1);
});
test("full backups validate and restore atomically while preserving login and verified Steam records", async () => {
  const { env, cookie, db } = await ready();
  await veto(env, cookie);
  await env
    .DB!.prepare("INSERT INTO steam_users(steam_id,verified_at) VALUES(?,?)")
    .bind("76561198000000001", Date.now())
    .run();
  const backup = validateBackup(await exportBackup(env));
  const before = await loadArena(env);
  before.config.title = "Changed title";
  await saveArena(env, before.config, before.revision);
  let record = await loadArena(env);
  const backupId = await restoreBackup(env, backup, record.revision);
  record = await loadArena(env);
  assert.notEqual(record.config.title, "Changed title");
  assert.equal(
    (await operations(req("/api/operations", cookie), env)).status,
    200,
  );
  assert.equal(db.prepare("SELECT count(*) as n FROM steam_users").get()!.n, 1);
  assert.equal(
    (await archivedBackup(env, backupId)).config.title,
    "Changed title",
  );
  assert.equal(
    db.prepare("SELECT count(*) as n FROM arena_restore_guard").get()!.n,
    0,
  );
  await assert.rejects(
    () => restoreBackup(env, backup, record.revision - 1),
    /CONFLICT/,
  );
  assert.equal((await loadArena(env)).revision, record.revision);
  const invalid = structuredClone(backup);
  invalid.config.schedule.U1.startsAt = "2026-02-30T12:00:00Z";
  assert.equal(validateBackup(invalid).config.schedule.U1.startsAt, "");
  const crash = structuredClone(backup);
  crash.vetos.push(crash.vetos[0]);
  await assert.rejects(() => restoreBackup(env, crash, record.revision));
  assert.equal((await loadArena(env)).revision, record.revision);
  assert.equal((await exportBackup(env)).vetos.length, 1);
});
test("frozen lineups survive unrelated roster edits; schedules can be deliberately cleared", async () => {
  const { env, cookie } = await ready(),
    id = await veto(env, cookie);
  const before = await loadArena(env),
    oldCaptain = (await runtimeFor(env, id))!.teams![0].captainId;
  before.config.teams[0].captainId = before.config.teams[0].roster[1].id;
  before.config.schedule.U1 = {
    ...before.config.schedule.U1,
    mode: "scheduled",
    startsAt: "2026-11-15T11:30:00.000Z",
    durationMinutes: 45,
    location: "İstanbul",
    notes: "15 dakika önce bağlan.",
  };
  assert.equal(
    (
      await management(
        req("/api/arena", cookie, {
          action: "config",
          config: before.config,
          revision: before.revision,
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal((await runtimeFor(env, id))!.teams![0].captainId, oldCaptain);
  let snapshot = await arenaSnapshot(req("/api/arena", cookie), env);
  assert.equal(snapshot.vetos.length, 1);
  assert.equal(snapshot.config.schedule.U1.startsAt, "");
  assert.equal(snapshot.config.schedule.U1.mode, "unset");
  assert.equal(snapshot.config.schedule.U1.durationMinutes, undefined);
  assert.equal(snapshot.config.schedule.U1.location, "İstanbul");
  assert.equal(snapshot.config.schedule.U1.externalId, id);
  snapshot.config.schedule.U1.mode = "unset";
  const clean = validateArena(snapshot.config);
  assert.equal(clean.schedule.U1.startsAt, "");
});
test("Steam invitation return path is bound to a hashed state and external redirects are discarded", async () => {
  const { env, db } = setup();
  const path = "/#veto/U1",
    response = await authRoute(
      req("/api/auth/steam/start?returnTo=" + encodeURIComponent(path)),
      env,
      "steam/start",
    );
  assert.equal(response.status, 302);
  const state = new URL(response.headers.get("Location")!).searchParams.get(
    "openid.return_to",
  )!;
  const token = new URL(state).searchParams.get("state")!;
  const saved = db
    .prepare("SELECT return_path FROM steam_returns WHERE state_hash=?")
    .get(await hash(token));
  assert.equal(saved!.return_path, path);
  assert.ok(
    !JSON.stringify(db.prepare("SELECT * FROM steam_returns").all()).includes(
      token,
    ),
  );
  await authRoute(
    req(
      "/api/auth/steam/start?returnTo=" +
        encodeURIComponent("https://evil.test"),
    ),
    env,
    "steam/start",
  );
  assert.equal(
    db
      .prepare(
        "SELECT count(*) as n FROM steam_returns WHERE return_path='/#oyuncu'",
      )
      .get()!.n,
    1,
  );
});

test("changing an earlier winner invalidates a downstream veto even without a downstream score", async () => {
  const { env, cookie } = await ready();
  for (const id of ["U1", "U2"]) {
    const record = await loadArena(env);
    assert.equal(
      (
        await management(
          req("/api/arena", cookie, {
            action: "result",
            matchId: id,
            revision: record.revision,
            result: { status: "completed", score: [13, 7] },
          }),
          env,
        )
      ).status,
      200,
    );
  }
  await veto(env, cookie, "U5");
  const before = await loadArena(env),
    oldId = before.config.schedule.U5.externalId;
  const data = {
    action: "result",
    matchId: "U1",
    revision: before.revision,
    result: { status: "completed", score: [7, 13] },
  };
  const preview = await management(req("/api/arena", cookie, data), env);
  assert.equal(preview.status, 409);
  assert.ok((await preview.json()).invalidated.includes("U5"));
  assert.equal(
    (
      await management(
        req("/api/arena", cookie, { ...data, confirm: true }),
        env,
      )
    ).status,
    200,
  );
  const after = await arenaSnapshot(req("/api/arena", cookie), env);
  assert.notEqual(after.config.schedule.U5.externalId, oldId);
  assert.equal(
    after.vetos.some((v) => v.matchId === "U5"),
    false,
  );
  assert.equal(after.runtimes.U5, undefined);
});
test("cancelled attempts reject late scores; releasing a stuck job requires explicit acknowledgment", async () => {
  const { env, cookie } = await ready(),
    id = await veto(env, cookie);
  await send(env, event(id, 9, 7));
  await env
    .DB!.prepare("INSERT INTO server_jobs VALUES(?,?,?,?,?,?)")
    .bind(serverId, "test-token", 0, "U1", id, "unknown")
    .run();
  await operations(req("/api/operations", cookie), env);
  assert.equal((await runtimeFor(env, id))?.phase, "live");
  assert.equal(
    (
      await operations(
        req("/api/operations", cookie, { action: "release-server" }),
        env,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await operations(
        req("/api/operations", cookie, {
          action: "release-server",
          confirm: true,
          serverStoppedConfirmed: true,
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal((await runtimeFor(env, id))?.phase, "cancelled");
  assert.equal((await send(env, event(id, 13, 7))).status, 202);
  assert.equal((await (await liveMatches(env)).json()).matches.length, 0);
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response("");
  }) as typeof fetch;
  assert.equal(
    (
      await controlServer(
        req("/api/operations", cookie, {}),
        env,
        { action: "load", matchId: "U1", confirm: true },
        fetcher,
      )
    ).status,
    409,
  );
  assert.equal(calls, 0);
});
test("results aggregate completed tournament players, disclose incomplete damage and exclude private/forfeit stats", async () => {
  const { env } = await ready(),
    record = await loadArena(env),
    teams = record.config.teams;
  const stats = {
    steamId: teams[0].roster[0].steamId!,
    name: "zenith",
    teamId: "nova",
    kills: 20,
    deaths: 10,
    assists: 3,
    headshotKills: 10,
    damage: 1800,
    roundsPlayed: 20,
  };
  const first = {
    id: "U1",
    a: "nova",
    b: "orbit",
    status: "completed" as const,
    score: [13, 7] as [number, number],
    maps: [
      {
        name: "Nuke",
        status: "completed" as const,
        score: [13, 7] as [number, number],
      },
    ],
    players: [stats],
    updatedAt: new Date().toISOString(),
  };
  const state = stateFromFeed([first], emptyState(), teams).state,
    view = project(state, teams);
  let result = tournamentResults(view.matches, teams, {
    U1: first,
    "duel-test": { ...first, id: "duel-test" },
  });
  assert.equal(result.covered, 1);
  assert.equal(result.eligible, 1);
  assert.equal(result.players[0].kills, 20);
  assert.equal(result.standings.find((s) => s.team.id === "nova")?.wins, 1);
  assert.notEqual(result.players[0].rating, null);
  result = tournamentResults(view.matches, teams, {
    U1: { ...first, players: [{ ...stats, damage: undefined }] },
  });
  assert.equal(result.players[0].rating, null);
  view.byId.U1.resolution = "forfeit";
  result = tournamentResults(view.matches, teams, { U1: first });
  assert.equal(result.players.length, 0);
  assert.equal(result.eligible, 0);
});

test("a rejected pause cannot unlock another match on a still active server", async () => {
  const { env, cookie } = await ready(),
    id = await veto(env, cookie);
  await veto(env, cookie, "U2");
  await send(env, { event: "series_start", matchid: Number(id) });
  await env
    .DB!.prepare("INSERT INTO server_jobs VALUES(?,?,?,?,?,?)")
    .bind(serverId, "token", 0, "U1", id, "active")
    .run();
  const rejected = (async () =>
    new Response("provider secret detail", { status: 403 })) as typeof fetch;
  const response = await controlServer(
    req("/api/operations", cookie, {}),
    env,
    { action: "pause", matchId: "U1", confirm: true },
    rejected,
  );
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("provider secret"));
  assert.equal(
    (
      await env
        .DB!.prepare("SELECT status FROM server_jobs")
        .all<{ status: string }>()
    ).results[0].status,
    "active",
  );
  assert.equal(
    (
      await controlServer(
        req("/api/operations", cookie, {}),
        env,
        { action: "load", matchId: "U2", confirm: true },
        rejected,
      )
    ).status,
    409,
  );
});


test("DatHost read-only failures explain network and HTTP causes without suggesting a command was sent", async () => {
  const { env, cookie } = await ready();
  const failed = (async () => { throw new Error("private provider details"); }) as typeof fetch;
  const response = await operations(req("/api/operations", cookie, { action: "test-server" }), env, failed);
  assert.equal(response.status, 502);
  const error = (await response.json()).error;
  assert.match(error, /oyun komutu gönderilmedi/);
  assert.doesNotMatch(error, /belirsiz|private provider/);
  const health = await (await operations(req("/api/operations", cookie), env)).json();
  assert.equal(health.health.dathostConfigured, true);
  assert.equal(health.health.lastDathostAttempt.ok, false);
  assert.equal(health.health.lastDathostAttempt.serverId, serverId);
  assert.equal(health.health.lastDathostTest, null);
  for (const [status, hint] of [[401, /DATHOST_PASSWORD/], [403, /DATHOST_ACCOUNT_EMAIL/], [404, /24 karakter/], [429, /istek sınırı/]] as const) {
    await assert.rejects(() => dathostRequest(env, serverId, "", undefined, (async () => new Response("provider secret", {status})) as typeof fetch), hint);
  }
});

test("DatHost redirects never forward credentials or replay console commands", async () => {
  const { env } = setup();
  for (const line of [undefined, "css_plugins list"]) {
    let calls = 0;
    let cancelled = false;
    const fetcher: typeof fetch = async (input, options) => {
      calls++;
      assert.equal(String(input), `https://dathost.com/api/0.1/game-servers/${serverId}${line ? "/console" : ""}`);
      assert.equal(options?.redirect, "manual");
      assert.equal(options?.method, line ? "POST" : "GET");
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
        status: 302,
        headers: { Location: "https://other.test/private-provider-detail" },
      });
    };
    await assert.rejects(
      () => dathostRequest(env, serverId, line ? "/console" : "", line, fetcher),
      (error: Error) => /HTTP 302/.test(error.message) && !/private-provider-detail/.test(error.message),
    );
    assert.equal(calls, 1);
    assert.equal(cancelled, true);
  }
});

test("DatHost latest failure does not erase a historical success and malformed metadata is rejected", async () => {
  const { env, cookie } = await ready();
  await operations(req("/api/operations", cookie, { action: "test-server" }), env,
    (async () => Response.json({name: "Arena", ip: "127.0.0.1", ports: {game: 27015}})) as typeof fetch);
  const failed = await operations(req("/api/operations", cookie, { action: "test-server" }), env,
    (async () => new Response("not JSON")) as typeof fetch);
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).error, /JSON/);
  const data = await (await operations(req("/api/operations", cookie), env)).json();
  assert.equal(data.health.lastDathostAttempt.ok, false);
  assert.equal(data.health.lastDathostTest.name, "Arena");
  assert.equal(data.health.lastDathostTest.serverId, serverId);
});

test("DatHost verification belongs to exact server and credentials and never exposes their fingerprint", async () => {
  const { env, cookie, db } = await ready();
  const success = (async () => Response.json({ id: serverId, name: "Arena" })) as typeof fetch;
  const testResponse = await operations(req("/api/operations", cookie, { action: "test-server" }), env, success);
  assert.equal(testResponse.status, 200);
  assert.doesNotMatch(await testResponse.text(), /settingsHash/);
  const read = async () => {
    const result = await (await operations(req("/api/operations", cookie), env)).json();
    assert.doesNotMatch(JSON.stringify(result), /settingsHash|test-dathost-password|test@example/);
    return result.health;
  };
  assert.equal((await read()).lastDathostAttempt.ok, true);
  assert.ok(db.prepare("SELECT value FROM arena_meta WHERE key='dathost'").get()!.value);
  for (const key of ["DATHOST_EMAIL", "DATHOST_PASSWORD", "DATHOST_ACCOUNT_EMAIL", "DATHOST_SERVER_ID"] as const) {
    const before = env[key];
    env[key] = key === "DATHOST_SERVER_ID" ? "a".repeat(24) : "changed-account-setting";
    const health = await read();
    assert.equal(health.lastDathostTest, null, `${key}: previous success cannot verify changed settings`);
    assert.equal(health.lastDathostAttempt, null);
    env[key] = before;
  }
  assert.equal((await read()).lastDathostAttempt.ok, true);
  delete env.DATHOST_PASSWORD;
  assert.equal((await read()).lastDathostAttempt, null);
});

test("DatHost cannot verify an empty or different-server response and legacy tests require retesting", async () => {
  const { env, cookie } = await ready();
  for (const metadata of [{}, { id: "a".repeat(24), name: "Other server" }]) {
    const response = await operations(req("/api/operations", cookie, { action: "test-server" }), env,
      (async () => Response.json(metadata)) as typeof fetch);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /seçili sunucunun bilgisini doğrulamadı/);
  }
  await env.DB!.prepare("INSERT INTO arena_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind("dathost-attempt", JSON.stringify({ at: new Date().toISOString(), ok: true, serverId })).run();
  const health = (await (await operations(req("/api/operations", cookie), env)).json()).health;
  assert.equal(health.lastDathostAttempt, null);
});

test("a DatHost HTTP 5xx after a console command preserves the lock against accidental retries", async () => {
  const { env, cookie } = await ready();
  await veto(env, cookie);
  let calls = 0;
  const providerFailure = (async () => {
    calls++;
    return new Response("private provider detail", { status: 502 });
  }) as typeof fetch;
  const request = req("/api/operations", cookie, {});
  const first = await controlServer(request, env, { action: "load", matchId: "U1", confirm: true }, providerFailure);
  assert.equal(first.status, 502);
  const message = (await first.json()).error;
  assert.match(message, /HTTP 502.*belirsiz/);
  assert.doesNotMatch(message, /private provider/);
  const retry = await controlServer(request, env, { action: "load", matchId: "U1", confirm: true }, providerFailure);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).alreadySent, true);
  assert.equal(calls, 1);
  const health = await (await operations(req("/api/operations", cookie), env)).json();
  assert.equal(health.jobs[0].status, "unknown");
});
