import type { Match, Team } from "../data";
import type { LiveMatch, PlayerStats } from "./liveTypes";
import { matchRating } from "./liveTypes";
export function tournamentResults(
  matches: Match[],
  teams: Team[],
  live: Record<string, LiveMatch>,
  champion?: string,
) {
  const completed = matches.filter(
    (m) => m.status === "completed" && m.a && m.b && !m.id.startsWith("duel-"),
  );
  const standings = teams
    .map((team) => {
      const played = completed.filter(
          (m) => m.a === team.id || m.b === team.id,
        ),
        wins = played.filter(
          (m) => m.score && (m.score[0] > m.score[1] ? m.a : m.b) === team.id,
        ).length;
      return {
        team,
        played: played.length,
        wins,
        losses: played.length - wins,
        champion: team.id === champion,
      };
    })
    .sort(
      (a, b) =>
        Number(b.champion) - Number(a.champion) ||
        b.wins - a.wins ||
        a.losses - b.losses ||
        a.team.seed - b.team.seed,
    );
  const players = new Map<
    string,
    PlayerStats & { matches: number; completeDamage: boolean }
  >();
  let covered = 0;
  for (const match of completed) {
    if (match.resolution === "forfeit") continue;
    const data = live[match.id];
    if (
      !data ||
      data.status !== "completed" ||
      data.a !== match.a ||
      data.b !== match.b ||
      !data.players.length
    )
      continue;
    covered++;
    for (const p of data.players) {
      const key = p.steamId + ":" + p.teamId,
        prev = players.get(key);
      players.set(key, {
        ...p,
        kills: (prev?.kills || 0) + p.kills,
        deaths: (prev?.deaths || 0) + p.deaths,
        assists: (prev?.assists || 0) + p.assists,
        headshotKills: (prev?.headshotKills || 0) + p.headshotKills,
        damage: (prev?.damage || 0) + (p.damage || 0),
        roundsPlayed: (prev?.roundsPlayed || 0) + (p.roundsPlayed || 0),
        completeDamage:
          (prev?.completeDamage ?? true) &&
          p.damage !== undefined &&
          !!p.roundsPlayed,
        matches: (prev?.matches || 0) + 1,
      });
    }
  }
  const ranked = [...players.values()]
    .map((p) => ({ ...p, rating: p.completeDamage ? matchRating(p) : null }))
    .sort(
      (a, b) =>
        (b.rating ?? -1) - (a.rating ?? -1) ||
        b.kills - a.kills ||
        a.deaths - b.deaths ||
        a.name.localeCompare(b.name),
    );
  const final =
    completed.find((m) => m.id === "GF2") ||
    completed.find((m) => m.id === "GF");
  const runnerUp =
    champion && final ? (final.a === champion ? final.b : final.a) : undefined;
  return {
    completed,
    standings,
    players: ranked,
    covered,
    eligible: completed.filter((m) => m.resolution !== "forfeit").length,
    runnerUp,
  };
}
