import { type Match, type Team } from "../data";
import { useTournament } from "../tournament/TournamentContext";
import { hsPercent, matchRating } from "../tournament/liveTypes";
import { TeamMark } from "./MatchUI";
import { mapImage } from "../arena/maps";
import { useI18n } from "../i18n";

export function MapResults({ match }: { match: Match }) {
  const { tx } = useI18n();
  const { teamById } = useTournament();
  if (match.resolution === "forfeit")
    return (
      <p className="forfeit-note">
        {tx(
          `Hükmen sonuç · ${match.note || "Yönetici kararı"}. Harita oynanmış veya oyuncu istatistiği oluşmuş sayılmaz.`,
          `Forfeit result · ${match.note || "Admin decision"}. No map was played and no player stats were recorded.`,
        )}
      </p>
    );
  const maps =
    match.maps ||
    (match.format === "BO1" && match.score
      ? [
          {
            name: match.map || tx("Harita belirtilmedi", "Map unspecified"),
            score: match.score,
            status:
              match.status === "completed"
                ? ("completed" as const)
                : ("live" as const),
          },
        ]
      : []);
  const slots = match.format === "BO1" ? 1 : 3;
  return (
    <div
      className={`map-results ${match.format.toLowerCase()}`}
      aria-label={
        match.format === "BO1" ? tx("Harita sonucu", "Map result") : tx("Serinin harita sonuçları", "Series map results")
      }
    >
      {Array.from({ length: slots }, (_, i) => {
        const map = maps[i];
        const name = map?.name || match.selectedMaps?.[i];
        const image = mapImage(name);
        const notPlayed =
          !map &&
          match.status === "completed" &&
          match.format === "BO3" &&
          i >= (match.score ? match.score[0] + match.score[1] : 3);
        const missingDetails =
          !map && match.status === "completed" && !notPlayed;
        return (
          <div
            className={`map-result ${map?.status || "pending"} ${notPlayed ? "not-played" : ""} ${image ? "with-map-photo" : ""}`}
            style={
              image
                ? ({ "--map-image": `url("${image}")` } as React.CSSProperties)
                : undefined
            }
            key={i}
          >
            <span className="map-order">
              {String(i + 1).padStart(2, "0")} /{" "}
              {map?.status === "live"
                ? tx("CANLI", "LIVE")
                : map
                  ? tx("TAMAMLANDI", "COMPLETED")
                  : notPlayed
                    ? tx("OYNANMADI", "NOT PLAYED")
                    : missingDetails
                      ? tx("DETAY YOK", "NO DETAILS")
                      : tx("BEKLENİYOR", "PENDING")}
            </span>
            <span className="map-name">{name || tx(`${i + 1}. harita`, `Map ${i + 1}`)}</span>
            <b>
              {map ? (
                <>
                  {map.score[0]} <i>:</i> {map.score[1]}
                </>
              ) : (
                "—"
              )}
            </b>
            <small>
              {map?.status === "completed"
                ? `${teamById(map.score[0] > map.score[1] ? match.a : match.b)?.name || tx("Takım", "Team")} ${tx("kazandı", "won")}`
                : map
                  ? tx("Raunt skoru", "Round score")
                  : notPlayed
                    ? tx("Seri tamamlandı", "Series completed")
                    : missingDetails
                      ? tx("Harita sonucu girilmedi", "Map score not entered")
                      : name
                        ? tx("Sunucuda başlama bekleniyor", "Waiting for server start")
                        : tx("Harita henüz belli değil", "Map TBD")}
            </small>
          </div>
        );
      })}
    </div>
  );
}

