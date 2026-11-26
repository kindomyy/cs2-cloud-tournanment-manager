import { useEffect, useRef } from "react";
import { Users, X, MapPin } from "lucide-react";
import { type Match, type Team } from "../data";
import { useTournament } from "../tournament/TournamentContext";
import { TeamMark, Status } from "./MatchUI";
import { MapResults, PlayerStatsTable } from "./MatchDetails";
import { useArena } from "../arena/ArenaContext";
import { accessFor } from "../arena/permissions";
import { currentMap, mapImage } from "../arena/maps";
import { MatchStage } from "./MatchStage";
import { ScheduleDetails } from "./ScheduleDetails";
import { InviteCopy, ServerJoin } from "./ShareControls";
import { useI18n } from "../i18n";

function TeamRoster({ team }: { team: Team }) {
  const { tx } = useI18n();
  return (
    <div className="roster">
      <div className="roster-heading">
        <TeamMark team={team} />
        <h3>{team.name}</h3>
        <span>{team.players.length}/5 {tx("OYUNCU", "PLAYERS")}</span>
      </div>
      {!team.players.length && <p className="dialog-note">{tx("Kadro oluşturulmadı. Kaptan atanmadı.", "No roster created yet. No captain assigned.")}</p>}
      {team.players.map((p, i) => (
        <div className="roster-player" key={team.roster?.[i]?.id || String(i)}>
          <span className="player-number">0{i + 1}</span>
          <span>{p}</span>
          {(team.roster ? team.roster[i]?.id === team.captainId : i === 0) && (
            <span className="captain">{tx("KAPTAN", "CAPTAIN")}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function DetailDialog({
  match,
  team,
  onClose,
}: {
  match: Match | null;
  team: Team | null;
  onClose: () => void;
}) {
  const { tx, roundLabel, sourceLabel } = useI18n();
  const { matches, source, teamById, liveData, matchTeams } = useTournament();
  const arena = useArena();
  const access = accessFor(arena.snapshot.config, arena.snapshot.me);
  const hasStats = !!(match && liveData[match.id]?.players.length);
  const open = !!(match || team);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      document.body.classList.add("modal-open");
    } else {
      if (dialog.open) dialog.close();
      document.body.classList.remove("modal-open");
    }
    return () => document.body.classList.remove("modal-open");
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`detail-dialog ${match ? "match-detail-dialog" : ""} ${match && mapImage(currentMap(match)) ? "has-detail-map" : ""}`}
      style={
        match && mapImage(currentMap(match))
          ? ({
              "--map-image": `url("${mapImage(currentMap(match))}")`,
            } as React.CSSProperties)
          : undefined
      }
      aria-labelledby="dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const box = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-top">
        <span className="eyebrow">
          {match ? `${match.id} / ${tx("MAÇ MERKEZİ", "MATCH CENTER")}` : tx("TAKIM PROFİLİ", "TEAM PROFILE")}
        </span>
        <button
          autoFocus
          className="icon-button"
          onClick={onClose}
          aria-label={tx("Kapat", "Close")}
        >
          <X size={21} />
        </button>
      </div>
      {match ? (
        <>
          <div className="dialog-match-heading">
            <Status status={match.status} />
            <h2 id="dialog-title">{roundLabel(match.round)}</h2>
            <span>
              {match.format}
            </span>
          </div>
          <div className="dialog-scoreboard">
            <div>
              <TeamMark team={teamById(match.a)} large />
              <h3>{teamById(match.a)?.name || sourceLabel(match.sourceA)}</h3>
            </div>
            <div className="dialog-score">
              {match.score ? (
                <>
                  {match.score[0]} <i>:</i> {match.score[1]}
                </>
              ) : (
                <span className="pending-score">—</span>
              )}
            </div>
            <div>
              <TeamMark team={teamById(match.b)} large />
              <h3>{teamById(match.b)?.name || sourceLabel(match.sourceB)}</h3>
            </div>
          </div>
          <p className="dialog-score-label">
            {match.format === "BO1" ? tx("RAUNT SKORU", "ROUND SCORE") : tx("HARİTA SKORU", "MAP SCORE")}
          </p>
          <div className="dialog-map" hidden={match.format === "BO3"}>
            <MapPin size={16} />
            <span>
              {currentMap(match)
                ? `${currentMap(match)} · ${match.status === "completed" ? tx("Sonuçlandı", "Completed") : match.status === "live" ? tx("Oynanıyor", "Live") : tx("Veto tamamlandı", "Veto complete")}`
                : tx("Harita maç öncesinde belirlenecek", "Map will be decided before the match")}
            </span>
            <span>{match.format}</span>
          </div>
          {!!(match.maps?.length || match.selectedMaps?.length || match.score) && <MapResults match={match} />}
          <MatchStage match={match} />
          <ScheduleDetails matchId={match.id} />
          <ServerJoin />
          <InviteCopy path={`/#veto/${match.id}`} label={tx("Maç bağlantısını kopyala", "Copy match link")} />
          <div className="dialog-rosters">
            {[match.a, match.b].map((id, i) => {
              const t = matchTeams(match).find(t => t.id === id) || teamById(id);
              return t ? (
                hasStats ? <PlayerStatsTable team={t} match={match} key={t.id} /> : <TeamRoster team={t} key={t.id} />
              ) : (
                <div className="pending-roster" key={i}>
                  <Users size={25} />
                  <span>{tx("Kadro eşleşme sonrası belli olacak.", "Roster will be shown once matchup is decided.")}</span>
                </div>
              );
            })}
          </div>
          {(match.status === "upcoming" ||
            arena.snapshot.vetos.some((v) => v.matchId === match.id)) && (
            <a
              className="button-primary dialog-veto-link"
              href={`#veto/${match.id}`}
              onClick={onClose}
            >
              {access.role === "admin" || [match.a, match.b].includes(access.teamId || "") ? tx("Hazırlık ve veto ekranı", "Lobby & map veto") : tx("Vetoyu görüntüle", "View veto")}
            </a>
          )}
          <p className="dialog-note">
            {source === "api"
              ? hasStats ? tx("MatchZy · K/D/A ve HS% maç genelindeki toplamları gösterir.", "MatchZy · K/D/A and HS% show totals across this match.") : tx("Oyuncu istatistikleri maç verisi geldiğinde gösterilir.", "Player statistics appear once live match data arrives.")
              : tx("Kişisel deneme · Sunucu verisi yoksa istatistikler boş gösterilir.", "Personal trial · Stats stay empty without server data.")}
          </p>
        </>
      ) : (
        team && (
          <>
            <div className="team-profile-heading">
              <TeamMark team={team} large />
              <div>
                <span className="eyebrow">
                  {tx(`${team.seed}. SERİBAŞI`, `SEED #${team.seed}`)} / {team.tag}
                </span>
                <h2 id="dialog-title">{team.name}</h2>
              </div>
            </div>
            <TeamRoster team={team} />
            <div className="team-matches">
              <h3>{tx("Maç programı", "Match schedule")}</h3>
              {matches
                .filter((m) => m.a === team.id || m.b === team.id)
                .map((m) => (
                  <div key={m.id}>
                    <span>
                      {m.id} · {roundLabel(m.round)}
                    </span>
                    <Status status={m.status} />
                  </div>
                ))}
            </div>
            <p className="dialog-note">
              {tx(
                "Turnuvaya kayıtlı kadro gösterilir. Kadro değişikliklerini yönetim yapar; başlamış maçlar kendi kayıtlı kadrosuyla devam eder.",
                "Showing the registered tournament roster. Roster changes are managed by admins; started matches keep their frozen lineup.",
              )}
            </p>
          </>
        )
      )}
    </dialog>
  );
}
