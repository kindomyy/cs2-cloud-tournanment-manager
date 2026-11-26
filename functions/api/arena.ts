import { management } from "../../server/management";
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
    return await localizeResponse(request, await management(request, env));
  } catch (error) {
    const res =
      error instanceof BodyError
        ? json({ error: error.message }, error.status)
        : error instanceof Error && error.message === "CONFLICT"
          ? json({ error: "Başka bir değişiklik var. Sayfayı yenile." }, 409)
          : json(
              {
                error:
                  error instanceof Error && !/SQL|D1|table/i.test(error.message)
                    ? error.message
                    : "Yönetim veritabanı hazır değil. 0002 ve 0004 migration dosyalarını kontrol et.",
              },
              error instanceof Error && /SQL|D1|table/i.test(error.message) ? 503 : 422,
            );
    return localizeResponse(request, res);
  }
};
