import type { SteamProfile, SteamRegistration } from "../src/arena/model";
import { readBoundedText, rows, type Env } from "./store";

const successTtl = 6 * 60 * 60 * 1000;
const failureTtl = 5 * 60 * 1000;
const minimumInterval = 60 * 1000;
const maxBodyBytes = 128 * 1024;
type Cache = { profile: SteamProfile | null; attemptedAt: number; nextRefreshAt: number };
const validId = (id: string) => /^7656119\d{10}$/.test(id);
const cacheKey = (id: string) => `steam-profile:${id}`;
const displayNameKey = (id: string) => `steam-display-name:${id}`;

function profileName(value: string) {
  const clean = value.replace(/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ").trim();
  return [...clean].slice(0, 80).join("");
}
export function steamAvatar(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^(?:avatars(?:\.[a-z0-9-]+)?\.steamstatic\.com|steamcdn-a\.akamaihd\.net)$/.test(url.hostname) ||
      !/^\/(?:steamcommunity\/public\/images\/avatars\/[a-f0-9]{2}\/)?[a-f0-9]{40}(?:_full|_medium)?\.(?:jpg|png)$/i.test(url.pathname) ||
      url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}
function xmlField(xml: string, field: string): string | null {
  const match = new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`).exec(xml);
  if (!match) return null;
  const raw = match[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
  if (cdata) return cdata[1];
  if (raw.includes("<") || /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[a-f\d]+;)/i.test(raw)) return null;
  return raw.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[a-f\d]+);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (entity[0] !== "#") return named[entity.toLowerCase()];
    const point = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point) : "";
  });
}
export function parseSteamProfile(xml: string, steamId: string): SteamProfile | null {
  if (!validId(steamId) || xml.length > maxBodyBytes || /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    xmlField(xml, "steamID64") !== steamId) return null;
  const rawName = xmlField(xml, "steamID");
  const name = rawName && profileName(rawName);
  if (!name) return null;
  return { name, avatar: steamAvatar(xmlField(xml, "avatarFull")) || steamAvatar(xmlField(xml, "avatarMedium")) };
}
function parseCache(value: string | null): Cache | null {
  if (!value) return null;
  try {
    const data = JSON.parse(value) as Cache;
    if (!Number.isFinite(data.attemptedAt) || !Number.isFinite(data.nextRefreshAt)) return null;
    const name = data.profile && typeof data.profile.name === "string" ? profileName(data.profile.name) : "";
    return { ...data, profile: name ? { name, avatar: steamAvatar(data.profile?.avatar) } : null };
  } catch { return null; }
}
async function cache(env: Env, steamId: string): Promise<Cache | null> {
  if (!env.DB || !validId(steamId)) return null;
  try {
    const result = await rows<{ value: string }>(env, "SELECT value FROM arena_meta WHERE key=?", cacheKey(steamId));
    return parseCache(result[0]?.value ?? null);
  } catch { return null; }
}
export type SteamProfileCache = Cache;
/** Session checks read cached display metadata only; authorization never depends on it. */
export async function cachedSteamProfile(env: Env, steamId: string) {
  return (await cache(env, steamId))?.profile || null;
}

export async function steamSessionMeta(env: Env, steamId: string): Promise<{
  profile: SteamProfile | null;
  displayName?: string;
  cache: Cache | null;
}> {
  if (!env.DB || !validId(steamId)) return { profile: null, cache: null };
  try {
    const pKey = cacheKey(steamId),
      nKey = displayNameKey(steamId);
    const result = await rows<{ key: string; value: string }>(
      env,
      "SELECT key,value FROM arena_meta WHERE key IN (?,?)",
      pKey,
      nKey,
    );
    const profileRaw = result.find((r) => r.key === pKey)?.value ?? null;
    const parsed = parseCache(profileRaw);
    const displayName = result.find((r) => r.key === nKey)?.value;
    return {
      profile: parsed?.profile || null,
      ...(displayName ? { displayName } : {}),
      cache: parsed,
    };
  } catch {
    return { profile: null, cache: null };
  }
}

export async function steamDisplayName(env: Env, steamId: string) {
  if (!env.DB || !validId(steamId)) return undefined;
  try {
    const result = await rows<{ value: string }>(env, "SELECT value FROM arena_meta WHERE key=?", displayNameKey(steamId));
    return result[0]?.value;
  } catch {
    return undefined;
  }
}

export async function saveSteamDisplayName(env: Env, steamId: string, name: string | null) {
  if (name === null) {
    await env.DB!.prepare("DELETE FROM arena_meta WHERE key=?").bind(displayNameKey(steamId)).run();
  } else {
    await env.DB!.prepare("INSERT INTO arena_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind(displayNameKey(steamId), name).run();
  }
}

export async function steamRegistrations(env: Env): Promise<SteamRegistration[]> {
  const accounts = await rows<Omit<SteamRegistration, "profile" | "displayName"> & { value: string | null; display_name: string | null }>(
    env,
    `SELECT u.steam_id, u.verified_at, u.game_name, m.value, n.value AS display_name
     FROM steam_users u
     LEFT JOIN arena_meta m ON m.key='steam-profile:' || u.steam_id
     LEFT JOIN arena_meta n ON n.key='steam-display-name:' || u.steam_id
     ORDER BY u.verified_at DESC, u.steam_id`,
  );
  return accounts.map(({ value, display_name, ...account }) => ({
    ...account,
    profile: parseCache(value)?.profile || null,
    ...(display_name ? { displayName: display_name } : {}),
  }));
}

export async function verifiedSteamNames(env: Env, ids: string[]) {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  try {
    const profiles = await rows<{ steam_id: string; value: string }>(
      env,
      `SELECT u.steam_id, m.value
       FROM steam_users u JOIN arena_meta m ON m.key='steam-profile:' || u.steam_id
       WHERE u.steam_id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
    for (const { steam_id, value } of profiles) {
      const name = parseCache(value)?.profile?.name;
      if (name) names.set(steam_id, name);
    }
  } catch {
    // A match can still be prepared with the saved roster names.
  }
  return names;
}
async function boundedXml(response: Response) {
  return readBoundedText(response, maxBodyBytes, {
    tooLarge: "Profile response too large",
    empty: "Profile response is empty",
  });
}
/** Only a validated SteamID reaches the fixed Steam endpoint; redirects are refused. */
export async function refreshSteamProfile(
  env: Env,
  steamId: string,
  options: { force?: boolean; fetcher?: typeof fetch; preloadedCache?: Cache | null } = {},
): Promise<{ profile: SteamProfile | null; refreshed: boolean; failed: boolean }> {
  const previous = options.preloadedCache !== undefined ? options.preloadedCache : await cache(env, steamId);
  const fallback = { profile: previous?.profile || null, refreshed: false, failed: false };
  if (!validId(steamId) || !env.DB) return fallback;
  const now = Date.now();
  if (previous && (now - previous.attemptedAt < minimumInterval || (!options.force && previous.nextRefreshAt > now))) return fallback;
  const claimed: Cache = { profile: previous?.profile || null, attemptedAt: now, nextRefreshAt: now + failureTtl };
  try {
    const claim = await rows(env,
      "INSERT INTO arena_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CASE WHEN json_valid(arena_meta.value) THEN COALESCE(json_extract(arena_meta.value,'$.attemptedAt'),0) ELSE 0 END<=? RETURNING key",
      cacheKey(steamId), JSON.stringify(claimed), now - minimumInterval,
    );
    if (!claim.length) return fallback;
  } catch { return { ...fallback, failed: true }; }
  let profile: SteamProfile | null = null;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const lookup = async () => {
      const response = await (options.fetcher || fetch)(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, {
        method: "GET", redirect: "manual", signal: controller.signal,
        headers: { Accept: "application/xml,text/xml;q=0.9" },
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error("Steam profile unavailable"); }
      return parseSteamProfile(await boundedXml(response), steamId);
    };
    profile = await Promise.race([lookup(), new Promise<never>((_, reject) => {
      timeout = setTimeout(() => { controller.abort(); reject(new Error("Steam profile timed out")); }, 3000);
    })]);
  } catch { /* Public metadata availability never affects Steam verification. */ }
  finally { if (timeout !== undefined) clearTimeout(timeout); }
  if (!profile) return { ...fallback, failed: true };
  try {
    await env.DB.prepare("UPDATE arena_meta SET value=? WHERE key=? AND json_extract(value,'$.attemptedAt')=?")
      .bind(JSON.stringify({ profile, attemptedAt: now, nextRefreshAt: now + successTtl }), cacheKey(steamId), now).run();
  } catch { /* Return the fetched profile even if optional caching is unavailable. */ }
  return { profile, refreshed: true, failed: false };
}
