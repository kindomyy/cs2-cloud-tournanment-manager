import { useArena } from "../arena/ArenaContext";
import { accessFor, canJoinServer } from "../arena/permissions";
import { useI18n } from "../i18n";
const scopes = {
  tr: {
    visitor: ["Ziyaretçi", "Maçları, sonuçları, takımları ve kuralları görebilirsin. Oyuncu işlemleri için kendi Steam hesabınla giriş yap."],
    player: ["Oyuncu", "Yalnızca kendi maçında hazır olabilir ve davet edildiğin özel 1v1 odalarına katılabilirsin. Kadro, veto ve sonuçları yönetemezsin."],
    captain: ["Takım kaptanı", "Oyuncu yetkilerine ek olarak kendi takımının adını, kısa adını ve logosunu düzenleyebilir; sıran geldiğinde veto hamlesi yapabilirsin. Kadro, eşleşme, skor ve sunucu yönetimi admine aittir."],
    admin: ["Site admini", "Takımlar, kadrolar, kaptan ataması, eşleşmeler, takvim, sonuçlar, veto müdahalesi ve sunucu yönetimi sende. Admin girişi oyuncular adına hazır işareti vermez."],
  },
  en: {
    visitor: ["Visitor", "You can view matches, results, teams, and rules. Sign in with your own Steam account for player actions."],
    player: ["Player", "You can only ready up for your own match and join private 1v1 rooms you were invited to. You cannot manage rosters, vetoes, or scores."],
    captain: ["Team captain", "In addition to player actions, you can edit your own team's name, tag, and logo, and make veto picks/bans on your turn. Rosters, matchups, scores, and server controls belong to admins."],
    admin: ["Site admin", "You manage teams, rosters, captain assignments, matchups, schedule, scores, veto overrides, and server controls. Admin sessions cannot ready up on behalf of players."],
  },
};
export function RoleScope() {
  const { lang, tx } = useI18n();
  const { snapshot } = useArena();
  const access = accessFor(snapshot.config, snapshot.me);
  const frozenParticipant = access.role === "visitor" && canJoinServer(snapshot.config, snapshot.me, snapshot.runtimes);
  const [title, text] = frozenParticipant
    ? [
        tx("Oyuncu · Kayıtlı maç", "Player · Frozen match"),
        tx(
          "Güncel kadrodan çıkarılmış olsan da devam eden maçının kayıtlı kadrosunda yerin korunur. Bu maçta oyuncu işlemlerini, kayıtlı kaptansan kendi sırandaki veto hamlesini yapabilirsin. Güncel takım profilini düzenleyemezsin.",
          "Although removed from the current roster, your spot in the active match's frozen lineup is preserved. You can still perform player actions (and veto turns if you were the frozen captain) for that match, but you cannot edit the current team profile.",
        ),
      ]
    : scopes[lang][access.role];
  return <aside className="role-scope" aria-label={tx("Hesap yetkileri", "Account permissions")}><span className="eyebrow">{tx("BU OTURUMDAKİ YETKİN", "YOUR ACCESS IN THIS SESSION")}</span><h2>{title}</h2><p>{text}</p>{snapshot.me?.role === "player" && !access.teamId && !frozenParticipant && <p>{tx("Turnuva kadrosunda değilsin. Kadroya eklenene kadar turnuva maçlarında hazır olamaz veya veto yapamazsın. Davet edildiğin özel 1v1 odaları açıktır.", "You are not on a tournament roster. Until an admin adds you to a roster, you cannot ready up or veto in tournament matches. Private 1v1 rooms you were invited to remain accessible.")}</p>}</aside>;
}
