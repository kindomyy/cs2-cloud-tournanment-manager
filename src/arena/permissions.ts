import type { ArenaConfig, ManagedTeam, Session } from "./model";
import type { MatchRuntime } from "./operations";

export type AccessRole = "visitor" | "player" | "captain" | "admin";
/** Role assignments come from the saved roster and authenticated session. */
export function accessFor(config: Pick<ArenaConfig, "teams">, me: Session) {
  if (me?.role === "admin")
    return { role: "admin" as AccessRole, teamId: null, playerId: null };
  const team = me?.role === "player" && me.steamId
    ? config.teams.find((t) => t.roster.some((p) => p.steamId === me.steamId))
    : undefined;
  const player = team?.roster.find((p) => p.steamId === me?.steamId);
  return {
    role: (player ? team?.captainId === player.id ? "captain" : "player" : "visitor") as AccessRole,
    teamId: team?.id || null,
    playerId: player?.id || null,
  };
}
export function canManageTeam(me: Session, team: ManagedTeam) {
  return me?.role === "admin" ||
    (me?.role === "player" && !!me.steamId &&
      team.roster.some((p) => p.id === team.captainId && p.steamId === me.steamId));
}
export function canReady(me: Session, team: ManagedTeam) {
  return me?.role === "player" && !!me.steamId &&
    team.roster.some((p) => p.steamId === me.steamId);
}
export function isActiveRuntime(runtime?: Pick<MatchRuntime, "phase">) {
  return !!runtime && ["preparing", "veto", "veto-complete", "loading", "warmup", "live", "paused", "restoring"].includes(runtime.phase);
}
export function canJoinServer(
  config: Pick<ArenaConfig, "teams">,
  me: Session,
  runtimes: Record<string, Pick<MatchRuntime, "phase" | "teams">> = {},
) {
  if (accessFor(config, me).role !== "visitor") return true;
  if (me?.role !== "player" || !me.steamId) return false;
  return Object.values(runtimes).some((runtime) =>
    isActiveRuntime(runtime) &&
    runtime.teams?.some((team) => canReady(me, team)),
  );
}
