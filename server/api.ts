import { normalizeEvent } from "./matchzy";
import {
  type Env,
  loadArena,
  atomic,
  json,
  BodyError,
  readBoundedText,
  validWebhookSecret,
} from "./store";
export type { Env } from "./store";
import { resolvedBindings, readLive } from "./live";
import { duelBindings } from "./duelStore";
import { lifecycle, recordContact, mayAcceptSnapshot } from "./events";
import { activeRuntimes, saveRuntime, freezeTeams } from "./opsStore";
const missingTable = (error: unknown) =>
  error instanceof Error && /no such table/i.test(error.message);
const upsert = `INSERT INTO matchzy_maps (external_id, map_number, round_count, completed, finalized, snapshot)
 VALUES (?, ?, ?, ?, ?, ?)
 ON CONFLICT(external_id, map_number) DO UPDATE SET round_count=excluded.round_count, completed=excluded.completed, finalized=excluded.finalized, snapshot=excluded.snapshot
 WHERE (matchzy_maps.completed=0 AND excluded.round_count>matchzy_maps.round_count)
 OR (matchzy_maps.completed=0 AND excluded.completed=1 AND excluded.round_count>=matchzy_maps.round_count)
 OR (matchzy_maps.completed=1 AND matchzy_maps.finalized=0 AND excluded.finalized=1 AND excluded.round_count=matchzy_maps.round_count AND json_extract(matchzy_maps.snapshot,'$.map.score')=json_extract(excluded.snapshot,'$.map.score'))`;

export async function webhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST gerekli." }, 405);
  if (
    !env.DB ||
    !env.MATCHZY_WEBHOOK_SECRET ||
    env.MATCHZY_WEBHOOK_SECRET.length < 24
  )
    return json({ error: "Sunucu bağlantısı henüz yapılandırılmadı." }, 503);
  if (!(await validWebhookSecret(request, env)))
    return json({ error: "Yetkisiz istek." }, 401);
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    return json({ error: "JSON gerekli." }, 415);
  try {
    const text = await readBoundedText(request, 65536, {
      tooLarge: "İstek fazla büyük.",
      empty: "Boş istek.",
    });
    const bindings = {
      ...(await resolvedBindings(env)),
      ...(await duelBindings(env)),
    };
    const event = JSON.parse(text);
    const handled = await lifecycle(event, env, bindings);
    if (handled) return handled;
    const snapshot = normalizeEvent(event, bindings);
    if (!snapshot) return json({ ignored: true }, 202);
    const gate = await mayAcceptSnapshot(env, snapshot);
    if (!gate.accept)
      return json({ ignored: true, reason: "restore-round-order" }, 202);
    let managed;
    try {
      managed = (await loadArena(env)).config;
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
    if (managed && !bindings[snapshot.externalId].roster)
      for (const player of snapshot.players) {
        const roster = managed.teams.find(
          (t) => t.id === player.teamId,
        )?.roster;
        if (
          roster?.some((p) => p.steamId) &&
          !roster.some((p) => p.steamId === player.steamId)
        )
          return json(
            { error: "Sunucudaki oyuncu kayıtlı kadroyla uyuşmuyor." },
            422,
          );
      }
    if (snapshot.players.length) {
      try {
        await atomic(
          env,
          snapshot.players.map((player) =>
            env
              .DB!.prepare("UPDATE steam_users SET game_name=? WHERE steam_id=?")
              .bind(player.name, player.steamId),
          ),
        );
      } catch (error) {
        if (!missingTable(error)) throw error;
      }
    }
    const statement = env.DB.prepare(upsert).bind(
      snapshot.externalId,
      snapshot.number,
      snapshot.map.score[0] + snapshot.map.score[1],
      snapshot.map.status === "completed" ? 1 : 0,
      snapshot.finalized ? 1 : 0,
      JSON.stringify(snapshot),
    );
    if (gate.replacing)
      await atomic(env, [
        env.DB.prepare(
          "DELETE FROM matchzy_maps WHERE external_id=? AND map_number>=?",
        ).bind(snapshot.externalId, snapshot.number),
        statement,
      ]);
    else await statement.run();
    if (
      gate.replacing ||
      !gate.runtime ||
      !["completed", "cancelled"].includes(gate.runtime.phase)
    ) {
      const matches = await readLive(env, {
        [snapshot.externalId]: bindings[snapshot.externalId],
      });
      const lineup = managed?.teams.filter(
        (t) => t.id === snapshot.a || t.id === snapshot.b,
      );
      await saveRuntime(env, {
        ...gate.runtime,
        ...(gate.runtime?.teams
          ? {}
          : lineup?.length === 2
            ? {
                teams: freezeTeams([
                  lineup.find((t) => t.id === snapshot.a)!,
                  lineup.find((t) => t.id === snapshot.b)!,
                ]),
              }
            : {}),
        matchId: snapshot.matchId,
        externalId: snapshot.externalId,
        phase:
          matches[0]?.status === "completed"
            ? "completed"
            : gate.runtime?.phase === "paused"
              ? "paused"
              : "live",
        mapNumber: snapshot.number,
        restorePending: false,
        lastEvent: event.event,
        lastEventAt: snapshot.updatedAt,
      });
    }
    await recordContact(env, event.event, snapshot.matchId);
    return json({ accepted: true });
  } catch (error) {
    // Configuration and database faults must stay retryable; never expose secrets/payloads.
    if (error instanceof BodyError)
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return json({ error: "Geçersiz JSON." }, 400);
    if (error instanceof Error && /D1|SQL|database|table/i.test(error.message))
      return json({ error: "Veri kaydı kullanılamıyor." }, 503);
    return json({ error: "Olay veya maç eşleştirmesi geçersiz." }, 422);
  }
}

export async function liveMatches(env: Env): Promise<Response> {
  if (!env.DB) return json({ configured: false, matches: [] }, 503);
  try {
    const matches = await readLive(env);
    try {
      const { config } = await loadArena(env);
      const runtime = await activeRuntimes(env, config);
      const defaultNames = new Map<string, string>();
      for (const t of config.teams)
        for (const p of t.roster) if (p.steamId) defaultNames.set(p.steamId, p.name);
      for (const match of matches) {
        const frozenTeams = runtime[match.id]?.teams;
        const names = frozenTeams
          ? new Map(
              frozenTeams.flatMap((t) =>
                t.roster
                  .filter((p) => p.steamId)
                  .map((p) => [p.steamId!, p.name] as const),
              ),
            )
          : defaultNames;
        for (const player of match.players) {
          const name = names.get(player.steamId);
          if (name) player.name = name;
        }
      }
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
    return json({ configured: true, matches });
  } catch {
    return json({ error: "Canlı veriler şu anda alınamıyor." }, 503);
  }
}
