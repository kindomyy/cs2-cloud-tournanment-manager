import { duels } from "../../server/duels";
import { localizeResponse } from "../../server/i18n";
import { BodyError, json, type Env } from "../../server/store";
export const onRequest = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) => {
  try {
    return await localizeResponse(request, await duels(request, env));
  } catch (error) {
    const res =
      error instanceof BodyError
        ? json({ error: error.message }, error.status)
        : error instanceof Error && /D1|SQL|table|database/i.test(error.message)
          ? json(
              {
                error:
                  "1v1 veritabanı hazır değil. 0003_private_duels.sql dosyasını bağlı D1 veritabanında çalıştır.",
              },
              503,
            )
          : json(
              {
                error:
                  error instanceof Error ? error.message : "1v1 işlemi tamamlanamadı.",
              },
              422,
            );
    return localizeResponse(request, res);
  }
};
