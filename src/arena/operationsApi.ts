import { ApiError } from "./ArenaContext";
import { getStoredLang, langHeaders } from "../i18n";
import { translateServerMessage } from "../i18n/serverMessages";
export async function operation(data: Record<string, unknown>) {
  const response = await fetch("/api/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...langHeaders() },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(25000),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      translateServerMessage(
        "Sunucu yanıtı okunamadı. Bağlantıyı ve SQL kurulumunu kontrol et.",
        getStoredLang(),
      ),
    );
  }
  if (!response.ok)
    throw new ApiError(
      translateServerMessage(result.error || "İşlem uygulanamadı.", getStoredLang()),
      result,
    );
  return result;
}
