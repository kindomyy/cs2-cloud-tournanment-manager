import { useCallback, useEffect, useRef, useState } from "react";
import { matchDefinitions, teams as defaultTeams, type Team } from "../data";
import { validateResult } from "./engine";
import type { LiveFeed, LiveMatch } from "./liveTypes";
import { langHeaders } from "../i18n";

export function parseLiveFeed(
  input: unknown,
  teams: Team[] = defaultTeams,
): LiveFeed {
  if (!input || typeof input !== "object")
    throw new Error("API yanıtı geçersiz.");
  const teamById = (id: string) => teams.find((t) => t.id === id);
  const feed = input as LiveFeed;
  if (
    feed.configured !== true ||
    !Array.isArray(feed.matches) ||
    feed.matches.length > 15
  )
    throw new Error("API bağlantısı hazır değil.");
  const seen = new Set<string>();
  for (const m of feed.matches) {
    const def = matchDefinitions.find((d) => d.id === m?.id);
    if (
      !def ||
      seen.has(m.id) ||
      !teamById(m.a) ||
      !teamById(m.b) ||
      m.a === m.b ||
      !Array.isArray(m.players) ||
      m.players.length > 30 ||
      !Array.isArray(m.maps) ||
      !Number.isFinite(Date.parse(m.updatedAt))
    )
      throw new Error("API maç verisi geçersiz.");
    seen.add(m.id);
    validateResult({ ...def, a: m.a, b: m.b }, m);
    const playerIds = new Set<string>();
    for (const p of m.players) {
      if (
        !p ||
        typeof p.steamId !== "string" ||
        !/^\d{17}$/.test(p.steamId) ||
        playerIds.has(p.steamId) ||
        typeof p.name !== "string" ||
        p.name.length > 80 ||
        ![m.a, m.b].includes(p.teamId) ||
        [p.kills, p.deaths, p.assists, p.headshotKills].some(
          (n) => !Number.isSafeInteger(n) || n < 0,
        ) ||
        p.headshotKills > p.kills ||
        (p.damage !== undefined &&
          (!Number.isSafeInteger(p.damage) || p.damage < 0)) ||
        (p.roundsPlayed !== undefined &&
          (!Number.isSafeInteger(p.roundsPlayed) || p.roundsPlayed < 0))
      )
        throw new Error("API oyuncu verisi geçersiz.");
      playerIds.add(p.steamId);
    }
  }
  return feed;
}

export function useLiveFeed(teams: Team[] = defaultTeams) {
  const [feed, setFeed] = useState<LiveFeed>({
    configured: false,
    matches: [],
  });
  const [status, setStatus] = useState<"loading" | "connected" | "error">(
    "loading",
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const teamsRef = useRef(teams);
  teamsRef.current = teams;
  const teamIdsKey = teams.map((t) => t.id).join(",");
  useEffect(() => {
    setStatus("loading");
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      generation = 0;
    let controller: AbortController | undefined;
    async function poll() {
      if (stopped || document.hidden) return;
      clearTimeout(timer);
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const current = ++generation;
      const timeout = setTimeout(() => requestController.abort(), 8000);
      try {
        const response = await fetch("/api/matches", {
          signal: requestController.signal,
          cache: "no-store",
          headers: { Accept: "application/json", ...langHeaders() },
        });
        if (!response.ok) throw new Error("API kullanılamıyor.");
        const next = parseLiveFeed(await response.json(), teamsRef.current);
        if (!stopped && generation === current) {
          setFeed(next);
          setStatus("connected");
        }
      } catch {
        if (!stopped && generation === current) setStatus("error");
      } finally {
        clearTimeout(timeout);
        if (!stopped && generation === current && !document.hidden)
          timer = setTimeout(poll, 5000);
      }
    }
    function visibility() {
      ++generation;
      clearTimeout(timer);
      controller?.abort();
      if (!document.hidden) void poll();
    }
    void poll();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refreshKey, teamIdsKey]);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  return { feed, status, refresh };
}

export function matchesById(matches: LiveMatch[]) {
  return Object.fromEntries(matches.map((m) => [m.id, m]));
}
