import { useEffect, useState, type ReactNode } from "react";
import { useArena } from "../arena/ArenaContext";
import { useTournament } from "../tournament/TournamentContext";
import { useI18n } from "../i18n";
import { StartupShape } from "./StartupShape";
import "../startup.css";

export function StartupGate({ children }: { children: ReactNode }) {
  const { tx } = useI18n();
  const arena = useArena();
  const { connection } = useTournament();
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [phase, setPhase] = useState<"waiting" | "leaving" | "entered">("waiting");
  const [retrying, setRetrying] = useState(false);
  const [adminRoute, setAdminRoute] = useState(location.hash === "#admin");
  useEffect(() => {
    const timer = setTimeout(() => setMinimumElapsed(true), 1000);
    const route = () => setAdminRoute(location.hash === "#admin");
    window.addEventListener("hashchange", route);
    return () => { clearTimeout(timer); window.removeEventListener("hashchange", route); };
  }, []);
  useEffect(() => {
    if (minimumElapsed && !arena.loading &&
      (arena.previewAdmin || (arena.online && connection.status !== "loading")) && phase === "waiting") setPhase("leaving");
  }, [minimumElapsed, arena.loading, arena.online, arena.previewAdmin, connection.status, phase]);
  useEffect(() => {
    if (phase === "waiting") document.title = tx("Yükleniyor · CS2 Turnuvası", "Loading · CS2 Tournament");
    if (phase !== "leaving") return;
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 180 : 650;
    const timer = setTimeout(() => setPhase("entered"), duration);
    return () => clearTimeout(timer);
  }, [phase, tx]);
  const failed = minimumElapsed && !arena.loading && !arena.online && !retrying;
  return <>
    {phase !== "waiting" && <div className="startup-page" inert={phase === "leaving" ? true : undefined} aria-hidden={phase === "leaving" ? true : undefined}>{children}</div>}
    {phase !== "entered" && <div className={`startup-screen${phase === "leaving" ? " is-leaving" : ""}${failed ? " has-error" : ""}`} aria-label={tx("Turnuva yükleniyor", "Loading tournament")} aria-busy={!failed}>
      <div className="startup-art" role={failed ? undefined : "progressbar"} aria-label={tx("Güncel turnuva bilgileri yükleniyor", "Loading latest tournament data")}><StartupShape /></div>
      {failed && <div className="startup-error"><p role="alert">{tx("Turnuva bilgileri şu anda alınamadı. Bağlantını kontrol edip yeniden deneyebilirsin.", "Could not load tournament data right now. Check your connection and try again.")}</p><div className="startup-actions">
        <button className="button-primary" onClick={async () => { setRetrying(true); try { await arena.refresh(); } finally { setRetrying(false); } }}>{tx("Yeniden dene", "Try again")} <span aria-hidden="true">↗</span></button>
        {adminRoute ? <button className="button-text" onClick={arena.openPreview}>{tx("Yerel yönetim provasını aç", "Open local admin rehearsal")}</button> : <a className="button-text" href="#admin">{tx("Yönetici girişi", "Admin login")}</a>}
      </div></div>}
    </div>}
  </>;
}
