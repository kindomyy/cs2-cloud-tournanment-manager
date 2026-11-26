import {
  atomic,
  json,
  loadArena,
  saveArena,
  rows,
  body,
  originAllowed,
  validWebhookSecret,
  type Env,
} from "./store";
import { session, sessionWithMeta } from "./auth";
import { refreshSteamProfile, saveSteamDisplayName, steamRegistrations, verifiedSteamNames } from "./steamProfile";
import { canManageTeam, canJoinServer, canReady } from "../src/arena/permissions";
import { readLive } from "./live";
import {
  validateArena,
  rosterSignature,
  displayName,
  balancedRosterSize,
  matchPlayerName,
  teamLogo,
  freshSchedule,
  newMatchId,
  validMatchId,
} from "../src/arena/model";
import { project, emptyState, updateResult } from "../src/tournament/engine";
import { stateFromFeed } from "../src/tournament/liveState";
import {
  moveVeto,
  vetoDone,
  vetoMaps,
  vetoTurn,
  type VetoState,
} from "../src/arena/veto";
import { activeRuntimes, saveRuntime, freezeTeams, audit } from "./opsStore";

async function loadArenaSnapshot(request: Request, env: Env) {
  const [record, readies, rawVetos, verified, sessionInfo] = await Promise.all([
    loadArena(env),
    rows<{ match_id: string; player_id: string }>(
      env,
      "SELECT match_id,player_id FROM match_ready WHERE expires>?",
      Date.now(),
    ),
    rows<{ state: string }>(env, "SELECT state FROM match_veto"),
    rows<{
      steam_id: string;
      verified_at: number;
      game_name: string | null;
    }>(env, "SELECT steam_id,verified_at,game_name FROM steam_users"),
    sessionWithMeta(request, env),
  ]);
  const runtime = await activeRuntimes(env, record.config);
  const signature = rosterSignature(record.config);
  const allVetos = rawVetos.map((r) => JSON.parse(r.state) as VetoState);
  const vetos = allVetos.filter(
    (v) =>
      (runtime[v.matchId]?.teams?.[0].id === v.a &&
        runtime[v.matchId]?.teams?.[1].id === v.b) ||
      v.rosterKey === signature,
  );
  let live: Awaited<ReturnType<typeof readLive>> = [];
  try {
    live = await readLive(env, undefined, {
      config: record.config,
      vetos: allVetos,
      runtime,
    });
  } catch {
    /* Integration health is exposed by /api/matches. */
  }
  const { state } = stateFromFeed(
    live,
    record.config.state,
    record.config.teams,
    record.config.overrides,
  );
  return {
    snapshot: {
      ...record,
      state,
      readies,
      vetos,
      verified,
      me: sessionInfo.me,
      steamConfigured: !!env.PUBLIC_ORIGIN,
      runtimes: runtime,
    },
    steamCache: sessionInfo.steamCache,
  };
}

