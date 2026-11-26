import { currentMap, mapImage } from "../arena/maps";
import { useState } from "react";
import { Crosshair, ArrowRight, ChevronRight } from "lucide-react";
import { type Match } from "../data";
import { useTournament } from "../tournament/TournamentContext";
import { TeamMark, Status } from "../components/MatchUI";
import { useI18n } from "../i18n";

export function MatchesPage({ onSelect }: { onSelect: (m: Match) => void }) {
  const { tx, locale, roundLabel, sourceLabel } = useI18n();
  const { matches, teamById } = useTournament();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const filtered = matches.filter(
    (m) =>
      (filter === "all" || m.status === filter) &&
      `${teamById(m.a)?.name || ""} ${teamById(m.b)?.name || ""} ${m.id} ${roundLabel(m.round)}`
        .toLocaleLowerCase(locale)
        .includes(query.toLocaleLowerCase(locale)),
  );
  return (
    <section className="subpage">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tx("HER RAUNTUN BİR HİKÂYESİ VAR", "EVERY ROUND HAS A STORY")}</span>
          <h1>
            {tx("Maç merkezi", "Match center")}<span className="heading-dot">.</span>
          </h1>
          <p>{tx("İlk düellodan son haritaya. Bütün mücadeleler burada.", "From the opening duel to the final map. Every matchup is here.")}</p>
        </div>
        <div className="subpage-count">
          {matches.length}
          <span>{tx("TOPLAM MAÇ", "TOTAL MATCHES")}</span>
        </div>
      </div>
      <div className="list-toolbar">
        <div className="filter-tabs">
          {[
            { id: "all", text: tx("Tümü", "All") },
            { id: "live", text: tx("Canlı", "Live") },
            { id: "upcoming", text: tx("Yaklaşan", "Upcoming") },
            { id: "completed", text: tx("Tamamlanan", "Completed") },
          ].map((f) => (
            <button
              key={f.id}
              className={filter === f.id ? "active" : ""}
              onClick={() => setFilter(f.id)}
            >
              {f.text}
              {f.id === "live" && <span className="live-dot" />}
            </button>
          ))}
        </div>
        <input
          aria-label={tx("Maç veya takım ara", "Search match or team")}
          placeholder={tx("Takım veya maç ara…", "Search team or match…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="match-list">
        {filtered.map((m) => (
          <button
            className={`match-list-row ${m.status}`}
            style={
              {
                "--map-image": currentMap(m)
                  ? `url(${mapImage(currentMap(m))})`
                  : "none",
              } as React.CSSProperties
            }
            key={m.id}
            onClick={() => onSelect(m)}
          >
            <span className="list-match-time">
              <small>
                {m.id} / {m.format}
              </small>
            </span>
            <span className="list-team team-a">
              {teamById(m.a)?.name || sourceLabel(m.sourceA)}
              <TeamMark team={teamById(m.a)} />
            </span>
            <span className="list-score">
              {m.score ? `${m.score[0]} : ${m.score[1]}` : "—"}
            </span>
            <span className="list-team team-b">
              <TeamMark team={teamById(m.b)} />
              {teamById(m.b)?.name || sourceLabel(m.sourceB)}
            </span>
            <span className="list-match-status">
              <Status status={m.status} />
              <small>{roundLabel(m.round)}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
        {!filtered.length && (
          <div className="empty-state">
            <Crosshair size={30} />
            <h3>{tx("Eşleşme bulunamadı.", "No matches found.")}</h3>
            <p>{tx("Farklı bir takım adı veya filtre dene.", "Try a different team name or filter.")}</p>
            <button
              className="button-text"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              {tx("Filtreleri temizle", "Clear filters")} <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
