import type { MapScore } from "../data";
import type { Result } from "./engine";
export type PlayerStats = {
  steamId: string;
  name: string;
  teamId: string;
  kills: number;
  deaths: number;
  assists: number;
  headshotKills: number;
  damage?: number;
  roundsPlayed?: number;
};
export type LiveMatch = Result & {
  id: string;
  a: string;
  b: string;
  maps: MapScore[];
  players: PlayerStats[];
  updatedAt: string;
};
export type LiveFeed = { configured: boolean; matches: LiveMatch[] };
export const hsPercent = (p: Pick<PlayerStats, "kills" | "headshotKills">) =>
  p.kills === 0 ? 0 : (100 * p.headshotKills) / p.kills;
export function matchRating(p: PlayerStats) {
  if (p.damage === undefined || !p.roundsPlayed) return null;
  const rounds = p.roundsPlayed,
    adr = p.damage / rounds;
  // Arena 1.0: transparent, match-only performance indicator; not HLTV's proprietary rating.
  const rating =
    0.45 * (p.kills / rounds / 0.7) +
    0.35 * (adr / 80) +
    0.2 * (Math.max(0, rounds - p.deaths) / rounds / 0.32);
  return Math.min(3, Math.max(0, rating));
}