export async function arenaSnapshot(request: Request, env: Env) {
  return (await loadArenaSnapshot(request, env)).snapshot;
}
/** This projection crosses the browser boundary; operations keep the full snapshot. */
export function browserSnapshot(snapshot: Awaited<ReturnType<typeof arenaSnapshot>>) {
  const verifiedIds = (lineup: typeof snapshot.config.teams) => [...new Set(lineup.flatMap((t) => t.roster
    .filter((p) => snapshot.verified.some((v) => v.steam_id === p.steamId))
    .map((p) => p.id)))];
  const verifiedPlayerIds = verifiedIds(snapshot.config.teams);
  const runtimes = Object.fromEntries(Object.entries(snapshot.runtimes).map(([id, runtime]) => [id, {
    ...runtime,
    verifiedPlayerIds: verifiedIds(runtime.teams || snapshot.config.teams),
  }]));
  if (snapshot.me?.role === "admin") return { ...snapshot, runtimes, verifiedPlayerIds };
  const view = project(snapshot.state, snapshot.config.teams);
  // Published results end participant access even when the last server event
  // still reports an active phase. This does not send a game-server command.
  const participantRuntimes = Object.fromEntries(Object.entries(runtimes).map(([id, runtime]) => [id, {
    ...runtime,
    phase: view.byId[id]?.status === "completed" ? "completed" : runtime.phase,
  }]));
  const me = snapshot.me;
  const redactTeam = (team: typeof snapshot.config.teams[number]) => ({
    ...team,
    roster: team.roster.map((p) => ({ ...p, steamId: me?.role === "player" && p.steamId === me.steamId ? p.steamId : null })),
  });
  return {
    ...snapshot,
    config: {
      ...snapshot.config,
      rehearsal: false,
      teams: snapshot.config.teams.map(redactTeam),
      server: { address: canJoinServer(snapshot.config, me, participantRuntimes) ? snapshot.config.server?.address || "" : "", dathostServerId: "" },
    },
    verifiedPlayerIds,
    verified: snapshot.verified.filter((v) => me?.role === "player" && v.steam_id === me.steamId),
    vetos: snapshot.vetos.filter((v) => !v.rehearsal).map((v) => ({
      ...v, rosterKey: "", actions: v.actions.map((a) => ({ ...a, actor: a.actor === "admin" ? "admin" : "captain" })),
    })),
    runtimes: Object.fromEntries(Object.entries(participantRuntimes).map(([id, runtime]) => [id, {
      matchId: runtime.matchId,
      externalId: runtime.externalId,
      phase: runtime.phase,
      lastEvent: runtime.lastEvent,
      lastEventAt: runtime.lastEventAt,
      mapNumber: runtime.mapNumber,
      verifiedPlayerIds: runtime.verifiedPlayerIds,
      ...(runtime.teams ? { teams: runtime.teams.map(redactTeam) } : {}),
    }])),
  };
}
export async function management(request: Request, env: Env, fetcher: typeof fetch = fetch) {
  if (!env.DB) return json({ error: "D1 bağlantısı gerekli." }, 503);
  if (request.method === "GET") {
    if (new URL(request.url).searchParams.get("view") === "steam-accounts") {
      if ((await session(request, env))?.role !== "admin")
        return json({ error: "Yönetici yetkisi gerekli." }, 403);
      return json({ accounts: await steamRegistrations(env) });
    }
    const { snapshot, steamCache } = await loadArenaSnapshot(request, env);
    if (snapshot.me?.role === "player" && snapshot.me.steamId) {
      const result = await refreshSteamProfile(env, snapshot.me.steamId, {
        fetcher,
        preloadedCache: steamCache ?? null,
      });
      if (result.profile) snapshot.me.profile = result.profile;
    }
    return json(browserSnapshot(snapshot));
  }
  if (request.method !== "POST")
    return json({ error: "Yöntem desteklenmiyor." }, 405);
  if (!originAllowed(request, env))
    return json({ error: "Geçersiz kaynak." }, 403);
  const me = await session(request, env);
  if (!me) return json({ error: "Önce giriş yap." }, 401);
  const data = await body(request);
  if (data.action === "refresh-steam-account" || data.action === "set-steam-display-name") {
    if (me.role !== "admin")
      return json({ error: "Yönetici yetkisi gerekli." }, 403);
    const steamId = data.steamId;
    if (typeof steamId !== "string" || !/^7656119\d{10}$/.test(steamId))
      return json({ error: "SteamID64 geçersiz." }, 422);
    if (!(await rows(env, "SELECT steam_id FROM steam_users WHERE steam_id=?", steamId)).length)
      return json({ error: "Doğrulanmış Steam kaydı bulunamadı." }, 404);
    if (data.action === "set-steam-display-name") {
      let name: string | null;
      try {
        name = data.displayName === null ? null : displayName(data.displayName);
      } catch (error) {
        return json({ error: (error as Error).message }, 422);
      }
      await saveSteamDisplayName(env, steamId, name);
      await audit(env, me, "steam-display-name", "", { steamId });
      return json({ displayName: name });
    }
    const result = await refreshSteamProfile(env, steamId, { force: true, fetcher });
    if (result.failed)
      return json({ error: "Steam profil adı yenilenemedi. Kayıtlı ad kullanılmaya devam edecek." }, 502);
    return json({ profile: result.profile, refreshed: result.refreshed });
  }
  const record = await loadArena(env),
    { config } = record;
  if (["config", "result", "follow-api", "reset-veto", "force-veto", "rehearse"].includes(data.action) && me.role !== "admin")
    return json({ error: "Bu işlem yalnızca site yöneticisine açıktır." }, 403);
  if (data.action === "team-profile") {
    const team = config.teams.find((t) => t.id === data.teamId);
    if (!team) return json({ error: "Takım bulunamadı." }, 404);
    if (!canManageTeam(me, team))
      return json(
        {
          error:
            "Yalnızca kendi takımının kaptanı bu bilgileri değiştirebilir.",
        },
        403,
      );
    if (data.revision !== record.revision)
      return json(
        { error: "Takım güncellendi. Sayfayı yenile ve tekrar dene." },
        409,
      );
    team.name = displayName(data.name);
    team.tag = displayName(data.tag).slice(0, 5);
    team.logo = teamLogo(data.logo);
    await saveArena(env, validateArena(config), record.revision);
    await audit(env, me, "team-profile", "", { teamId: team.id });
    return json({ ok: true });
  }
  if (data.action === "config") {
    if (me.role !== "admin")
      return json({ error: "Yönetici yetkisi gerekli." }, 403);
    if (data.revision !== record.revision)
      return json({ error: "Başka bir değişiklik var. Sayfayı yenile." }, 409);
    const raw = validateArena(data.config);
    let active: Awaited<ReturnType<typeof arenaSnapshot>> | undefined;
    if (!data.resetTournament) {
      active = await arenaSnapshot(request, env);
      for (const id of Object.keys(raw.schedule))
        if (
          raw.schedule[id].externalId !== config.schedule[id].externalId &&
          (active.state.results[id] ||
            active.vetos.some((v) => v.matchId === id) ||
            active.runtimes[id])
        )
          return json(
            {
              error: `${id} maçının kimliği kullanımda. Kimliği elle değiştirmek yerine 'Yeni kimlikle tekrar oynat' işlemini kullan.`,
            },
            409,
          );
    }
    const material = rosterSignature(raw) !== rosterSignature(config);
    const structural =
      JSON.stringify(raw.teams.map((t) => [t.id, t.seed]).sort()) !==
      JSON.stringify(config.teams.map((t) => [t.id, t.seed]).sort());
    const activity =
      Object.keys(config.state.results).length ||
      (await rows(env, "SELECT match_id FROM match_ready LIMIT 1")).length ||
      (await rows(env, "SELECT match_id FROM match_veto LIMIT 1")).length ||
      (await rows(env, "SELECT external_id FROM matchzy_maps LIMIT 1")).length;
    if (structural && activity && !data.resetTournament)
      return json(
        {
          error:
            "İlk tur eşleşmeleri veya takım listesi değişiyor. Devam edersen tüm turnuvanın sonuçları, hazır durumları ve vetoları sıfırlanacak; maç kimlikleri yenilenecek. Takımlar, oyuncular ve takvim korunur. Sunucudaki maç otomatik durdurulmaz. Sıfırlayarak kaydetmeyi onayla.",
          requiresReset: true,
        },
        409,
      );
    if (material && !structural && activity && !data.resetTournament) {
      // Preserve started/completed lineups; changes apply to future matches.
      await rows(env, "SELECT external_id FROM match_runtime LIMIT 0");
      const previous = active || (await arenaSnapshot(request, env));
      const projected = project(previous.state, config.teams);
      for (const m of projected.matches) {
        if (
          (m.status !== "upcoming" ||
            previous.vetos.some((v) => v.matchId === m.id)) &&
          m.a &&
          m.b &&
          !previous.runtimes[m.id]?.teams
        ) {
          const teams = [
            config.teams.find((t) => t.id === m.a)!,
            config.teams.find((t) => t.id === m.b)!,
          ];
          await saveRuntime(env, {
            matchId: m.id,
            externalId: config.schedule[m.id].externalId,
            phase: m.status === "upcoming" ? "veto" : m.status,
            teams: freezeTeams(teams),
          });
        }
        if (
          !previous.vetos.some((v) => v.matchId === m.id) &&
          m.status === "upcoming" &&
          [m.a, m.b].some((id) => {
            const old = config.teams.find((t) => t.id === id),
              next = raw.teams.find((t) => t.id === id);
            return (
              JSON.stringify(old?.roster) !== JSON.stringify(next?.roster) ||
              old?.captainId !== next?.captainId
            );
          })
        )
          await env.DB.prepare("DELETE FROM match_ready WHERE match_id=?")
            .bind(m.id)
            .run();
      }
    }
    if (data.resetTournament) {
      raw.state = emptyState();
      raw.overrides = [];
      raw.legacyBindings = false;
      const old = await rows<{ external_id: string }>(
        env,
        "SELECT DISTINCT external_id FROM matchzy_maps",
      );
      raw.schedule = freshSchedule(raw.schedule, [
        ...old.map((r) => r.external_id),
        ...Object.values(config.schedule).map((s) => s.externalId),
      ]);
    }
    const next = validateArena(raw);
    await saveArena(env, next, record.revision);
    if (data.resetTournament) {
      await atomic(env, [
        env.DB.prepare("DELETE FROM match_ready"),
        env.DB.prepare("DELETE FROM match_veto"),
      ]);
    }
    await audit(
      env,
      me,
      data.resetTournament ? "tournament-reset" : "config-save",
      "",
      { rosterChanged: material, structural },
    );
    return json({ ok: true });
  }
  const snapshot = await arenaSnapshot(request, env),
    view = project(snapshot.state, config.teams),
    matchId = typeof data.matchId === "string" ? data.matchId : "",
    match = Object.hasOwn(view.byId, matchId) ? view.byId[matchId] : undefined;
  if (!match) return json({ error: "Maç bulunamadı." }, 404);
  if (data.action === "result") {
    if (me.role !== "admin")
      return json({ error: "Yönetici yetkisi gerekli." }, 403);
    if (data.revision !== record.revision)
      return json({ error: "Sayfayı yenile; turnuva güncellendi." }, 409);
    const transition = updateResult(
      snapshot.state,
      match.id,
      data.result || undefined,
      config.teams,
    );
    const nextView = project(transition.state, config.teams);
    const changed = view.matches
      .filter(
        (m) =>
          m.id !== match.id &&
          (m.a !== nextView.byId[m.id]?.a || m.b !== nextView.byId[m.id]?.b),
      )
      .map((m) => m.id);
    const affected = [
      ...new Set([
        ...transition.invalidated,
        ...changed.filter(
          (id) =>
            snapshot.vetos.some((v) => v.matchId === id) ||
            snapshot.runtimes[id],
        ),
      ]),
    ];
    if (affected.length && !data.confirm)
      return json(
        {
          error: `Sonucu veya hazırlığı temizlenecek maçlar: ${affected.join(", ")}.`,
          invalidated: affected,
        },
        409,
      );
    config.state = transition.state;
    config.overrides = [
      ...new Set([...config.overrides, match.id, ...transition.invalidated]),
    ];
    const used = Object.values(config.schedule).map((s) => s.externalId);
    const history = await rows<{ external_id: string }>(
      env,
      "SELECT DISTINCT external_id FROM matchzy_maps",
    );
    used.push(...history.map((r) => r.external_id));
    for (const id of changed) {
      const externalId = newMatchId(used);
      used.push(externalId);
      config.schedule[id] = {
        ...config.schedule[id],
        externalId,
        maps: [],
        a: undefined,
        b: undefined,
      };
    }
    await saveArena(env, validateArena(config), record.revision);
    await audit(env, me, "result", match.id, {
      result: data.result || null,
      invalidated: transition.invalidated,
    });
    if (data.result)
      await saveRuntime(env, {
        ...snapshot.runtimes[match.id],
        matchId: match.id,
        externalId: config.schedule[match.id].externalId,
        phase: data.result.status,
        teams:
          snapshot.runtimes[match.id]?.teams ||
          freezeTeams([
            config.teams.find((t) => t.id === match.a)!,
            config.teams.find((t) => t.id === match.b)!,
          ]),
      });
    else if (snapshot.runtimes[match.id])
      await saveRuntime(env, {
        ...snapshot.runtimes[match.id],
        phase: snapshot.vetos.some((v) => v.matchId === match.id && vetoDone(v))
          ? "veto-complete"
          : "preparing",
      });
    if (changed.length) {
      await atomic(
        env,
        changed.flatMap((id) => [
          env.DB!.prepare("DELETE FROM match_veto WHERE match_id=?").bind(id),
          env.DB!.prepare("DELETE FROM match_ready WHERE match_id=?").bind(id),
        ]),
      );
    }
    return json({ ok: true });
  }
  if (data.action === "follow-api") {
    if (me.role !== "admin")
      return json({ error: "Yönetici yetkisi gerekli." }, 403);
    if (data.revision !== record.revision)
      return json({ error: "Sayfayı yenile." }, 409);
    const transition = updateResult(
      config.state,
      match.id,
      undefined,
      config.teams,
    );
    config.state = transition.state;
    config.overrides = config.overrides.filter((id) => id !== match.id);
    await saveArena(env, config, record.revision);
    if (snapshot.runtimes[match.id]) {
      const latest = (await readLive(env)).find((m) => m.id === match.id);
      await saveRuntime(env, {
        ...snapshot.runtimes[match.id],
        phase:
          latest?.status ||
          (snapshot.vetos.some((v) => v.matchId === match.id && vetoDone(v))
            ? "veto-complete"
            : "preparing"),
      });
    }
    await audit(env, me, "follow-api", match.id);
    return json({ ok: true });
  }
  const lineup = snapshot.runtimes[match.id]?.teams || config.teams;
  const a = lineup.find((t) => t.id === match.a),
    b = lineup.find((t) => t.id === match.b);
  if (!a || !b || match.status !== "upcoming")
    return json(
      { error: "Veto için iki takım ve henüz başlamamış bir maç gerekli." },
      422,
    );
  const rosterSize = balancedRosterSize([a, b]);
  if ((data.action === "ready" || data.action === "rehearse") && rosterSize !== 5)
    return json({ error: "Bu işlem için iki takım da beşer oyunculu olmalı." }, 422);
  let veto = snapshot.vetos.find((v) => v.matchId === match.id);
  if (data.action === "reset-veto") {
    if (me.role !== "admin")
      return json({ error: "Yönetici yetkisi gerekli." }, 403);
    if (
      ["loading", "warmup", "live", "paused", "restoring"].includes(
        snapshot.runtimes[match.id]?.phase,
      )
    )
      return json(
        { error: "Sunucuya yüklenen maçı önce sunucu kontrolünden iptal et." },
        409,
      );
    await atomic(env, [
      env.DB.prepare("DELETE FROM match_veto WHERE match_id=?").bind(match.id),
      env.DB.prepare("DELETE FROM match_ready WHERE match_id=?").bind(match.id),
    ]);
    await env.DB.prepare("DELETE FROM match_runtime WHERE external_id=?")
      .bind(config.schedule[match.id].externalId)
      .run()
      .catch((error: unknown) => {
        if (!(error instanceof Error && /no such table/i.test(error.message)))
          throw error;
      });
    await audit(env, me, "veto-reset", match.id);
    return json({ ok: true });
  }
  if (data.action === "ready") {
    if (!canReady(me, a) && !canReady(me, b))
      return json({ error: "Yalnızca bu maçın Steam ile giriş yapan oyuncusu kendi hazır durumunu değiştirebilir." }, 403);
    if (veto)
      return json({ error: "Veto başladı; hazır durumu kilitlendi." }, 409);
    const player = [...a.roster, ...b.roster].find(
      (p) => p.steamId === me.steamId,
    );
    if (!player || !snapshot.verified.some((v) => v.steam_id === me.steamId))
      return json(
        { error: "Bu kadro için Steam ile doğrulanmış oyuncu girişi gerekli." },
        403,
      );
    if (data.ready)
      await env.DB.prepare(
        "INSERT INTO match_ready(match_id,player_id,expires) VALUES(?,?,?) ON CONFLICT(match_id,player_id) DO UPDATE SET expires=excluded.expires",
      )
        .bind(match.id, player.id, Date.now() + 1800000)
        .run();
    else
      await env.DB.prepare(
        "DELETE FROM match_ready WHERE match_id=? AND player_id=?",
      )
        .bind(match.id, player.id)
        .run();
    const ready = await rows<{ player_id: string }>(
      env,
      "SELECT player_id FROM match_ready WHERE match_id=? AND expires>?",
      match.id,
      Date.now(),
    );
    const all = [...a.roster, ...b.roster].every(
      (p) =>
        p.steamId &&
        snapshot.verified.some((v) => v.steam_id === p.steamId) &&
        ready.some((r) => r.player_id === p.id),
    );
    if (!all) return json({ ok: true });
  } else if (data.action === "force-veto") {
    if (me.role !== "admin")
      return json({ error: "Yönetici yetkisi gerekli." }, 403);
    if (veto)
      return json(
        {
          error:
            "Bu maçın vetosu zaten var. Yeniden başlatmak için önce vetoyu sıfırla.",
        },
        409,
      );
    if (!rosterSize)
      return json({ error: "Zorla veto için iki takımda eşit sayıda, 1–5 oyuncu olmalı." }, 422);
    if ([...a.roster, ...b.roster].some((p) => !p.steamId))
      return json(
        {
          error:
            "Zorla veto için kadrodaki her oyuncunun SteamID64 kaydı gerekli.",
        },
        422,
      );
    if (data.confirm !== true)
      return json(
        {
          error: "Hazır kontrolünü atlayarak gerçek vetoyu başlatmayı onayla.",
          requiresForce: true,
        },
        409,
      );
  } else if (data.action === "rehearse") {
    if (me.role !== "admin" || !config.rehearsal)
      return json(
        {
          error: "Bu işlem yalnızca yönetici ve prova modunda kullanılabilir.",
        },
        403,
      );
  } else if (data.action === "move") {
    if (!veto || vetoDone(veto)) return json({ error: "Aktif veto yok." }, 409);
    if (veto.rehearsal && me.role !== "admin")
      return json({ error: "Prova vetosunu yalnızca yönetici kullanabilir." }, 403);
    if (data.revision !== veto.revision)
      return json({ error: "Veto başka bir ekranda güncellendi." }, 409);
    const team = lineup.find((t) => t.id === vetoTurn(veto!)),
      captain = team?.roster.find((p) => p.id === team.captainId);
    if (
      me.role !== "admin" &&
      (me.role !== "player" || !captain?.steamId || captain.steamId !== me.steamId)
    )
      return json(
        { error: "Haritayı yalnızca sırası gelen takımın kaptanı seçebilir." },
        403,
      );
    const next = moveVeto(
      veto,
      data.map,
      me.role === "admin" ? "admin" : me.steamId!,
    );
    const updated = await rows(
      env,
      "UPDATE match_veto SET revision=?,state=? WHERE match_id=? AND revision=? RETURNING match_id",
      next.revision,
      JSON.stringify(next),
      match.id,
      veto.revision,
    );
    if (!updated.length)
      return json(
        { error: "Bu hamle zaten uygulandı. Sayfa güncelleniyor." },
        409,
      );
    if (!next.rehearsal)
      await saveRuntime(env, {
        ...snapshot.runtimes[match.id],
        matchId: match.id,
        externalId: config.schedule[match.id].externalId,
        teams: freezeTeams([a, b]),
        phase: vetoDone(next) ? "veto-complete" : "veto",
      });
    await audit(env, me, "veto-move", match.id, {
      map: data.map,
      kind: next.actions.at(-1)?.kind,
    });
    return json({ ok: true });
  } else return json({ error: "İşlem bulunamadı." }, 400);
  if (!veto) {
    veto = {
      matchId: match.id,
      a: a.id,
      b: b.id,
      format: match.format,
      revision: 0,
      actions: [],
      rehearsal: data.action === "rehearse",
      forced: data.action === "force-veto",
      rosterKey: rosterSignature(config),
    };
    await env.DB.prepare(
      "INSERT OR IGNORE INTO match_veto(match_id,revision,state) VALUES(?,0,?)",
    )
      .bind(match.id, JSON.stringify(veto))
      .run();
    if (!veto.rehearsal)
      await saveRuntime(env, {
        matchId: match.id,
        externalId: config.schedule[match.id].externalId,
        phase: "veto",
        teams: freezeTeams([a, b]),
      });
    await audit(
      env,
      me,
      veto.rehearsal
        ? "veto-rehearsal"
        : veto.forced
          ? "veto-forced"
          : "veto-start",
      match.id,
    );
  }
  return json({ ok: true });
}
export async function matchConfig(request: Request, env: Env) {
  const me = await session(request, env);
  if (me?.role !== "admin" && !(await validWebhookSecret(request, env)))
    return json({ error: "Yetkisiz istek." }, 401);
  const snapshot = await arenaSnapshot(request, env),
    id = new URL(request.url).searchParams.get("match") || "",
    veto = snapshot.vetos.find((v) => v.matchId === id);
  if (!veto || !vetoDone(veto) || veto.rehearsal)
    return json(
      {
        error:
          "Gerçek maç dosyası için doğrulanmış kadrolarla veto tamamlanmalı. Prova dosyası sunucuya verilmez.",
      },
      422,
    );
  const teams = [veto.a, veto.b].map((id) =>
    (snapshot.runtimes[veto.matchId]?.teams || snapshot.config.teams).find(
      (t) => t.id === id,
    )!,
  );
  if (!validMatchId(snapshot.config.schedule[id].externalId))
    return json(
      {
        error:
          "MatchZy maç ID’si 1–2147483647 aralığında olmalı. Admin panelinden yeni maç ID’si oluştur.",
      },
      422,
    );
  const rosterSize = balancedRosterSize(teams);
  if (!rosterSize || (!veto.forced && rosterSize !== 5) ||
    teams.some((t) => t.roster.some((p) => !p.steamId)))
    return json({ error: "Maç dosyası için eşit kadrolar ve her oyuncunun SteamID64 kaydı gerekli." }, 422);
  const steamNames = await verifiedSteamNames(env, teams.flatMap((team) =>
    team.roster.filter((p) => p.useSteamName).map((p) => p.steamId!),
  ));
  const matchTeam = (team: typeof teams[number]) => ({
    id: team.id,
    name: team.name,
    players: Object.fromEntries(team.roster.map((p) =>
      [p.steamId, matchPlayerName(p, team.tag, steamNames.get(p.steamId!))],
    )),
  });
  return json(
    {
      matchid: Number(snapshot.config.schedule[id].externalId),
      num_maps: veto.format === "BO1" ? 1 : 3,
      maplist: vetoMaps(veto).map((name) => "de_" + name.toLowerCase()),
      map_sides: vetoMaps(veto).map(() => "knife"),
      clinch_series: true,
      skip_veto: true,
      players_per_team: rosterSize,
      min_players_to_ready: rosterSize,
      min_spectators_to_ready: 0,
      wingman: false,
      team1: matchTeam(teams[0]),
      team2: matchTeam(teams[1]),
    },
    200,
    { "Content-Disposition": `attachment; filename="match-${id}.json"` },
  );
}
