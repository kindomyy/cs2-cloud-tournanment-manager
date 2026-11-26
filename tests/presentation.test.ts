import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultArena, validateArena } from "../src/arena/model";

test("existing tournament configurations do not enable minimal presentation implicitly", () => {
  assert.equal(validateArena(defaultArena()).presentation, undefined);
});

test("presentation settings preserve one active tournament match or an explicit empty selection", () => {
  for (const presentation of [
    { minimal: true, activeMatchId: "U1" },
    { minimal: false, activeMatchId: "GF2" },
    { minimal: true, activeMatchId: null },
    { minimal: false, activeMatchId: null },
  ]) {
    const saved = validateArena(JSON.parse(JSON.stringify({ ...defaultArena(), presentation })));
    assert.deepEqual(saved.presentation, presentation);
  }
});

test("presentation validation rejects multiple selections, non-tournament IDs and invalid flags", () => {
  for (const presentation of [
    null,
    [],
    "minimal",
    { minimal: "true", activeMatchId: "U1" },
    { minimal: true, activeMatchId: ["U1", "U2"] },
    { minimal: true, activeMatchId: "duel-01234567-89ab-cdef-0123-456789abcdef" },
    { minimal: true, activeMatchId: "UNKNOWN" },
    { minimal: true, activeMatchId: "" },
    { minimal: true },
    { activeMatchId: "U1" },
  ]) {
    assert.throws(() => validateArena({ ...defaultArena(), presentation }), /Site görünümü/);
  }
});

test("switching the active presentation match does not modify schedules or results", () => {
  const config = defaultArena();
  config.presentation = { minimal: true, activeMatchId: "U1" };
  const original = validateArena(config);
  const switched = validateArena({
    ...original,
    presentation: { ...original.presentation, activeMatchId: "U2" },
  });
  assert.deepEqual(switched.state, original.state);
  assert.deepEqual(switched.schedule, original.schedule);
  assert.deepEqual(switched.teams, original.teams);
  assert.equal(switched.presentation?.activeMatchId, "U2");
});
