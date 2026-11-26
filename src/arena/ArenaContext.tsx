import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  defaultArena,
  validateArena,
  rosterSignature,
  type ArenaConfig,
  type ArenaRecord,
  type Session,
} from "./model";
import { project, updateResult, emptyState } from "../tournament/engine";
import { moveVeto, vetoPollInterval, type VetoState } from "./veto";
import type { MatchRuntime } from "./operations";
import { useVisiblePolling } from "./useVisiblePolling";
import { getStoredLang, langHeaders } from "../i18n";
import { translateServerMessage } from "../i18n/serverMessages";
export type ArenaSnapshot = ArenaRecord & {
  state: ArenaRecord["config"]["state"];
  readies: { match_id: string; player_id: string }[];
  vetos: VetoState[];
  verified: {
    steam_id: string;
    verified_at: number;
    game_name: string | null;
  }[];
  verifiedPlayerIds?: string[];
  me: Session;
  steamConfigured: boolean;
  runtimes?: Record<string, MatchRuntime>;
};
/** A player ID can retain its name while its assigned Steam account changes. */
export function verifiedForMatch(snapshot: ArenaSnapshot, matchId: string) {
  const runtime = snapshot.runtimes?.[matchId];
  return runtime?.verifiedPlayerIds ?? snapshot.verifiedPlayerIds ??
    (runtime?.teams || snapshot.config.teams).flatMap((team) => team.roster
      .filter((player) => snapshot.verified.some((user) => user.steam_id === player.steamId))
      .map((player) => player.id));
}
export class ApiError extends Error {
  constructor(
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
const key = "kampus-arena-management-preview-v1";
function initial(): ArenaSnapshot {
  let config = defaultArena();
  try {
    const saved = localStorage.getItem(key);
    if (saved) config = validateArena(JSON.parse(saved));
  } catch {
    /* Keep recovery explicit in the UI. */
  }
  return {
    revision: 1,
    config,
    state: config.state,
    readies: [],
    vetos: [],
    verified: [],
    me: null,
    steamConfigured: false,
    runtimes: {},
  };
}
type Value = {
  snapshot: ArenaSnapshot;
  online: boolean;
  loading: boolean;
  previewAdmin: boolean;
  openPreview: () => void;
  refresh: () => Promise<void>;
  setVetoPolling: (active: boolean) => void;
  act: (data: Record<string, unknown>) => Promise<void>;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<Value | null>(null);
export function ArenaProvider({ children }: { children: ReactNode }) {
  const requestGeneration = useRef(0);
  const lastConfigCache = useRef<{ raw: string; config: ArenaConfig } | null>(null);
  const [snapshot, setSnapshot] = useState(initial),
    [online, setOnline] = useState(false),
    [loading, setLoading] = useState(true),
    [previewAdmin, setPreviewAdmin] = useState(false),
    [vetoPolling, setVetoPolling] = useState(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const previewAdminRef = useRef(previewAdmin);
  previewAdminRef.current = previewAdmin;
  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    try {
      const response = await fetch("/api/arena", {
        cache: "no-store",
        headers: langHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error();
      const next = await response.json();
      const rawConfig = JSON.stringify(next.config);
      if (lastConfigCache.current?.raw === rawConfig) {
        next.config = lastConfigCache.current.config;
      } else {
        next.config = validateArena(next.config);
        lastConfigCache.current = { raw: rawConfig, config: next.config };
      }
      if (!Array.isArray(next.vetos) || !Array.isArray(next.readies))
        throw new Error();
      if (generation === requestGeneration.current) {
        setSnapshot(next);
        setOnline(true);
      }
    } catch {
      /* Preserve the last server state on transient failures. */
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, []);
  useVisiblePolling(refresh, vetoPolling ? vetoPollInterval : 5000);
  const request = useCallback(async (url: string, data: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...langHeaders() },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    });
    let value;
    try {
      value = await response.json();
    } catch {
      throw new Error(translateServerMessage("Sunucu yanıtı alınamadı.", getStoredLang()));
    }
    if (!response.ok)
      throw new ApiError(
        translateServerMessage(value.error || "İşlem tamamlanamadı.", getStoredLang()),
        value,
      );
    return value;
  }, []);
  const act = useCallback(async (data: Record<string, unknown>) => {
    if (onlineRef.current) {
      await request("/api/arena", data);
      await refresh();
      return;
    }
    if (!previewAdminRef.current) throw new Error("Yerel provayı yönetim ekranından aç.");
    const next = structuredClone(snapshotRef.current),
      config = next.config,
      view = project(config.state, config.teams),
      match = view.byId[String(data.matchId)];
    if (data.action === "config") {
      const raw = data.config as ArenaRecord["config"];
      if (data.resetTournament) raw.state = emptyState();
      if (
        JSON.stringify(raw.teams.map((t) => [t.id, t.seed]).sort()) !==
          JSON.stringify(config.teams.map((t) => [t.id, t.seed]).sort()) &&
        (Object.keys(config.state.results).length ||
          next.vetos.length ||
          next.readies.length) &&
        !data.resetTournament
      )
        throw new ApiError(
          "İlk tur eşleşmeleri veya takım listesi değişiyor. Tüm turnuvanın sonuçları, hazır durumları ve vetoları sıfırlanacak. Takımlar, oyuncular ve takvim korunur. Sıfırlayarak kaydetmeyi onayla.",
          { requiresReset: true },
        );
      if (
        rosterSignature(raw) !== rosterSignature(config) &&
        !data.resetTournament
      )
        for (const m of view.matches) {
          if (
            m.a &&
            m.b &&
            (m.status !== "upcoming" ||
              next.vetos.some((v) => v.matchId === m.id)) &&
            !next.runtimes?.[m.id]?.teams
          ) {
            next.runtimes = {
              ...next.runtimes,
              [m.id]: {
                matchId: m.id,
                externalId: config.schedule[m.id].externalId,
                phase: m.status === "upcoming" ? "veto" : m.status,
                teams: structuredClone([
                  config.teams.find((t) => t.id === m.a)!,
                  config.teams.find((t) => t.id === m.b)!,
                ]),
              },
            };
          }
        }
      next.config = validateArena(raw);
      if (data.resetTournament) {
        next.config.state = emptyState();
        next.readies = [];
        next.vetos = [];
        next.runtimes = {};
      }
      next.revision++;
    } else if (data.action === "result" && match) {
      const transition = updateResult(
        config.state,
        match.id,
        data.result as Parameters<typeof updateResult>[2],
        config.teams,
      );
      if (transition.invalidated.length && !data.confirm)
        throw new ApiError(
          `Sonuçları temizlenecek: ${transition.invalidated.join(", ")}`,
          { invalidated: transition.invalidated },
        );
      config.state = transition.state;
      next.revision++;
    } else if (data.action === "follow-api" && match) {
      config.state = updateResult(
        config.state,
        match.id,
        undefined,
        config.teams,
      ).state;
      next.revision++;
    } else if (data.action === "rehearse" && match && match.a && match.b) {
      if (!config.rehearsal) throw new Error("Prova modu kapalı.");
      next.vetos = next.vetos.filter((v) => v.matchId !== match.id);
      next.vetos.push({
        matchId: match.id,
        a: match.a,
        b: match.b,
        format: match.format,
        revision: 0,
        actions: [],
        rehearsal: true,
        rosterKey: rosterSignature(config),
      });
    } else if (data.action === "move") {
      const v = next.vetos.find((v) => v.matchId === data.matchId);
      if (!v) throw new Error("Veto bulunamadı.");
      next.vetos = next.vetos.map((item) =>
        item === v ? moveVeto(v, String(data.map), "admin") : item,
      );
    } else if (data.action === "reset-veto") {
      next.vetos = next.vetos.filter((v) => v.matchId !== data.matchId);
    } else
      throw new Error("Bu işlem çevrimiçi ve Steam doğrulaması gerektirir.");
    next.state = next.config.state;
    setSnapshot(next);
    try {
      localStorage.setItem(key, JSON.stringify(next.config));
    } catch {
      throw new Error("Prova uygulandı fakat tarayıcı kaydı kullanılamıyor.");
    }
  }, [request, refresh]);
  const login = useCallback(async (password: string) => {
    await request("/api/auth/admin", { password });
    await refresh();
  }, [request, refresh]);
  const logout = useCallback(async () => {
    if (onlineRef.current) {
      await request("/api/auth/logout", {});
      await refresh();
    }
    setPreviewAdmin(false);
  }, [request, refresh]);
  const openPreview = useCallback(() => {
    setPreviewAdmin(true);
    setSnapshot((current) => ({
      ...current,
      config: { ...current.config, rehearsal: true },
    }));
  }, []);
  const value = useMemo(
    () => ({
      snapshot,
      online,
      loading,
      previewAdmin,
      openPreview,
      refresh,
      setVetoPolling,
      act,
      login,
      logout,
    }),
    [snapshot, online, loading, previewAdmin, openPreview, refresh, act, login, logout],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useArena() {
  const context = useContext(Context);
  if (!context) throw new Error("ArenaProvider gerekli.");
  return context;
}
