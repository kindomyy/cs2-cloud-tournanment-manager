import { authRoute } from "../../../server/auth";
import { localizeResponse } from "../../../server/i18n";
import { BodyError, json, type Env } from "../../../server/store";
export const onRequest = async ({
  request,
  env,
  params,
}: {
  request: Request;
  env: Env;
  params: { path: string[] | string };
}) => {
  try {
    return await localizeResponse(
      request,
      await authRoute(
        request,
        env,
        Array.isArray(params.path) ? params.path.join("/") : params.path,
      ),
    );
  } catch (error) {
    const res =
      error instanceof BodyError
        ? json({ error: error.message }, error.status)
        : error instanceof SyntaxError
          ? json({ error: "Geçersiz JSON." }, 400)
          : json(
              { error: "Giriş sistemi hazır değil. D1 yönetim şemasını kontrol et." },
              503,
            );
    return localizeResponse(request, res);
  }
};
