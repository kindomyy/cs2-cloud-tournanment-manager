import {
  defaultArena,
  arenaTitle,
  validMatchId,
  newMatchId,
  type ArenaRecord,
  type ArenaConfig,
} from "../src/arena/model";
export type Statement = {
  bind: (...values: unknown[]) => Statement;
  run: () => Promise<unknown>;
  all: <T>() => Promise<{ results: T[] }>;
};
export type Env = {
  DB?: { prepare: (sql: string) => Statement; batch?: (statements: Statement[]) => Promise<unknown> };
  MATCHZY_WEBHOOK_SECRET?: string;
  MATCHZY_BINDINGS?: string;
  ADMIN_PASSWORD?: string;
  PUBLIC_ORIGIN?: string;
  DATHOST_EMAIL?: string;
  DATHOST_PASSWORD?: string;
  DATHOST_SERVER_ID?: string;
  DATHOST_ACCOUNT_EMAIL?: string;
};
export async function atomic(env: Env, statements: Statement[]) {
  if (!env.DB) throw new Error("D1 bağlantısı yok.");
  if (env.DB.batch) return env.DB.batch(statements);
  for (const statement of statements) await statement.run();
}
export class BodyError extends Error {
  constructor(
    message: string,
    public status: 400 | 413 = 400,
  ) {
    super(message);
  }
}
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export async function sha256Hex(value: string) {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
export async function timingSafeEqual(left: string, right: string) {
  const [a, b] = await Promise.all([sha256Hex(left), sha256Hex(right)]);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function validWebhookSecret(request: Request, env: Env) {
  if (!env.MATCHZY_WEBHOOK_SECRET || env.MATCHZY_WEBHOOK_SECRET.length < 24)
    return false;
  const header = request.headers.get("Authorization") || "";
  return timingSafeEqual(header, `Bearer ${env.MATCHZY_WEBHOOK_SECRET}`);
}
export const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...headers,
    },
  });
export async function rows<T>(env: Env, sql: string, ...args: unknown[]) {
  if (!env.DB) throw new Error("D1 bağlantısı yok.");
  return (
    await env.DB.prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
}
export async function loadArena(env: Env, depth = 0): Promise<ArenaRecord> {
  const existing = await rows<{ revision: number; config: string }>(
    env,
    "SELECT revision,config FROM arena_config WHERE id=1",
  );
  if (!existing.length) {
    if (depth >= 2) throw new Error("Turnuva kaydı başlatılamadı.");
    await env
      .DB!.prepare(
        "INSERT OR IGNORE INTO arena_config(id,revision,config) VALUES(1,1,?)",
      )
      .bind(JSON.stringify(defaultArena()))
      .run();
    return loadArena(env, depth + 1);
  }
  const config = JSON.parse(existing[0].config);
  config.title = arenaTitle(config.title);
  // Retire legacy scheduling on every read, without changing match identities.
  for (const match of Object.values(config.schedule as ArenaConfig["schedule"])) {
    match.startsAt = "";
    match.mode = "unset";
    delete match.durationMinutes;
  }
  // Only untouched installations may replace pre-production millisecond IDs.
  if (
    depth === 0 &&
    !env.MATCHZY_BINDINGS &&
    !Object.keys(config.state.results).length &&
    Object.values(config.schedule as ArenaConfig["schedule"]).some(
      (s) => !validMatchId(s.externalId),
    )
  ) {
    const activity = await rows(
      env,
      "SELECT match_id AS id FROM match_veto UNION ALL SELECT match_id AS id FROM match_ready UNION ALL SELECT external_id AS id FROM matchzy_maps LIMIT 1",
    );
    if (!activity.length) {
      const used = Object.values(
        config.schedule as ArenaConfig["schedule"],
      ).map((s) => s.externalId);
      for (const s of Object.values(
        config.schedule as ArenaConfig["schedule"],
      )) {
        if (!validMatchId(s.externalId)) {
          s.externalId = newMatchId(used);
          used.push(s.externalId);
        }
      }
      try {
        await saveArena(env, config, existing[0].revision);
      } catch (error) {
        if (!(error instanceof Error && error.message === "CONFLICT"))
          throw error;
      }
      return loadArena(env, depth + 1);
    }
  }
  return {
    revision: existing[0].revision,
    config,
  };
}
export async function saveArena(
  env: Env,
  config: ArenaConfig,
  revision: number,
) {
  const updated = await rows<{ revision: number }>(
    env,
    "UPDATE arena_config SET config=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING revision",
    JSON.stringify(config),
    revision,
  );
  if (!updated.length) throw new Error("CONFLICT");
  return updated[0].revision;
}
export async function readBoundedText(
  source: Request | Response,
  limit: number,
  messages: { tooLarge: string; empty: string } = {
    tooLarge: "İstek çok büyük.",
    empty: "JSON gerekli.",
  },
) {
  if (Number(source.headers.get("content-length")) > limit) {
    await source.body?.cancel().catch(() => {});
    throw new BodyError(messages.tooLarge, 413);
  }
  const reader = source.body?.getReader();
  if (!reader) throw new BodyError(messages.empty, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new BodyError(messages.tooLarge, 413);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export async function body(request: Request, limit = 900000) {
  const text = await readBoundedText(request, limit);
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError("Geçersiz JSON.", 400);
  }
}
export function originAllowed(request: Request, env: Env) {
  try {
    return (
      request.headers.get("origin") ===
      (env.PUBLIC_ORIGIN
        ? new URL(env.PUBLIC_ORIGIN).origin
        : new URL(request.url).origin)
    );
  } catch {
    return false;
  }
}
