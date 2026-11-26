import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Crosshair,
  Copy,
  Shield,
  X,
} from "lucide-react";
import type { DuelFeed, DuelPlayer, DuelView } from "../arena/duel";
import { mapNames } from "../tournament/engine";
import { mapImage } from "../arena/maps";
import { vetoDone, vetoMaps, vetoPollInterval, vetoTurn } from "../arena/veto";
import { useVisiblePolling } from "../arena/useVisiblePolling";
import { hsPercent, matchRating } from "../tournament/liveTypes";
import { BotTrainingPanel } from "../components/BotTrainingPanel";
import { InviteCopy, ServerJoin } from "../components/ShareControls";
import { steamLoginURL } from "../arena/schedule";
import { MatchOperations } from "../components/MatchOperations";
import { MatchStage } from "../components/MatchStage";
import { langHeaders, useI18n } from "../i18n";

const emptyFeed: DuelFeed = { me: null, rooms: [], steamConfigured: false };
export function DuelPage({ roomId }: { roomId?: string }) {
  const { tx, errText } = useI18n();
  const [botOpen, setBotOpen] = useState(false);
  const [commandCopied, setCommandCopied] = useState(false);
  const [feed, setFeed] = useState<DuelFeed>(emptyFeed),
    [actionError, setError] = useState(""),
    [feedError, setFeedError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [selection, setSelection] = useState<string | null>(null),
    [confirm, setConfirm] = useState<"force-veto" | "close" | null>(null),
    [players, setPlayers] = useState<[DuelPlayer, DuelPlayer]>([
      { name: "", steamId: "" },
      { name: "", steamId: "" },
    ]);
  const generation = useRef(0);
  const clockOffset = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const response = await fetch(
        `/api/duels${roomId ? `?id=${encodeURIComponent(roomId)}` : ""}`,
        { cache: "no-store", headers: langHeaders(), signal: AbortSignal.timeout(8000) },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || tx("1v1 bağlantısı kurulamadı.", "Could not connect to 1v1 API."));
      if (!Array.isArray(data.rooms))
        throw new Error(tx("1v1 API’si geçerli yanıt vermedi.", "1v1 API returned an invalid response."));
      if (typeof data.serverTime === "number")
        clockOffset.current = data.serverTime - Date.now();
      if (current === generation.current) {
        setFeed(data);
        setFeedError("");
      }
    } catch (e) {
      if (current === generation.current)
        setFeedError(
          e instanceof SyntaxError
            ? tx("1v1 API’si yayınlanmamış. Workers yayını ve 0003 SQL dosyası gerekli.", "1v1 API is not deployed. Workers deployment and SQL migration 0003 are required.")
            : errText((e as Error).message),
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [roomId, tx, errText]);
  const room = feed.rooms.find((r) => r.id === roomId),
    admin = feed.me?.role === "admin";
  const error = actionError || feedError;
  const veto = room?.veto,
    done = !!veto && vetoDone(veto);
  useVisiblePolling(refresh, room && !room.closed && !done ? vetoPollInterval : 5000);
  useEffect(() => {
    setSelection(null);
  }, [room?.revision]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/duels", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json", ...langHeaders() },
        body: JSON.stringify({
          action,
          id: room?.id,
          revision: room?.revision,
          ...extra,
        }),
      });
      let data: Record<string, unknown>;
      try {
        data = await response.json();
      } catch {
        throw new Error(tx("Sunucu yanıtı alınamadı.", "Could not get a server response."));
      }
      if (!response.ok) {
        if (response.status === 409) await refresh();
        throw new Error(
          typeof data.error === "string" ? data.error : tx("İşlem tamamlanamadı.", "Action could not be completed."),
        );
      }
      setConfirm(null);
      setSelection(null);
      if (action === "create") location.hash = `1v1/${data.id}`;
      else await refresh();
    } catch (e) {
      setError(errText((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const turn = veto && !done ? (vetoTurn(veto) === "duel-a" ? 0 : 1) : null,
    canMove =
      !!room &&
      !room.closed &&
      turn !== null &&
      (admin || feed.me?.steamId === room.players[turn].steamId),
    map = room?.live?.map || (veto && done ? vetoMaps(veto)[0] : undefined),
    image = mapImage(map);
  const loadCommand = room
    ? `matchzy_loadmatch_url "${location.origin}/api/duel-config?id=${room.id}" "Authorization" "Bearer GIZLI_DEGER"`
    : "";
  return (
    <section className="subpage duel-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tx("İKİ OYUNCU. TEK HARİTA.", "TWO PLAYERS. ONE MAP.")}</span>
          <h1>
            {tx("Özel 1v1", "Private 1v1")}<span className="heading-dot">.</span>
          </h1>
          <p>
            {tx(
              "Steam, veto ve canlı skor akışını iki kişiyle dene. Bu odaların sonuçları turnuva ağacına yazılmaz.",
              "Test Steam, map veto, and live scoring with two players. Results in these rooms do not affect the tournament bracket.",
            )}
          </p>
        </div>
        <Crosshair size={38} strokeWidth={1} />
      </div>
      <div className="duel-toolbar">
        {roomId && <InviteCopy path={`/#1v1/${roomId}`} />}
        <ServerJoin address={feed.serverAddress} />
        <a className="button-text" href="#1v1">
          <ArrowLeft size={15} /> {tx("1v1 odaları", "1v1 rooms")}
        </a>
        <a className="button-text" href="#oyuncu">
          {tx("Steam / oyuncu girişi", "Steam / player sign-in")} <ArrowUpRight size={15} />
        </a>
        {admin && <a className="button-text" href="#admin">
          <Shield size={15} /> {tx("Yönetim", "Admin")}
        </a>}
        {admin && (
          <button
            className="button-text"
            aria-expanded={botOpen}
            onClick={() => setBotOpen((current) => !current)}
          >
            {tx("Botla dene", "Try with bot")}
          </button>
        )}
      </div>
      {admin && botOpen && (
        <BotTrainingPanel initialMap={map} onClose={() => setBotOpen(false)} />
      )}
      {loading && <p role="status">{tx("1v1 odaları yükleniyor…", "Loading 1v1 rooms…")}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          <button
            className="button-text"
            disabled={busy}
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            {tx("Son durumu yükle", "Reload latest state")}
          </button>
        </p>
      )}
      {!loading && !feed.me && (
        <div className="steam-login-card">
          <h2>{tx("Odan için giriş yap.", "Sign in to access your room.")}</h2>
          <p>
            {tx(
              "Oyuncular Steam ile giriş yapar. Yönetici iki SteamID64 ile oda oluşturabilir. Girişten sonra davet edildiğin odaya dönersin.",
              "Players sign in with Steam. Admins can create a room with two SteamID64s. After sign-in you will return to your invited room.",
            )}
          </p>
          <a
            className="button-primary"
            href={
              feed.steamConfigured
                ? steamLoginURL(roomId ? `/#1v1/${roomId}` : "/#1v1")
                : "#oyuncu"
            }
          >
            {tx("Steam ile giriş", "Sign in with Steam")} <ArrowUpRight size={16} />
          </a>
        </div>
      )}
      {!roomId && admin && !botOpen && (
        <form
          className="duel-create"
          onSubmit={(e) => {
            e.preventDefault();
            void act("create", { players });
          }}
        >
          <span className="eyebrow">{tx("YÖNETİCİ / YENİ ODA", "ADMIN / NEW ROOM")}</span>
          <h2>{tx("Rakibini seç.", "Pick the matchup.")}</h2>
          <p>
            {tx("Turnuva kadrosunda olma şartı yok. İki gerçek SteamID64 yeterli.", "Players do not need to be on a tournament roster. Two valid SteamID64s are enough.")}
          </p>
          <div className="duel-player-fields">
            {players.map((player, i) => (
              <fieldset key={i}>
                <legend>{tx(`${i + 1}. oyuncu`, `Player ${i + 1}`)}</legend>
                <label>
                  {tx("Görünen isim", "Display name")}
                  <input
                    required
                    maxLength={40}
                    value={player.name}
                    onChange={(e) =>
                      setPlayers(
                        (current) =>
                          current.map((p, j) =>
                            j === i ? { ...p, name: e.target.value } : p,
                          ) as [DuelPlayer, DuelPlayer],
                      )
                    }
                  />
                </label>
                <label>
                  SteamID64
                  <input
                    required
                    inputMode="numeric"
                    pattern="7656119[0-9]{10}"
                    maxLength={17}
                    value={player.steamId}
                    onChange={(e) =>
                      setPlayers(
                        (current) =>
                          current.map((p, j) =>
                            j === i ? { ...p, steamId: e.target.value } : p,
                          ) as [DuelPlayer, DuelPlayer],
                      )
                    }
                  />
                </label>
              </fieldset>
            ))}
          </div>
          <button className="button-primary" disabled={busy}>
            {busy ? tx("Oda açılıyor…", "Creating room…") : tx("1v1 odası oluştur", "Create 1v1 room")}
          </button>
        </form>
      )}
      {!roomId && feed.me && (
        <div className="duel-room-list">
          <h2>{admin ? tx("1v1 odaları", "1v1 rooms") : tx("Odalarım", "My rooms")}</h2>
          {!feed.rooms.length && (
            <p>
              {tx(
                "Henüz oda yok. Yönetici iki oyuncunun SteamID64 bilgisiyle oda açabilir.",
                "No rooms yet. An admin can create a room with two players' SteamID64s.",
              )}
            </p>
          )}
          {feed.rooms.map((r) => (
            <a className="duel-room-row" href={`#1v1/${r.id}`} key={r.id}>
              <span>
                {r.players[0].name} <i> / </i> {r.players[1].name}
              </span>
              <small>
                {r.closed
                  ? tx("KAPALI", "CLOSED")
                  : r.live?.status === "completed"
                    ? tx("TAMAMLANDI", "COMPLETED")
                    : r.live
                      ? tx("CANLI", "LIVE")
                      : r.veto
                        ? vetoDone(r.veto)
                          ? tx("SUNUCU BEKLENİYOR", "AWAITING SERVER")
                          : "VETO"
                        : tx("HAZIRLIK", "PREP")}
              </small>
              <ArrowUpRight size={16} />
            </a>
          ))}
        </div>
      )}
      {roomId && !loading && feed.me && !room && !error && (
        <p className="setup-note">
          {tx("Oda bulunamadı veya bu odanın oyuncusu değilsin.", "Room not found or you are not a player in this room.")}
        </p>
      )}
      {room && !botOpen && (
        <>
          <MatchStage
            match={
              {
                id: room.id,
                format: "BO1",
                status: room.live?.status || "upcoming",
              } as import("../data").Match
            }
            phase={
              room.closed
                ? "cancelled"
                : room.runtime?.phase ||
                  (done ? "veto-complete" : veto ? "veto" : "preparing")
            }
          />
          {admin && !room.closed && (
            <MatchOperations
              match={
                {
                  id: room.id,
                  format: "BO1",
                  status: room.live?.status || "upcoming",
                } as import("../data").Match
              }
              onChange={refresh}
            />
          )}
          {(!veto || done || room.closed) && (
            <div
              className="duel-scoreboard"
              style={
                image
                  ? {
                      backgroundImage: `linear-gradient(0deg, #141719, #141719b8), url("${image}")`,
                    }
                  : undefined
              }
            >
              <div className="duel-score-meta">
                <span>
                  {room.closed
                    ? tx("ODA KAPALI", "ROOM CLOSED")
                    : room.live?.status === "completed"
                      ? tx("TAMAMLANDI", "COMPLETED")
                      : room.live
                        ? tx("CANLI", "LIVE")
                        : done
                          ? tx("SUNUCU BEKLENİYOR", "AWAITING SERVER")
                          : tx("BO1 / ÖZEL MAÇ", "BO1 / PRIVATE MATCH")}
                </span>
                <span>{map || tx("Harita vetoda belirlenecek", "Map will be decided in veto")}</span>
              </div>
              <div className="duel-score-main">
                <h2>{room.players[0].name}</h2>
                <div>
                  <strong>
                    {room.live?.score[0] ?? "—"} <i>:</i>{" "}
                    {room.live?.score[1] ?? "—"}
                  </strong>
                  <small>{tx("RAUNT SKORU", "ROUND SCORE")}</small>
                </div>
                <h2>{room.players[1].name}</h2>
              </div>
              <p className="stats-scroll-hint">
                {tx("Hasar, ADR ve rating için tabloyu yana kaydır →", "Scroll horizontally for damage, ADR, and rating →")}
              </p>
              <DuelStats room={room} />
            </div>
          )}
          {!room.closed && !veto && (
            <div className="duel-lobby">
              <h2>{tx("İki oyuncu hazır olduğunda veto açılır.", "Veto opens once both players are ready.")}</h2>
              <div className="duel-ready-players">
                {room.players.map((p) => {
                  const ready = (room.ready[p.steamId] || 0) > Date.now() + clockOffset.current;
                  return (
                    <div key={p.steamId}>
                      <strong>{p.name}</strong>
                      <span>{ready ? tx("Hazır", "Ready") : tx("Hazır bekleniyor", "Waiting to ready up")}</span>
                      {feed.me?.role === "player" && feed.me.steamId === p.steamId && (
                        <button
                          className={
                            ready ? "ready-button is-ready" : "ready-button"
                          }
                          disabled={busy}
                          onClick={() => void act("ready", { ready: !ready })}
                        >
                          <Check size={15} />
                          {ready ? tx("Hazırım · Geri al", "Ready · Undo") : tx("Hazırım", "Ready")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {admin && (
                <button
                  className="button-text"
                  disabled={busy}
                  onClick={() => setConfirm("force-veto")}
                >
                  {tx("Hazır kontrolünü geç, vetoyu başlat", "Bypass ready check and start veto")}
                </button>
              )}
            </div>
          )}
          {!room.closed && veto && !done && (
            <div className="duel-veto">
              <div className="veto-title">
                <span className="eyebrow">
                  {tx(`${veto.actions.length + 1}. HAMLE / BO1`, `MOVE ${veto.actions.length + 1} / BO1`)}
                  {veto.forced ? tx(" · ADMİN HAZIR KONTROLÜNÜ GEÇTİ", " · ADMIN BYPASSED READY CHECK") : ""}
                </span>
                <h2>{room.players[turn!].name} {tx("eliyor.", "is banning.")}</h2>
                <p>
                  {canMove
                    ? tx("Bir harita seç, ardından hamleni onayla.", "Select a map, then confirm your ban.")
                    : tx("Diğer oyuncunun hamlesi bekleniyor.", "Waiting for the other player's move.")}
                </p>
              </div>
              <div className="veto-map-grid">
                {mapNames.map((name) => {
                  const action = veto.actions.find((a) => a.map === name);
                  return (
                    <button
                      type="button"
                      className={`veto-map ${action?.kind || ""} ${selection === name ? "selected" : ""}`}
                      key={name}
                      disabled={!canMove || !!action || busy}
                      aria-label={`${name}${action ? ` · ${tx("elendi", "banned")}` : ""}`}
                      aria-pressed={selection === name}
                      onClick={() => setSelection(name)}
                    >
                      <img src={mapImage(name)} alt="" decoding="async" />
                      <div className="veto-map-shade" />
                      <span className="veto-map-tag">
                        {action
                          ? tx("ELENDİ", "BANNED")
                          : selection === name
                            ? tx("SEÇİMİN", "SELECTED")
                            : tx("HARİTA HAVUZU", "MAP POOL")}
                      </span>
                      <div className="veto-map-bottom">
                        {action ? <X size={24} /> : <Crosshair size={24} />}
                        <h2>{name}</h2>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="veto-control">
                <span>
                  {selection
                    ? tx(`${selection} elenecek`, `${selection} will be banned`)
                    : tx(`${veto.actions.length}/6 harita elendi`, `${veto.actions.length}/6 maps banned`)}
                </span>
                <button
                  className="button-primary"
                  disabled={!selection || !canMove || busy}
                  onClick={() => void act("move", { map: selection })}
                >
                  {tx("Haritayı ele", "Ban map")}
                </button>
              </div>
            </div>
          )}
          {done && (
            <div className="duel-finished">
              <Check size={22} />
              <div>
                <h2>{tx("Harita hazır", "Map locked")}: {map}</h2>
                <p>{tx("Başlangıç tarafı bıçak raunduyla belirlenecek.", "Starting sides will be decided by a knife round.")}</p>
              </div>
            </div>
          )}
          {admin && done && !room.closed && (
            <div className="server-connect-card">
              <h2>{tx("DatHost’ta bu 1v1’i yükle.", "Load this 1v1 on DatHost.")}</h2>
              <p>
                {tx(
                  "Aynı oyun sunucusunu kullanır. Bu komut sunucudaki mevcut maç/harita durumunu etkileyebilir; sunucu boşken uygula. GIZLI_DEGER alanını webhook Secret’ınla değiştir.",
                  "Uses the same game server. This command may affect any ongoing match/map; run when idle. Replace GIZLI_DEGER with your webhook secret.",
                )}
              </p>
              <code>{loadCommand}</code>
              <button
                className="button-text"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(loadCommand);
                    setCommandCopied(true);
                  } catch {
                    setError(
                      tx(
                        "Otomatik kopyalanamadı. Komut satırını seçip Ctrl+C ile kopyala.",
                        "Could not copy automatically. Select the command and press Ctrl+C.",
                      ),
                    );
                  }
                }}
              >
                <Copy size={15} /> {tx("Maç komutunu kopyala", "Copy match command")}
              </button>
              {commandCopied && (
                <p role="status" className="save-notice">
                  {tx(
                    "Kopyalandı. GIZLI_DEGER alanını DatHost konsolunda kendi anahtarınla değiştir.",
                    "Copied. Replace GIZLI_DEGER with your own secret in the DatHost console.",
                  )}
                </p>
              )}
              <p>
                {tx(
                  "Her maç için JSON dosyası yüklemen gerekmez. Bu komut dosyayı doğrudan siteden alır. Yeni odada yeni odanın komutunu kullan. “A match is already setup” hatasında, önce mevcut maçı",
                  "You don't need to upload a JSON file per match. This command loads the config directly from the site. Use the new room's command for each new room. On 'A match is already setup', end the current match with",
                )}{" "}
                <code>css_endmatch</code>{" "}
                {tx("ile kapat; bu komut oynanan maçı iptal eder.", "first; that cancels any active match.")}
              </p>
              <a
                className="button-text"
                href={`/api/duel-config?id=${room.id}`}
              >
                {tx("1v1 MatchZy dosyasını indir", "Download 1v1 MatchZy config")} <ArrowUpRight size={15} />
              </a>
              <p>
                {tx(
                  "Takım başına 1 oyuncu gerekir. Sunucuya girince iki oyuncu da oyun sohbetine",
                  "Requires 1 player per side. Once on the server, both players type",
                )}{" "}
                <strong>.ready</strong>{" "}
                {tx(
                  "yazar. İstatistikler aynı MatchZy webhook’undan buraya gelir.",
                  "in chat. Stats flow here through the same MatchZy webhook.",
                )}
              </p>
            </div>
          )}
          {veto && (
            <div className="veto-history">
              {veto.actions.map((a, i) => (
                <span key={a.map}>
                  {i + 1}. {a.map} · {a.kind === "ban" ? tx("Elendi", "Banned") : tx("Kalan", "Decider")}
                  {a.actor === "admin" ? tx(" · Admin müdahalesi", " · Admin override") : ""}
                </span>
              ))}
            </div>
          )}
          {admin && !room.closed && (
            <button
              className="button-text danger-text"
              disabled={busy}
              onClick={() => setConfirm("close")}
            >
              {tx("Odayı kapat", "Close room")}
            </button>
          )}
          {confirm && (
            <div className="change-confirm" role="alert">
              <h2>
                {confirm === "force-veto"
                  ? tx("Hazır kontrolü geçilsin mi?", "Bypass ready check?")
                  : tx("Oda kapatılsın mı?", "Close this room?")}
              </h2>
              <p>
                {confirm === "force-veto"
                  ? tx(
                      "Gerçek 1v1 vetosu açılır. Oyuncular hazır veya Steam ile doğrulanmış sayılmaz; admin iki oyuncu adına da hamle yapabilir.",
                      "Opens a real 1v1 veto. Players are not marked ready or Steam-verified; admins can submit moves for either player.",
                    )
                  : tx(
                      "Oda yeni hamlelere ve webhook olaylarına kapanır. Sunucuya yüklenmiş oyun otomatik durdurulmaz. Tekrar denemek için yeni oda aç.",
                      "Closes the room to new moves and webhook events. Any match on the server is not stopped automatically. Open a new room to play again.",
                    )}
              </p>
              <button
                className="button-primary"
                disabled={busy}
                onClick={() => void act(confirm, { confirm: true })}
              >
                {tx("Onayla ve uygula", "Confirm and apply")}
              </button>
              <button className="button-text" onClick={() => setConfirm(null)}>
                {tx("Vazgeç", "Cancel")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DuelStats({ room }: { room: DuelView }) {
  const { tx } = useI18n();
  return (
    <div
      className="stats-scroll duel-stats"
      role="region"
      aria-label={tx("1v1 maç istatistikleri", "1v1 match statistics")}
      tabIndex={0}
    >
      <table>
        <caption>
          {tx(
            "Yalnızca bu 1v1 maçının istatistikleri · Arena 1.0, HLTV rating değildir",
            "Stats for this 1v1 match only · Arena 1.0, not an HLTV rating",
          )}
        </caption>
        <thead>
          <tr>
            {[tx("OYUNCU", "PLAYER"), "K", "D", "A", "HS%", tx("HASAR", "DMG"), "ADR", "RATING"].map(
              (label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {room.players.map((player) => {
            const stats = room.live?.players.find(
                (p) => p.steamId === player.steamId,
              ),
              rating = stats && matchRating(stats);
            return (
              <tr key={player.steamId}>
                <th scope="row">{player.name}</th>
                <td>{stats?.kills ?? "—"}</td>
                <td>{stats?.deaths ?? "—"}</td>
                <td>{stats?.assists ?? "—"}</td>
                <td>{stats ? `${hsPercent(stats).toFixed(1)}%` : "—"}</td>
                <td>{stats?.damage ?? "—"}</td>
                <td>
                  {stats?.damage !== undefined && stats.roundsPlayed
                    ? (stats.damage / stats.roundsPlayed).toFixed(1)
                    : "—"}
                </td>
                <td>{rating != null ? rating.toFixed(2) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
