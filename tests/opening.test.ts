import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultArena, validateArena } from "../src/arena/model";
import { assignOpeningTeam, openingMatches } from "../src/tournament/opening";
import { emptyState, project, updateResult } from "../src/tournament/engine";

test("every opening slot can select any team without duplicate seeds, double bookings or input mutation", () => {
  const config = defaultArena(),
    initial = structuredClone(config);
  for (const team of config.teams)
    for (let seed = 1; seed <= 8; seed++) {
      const teams = assignOpeningTeam(config.teams, team.id, seed),
        next = validateArena({ ...config, teams }),
        view = project(next.state, next.teams);
      assert.equal(new Set(teams.map((t) => t.seed)).size, 8);
      assert.equal(teams.find((t) => t.id === team.id)?.seed, seed);
      const opening = openingMatches.map((m) => view.byId[m.id]);
      assert.equal(new Set(opening.flatMap((m) => [m.a, m.b])).size, 8);
      assert.ok(opening.every((m) => m.a !== m.b));
      const displaced = config.teams.find((t) => t.seed === seed)!;
      assert.equal(teams.find((t) => t.id === displaced.id)?.seed, team.seed);
      assert.deepEqual(config, initial);
    }
});
test("saved custom opponents advance to the correct upper and lower slots and survive JSON backup parsing", () => {
  const config = defaultArena();
  config.teams = assignOpeningTeam(config.teams, "parallax", 8);
  let view = project(config.state, config.teams);
  assert.equal(view.byId.U1.a, "nova");
  assert.equal(view.byId.U1.b, "parallax");
  assert.equal(view.byId.U2.a, "orbit");
  config.state = updateResult(
    emptyState(),
    "U1",
    { status: "completed", score: [7, 13] },
    config.teams,
  ).state;
  const restored = validateArena(JSON.parse(JSON.stringify(config)));
  view = project(restored.state, restored.teams);
  assert.equal(view.byId.U5.a, "parallax");
  assert.equal(view.byId.L1.a, "nova");
});
test("an empty opening slot accepts a team and invalid assignments are rejected", () => {
  const teams = defaultArena().teams.slice(0, 2),
    next = assignOpeningTeam(teams, "nova", 4);
  assert.equal(next.length, 2);
  assert.equal(new Set(next.map((t) => t.seed)).size, 2);
  assert.equal(next.find((t) => t.id === "nova")?.seed, 4);
  assert.throws(() => assignOpeningTeam(teams, "missing", 1));
  for (const seed of [0, 9, 1.5, NaN])
    assert.throws(() => assignOpeningTeam(teams, "nova", seed));
});
