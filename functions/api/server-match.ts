import { serverMatch } from "../../server/dathost";
import { localizeResponse } from "../../server/i18n";
import { json, type Env } from "../../server/store";
export const onRequest = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) => {
  try {
    return await localizeResponse(request, await serverMatch(request, env));
  } catch {
    return localizeResponse(
      request,
      json({ error: "Maç bağlantısı kullanılamıyor." }, 503),
    );
  }
};
