import { useRef, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Trophy, Layers3 } from "lucide-react";
import { type Match } from "../data";
import { useTournament } from "../tournament/TournamentContext";
import { BracketMatch } from "./MatchUI";
import { useI18n } from "../i18n";
import "../bracket.css";

const roundNames = {
  tr: {
    upper: ["Çeyrek final", "Yarı final", "Üst final"],
    lower: ["1. tur", "2. tur", "Yarı final", "Alt final"],
  },
  en: {
    upper: ["Quarterfinals", "Semifinals", "Upper final"],
    lower: ["Round 1", "Round 2", "Semifinal", "Lower final"],
  },
};

function BracketLane({
  kind,
  columns,
  onSelect,
}: {
  kind: "upper" | "lower";
  columns: Match[][];
  onSelect: (m: Match) => void;
}) {
  const { lang, tx } = useI18n();
  const [round, setRound] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const id = kind === "upper" ? "winner-bracket" : "loser-bracket";
  const title =
    kind === "upper"
      ? tx("Kazananlar braketi", "Upper bracket")
      : tx("Kaybedenler braketi", "Lower bracket");
  function selectRound(index: number) {
    const scroller = scrollRef.current;
    const column = scroller?.querySelectorAll<HTMLElement>(".bracket-column")[index];
    if (!scroller || !column) return;
    setRound(index);
    scroller.scrollTo({
      left: scroller.scrollLeft + column.getBoundingClientRect().left - scroller.getBoundingClientRect().left - 16,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }
  return (
    <section className={`bracket-panel bracket-lane ${kind}-lane`} id={id} aria-labelledby={`${id}-heading`}>
      <div className="bracket-lane-heading">
        <h3 id={`${id}-heading`}>
          {kind === "upper" ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
          {title}
        </h3>
        <p>{kind === "upper" ? tx("Kaybeden takım aşağıdaki kaybedenler braketine geçer.", "Losing teams drop to the lower bracket below.") : tx("İkinci yenilgisini alan takım turnuvadan elenir.", "A second loss eliminates the team from the tournament.")}</p>
      </div>
      <div className="bracket-navigation">
        <span>{tx("Diğer turları görmek için yana kaydır", "Scroll horizontally to view other rounds")}</span>
        <div aria-label={tx(`${title} tur seçimi`, `${title} round selector`)}>
          {columns.map((_, i) => (
            <button key={i} aria-pressed={round === i} aria-controls={`${id}-content`} onClick={() => selectRound(i)}>
              {roundNames[lang][kind][i]}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={() => {
          const scroller = scrollRef.current;
          if (!scroller) return;
          const left = scroller.getBoundingClientRect().left + 16;
          const distances = Array.from(scroller.querySelectorAll<HTMLElement>(".bracket-column"), column => Math.abs(column.getBoundingClientRect().left - left));
          if (distances.length) setRound(distances.indexOf(Math.min(...distances)));
        }}
        className="bracket-scroll"
        id={`${id}-content`}
        role="region"
        aria-label={tx(`${title} maçları`, `${title} matches`)}
        tabIndex={0}
      >
        <div className={`bracket-grid ${kind}`}>
          {columns.map((column, i) => (
            <div className="bracket-column" key={i}>
              <div className="column-title">
                <span>{roundNames[lang][kind][i]}</span>
                <span>{kind === "upper" && i === 0 ? "BO1" : "BO3"}</span>
              </div>
              <div className="column-matches">
                {column.map(match => (
                  <div className="match-node" key={match.id}>
                    <BracketMatch match={match} onSelect={onSelect} />
                  </div>
                ))}
                {i < columns.length - 1 && (
                  <svg className="flow-lines" viewBox={kind === "upper" ? "0 0 40 520" : "0 0 40 340"} preserveAspectRatio="none" aria-hidden="true">
                    <path d={kind === "upper"
                      ? i === 0 ? "M0 65H20V195H0 M20 130H40 M0 325H20V455H0 M20 390H40" : "M0 130H20V390H0 M20 260H40"
                      : i === 0 ? "M0 85H40 M0 255H40" : i === 1 ? "M0 85H20V255H0 M20 170H40" : "M0 170H40"} />
                  </svg>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Bracket({ onSelect }: { onSelect: (m: Match) => void }) {
  const { tx } = useI18n();
  const { upper, lower, finals, champion, resetFinal, teamById } = useTournament();
  return (
    <section className="bracket-section stacked-brackets" id="fikstur">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tx("ŞAMPİYONLUĞA GİDEN YOL", "ROAD TO THE CHAMPIONSHIP")}</span>
          <h2>{tx("Turnuva ağacı", "Tournament bracket")}<span className="heading-dot">.</span></h2>
        </div>
        <span className="section-note"><Layers3 size={14} /> {tx("Çift eleme sistemi", "Double elimination")}</span>
      </div>
      <BracketLane kind="upper" columns={upper} onSelect={onSelect} />
      <BracketLane kind="lower" columns={lower} onSelect={onSelect} />
      <section className="bracket-panel bracket-finals" id="final-bracket" aria-labelledby="final-bracket-heading">
        <div className="bracket-lane-heading">
          <h3 id="final-bracket-heading"><Trophy size={18} /> {tx("Büyük final", "Grand final")}</h3>
          <p>{tx("İki braketin kazananı şampiyonluk için karşılaşır.", "The winners of both brackets face off for the title.")}</p>
        </div>
        <div className="grand-final">
          <h4>{champion ? `${tx("Şampiyon", "Champion")}: ${teamById(champion)?.name}` : tx("Tek kupa. Tek şampiyon.", "One trophy. One champion.")}</h4>
          <div className="final-matches">
            {finals.map(final => (
              <div className="final-series" key={final.id}>
                <span>{final.id === "GF2" ? tx("TEKRAR SERİSİ", "RESET SERIES") : tx("BÜYÜK FİNAL", "GRAND FINAL")}</span>
                <BracketMatch match={final} onSelect={onSelect} />
              </div>
            ))}
          </div>
          <p>{resetFinal ? tx("Kaybedenler braketi kazananı ilk finali alırsa ikinci final serisi oynanır.", "If the lower bracket winner wins the first final, a bracket-reset series is played.") : tx("Final tek seridir; kazananlar braketi ek seri avantajı sağlamaz.", "The grand final is a single series with no bracket reset.")}</p>
        </div>
      </section>
      <div className="bracket-legend">
        <span><i className="legend-dot orange" /> {tx("Canlı maç", "Live match")}</span>
        <span><i className="legend-dot green" /> {tx("Tur atlayan takım", "Advancing team")}</span>
        <span className="bracket-instruction">{tx("Detayları görmek için bir maça tıkla", "Click a match to view details")} <ArrowUpRight size={12} /></span>
      </div>
    </section>
  );
}
