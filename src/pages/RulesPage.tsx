import { useState } from "react";
import { Flag, Shield, ChevronDown } from "lucide-react";
import { mapNames } from "../tournament/engine";
import { useTournament } from "../tournament/TournamentContext";
import { useArena } from "../arena/ArenaContext";
import { useI18n } from "../i18n";

const rules = {
  tr: [
    {
      title: "Turnuva formatı",
      text: "Sekiz takım çift eleme sistemiyle mücadele eder.",
    },
    {
      title: "Maç ve seri düzeni",
      text: "Açılış turu BO1 (tek harita), sonraki turlar BO3 (iki harita kazanan seriyi kazanır) oynanır. Normal süre MR12, uzatmalar MR3 düzenindedir.",
    },
    {
      title: "Harita havuzu ve veto",
      text: `Harita havuzu: ${mapNames.join(", ")}. BO1: takımlar sırayla altı haritayı yasaklar; kalan harita oynanır. BO3: yasakla / yasakla / seç / seç / yasakla / yasakla / kalan harita. Oynama sırası birinci seçim, ikinci seçim ve karar haritasıdır. Veto hamlelerini sırası gelen kaptan yapar. Başlangıç tarafı bıçak raunduyla belirlenir.`,
    },
    {
      title: "Takımlar ve oyuncular",
      text: "Her takım 5 oyuncuyla mücadele eder. Oyuncular Steam ile giriş yaparak yönetimin kaydettiği kadroyla eşleşir ve kendi maçlarında hazır olur. İki tam kadro hazır olduğunda veto açılır. Sitedeki hazır işareti 30 dakika geçerlidir; oyun içinde ayrıca .ready yazılır. Kaptan kendi takımının profilini ve sırası gelen veto hamlesini yönetir. Kadro değişikliklerini admin yapar; başlamış maçın kadrosu korunur.",
    },
    {
      title: "Fair play ve teknik sorunlar",
      text: "Hile, hakaret ve kasıtlı oyun bozma kabul edilmez. Teknik sorun, geç kalma veya skor itirazında takım kaptanı turnuva organizatörüne başvurur. Duraklatma, hükmen sonuç ve tekrar oynatma işlemleri admin tarafından yönetilir. Otomatik gecikme cezası uygulanmaz; kararı organizatör verir.",
    },
  ],
  en: [
    {
      title: "Tournament format",
      text: "Eight teams compete in a double-elimination bracket.",
    },
    {
      title: "Match & series format",
      text: "The opening round is BO1 (single map), and all subsequent rounds are BO3 (first to two maps wins). Regulation uses MR12 with MR3 overtime.",
    },
    {
      title: "Map pool & veto",
      text: `Map pool: ${mapNames.join(", ")}. BO1: teams alternate banning six maps; the remaining map is played. BO3: ban / ban / pick / pick / ban / ban / decider. Play order is first pick, second pick, decider. The captain whose turn it is submits veto moves. Starting sides are decided by a knife round.`,
    },
    {
      title: "Teams & players",
      text: "Each team fields 5 players. Players sign in via Steam to match their registered roster and ready up for their match. Veto opens once both full rosters are ready. Site readiness lasts 30 minutes; players must also type .ready in-game. Captains manage their own team's profile and veto turns. Admins manage rosters; started matches keep their frozen lineup.",
    },
    {
      title: "Fair play & technical issues",
      text: "Cheating, abuse, and intentional griefing are prohibited. For technical issues, delays, or score disputes, the team captain contacts the tournament organizer. Pauses, forfeits, and replays are handled by admins. No automatic late penalties apply; the organizer decides.",
    },
  ],
};

export function RulesPage() {
  const { lang, tx } = useI18n();
  const { resetFinal } = useTournament();
  const { organizer } = useArena().snapshot.config;
  const [open, setOpen] = useState<number | null>(0);
  const localizedRules = rules[lang];
  return (
    <section className="subpage rules-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tx("İYİ OYUN. EŞİT ŞARTLAR.", "GOOD GAME. FAIR PLAY.")}</span>
          <h1>
            {tx("Oyunun kuralları", "Tournament rules")}<span className="heading-dot">.</span>
          </h1>
          <p>{tx("Rekabet sahada kalır. Saygı her zaman oyunda.", "Rivalry stays on the server. Respect stays in the game.")}</p>
        </div>
        <Shield className="rules-shield" size={50} strokeWidth={1} />
      </div>
      <div className="draft-notice">
        <Flag size={17} />
        <p>
          <strong>{tx("Turnuva düzeni.", "Tournament structure.")}</strong>{" "}
          {tx("Aşağıdaki format sitede uygulanan maç ve veto düzenidir. Eşleşmeler için", "The format below is enforced by this site's match and veto system. Use")}{" "}
          <a href="#maclar">{tx("Maçlar", "Matches")}</a>{" "}
          {tx(", giriş ve hazırlık için", "for matchups, and")}{" "}
          <a href="#oyuncu">{tx("Oyuncu merkezi", "Player hub")}</a>{" "}
          {tx("sayfasını kullan.", "for sign-in and readiness.")}
        </p>
      </div>
      <aside className="organizer-contact" aria-label={tx("Organizatöre ulaş", "Contact organizer")}>
        <h2>{tx("Organizatöre ulaş", "Contact organizer")}</h2>
        <p>{organizer?.name || tx("Turnuva organizatörü", "Tournament organizer")}</p>
        {organizer?.contact ? (
          <p>{organizer.contact}</p>
        ) : (
          <p>
            {tx(
              "İletişim bilgisi henüz duyurulmadı. Kaptanlar maç günü iletişim bilgisini organizasyondan almalı.",
              "Contact info has not been announced yet. Captains should obtain match-day contact info from the organizers.",
            )}
          </p>
        )}
        <p>
          {tx(
            "Teknik sorun, gecikme veya sonuç itirazını takım kaptanı bu iletişim üzerinden iletir.",
            "Team captains report technical issues, delays, or score disputes through this contact.",
          )}
        </p>
      </aside>
      <div className="rules-list">
        {localizedRules.map((r, i) => (
          <div
            className={`rule-item ${open === i ? "open" : ""}`}
            key={i}
          >
            <button
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              aria-controls={`rule-${i}`}
            >
              <span className="rule-number">0{i + 1}</span>
              <h2>{r.title}</h2>
              <ChevronDown size={19} />
            </button>
            <div id={`rule-${i}`} hidden={open !== i}>
              <p>
                {i === 0
                  ? lang === "en"
                    ? `The tournament uses an 8-team double-elimination bracket. Upper bracket losers drop to the lower bracket; lower bracket losers are eliminated. ${resetFinal ? "If the lower bracket winner takes the first grand final, a bracket-reset second series is played so every team has two lives." : "The grand final is a single series; the upper bracket winner can be eliminated on their first loss in the final."}`
                    : `Turnuva 8 takımlı çift eleme sistemiyle çalışır. Üst kolda kaybeden alt kola geçer; alt kolda kaybeden elenir. ${resetFinal ? "Alt kol kazananı ilk finali kazanırsa ikinci final serisi açılır. İki yenilgi alan takım elenir." : "Final tek seridir. Üst kol kazananı finalde ilk yenilgisini alsa da elenir; bu bir final istisnasıdır."}`
                  : r.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
