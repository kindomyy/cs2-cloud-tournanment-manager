import { liveMatches, type Env } from "../../server/api";
import { localizeResponse } from "../../server/i18n";
export const onRequestGet = async ({
  request,
  env,
}: {
  request?: Request;
  env: Env;
}) => {
  const res = await liveMatches(env);
  return request ? localizeResponse(request, res) : res;
};
