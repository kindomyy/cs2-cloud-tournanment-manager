import { webhook, type Env } from "../../../server/api";
import { localizeResponse } from "../../../server/i18n";
export const onRequest = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) => localizeResponse(request, await webhook(request, env));
