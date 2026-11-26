import type { Match } from "../data";
import type { ArenaConfig } from "./model";
import type { MatchRuntime } from "./operations";

export function activePresentationMatch(
  config: Pick<ArenaConfig, "presentation">,
  matches: readonly Match[],
  runtimes: Record<string, MatchRuntime> = {},
) {
  const id = config.presentation?.activeMatchId;
  if (!id) return undefined;
  return matches.find((match) => match.id === id && match.a && match.b &&
    match.status !== "completed" &&
    !["completed", "cancelled"].includes(runtimes[match.id]?.phase || ""));
}
