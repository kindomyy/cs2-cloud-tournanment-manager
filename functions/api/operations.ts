import { operations } from "../../server/operations";
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
    return await localizeResponse(request, await operations(request, env));
  } catch (error) {
    const res =
      error instanceof BodyError
        ? json({ error: error.message }, error.status)
        : (() => {
            const message =
              error instanceof Error ? error.message : "İşlem tamamlanamadı.";
            if (message === "CONFLICT")
              return json(
                {
                  error:
                    "Turnuva başka bir ekranda güncellendi. Yenile ve tekrar dene.",
                },
                409,
              );
            if (/SQL|D1|table|database|constraint/i.test(message))
              return json(
                {
                  error:
                    "Operasyon veritabanı hazır değil. 0004_operations.sql dosyasını bağlı D1 üzerinde çalıştır.",
                },
                503,
              );
            return json({ error: message }, 422);
          })();
    return localizeResponse(request, res);
  }
};
