import { matchDefinitions, type Team } from "../data";
import { emptyState, project } from "./engine";
import type { LiveMatch } from "./liveTypes";
export function stateFromFeed(
  matches: LiveMatch[],
  base = emptyState(),
  teams?: Team[],
  overrides: string[] = [],
) {
  const state = structuredClone(base),
    accepted: Record<string, LiveMatch> = {},
    conflicts: string[] = [];
  for (const def of matchDefinitions) {
    const incoming = matches.find((m) => m.id === def.id);
    if (!incoming) continue;
    const expected = project(state, teams).byId[def.id];
    if (!expected || expected.a !== incoming.a || expected.b !== incoming.b) {
      conflicts.push(def.id);
      continue;
    }
    if (!overrides.includes(def.id)) {
      state.results[def.id] = {
        status: incoming.status,
        score: incoming.score,
        maps: incoming.maps,
        ...(incoming.map ? { map: incoming.map } : {}),
      };
      accepted[def.id] = incoming;
    }
  }
  return { state, accepted, conflicts };
}
