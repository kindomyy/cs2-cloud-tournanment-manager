import type { Lang } from "./serverMessages";
import type { Phase } from "../arena/operations";

export const phaseLabelsByLang: Record<Lang, Record<Phase, string>> = {
  tr: {
    preparing: "Oyuncular hazırlanıyor",
    veto: "Veto sürüyor",
    "veto-complete": "Haritalar hazır",
    loading: "Sunucu onayı bekleniyor",
    warmup: "Oyun içi hazırlık",
    live: "Canlı maç",
    paused: "Maç duraklatıldı",
    restoring: "Backup sonrası veri bekleniyor",
    completed: "Sonuçlandı",
    cancelled: "Maç iptal edildi",
    review: "Sonuç onayı bekleniyor",
  },
  en: {
    preparing: "Players getting ready",
    veto: "Veto in progress",
    "veto-complete": "Maps locked",
    loading: "Waiting for server",
    warmup: "In-game warmup",
    live: "Live match",
    paused: "Match paused",
    restoring: "Waiting for post-backup data",
    completed: "Completed",
    cancelled: "Match cancelled",
    review: "Awaiting result review",
  },
};

const roundEn: Record<string, string> = {
  "Üst kol · Çeyrek final": "Upper bracket · Quarterfinal",
  "Üst kol · Yarı final": "Upper bracket · Semifinal",
  "Üst kol · Final": "Upper bracket · Final",
  "Alt kol · 1. tur": "Lower bracket · Round 1",
  "Alt kol · 2. tur": "Lower bracket · Round 2",
  "Alt kol · Yarı final": "Lower bracket · Semifinal",
  "Alt kol · Final": "Lower bracket · Final",
  "Büyük final": "Grand final",
  "Büyük final · Tekrar serisi": "Grand final · Reset series",
};

export function translateRound(round: string, lang: Lang): string {
  if (lang === "tr") return round;
  return roundEn[round] || round;
}

export function translateSource(source: string | undefined, lang: Lang): string {
  if (!source || lang === "tr") return source || "";
  const seed = /^(\d+)\. seri başı$/.exec(source);
  if (seed) return `Seed #${seed[1]}`;
  const outcome = /^([A-Z0-9]+) (kazananı|kaybedeni)$/.exec(source);
  if (outcome)
    return `${outcome[2] === "kazananı" ? "Winner" : "Loser"} of ${outcome[1]}`;
  return source;
}

export const auditActionsByLang: Record<Lang, Record<string, string>> = {
  tr: {
    "config-save": "Ayarlar kaydedildi",
    result: "Maç sonucu düzenlendi",
    "follow-api": "Manuel sonuç kaldırıldı",
    "tournament-reset": "Turnuva sıfırlandı",
    "veto-move": "Veto hamlesi",
    "veto-reset": "Veto sıfırlandı",
    "veto-start": "Veto başladı",
    "veto-forced": "Admin vetoyu başlattı",
    "veto-rehearsal": "Veto provası açıldı",
    "server-released": "Sunucunun boş olduğu onaylandı",
    "backup-loaded": "Raund backup’ı yüklendi",
    "series-end": "Sunucu maçı bitirdi",
    "duel-create": "1v1 odası açıldı",
    "duel-close": "1v1 odası kapatıldı",
    "duel-force-veto": "1v1 vetosu admin tarafından başlatıldı",
    "duel-move": "1v1 veto hamlesi",
    "duel-ready": "1v1 oyuncu hazırlığı",
    "team-profile": "Takım düzenlendi",
    forfeit: "Hükmen sonuç",
    "match-replay": "Tekrar maçı açıldı",
    "match-resync": "Backup eşitlemesi",
    "backup-restored": "Yedek geri yüklendi",
    "server-load": "Sunucuya yükleme",
    "server-pause": "Duraklatma",
    "server-unpause": "Devam",
    "server-end": "Maçı bitirme",
    "server-restore": "Sunucu backup yükleme",
    "server-error": "Sunucu işlemi hatası",
    "lineup-refreshed": "Maç kadrosu yenilendi",
    "steam-display-name": "Site adı düzenlendi",
  },
  en: {
    "config-save": "Settings saved",
    result: "Match score edited",
    "follow-api": "Manual override removed",
    "tournament-reset": "Tournament reset",
    "veto-move": "Veto move",
    "veto-reset": "Veto reset",
    "veto-start": "Veto started",
    "veto-forced": "Admin started veto",
    "veto-rehearsal": "Rehearsal veto opened",
    "server-released": "Server confirmed idle",
    "backup-loaded": "Round backup loaded",
    "series-end": "Server ended match",
    "duel-create": "1v1 room created",
    "duel-close": "1v1 room closed",
    "duel-force-veto": "1v1 veto force-started",
    "duel-move": "1v1 veto move",
    "duel-ready": "1v1 player readiness",
    "team-profile": "Team profile updated",
    forfeit: "Forfeit result",
    "match-replay": "Match replay opened",
    "match-resync": "Backup resync",
    "backup-restored": "Backup restored",
    "server-load": "Loaded on server",
    "server-pause": "Paused",
    "server-unpause": "Unpaused",
    "server-end": "Ended server match",
    "server-restore": "Server backup restore",
    "server-error": "Server action error",
    "lineup-refreshed": "Match lineup refreshed",
    "steam-display-name": "Site display name updated",
  },
};
