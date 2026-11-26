import type { Team } from "../data";

export const openingMatches = [
  { id: "U1", seeds: [1, 8] },
  { id: "U2", seeds: [4, 5] },
  { id: "U3", seeds: [2, 7] },
  { id: "U4", seeds: [3, 6] },
] as const;

// Each seed is a bracket slot. Moving a team swaps the two occupied slots so
// every team keeps one opponent and all projections use the same assignment.
export function assignOpeningTeam<T extends Pick<Team, "id" | "seed">>(
  teams: T[],
  teamId: string,
  seed: number,
): T[] {
  const selected = teams.find((team) => team.id === teamId);
  if (!selected || !Number.isInteger(seed) || seed < 1 || seed > 8)
    throw new Error("İlk tur için geçerli bir takım ve maç yeri seç.");
  return teams.map((team) => ({
    ...team,
    seed:
      team.id === teamId
        ? seed
        : team.seed === seed
          ? selected.seed
          : team.seed,
  }));
}
