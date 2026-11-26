import test from "node:test";
import assert from "node:assert/strict";
import { matchPhase, type MatchRuntime } from "../src/arena/operations";
import type { VetoState } from "../src/arena/veto";

const runtime = (phase: MatchRuntime["phase"]): MatchRuntime => ({ matchId: "U1", externalId: "123", phase });
const veto: VetoState = { matchId: "U1", a: "a", b: "b", format: "BO1", revision: 0, actions: [], rehearsal: false, rosterKey: "" };

test("published completion takes precedence over an older server preparation stage", () => {
  for (const phase of ["preparing", "veto", "loading", "warmup", "live", "review"] as const)
    assert.equal(matchPhase({ status: "completed" }, runtime(phase)), "completed");
});
test("a frozen preparation record does not hide current veto or a received live score", () => {
  assert.equal(matchPhase({ status: "upcoming" }, runtime("preparing"), veto), "veto");
  assert.equal(matchPhase({ status: "live" }, runtime("veto"), veto), "live");
  assert.equal(matchPhase({ status: "upcoming" }, runtime("veto")), "preparing");
});
test("server waiting, pause and recovery stages remain visible with incomplete score data", () => {
  for (const phase of ["loading", "warmup", "paused", "restoring", "cancelled", "review"] as const)
    assert.equal(matchPhase({ status: "upcoming" }, runtime(phase), veto), phase);
});
