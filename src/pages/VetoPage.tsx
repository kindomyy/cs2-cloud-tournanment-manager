import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Check,
  ShieldCheck,
  X,
  Crosshair,
  ArrowRight,
  Radio,
  Trophy,
} from "lucide-react";
import { useArena, verifiedForMatch } from "../arena/ArenaContext";
import { useTournament } from "../tournament/TournamentContext";
import { mapNames } from "../tournament/engine";
import { mapImage } from "../arena/maps";
import { sequence, vetoDone, vetoMaps, vetoTurn } from "../arena/veto";
import { TeamMark } from "../components/MatchUI";
import { InviteCopy, ServerJoin } from "../components/ShareControls";
import { LanguageToggle } from "../components/LanguageToggle";
import { steamLoginURL } from "../arena/schedule";
import { useI18n } from "../i18n";
export function VetoPage({ matchId }: { matchId: string }) {
  const { tx, roundLabel, sourceLabel, errText } = useI18n();
  const arena = useArena(),
    {
      byId,
      teamById: currentTeamById,
      matchTeams,
      setMode,
      focusMatch,
    } = useTournament(),
    [selection, setSelection] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setMode("server");
  }, [setMode]);
  const match = byId[matchId],
    v = arena.snapshot.vetos.find((v) => v.matchId === matchId),
    done = v && vetoDone(v),
    me = arena.snapshot.me;
  const admin = me?.role === "admin" || (!arena.online && arena.previewAdmin);
  const { setVetoPolling } = arena;
  const watchVeto = arena.online && !!match?.a && !!match.b && !done && !v?.rehearsal;
  useEffect(() => {
    if (!watchVeto) return;
    setVetoPolling(true);
    return () => setVetoPolling(false);
  }, [watchVeto, setVetoPolling]);
  const teamById = (id?: string) =>
    (match ? matchTeams(match).find((t) => t.id === id) : undefined) ||
    currentTeamById(id);
  const sawUndone = useRef(false);
  if (v && !done) sawUndone.current = true;
  const redirecting = !!done && sawUndone.current;
  useEffect(() => {
    if (!redirecting) return;
    focusMatch(matchId);
    const timer = setTimeout(() => {
      location.hash = "turnuva";
    }, 3500);
    return () => clearTimeout(timer);
  }, [redirecting, matchId, focusMatch]);
  const verifiedIds = verifiedForMatch(arena.snapshot, matchId);
  const turn = v && !done ? vetoTurn(v) : undefined,
    team = teamById(turn),
    captain = team?.roster?.find((p) => p.id === team.captainId);
  const canMove =
    !!v &&
    !done &&
    (admin || (!v.rehearsal && me?.role === "player" && !!captain?.steamId && captain.steamId === me.steamId));
  const ready = arena.snapshot.readies.filter(
    (r) => r.match_id === matchId,
  ).length;
  async function move() {
    if (!selection || !v || busy) return;
    setBusy(true);
    setError("");
    try {
      await arena.act({
        action: "move",
        matchId,
        map: selection,
        revision: v.revision,
      });
      setSelection(null);
    } catch (e) {
      setError(errText((e as Error).message));
      setSelection(null);
      await arena.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="veto-page">
      <header className="veto-header">
        <a href="#turnuva">
          <ArrowLeft size={16} /> {tx("TURNUVAYA DÖN", "BACK TO TOURNAMENT")}
        </a>
        <span>
          <Crosshair size={18} /> {arena.snapshot.config.title} <i>/</i> MAP
          VETO
        </span>
        <span className="veto-room">
          {matchId} <i /> {v?.rehearsal ? tx("PROVA", "REHEARSAL") : match?.format || tx("LOBİ", "LOBBY")}
        </span>
        <LanguageToggle />
      </header>
      {!match ? (
        <div className="empty-state">
          <h1>{tx("Maç bulunamadı.", "Match not found.")}</h1>
          <a href="#turnuva">{tx("Turnuvaya dön", "Back to tournament")}</a>
        </div>
      ) : (
        <div className="veto-content">
          <div className="duel-toolbar">
            <InviteCopy path={`/#veto/${matchId}`} label={tx("Maç bağlantısını kopyala", "Copy match link")} />
            <ServerJoin />
          </div>
          <div className="veto-match-heading">
            <div className="veto-team">
              <TeamMark team={teamById(match.a)} large />
              <div>
                <span>{tx("TAKIM A", "TEAM A")}</span>
                <h2>{teamById(match.a)?.name || sourceLabel(match.sourceA)}</h2>
              </div>
            </div>
            <div className="veto-match-id">
              <span>{roundLabel(match.round)}</span>
              <strong>{match.format}</strong>
            </div>
            <div className="veto-team away">
              <div>
                <span>{tx("TAKIM B", "TEAM B")}</span>
                <h2>{teamById(match.b)?.name || sourceLabel(match.sourceB)}</h2>
              </div>
              <TeamMark team={teamById(match.b)} large />
            </div>
          </div>
          {!v ? (
            <>
              <div className="veto-title">
                <span className="eyebrow">
                  {tx("HERKES HAZIR OLDUĞUNDA SAHNE AÇILIR", "VETO OPENS WHEN EVERYONE IS READY")}
                </span>
                <h1>{tx("Son kontrol. İlk seçim.", "Final check. First pick.")}</h1>
                <p>
                  {tx(
                    "İki takımın beşer oyuncusu Steam ile doğrulanıp hazır olduğunda veto otomatik başlar.",
                    "Veto starts automatically once all 5 Steam-verified players on both teams are ready.",
                  )}
                </p>
                <span className="ready-total">
                  {ready}
                  <i>/10</i> {tx("HAZIR", "READY")}
                </span>
              </div>
              <div className="lobby-teams">
                {[match.a, match.b].map((id, i) => {
                  const t = teamById(id);
                  return (
                    <div className="lobby-team" key={id || i}>
                      <h2>{t?.name || tx("Takım bekleniyor", "Waiting for team")}</h2>
                      {t?.roster?.map((p) => {
                        const confirmed = verifiedIds.includes(p.id),
                          r = arena.snapshot.readies.some(
                            (r) =>
                              r.match_id === matchId && r.player_id === p.id,
                          );
                        return (
                          <div className="lobby-player" key={p.id}>
                            <span
                              className={r ? "lobby-dot ready" : "lobby-dot"}
                            />
                            <strong>{p.name}</strong>
                            {t.captainId === p.id && <small>{tx("KAPTAN", "CAPTAIN")}</small>}
                            <span>
                              {r
                                ? tx("Hazır", "Ready")
                                : confirmed
                                  ? tx("Doğrulandı", "Verified")
                                  : tx("Steam bekleniyor", "Awaiting Steam")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div className="lobby-actions">
                <a
                  className="button-primary"
                  href={
                    !me && arena.snapshot.steamConfigured
                      ? steamLoginURL(`/#veto/${matchId}`)
                      : "#oyuncu"
                  }
                >
                  {tx("Oyuncu merkezine git", "Go to player hub")} <ArrowRight size={16} />
                </a>
                {admin && arena.snapshot.config.rehearsal && (
                  <button
                    className="button-text"
                    onClick={() =>
                      void arena
                        .act({ action: "rehearse", matchId })
                        .catch((e) => setError(errText(e.message)))
                    }
                  >
                    {tx("Prova vetosunu başlat", "Start rehearsal veto")} <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="veto-title">
                <span className="eyebrow">
                  {v.rehearsal
                    ? tx("YEREL/ADMİN PROVASI · STEAM DOĞRULAMASI YAPILMAZ", "LOCAL/ADMIN REHEARSAL · NO STEAM VERIFICATION")
                    : v.forced
                      ? tx("HAZIR KONTROLÜ ADMİN TARAFINDAN GEÇİLDİ", "READY CHECK BYPASSED BY ADMIN")
                      : done
                        ? tx("HARİTALAR KİLİTLENDİ", "MAPS LOCKED")
                        : tx("KAPTANLAR SAHNEDE", "CAPTAINS ON STAGE")}
                </span>
                <h1>
                  {done
                    ? tx("Sahne artık sizin.", "The stage is yours.")
                    : `${team?.name} ${sequence(v)[v.actions.length] === "pick" ? tx("seçiyor.", "is picking.") : tx("eliyor.", "is banning.")}`}
                </h1>
                <p>
                  {done
                    ? redirecting
                      ? tx("Veto tamamlandı. Birazdan ana sayfadaki maç ekranına dönüyorsun.", "Veto complete. Returning to the match overview shortly.")
                      : tx("Veto tamamlandı. Harita sırasını ve hamle geçmişini aşağıda inceleyebilirsin.", "Veto complete. Review the map order and veto history below.")
                    : canMove
                      ? tx("Bir harita seç ve hamleni onayla. Onaylanan hamle geri alınamaz.", "Select a map and confirm your move. Confirmed moves cannot be undone.")
                      : tx("Sırası gelen kaptanın seçimi bekleniyor. Bu ekran herkes için güncellenir.", "Waiting for the active captain's move. This screen updates live for everyone.")}
                </p>
              </div>
              <div className="veto-progress">
                {(v.format === "BO1"
                  ? ["BAN", "BAN", "BAN", "BAN", "BAN", "BAN", tx("KALAN", "DECIDER")]
                  : ["BAN", "BAN", "PICK", "PICK", "BAN", "BAN", tx("KALAN", "DECIDER")]
                ).map((label, i) => (
                  <div
                    className={
                      i < v.actions.length
                        ? "step done"
                        : i === v.actions.length
                          ? "step current"
                          : "step"
                    }
                    key={i}
                  >
                    <span>
                      {i < v.actions.length ? (
                        <Check size={12} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <strong>{label}</strong>
                    <small>
                      {i < 6
                        ? teamById(i % 2 === 0 ? v.a : v.b)?.tag
                        : "DECIDER"}
                    </small>
                  </div>
                ))}
              </div>
              <div className="veto-map-grid">
                {mapNames.map((map) => {
                  const action = v.actions.find((a) => a.map === map),
                    selected = selection === map;
                  return (
                    <button
                      type="button"
                      key={map}
                      className={`veto-map ${action?.kind || ""} ${selected ? "selected" : ""}`}
                      disabled={!canMove || !!action || busy}
                      aria-pressed={selected}
                      aria-label={`${map}${action ? ` · ${action.kind === "ban" ? tx("elendi", "banned") : tx("seçildi", "picked")}` : ""}`}
                      onClick={() => setSelection(selected ? null : map)}
                    >
                      <img src={mapImage(map)} alt="" decoding="async" />
                      <div className="veto-map-shade" />
                      <span className="veto-map-tag">
                        {action
                          ? action.kind === "ban"
                            ? tx("ELENDİ", "BANNED")
                            : action.kind === "pick"
                              ? tx("SEÇİLDİ", "PICKED")
                              : tx("KARAR HARİTASI", "DECIDER")
                          : selected
                            ? tx("SEÇİMİN", "SELECTED")
                            : tx("HARİTA HAVUZU", "MAP POOL")}
                      </span>
                      <div className="veto-map-bottom">
                        <span>
                          {action?.kind === "ban" ? (
                            <X size={27} />
                          ) : action ? (
                            <Check size={25} />
                          ) : (
                            <Crosshair size={22} />
                          )}
                        </span>
                        <h2>{map.toUpperCase()}</h2>
                        <small>
                          {action?.team
                            ? teamById(action.team)?.name
                            : action
                              ? tx("SON KALAN", "DECIDER")
                              : "COUNTER-STRIKE 2"}
                        </small>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!done && (
                <div className="veto-control">
                  <div>
                    <Radio size={17} />
                    <span>
                      {selection
                        ? `${selection} · ${sequence(v)[v.actions.length] === "pick" ? tx("Oynamak için seçilecek", "Will be picked to play") : tx("Havuzdan elenecek", "Will be banned from pool")}`
                        : canMove
                          ? tx("Harita seçimini bekliyoruz.", "Waiting for your map selection.")
                          : `${team?.name} ${tx("kaptanı düşünüyor.", "captain is deciding.")}`}
                    </span>
                  </div>
                  <button
                    className="button-primary"
                    disabled={
                      !selection ||
                      !canMove ||
                      busy ||
                      !!v.actions.find((a) => a.map === selection)
                    }
                    onClick={() => void move()}
                  >
                    {busy
                      ? tx("Kaydediliyor…", "Saving…")
                      : sequence(v)[v.actions.length] === "pick"
                        ? tx("Haritayı seç", "Pick map")
                        : tx("Haritayı ele", "Ban map")}{" "}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
              {done && (
                <div className="veto-summary">
                  <div>
                    <Trophy size={24} />
                    <span>{tx("OYUN SIRASI", "MAP ORDER")}</span>
                  </div>
                  {vetoMaps(v).map((map, i) => (
                    <div className="veto-picked" key={map}>
                      <img src={mapImage(map)} alt="" decoding="async" />
                      <span>{tx(`HARİTA ${i + 1}`, `MAP ${i + 1}`)}</span>
                      <strong>{map}</strong>
                      <small>{tx("Başlangıç tarafı: bıçak raundu", "Starting side: knife round")}</small>
                    </div>
                  ))}
                  <a className="button-primary" href="#turnuva">
                    {tx("Maç merkezine dön", "Back to match center")} <ArrowRight size={15} />
                  </a>
                </div>
              )}
              <div className="veto-history">
                <ShieldCheck size={15} />
                <span>
                  {v.rehearsal
                    ? tx("Prova hamleleri", "Rehearsal moves")
                    : tx("Sunucu tarafından doğrulanan hamleler", "Server-verified moves")}
                </span>
                {v.actions.map((a, i) => (
                  <span key={a.map}>
                    {String(i + 1).padStart(2, "0")} {a.map}{" "}
                    {a.actor === "admin" && tx("· Admin müdahalesi", "· Admin override")}
                  </span>
                ))}
              </div>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
