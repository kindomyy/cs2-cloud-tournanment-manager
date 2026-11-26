import { onRequest as arena } from "../functions/api/arena";
import { onRequest as auth } from "../functions/api/auth/[[path]]";
import { onRequestGet as matches } from "../functions/api/matches";
import { onRequestGet as matchConfig } from "../functions/api/match-config";
import { onRequest as webhook } from "../functions/api/webhooks/matchzy";
import { json, type Env } from "./store";
import { localizeResponse } from "./i18n";
import { onRequest as duels } from "../functions/api/duels";
import { onRequest as duelConfig } from "../functions/api/duel-config";
import { onRequest as operations } from "../functions/api/operations";
import { onRequest as serverMatch } from "../functions/api/server-match";

export type WorkerEnv = Env & {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
};

const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.steamstatic.com https://*.steamstatic.com https://steamcdn-a.akamaihd.net; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function withSecurityHeaders(response: Response, html = false) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (html || headers.get("content-type")?.includes("text/html")) {
    headers.set("Content-Security-Policy", csp);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== "/api" && !path.startsWith("/api/"))
      return withSecurityHeaders(await env.ASSETS.fetch(request));
    if (path === "/api/arena") return withSecurityHeaders(await arena({ request, env }));
    if (path === "/api/operations") return withSecurityHeaders(await operations({ request, env }));
    if (path === "/api/server-match") return withSecurityHeaders(await serverMatch({ request, env }));
    if (path === "/api/duels") return withSecurityHeaders(await duels({ request, env }));
    if (path === "/api/duel-config") return withSecurityHeaders(await duelConfig({ request, env }));
    if (path.startsWith("/api/auth/"))
      return withSecurityHeaders(
        await auth({
          request,
          env,
          params: { path: path.slice("/api/auth/".length) },
        }),
      );
    if (path === "/api/webhooks/matchzy")
      return withSecurityHeaders(await webhook({ request, env }));
    if (path === "/api/matches" || path === "/api/match-config") {
      if (request.method !== "GET")
        return withSecurityHeaders(
          await localizeResponse(
            request,
            json({ error: "Yöntem desteklenmiyor." }, 405, { Allow: "GET" }),
          ),
        );
      return withSecurityHeaders(
        path === "/api/matches"
          ? await matches({ request, env })
          : await matchConfig({ request, env }),
      );
    }
    return withSecurityHeaders(
      await localizeResponse(
        request,
        json({ error: "API adresi bulunamadı." }, 404),
      ),
    );
  },
};
