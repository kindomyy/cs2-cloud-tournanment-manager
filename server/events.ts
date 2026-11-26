import type { Binding, MapSnapshot } from "./matchzy";
import { json, loadArena, rows, type Env } from "./store";
import {
  runtimeFor,
  saveRuntime,
  setMeta,
  audit,
  missingOps,
} from "./opsStore";
import { recoveryPlan, applyRecovery } from "./recovery";
import type { MatchRuntime } from "../src/arena/operations";
const supported = new Set([
  "series_start",
  "going_live",
  "game_paused",
  "game_unpaused",
  "backup_loaded",
  "series_end",
]);
export async function recordContact(env: Env, event: string, matchId?: string) {
  try {
    await setMeta(env, "webhook", {
      at: new Date().toISOString(),
      event,
      matchId: matchId || null,
    });
  } catch (error) {
    if (!missingOps(error)) throw error;
  }
}
export async function lifecycle(
  event: Record<string, unknown>,
  env: Env,
  bindings: Record<string, Binding>,
) {
  if (typeof event.event !== "string" || !supported.has(event.event))
    return null;
  if (!Number.isSafeInteger(event.matchid) || Number(event.matchid) < 0)
    throw new Error("Maç kimliği geçersiz.");
  const id = String(event.matchid),
    binding = bindings[id];
  if (!binding) throw new Error("Maç eşleştirmesi bulunamadı.");
  const old = await runtimeFor(env, id);
  const runtime: MatchRuntime = old || {
    matchId: binding.matchId,
    externalId: id,
    phase: "warmup",
  };
  if (
    ["completed", "cancelled"].includes(runtime.phase) &&
    event.event !== "series_end"
  )
    return json({ ignored: true }, 202);
  if (
    event.map_number !== undefined &&
    (!Number.isInteger(event.map_number) ||
      Number(event.map_number) < 0 ||
      Number(event.map_number) >= binding.maps.length)
  )
    throw new Error("Harita sırası geçersiz.");
  const now = new Date().toISOString();
  if (event.event === "backup_loaded") {
    if (
      !Number.isInteger(event.round_number) ||
      Number(event.round_number) < 0 ||
      Number(event.round_number) > 200 ||
      !Number.isInteger(event.map_number)
    )
      throw new Error("Backup raundu geçersiz.");
    const key = `${event.map_number}:${event.round_number}:${typeof event.filename === "string" ? event.filename.slice(0, 180) : ""}`;
    if (runtime.lastBackupKey === key) return json({ ignored: true }, 202);
    if (!binding.matchId.startsWith("duel-")) {
      const { config } = await loadArena(env);
      if (config.overrides.includes(binding.matchId))
        return json({ ignored: true, reason: "manual-result" }, 202);
      const plan = await recoveryPlan(env, binding.matchId, false);
      await applyRecovery(env, plan);
    }
    runtime.phase = "restoring";
    runtime.restorePending = true;
    runtime.restoreRound = Number(event.round_number);
    runtime.mapNumber = Number(event.map_number);
    runtime.lastBackupKey = key;
    runtime.barrierAt = now;
    runtime.strictRounds = true;
    await audit(env, "server", "backup-loaded", binding.matchId, {
      round: runtime.restoreRound,
      map: runtime.mapNumber,
    });
  } else if (event.event === "series_start") {
    if (["live", "paused", "restoring"].includes(runtime.phase))
      return json({ ignored: true }, 202);
    runtime.phase = "warmup";
  } else if (event.event === "going_live") {
    if (!runtime.restorePending) runtime.phase = "live";
  } else if (event.event === "game_paused") {
    if (!runtime.restorePending) runtime.phase = "paused";
  } else if (event.event === "game_unpaused") {
    if (!runtime.restorePending) runtime.phase = "live";
  } else if (event.event === "series_end") {
    const { readLive } = await import("./live");
    const matches = await readLive(env, { [id]: binding });
    // Winner metadata alone must never invent a score or a forfeit.
    runtime.phase =
      runtime.phase === "completed" || matches[0]?.status === "completed"
        ? "completed"
        : event.winner && (event.winner as { team?: unknown }).team !== "none"
          ? "review"
          : "cancelled";
    await audit(env, "server", "series-end", binding.matchId, {
      phase: runtime.phase,
    });
  }
  runtime.lastEvent = event.event;
  runtime.lastEventAt = now;
  if (Number.isInteger(event.map_number))
    runtime.mapNumber = Number(event.map_number);
  await saveRuntime(env, runtime);
  await recordContact(env, event.event, binding.matchId);
  try {
    await env
      .DB!.prepare(
        "UPDATE server_jobs SET status=?,expires=0 WHERE external_id=?",
      )
      .bind(event.event === "series_end" ? "idle" : "active", id)
      .run();
  } catch (error) {
    if (!missingOps(error)) throw error;
  }
  return json({ accepted: true });
}
export async function mayAcceptSnapshot(env: Env, snapshot: MapSnapshot) {
  const runtime = await runtimeFor(env, snapshot.externalId);
  if (!runtime) return { accept: true, replacing: false, runtime };
  if (runtime.phase === "cancelled")
    return { accept: false, replacing: false, runtime };
  const count = snapshot.map.score[0] + snapshot.map.score[1];
  if (runtime.restorePending)
    return {
      accept:
        snapshot.number === runtime.mapNumber &&
        count === (runtime.restoreRound || 0) + 1,
      replacing: true,
      runtime,
    };
  if (runtime.strictRounds) {
    const previous = await rows<{ round_count: number }>(
      env,
      "SELECT round_count FROM matchzy_maps WHERE external_id=? AND map_number=?",
      snapshot.externalId,
      snapshot.number,
    );
    if (count > (previous[0]?.round_count || 0) + 1)
      return { accept: false, replacing: false, runtime };
  }
  return { accept: true, replacing: false, runtime };
}
