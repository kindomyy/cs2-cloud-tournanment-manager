import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  normalizeEvent,
  aggregateMaps,
  parseBindings,
} from "../server/matchzy";
import { webhook, liveMatches, type Env } from "../server/api";
import { hsPercent } from "../src/tournament/liveTypes";
import { parseLiveFeed } from "../src/tournament/useLiveFeed";
import { stateFromFeed } from "../src/tournament/liveState";
import {
  project,
  validateResult,
  parseState,
  emptyState,
} from "../src/tournament/engine";
import { matchDefinitions } from "../src/data";

const bindings = parseBindings(
  JSON.stringify({
    27: { matchId: "U2", team1: "parallax", team2: "void", maps: ["Nuke"] },
    28: {
      matchId: "U5",
      team1: "nova",
      team2: "parallax",
      maps: ["Mirage", "Inferno", "Nuke"],
    },
  }),
);
function event(
  score: [number, number] = [9, 7],
  type = "round_end",
  id = 27,
  number = 0,
) {
  return {
    event: type,
    matchid: id,
    map_number: number,
    team1: {
      score: score[0],
      players: [
        {
          steamid: "76561198000000001",
          name: "hipotez",
          stats: { kills: 20, deaths: 10, assists: 3, headshot_kills: 10 },
        },
      ],
    },
    team2: {
      score: score[1],
      players: [
        {
          steamid: "76561198000000002",
          name: "shade",
          stats: { kills: 10, deaths: 15, assists: 5, headshot_kills: 3 },
        },
      ],
    },
  };
}
const secret = "test-only-matchzy-secret-not-a-real-credential";
function environment(): Env {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("../migrations/0001_matchzy.sql", import.meta.url),
      "utf8",
    ),
  );
  const DB = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const stmt = sqlite.prepare(sql);
      return {
        bind(...args: unknown[]) {
          values = args;
          return this;
        },
        async run() {
          return stmt.run(...(values as never[]));
        },
        async all() {
          return { results: stmt.all(...(values as never[])) };
        },
      };
    },
  } as unknown as Env["DB"];
  return {
    DB,
    MATCHZY_WEBHOOK_SECRET: secret,
    MATCHZY_BINDINGS: JSON.stringify(bindings),
  };
}
function send(env: Env, payload: unknown, authorization = `Bearer ${secret}`) {
  return webhook(
    new Request("https://example.test/api/webhooks/matchzy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify(payload),
    }),
    env,
  );
}

test("official round_end shape: K/D/A and HS kill counts stay numeric and stable", () => {
  const normalized = normalizeEvent(event(), bindings)!;
  assert.equal(normalized.number, 0);
  assert.equal(normalized.players[0].kills, 20);
  assert.equal(hsPercent(normalized.players[0]), 50);
  assert.equal(hsPercent({ kills: 0, headshotKills: 0 }), 0);
  const match = aggregateMaps([normalized], bindings["27"])!;
  assert.equal(match.status, "live");
  assert.deepEqual(match.score, [9, 7]);
  assert.doesNotThrow(() =>
    parseLiveFeed({ configured: true, matches: [match] }),
  );
  assert.equal(normalizeEvent({ event: "player_death" }, bindings), null);
  const bad = event();
  bad.team1.players[0].stats.headshot_kills = 99;
  assert.throws(() => normalizeEvent(bad, bindings));
  assert.throws(() =>
    normalizeEvent(event([9, 7], "round_end", 999), bindings),
  );
});

test("BO3 uses map wins; HS percentage is weighted across map kills, not averaged", () => {
  const first = normalizeEvent(event([13, 8], "map_result", 28), bindings)!;
  const secondEvent = event([13, 11], "map_result", 28, 1);
  secondEvent.team1.players[0].stats.kills = 10;
  secondEvent.team1.players[0].stats.headshot_kills = 10;
  const second = normalizeEvent(secondEvent, bindings)!;
  const match = aggregateMaps([second, first], bindings["28"])!;
  assert.deepEqual(match.score, [2, 0]);
  assert.equal(match.status, "completed");
  assert.equal(match.players[0].kills, 30);
  assert.equal(match.players[0].deaths, 20);
  assert.ok(Math.abs(hsPercent(match.players[0]) - 66.6666667) < 0.00001);
  assert.equal(aggregateMaps([second], bindings["28"]), null);
  const third = normalizeEvent(event([13, 8], "map_result", 28, 2), bindings)!;
  assert.throws(() => aggregateMaps([first, second, third], bindings["28"]));
});

