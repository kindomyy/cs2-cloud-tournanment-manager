import {
  ArrowDown,
  ArrowUpRight,
  Crosshair,
  MapPin,
  Radio,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { type Match } from "../data";
import { useArena } from "../arena/ArenaContext";
import { accessFor } from "../arena/permissions";
import { matchPhase } from "../arena/operations";
import { useTournament } from "../tournament/TournamentContext";
import { currentMap, mapImage } from "../arena/maps";
import { TeamMark } from "./MatchUI";
import { MapResults, PlayerStatsTable } from "./MatchDetails";
import { useScoreboardReveal } from "./useScoreboardReveal";
import { MatchStage } from "./MatchStage";
import { ServerJoin } from "./ShareControls";
import { useI18n } from "../i18n";

export function Hero({ onSchedule }: { onSchedule: () => void }) {
  const { tx } = useI18n();
  const arena = useArena();
  const access = accessFor(arena.snapshot.config, arena.snapshot.me);
  return (
    <>
    <section className="hero">
      <div className="hero-text">
        <div className="hero-kicker">
          <span className="small-line" /> {tx("OKULUN TURNUVASI. SENİN SAHNEN.", "SCHOOL TOURNAMENT. YOUR STAGE.")}
        </div>
        <h1>
          {tx("DERS BİTER.", "CLASS ENDS.")}
          <br />
          <span>{tx("REKABET BAŞLAR.", "COMPETITION BEGINS.")}</span>
        </h1>
        <p>
          {tx("Beş kişi, tek hedef. Takımını destekle,", "Five players, one goal. Support your team,")}
          <br className="desktop-break" /> {tx("mücadeleyi takip et, şampiyonluğa tanık ol.", "follow the action, witness the championship.")}
        </p>
        <div className="hero-actions">
          <button
            className="button-primary"
            onClick={() =>
              document
                .getElementById("fikstur")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            {tx("Turnuva ağacını keşfet", "Explore the bracket")} <ArrowDown size={15} />
          </button>
          <button className="button-text" onClick={onSchedule}>
            {tx("Maçları gör", "View matches")} <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="art-grid" />
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
        <div className="art-coordinates">
          40°59′ N &nbsp; / &nbsp; 29°01′ E<br />
          {tx("REKABETİN KOORDİNATLARI", "COORDINATES OF COMPETITION")}
        </div>
        <div className="art-wordmark">
          CS<span>2</span>
          <Crosshair />
        </div>
        <div className="art-bottom">
          <span>COUNTER-STRIKE 2</span>
          <span>{tx("SEZON / 001", "SEASON / 001")}</span>
        </div>
        <div className="art-cross cross-one">+</div>
        <div className="art-cross cross-two">+</div>
      </div>
    </section>
    <aside className="player-journey" aria-label={tx("Turnuvaya katılım adımları", "Tournament participation steps")}>
      <div>
        <strong>{access.role === "admin" ? tx("Turnuvayı yönet", "Manage tournament") : access.role === "visitor" ? tx("Oyuncu musun?", "Are you a player?") : tx("Maçına hazırlan", "Prepare for your match")}</strong>
        <p>{tx("Steam ile giriş yap → Kadronu kontrol et → Maçına hazır ol", "Sign in with Steam → Check your roster → Ready up for your match")}</p>
      </div>
      <a className="button-text" href={access.role === "admin" ? "#admin" : "#oyuncu"}>
        {access.role === "admin" ? tx("Yönetimi aç", "Open admin") : tx("Oyuncu merkezine git", "Go to player hub")} <ArrowUpRight size={16} />
      </a>
      <a className="button-text" href="#sonuclar">{tx("Sonuçları gör", "View results")} <ArrowRight size={16} /></a>
    </aside>
    </>
  );
}

export function FeaturedMatch({ onSelect, match }: { onSelect: (m: Match) => void; match?: Match }) {
  const { tx, locale, phaseLabel, sourceLabel } = useI18n();
  const { featured: automatic, champion, teamById, liveData, matchTeams } = useTournament();
  const featured = match || automatic;
  const { snapshot } = useArena();
  const lineup = matchTeams(featured);
  const phase = matchPhase(featured, snapshot.runtimes?.[featured.id], snapshot.vetos.find(v => v.matchId === featured.id));
  const preMatch = ["preparing", "veto", "veto-complete", "loading", "warmup"].includes(phase);
  const forfeit = featured.resolution === "forfeit";
  const hasStats = !preMatch && !forfeit && !!liveData[featured.id]?.players.length;
  const hasMaps = !preMatch && !forfeit && !!(featured.maps?.length || featured.selectedMaps?.length || featured.score);
  const revealRef = useScoreboardReveal();
  return (
    <div
      className={`featured-card expanded-scoreboard has-map-backdrop${preMatch ? " preparing-scoreboard" : ""}`}
      ref={revealRef}
      style={
        {
          "--map-image": currentMap(featured)
            ? `url(${mapImage(currentMap(featured))})`
            : "none",
        } as React.CSSProperties
      }
    >
      <div className="featured-top">
        <span className="live-label">
          <span className="live-dot" />{" "}
          {champion
            ? tx("ŞAMPİYON BELLİ", "CHAMPION CROWNED")
            : phase === "live"
              ? tx("ŞİMDİ SAHNEDE", "LIVE NOW")
              : preMatch ? tx("SIRADAKİ MÜCADELE", "UP NEXT") : phaseLabel(phase).toLocaleUpperCase(locale)}
        </span>
        <span>
          {featured.id} <i /> {featured.format}
        </span>
      </div>
      <div className="featured-main">
        <div className="featured-team">
          <TeamMark team={teamById(featured.a)} large />
          <h3>{teamById(featured.a)?.name || sourceLabel(featured.sourceA)}</h3>
          <span>
            {teamById(featured.a)?.seed
              ? tx(`${teamById(featured.a)?.seed}. SERİBAŞI`, `SEED #${teamById(featured.a)?.seed}`)
              : tx("EŞLEŞME BEKLENİYOR", "TBD")}
          </span>
        </div>
        <div className="featured-score">
          {preMatch ? <strong className="preparation-label">{tx("Hazırlık", "Prep")}</strong> : <span className="score-numbers">
            {featured.score?.[0] ?? "–"} <i>:</i> {featured.score?.[1] ?? "–"}
          </span>}
          {!preMatch && <span className="round-label">
            {featured.format === "BO1" ? tx("RAUNT SKORU", "ROUND SCORE") : tx("HARİTA SKORU", "MAP SCORE")}
          </span>}
          <div className="map-badge">
            <MapPin size={11} />{" "}
            {currentMap(featured)?.toLocaleUpperCase(locale) || featured.format}
          </div>
        </div>
        <div className="featured-team">
          <TeamMark team={teamById(featured.b)} large />
          <h3>{teamById(featured.b)?.name || sourceLabel(featured.sourceB)}</h3>
          <span>
            {teamById(featured.b)?.seed
              ? tx(`${teamById(featured.b)?.seed}. SERİBAŞI`, `SEED #${teamById(featured.b)?.seed}`)
              : tx("EŞLEŞME BEKLENİYOR", "TBD")}
          </span>
        </div>
      </div>
      <MatchStage match={featured} />
      <ServerJoin />
      {hasMaps && <div className="featured-maps">
        <MapResults match={featured} />
      </div>}
      {hasStats ? <>
      <div className="featured-stats">
        {[featured.a, featured.b].map((id, i) => {
          const team = teamById(id);
          return team ? (
            <PlayerStatsTable key={team.id} team={team} match={featured} />
          ) : (
            <div className="stats-waiting" key={i}>
              {tx("Takım ve kadro bekleniyor.", "Waiting for team and roster.")}
            </div>
          );
        })}
      </div>
      <p className="stats-legend">
        {tx("K: Öldürme · D: Ölüm · A: Asist · HS%: Kafa vuruşuyla alınan kill oranı", "K: Kills · D: Deaths · A: Assists · HS%: Headshot kill percentage")}
      </p>
      </> : <div className="featured-preparation">
        <strong>{forfeit ? tx("Hükmen sonuç", "Forfeit result") : preMatch ? tx("Maç hazırlığı", "Match preparation") : phase === "cancelled" || phase === "review" ? phaseLabel(phase) : tx("Oyuncu istatistiği bekleniyor", "Waiting for player stats")}</strong>
        <p>{forfeit
          ? tx(`${featured.note || "Yönetici kararı"}. Harita oynanmış veya oyuncu istatistiği oluşmuş sayılmaz.`, `${featured.note || "Admin decision"}. No map was played and no player stats were recorded.`)
          : phase === "cancelled" ? tx("Bu maç iptal edildi. Yeni maç veya tekrar kararı organizatör tarafından duyurulacak.", "This match was cancelled. A rematch or reschedule will be announced by the organizer.")
          : phase === "review" ? tx("Kesin sonuç henüz doğrulanmadı. Yönetimin sonucu kontrol etmesi bekleniyor.", "Final score is not confirmed yet. Waiting for admin review.")
          : preMatch
          ? tx("Maç başlayana kadar kadroları ve hazırlık aşamasını takip edebilirsin.", "Follow the rosters and preparation status until the match goes live.")
          : tx("Sunucudan veri geldiğinde maçın oyuncu istatistikleri burada görünecek.", "Player statistics will appear here once data arrives from the server.")}</p>
        {preMatch && <div className="preparation-rosters">{[featured.a, featured.b].map((id, i) => {
          const team = lineup.find(t => t.id === id) || teamById(id);
          return <span key={id || i}>{team?.name || tx("Eşleşme bekleniyor", "TBD")} <b>{team?.roster?.length ?? team?.players.length ?? 0}/5 {tx("oyuncu", "players")}</b></span>;
        })}</div>}
        {preMatch && !!featured.selectedMaps?.length && <p className="preparation-maps">{tx("Seçilen haritalar", "Selected maps")}: {featured.selectedMaps.join(" · ")}</p>}
      </div>}
      <button className="featured-bottom" onClick={() => onSelect(featured)}>
        <span>
          <Radio size={14} />{" "}
          {champion
            ? `${tx("Şampiyon", "Champion")}: ${teamById(champion)?.name}`
            : phaseLabel(phase)}
        </span>
        <span>
          {tx("Maç merkezi", "Match center")} <ArrowUpRight size={15} />
        </span>
      </button>
    </div>
  );
}

export function Schedule({
  onSelect,
  onAll,
}: {
  onSelect: (m: Match) => void;
  onAll: () => void;
}) {
  const { tx, sourceLabel } = useI18n();
  const { matches, teamById } = useTournament();
  const upcoming = matches.filter((m) => m.status === "upcoming").slice(0, 2);
  return (
    <div className="schedule-card">
      <div className="card-heading">
        <h3>{tx("Sıradaki maçlar", "Upcoming matches")}</h3>
        <Crosshair size={17} />
      </div>
      <div className="schedule-day">
        <span>{tx("SIRADAKİ EŞLEŞMELER", "NEXT MATCHUPS")}</span>
      </div>
      {upcoming.map((m) => (
        <button className="schedule-row" key={m.id} onClick={() => onSelect(m)}>
          <span className="schedule-time">
            {m.id}
            <small>{m.format}</small>
          </span>
          <span className="schedule-teams">
            <span>
              <TeamMark team={teamById(m.a)} />
              {teamById(m.a)?.name || sourceLabel(m.sourceA)}
            </span>
            <span>
              <TeamMark team={teamById(m.b)} />
              {teamById(m.b)?.name || sourceLabel(m.sourceB)}
            </span>
          </span>
          <ChevronRight size={15} />
        </button>
      ))}
      {!upcoming.length && (
        <p className="schedule-finished">
          {tx("Bütün maçlar tamamlandı. Bir sonraki turnuvada görüşürüz.", "All matches are complete. See you at the next tournament.")}
        </p>
      )}
      <button className="schedule-all" onClick={onAll}>
        {tx("Tüm maçları gör", "View all matches")} <ArrowRight size={14} />
      </button>
    </div>
  );
}
