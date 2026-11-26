import { runtimesForIds, missingOps, audit } from "./opsStore";
import { session } from "./auth";
import {
  body,
  json,
  rows,
  originAllowed,
  loadArena,
  validWebhookSecret,
  type Env,
} from "./store";
import { displayName, newMatchId } from "../src/arena/model";
import { moveVeto, vetoDone, vetoMaps, vetoTurn } from "../src/arena/veto";
import type { Duel, DuelPlayer } from "../src/arena/duel";
import { allDuels, duelBinding } from "./duelStore";
import { aggregateMaps, type Binding, type MapSnapshot } from "./matchzy";
import type { MatchRuntime } from "../src/arena/operations";

async function loadDuel(env: Env, id: string) {
  const records = await rows<{ state: string }>(
    env,
    "SELECT state FROM private_duels WHERE id=?",
    id,
  );
  return records.length ? (JSON.parse(records[0].state) as Duel) : null;
}
function maySee(duel: Duel, me: Awaited<ReturnType<typeof session>>) {
  return (
    me?.role === "admin" || (me?.role === "player" && duel.players.some((p) => p.steamId === me.steamId))
  );
}
async function views(env: Env, list: Duel[]) {
  if (!list.length) return [];
  const externalIds = list.map((d) => d.externalId);
  const bindings = new Map<string, Binding>();
  for (const duel of list) {
    const binding = duelBinding(duel);
    if (binding) bindings.set(duel.externalId, binding);
  }
  const boundIds = [...bindings.keys()];
  const [runtimeList, rawSnapshots] = await Promise.all([
    runtimesForIds(env, externalIds),
    boundIds.length
      ? rows<{ snapshot: string }>(
          env,
          `SELECT snapshot FROM matchzy_maps WHERE external_id IN (${boundIds.map(() => "?").join(",")})`,
          ...boundIds,
        )
      : Promise.resolve([]),
  ]);
  const runtimeByExternal = new Map<string, MatchRuntime>(
    runtimeList.map((r) => [r.externalId, r]),
  );
  const snapshotsByExternal = new Map<string, MapSnapshot[]>();
  for (const row of rawSnapshots) {
    const s = JSON.parse(row.snapshot) as MapSnapshot;
    const rt = runtimeByExternal.get(s.externalId);
    if (
      rt &&
      (rt.phase === "cancelled" ||
        (rt.restorePending && s.number >= (rt.mapNumber || 0)))
    )
      continue;
    let bucket = snapshotsByExternal.get(s.externalId);
    if (!bucket) {
      bucket = [];
      snapshotsByExternal.set(s.externalId, bucket);
    }
    bucket.push(s);
  }
  return list.map((duel) => {
    const binding = bindings.get(duel.externalId);
    const live = binding
      ? aggregateMaps(snapshotsByExternal.get(duel.externalId) || [], binding)
      : null;
    if (live)
      live.players = live.players.map((p) => ({
        ...p,
        name: duel.players.find((d) => d.steamId === p.steamId)?.name || p.name,
      }));
    return {
      ...duel,
      runtime: runtimeByExternal.get(duel.externalId),
      live,
    };
  });
}
export async function duels(request: Request, env: Env) {
  if (!env.DB)
    return json({ error: "1v1 için çevrimiçi D1 bağlantısı gerekli." }, 503);
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "GET veya POST gerekli." }, 405);
  if (request.method === "POST" && !originAllowed(request, env))
    return json({ error: "Geçersiz kaynak." }, 403);
  const me = await session(request, env);
  const id = new URL(request.url).searchParams.get("id");
  if (request.method === "GET") {
    if (!me)
      return json({ me, rooms: [], steamConfigured: !!env.PUBLIC_ORIGIN });
    const rooms = id
      ? [await loadDuel(env, id)].filter((d): d is Duel => !!d)
      : await allDuels(env);
    if (id && (!rooms.length || !maySee(rooms[0], me)))
      return json(
        { error: "Oda bulunamadı veya bu odanın oyuncusu değilsin." },
        404,
      );
    const visible = rooms.filter((d) => maySee(d, me)).slice(0, 50);
    return json({
      me,
      serverTime: Date.now(),
      serverAddress: me.role === "admin" || visible.some((d) => !d.closed)
        ? (await loadArena(env)).config.server?.address || ""
        : "",
      rooms: await views(env, visible),
      steamConfigured: !!env.PUBLIC_ORIGIN,
    });
  }
  if (!me) return json({ error: "Önce Steam veya yönetici girişi yap." }, 401);
  const data = await body(request);
  if (data.action === "create") {
    if (me.role !== "admin")
      return json({ error: "Odayı yönetici açabilir." }, 403);
    if (!Array.isArray(data.players) || data.players.length !== 2)
      throw new Error("İki oyuncu gerekli.");
    const players = data.players.map((p: DuelPlayer) => {
      if (
        !p ||
        typeof p.steamId !== "string" ||
        !/^7656119\d{10}$/.test(p.steamId)
      )
        throw new Error("İki geçerli SteamID64 gir.");
      return { name: displayName(p.name), steamId: p.steamId };
    }) as [DuelPlayer, DuelPlayer];
    if (players[0].steamId === players[1].steamId)
      throw new Error("Oyuncuların SteamID64 bilgileri farklı olmalı.");
    const existing = await allDuels(env);
    if (existing.filter((d) => !d.closed).length >= 20)
      throw new Error(
        "Önce eski 1v1 odalarını kapat. En fazla 20 açık oda olabilir.",
      );
    const { config } = await loadArena(env);
    const history = await rows<{ external_id: string }>(
      env,
      "SELECT DISTINCT external_id FROM matchzy_maps",
    );
    const duel: Duel = {
      id: "duel-" + crypto.randomUUID(),
      externalId: newMatchId([
        ...existing.map((d) => d.externalId),
        ...Object.values(config.schedule).map((s) => s.externalId),
        ...history.map((s) => s.external_id),
      ]),
      revision: 0,
      players,
      ready: {},
      veto: null,
      closed: false,
      createdAt: Date.now(),
    };
    await env.DB.prepare(
      "INSERT INTO private_duels(id,external_id,revision,state,updated_at) VALUES(?,?,0,?,?)",
    )
      .bind(duel.id, duel.externalId, JSON.stringify(duel), Date.now())
      .run();
    await audit(env, me, "duel-create", duel.id, {
      externalId: duel.externalId,
    });
    return json({ ok: true, id: duel.id });
  }
  const duel =
    typeof data.id === "string" ? await loadDuel(env, data.id) : null;
  if (!duel || !maySee(duel, me))
    return json({ error: "Oda bulunamadı." }, 404);
  if (duel.closed)
    return json({ error: "Oda kapalı. Yeni bir 1v1 odası aç." }, 409);
  if (data.revision !== duel.revision)
    return json(
      {
        error:
          "Oda başka bir ekranda güncellendi. Son durumu yükle ve tekrar dene.",
      },
      409,
    );
  if (data.action === "close") {
    if (me.role !== "admin")
      return json({ error: "Yönetici yetkisi gerekli." }, 403);
    try {
      const jobs = await rows(
        env,
        "SELECT server_id FROM server_jobs WHERE external_id=? AND status NOT IN ('idle','error')",
        duel.externalId,
      );
      if (jobs.length)
        return json(
          {
            error:
              "Önce bu odanın Sunucudaki maçı bitir kontrolünü kullan. Sunucu durduktan sonra odayı kapat.",
          },
          409,
        );
    } catch (error) {
      if (!missingOps(error)) throw error;
    }
    duel.closed = true;
  } else if (data.action === "ready" || data.action === "force-veto") {
    if (duel.veto)
      return json({ error: "Veto başladı; hazırlık kilitlendi." }, 409);
    if (data.action === "force-veto") {
      if (me.role !== "admin")
        return json({ error: "Yönetici yetkisi gerekli." }, 403);
      if (data.confirm !== true)
        return json({ error: "Hazır kontrolünü atlamayı onayla." }, 409);
    } else {
      if (me.role !== "player" || !me.steamId || !duel.players.some((p) => p.steamId === me.steamId))
        return json(
          { error: "Bu odadaki oyuncunun Steam girişi gerekli." },
          403,
        );
      const verified = await rows(
        env,
        "SELECT steam_id FROM steam_users WHERE steam_id=?",
        me.steamId,
      );
      if (!verified.length)
        return json({ error: "Steam doğrulaması gerekli." }, 403);
      if (data.ready === true) duel.ready[me.steamId] = Date.now() + 1800000;
      else delete duel.ready[me.steamId];
    }
    if (
      data.action === "force-veto" ||
      duel.players.every((p) => (duel.ready[p.steamId] || 0) > Date.now())
    ) {
      duel.veto = {
        matchId: duel.id,
        a: "duel-a",
        b: "duel-b",
        format: "BO1",
        revision: 0,
        actions: [],
        rehearsal: false,
        forced: data.action === "force-veto",
        rosterKey: JSON.stringify(duel.players),
      };
    }
  } else if (data.action === "move") {
    if (!duel.veto || vetoDone(duel.veto))
      return json({ error: "Aktif veto yok." }, 409);
    const index = vetoTurn(duel.veto) === "duel-a" ? 0 : 1;
    if (me.role !== "admin" && me.steamId !== duel.players[index].steamId)
      return json({ error: "Sıra diğer oyuncuda." }, 403);
    duel.veto = moveVeto(
      duel.veto,
      data.map,
      me.role === "admin" ? "admin" : me.steamId!,
    );
  } else return json({ error: "İşlem bulunamadı." }, 400);
  const previous = duel.revision++;
  const saved = await rows(
    env,
    "UPDATE private_duels SET state=?,revision=?,updated_at=? WHERE id=? AND revision=? RETURNING id",
    JSON.stringify(duel),
    duel.revision,
    Date.now(),
    duel.id,
    previous,
  );
  if (!saved.length)
    return json({ error: "Oda güncellendi. Tekrar dene." }, 409);
  await audit(env, me, `duel-${data.action}`, duel.id, {
    revision: duel.revision,
    ...(data.action === "move" ? { map: data.map } : {}),
  });
  return json({ ok: true, id: duel.id });
}