export function PlayerStatsTable({
  team,
  match,
}: {
  team: Team;
  match: Match;
}) {
  const { tx, locale } = useI18n();
  const { liveData, connection, matchTeams } = useTournament();
  if (match.resolution === "forfeit") return null;
  team = matchTeams(match).find((t) => t.id === team.id) || team;
  const snapshot = liveData[match.id];
  const stats = snapshot?.players
    .filter((p) => p.teamId === team.id)
    .sort((a, b) => b.kills - a.kills);
  const rows = stats?.length
    ? stats.map((p) => ({ name: p.name, stats: p, key: p.steamId }))
    : team.players.map((name, i) => ({
        name,
        stats: undefined,
        key: String(i),
      }));
  return (
    <div className="player-stats">
      <div className="stats-heading">
        <TeamMark team={team} />
        <h3>{team.name}</h3>
        <span>
          {match.format === "BO3" ? tx("SERİ TOPLAMI", "SERIES TOTAL") : tx("HARİTA TOPLAMI", "MAP TOTAL")}
        </span>
      </div>
      <p className="stats-scroll-hint">
        {tx("Hasar ve rating için tabloyu yana kaydır →", "Scroll table horizontally for damage and rating →")}
      </p>
      <div
        className="stats-scroll"
        role="region"
        aria-label={tx(`${team.name} maç istatistikleri`, `${team.name} match statistics`)}
        tabIndex={0}
      >
        <table>
          <caption className="sr-only">
            {tx(
              `${team.name} oyuncu istatistikleri: öldürme, ölüm, asist ve kafa vuruşu yüzdesi`,
              `${team.name} player stats: kills, deaths, assists, and headshot percentage`,
            )}
          </caption>
          <thead>
            <tr>
              <th scope="col">{tx("OYUNCU", "PLAYER")}</th>
              <th scope="col">
                <abbr title={tx("Öldürme", "Kills")}>K</abbr>
              </th>
              <th scope="col">
                <abbr title={tx("Ölüm", "Deaths")}>D</abbr>
              </th>
              <th scope="col">
                <abbr title={tx("Asist", "Assists")}>A</abbr>
              </th>
              <th scope="col">
                <abbr title={tx("Kafa vuruşuyla alınan kill / tüm kill", "Headshot kills / total kills")}>HS%</abbr>
              </th>
              <th scope="col">
                <abbr title={tx("Bu maçtaki toplam hasar", "Total damage in this match")}>{tx("HASAR", "DMG")}</abbr>
              </th>
              <th scope="col">
                <abbr title={tx("Bu maçtaki raunt başına hasar", "Average damage per round in this match")}>ADR</abbr>
              </th>
              <th scope="col">
                <abbr title={tx("Arena 1.0: maç bazlı KPR, ADR ve hayatta kalma göstergesi. HLTV rating değildir.", "Arena 1.0: match-only KPR, ADR, and survival indicator. Not an HLTV rating.")}>
                  RATING
                </abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr className="roster-player" key={row.key}>
                <th scope="row">
                  <span className="player-rank">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {row.name}
                </th>
                <td className="kills">{row.stats?.kills ?? "—"}</td>
                <td>{row.stats?.deaths ?? "—"}</td>
                <td>{row.stats?.assists ?? "—"}</td>
                <td>
                  {row.stats
                    ? `${hsPercent(row.stats).toLocaleString(locale, { maximumFractionDigits: 1 })}%`
                    : "—"}
                </td>
                <td>{row.stats?.damage ?? "—"}</td>
                <td>
                  {row.stats?.damage !== undefined && row.stats.roundsPlayed
                    ? (row.stats.damage / row.stats.roundsPlayed).toFixed(1)
                    : "—"}
                </td>
                <td className="rating-value">
                  {row.stats && matchRating(row.stats) !== null
                    ? matchRating(row.stats)!.toFixed(2)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="stats-note">
        {tx("Arena 1.0 · Yalnızca bu maç · HLTV rating değildir.", "Arena 1.0 · Match-only · Not an HLTV rating.")}{" "}
        {stats?.length
          ? connection.status === "error"
            ? tx("Bağlantı kesildi · Son alınan istatistikler", "Connection lost · Last received stats")
            : tx("MatchZy · Raunt sonunda güncellenir", "MatchZy · Updates after each round")
          : tx("Sunucu istatistikleri bekleniyor", "Waiting for server stats")}
      </p>
    </div>
  );
}
