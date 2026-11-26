import { test } from "node:test";
import assert from "node:assert/strict";
import { botTrainingConfig } from "../src/arena/botTraining";

test("bot training assigns the opposite side and one active AI bot without a Steam roster", () => {
  for (const human of ["ct", "t"]) {
    const result = botTrainingConfig("Inferno", human, 2);
    const lines = result.config
      .split("\n")
      .filter((s) => s && !s.startsWith("//"));
    const settings = Object.fromEntries(
      lines.map((line) => {
        const [name, ...value] = line.split(" ");
        return [name, value.join(" ")];
      }),
    );
    assert.equal(settings.bot_join_team, human === "ct" ? "T" : "CT");
    assert.ok(lines.includes(human === "ct" ? "bot_add_t" : "bot_add_ct"));
    assert.equal(settings.bot_quota, "1");
    for (const name of [
      "bot_stop",
      "bot_freeze",
      "bot_zombie",
      "bot_mimic",
      "bot_dont_shoot",
      "buddha",
      "sv_infinite_ammo",
      "mp_respawn_on_death_ct",
      "mp_respawn_on_death_t",
      "sv_cheats",
    ])
      assert.equal(settings[name], "0", name);
    assert.equal(settings.bot_difficulty, "2");
    assert.equal(result.config.includes("steamId"), false);
    assert.equal(result.config.includes("matchzy_loadmatch"), false);
  }
});
test("bot setup separates map changes and puts MatchZy to sleep before applying AI config", () => {
  const result = botTrainingConfig("Nuke", "ct", 0);
  assert.equal(result.mapCommand, "changelevel de_nuke");
  assert.equal(result.prepare.at(-1), "css_sleep");
  assert.ok(
    result.prepare.indexOf("css_endmatch") <
      result.prepare.indexOf("css_sleep"),
  );
  assert.ok(!result.config.includes("changelevel"));
  assert.ok(!result.config.includes("css_prac"));
  assert.equal(result.restore.at(-1), "css_exitprac");
});
test("bot generator rejects injected maps, invalid sides and out-of-range difficulties", () => {
  for (const args of [
    ["Inferno; quit", "ct", 1],
    ["Inferno", "ct;quit", 1],
    ["Nuke", "t", 4],
    ["Nuke", "ct", -1],
    ["Nuke", "ct", 1.5],
    ["Nuke", "ct", NaN],
  ] as const)
    assert.throws(() => botTrainingConfig(...args));
});
