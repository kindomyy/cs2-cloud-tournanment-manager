import {
  parseAcceptLanguage,
  translateServerMessage,
  type Lang,
} from "../src/i18n/serverMessages";

function localizePayload(value: unknown, lang: Lang): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const obj = { ...(value as Record<string, unknown>) };
  if (typeof obj.error === "string")
    obj.error = translateServerMessage(obj.error, lang);
  if (typeof obj.message === "string")
    obj.message = translateServerMessage(obj.message, lang);
  if (obj.server && typeof obj.server === "object" && !Array.isArray(obj.server)) {
    const server = { ...(obj.server as Record<string, unknown>) };
    if (typeof server.name === "string")
      server.name = translateServerMessage(server.name, lang);
    obj.server = server;
  }
  if (obj.health && typeof obj.health === "object" && !Array.isArray(obj.health)) {
    const health = { ...(obj.health as Record<string, unknown>) };
    if (
      health.lastDathostAttempt &&
      typeof health.lastDathostAttempt === "object" &&
      !Array.isArray(health.lastDathostAttempt)
    ) {
      const attempt = {
        ...(health.lastDathostAttempt as Record<string, unknown>),
      };
      if (typeof attempt.error === "string")
        attempt.error = translateServerMessage(attempt.error, lang);
      health.lastDathostAttempt = attempt;
    }
    obj.health = health;
  }
  return obj;
}

export async function localizeResponse(
  request: Request,
  response: Response,
): Promise<Response> {
  const lang = parseAcceptLanguage(request.headers.get("accept-language"));
  if (lang === "tr") return response;
  if (!response.headers.get("content-type")?.includes("application/json"))
    return response;
  try {
    const data = await response.clone().json();
    const localized = localizePayload(data, lang);
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(JSON.stringify(localized), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
}
