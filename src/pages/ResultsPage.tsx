import { Trophy } from "lucide-react";
import { useTournament } from "../tournament/TournamentContext";
import { tournamentResults } from "../tournament/results";
import { hsPercent } from "../tournament/liveTypes";
import { TeamMark } from "../components/MatchUI";
import { InviteCopy } from "../components/ShareControls";
import { useI18n } from "../i18n";
export function ResultsPage() {
  const { tx } = useI18n();
  const { matches, teams, liveData, champion, teamById, source } =
      useTournament(),
    result = tournamentResults(matches, teams, liveData, champion);
  return (
    <section className="subpage results-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tx("SEZON 01 / SONUÇLAR", "SEASON 01 / RESULTS")}</span>
          <h1>
            {tx("Sahnenin izleri", "Tournament results")}<span className="heading-dot">.</span>
          </h1>
          <p>
            {tx(
              "Turnuva sonuçları, takım performansı ve tamamlanan maçların oyuncu verileri.",
              "Tournament standings, team performance, and player stats from completed matches.",
            )}
          </p>
        </div>
        <Trophy size={38} strokeWidth={1} />
      </div>
      <InviteCopy path="/#sonuclar" label={tx("Sonuçları paylaş", "Share results")} />
      {source === "local" && (
        <p className="setup-note">
          {tx(
            "Kişisel prova sonuçları gösteriliyor. Gerçek turnuva sonuçları için ana sayfadan API takibine dön.",
            "Showing personal trial results. Switch back to live API on the home page for real tournament results.",
          )}
        </p>
      )}
      <div className="results-podium">
        <div>
          <span className="eyebrow">{tx("ŞAMPİYON", "CHAMPION")}</span>
          <h2>{champion ? teamById(champion)?.name : tx("Henüz belli değil", "Not decided yet")}</h2>
          <p>
            {champion
              ? tx("Turnuvanın kazananı", "Tournament winner")
              : tx("Final sonucu tamamlandığında burada görünecek.", "Will appear here once the grand final finishes.")}
          </p>
        </div>
        <div>
          <span className="eyebrow">{tx("FİNALİST", "RUNNER-UP")}</span>
          <h2>
            {result.runnerUp
              ? teamById(result.runnerUp)?.name
              : tx("Final bekleniyor", "Awaiting final")}
          </h2>
          <p>{result.completed.length} {tx("maç sonuçlandı.", "matches completed.")}</p>
        </div>
      </div>
      <h2>{tx("Takım özeti", "Team standings")}</h2>
      <p>
        {tx(
          "Şampiyon dışındaki sıralama galibiyete göredir; resmi bitiriş derecesi değildir.",
          "Teams outside the champion are sorted by match wins; this is not an official placement order.",
        )}
      </p>
      <div className="stats-scroll">
        <table>
          <thead>
            <tr>
              <th>{tx("TAKIM", "TEAM")}</th>
              <th>{tx("MAÇ", "PLAYED")}</th>
              <th>{tx("GALİBİYET", "WINS")}</th>
              <th>{tx("MAĞLUBİYET", "LOSSES")}</th>
            </tr>
          </thead>
          <tbody>
            {result.standings.map((s) => (
              <tr key={s.team.id}>
                <th>
                  <TeamMark team={s.team} />
                  {s.team.name}
                  {s.champion ? tx(" · Şampiyon", " · Champion") : ""}
                </th>
                <td>{s.played}</td>
                <td>{s.wins}</td>
                <td>{s.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section-heading results-heading">
        <div>
          <h2>{tx("Oyuncu performansı", "Player leaderboard")}</h2>
          <p>
            {tx("İstatistik kapsamı", "Stats coverage")}: {result.covered}/{result.eligible}{" "}
            {tx(
              "oynanmış maç. Hükmen kararlar ve özel 1v1 odaları dahil değildir.",
              "played matches. Forfeits and private 1v1 rooms are excluded.",
            )}
          </p>
        </div>
      </div>
      {result.players.length ? (
        <>
          <p>
            {tx("Verisi bulunan maçların lideri", "Leader across covered matches")}:{" "}
            <strong>{result.players[0].name}</strong>.{" "}
            {result.covered < result.eligible
              ? tx("Eksik veriler nedeniyle genel turnuva MVP’si ilan edilmez.", "No overall tournament MVP is declared due to incomplete coverage.")
              : result.players[0].rating !== null
                ? tx("Arena 1.0 göstergesine göre sıralanır; HLTV rating değildir.", "Ranked by Arena 1.0 indicator; not an HLTV rating.")
                : tx("Hasar/raund verisi eksik; öldürme sayısına göre sıralanır, rating hesaplanmaz.", "Damage/round data missing; ranked by kills without rating.")}
          </p>
          <div
            className="stats-scroll"
            role="region"
            aria-label={tx("Turnuva oyuncu istatistikleri", "Tournament player statistics")}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {[
                    tx("OYUNCU", "PLAYER"),
                    tx("TAKIM", "TEAM"),
                    tx("MAÇ", "M"),
                    "K",
                    "D",
                    "A",
                    "HS%",
                    tx("HASAR", "DMG"),
                    "ADR",
                    "ARENA 1.0",
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.players.map((p) => (
                  <tr key={p.steamId + ":" + p.teamId}>
                    <th>{p.name}</th>
                    <td>{teamById(p.teamId)?.tag || p.teamId}</td>
                    <td>{p.matches}</td>
                    <td>{p.kills}</td>
                    <td>{p.deaths}</td>
                    <td>{p.assists}</td>
                    <td>{hsPercent(p).toFixed(1)}%</td>
                    <td>{p.completeDamage ? p.damage : "—"}</td>
                    <td>
                      {p.completeDamage && p.roundsPlayed
                        ? ((p.damage || 0) / p.roundsPlayed).toFixed(1)
                        : "—"}
                    </td>
                    <td>{p.rating?.toFixed(2) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty-state">
          {tx("Tamamlanan maçlardan henüz oyuncu istatistiği gelmedi.", "No player statistics from completed matches yet.")}
        </div>
      )}
    </section>
  );
}
