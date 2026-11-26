import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { onRequest as route } from "../functions/api/duels";
import { onRequest as configRoute } from "../functions/api/duel-config";
import { authRoute, hash } from "../server/auth";
import { loadArena, type Env } from "../server/store";
import { webhook, liveMatches } from "../server/api";
import type { DuelView } from "../src/arena/duel";
import { vetoDone } from "../src/arena/veto";
const origin = "https://duel.test";
const players = [
  { name: "Alpha", steamId: "76561198000000111" },
  { name: "Bravo", steamId: "76561198000000222" },
];
function setup() {
  const db = new DatabaseSync(":memory:");
  for (const file of [
    "0001_matchzy.sql",
    "0002_management.sql",
    "0003_private_duels.sql",
  ])
    db.exec(
      readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"),
    );
  const env: Env = {
    PUBLIC_ORIGIN: origin,
    ADMIN_PASSWORD: "test-only-duel-admin-password",
    MATCHZY_WEBHOOK_SECRET: "test-only-duel-webhook-secret-value",
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        let values: unknown[] = [];
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
  const req = (path: string, cookie = "", data?: unknown, source = origin) =>
    new Request(origin + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Origin: source,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const post = (cookie: string, data: unknown, source = origin) =>
    route({ request: req("/api/duels", cookie, data, source), env });
  const room = async (id: string, cookie: string) => {
    const r = await route({ request: req("/api/duels?id=" + id, cookie), env });
    assert.equal(r.status, 200);
    return (await r.json()).rooms[0] as DuelView;
  };
  const config = (id: string, cookie: string) =>
    configRoute({ request: req("/api/duel-config?id=" + id, cookie), env });
  const login = async () => {
    const r = await authRoute(
      req("/api/auth/admin", "", { password: env.ADMIN_PASSWORD }),
      env,
      "admin",
    );
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  const player = async (steamId: string, verified = true) => {
    const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
    await env
      .DB!.prepare(
        "INSERT INTO arena_sessions(token_hash,role,steam_id,expires) VALUES(?,'player',?,?)",
      )
      .bind(await hash(token), steamId, Date.now() + 3600000)
      .run();
    if (verified)
      await env
        .DB!.prepare(
          "INSERT OR IGNORE INTO steam_users(steam_id,verified_at) VALUES(?,?)",
        )
        .bind(steamId, Date.now())
        .run();
    return "arena_session=" + token;
  };
  const create = async (admin: string) => {
    const r = await post(admin, { action: "create", players });
    assert.equal(r.status, 200);
    return (await r.json()).id as string;
  };
  const banAll = async (id: string, admin: string) => {
    for (const map of [
      "Mirage",
      "Inferno",
      "Nuke",
      "Dust2",
      "Ancient",
      "Anubis",
    ]) {
      const d = await room(id, admin);
      const r = await post(admin, {
        action: "move",
        id,
        revision: d.revision,
        map,
      });
      assert.equal(r.status, 200);
    }
  };
  const event = (externalId: string, wrong = false) => ({
    event: "round_end",
    matchid: Number(externalId),
    map_number: 0,
    team1: {
      score: 9,
      players: [
        {
          steamid: wrong ? players[1].steamId : players[0].steamId,
          name: "Game Alpha",
          stats: {
            kills: 9,
            deaths: 7,
            assists: 0,
            headshot_kills: 4,
            damage: 950,
            rounds_played: 16,
          },
        },
      ],
    },
    team2: {
      score: 7,
      players: [
        {
          steamid: players[1].steamId,
          name: "Game Bravo",
          stats: {
            kills: 7,
            deaths: 9,
            assists: 0,
            headshot_kills: 2,
            damage: 850,
            rounds_played: 16,
          },
        },
      ],
    },
  });
  const send = (data: unknown) =>
    webhook(
      new Request(origin + "/api/webhooks/matchzy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + env.MATCHZY_WEBHOOK_SECRET,
        },
        body: JSON.stringify(data),
      }),
      env,
    );
  return {
    env,
    db,
    req,
    post,
    room,
    config,
    login,
    player,
    create,
    banAll,
    event,
    send,
  };
}
test("1v1 admin creates isolated rooms; auth, CSRF, distinct SteamIDs and private room access are enforced", async () => {
  const s = setup(),
    admin = await s.login(),
    a = await s.player(players[0].steamId),
    outsider = await s.player("76561198000000999");
  assert.equal((await s.post("", { action: "create", players })).status, 401);
  assert.equal((await s.post(a, { action: "create", players })).status, 403);
  assert.equal(
    (await s.post(admin, { action: "create", players }, "https://other.test"))
      .status,
    403,
  );
  assert.equal(
    (
      await s.post(admin, {
        action: "create",
        players: [players[0], players[0]],
      })
    ).status,
    422,
  );
  const before = await loadArena(s.env),
    id = await s.create(admin);
  assert.deepEqual(await loadArena(s.env), before);
  const guest = await route({ request: s.req("/api/duels"), env: s.env });
  assert.deepEqual((await guest.json()).rooms, []);
  assert.equal(
    (
      await route({
        request: s.req("/api/duels?id=" + id, outsider),
        env: s.env,
      })
    ).status,
    404,
  );
  assert.equal((await s.config(id, "")).status, 401);
  assert.equal((await s.config(id, admin)).status, 422);
});
test("two verified players open 1v1 veto; own readiness, turn ownership and CAS are protected", async () => {
  const s = setup(),
    admin = await s.login(),
    a = await s.player(players[0].steamId),
    b = await s.player(players[1].steamId),
    id = await s.create(admin);
  assert.equal(
    (
      await s.post(a, {
        action: "ready",
        id,
        revision: 0,
        ready: true,
        steamId: players[1].steamId,
      })
    ).status,
    200,
  );
  let d = await s.room(id, admin);
  assert.equal(d.veto, null);
  assert.deepEqual(Object.keys(d.ready), [players[0].steamId]);
  assert.equal(
    (
      await s.post(b, {
        action: "ready",
        id,
        revision: d.revision,
        ready: true,
      })
    ).status,
    200,
  );
  d = await s.room(id, admin);
  assert.equal(d.veto?.rehearsal, false);
  assert.equal(d.veto?.forced, false);
  assert.equal(
    (
      await s.post(b, {
        action: "move",
        id,
        revision: d.revision,
        map: "Mirage",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await s.post(a, {
        action: "move",
        id,
        revision: d.revision,
        map: "Mirage",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await s.post(b, {
        action: "move",
        id,
        revision: d.revision,
        map: "Inferno",
      })
    ).status,
    409,
  );
  for (const [i, map] of [
    "Inferno",
    "Nuke",
    "Dust2",
    "Ancient",
    "Anubis",
  ].entries()) {
    d = await s.room(id, admin);
    assert.equal(
      (
        await s.post(i % 2 === 0 ? b : a, {
          action: "move",
          id,
          revision: d.revision,
          map,
        })
      ).status,
      200,
    );
  }
  d = await s.room(id, admin);
  assert.ok(d.veto && vetoDone(d.veto));
  const file = await s.config(id, admin);
  assert.equal(file.status, 200);
  const data = await file.json();
  assert.equal(data.players_per_team, 1);
  assert.equal(data.min_players_to_ready, 1);
  assert.deepEqual(data.maplist, ["de_vertigo"]);
  assert.deepEqual(data.team1.players, { [players[0].steamId]: "Alpha" });
  assert.deepEqual(data.team2.players, { [players[1].steamId]: "Bravo" });
  assert.equal(
    JSON.stringify(data).includes(s.env.MATCHZY_WEBHOOK_SECRET!),
    false,
  );
  assert.equal(
    (
      await s.post(a, {
        action: "move",
        id,
        revision: d.revision,
        map: "Vertigo",
      })
    ).status,
    409,
  );
});
test("admin bypass starts real 1v1 without forging readiness or Steam verification; expired ready does not count", async () => {
  const s = setup(),
    admin = await s.login(),
    a = await s.player(players[0].steamId, false),
    b = await s.player(players[1].steamId),
    id = await s.create(admin);
  assert.equal(
    (await s.post(a, { action: "ready", id, revision: 0, ready: true })).status,
    403,
  );
  let d = await s.room(id, admin);
  d.ready[players[0].steamId] = Date.now() - 1000;
  s.db
    .prepare("UPDATE private_duels SET state=? WHERE id=?")
    .run(JSON.stringify(d), id);
  assert.equal(
    (await s.post(b, { action: "ready", id, revision: 0, ready: true })).status,
    200,
  );
  d = await s.room(id, admin);
  assert.equal(d.veto, null);
  assert.equal(
    (
      await s.post(b, {
        action: "force-veto",
        id,
        revision: d.revision,
        confirm: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (await s.post(admin, { action: "force-veto", id, revision: d.revision }))
      .status,
    409,
  );
  assert.equal(
    (
      await s.post(admin, {
        action: "force-veto",
        id,
        revision: d.revision,
        confirm: true,
      })
    ).status,
    200,
  );
  const forced = await s.room(id, admin);
  assert.equal(forced.veto?.forced, true);
  assert.deepEqual(forced.ready, d.ready);
  assert.equal(s.db.prepare("SELECT count(*) n FROM steam_users").get()!.n, 1);
});
test("shared webhook accepts only 1v1 roster, keeps stats idempotent and separate from tournament, and closes rooms safely", async () => {
  const s = setup(),
    admin = await s.login(),
    id = await s.create(admin),
    before = await loadArena(s.env);
  assert.equal(
    (
      await s.post(admin, {
        action: "force-veto",
        id,
        revision: 0,
        confirm: true,
      })
    ).status,
    200,
  );
  await s.banAll(id, admin);
  let d = await s.room(id, admin);
  assert.equal((await s.send(s.event(d.externalId, true))).status, 422);
  for (let i = 0; i < 2; i++)
    assert.equal((await s.send(s.event(d.externalId))).status, 200);
  d = await s.room(id, admin);
  assert.deepEqual(d.live?.score, [9, 7]);
  assert.equal(d.live?.players[0].kills, 9);
  assert.equal(d.live?.players[0].name, "Alpha");
  const tournament = await liveMatches(s.env);
  assert.equal(tournament.status, 200);
  assert.deepEqual((await tournament.json()).matches, []);
  assert.deepEqual(await loadArena(s.env), before);
  assert.equal(
    (await s.post(admin, { action: "close", id, revision: d.revision })).status,
    200,
  );
  assert.equal((await s.config(id, admin)).status, 422);
  assert.equal((await s.send(s.event(d.externalId))).status, 422);
  assert.deepEqual((await s.room(id, admin)).live?.score, [9, 7]);
  const next = await s.create(admin);
  assert.notEqual((await s.room(next, admin)).externalId, d.externalId);
});

test("private room server address is limited to its participants and admin", async () => {
  const s = setup(), admin = await s.login();
  const record = await loadArena(s.env);
  record.config.server = { address: "private.example.test:27015", dathostServerId: "a".repeat(24) };
  s.db.prepare("UPDATE arena_config SET config=? WHERE id=1").run(JSON.stringify(record.config));
  const id = await s.create(admin);
  const participant = await s.player(players[0].steamId);
  const outsider = await s.player("76561198000000999");
  const list = async (cookie: string) => (await route({ request: s.req("/api/duels", cookie), env: s.env })).json();
  assert.equal((await list(admin)).serverAddress, "private.example.test:27015");
  assert.equal((await list(participant)).serverAddress, "private.example.test:27015");
  assert.equal((await list(outsider)).serverAddress, "");
  assert.equal((await list("")).serverAddress, undefined);
  assert.equal((await route({ request: s.req("/api/duels?id=" + id, outsider), env: s.env })).status, 404);
  const open = await s.room(id, admin);
  assert.equal((await s.post(admin, { action: "close", id, revision: open.revision })).status, 200);
  assert.equal((await list(participant)).serverAddress, "", "closed rooms revoke server address for participants");
  assert.equal((await list(admin)).serverAddress, "private.example.test:27015");
});
