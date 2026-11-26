import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeFinalRule,
  demoState,
  emptyState,
  parseState,
  project,
  updateResult,
  validateResult,
  type TournamentState,
} from "../src/tournament/engine";

function complete(state: TournamentState, id: string, side = 0) {
  const match = project(state).byId[id];
  const score: [number, number] = match.format === "BO1" ? [13, 8] : [2, 1];
  if (side) score.reverse();
  return updateResult(state, id, { status: "completed", score }).state;
}
function playUntilFinal() {
  let state = emptyState();
  for (let i = 0; i < 13; i++) {
    const match = project(state).matches.find(
      (m) => m.status === "upcoming" && m.a && m.b,
    )!;
    state = complete(state, match.id);
  }
  return state;
}

test("live results never advance; completed results feed both upper and lower slots", () => {
  let state = demoState();
  assert.equal(project(state).byId.U5.a, "nova");
  assert.equal(project(state).byId.U5.b, undefined);
  assert.equal(project(state).byId.L1.a, "orbit");
  state = complete(state, "U2", 1);
  assert.equal(project(state).byId.U5.b, "void");
  assert.equal(project(state).byId.L1.b, "parallax");
  assert.throws(() => complete(state, "U7"), /iki takımı/);
});

test("MR12/MR3 completed and live scores are distinguished", () => {
  const match = project(emptyState()).byId.U1;
  for (const score of [
    [13, 0],
    [13, 11],
    [16, 12],
    [14, 16],
    [19, 17],
    [22, 18],
  ]) {
    assert.doesNotThrow(() =>
      validateResult(match, {
        status: "completed",
        score: score as [number, number],
      }),
    );
  }
  for (const score of [
    [13, 12],
    [14, 12],
    [15, 13],
    [16, 15],
    [17, 15],
    [18, 18],
    [0, 0],
  ]) {
    assert.doesNotThrow(() =>
      validateResult(match, {
        status: "live",
        score: score as [number, number],
      }),
    );
  }
  for (const score of [
    [12, 12],
    [13, 12],
    [14, 2],
    [16, 11],
    [15, 15],
    [-1, 13],
    [13.5, 8],
    [NaN, 2],
    [Infinity, 0],
  ]) {
    assert.throws(() =>
      validateResult(match, {
        status: "completed",
        score: score as [number, number],
      }),
    );
  }
  for (const score of [
    [13, 8],
    [14, 0],
    [16, 14],
    [17, 14],
    [18, 14],
    [20, 17],
  ]) {
    assert.throws(() =>
      validateResult(match, {
        status: "live",
        score: score as [number, number],
      }),
    );
  }
});

test("BO3 accepts map scores and refuses draws, round scores and finished live series", () => {
  const match = project(playUntilFinal()).byId.GF;
  for (const score of [
    [2, 0],
    [1, 2],
    [2, 1],
  ])
    assert.doesNotThrow(() =>
      validateResult(match, {
        status: "completed",
        score: score as [number, number],
      }),
    );
  for (const score of [
    [1, 1],
    [2, 2],
    [13, 8],
  ])
    assert.throws(() =>
      validateResult(match, {
        status: "completed",
        score: score as [number, number],
      }),
    );
  assert.throws(() => validateResult(match, { status: "live", score: [2, 1] }));
  assert.doesNotThrow(() =>
    validateResult(match, { status: "live", score: [1, 1] }),
  );
});

test("upper winner needs one final win, lower winner must win the reset series too", () => {
  const state = playUntilFinal();
  const gf = project(state).byId.GF;
  const upperWins = project(complete(state, "GF"));
  assert.equal(upperWins.champion, gf.a);
  assert.equal(upperWins.byId.GF2, undefined);
  const lowerWins = complete(state, "GF", 1);
  assert.equal(project(lowerWins).champion, undefined);
  assert.equal(project(lowerWins).byId.GF2.a, gf.a);
  assert.equal(project(lowerWins).byId.GF2.b, gf.b);
  assert.equal(project(complete(lowerWins, "GF2", 1)).champion, gf.b);
  assert.equal(project(complete(lowerWins, "GF2")).champion, gf.a);
});

