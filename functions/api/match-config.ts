import { matchConfig } from "../../server/management";
import { localizeResponse } from "../../server/i18n";
import { json, type Env } from "../../server/store";
export const onRequestGet = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) => {
  try {
    return await localizeResponse(request, await matchConfig(request, env));
  } catch {
    return localizeResponse(request, json({ error: "Maç dosyası hazırlanamadı." }, 503));
  }
};
