import { ArrowLeftRight } from "lucide-react";
import type { ManagedTeam } from "../arena/model";
import { openingMatches, assignOpeningTeam } from "../tournament/opening";
import { useI18n } from "../i18n";

export function OpeningMatchesEditor({
  teams,
  onChange,
  disabled,
  hasActivity,
  changed,
}: {
  teams: ManagedTeam[];
  onChange: (teams: ManagedTeam[]) => void;
  disabled: boolean;
  hasActivity: boolean;
  changed: boolean;
}) {
  const { lang, tx } = useI18n();
  return (
    <section className="opening-editor" aria-labelledby="opening-title">
      <div className="opening-heading">
        <div>
          <span className="eyebrow">
            {tx("ÜST KOL / ÇEYREK FİNAL", "UPPER BRACKET / QUARTERFINALS")}
          </span>
          <h2 id="opening-title">
            {tx("İlk tur eşleşmeleri", "Opening round matchups")}
          </h2>
        </div>
        <ArrowLeftRight size={19} />
      </div>
      <p>
        {tx(
          "İlk maçta kimin kimle oynayacağını buradan seç. Seçtiğin takım başka bir maçtaysa iki takım yer değiştirir.",
          "Pick who plays whom in the opening round. If the selected team is in another match, the two teams swap places.",
        )}
      </p>
      <div className="opening-grid">
        {openingMatches.map((match, index) => (
          <fieldset
            key={match.id}
            className="opening-match"
            disabled={disabled || !teams.length}
          >
            <legend>
              <strong>{match.id}</strong>
              <span>{tx(`${index + 1}. maç · BO1`, `Match ${index + 1} · BO1`)}</span>
            </legend>
            {match.seeds.map((seed, side) => {
              const team = teams.find((t) => t.seed === seed);
              return (
                <label key={seed}>
                  {side === 0
                    ? tx("Birinci takım", "First team")
                    : tx("İkinci takım", "Second team")}
                  <select
                    aria-label={tx(
                      `${match.id} ${side === 0 ? "birinci" : "ikinci"} takım`,
                      `${match.id} ${side === 0 ? "first" : "second"} team`,
                    )}
                    value={team?.id || ""}
                    onChange={(e) =>
                      onChange(assignOpeningTeam(teams, e.target.value, seed))
                    }
                  >
                    {!team && (
                      <option value="" disabled>
                        {tx("Takım seç", "Select team")}
                      </option>
                    )}
                    {[...teams]
                      .sort((a, b) => a.name.localeCompare(b.name, lang))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      {hasActivity && changed ? (
        <p className="opening-warning" role="status">
          {tx(
            "Hazırlığı veya sonucu olan maçlar var. Kaydederken tüm turnuvanın sonuçlarını, hazır durumlarını ve vetolarını sıfırlama onayı istenecek. Takımlar, oyuncular ve takvim korunur.",
            "Some matches already have setup or results. Saving will ask for confirmation to reset all tournament results, ready states, and vetoes. Teams, players, and schedule are preserved.",
          )}
        </p>
      ) : (
        <p className="opening-help">
          {lang === "en" ? (
            <>
              Selections are applied with the <strong>Save changes</strong>{" "}
              button above. Later rounds are generated automatically from
              winners and losers.
            </>
          ) : (
            <>
              Seçimler üstteki <strong>Değişiklikleri kaydet</strong> düğmesiyle
              uygulanır. Sonraki turlar kazanan ve kaybedenlere göre otomatik
              oluşur.
            </>
          )}
        </p>
      )}
    </section>
  );
}