test("webhook requires auth/configuration, rejects invalid payloads, ignores unrelated events", async () => {
  const env = environment();
  assert.equal((await send({}, event())).status, 503);
  assert.equal((await send(env, event(), "wrong")).status, 401);
  assert.equal((await send(env, { ...event(), map_number: 3 })).status, 422);
  assert.equal((await send(env, { event: "round_start" })).status, 202);
  assert.equal((await send(env, { event: "series_start" })).status, 422);
  assert.equal(
    (
      await webhook(
        new Request("https://example.test/", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: "x".repeat(65537),
        }),
        env,
      )
    ).status,
    413,
  );
  assert.equal((await liveMatches({})).status, 503);
});

test("real SQLite upsert: duplicate and out-of-order rounds cannot inflate stats or undo final", async () => {
  const env = environment();
  assert.equal((await send(env, event())).status, 200);
  await send(env, event());
  await send(env, event([8, 6]));
  let feed = parseLiveFeed(await (await liveMatches(env)).json());
  assert.deepEqual(feed.matches[0].score, [9, 7]);
  assert.equal(feed.matches[0].players[0].kills, 20);
  await send(env, event([13, 7], "map_result"));
  await send(env, event([11, 7]));
  await send(env, event([13, 7]));
  feed = parseLiveFeed(await (await liveMatches(env)).json());
  assert.equal(feed.matches[0].status, "completed");
  assert.deepEqual(feed.matches[0].score, [13, 7]);
  assert.equal(feed.matches[0].players[0].kills, 20);
});

test("final round_end is upgraded by map_result, then cannot be replaced by late round_end", async () => {
  const env = environment();
  const lastRound = event([13, 7]);
  lastRound.team1.players[0].stats.kills = 19;
  await send(env, lastRound);
  await send(env, event([13, 7], "map_result"));
  await send(env, lastRound);
  const feed = parseLiveFeed(await (await liveMatches(env)).json());
  assert.equal(feed.matches[0].players[0].kills, 20);
});

test("map details validate series score and survive version-1 backup round trip", () => {
  const match = {
    ...matchDefinitions.find((m) => m.id === "U5")!,
    a: "nova",
    b: "parallax",
  };
  const good = {
    status: "completed" as const,
    score: [2, 0] as [number, number],
    maps: [
      {
        name: "Mirage",
        status: "completed" as const,
        score: [13, 8] as [number, number],
      },
      {
        name: "Inferno",
        status: "completed" as const,
        score: [16, 14] as [number, number],
      },
    ],
  };
  assert.doesNotThrow(() => validateResult(match, good));
  assert.throws(() => validateResult(match, { ...good, score: [2, 1] }));
  assert.throws(() =>
    validateResult(match, { ...good, maps: [good.maps[0], good.maps[0]] }),
  );
  assert.throws(() =>
    validateResult(match, {
      ...good,
      maps: [
        ...good.maps,
        { name: "Nuke", score: [13, 9], status: "completed" },
      ],
    }),
  );
  const state = emptyState();
  state.results.U1 = {
    status: "completed",
    score: [13, 8],
    map: "Mirage",
    maps: [good.maps[0]],
  };
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(state))), state);
});

test("API source never mixes mismatched teams or personal demo results into real bracket", () => {
  const live = aggregateMaps(
    [normalizeEvent(event([13, 7], "map_result"), bindings)!],
    bindings["27"],
  )!;
  const remote = stateFromFeed([live]);
  assert.equal(project(remote.state).byId.U1.status, "upcoming");
  assert.equal(project(remote.state).byId.U5.a, undefined);
  assert.equal(project(remote.state).byId.U5.b, "parallax");
  assert.deepEqual(stateFromFeed([{ ...live, a: "nova" }]).conflicts, ["U2"]);
  const invalid = structuredClone(live);
  invalid.players[0].headshotKills = 999;
  assert.throws(() => parseLiveFeed({ configured: true, matches: [invalid] }));
});
