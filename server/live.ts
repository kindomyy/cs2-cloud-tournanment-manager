import { loadArena, rows, type Env } from "./store";
import {
  parseBindings,
  aggregateMaps,
  type Binding,
  type MapSnapshot,
} from "./matchzy";
import { rosterSignature, type ArenaConfig } from "../src/arena/model";
import { project } from "../src/tournament/engine";
import { vetoDone, vetoMaps, type VetoState } from "../src/arena/veto";
import { activeRuntimes, runtimesForIds } from "./opsStore";
import type { MatchRuntime } from "../src/arena/operations";

export type LivePreload = {
  config: ArenaConfig;
  vetos: VetoState[];
  runtime: Record<string, MatchRuntime>;
};

export async function resolvedBindings(
  env: Env,
  preloaded?: LivePreload,
): Promise<Record<string, Binding>> {
  let bindings: Record<string, Binding> = {};
  try {
    const config = preloaded ? preloaded.config : (await loadArena(env)).config;
    const view = project(config.state, config.teams);
    bindings =
      config.legacyBindings !== false && env.MATCHZY_BINDINGS
        ? parseBindings(env.MATCHZY_BINDINGS, config.teams)
        : {};
    const parsedVetos = preloaded
      ? preloaded.vetos
      : (await rows<{ state: string }>(env, "SELECT state FROM match_veto")).map(
          (r) => JSON.parse(r.state) as VetoState,
        );
    const runtime = preloaded ? preloaded.runtime : await activeRuntimes(env, config);
    const signature = rosterSignature(config);
    const vetoByMatch = new Map<string, VetoState>();
    for (const v of parsedVetos) {
      if (v.rehearsal) continue;
      const rt = runtime[v.matchId];
      if (
        (rt?.teams?.[0].id === v.a && rt?.teams?.[1].id === v.b) ||
        v.rosterKey === signature
      ) {
        vetoByMatch.set(v.matchId, v);
      }
    }
    for (const match of view.matches) {
      const veto = vetoByMatch.get(match.id);
      const s = config.schedule[match.id];
      const maps = veto && vetoDone(veto) ? vetoMaps(veto) : s.maps || [];
      const a = veto?.a || s.a || match.a,
        b = veto?.b || s.b || match.b;
      if (maps.length === (match.format === "BO1" ? 1 : 3) && a && b) {
        for (const key of Object.keys(bindings))
          if (bindings[key].matchId === match.id) delete bindings[key];
        bindings[s.externalId] = {
          matchId: match.id,
          team1: a,
          team2: b,
          maps,
          ...(runtime[match.id]?.teams
            ? {
                roster: Object.fromEntries(
                  runtime[match.id].teams!.flatMap((t) =>
                    t.roster
                      .filter((p) => p.steamId)
                      .map((p) => [p.steamId!, t.id]),
                  ),
                ),
              }
            : {}),
        };
      }
    }
  } catch {
    if (env.MATCHZY_BINDINGS) bindings = parseBindings(env.MATCHZY_BINDINGS);
    if (!Object.keys(bindings).length)
      throw new Error("Maç eşleştirmeleri hazır değil.");
  }
  return bindings;
}
export async function readLive(
  env: Env,
  bindings?: Record<string, Binding>,
  preloaded?: LivePreload,
) {
  const configured = bindings || (await resolvedBindings(env, preloaded)),
    ids = Object.keys(configured);
  if (!ids.length) return [];
  const snapshots = (
    await rows<{ snapshot: string }>(
      env,
      `SELECT snapshot FROM matchzy_maps WHERE external_id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    )
  ).map((r) => JSON.parse(r.snapshot) as MapSnapshot);
  const runtimeList = preloaded
    ? Object.values(preloaded.runtime)
    : await runtimesForIds(env, ids);
  const runtimeByExternal = new Map<string, MatchRuntime>(
    runtimeList.map((r) => [r.externalId, r]),
  );
  const snapshotsByExternal = new Map<string, MapSnapshot[]>();
  for (const s of snapshots) {
    const rt = runtimeByExternal.get(s.externalId);
    if (
      rt &&
      (rt.phase === "cancelled" ||
        (rt.restorePending && s.number >= (rt.mapNumber || 0)))
    )
      continue;
    let list = snapshotsByExternal.get(s.externalId);
    if (!list) {
      list = [];
      snapshotsByExternal.set(s.externalId, list);
    }
    list.push(s);
  }
  return ids
    .map((id) => aggregateMaps(snapshotsByExternal.get(id) || [], configured[id]))
    .filter((m): m is NonNullable<typeof m> => !!m);
}
