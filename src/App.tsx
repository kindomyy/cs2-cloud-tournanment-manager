import { Suspense, lazy, useEffect, useState, useRef } from "react";
import {
  ArrowUpRight,
  Crosshair,
  Layers3,
  Menu,
  Shield,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { type Match, type Team } from "./data";
import { Bracket } from "./components/TournamentBracket";
import { Hero, FeaturedMatch, Schedule } from "./components/Home";
import { DetailDialog } from "./components/DetailDialog";
import { useTournament } from "./tournament/TournamentContext";
import { useArena } from "./arena/ArenaContext";
import { vetoDone } from "./arena/veto";
import { LiveConnection } from "./components/LiveConnection";

import { accessFor } from "./arena/permissions";
import { matchPhase } from "./arena/operations";
import { RoleScope } from "./components/RoleScope";
import { AccountMenu } from "./components/AccountMenu";
import { MinimalTournament } from "./components/MinimalTournament";
import { LanguageToggle } from "./components/LanguageToggle";
import { useI18n } from "./i18n";

const MatchesPage = lazy(() =>
  import("./pages/MatchesPage").then((m) => ({ default: m.MatchesPage })),
);
const TeamsPage = lazy(() =>
  import("./pages/TeamsPage").then((m) => ({ default: m.TeamsPage })),
);
const RulesPage = lazy(() =>
  import("./pages/RulesPage").then((m) => ({ default: m.RulesPage })),
);
const TestPage = lazy(() =>
  import("./pages/TestPage").then((m) => ({ default: m.TestPage })),
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const PlayerPage = lazy(() =>
  import("./pages/PlayerPage").then((m) => ({ default: m.PlayerPage })),
);
const VetoPage = lazy(() =>
  import("./pages/VetoPage").then((m) => ({ default: m.VetoPage })),
);
const DuelPage = lazy(() =>
  import("./pages/DuelPage").then((m) => ({ default: m.DuelPage })),
);
const ResultsPage = lazy(() =>
  import("./pages/ResultsPage").then((m) => ({ default: m.ResultsPage })),
);

type Page =
  | "sonuclar"
  | "turnuva"
  | "maclar"
  | "takimlar"
  | "kurallar"
  | "dene"
  | "admin"
  | "oyuncu"
  | "hesap"
  | "1v1"
  | `1v1/${string}`
  | `veto/${string}`;
const pages: { id: Page; tr: string; en: string }[] = [
  { id: "turnuva", tr: "Turnuva", en: "Tournament" },
  { id: "maclar", tr: "Maçlar", en: "Matches" },
  { id: "takimlar", tr: "Takımlar", en: "Teams" },
  { id: "sonuclar", tr: "Sonuçlar", en: "Results" },
  { id: "kurallar", tr: "Kurallar", en: "Rules" },
  { id: "oyuncu", tr: "Oyuncu", en: "Player" },
  { id: "1v1", tr: "Özel 1v1", en: "Private 1v1" },
];
const currentPage = (): Page =>
  pages.some((p) => p.id === location.hash.slice(1)) ||
  ["admin", "oyuncu", "hesap", "dene"].includes(location.hash.slice(1)) ||
  /^#veto\/[A-Z0-9]+$/.test(location.hash) ||
  /^#1v1\/duel-[a-f0-9-]+$/.test(location.hash)
    ? (location.hash.slice(1) as Page)
    : "turnuva";

export default function App() {
  const { tx, lang } = useI18n();
  const arena = useArena();
  const { byId, champion, matches, source, teamById, setMode, teams } =
    useTournament();
  const admin = accessFor(arena.snapshot.config, arena.snapshot.me).role === "admin" || (!arena.online && arena.previewAdmin);
  const activeMatch = matches.some((match) => ["live", "paused", "restoring"].includes(matchPhase(match, arena.snapshot.runtimes?.[match.id], arena.snapshot.vetos.find(v => v.matchId === match.id))));
  const seenVeto = useRef<string | null>(null);
  const [page, setPage] = useState<Page>(currentPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const minimal = arena.snapshot.config.presentation?.minimal === true;
  const minimalPublic = minimal && ["turnuva", "maclar", "takimlar", "sonuclar", "kurallar"].includes(page);
  useEffect(() => {
    const handler = () => {
      setPage(currentPage());
      setMenuOpen(false);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    const found = pages.find((p) => p.id === page);
    const label = minimalPublic
      ? tx("Turnuva", "Tournament")
      : found
        ? tx(found.tr, found.en)
        : page === "hesap"
          ? tx("Hesap ayarları", "Account settings")
          : page === "admin"
            ? tx("Yönetim", "Admin")
            : page.startsWith("1v1/")
              ? tx("Özel 1v1", "Private 1v1")
              : page.startsWith("veto/")
                ? tx("Harita vetosu", "Map veto")
                : tx("Turnuvayı dene", "Try tournament");
    document.title = `${label} · ${arena.snapshot.config.title}`;
  }, [page, arena.snapshot.config.title, minimalPublic, lang, tx]);
  useEffect(() => {
    if (
      arena.snapshot.me?.role !== "player" ||
      page === "admin" ||
      page === "hesap" ||
      page === "1v1" ||
      page.startsWith("1v1/") ||
      page.startsWith("veto/")
    )
      return;
    const activeVetos = arena.snapshot.vetos.filter(
      (v) => !vetoDone(v) && !v.rehearsal,
    );
    const active =
      activeVetos.find(
        (v) => (arena.snapshot.runtimes?.[v.matchId]?.teams || arena.snapshot.config.teams)
          .some((t) => (t.id === v.a || t.id === v.b) &&
            t.roster.some((p) => !!p.steamId && p.steamId === arena.snapshot.me?.steamId)),
      );
    if (active && seenVeto.current !== active.matchId) {
      seenVeto.current = active.matchId;
      setMode("server");
      location.hash = `veto/${active.matchId}`;
    }
  }, [arena.snapshot.vetos, arena.snapshot.me, arena.snapshot.config.teams, arena.snapshot.runtimes, page, setMode]);
  useEffect(() => { if (!admin && source === "local") setMode("server"); }, [admin, source, setMode]);
  const navigate = (target: Page) => {
    location.hash = target;
  };
  if (page.startsWith("veto/"))
    return (
      <Suspense fallback={<main className="veto-page"><p role="status">{tx("Yükleniyor…", "Loading…")}</p></main>}>
        <VetoPage key={page} matchId={page.slice(5)} />
      </Suspense>
    );
  return (
    <>
      <header className={`site-header account-header${minimal ? " is-minimal" : ""}`}>
        <div className="header-inner">
          <AccountMenu />
          <a
            href="#turnuva"
            className="brand"
            aria-label={`${arena.snapshot.config.title} ${tx("ana sayfa", "home")}`}
          >
            <span className="brand-symbol">
              <svg viewBox="0 0 40 40" aria-hidden="true">
                <path
                  d="M8 30 18 9h6l8 21h-7l-4-13-6 13H8Zm7-8h12v4H15z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span>
              {arena.snapshot.config.title}
              <small>COUNTER-STRIKE 2</small>
            </span>
          </a>
          <nav
            className={menuOpen ? "main-nav is-open" : "main-nav"}
            aria-label={tx("Ana menü", "Main menu")}
          >
            {pages.filter((p) => !["maclar", "oyuncu", "kurallar"].includes(p.id) &&
              (!minimal || p.id === "turnuva") &&
              (p.id !== "1v1" || !!arena.snapshot.me || admin)).map((p) => (
              <a
                key={p.id}
                href={`#${p.id}`}
                className={
                  page === p.id || (p.id === "1v1" && page.startsWith("1v1/"))
                    ? "active"
                    : ""
                }
                aria-current={
                  page === p.id || (p.id === "1v1" && page.startsWith("1v1/"))
                    ? "page"
                    : undefined
                }
              >
                {tx(p.tr, p.en)}
                {p.id === "maclar" && <span className="nav-live-dot" />}
              </a>
            ))}
          </nav>
          <div className="header-right">
            <span className="season">
              <span /> {tx("SEZON 01", "SEASON 01")}
            </span>
            <span className="demo-tag">
              {source === "api" ? "MATCHZY / API" : tx("DENEME SÜRÜMÜ", "DEMO MODE")}
            </span>
          </div>
          <LanguageToggle />
          <button
            className="mobile-menu icon-button"
            aria-label={menuOpen ? tx("Menüyü kapat", "Close menu") : tx("Menüyü aç", "Open menu")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </header>
      <main className={`site-main${minimalPublic ? " minimal-site-main" : ""}`}>
        {minimalPublic ? <MinimalTournament onSelect={setSelectedMatch} /> : page === "turnuva" ? (
          <>
            <Hero onSchedule={() => navigate("maclar")} />
            <div className="tournament-strip">
              <div>
                <Users size={17} />
                <strong>{teams.length}</strong>
                <span>{tx("TAKIM", "TEAMS")}</span>
              </div>
              <div>
                <Crosshair size={17} />
                <strong>
                  {teams.reduce((sum, t) => sum + t.players.length, 0)}
                </strong>
                <span>{tx("OYUNCU", "PLAYERS")}</span>
              </div>
              <div>
                <Layers3 size={17} />
                <strong>{tx("Çift eleme", "Double elim")}</strong>
                <span>FORMAT</span>
              </div>
              <div>
                <Trophy size={17} />
                <strong>
                  {champion ? teamById(champion)?.name : tx("Tek şampiyon", "One champion")}
                </strong>
                <span>{tx("HEDEF", "GOAL")}</span>
              </div>
              <span className={`strip-end ${champion ? "completed" : activeMatch ? "live" : "preparing"}`}>
                <span className="live-dot" />{" "}
                {champion
                  ? tx("ŞAMPİYON BELLİ", "CHAMPION CROWNED")
                  : activeMatch
                    ? tx("MÜCADELE DEVAM EDİYOR", "MATCHES IN PROGRESS")
                    : matches.some((m) => m.status === "completed")
                      ? tx("TURNUVA DEVAM EDİYOR", "TOURNAMENT IN PROGRESS")
                      : tx("TURNUVA HAZIRLANIYOR", "TOURNAMENT PREPARING")}
              </span>
            </div>
            <LiveConnection />
            <section className="match-overview">
              <div className="overview-label">
                <span className="eyebrow">{tx("GÖZÜN OYUNDA OLSUN", "KEEP YOUR EYE ON THE GAME")}</span>
                <span className="muted">{tx("01 / MAÇ MERKEZİ", "01 / MATCH CENTER")}</span>
              </div>
              <div className="overview-grid">
                <FeaturedMatch onSelect={setSelectedMatch} />
                <Schedule
                  onSelect={setSelectedMatch}
                  onAll={() => navigate("maclar")}
                />
              </div>
            </section>
            <Bracket onSelect={setSelectedMatch} />
            <section className="bottom-banner">
              <div className="banner-icon">
                <Shield size={22} strokeWidth={1.4} />
              </div>
              <div>
                <h3>{tx("Rekabet büyük. Oyun temiz.", "High competition. Fair play.")}</h3>
                <p>{tx("Sahneye çıkmadan önce turnuva kurallarına göz at.", "Review the tournament rules before stepping onto the stage.")}</p>
              </div>
              <button
                className="button-text"
                onClick={() => navigate("kurallar")}
              >
                {tx("Kuralları incele", "View rules")} <ArrowUpRight size={17} />
              </button>
            </section>
          </>
        ) : (
          <Suspense fallback={<section className="subpage"><p role="status">{tx("Yükleniyor…", "Loading…")}</p></section>}>
            {page === "maclar" ? (
              <MatchesPage onSelect={setSelectedMatch} />
            ) : page === "takimlar" ? (
              <TeamsPage onSelect={setSelectedTeam} />
            ) : page === "sonuclar" ? (
              <ResultsPage />
            ) : page === "admin" ? (
              <AdminPage />
            ) : page === "hesap" ? (
              <PlayerPage accountView />
            ) : page === "oyuncu" ? (
              <PlayerPage />
            ) : page === "1v1" || page.startsWith("1v1/") ? (
              <DuelPage
                key={page}
                roomId={page.startsWith("1v1/") ? page.slice(4) : undefined}
              />
            ) : page === "dene" ? (
              admin ? (
                <TestPage />
              ) : (
                <section className="subpage">
                  <h1>{tx("Prova alanı yöneticiye özel.", "Rehearsal mode is admin-only.")}</h1>
                  <RoleScope />
                  <a href="#turnuva">{tx("Turnuvaya dön", "Back to tournament")}</a>
                </section>
              )
            ) : (
              <RulesPage />
            )}
          </Suspense>
        )}
      </main>
      {!minimal && <footer className="site-footer">
        <a className="footer-brand" href="#turnuva">
          <Crosshair size={16} /> {arena.snapshot.config.title}
        </a>
        <span>{tx("Okulun sahnesi. Oyunun birleştirici gücü.", "The school stage. The unifying power of the game.")}</span>
        <a className="footer-admin-link" href="#admin">
          {admin ? tx("Yönetim", "Admin") : tx("Yönetici girişi", "Admin login")}
        </a>
        <a className="footer-admin-link" href="#hesap">
          {tx("Hesap ayarları", "Account settings")}
        </a>
        <span className="footer-demo">
          {source === "api"
            ? tx("MatchZy · Ortak sunucu verileri", "MatchZy · Shared server data")
            : tx("Kişisel deneme · Veriler bu tarayıcıda", "Personal trial · Stored in this browser")}{" "}
          <span>© 2026</span>
        </span>
      </footer>}
      <DetailDialog
        match={selectedMatch ? byId[selectedMatch.id] || null : null}
        team={selectedTeam}
        onClose={() => {
          setSelectedMatch(null);
          setSelectedTeam(null);
        }}
      />
    </>
  );
}
