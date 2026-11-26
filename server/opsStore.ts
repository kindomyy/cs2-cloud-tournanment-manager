import { rows, type Env } from "./store";
import type { MatchRuntime } from "../src/arena/operations";
import type { ArenaConfig, ManagedTeam, Session } from "../src/arena/model";
export const missingOps = (error: unknown) =>
  error instanceof Error &&
  /no such table:.*(?:match_runtime|arena_audit|arena_meta|server_jobs|steam_returns|server_tickets|arena_backups)/i.test(
    error.message,
  );
export async function runtimes(env: Env): Promise<MatchRuntime[]> {
  try {
    return (
      await rows<{ state: string }>(env, "SELECT state FROM match_runtime")
    ).map((r) => JSON.parse(r.state));
  } catch (error) {
    if (missingOps(error)) return [];
    throw error;
  }
}
export async function runtimeFor(env: Env, externalId: string): Promise<MatchRuntime | undefined> {
  try {
    const found = await rows<{ state: string }>(
      env,
      "SELECT state FROM match_runtime WHERE external_id=?",
      externalId,
    );
    return found[0] ? (JSON.parse(found[0].state) as MatchRuntime) : undefined;
  } catch (error) {
    if (missingOps(error)) return undefined;
    throw error;
  }
}
export async function runtimesForIds(env: Env, externalIds: string[]): Promise<MatchRuntime[]> {
  if (!externalIds.length) return [];
  const unique = [...new Set(externalIds)];
  try {
    return (
      await rows<{ state: string }>(
        env,
        `SELECT state FROM match_runtime WHERE external_id IN (${unique.map(() => "?").join(",")})`,
        ...unique,
      )
    ).map((r) => JSON.parse(r.state) as MatchRuntime);
  } catch (error) {
    if (missingOps(error)) return [];
    throw error;
  }
}
export async function saveRuntime(env: Env, value: MatchRuntime) {
  try {
    await env
      .DB!.prepare(
        "INSERT INTO match_runtime(external_id,match_id,state,updated_at) VALUES(?,?,?,?) ON CONFLICT(external_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at",
      )
      .bind(value.externalId, value.matchId, JSON.stringify(value), Date.now())
      .run();
  } catch (error) {
    if (!missingOps(error)) throw error;
  }
}
export function freezeTeams(teams: ManagedTeam[]): [ManagedTeam, ManagedTeam] {
  return teams.map((t) => {
    const { logo: _logo, ...rest } = structuredClone(t);
    return rest;
  }) as [ManagedTeam, ManagedTeam];
}
export async function activeRuntimes(env: Env, config: ArenaConfig) {
  const ids = Object.values(config.schedule).map((s) => s.externalId);
  return Object.fromEntries(
    (await runtimesForIds(env, ids))
      .filter((r) => config.schedule[r.matchId]?.externalId === r.externalId)
      .map((r) => [r.matchId, r]),
  );
}
export async function audit(
  env: Env,
  actor: Session | "server",
  action: string,
  matchId = "",
  detail: Record<string, unknown> = {},
) {
  try {
    await env
      .DB!.prepare(
        "INSERT INTO arena_audit(id,at,actor,action,match_id,detail) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        Date.now(),
        actor === "server"
          ? "MatchZy"
          : actor?.steamId || actor?.role || "system",
        action,
        matchId || null,
        JSON.stringify(detail),
      )
      .run();
    await env
      .DB!.prepare(
        "DELETE FROM arena_audit WHERE id IN (SELECT id FROM arena_audit ORDER BY at DESC LIMIT -1 OFFSET 2000)",
      )
      .run();
  } catch (error) {
    if (!missingOps(error)) throw error;
  }
}
export async function setMeta(env: Env, key: string, value: unknown) {
  await env
    .DB!.prepare(
      "INSERT INTO arena_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(key, JSON.stringify(value))
    .run();
}
export async function meta<T>(env: Env, key: string): Promise<T | null> {
  const records = await rows<{ value: string }>(
    env,
    "SELECT value FROM arena_meta WHERE key=?",
    key,
  );
  return records[0] ? JSON.parse(records[0].value) : null;
}