test("single-final option has no reset, changing it invalidates any reset result", () => {
  const state = complete(complete(playUntilFinal(), "GF", 1), "GF2");
  const changed = changeFinalRule(state, false);
  assert.deepEqual(changed.invalidated, ["GF2"]);
  assert.equal(project(changed.state).champion, project(state).byId.GF.b);
  assert.equal(project(changed.state).byId.GF2, undefined);
  const back = changeFinalRule(changed.state, true).state;
  assert.equal(project(back).champion, undefined);
  assert.equal(project(back).byId.GF2.status, "upcoming");
});

test("winner correction invalidates only affected downstream results, without mutating old state", () => {
  const original = complete(playUntilFinal(), "GF");
  const snapshot = JSON.stringify(original);
  const changed = updateResult(original, "U1", {
    status: "completed",
    score: [8, 13],
  });
  assert.equal(JSON.stringify(original), snapshot);
  assert.deepEqual(changed.invalidated, [
    "U5",
    "U7",
    "L1",
    "L3",
    "L4",
    "L5",
    "L6",
    "GF",
  ]);
  for (const id of ["U2", "U3", "U4", "U6", "L2"])
    assert.deepEqual(changed.state.results[id], original.results[id]);
  assert.equal(project(changed.state).byId.U5.a, "orbit");
  assert.equal(project(changed.state).byId.L1.a, "nova");
  assert.equal(project(changed.state).champion, undefined);
  assert.deepEqual(
    updateResult(original, "U1", { status: "completed", score: [13, 10] })
      .invalidated,
    [],
  );
  assert.equal(
    project(
      updateResult(original, "U1", { status: "completed", score: [13, 10] })
        .state,
    ).champion,
    "nova",
  );
});

test("clearing an earlier result removes its participants from both branches", () => {
  const state = updateResult(complete(playUntilFinal(), "GF"), "U1").state;
  assert.equal(state.results.U1, undefined);
  assert.equal(project(state).byId.U5.a, undefined);
  assert.equal(project(state).byId.L1.a, undefined);
  assert.equal(project(state).champion, undefined);
});

test("backup import validates types, reachable participants and optional reset finals", () => {
  const state = complete(complete(playUntilFinal(), "GF", 1), "GF2", 1);
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(state))), state);
  for (const bad of [
    null,
    {},
    { ...emptyState(), version: 2 },
    { ...emptyState(), results: [] },
    { ...emptyState(), results: { unknown: {} } },
    { ...emptyState(), results: { U1: null } },
    {
      ...emptyState(),
      results: { U5: { status: "completed", score: [2, 0] } },
    },
    {
      ...emptyState(),
      results: { GF2: { status: "completed", score: [2, 0] } },
    },
  ])
    assert.throws(() => parseState(bad));
  assert.throws(() => updateResult(emptyState(), "UNKNOWN"));
});

test("200 complete tournaments: no self-match, everyone except champion loses exactly twice", () => {
  let random = 713;
  for (let trial = 0; trial < 200; trial++) {
    let state = emptyState();
    const losses: Record<string, number> = {};
    let count = 0;
    while (!project(state).champion && count++ < 16) {
      const match = project(state).matches.find(
        (m) => m.status === "upcoming" && m.a && m.b,
      );
      assert.ok(
        match,
        "there must be a playable match until a champion exists",
      );
      assert.notEqual(match.a, match.b);
      random = (Math.imul(1664525, random) + 1013904223) >>> 0;
      const side = (random >>> 16) % 2;
      const losingTeam = side ? match.a! : match.b!;
      losses[losingTeam] = (losses[losingTeam] || 0) + 1;
      state = complete(state, match.id, side);
    }
    const view = project(state);
    assert.ok(view.champion);
    assert.ok(count === 14 || count === 15);
    assert.ok((losses[view.champion] || 0) <= 1);
    for (const [team, n] of Object.entries(losses))
      if (team !== view.champion) assert.equal(n, 2);
    assert.equal(view.eliminated.size, 7);
    assert.deepEqual(parseState(state), state);
  }
});
