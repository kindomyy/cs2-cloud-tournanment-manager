import { useArena } from "../arena/ArenaContext";
import { matchPhase, type Phase } from "../arena/operations";
import type { Match } from "../data";
import { useI18n } from "../i18n";

export function MatchChecklist({ match, dirty }: { match: Match; dirty: boolean }) {
  const { snapshot } = useArena();
  const { tx, phaseLabel } = useI18n();
  const runtime = snapshot.runtimes?.[match.id];
  const veto = snapshot.vetos.find((v) => v.matchId === match.id);
  const teams = [match.a, match.b].map((id) =>
    (runtime?.teams || snapshot.config.teams).find((t) => t.id === id),
  );
  const phase = matchPhase(match, runtime, veto);
  const issues: string[] = [];
  if (dirty)
    issues.push(
      tx(
        "Kaydedilmemiş değişiklikler var; canlı işlemler son kaydedilen veriyi kullanır.",
        "There are unsaved changes; live operations use the last saved data.",
      ),
    );
  if (phase === "preparing") {
    if (teams.some((t) => !t))
      issues.push(
        tx(
          "Önceki maçların sonuçlarıyla iki takımın da belli olması bekleniyor.",
          "Waiting for both teams to be determined by previous match results.",
        ),
      );
    for (const team of teams) {
      if (!team) continue;
      const verified = team.roster.filter((p) => p.steamId && snapshot.verified.some((v) => v.steam_id === p.steamId)).length;
      const ready = team.roster.filter((p) => snapshot.readies.some((r) => r.match_id === match.id && r.player_id === p.id)).length;
      if (team.roster.length !== 5)
        issues.push(
          tx(
            `${team.name}: kadro ${team.roster.length}/5.`,
            `${team.name}: roster ${team.roster.length}/5.`,
          ),
        );
      const missingIds = team.roster.filter((p) => !p.steamId).length;
      if (missingIds)
        issues.push(
          tx(
            `${team.name}: ${missingIds} SteamID eksik.`,
            `${team.name}: ${missingIds} SteamID missing.`,
          ),
        );
      if (verified < 5)
        issues.push(
          tx(
            `${team.name}: Steam doğrulaması ${verified}/5.`,
            `${team.name}: Steam verification ${verified}/5.`,
          ),
        );
      if (ready < 5)
        issues.push(
          tx(
            `${team.name}: hazır oyuncu ${ready}/5.`,
            `${team.name}: ready players ${ready}/5.`,
          ),
        );
    }
  }
  if (veto?.rehearsal)
    issues.push(
      tx(
        "Bu bir prova vetosu; sunucuya gerçek maç olarak yüklenemez.",
        "This is a rehearsal veto; it cannot be loaded onto the server as a real match.",
      ),
    );
  const next: Record<Phase, string> = {
    preparing: tx(
      "Otomatik veto için iki takım da beşer doğrulanmış oyuncuyla hazır olmalı. İki takımda eşit sayıda 1–5 SteamID64 kayıtlı oyuncu varsa yönetici gerçek vetoyu zorla başlatabilir.",
      "Both teams must be ready with 5 verified players each for auto-veto. If both teams have an equal number of 1–5 players with SteamID64, an admin can force-start the real veto.",
    ),
    veto: tx(
      "Tam sayfa vetoyu aç. Sırası gelen kaptanın hamlesini bekle veya admin müdahalesini uygula.",
      "Open full-screen veto. Wait for the active captain’s move or apply an admin override.",
    ),
    "veto-complete": tx(
      "Sistem & Yedek bölümünde DatHost erişimini test et; ardından maçı sunucuya yükle.",
      "Test DatHost access under System & Backup, then load the match onto the server.",
    ),
    loading: tx(
      "MatchZy’nin dosyayı aldığını doğrulayan olayı bekle. Aynı maçı tekrar yükleme.",
      "Wait for the event confirming MatchZy loaded the config. Do not reload the same match.",
    ),
    warmup: tx(
      "Oyuncular sunucuya bağlanıp oyun içinde .ready yazmalı.",
      "Players must connect to the server and type .ready in-game.",
    ),
    live: tx(
      "Canlı skoru ve sunucu olaylarını takip et; gerektiğinde duraklatmayı kullan.",
      "Monitor the live score and server events; use pause if needed.",
    ),
    paused: tx(
      "Sorun çözüldüğünde sunucu kontrolünden devam et.",
      "Resume from server controls once the issue is resolved.",
    ),
    restoring: tx(
      "Geri yüklenen raundun yeni verisini bekle; gerekirse kurtarma bölümünden eşitle.",
      "Wait for new data from the restored round; resync from recovery controls if needed.",
    ),
    completed: tx(
      "Sonucu ve istatistikleri kontrol et; bir sonraki maçı seç.",
      "Review the result and stats, then select the next match.",
    ),
    cancelled: tx(
      "Gerekirse kurtarma bölümünden yeni kimlikle tekrar maçı aç.",
      "If needed, start a replay with a new ID from recovery controls.",
    ),
    review: tx(
      "Eksik sonucu sunucu kaydıyla karşılaştır; doğru sonucu kaydet veya yeni deneme aç.",
      "Compare the incomplete result with server logs; record the correct result or start a replay.",
    ),
  };
  return (
    <section className="match-checklist" aria-label={tx("Seçili maçın hazırlık özeti", "Selected match readiness summary")}>
      <div>
        <span className="eyebrow">{tx("SEÇİLİ MAÇ", "SELECTED MATCH")} / {match.id}</span>
        <h2>{teams[0]?.name || tx("Takım bekleniyor", "TBD")} · {teams[1]?.name || tx("Takım bekleniyor", "TBD")}</h2>
      </div>
      <dl>
        <div><dt>{tx("Şu anki aşama", "Current phase")}</dt><dd>{phaseLabel(phase)}</dd></div>
        <div><dt>{phase === "preparing" ? tx("Otomatik veto durumu", "Auto-veto status") : tx("Eksik / beklenen", "Missing / pending")}</dt><dd>{issues.length ? <ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : tx("Bu aşama için listelenen bir eksik yok.", "No missing items listed for this phase.")}</dd></div>
        <div><dt>{tx("Sıradaki işlem", "Next step")}</dt><dd>{dirty ? tx("Önce değişiklikleri kaydet; ardından maç işlemlerine geç.", "Save changes first, then proceed with match actions.") : veto?.rehearsal ? tx("Provayı tamamla veya sıfırla; gerçek maç için hazır/veto akışını kullan.", "Complete or reset the rehearsal; use the ready/veto flow for a real match.") : next[phase]}</dd></div>
      </dl>
    </section>
  );
}
