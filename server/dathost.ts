import { hash, randomToken, session } from "./auth";
import { json, rows, loadArena, type Env } from "./store";
import { matchConfig } from "./management";
import { duelConfig } from "./duels";
import { runtimeFor, saveRuntime, audit, setMeta, meta } from "./opsStore";
import { connectionAddress } from "../src/arena/schedule";
export type ServerAction = "load" | "pause" | "unpause" | "end" | "restore";
type DatHostTest = {
  at: string;
  ok: boolean;
  serverId: string;
  name?: string;
  address?: string;
  error?: string;
};
type StoredDatHostTest = DatHostTest & { settingsHash: string };
export async function serverSettings(env: Env) {
  const { config } = await loadArena(env);
  const id = env.DATHOST_SERVER_ID || config.server?.dathostServerId || "";
  return {
    id,
    configured:
      !!env.DATHOST_EMAIL &&
      !!env.DATHOST_PASSWORD &&
      /^[a-f0-9]{24}$/.test(id),
    // Keep this fingerprint server-side. A successful test for a different
    // account, password or shared-account selection cannot verify new settings.
    settingsHash: await hash(JSON.stringify([
      id, env.DATHOST_EMAIL || "", env.DATHOST_PASSWORD || "",
      env.DATHOST_ACCOUNT_EMAIL?.trim() || "",
    ])),
  };
}
export async function dathostHealth(env: Env, settings: Awaited<ReturnType<typeof serverSettings>>) {
  const currentTest = async (key: string): Promise<DatHostTest | null> => {
    const stored = await meta<StoredDatHostTest>(env, key);
    if (!settings.configured || stored?.serverId !== settings.id ||
        stored.settingsHash !== settings.settingsHash) return null;
    const { settingsHash: _private, ...result } = stored;
    return result;
  };
  const [lastDathostTest, lastDathostAttempt] = await Promise.all([
    currentTest("dathost"), currentTest("dathost-attempt"),
  ]);
  return { lastDathostTest, lastDathostAttempt };
}
export async function dathostRequest(
  env: Env,
  id: string,
  path = "",
  line?: string,
  fetcher: typeof fetch = fetch,
) {
  if (!env.DATHOST_EMAIL || !env.DATHOST_PASSWORD || !/^[a-f0-9]{24}$/.test(id))
    throw new Error(
      "DatHost için DATHOST_EMAIL, DATHOST_PASSWORD ve sunucu ID’si gerekli.",
    );
  const bytes = new TextEncoder().encode(
    `${env.DATHOST_EMAIL}:${env.DATHOST_PASSWORD}`,
  );
  const headers = new Headers({
    Authorization: `Basic ${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))}`,
  });
  if (env.DATHOST_ACCOUNT_EMAIL)
    headers.set("Account-Email", env.DATHOST_ACCOUNT_EMAIL.trim());
  let response: Response;
  try {
    response = await fetcher(
      `https://dathost.com/api/0.1/game-servers/${id}${path}`,
      {
        method: line === undefined ? "GET" : "POST",
        headers,
        ...(line === undefined ? {} : { body: new URLSearchParams({ line }) }),
        // Workers supports manual/follow only. Keep credentials on this endpoint;
        // a redirect is rejected below as a non-successful response.
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const problem = timedOut ? "DatHost bağlantısı 15 saniye içinde yanıt vermedi." : "DatHost’a ağ bağlantısı kurulamadı.";
    throw new Error(line === undefined
      ? `${problem} Bu test yalnızca sunucu bilgisini okur; oyun komutu gönderilmedi. Cloudflare’dan dış erişimi ve DatHost hizmet durumunu kontrol et.`
      : `${problem} Komutun sonucu belirsiz olabilir; tekrar göndermeden önce DatHost konsolundan sunucu durumunu kontrol et.`);
  }
  if (!response.ok) {
    const advice: Record<number, string> = {
      401: "Cloudflare Secrets içindeki DATHOST_EMAIL ve DATHOST_PASSWORD değerlerini kontrol et; DatHost API hesap e-postası ve parolasıyla giriş yapar.",
      403: "Bu hesabın sunucuya erişim iznini kontrol et. Paylaşılan hesap kullanıyorsan DATHOST_ACCOUNT_EMAIL değerini sunucu sahibinin e-postasıyla ayarla.",
      404: "Sunucu ID’sini ve hesabın bu sunucuyu görebildiğini kontrol et. ID, DatHost panelindeki 24 karakterlik kimliktir.",
      429: "DatHost istek sınırına ulaşıldı. Biraz bekleyip bağlantıyı yeniden test et.",
    };
    const uncertain = line !== undefined && (response.status >= 500 || response.status === 408);
    await response.body?.cancel();
    throw new Error(`DatHost erişimi başarısız (HTTP ${response.status}). ${advice[response.status] || "DatHost hizmet durumunu kontrol edip daha sonra yeniden dene."}${uncertain ? " Komutun sonucu belirsiz olabilir; tekrar göndermeden önce DatHost konsolundan sunucu durumunu kontrol et." : ""}`);
  }
  return response;
}
export async function testServer(env: Env, fetcher: typeof fetch = fetch) {
  const settings = await serverSettings(env);
  if (!settings.configured) throw new Error("DatHost erişim ayarları eksik.");
  try {
    const response = await dathostRequest(env, settings.id, "", undefined, fetcher);
    let data: Record<string, unknown>;
    try {
      data = await response.json() as Record<string, unknown>;
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    } catch {
      throw new Error("DatHost sunucu bilgisi okunamadı. API geçerli JSON döndürmedi; oyun komutu gönderilmedi.");
    }
    if ((data.id !== undefined && data.id !== settings.id) ||
        (data.id !== settings.id && !(typeof data.name === "string" && data.name.trim())))
      throw new Error("DatHost yanıtı seçili sunucunun bilgisini doğrulamadı. Sunucu ID’sini ve API erişimini kontrol et; oyun komutu gönderilmedi.");
    const ports = data.ports as { game?: number } | undefined;
    let address = "";
    try {
      address = connectionAddress(`${data.ip}:${ports?.game}`);
    } catch {
      /* Not every server metadata response contains an address. */
    }
    const result = {
      at: new Date().toISOString(), ok: true, serverId: settings.id,
      name: typeof data.name === "string" ? data.name.slice(0, 80) : "DatHost sunucusu",
      address,
    };
    const stored = { ...result, settingsHash: settings.settingsHash };
    await setMeta(env, "dathost", stored);
    await setMeta(env, "dathost-attempt", stored);
    return result;
  } catch (error) {
    await setMeta(env, "dathost-attempt", {
      at: new Date().toISOString(), ok: false, serverId: settings.id,
      settingsHash: settings.settingsHash,
      error: error instanceof Error ? error.message : "DatHost bağlantısı test edilemedi.",
    });
    throw error;
  }
}

export async function controlServer(
  request: Request,
  env: Env,
  data: {
    action: ServerAction;
    matchId: string;
    confirm?: boolean;
    round?: number;
  },
  fetcher: typeof fetch = fetch,
) {
  const me = await session(request, env);
  if (me?.role !== "admin")
    return json({ error: "Yönetici yetkisi gerekli." }, 403);
  if (!["load", "pause", "unpause", "end", "restore"].includes(data.action))
    return json({ error: "Sunucu işlemi geçersiz." }, 422);
  if (data.confirm !== true)
    return json({ error: "Sunucu işlemini onayla." }, 409);
  const settings = await serverSettings(env);
  if (!settings.configured)
    return json(
      {
        error:
          "DatHost erişimi eksik. Sunucu ID’sini ve Cloudflare Secrets ayarlarını tamamla.",
      },
      503,
    );
  const isDuel = /^duel-[a-f0-9-]{36}$/.test(data.matchId);
  const sourcePath = isDuel
    ? `/api/duel-config?id=${data.matchId}`
    : `/api/match-config?match=${encodeURIComponent(data.matchId)}`;
  const { config } = await loadArena(env);
  let externalId =
    typeof data.matchId === "string" && Object.hasOwn(config.schedule, data.matchId)
      ? config.schedule[data.matchId].externalId
      : undefined;
  if (isDuel) {
    const records = await rows<{ external_id: string }>(
      env,
      "SELECT external_id FROM private_duels WHERE id=?",
      data.matchId,
    );
    externalId = records[0]?.external_id;
  }
  if (!externalId) return json({ error: "Maç bulunamadı." }, 404);
  const runtime = await runtimeFor(env, externalId);
  const existing = (
    await rows<{
      token: string;
      expires: number;
      match_id: string;
      external_id: string;
      status: string;
    }>(
      env,
      "SELECT token,expires,match_id,external_id,status FROM server_jobs WHERE server_id=?",
      settings.id,
    )
  )[0];
  if (existing && existing.expires > Date.now())
    return json({ error: "Sunucuda bir işlem sürüyor. Sonucu bekle." }, 409);
  if (
    data.action === "load" &&
    existing &&
    ["active", "pending", "unknown", "ending"].includes(existing.status)
  ) {
    if (existing.external_id === externalId)
      return json({
        ok: true,
        alreadySent: true,
        message:
          "Bu maç için yükleme zaten gönderildi. MatchZy onayı bekleniyor veya maç sunucuda aktif.",
      });
    return json(
      {
        error: `Sunucuda ${existing.match_id} için işlem/maç var. Önce o maçı kapat.`,
      },
      409,
    );
  }
  if (
    data.action !== "load" &&
    existing?.external_id &&
    existing.external_id !== externalId &&
    ["active", "pending", "unknown", "ending"].includes(existing.status)
  )
    return json({ error: "Sunucuda başka bir maç var. Doğru maçı seç." }, 409);
  if (
    data.action !== "load" &&
    (!runtime ||
      ![
        "warmup",
        "live",
        "paused",
        "restoring",
        "completed",
        "review",
      ].includes(runtime.phase)) &&
    existing?.external_id !== externalId
  )
    return json({ error: "Bu maçın sunucuya yüklendiği doğrulanmadı." }, 409);
  if (
    data.action === "restore" &&
    (!Number.isInteger(data.round) || data.round! < 0 || data.round! > 100)
  )
    return json({ error: "Backup raundu 0–100 arasında olmalı." }, 422);
  if (
    data.action === "load" &&
    runtime &&
    [
      "completed",
      "cancelled",
      "review",
      "warmup",
      "live",
      "paused",
      "restoring",
    ].includes(runtime.phase)
  )
    return json(
      {
        error: isDuel
          ? "Bu oda daha önce sunucuda oynandı. Tekrar için yeni bir 1v1 odası aç."
          : "Bu deneme sunucuda kullanıldı. Önce 'Yeni kimlikle tekrar oynat' ile yeni deneme aç.",
      },
      409,
    );
  let line: string;
  let ticketHash: string | undefined;
  if (data.action === "load") {
    const exported = isDuel
      ? await duelConfig(
          new Request(new URL(sourcePath, request.url), {
            headers: request.headers,
          }),
          env,
        )
      : await matchConfig(
          new Request(new URL(sourcePath, request.url), {
            headers: request.headers,
          }),
          env,
        );
    if (!exported.ok) return exported;
    const match = (await exported.json()) as Record<string, unknown>;
    if (
      !env.PUBLIC_ORIGIN ||
      new URL(env.PUBLIC_ORIGIN).protocol !== "https:" ||
      new URL(env.PUBLIC_ORIGIN).origin !== new URL(request.url).origin
    )
      return json(
        {
          error:
            "Sunucuya yüklemek için PUBLIC_ORIGIN gerçek HTTPS site adresi olmalı.",
        },
        422,
      );
    if (
      !env.MATCHZY_WEBHOOK_SECRET ||
      !/^[\x21-\x7e]{24,256}$/.test(env.MATCHZY_WEBHOOK_SECRET) ||
      /[";\\]/.test(env.MATCHZY_WEBHOOK_SECRET)
    )
      return json(
        {
          error:
            "Webhook Secret en az 24 karakter olmalı; boşluk, tırnak, noktalı virgül veya ters eğik çizgi içeremez.",
        },
        422,
      );
    // Credentials travel only in the private server-to-server response. Neither
    // dashboard, backups, audit nor console commands receive the long-lived key.
    match.cvars = {
      matchzy_remote_log_url: `${new URL(env.PUBLIC_ORIGIN).origin}/api/webhooks/matchzy`,
      matchzy_remote_log_header_key: "Authorization",
      matchzy_remote_log_header_value: `Bearer ${env.MATCHZY_WEBHOOK_SECRET}`,
      matchzy_ready_mode: "0",
      matchzy_time_to_start: "0",
    };
    const token = randomToken();
    ticketHash = await hash(token);
    await env
      .DB!.prepare("DELETE FROM server_tickets WHERE expires<?")
      .bind(Date.now())
      .run();
    await env
      .DB!.prepare(
        "INSERT INTO server_tickets(token_hash,external_id,config,expires) VALUES(?,?,?,?)",
      )
      .bind(ticketHash, externalId, JSON.stringify(match), Date.now() + 180000)
      .run();
    line = `matchzy_loadmatch_url "${new URL(env.PUBLIC_ORIGIN).origin}/api/server-match?ticket=${token}"`;
  } else
    line = (
      {
        pause: "css_forcepause",
        unpause: "css_forceunpause",
        end: "css_endmatch",
        restore: `css_restore ${data.round}`,
      } as Record<string, string>
    )[data.action];
  const token = randomToken();
  const locked = await rows(
    env,
    "INSERT INTO server_jobs(server_id,token,expires,match_id,external_id,status) VALUES(?,?,?,?,?,'sending') ON CONFLICT(server_id) DO UPDATE SET token=excluded.token,expires=excluded.expires,match_id=excluded.match_id,external_id=excluded.external_id,status=excluded.status WHERE server_jobs.expires<? AND (?!='load' OR server_jobs.status IN ('idle','error')) RETURNING server_id",
    settings.id,
    token,
    Date.now() + 25000,
    data.matchId,
    externalId,
    Date.now(),
    data.action,
  );
  if (!locked.length) {
    if (ticketHash)
      await env
        .DB!.prepare("DELETE FROM server_tickets WHERE token_hash=?")
        .bind(ticketHash)
        .run();
    return json({ error: "Başka bir sunucu işlemi veya aktif maç var." }, 409);
  }
  try {
    const response = await dathostRequest(
      env,
      settings.id,
      "/console",
      line,
      fetcher,
    );
    await response.body?.cancel();
    await env
      .DB!.prepare(
        "UPDATE server_jobs SET status=CASE WHEN status='sending' THEN ? ELSE status END,expires=0 WHERE server_id=? AND token=?",
      )
      .bind(
        data.action === "load"
          ? "pending"
          : data.action === "end"
            ? "ending"
            : "active",
        settings.id,
        token,
      )
      .run();
    if (data.action === "load") {
      const latest = await runtimeFor(env, externalId);
      if (
        !latest ||
        ![
          "warmup",
          "live",
          "paused",
          "restoring",
          "completed",
          "cancelled",
          "review",
        ].includes(latest.phase)
      )
        await saveRuntime(env, {
          ...runtime,
          ...latest,
          matchId: data.matchId,
          externalId,
          phase: "loading",
        });
    }
    await audit(env, me, `server-${data.action}`, data.matchId, {
      externalId,
      ...(data.round !== undefined ? { round: data.round } : {}),
    });
    return json({
      ok: true,
      message:
        "Komut DatHost’a iletildi. MatchZy olayıyla sunucu onayı beklenecek.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "DatHost işlemi tamamlanamadı.";
    const unknown = /belirsiz/.test(message);
    await env
      .DB!.prepare(
        "UPDATE server_jobs SET status=CASE WHEN status='sending' THEN ? ELSE status END,expires=0 WHERE server_id=? AND token=?",
      )
      .bind(
        unknown
          ? "unknown"
          : data.action !== "load"
            ? existing &&
              ["active", "pending", "unknown", "ending"].includes(
                existing.status,
              )
              ? existing.status
              : "active"
            : "error",
        settings.id,
        token,
      )
      .run();
    if (ticketHash && !unknown)
      await env
        .DB!.prepare("DELETE FROM server_tickets WHERE token_hash=?")
        .bind(ticketHash)
        .run();
    await audit(env, me, "server-error", data.matchId, {
      action: data.action,
      unknown,
    });
    return json({ error: message }, 502);
  }
}
export async function serverMatch(request: Request, env: Env) {
  if (request.method !== "GET") return json({ error: "GET gerekli." }, 405);
  const token = new URL(request.url).searchParams.get("ticket") || "";
  if (!/^[a-f0-9]{64}$/.test(token) || !env.DB)
    return json({ error: "Geçersiz veya süresi dolmuş maç bağlantısı." }, 401);
  const result = await rows<{ config: string }>(
    env,
    "DELETE FROM server_tickets WHERE token_hash=? AND expires>? RETURNING config",
    await hash(token),
    Date.now(),
  );
  if (!result.length)
    return json({ error: "Geçersiz veya süresi dolmuş maç bağlantısı." }, 401);
  return json(JSON.parse(result[0].config), 200, {
    "X-Content-Type-Options": "nosniff",
  });
}