export async function duelConfig(request: Request, env: Env) {
  if (request.method !== "GET") return json({ error: "GET gerekli." }, 405);
  const me = await session(request, env);
  if (me?.role !== "admin" && !(await validWebhookSecret(request, env)))
    return json({ error: "Yetkisiz istek." }, 401);
  const duel = await loadDuel(
    env,
    new URL(request.url).searchParams.get("id") || "",
  );
  if (!duel || duel.closed || !duel.veto || !vetoDone(duel.veto))
    return json({ error: "Açık odada veto tamamlanmalı." }, 422);
  return json(
    {
      matchid: Number(duel.externalId),
      num_maps: 1,
      maplist: vetoMaps(duel.veto).map((m) => "de_" + m.toLowerCase()),
      map_sides: ["knife"],
      clinch_series: true,
      skip_veto: true,
      players_per_team: 1,
      min_players_to_ready: 1,
      min_spectators_to_ready: 0,
      ...Object.fromEntries(
        duel.players.map((p, i) => [
          "team" + (i + 1),
          {
            id: i === 0 ? "duel-a" : "duel-b",
            name: p.name,
            players: { [p.steamId]: p.name },
          },
        ]),
      ),
    },
    200,
    { "Content-Disposition": `attachment; filename="${duel.id}.json"` },
  );
}
