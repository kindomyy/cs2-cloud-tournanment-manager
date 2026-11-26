import { useTournament } from "../tournament/TournamentContext";
import { Check, Clock3, ArrowUpRight } from "lucide-react";
import { type Match, type Team } from "../data";
import { currentMap } from "../arena/maps";
import { useI18n } from "../i18n";

export function TeamMark({
  team,
  large = false,
}: {
  team?: Team;
  large?: boolean;
}) {
  return (
    <span
      className={`team-mark ${large ? "large" : ""} ${team?.id || "unknown"}`}
      style={
        { "--team-color": team?.color || "#73767b" } as React.CSSProperties
      }
      aria-hidden="true"
    >
      {team?.logo ? (
        <img className="team-custom-logo" src={team.logo} alt="" />
      ) : team &&
        ![
          "nova",
          "orbit",
          "parallax",
          "void",
          "apex",
          "flux",
          "ember",
          "echo",
        ].includes(team.id) ? (
        <span className="team-monogram">{team.tag.slice(0, 2)}</span>
      ) : team ? (
        <svg viewBox="0 0 48 48" fill="none">
          <path
            d={
              team.id === "parallax"
                ? "M9 10h14L9 34V10Zm16 4h14L25 38V14Z"
                : team.id === "void"
                  ? "m7 11 17 28 17-28H30l-6 12-6-12H7Z"
                  : team.id === "nova"
                    ? "m24 4 5 13 14 7-14 6-5 14-6-14-13-6 13-7 6-13Z"
                    : team.id === "apex"
                      ? "m24 7 19 33H5L24 7Zm0 14-7 12h14l-7-12Z"
                      : team.id === "orbit"
                        ? "M24 7a17 17 0 1 0 0 34 17 17 0 0 0 0-34Zm0 10a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z"
                        : team.id === "flux"
                          ? "m27 4-19 24h14l-2 16 20-25H26l1-15Z"
                          : team.id === "ember"
                            ? "m25 4 3 15 7-5 5 13-7 14H15L8 28l9-11 2 9 6-22Z"
                            : "M8 8h32v8H16v5h19v7H16v5h24v8H8V8Z"
            }
            fill="currentColor"
            fillRule="evenodd"
          />
        </svg>
      ) : (
        <span>?</span>
      )}
    </span>
  );
}

export function Status({ status }: { status: Match["status"] }) {
  const { tx } = useI18n();
  return (
    <span className={`status ${status}`}>
      {status === "live" ? (
        <>
          <span className="live-dot" /> {tx("CANLI", "LIVE")}
        </>
      ) : status === "completed" ? (
        <>
          <Check size={11} /> {tx("TAMAMLANDI", "COMPLETED")}
        </>
      ) : (
        <>
          <Clock3 size={11} /> {tx("YAKINDA", "UPCOMING")}
        </>
      )}
    </span>
  );
}

export function BracketMatch({
  match,
  onSelect,
}: {
  match: Match;
  onSelect: (m: Match) => void;
}) {
  const { tx, sourceLabel } = useI18n();
  const { teamById } = useTournament();
  return (
    <button
      className={`bracket-match ${match.status}`}
      onClick={() => onSelect(match)}
      aria-label={`${match.id}: ${teamById(match.a)?.name || sourceLabel(match.sourceA)} - ${teamById(match.b)?.name || sourceLabel(match.sourceB)}, ${tx("maç detayları", "match details")}`}
    >
      <div className="match-meta">
        <span>
          {match.id} <span className="meta-separator">/</span> {match.format}
        </span>
        {match.status === "live" ? (
          <Status status="live" />
        ) : (
          <span>
            {match.status === "completed" ? tx("TAMAMLANDI", "COMPLETED") : tx("BEKLİYOR", "PENDING")}
          </span>
        )}
      </div>
      {[match.a, match.b].map((id, i) => (
        <div
          className={`bracket-team ${id ? "" : "undecided"} ${match.status === "completed" && match.score && match.score[i] > match.score[1 - i] ? "winner" : ""}`}
          key={i}
        >
          <TeamMark team={teamById(id)} />
          <span>
            {teamById(id)?.name || sourceLabel(i === 0 ? match.sourceA : match.sourceB)}
          </span>
          <b>{match.score ? match.score[i] : "–"}</b>
        </div>
      ))}
      {match.status === "live" && (
        <div className="match-live-footer">
          <span className="live-dot" /> {currentMap(match) || match.format} <ArrowUpRight size={12} />
        </div>
      )}
    </button>
  );
}
