import { session } from "./auth";
import {
  atomic,
  json,
  rows,
  body,
  originAllowed,
  loadArena,
  type Env,
} from "./store";
import { audit, meta, saveRuntime, freezeTeams, runtimeFor } from "./opsStore";
import {
  serverSettings,
  dathostHealth,
  testServer,
  controlServer,
  type ServerAction,
} from "./dathost";
import { arenaSnapshot, management } from "./management";
import { project, updateResult, type Result } from "../src/tournament/engine";
import { recoveryPlan, applyRecovery } from "./recovery";
import {
  exportBackup,
  validateBackup,
  backupSummary,
  restoreBackup,
  archivedBackup,
} from "./backups";
import { vetoDone } from "../src/arena/veto";
import type { AuditEntry } from "../src/arena/operations";

export async function operations(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
) {
  if (!env.DB) return json({ error: "D1 bağlantısı gerekli." }, 503);
  const me = await session(request, env);
  if (me?.role !== "admin")
    return json({ error: "Yönetici girişi gerekli." }, 401);
  if (request.method !== "GET" && request.method !== "POST")
    return json({ error: "GET veya POST gerekli." }, 405);
  if (request.method === "POST" && !originAllowed(request, env))
    return json({ error: "Geçersiz kaynak." }, 403);
  const url = new URL(request.url);
  if (request.method === "GET") {
    const view = url.searchParams.get("view");
    if (view === "backup") {
      const file = url.searchParams.get("id")
        ? await archivedBackup(env, url.searchParams.get("id")!)
        : await exportBackup(env);
      return json(file, 200, {
        "Content-Disposition": `attachment; filename="among-us-backup-${Date.now()}.json"`,
      });
    }
    const tables = (
      await rows<{ name: string }>(
        env,
        "SELECT name FROM sqlite_master WHERE type='table'",
      )
    ).map((r) => r.name);
    const required = [
      "arena_config",
      "arena_sessions",
      "steam_users",
      "steam_nonces",
      "login_attempts",
      "match_ready",
      "match_veto",
      "matchzy_maps",
      "private_duels",
      "match_runtime",
      "arena_audit",
      "arena_meta",
      "server_jobs",
      "server_tickets",
      "steam_returns",
      "arena_backups",
      "arena_restore_guard",
    ];
    const missing = required.filter((name) => !tables.includes(name));
    const hasOps = missing.length === 0;
    const settings = await serverSettings(env);
    const entries = hasOps
      ? await rows<Omit<AuditEntry, "detail"> & { detail: string }>(
          env,
          "SELECT id,at,actor,action,match_id,detail FROM arena_audit ORDER BY at DESC LIMIT 100",
        )
      : [];
    let parsedOrigin = "";
    try {
      if (env.PUBLIC_ORIGIN) parsedOrigin = new URL(env.PUBLIC_ORIGIN).origin;
    } catch {
      parsedOrigin = "";
    }
    const originValid = !!parsedOrigin && parsedOrigin === url.origin;
    const connection = hasOps
      ? await dathostHealth(env, settings)
      : { lastDathostTest: null, lastDathostAttempt: null };
    return json({
      health: {
        database: true,
        missingTables: missing,
        steamConfigured: originValid,
        adminConfigured:
          !!env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 12,
        webhookConfigured:
          !!env.MATCHZY_WEBHOOK_SECRET &&
          env.MATCHZY_WEBHOOK_SECRET.length >= 24,
        dathostConfigured: settings.configured,
        serverId: settings.id,
        origin: parsedOrigin,
        lastWebhook: hasOps ? await meta(env, "webhook") : null,
        ...connection,
      },
      audit: entries.map((r) => ({ ...r, detail: JSON.parse(r.detail) })),
      jobs: hasOps
        ? await rows(
            env,
            "SELECT server_id,match_id,external_id,status,expires FROM server_jobs",
          )
        : [],
      backups: hasOps
        ? await rows(
            env,
            "SELECT id,at FROM arena_backups ORDER BY at DESC LIMIT 10",
          )
        : [],
    });
  }
  await rows(env, "SELECT key FROM arena_meta LIMIT 0");
  const data = await body(request, 6000000);
  if (data.action === "test-server") {
    try {
      return json({ ok: true, server: await testServer(env, fetcher) });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "DatHost bağlantısı test edilemedi." }, 502);
    }
  }
  if (data.action === "release-server") {
    if (data.confirm !== true || data.serverStoppedConfirmed !== true)
      return json(
        {
          error:
            "Sunucudaki maçı DatHost üzerinden bitirdikten sonra boş durumunu onayla. Bu işlem yalnızca sitedeki bekleyen sunucu kaydını temizler.",
          requiresConfirm: true,
        },
        409,
      );
    const settings = await serverSettings(env);
    const jobs = await rows<{ external_id: string }>(
      env,
      "SELECT external_id FROM server_jobs WHERE server_id=?",
      settings.id,
    );
    if (jobs[0]?.external_id) {
      const runtime = await runtimeFor(env, jobs[0].external_id);
      if (runtime && runtime.phase !== "completed")
        await saveRuntime(env, { ...runtime, phase: "cancelled" });
    }
    await env.DB.prepare(
      "UPDATE server_jobs SET status='idle',expires=0 WHERE server_id=?",
    )
      .bind(settings.id)
      .run();
    await env.DB.prepare("DELETE FROM server_tickets").run();
    await audit(env, me, "server-released", "", { serverId: settings.id });
    return json({ ok: true });
  }
  if (data.action === "server") {
    if (
      data.command === "load" &&
      !String(data.matchId).startsWith("duel-") &&
      data.revision !== (await loadArena(env)).revision
    )
      return json(
        {
          error:
            "Maç ayarları güncellendi. Son durumu yükle ve komutu yeniden gözden geçir.",
        },
        409,
      );
    if (!data.confirm)
      return json(
        {
          error:
            "Seçili maç için sunucu komutu gönderilecek. Yükleme haritayı değiştirebilir; iptal maçı bitirir. Uygulamayı onayla.",
          requiresConfirm: true,
        },
        409,
      );
    return controlServer(
      request,
      env,
      {
        action: data.command as ServerAction,
        matchId: data.matchId,
        confirm: data.confirm,
        round: data.round,
      },
      fetcher,
    );
  }
  if (data.action === "validate-backup")
    return json({ summary: backupSummary(validateBackup(data.backup)) });
  if (data.action === "restore-backup") {
    const backup = validateBackup(data.backup);
    if (data.confirm !== true || data.serverStoppedConfirmed !== true)
      return json(
        {
          error:
            "Mevcut kayıtlar yedekteki kayıtlarla değişecek. Önce sunucudaki maçı durdurduğunu ve geri yüklemeyi onayla.",
          requiresConfirm: true,
          summary: backupSummary(backup),
        },
        409,
      );
    const previousBackupId = await restoreBackup(env, backup, data.revision);
    return json({ ok: true, previousBackupId });
  }
  const record = await loadArena(env);
  if (data.revision !== record.revision)
    return json({ error: "Turnuva güncellendi. Son durumu yükle." }, 409);
  const snapshot = await arenaSnapshot(request, env),
    projected = project(snapshot.state, record.config.teams),
    matchId = typeof data.matchId === "string" ? data.matchId : "",
    match = Object.hasOwn(projected.byId, matchId) ? projected.byId[matchId] : undefined;
  if (!match || !match.a || !match.b)
    return json({ error: "İki takımı belli olan bir maç seç." }, 422);
  if (data.action === "forfeit") {
    if (
      ![match.a, match.b].includes(data.winner) ||
      typeof data.note !== "string" ||
      !data.note.trim() ||
      data.note.length > 300
    )
      return json(
        {
          error:
            "Kazananı ve en fazla 300 karakterlik hükmen karar nedenini gir.",
        },
        422,
      );
    const high = match.format === "BO1" ? 13 : 2;
    const result: Result = {
      status: "completed",
      score: data.winner === match.a ? [high, 0] : [0, high],
      resolution: "forfeit",
      note: data.note.trim(),
    };
    const before = project(snapshot.state, record.config.teams),
      after = project(
        updateResult(snapshot.state, match.id, result, record.config.teams)
          .state,
        record.config.teams,
      );
    const affected = before.matches
      .filter(
        (m) =>
          m.id !== match.id &&
          (m.a !== after.byId[m.id]?.a || m.b !== after.byId[m.id]?.b),
      )
      .map((m) => m.id);
    if (data.confirm !== true)
      return json(
        {
          error: `Hükmen sonuç kaydedilecek. Sunucudaki oyun ayrıca durdurulmalı; harita/oyuncu istatistiği üretilmez. Katılımcısı değişen sonraki maçların sonucu ve hazırlığı temizlenecek: ${affected.join(", ") || "yok"}.`,
          requiresConfirm: true,
        },
        409,
      );
    const forwardHeaders = new Headers({ "Content-Type": "application/json" });
    const cookieHeader = request.headers.get("cookie");
    const originHeader = request.headers.get("origin");
    if (cookieHeader) forwardHeaders.set("cookie", cookieHeader);
    if (originHeader) forwardHeaders.set("origin", originHeader);
    const response = await management(
      new Request(request.url, {
        method: "POST",
        headers: forwardHeaders,
        body: JSON.stringify({
          action: "result",
          matchId: match.id,
          revision: record.revision,
          result,
          confirm: data.confirm,
        }),
      }),
      env,
    );
    if (!response.ok) return response;
    await audit(env, me, "forfeit", match.id, {
      winner: data.winner,
      note: data.note.trim(),
    });
    return json({ ok: true });
  }
  if (data.action === "replay") {
    const plan = await recoveryPlan(env, match.id, true);
    if (data.confirm !== true)
      return json(
        {
          error: `Yeni maç kimliğiyle tekrar oynanacak. Hazırlığı/sonucu temizlenecek sonraki maçlar: ${plan.affected.join(", ") || "yok"}. Eski istatistikler tarihçede saklanır. Sunucuda önce mevcut maçı durdur.`,
          requiresConfirm: true,
          affected: plan.affected,
        },
        409,
      );
    const jobs = await rows(
      env,
      "SELECT server_id FROM server_jobs WHERE external_id=? AND status NOT IN ('idle','error')",
      record.config.schedule[match.id].externalId,
    );
    if (jobs.length && data.serverStoppedConfirmed !== true)
      return json(
        {
          error: "Önce sunucudaki maçı durdurduğunu onayla.",
          requiresConfirm: true,
          requiresStop: true,
        },
        409,
      );
    await applyRecovery(env, plan);
    await env.DB.prepare("DELETE FROM server_tickets WHERE external_id=?")
      .bind(record.config.schedule[match.id].externalId)
      .run();
    const oldVeto = snapshot.vetos.find((v) => v.matchId === match.id);
    if (data.keepVeto && oldVeto && !oldVeto.rehearsal) {
      await env.DB.prepare("UPDATE match_veto SET state=? WHERE match_id=?")
        .bind(JSON.stringify(oldVeto), match.id)
        .run();
      await saveRuntime(env, {
        matchId: match.id,
        externalId: plan.config.schedule[match.id].externalId,
        phase: vetoDone(oldVeto) ? "veto-complete" : "veto",
        teams:
          snapshot.runtimes[match.id]?.teams ||
          freezeTeams([
            record.config.teams.find((t) => t.id === match.a)!,
            record.config.teams.find((t) => t.id === match.b)!,
          ]),
      });
    } else
      await env.DB.prepare("DELETE FROM match_veto WHERE match_id=?")
        .bind(match.id)
        .run();
    await env.DB.prepare("DELETE FROM match_ready WHERE match_id=?")
      .bind(match.id)
      .run();
    if (data.serverStoppedConfirmed)
      await env.DB.prepare(
        "UPDATE server_jobs SET status='idle',expires=0 WHERE external_id=?",
      )
        .bind(record.config.schedule[match.id].externalId)
        .run();
    await audit(env, me, "match-replay", match.id, {
      previousExternalId: record.config.schedule[match.id].externalId,
      externalId: plan.config.schedule[match.id].externalId,
      previousResult: snapshot.state.results[match.id] || null,
      affected: plan.affected,
      keptVeto: !!data.keepVeto,
    });
    return json({ ok: true });
  }
  if (data.action === "resync") {
    if (
      !Number.isInteger(data.round) ||
      data.round < 0 ||
      data.round > 199 ||
      !Number.isInteger(data.mapNumber) ||
      data.mapNumber < 0 ||
      data.mapNumber > (match.format === "BO1" ? 0 : 2)
    )
      return json({ error: "Harita ve geri yüklenen raund geçersiz." }, 422);
    const plan = await recoveryPlan(env, match.id, false);
    if (data.confirm !== true)
      return json(
        {
          error: `Sunucudaki backup durumuna göre veri yeniden beklenecek. Sonraki ilk raundun toplam skoru ${data.round + 1} olmalı. Etkilenecek sonraki maçlar: ${plan.affected.join(", ") || "yok"}.`,
          requiresConfirm: true,
        },
        409,
      );
    await applyRecovery(env, plan);
    await saveRuntime(env, {
      ...snapshot.runtimes[match.id],
      matchId: match.id,
      externalId: record.config.schedule[match.id].externalId,
      phase: "restoring",
      restorePending: true,
      restoreRound: data.round,
      mapNumber: data.mapNumber,
      strictRounds: true,
      barrierAt: new Date().toISOString(),
      lastBackupKey: undefined,
    });
    await audit(env, me, "match-resync", match.id, {
      round: data.round,
      mapNumber: data.mapNumber,
      affected: plan.affected,
    });
    return json({ ok: true });
  }
  if (data.action === "refresh-lineup") {
    if (
      match.status !== "upcoming" ||
      ["loading", "warmup", "live", "paused", "restoring"].includes(
        snapshot.runtimes[match.id]?.phase,
      )
    )
      return json(
        {
          error:
            "Sunucuya yüklenmiş veya oynanmış maçta kadro yenilenmez. Önce maçı durdurup yeni deneme aç.",
        },
        409,
      );
    if (data.confirm !== true)
      return json(
        {
          error:
            "Yalnızca seçili maçın hazır durumları ve vetosu temizlenecek; güncel takım kadrosu kullanılacak.",
          requiresConfirm: true,
        },
        409,
      );
    await atomic(env, [
      env.DB.prepare("DELETE FROM match_veto WHERE match_id=?").bind(match.id),
      env.DB.prepare("DELETE FROM match_ready WHERE match_id=?").bind(match.id),
      env.DB.prepare("DELETE FROM match_runtime WHERE external_id=?").bind(
        record.config.schedule[match.id].externalId,
      ),
    ]);
    await audit(env, me, "lineup-refreshed", match.id);
    return json({ ok: true });
  }
  return json({ error: "İşlem bulunamadı." }, 400);
}
