import { useArena } from "../arena/ArenaContext";
import { matchPhase, type Phase } from "../arena/operations";
import type { Match } from "../data";
import { useI18n } from "../i18n";
export function MatchStage({
  match,
  phase: explicit,
}: {
  match: Match;
  phase?: Phase;
}) {
  const { tx, phaseLabel, formatTime } = useI18n();
  const arena = useArena(),
    runtime = arena.snapshot.runtimes?.[match.id],
    veto = arena.snapshot.vetos.find((v) => v.matchId === match.id);
  const phase: Phase =
    explicit ||
    matchPhase(match, runtime, veto);
  return (
    <div className={`match-stage stage-${phase}`} aria-label={tx("Maç aşaması", "Match stage")}>
      <span className="stage-indicator" />
      <strong>{phaseLabel(phase)}</strong>
      <span>
        {phase === "veto-complete"
          ? tx("Sunucuya yükleme bekleniyor", "Waiting to load on server")
          : phase === "loading"
            ? tx("Komut iletildi; dosyanın alındığı henüz doğrulanmadı", "Command sent; config receipt not confirmed yet")
            : phase === "warmup"
              ? tx("Oyuncular sunucuda .ready vermeli", "Players must type .ready on the server")
              : phase === "restoring"
                ? tx("Eski skor yerine geri yüklenen raundun verisi beklenecek", "Waiting for restored round data instead of old score")
                : phase === "review"
                  ? tx("Eksik sonucu yönetici kontrol etmeli", "Incomplete result requires admin review")
                  : runtime?.lastEventAt
                    ? `${tx("Son sunucu olayı", "Last server event")}: ${formatTime(runtime.lastEventAt)}`
                    : ""}
      </span>
    </div>
  );
}
