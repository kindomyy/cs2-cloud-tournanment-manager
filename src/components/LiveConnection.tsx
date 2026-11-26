import { RefreshCw, Radio } from "lucide-react";
import { useArena } from "../arena/ArenaContext";
import { useTournament } from "../tournament/TournamentContext";
import { useI18n } from "../i18n";

export function LiveConnection() {
  const { tx, formatTime } = useI18n();
  const arena = useArena();
  const isAdmin = arena.snapshot.me?.role === "admin" || arena.previewAdmin;
  const { source, mode, setMode, connection, liveData } = useTournament();
  const latest = Object.values(liveData)
    .map((m) => m.updatedAt)
    .sort()
    .at(-1);
  const stale = source === "api" && (
    connection.status === "error" ||
    (latest && Date.now() - Date.parse(latest) > 60000)
  );
  const title = mode === "local"
    ? tx("Kişisel deneme", "Personal trial")
    : connection.status === "error"
      ? latest ? tx("Son alınan maç verisi", "Last received match data") : tx("Veriler güncellenemiyor", "Unable to refresh data")
      : latest ? tx("Maç verileri", "Match data") : tx("İlk maç verisi bekleniyor", "Waiting for first match data");
  const description = connection.conflicts.length
    ? isAdmin
      ? tx(`Eşleşmesi kontrol edilmeli: ${connection.conflicts.join(", ")}`, `Matchup needs review: ${connection.conflicts.join(", ")}`)
      : tx("Bazı maç verileri yönetim tarafından kontrol ediliyor.", "Some match data is being reviewed by admins.")
    : mode === "local"
      ? tx("Bu tarayıcıdaki sonuçlar gösteriliyor.", "Showing results stored in this browser.")
      : latest
        ? `${connection.status === "error" ? tx("Bağlantı kesildi. ", "Connection lost. ") : ""}${tx("Son güncelleme", "Last update")}: ${formatTime(latest)}`
        : connection.status === "error"
          ? tx("Maç verileri alınamadı. Yeniden deneyebilirsin.", "Could not load match data. You can retry.")
          : connection.status === "loading"
            ? tx("Maç verileri alınıyor.", "Loading match data.")
            : isAdmin
              ? tx("Site API’sine erişiliyor; MatchZy bağlantısı henüz maç olayıyla doğrulanmadı.", "Site API is reachable; MatchZy connection has not been verified by a match event yet.")
              : tx("Henüz sunucudan maç verisi alınmadı. Maç programını ve açıklanan sonuçları takip edebilirsin.", "No live match data received from the server yet. You can follow the schedule and published results.");
  return (
    <div className={`live-connection ${stale ? "stale" : ""}`}>
      <Radio size={15} />
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <button
        className="connection-refresh"
        onClick={connection.refresh}
        aria-label={tx("Maç verilerini yenile", "Refresh match data")}
      >
        <RefreshCw size={14} />
      </button>
      {isAdmin && (
        <button
          className="connection-switch"
          onClick={() => {
            if (mode === "server") location.hash = "dene";
            else setMode("server");
          }}
        >
          {mode === "local" ? tx("API ile takip et", "Switch to live API") : tx("Kişisel denemeye geç", "Switch to personal trial")}
        </button>
      )}
    </div>
  );
}
