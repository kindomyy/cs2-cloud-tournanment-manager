import { matchDefinitions, teams, type MapScore } from "../src/data";
import { mapNames, validateResult } from "../src/tournament/engine";
import type { LiveMatch, PlayerStats } from "../src/tournament/liveTypes";

export type Binding = {
  matchId: string;
  team1: string;
  team2: string;
  maps: string[];
  format?: "BO1" | "BO3";
  roster?: Record<string, string>;
};
export type MapSnapshot = {
  externalId: string;
  matchId: string;
  a: string;
  b: string;
  number: number;
  map: MapScore;
  players: PlayerStats[];
  updatedAt: string;
  finalized: boolean;
};
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Nesne bekleniyor.");
  return v as Record<string, unknown>;
};
const integer = (v: unknown, max = 10000) => {
  if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > max)
    throw new Error("Geçersiz sayaç.");
  return v as number;
};

export function parseBindings(
  raw: string,
  allowedTeams = teams,
): Record<string, Binding> {
  const entries = Object.entries(object(JSON.parse(raw)));
  const used = new Set<string>();
  if (entries.length > 15) throw new Error("En fazla 15 maç bağlanabilir.");
  return Object.fromEntries(
    entries.map(([id, value]) => {
      const b = object(value);
      const def = matchDefinitions.find((m) => m.id === b.matchId);
      if (
        !/^\d{1,15}$/.test(id) ||
        !def ||
        used.has(def.id) ||
        !allowedTeams.some((t) => t.id === b.team1) ||
        !allowedTeams.some((t) => t.id === b.team2) ||
        b.team1 === b.team2 ||
        !Array.isArray(b.maps) ||
        b.maps.length !== (def.format === "BO1" ? 1 : 3) ||
        b.maps.some((m) => !mapNames.includes(m)) ||
        new Set(b.maps).size !== b.maps.length
      )
        throw new Error("Geçersiz maç eşleştirmesi.");
      used.add(def.id);
      return [
        id,
        {
          matchId: def.id,
          team1: b.team1 as string,
          team2: b.team2 as string,
          maps: b.maps as string[],
        },
      ];
    }),
  );
}

export function normalizeEvent(
  input: unknown,
  bindings: Record<string, Binding>,
  now = new Date().toISOString(),
): MapSnapshot | null {
  const event = object(input);
  if (!["round_end", "map_result"].includes(event.event as string)) return null;
  const externalId = String(integer(event.matchid, Number.MAX_SAFE_INTEGER));
  const binding = bindings[externalId];
  if (!binding) throw new Error("Maç eşleştirmesi bulunamadı.");
  const number = integer(event.map_number, 2);
  if (!binding.maps[number]) throw new Error("Harita sırası geçersiz.");
  const players: PlayerStats[] = [];
  const seen = new Set<string>();
  const score = [event.team1, event.team2].map((raw, index) => {
    const team = object(raw);
    if (!Array.isArray(team.players) || team.players.length > 10)
      throw new Error("Oyuncu listesi geçersiz.");
    for (const rawPlayer of team.players) {
      const player = object(rawPlayer),
        stats = object(player.stats);
      if (
        typeof player.steamid !== "string" ||
        !/^\d{17}$/.test(player.steamid) ||
        seen.has(player.steamid) ||
        typeof player.name !== "string" ||
        player.name.length > 80
      )
        throw new Error("Oyuncu kimliği geçersiz.");
      seen.add(player.steamid);
      if (
        binding.roster &&
        binding.roster[player.steamid] !==
          (index === 0 ? binding.team1 : binding.team2)
      )
        throw new Error("Sunucudaki oyuncu 1v1 kadrosuyla uyuşmuyor.");
      const kills = integer(stats.kills),
        headshotKills = integer(stats.headshot_kills);
      if (headshotKills > kills)
        throw new Error("Kafa vuruşu sayısı kill sayısını aşamaz.");
      players.push({
        steamId: player.steamid,
        name: player.name,
        teamId: index === 0 ? binding.team1 : binding.team2,
        kills,
        deaths: integer(stats.deaths),
        assists: integer(stats.assists),
        headshotKills,
        ...(stats.damage !== undefined
          ? { damage: integer(stats.damage, 1000000) }
          : {}),
        ...(stats.rounds_played !== undefined
          ? { roundsPlayed: integer(stats.rounds_played, 1000) }
          : {}),
      });
    }
    return integer(team.score, 100);
  }) as [number, number];
  const map: MapScore = {
    name: binding.maps[number],
    score,
    status: event.event === "map_result" ? "completed" : "live",
  };
  // A final round_end can already carry a winning score, before map_result arrives.
  if (map.status === "live") {
    try {
      validateResult(
        { ...matchDefinitions[0], a: binding.team1, b: binding.team2 },
        { status: "completed", score },
      );
      map.status = "completed";
    } catch {
      /* Still live. */
    }
  }
  validateResult(
    { ...matchDefinitions[0], a: binding.team1, b: binding.team2 },
    { status: map.status, score, map: map.name },
  );
  return {
    externalId,
    matchId: binding.matchId,
    a: binding.team1,
    b: binding.team2,
    number,
    map,
    players,
    updatedAt: now,
    finalized: event.event === "map_result",
  };
}

