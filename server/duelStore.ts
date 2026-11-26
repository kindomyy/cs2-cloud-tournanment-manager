import { rows, type Env } from "./store";
import { vetoDone, vetoMaps } from "../src/arena/veto";
import type { Duel } from "../src/arena/duel";
import type { Binding } from "./matchzy";

export async function allDuels(env: Env) {
  return (
    await rows<{ state: string }>(
      env,
      "SELECT state FROM private_duels ORDER BY updated_at DESC",
    )
  ).map((r) => JSON.parse(r.state) as Duel);
}
export function duelBinding(duel: Duel): Binding | null {
  if (!duel.veto || !vetoDone(duel.veto)) return null;
  return {
    matchId: duel.id,
    team1: "duel-a",
    team2: "duel-b",
    format: "BO1",
    maps: vetoMaps(duel.veto),
    roster: {
      [duel.players[0].steamId]: "duel-a",
      [duel.players[1].steamId]: "duel-b",
    },
  };
}
export async function duelBindings(env: Env): Promise<Record<string, Binding>> {
  let duels: Duel[];
  try {
    duels = await allDuels(env);
  } catch (error) {
    // Existing tournament installations keep working before migration 0003.
    if (
      error instanceof Error &&
      /no such table:\s*private_duels/i.test(error.message)
    )
      return {};
    throw error;
  }
  return Object.fromEntries(
    duels
      .filter((d) => !d.closed && duelBinding(d))
      .map((d) => [d.externalId, duelBinding(d)!]),
  );
}
