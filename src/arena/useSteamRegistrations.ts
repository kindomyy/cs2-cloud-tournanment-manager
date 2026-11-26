import { useEffect, useState } from "react";
import type { SteamRegistration } from "./model";
import { getStoredLang, langHeaders } from "../i18n";

export function useSteamRegistrations() {
  const [accounts, setAccounts] = useState<SteamRegistration[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/arena?view=steam-accounts", {
      cache: "no-store",
      headers: langHeaders(),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!controller.signal.aborted) setAccounts(data.accounts);
    }).catch(() => {
      if (!controller.signal.aborted)
        setError(
          getStoredLang() === "en"
            ? "Could not load Steam registrations."
            : "Steam kayıtları yüklenemedi.",
        );
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [loadVersion]);

  return { accounts, setAccounts, loading, error, reload: () => setLoadVersion((v) => v + 1) };
}
