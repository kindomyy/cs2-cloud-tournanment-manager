import { duelConfig } from "../../server/duels";
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
    return await localizeResponse(request, await duelConfig(request, env));
  } catch {
    return localizeResponse(
      request,
      json(
        {
          error:
            "1v1 maç dosyası hazırlanamadı. D1 bağlantısını ve 0003 migration dosyasını kontrol et.",
        },
        503,
      ),
    );
  }
};
