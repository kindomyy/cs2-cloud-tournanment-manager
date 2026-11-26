import test from "node:test";
import assert from "node:assert/strict";
import { activePresentationMatch } from "../src/arena/presentation";
import { defaultArena } from "../src/arena/model";
import { project, updateResult } from "../src/tournament/engine";
import { safeReturnPath, steamLoginURL } from "../src/arena/schedule";

test("a minimal page has no implicit featured match and honors only the admin selection", () => {
  const config = defaultArena();
  const { matches } = project(config.state, config.teams);
  assert.equal(activePresentationMatch(config, matches), undefined);
  config.presentation = { minimal: true, activeMatchId: null };
  assert.equal(activePresentationMatch(config, matches), undefined);
  for (const id of ["U1", "U2", "U3"]) {
    config.presentation.activeMatchId = id;
    assert.equal(activePresentationMatch(config, matches)?.id, id);
  }
});

test("completed, cancelled, missing and unresolved active selections fall back to brackets", () => {
  const config = defaultArena();
  config.presentation = { minimal: true, activeMatchId: "U1" };
  const view = project(config.state, config.teams);
  for (const phase of ["completed", "cancelled"] as const)
    assert.equal(activePresentationMatch(config, view.matches, { U1: { matchId: "U1", externalId: "1", phase } }), undefined);
  assert.equal(activePresentationMatch(config, []), undefined);
  const completed = updateResult(config.state, "U1", { status: "completed", score: [13, 7] }, config.teams).state;
  assert.equal(activePresentationMatch(config, project(completed, config.teams).matches), undefined);
  config.presentation.activeMatchId = "U5";
  assert.equal(activePresentationMatch(config, view.matches), undefined);
});

test("Steam account settings have a permitted login return path", () => {
  assert.equal(safeReturnPath("/#hesap"), "/#hesap");
  assert.equal(steamLoginURL("/#hesap"), "/api/auth/steam/start?returnTo=%2F%23hesap");
  assert.equal(safeReturnPath("https://evil.test/#hesap"), "/#oyuncu");
});
