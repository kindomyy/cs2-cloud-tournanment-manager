import { useEffect, useRef, useState } from "react";
import {
  Download,
  Upload,
  RotateCcw,
  Check,
  Trophy,
  ArrowRight,
  FlaskConical,
} from "lucide-react";
import { type Match, type MapScore } from "../data";
import { MapEditor } from "../components/MapEditor";
import { useTournament } from "../tournament/TournamentContext";
import {
  changeFinalRule,
  demoState,
  emptyState,
  mapNames,
  parseState,
  updateResult,
  type Transition,
} from "../tournament/engine";
import { Status, TeamMark } from "../components/MatchUI";
import { downloadBlob } from "../arena/download";
import { useI18n } from "../i18n";

export function ScoreEditor({
  match,
  onChange,
  stateOverride,
}: {
  match: Match;
  onChange: (transition: Transition) => void;
  stateOverride?: import("../tournament/engine").TournamentState;
}) {
  const { tx, roundLabel, sourceLabel, errText } = useI18n();
  const { state: personalState, teamById, teams } = useTournament();
  const state = stateOverride || personalState;
  const [status, setStatus] = useState<Match["status"]>(
    match.status === "upcoming" ? "live" : match.status,
  );
  const [a, setA] = useState(String(match.score?.[0] ?? 0));
  const [b, setB] = useState(String(match.score?.[1] ?? 0));
  const [map, setMap] = useState(match.map || "");
  const [mapMode, setMapMode] = useState(
    match.format === "BO3" && !!match.maps?.length,
  );
  const [maps, setMaps] = useState<MapScore[]>(
    match.maps || [{ name: "Mirage", score: [0, 0], status: "live" }],
  );
  const wins: [number, number] = [0, 0];
  for (const entry of maps)
    if (entry.status === "completed")
      wins[entry.score[0] > entry.score[1] ? 0 : 1]++;
  const [error, setError] = useState("");
  const ready = !!(match.a && match.b);
  return (
    <form
      className="score-editor"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        try {
          if (status !== "upcoming" && !mapMode && (!a.trim() || !b.trim()))
            throw new Error(tx("Her iki takımın skorunu gir.", "Enter scores for both teams."));
          onChange(
            updateResult(
              state,
              match.id,
              status === "upcoming"
                ? undefined
                : {
                    status,
                    score: mapMode ? wins : [Number(a), Number(b)],
                    ...(match.format === "BO1" && map ? { map } : {}),
                    ...(mapMode
                      ? { maps }
                      : match.format === "BO1" && map
                        ? {
                            maps: [
                              {
                                name: map,
                                status,
                                score: [Number(a), Number(b)],
                              },
                            ],
                          }
                        : {}),
                  },
              teams,
            ),
          );
        } catch (err) {
          setError(errText((err as Error).message));
        }
      }}
    >
      <div className="editor-heading">
        <div>
          <span className="eyebrow">
            {match.id} / {match.format}
          </span>
          <h2>{roundLabel(match.round)}</h2>
        </div>
        <Status status={match.status} />
      </div>
      {!ready && (
        <p className="editor-info">
          {tx(
            "İki takım da belli olduğunda skor girebilirsin. Önceki maçların sonuçlarını tamamla.",
            "You can enter a score once both teams are decided. Complete earlier matches first.",
          )}
        </p>
      )}
      <fieldset disabled={!ready}>
        <legend className="sr-only">{tx("Maç sonucu", "Match result")}</legend>
        <label className="field-label">
          {tx("Maç durumu", "Match status")}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Match["status"])}
          >
            <option value="live">{tx("Canlı", "Live")}</option>
            <option value="completed">{tx("Tamamlandı", "Completed")}</option>
            <option value="upcoming">{tx("Sonucu temizle", "Clear result")}</option>
          </select>
        </label>
        {status !== "upcoming" && (
          <>
            <div className="editor-score-row">
              <label>
                <span>
                  <TeamMark team={teamById(match.a)} />
                  {teamById(match.a)?.name || sourceLabel(match.sourceA)}
                </span>
                <input
                  type="number"
                  min="0"
                  max={match.format === "BO3" ? 2 : 100}
                  step="1"
                  required
                  aria-label={tx("Birinci takım skoru", "Team 1 score")}
                  value={mapMode ? wins[0] : a}
                  readOnly={mapMode}
                  onChange={(e) => setA(e.target.value)}
                />
              </label>
              <span className="score-divider">:</span>
              <label>
                <span>
                  <TeamMark team={teamById(match.b)} />
                  {teamById(match.b)?.name || sourceLabel(match.sourceB)}
                </span>
                <input
                  type="number"
                  min="0"
                  max={match.format === "BO3" ? 2 : 100}
                  step="1"
                  required
                  aria-label={tx("İkinci takım skoru", "Team 2 score")}
                  value={mapMode ? wins[1] : b}
                  readOnly={mapMode}
                  onChange={(e) => setB(e.target.value)}
                />
              </label>
            </div>
            <p className="editor-help">
              {match.format === "BO1"
                ? tx("Raunt skoru · MR12, uzatmalarda MR3. Örnek bitiş: 13–8 veya 16–14.", "Round score · MR12 with MR3 overtime. Example: 13–8 or 16–14.")
                : tx("Harita skoru · Seri 2–0 veya 2–1 biter. Raunt skoru girme.", "Map score · Series ends 2–0 or 2–1. Do not enter round scores.")}
            </p>
            {match.format === "BO3" && (
              <>
                <label className="map-mode-toggle">
                  <input
                    type="checkbox"
                    checked={mapMode}
                    onChange={(e) => setMapMode(e.target.checked)}
                  />{" "}
                  {tx("Harita detaylarını gir", "Enter per-map details")}
                </label>
                {mapMode && <MapEditor maps={maps} onChange={setMaps} />}
              </>
            )}
            {match.format === "BO1" && (
              <label className="field-label">
                {tx("Oynanan harita", "Map played")}
                <select value={map} onChange={(e) => setMap(e.target.value)}>
                  <option value="">{tx("Belirlenmedi", "Unspecified")}</option>
                  {mapNames.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button-primary editor-submit" type="submit">
          {status === "upcoming" ? tx("Sonucu temizle", "Clear result") : tx("Skoru kaydet", "Save score")}{" "}
          <Check size={15} />
        </button>
      </fieldset>
    </form>
  );
}

export function TestPage() {
  const { tx, roundLabel, sourceLabel, errText } = useI18n();
  const {
    matches,
    champion,
    state,
    commit,
    warning,
    setMode,
    mode,
    teamById,
    teams,
  } = useTournament();
  useEffect(() => {
    setMode("local");
  }, [setMode]);
  const [selected, setSelected] = useState("U2");
  const [pending, setPending] = useState<{
    transition: Transition;
    message: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const match = matches.find((m) => m.id === selected) || matches[0];
  function apply(transition: Transition) {
    commit(transition.state);
    setPending(null);
    setError("");
    setNotice(tx("Değişiklik uygulandı. Turnuva ağacı güncellendi.", "Change applied. Bracket updated."));
  }
  function request(transition: Transition) {
    setNotice("");
    if (transition.invalidated.length)
      setPending({
        transition,
        message: tx(
          `Takımları değişen şu maçların kayıtlı sonuçları temizlenecek: ${transition.invalidated.join(", ")}. İlgisiz maçların sonuçları korunur.`,
          `Saved results for matches with changed teams will be cleared: ${transition.invalidated.join(", ")}. Unrelated matches are preserved.`,
        ),
      });
    else apply(transition);
  }
  function download() {
    downloadBlob(JSON.stringify(state, null, 2), "kampus-arena-turnuva.json");
  }
  return (
    <section className="subpage test-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tx("İLK RAUNTTAN ŞAMPİYONLUĞA", "FROM ROUND ONE TO CHAMPION")}</span>
          <h1>
            {tx("Turnuvayı dene", "Try tournament")}<span className="heading-dot">.</span>
          </h1>
          <p>{tx("Sonuç gir. Ağacın ilerlemesini izle. Baştan tekrar dene.", "Enter results. Watch the bracket advance. Reset anytime.")}</p>
        </div>
        <FlaskConical className="test-flask" size={37} strokeWidth={1} />
      </div>
      <div className="test-notice">
        <FlaskConical size={18} />
        <p>
          <strong>{tx("Kişisel deneme alanı.", "Personal sandbox.")}</strong>{" "}
          {tx(
            "Değişiklikler yalnızca bu tarayıcıya kaydedilir; diğer cihazlara yansımaz. Bu ekran bir yönetici girişi değildir.",
            "Changes are saved only in this browser and do not affect other devices. This is not an admin login.",
          )}
        </p>
      </div>
      {warning && (
        <p role="alert" className="form-error">
          {warning}
        </p>
      )}
      {champion && (
        <div className="champion-banner">
          <Trophy size={28} />
          <div>
            <span className="eyebrow">{tx("TURNUVANIN ŞAMPİYONU", "TOURNAMENT CHAMPION")}</span>
            <h2>{teamById(champion)?.name}</h2>
          </div>
          <TeamMark team={teamById(champion)} large />
        </div>
      )}
      <div className="test-tools">
        <button onClick={download}>
          <Download size={14} /> {tx("JSON yedeği indir", "Download JSON backup")}
        </button>
        <button onClick={() => upload.current?.click()}>
          <Upload size={14} /> {tx("Yedekten yükle", "Load from backup")}
        </button>
        <button
          onClick={() => {
            setNotice("");
            setPending({
              transition: {
                state: emptyState(),
                invalidated: Object.keys(state.results),
              },
              message: tx(
                "Bütün skorlar temizlenecek. Takımlar ve eşleşmeler korunacak; sıfırdan bir turnuva denemesi açılacak.",
                "All scores will be cleared. Teams and matchups stay intact; a fresh trial bracket will open.",
              ),
            });
          }}
        >
          <RotateCcw size={14} /> {tx("Sıfırdan başlat", "Start from scratch")}
        </button>
        <button
          onClick={() => {
            setNotice("");
            setPending({
              transition: {
                state: demoState(),
                invalidated: Object.keys(state.results),
              },
              message: tx(
                "Mevcut denemenin yerine ilk örnek turnuva yüklenecek (U1 tamamlandı, U2 canlı).",
                "The default sample bracket will replace your current trial (U1 completed, U2 live).",
              ),
            });
          }}
        >
          {tx("Örneği geri yükle", "Restore sample")}
        </button>
        <input
          ref={upload}
          className="sr-only"
          type="file"
          accept=".json,application/json"
          aria-label={tx("Turnuva yedeği", "Tournament backup")}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError("");
            try {
              if (file.size > 100_000)
                throw new Error(tx("Yedek dosyası en fazla 100 KB olabilir.", "Backup file can be at most 100 KB."));
              const next = parseState(JSON.parse(await file.text()), teams);
              setPending({
                transition: { state: next, invalidated: [] },
                message: tx(
                  "Seçilen yedek mevcut denemenin yerine yüklenecek. Mevcut sonuçları korumak için önce JSON yedeğini indir.",
                  "The selected backup will replace your current trial. Download a JSON backup first to preserve existing results.",
                ),
              });
            } catch (err) {
              setError(`${tx("Yedek yüklenemedi", "Could not load backup")}: ${errText((err as Error).message)}`);
            }
          }}
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <div className="save-notice" role="status">
          <Check size={15} />
          {notice}
          <a href="#turnuva">
            {tx("Ağacı gör", "View bracket")} <ArrowRight size={13} />
          </a>
        </div>
      )}
      {pending && (
        <div className="change-confirm" role="alert">
          <h2>{tx("Değişikliği onayla", "Confirm change")}</h2>
          <p>{pending.message}</p>
          <div>
            <button
              className="button-primary"
              onClick={() => apply(pending.transition)}
            >
              {tx("Onayla ve uygula", "Confirm and apply")} <Check size={14} />
            </button>
            <button className="button-text" onClick={() => setPending(null)}>
              {tx("Vazgeç", "Cancel")}
            </button>
          </div>
        </div>
      )}
      <div
        className={`test-workspace ${pending ? "awaiting-confirm" : ""}`}
        inert={!!pending}
      >
        <div className="test-match-list">
          <h2>
            {tx("Maç seç", "Select match")}{" "}
            <span>
              {matches.filter((m) => m.status === "completed").length} /{" "}
              {matches.length}
            </span>
          </h2>
          {matches.map((m) => (
            <button
              key={m.id}
              className={match.id === m.id ? "selected" : ""}
              onClick={() => {
                setSelected(m.id);
                setNotice("");
              }}
              aria-pressed={match.id === m.id}
            >
              <div>
                <b>{m.id}</b>
                <Status status={m.status} />
              </div>
              <span>
                {teamById(m.a)?.name || sourceLabel(m.sourceA)} <i>—</i>{" "}
                {teamById(m.b)?.name || sourceLabel(m.sourceB)}
              </span>
              <small>{roundLabel(m.round)}</small>
            </button>
          ))}
        </div>
        <div className="test-editor-column">
          <ScoreEditor
            key={`${mode}:${match.id}:${JSON.stringify(state)}`}
            match={match}
            onChange={request}
          />
          <div className="final-setting">
            <h2>{tx("Final düzeni", "Grand final format")}</h2>
            <label>
              <input
                type="checkbox"
                checked={state.resetFinal}
                onChange={(e) =>
                  request(changeFinalRule(state, e.target.checked, teams))
                }
              />{" "}
              {tx("İkinci final serisi açık", "Enable bracket-reset second final")}
            </label>
            <p>
              {state.resetFinal
                ? tx(
                    "Alt koldan gelen takım ilk finali kazanırsa tekrar serisi açılır. Üst koldan gelen takımın şampiyonluk için tek seri kazanması yeterli. Böylece herkes iki yenilgide elenir.",
                    "If the lower bracket team wins the first grand final, a reset series opens. The upper bracket winner only needs one series win, ensuring true double elimination.",
                  )
                : tx(
                    "Final tek seridir. Üst koldan gelen takım finali kaybederse tek yenilgiyle elenir. Bu seçenek çift eleme kuralına final istisnası ekler.",
                    "Single grand final series. The upper bracket team is eliminated on a single loss in the final.",
                  )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
