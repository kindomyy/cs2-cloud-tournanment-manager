import { mapNames } from "../tournament/engine";

export function botTrainingConfig(
  map: string,
  humanSide: string,
  difficulty: number,
) {
  if (
    !mapNames.includes(map) ||
    !["ct", "t"].includes(humanSide) ||
    !Number.isInteger(difficulty) ||
    difficulty < 0 ||
    difficulty > 3
  )
    throw new Error("Harita, taraf veya bot zorluğu geçersiz.");
  const botSide = humanSide === "ct" ? "t" : "ct";
  return {
    mapCommand: `changelevel de_${map.toLowerCase()}`,
    prepare: ["css_endmatch", "css_exitprac", "css_sleep"],
    config: [
      "// Among Us! - tek oyuncu + hareketli bot antrenmani",
      "// Once css_endmatch, css_exitprac, css_sleep komutlarini sirasiyla uygula.",
      "sv_cheats 1",
      "bot_kick",
      "bot_quota 0",
      "bot_quota_mode normal",
      "bot_stop 0",
      "bot_freeze 0",
      "bot_zombie 0",
      "bot_mimic 0",
      "bot_dont_shoot 0",
      "buddha 0",
      "sv_infinite_ammo 0",
      "sv_showimpacts 0",
      "mp_autoteambalance 0",
      "mp_limitteams 0",
      "mp_ignore_round_win_conditions 0",
      "mp_respawn_on_death_ct 0",
      "mp_respawn_on_death_t 0",
      "mp_freezetime 3",
      "mp_warmup_pausetimer 0",
      "mp_warmup_end",
      "mp_startmoney 16000",
      "mp_maxmoney 16000",
      "mp_buy_anywhere 0",
      "mp_buytime 30",
      "mp_roundtime_defuse 1.92",
      `bot_difficulty ${difficulty}`,
      "sv_cheats 0",
      `bot_join_team ${botSide === "t" ? "T" : "CT"}`,
      `bot_add_${botSide}`,
      "bot_quota 1",
      "mp_restartgame 1",
      "",
    ].join("\n"),
    restore: ["bot_kick", "css_exitprac"],
  };
}
