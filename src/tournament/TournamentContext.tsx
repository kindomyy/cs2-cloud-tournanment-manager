import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  demoState,
  emptyState,
  parseState,
  project,
  type TournamentState,
} from "./engine";
import { useArena } from "../arena/ArenaContext";
import { type Team } from "../data";
import { useLiveFeed } from "./useLiveFeed";
import { stateFromFeed } from "./liveState";
import type { LiveMatch } from "./liveTypes";
import { vetoDone, vetoMaps } from "../arena/veto";
import { activePresentationMatch } from "../arena/presentation";
import { getStoredLang } from "../i18n";

export const STORAGE_KEY = "kampus-arena-tournament-v1";
function load(teams?: Team[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return {
      state: raw ? parseState(JSON.parse(raw), teams) : demoState(),
      warning: "",
    };
  } catch {
    return {
      state: demoState(),
      warning:
        getStoredLang() === "en"
          ? "Could not read browser storage. Sample bracket loaded without overwriting old data. You can export your trials as JSON."
          : "Tarayıcıdaki kayıt okunamadı. Örnek turnuva açıldı; eski kayıt henüz değiştirilmedi. Denemelerini JSON olarak yedekleyebilirsin.",
    };
  }
}
type TournamentContextValue = ReturnType<typeof project> & {
  state: TournamentState;
  teams: Team[];
  teamById: (id?: string) => Team | undefined;
  matchTeams: (match: { id: string; a?: string; b?: string }) => Team[];
  warning: string;
  commit: (state: TournamentState) => void;
  mode: "server" | "local";
  setMode: (mode: "server" | "local") => void;
  source: "api" | "local";
  resetFinal: boolean;
  focusMatch: (id: string) => void;
  liveData: Record<string, LiveMatch>;
  connection: {
    status: "loading" | "connected" | "error";
    refresh: () => void;
    conflicts: string[];
  };
};
const Context = createContext<TournamentContextValue | null>(null);
export function TournamentProvider({ children }: { children: ReactNode }) {
  const arena = useArena();
  const teams = arena.snapshot.config.teams;
  const teamById = useCallback((id?: string) => teams.find((t) => t.id === id), [teams]);
  const [initial] = useState(() => load(teams));
  const [state, setState] = useState(initial.state);
  const [warning, setWarning] = useState(initial.warning);
  const [focusedMatch, focusMatch] = useState("");
  const [requestedMode, setMode] = useState<"server" | "local">(() =>
    location.hash === "#dene" ? "local" : "server",
  );
  const mayRehearse = arena.snapshot.me?.role === "admin" ||
    (!arena.online && arena.previewAdmin);
  const mode = mayRehearse ? requestedMode : "server";
  const live = useLiveFeed(teams);
  const remote = useMemo(
    () =>
      stateFromFeed(
        live.feed.matches,
        arena.online ? arena.snapshot.config.state : undefined,
        teams,
        arena.snapshot.config.overrides,
      ),
    [
      live.feed.matches,
      arena.online,
      arena.snapshot.config.state,
      teams,
      arena.snapshot.config.overrides,
    ],
  );
  const source: "api" | "local" =
    mode === "server" && !(arena.previewAdmin && !arena.online)
      ? "api"
      : "local";
  const viewedState =
    source === "api"
      ? remote.state
      : arena.previewAdmin && mode === "server"
        ? arena.snapshot.config.state
        : mode === "local"
          ? state
          : emptyState();
  const viewed = useMemo(() => {
    const projected = project(viewedState, teams);
    for (const match of projected.matches) {
      const veto = arena.snapshot.vetos.find(
        (v) =>
          v.matchId === match.id &&
          vetoDone(v) &&
          v.a === match.a &&
          v.b === match.b,
      );
      if (veto) match.selectedMaps = vetoMaps(veto);
      match.time = "";
    }
    return projected;
  }, [viewedState, teams, arena.snapshot.vetos]);
  const selectedMatch = activePresentationMatch(
    arena.snapshot.config,
    viewed.matches,
    arena.snapshot.runtimes,
  );
  const activeMatch =
    source === "api"
      ? viewed.matches.find(
          (match) =>
            match.status !== "completed" &&
            ["live", "paused", "restoring"].includes(
              arena.snapshot.runtimes?.[match.id]?.phase || "",
            ),
        )
      : undefined;
  const commit = useCallback((next: TournamentState) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setWarning("");
    } catch {
      setWarning(
        getStoredLang() === "en"
          ? "Browser storage is unavailable. Changes remain only while this page is open; download a JSON backup."
          : "Tarayıcı kaydı kullanılamıyor. Değişiklikler yalnızca bu sayfa açıkken korunur; JSON yedeğini indir.",
      );
    }
  }, []);
  const matchTeams = useCallback(
    (match: { id: string; a?: string; b?: string }) =>
      arena.snapshot.runtimes?.[match.id]?.teams ||
      teams.filter((t) => t.id === match.a || t.id === match.b),
    [arena.snapshot.runtimes, teams],
  );
  const value = useMemo<TournamentContextValue>(
    () => ({
      ...viewed,
      featured: selectedMatch || viewed.byId[focusedMatch] || activeMatch || viewed.featured,
      focusMatch,
      teams,
      teamById,
      matchTeams,
      resetFinal: viewedState.resetFinal,
      state,
      commit,
      warning,
      mode,
      setMode,
      source,
      liveData: source === "api" ? remote.accepted : {},
      connection: {
        status: live.status,
        refresh: live.refresh,
        conflicts: remote.conflicts,
      },
    }),
    [
      viewed,
      selectedMatch,
      focusedMatch,
      activeMatch,
      teams,
      teamById,
      matchTeams,
      viewedState.resetFinal,
      state,
      commit,
      warning,
      mode,
      source,
      remote.accepted,
      remote.conflicts,
      live.status,
      live.refresh,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTournament() {
  const context = useContext(Context);
  if (!context) throw new Error("TournamentProvider gerekli.");
  return context;
}
