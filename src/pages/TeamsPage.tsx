import { ArrowUpRight, ArrowRight, Users } from "lucide-react";
import { type Team } from "../data";
import { TeamMark } from "../components/MatchUI";
import { useTournament } from "../tournament/TournamentContext";
import { useI18n } from "../i18n";

export function TeamsPage({ onSelect }: { onSelect: (t: Team) => void }) {
  const { tx } = useI18n();
  const { eliminated, champion, teams } = useTournament();
  return (
    <section className="subpage">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tx("AYNI SUNUCU. FARKLI HİKÂYELER.", "SAME SERVER. DIFFERENT STORIES.")}</span>
          <h1>
            {tx("Sahnedeki takımlar", "Teams on stage")}<span className="heading-dot">.</span>
          </h1>
          <p>
            {teams.length} {tx("takım", "teams")},{" "}
            {teams.reduce((sum, t) => sum + t.players.length, 0)} {tx("oyuncu. Kupaya uzanan tek yol.", "players. One road to the trophy.")}
          </p>
        </div>
        <span className="section-note">
          <Users size={16} /> {tx("5'e 5", "5v5")}
        </span>
      </div>
      <div className="teams-grid">
        {[...teams]
          .sort((a, b) => a.seed - b.seed)
          .map((t) => (
            <button
              className="team-card"
              key={t.id}
              onClick={() => onSelect(t)}
              style={{ "--team-color": t.color } as React.CSSProperties}
            >
              <div className="team-card-top">
                <span>#{String(t.seed).padStart(2, "0")}</span>
                <ArrowUpRight size={16} />
              </div>
              <TeamMark team={t} large />
              <h2>{t.name}</h2>
              <span className="team-tag">
                {t.tag} /{" "}
                {champion === t.id
                  ? tx("ŞAMPİYON", "CHAMPION")
                  : eliminated.has(t.id)
                    ? tx("ELENDİ", "ELIMINATED")
                    : tx("TURNUVADA", "ACTIVE")}
              </span>
              <div className="team-card-bottom">
                <span>
                  {t.players.length ? (
                    <>
                      {t.roster?.find((p) => p.id === t.captainId)?.name || tx("Kaptan atanmadı", "No captain assigned")}
                      {t.roster?.some((p) => p.id === t.captainId) && <small>{tx("KAPTAN", "CAPTAIN")}</small>}
                      <small>
                        {t.players.length}/5 {tx("oyuncu", "players")}
                        {t.players.length < 5 ? tx(" · Kadro eksik", " · Incomplete roster") : ""}
                      </small>
                    </>
                  ) : (
                    <>
                      <strong>{tx("Kadro oluşturulmadı", "No roster created")}</strong>
                      <small>{tx("0/5 oyuncu · Kaptan atanmadı", "0/5 players · No captain assigned")}</small>
                    </>
                  )}
                </span>
                <span>
                  {tx("Kadroyu gör", "View roster")} <ArrowRight size={13} />
                </span>
              </div>
            </button>
          ))}
      </div>
    </section>
  );
}