export function aggregateMaps(
  snapshots: MapSnapshot[],
  binding: Binding,
): LiveMatch | null {
  if (!snapshots.length) return null;
  const ordered = [...snapshots].sort((a, b) => a.number - b.number);
  // Do not invent a series score if a prior map's delivery is still missing.
  if (
    ordered.some(
      (s, index) =>
        s.number !== index ||
        s.matchId !== binding.matchId ||
        s.a !== binding.team1 ||
        s.b !== binding.team2 ||
        s.map.name !== binding.maps[index],
    )
  )
    return null;
  const maps = ordered.map((s) => s.map),
    wins: [number, number] = [0, 0];
  const totals = new Map<string, PlayerStats>();
  for (const snapshot of ordered) {
    if (snapshot.map.status === "completed")
      wins[snapshot.map.score[0] > snapshot.map.score[1] ? 0 : 1]++;
    for (const player of snapshot.players) {
      const old = totals.get(player.steamId);
      if (old && old.teamId !== player.teamId)
        throw new Error("Oyuncu seri içinde takım değiştiremez.");
      totals.set(
        player.steamId,
        old
          ? {
              ...player,
              kills: old.kills + player.kills,
              deaths: old.deaths + player.deaths,
              assists: old.assists + player.assists,
              headshotKills: old.headshotKills + player.headshotKills,
              damage:
                old.damage === undefined || player.damage === undefined
                  ? undefined
                  : old.damage + player.damage,
              roundsPlayed:
                old.roundsPlayed === undefined ||
                player.roundsPlayed === undefined
                  ? undefined
                  : old.roundsPlayed + player.roundsPlayed,
            }
          : { ...player },
      );
    }
  }
  const definition =
    matchDefinitions.find((m) => m.id === binding.matchId) ||
    (binding.format
      ? { ...matchDefinitions[0], id: binding.matchId, format: binding.format }
      : undefined);
  if (!definition) throw new Error("Maç formatı bulunamadı.");
  const status =
    definition.format === "BO1"
      ? maps[0].status
      : Math.max(...wins) === 2
        ? "completed"
        : "live";
  const result: LiveMatch = {
    id: binding.matchId,
    a: binding.team1,
    b: binding.team2,
    status,
    score: definition.format === "BO1" ? maps[0].score : wins,
    ...(definition.format === "BO1" ? { map: maps[0].name } : {}),
    maps,
    players: [...totals.values()],
    updatedAt: ordered
      .map((s) => s.updatedAt)
      .sort()
      .at(-1)!,
  };
  validateResult({ ...definition, a: binding.team1, b: binding.team2 }, result);
  return result;
}
