import {
  body,
  json,
  originAllowed,
  rows,
  sha256Hex,
  timingSafeEqual,
  type Env,
} from "./store";
import type { Session } from "../src/arena/model";
import { safeReturnPath } from "../src/arena/schedule";
import { missingOps } from "./opsStore";
import {
  refreshSteamProfile,
  steamSessionMeta,
  type SteamProfileCache,
} from "./steamProfile";
const steamEndpoint = "https://steamcommunity.com/openid/login";
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)));
export const hash = sha256Hex;
function cookie(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
function setCookie(
  request: Request,
  name: string,
  value: string,
  seconds: number,
) {
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function sessionWithMeta(
  request: Request,
  env: Env,
): Promise<{ me: Session; steamCache?: SteamProfileCache | null }> {
  const token = cookie(request, "arena_session");
  if (!/^[a-f0-9]{64}$/.test(token) || !env.DB) return { me: null };
  const found = await rows<{
    role: "admin" | "player";
    steam_id: string | null;
  }>(
    env,
    "SELECT role,steam_id FROM arena_sessions WHERE token_hash=? AND expires>?",
    await hash(token),
    Date.now(),
  );
  if (!found[0]) return { me: null };
  const me: NonNullable<Session> = {
    role: found[0].role,
    ...(found[0].steam_id ? { steamId: found[0].steam_id } : {}),
  };
  let steamCache: SteamProfileCache | null | undefined;
  if (me.role === "player" && me.steamId) {
    const meta = await steamSessionMeta(env, me.steamId);
    if (meta.profile) me.profile = meta.profile;
    if (meta.displayName) me.displayName = meta.displayName;
    steamCache = meta.cache;
  }
  return { me, steamCache };
}
export async function session(request: Request, env: Env): Promise<Session> {
  return (await sessionWithMeta(request, env)).me;
}
async function startSession(
  request: Request,
  env: Env,
  role: "admin" | "player",
  steamId: string | null = null,
) {
  const now = Date.now();
  const previousToken = cookie(request, "arena_session");
  await env
    .DB!.prepare("DELETE FROM arena_sessions WHERE expires<=?")
    .bind(now)
    .run();
  if (/^[a-f0-9]{64}$/.test(previousToken)) {
    await env
      .DB!.prepare("DELETE FROM arena_sessions WHERE token_hash=?")
      .bind(await hash(previousToken))
      .run();
  }
  const token = randomToken();
  await env
    .DB!.prepare(
      "INSERT INTO arena_sessions(token_hash,role,steam_id,expires) VALUES(?,?,?,?)",
    )
    .bind(await hash(token), role, steamId, now + 12 * 3600000)
    .run();
  return setCookie(request, "arena_session", token, 43200);
}
function configuredOrigin(env: Env) {
  if (!env.PUBLIC_ORIGIN) return null;
  try {
    return new URL(env.PUBLIC_ORIGIN).origin;
  } catch {
    return null;
  }
}
export async function authRoute(
  request: Request,
  env: Env,
  action: string,
  fetcher: typeof fetch = fetch,
) {
  if (!env.DB) return json({ error: "D1 ve yönetim şeması kurulmalı." }, 503);
  if (action === "admin" && request.method === "POST") {
    if (!originAllowed(request, env))
      return json({ error: "Geçersiz kaynak." }, 403);
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12)
      return json(
        { error: "ADMIN_PASSWORD en az 12 karakterle ayarlanmalı." },
        503,
      );
    const now = Date.now();
    const key = await hash(request.headers.get("CF-Connecting-IP") || "local");
    const globalKey = "__global__";
    const attempts = await rows<{ key: string; count: number }>(
      env,
      "SELECT key,count FROM login_attempts WHERE key IN (?,?) AND expires>?",
      key,
      globalKey,
      now,
    );
    const ipAttempts = attempts.find((a) => a.key === key)?.count || 0;
    const globalAttempts = attempts.find((a) => a.key === globalKey)?.count || 0;
    if (ipAttempts >= 5 || globalAttempts >= 25)
      return json(
        { error: "Çok fazla deneme. 10 dakika sonra tekrar dene." },
        429,
      );
    const data = await body(request);
    const password = typeof data.password === "string" ? data.password : "";
    if (!(await timingSafeEqual(password, env.ADMIN_PASSWORD))) {
      await env.DB.prepare("DELETE FROM login_attempts WHERE expires<=?")
        .bind(now)
        .run();
      for (const throttleKey of [key, globalKey]) {
        await env.DB.prepare(
          "INSERT INTO login_attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires>? THEN count+1 ELSE 1 END,expires=excluded.expires",
        )
          .bind(throttleKey, now + 600000, now)
          .run();
      }
      return json({ error: "Yönetici parolası yanlış." }, 401);
    }
    await env.DB.prepare("DELETE FROM login_attempts WHERE key=? OR expires<=?")
      .bind(key, now)
      .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": await startSession(request, env, "admin"),
    });
  }
  if (action === "logout" && request.method === "POST") {
    if (!originAllowed(request, env))
      return json({ error: "Geçersiz kaynak." }, 403);
    const current = cookie(request, "arena_session");
    if (/^[a-f0-9]{64}$/.test(current)) {
      await env.DB.prepare("DELETE FROM arena_sessions WHERE token_hash=?")
        .bind(await hash(current))
        .run();
    }
    return json({ ok: true }, 200, {
      "Set-Cookie": setCookie(request, "arena_session", "", 0),
    });
  }
  if (action === "steam/profile") {
    if (request.method !== "POST") return json({ error: "POST gerekli." }, 405);
    if (!originAllowed(request, env)) return json({ error: "Geçersiz kaynak." }, 403);
    const me = await session(request, env);
    if (me?.role !== "player" || !me.steamId)
      return json({ error: "Kendi Steam hesabınla giriş yap." }, 403);
    const result = await refreshSteamProfile(env, me.steamId, { force: true, fetcher });
    if (result.failed)
      return json({ error: "Steam profil bilgisi alınamadı. Girişin ve takım kaydın korunuyor; daha sonra yeniden dene.", profile: result.profile }, 502);
    return json({ ok: true, profile: result.profile, refreshed: result.refreshed });
  }
  if (action === "steam/start" && request.method === "GET") {
    const origin = configuredOrigin(env);
    if (!origin || origin !== new URL(request.url).origin)
      return json(
        { error: "PUBLIC_ORIGIN sitenin HTTPS adresi olarak ayarlanmalı." },
        503,
      );
    const now = Date.now();
    const state = randomToken();
    const stateHash = await hash(state);
    await env.DB.prepare("DELETE FROM steam_nonces WHERE expires<=?")
      .bind(now)
      .run();
    await env.DB.prepare(
      "INSERT INTO steam_nonces(state_hash,expires) VALUES(?,?)",
    )
      .bind(stateHash, now + 600000)
      .run();
    const returnTo = `${origin}/api/auth/steam/callback?state=${state}`;
    try {
      await env.DB.prepare("DELETE FROM steam_returns WHERE expires<?")
        .bind(now)
        .run();
      await env.DB.prepare(
        "INSERT INTO steam_returns(state_hash,return_path,expires) VALUES(?,?,?)",
      )
        .bind(
          stateHash,
          safeReturnPath(new URL(request.url).searchParams.get("returnTo")),
          now + 600000,
        )
        .run();
    } catch (error) {
      if (!missingOps(error)) throw error;
    }
    const url = new URL(steamEndpoint);
    url.search = new URLSearchParams({
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "checkid_setup",
      "openid.return_to": returnTo,
      "openid.realm": origin,
      "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
      "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
        "Set-Cookie": setCookie(request, "steam_state", state, 600),
        "Cache-Control": "no-store",
      },
    });
  }
  if (action === "steam/callback" && request.method === "GET") {
    const q = new URL(request.url).searchParams,
      state = q.get("state") || "";
    const fail = () =>
      json(
        {
          error:
            "Steam doğrulaması başarısız. Girişi Steam üzerinden yeniden başlat.",
        },
        401,
      );
    const origin = configuredOrigin(env);
    if (
      new Set([...q.keys()]).size !== [...q.keys()].length ||
      !q.get("openid.sig") ||
      !q.get("openid.assoc_handle")
    )
      return fail();
    if (
      !origin ||
      new URL(request.url).origin !== origin ||
      !/^[a-f0-9]{64}$/.test(state) ||
      !(await timingSafeEqual(state, cookie(request, "steam_state")))
    )
      return fail();
    const stateHash = await hash(state);
    const consumed = await rows(
      env,
      "DELETE FROM steam_nonces WHERE state_hash=? AND expires>? RETURNING state_hash",
      stateHash,
      Date.now(),
    );
    if (!consumed.length) return fail();
    const returnTo = `${origin}/api/auth/steam/callback?state=${state}`;
    const id = q.get("openid.claimed_id") || "",
      steamId =
        /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/.exec(
          id,
        )?.[1];
    const signed = new Set((q.get("openid.signed") || "").split(","));
    const nonce = q.get("openid.response_nonce") || "",
      stamp = Date.parse(nonce.slice(0, 20));
    if (
      !steamId ||
      q.get("openid.identity") !== id ||
      q.get("openid.mode") !== "id_res" ||
      q.get("openid.ns") !== "http://specs.openid.net/auth/2.0" ||
      q.get("openid.op_endpoint") !== steamEndpoint ||
      q.get("openid.return_to") !== returnTo ||
      !Number.isFinite(stamp) ||
      Math.abs(Date.now() - stamp) > 600000 ||
      ![
        "op_endpoint",
        "claimed_id",
        "identity",
        "return_to",
        "response_nonce",
        "assoc_handle",
      ].every((k) => signed.has(k))
    )
      return fail();
    const verification = new URLSearchParams();
    q.forEach((v, k) => {
      if (k.startsWith("openid.")) verification.set(k, v);
    });
    verification.set("openid.mode", "check_authentication");
    let response: Response;
    try {
      response = await fetcher(steamEndpoint, {
        method: "POST",
        body: verification,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return json({ error: "Steam yanıt vermedi. Tekrar giriş yap." }, 503);
    }
    if (!response.ok || !/^is_valid:true\r?$/m.test(await response.text()))
      return fail();
    await env.DB.prepare(
      "INSERT INTO steam_users(steam_id,verified_at) VALUES(?,?) ON CONFLICT(steam_id) DO UPDATE SET verified_at=excluded.verified_at",
    )
      .bind(steamId, Date.now())
      .run();
    await refreshSteamProfile(env, steamId, { force: true, fetcher });
    let returnPath = "/#oyuncu";
    try {
      const stored = await rows<{ return_path: string }>(
        env,
        "DELETE FROM steam_returns WHERE state_hash=? AND expires>? RETURNING return_path",
        stateHash,
        Date.now(),
      );
      returnPath = safeReturnPath(stored[0]?.return_path);
    } catch (error) {
      if (!missingOps(error)) throw error;
    }
    const headers = new Headers({
      Location: `${origin}${returnPath}`,
      "Cache-Control": "no-store",
    });
    headers.append("Set-Cookie", await startSession(request, env, "player", steamId));
    headers.append("Set-Cookie", setCookie(request, "steam_state", "", 0));
    return new Response(null, { status: 302, headers });
  }
  return json({ error: "İşlem bulunamadı." }, 404);
}
