import { ShieldCheck, LogOut, ArrowUpRight, Check, Users, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useArena } from "../arena/ArenaContext";
import { useTournament } from "../tournament/TournamentContext";
import { TeamLogoEditor } from "../components/TeamLogoEditor";
import { RoleScope } from "../components/RoleScope";
import { accessFor, isActiveRuntime } from "../arena/permissions";
import { steamLoginURL } from "../arena/schedule";
import { AccountAvatar } from "../components/AccountMenu";
import type { Team } from "../data";
import { langHeaders, useI18n } from "../i18n";
function CaptainProfile({ team }: { team: Team }) {
  const { tx, errText } = useI18n();
  const arena = useArena();
  const [name, setName] = useState(team.name),
    [tag, setTag] = useState(team.tag),
    [logo, setLogo] = useState(team.logo),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [revision, setRevision] = useState(arena.snapshot.revision);
  useEffect(() => {
    if (!dirty) {
      setName(team.name);
      setTag(team.tag);
      setLogo(team.logo);
      setRevision(arena.snapshot.revision);
    }
  }, [dirty, team.name, team.tag, team.logo, arena.snapshot.revision]);
  return (
    <form
      className="captain-profile"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSaved(false);
        try {
          await arena.act({
            action: "team-profile",
            teamId: team.id,
            revision,
            name,
            tag,
            logo: logo || null,
          });
          setDirty(false);
          setSaved(true);
        } catch (error) {
          setError(errText((error as Error).message));
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="eyebrow">{tx("KAPTAN YETKİSİ", "CAPTAIN ACCESS")}</span>
      <h2>{tx("Takımının kimliği.", "Your team's identity.")}</h2>
      <p>{tx("Takım adını, kısa adını ve logosunu burada düzenleyebilirsin.", "Edit your team name, tag, and logo here.")}</p>
      <div className="admin-fields">
        <label>
          {tx("Takım adı", "Team name")}
          <input
            required
            maxLength={40}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label>
          {tx("Kısa ad", "Tag")}
          <input
            required
            maxLength={5}
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setDirty(true);
            }}
          />
        </label>
      </div>
      <TeamLogoEditor
        logo={logo}
        onChange={(nextLogo) => {
          setLogo(nextLogo);
          setDirty(true);
        }}
      />
      <button className="button-primary" disabled={busy}>
        {busy ? tx("Kaydediliyor…", "Saving…") : tx("Takım bilgilerini kaydet", "Save team details")}
      </button>
      {saved && (
        <p role="status" className="save-notice">
          {tx("Takım bilgileri kaydedildi.", "Team details saved.")}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {error && (
        <button
          className="button-text"
          type="button"
          onClick={() => {
            setName(team.name);
            setTag(team.tag);
            setLogo(team.logo);
            setRevision(arena.snapshot.revision);
            setDirty(false);
            setError("");
          }}
        >
          {tx("Takımın son kaydını yükle", "Reload latest team data")}
        </button>
      )}
    </form>
  );
}
function SteamAccountCard({ rosterName, accountView, onLogout, loggingOut }: {
  rosterName?: string; accountView: boolean; onLogout: () => void; loggingOut: boolean;
}) {
  const { tx, errText } = useI18n();
  const arena = useArena();
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const me = arena.snapshot.me;
  if (me?.role !== "player") return null;
  const name = me.displayName || me.profile?.name || rosterName || `${tx("Steam kullanıcısı", "Steam user")} ${me.steamId || ""}`.trim();
  async function refreshProfile() {
    setRefreshing(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/auth/steam/profile", {
        method: "POST", headers: { "Content-Type": "application/json", ...langHeaders() }, body: "{}",
        signal: AbortSignal.timeout(15000),
      });
      let result: { error?: string; profile?: unknown; refreshed?: boolean };
      try {
        result = await response.json();
      } catch {
        throw new Error(tx("Sunucu yanıtı okunamadı.", "Could not read server response."));
      }
      if (!response.ok) throw new Error(result.error || tx("Steam profil bilgisi yenilenemedi.", "Could not refresh Steam profile."));
      await arena.refresh();
      setNotice(result.profile
        ? result.refreshed
          ? tx("Steam profil bilgilerin yenilendi.", "Your Steam profile info has been refreshed.")
          : tx("Kayıtlı Steam profil bilgilerin gösteriliyor.", "Showing your cached Steam profile info.")
        : tx("Steam profil bilgisi şu anda alınamadı. Steam kimlik doğrulaman geçerliliğini koruyor.", "Steam profile info is unavailable right now. Your Steam verification remains valid."));
    } catch (e) {
      setError(e instanceof Error ? errText(e.message) : tx("Steam profil bilgisi yenilenemedi.", "Could not refresh Steam profile."));
    } finally {
      setRefreshing(false);
    }
  }
  return <section className="account-profile-card" aria-label={tx("Steam hesap bilgileri", "Steam account details")}>
    <div className="account-profile-header">
      <AccountAvatar src={me.profile?.avatar} name={name} />
      <div><h2>{name}</h2><p>{me.profile ? tx("Steam hesabın doğrulandı.", "Your Steam account is verified.") : tx("Steam hesabın doğrulandı; profil adı ve fotoğrafı henüz alınmadı.", "Your Steam account is verified; profile name and avatar are not loaded yet.")}</p></div>
    </div>
    <dl className="account-profile-details">
      <div><dt>SteamID64</dt><dd>{me.steamId}</dd></div>
      {accountView && <div><dt>{tx("Turnuvada görünen adın", "Your tournament display name")}</dt><dd>{rosterName || tx("Henüz kadroya eklenmedin", "Not added to a roster yet")}</dd></div>}
    </dl>
    <div className="account-profile-actions">
      {accountView ? <>
        <button type="button" className="button-text" disabled={refreshing || loggingOut || !arena.online} onClick={() => void refreshProfile()}><RefreshCw size={15} />{refreshing ? tx("Profil yenileniyor…", "Refreshing profile…") : tx("Steam profilini yenile", "Refresh Steam profile")}</button>
        <a className="button-text" href={`https://steamcommunity.com/profiles/${encodeURIComponent(me.steamId || "")}`} target="_blank" rel="noreferrer">{tx("Steam profilini aç", "Open Steam profile")}<ArrowUpRight size={15} /></a>
      </> : <a className="button-text" href="#hesap">{tx("Hesap ayarları", "Account settings")}<ArrowUpRight size={15} /></a>}
      <button type="button" className="button-text" disabled={loggingOut || refreshing} onClick={onLogout}><LogOut size={15} />{loggingOut ? tx("Çıkış yapılıyor…", "Signing out…") : tx("Çıkış yap", "Sign out")}</button>
    </div>
    {accountView && <p className="account-profile-note">{tx("Steam adını ve fotoğrafını Steam’de düzenleyebilirsin. Profil bilgisi alınamadığında kayıtlı oyuncu adın veya SteamID’n gösterilir. Turnuvada görünen oyuncu adını ve kadronu site admini yönetir. Takım kaptanlığı, kaydedilen kadroya göre belirlenir.", "You can edit your Steam name and avatar on Steam. When profile info is unavailable, your registered player name or SteamID is shown. Tournament roster and display names are managed by the site admin. Team captaincy is determined by the saved roster.")}</p>}
    {notice && <p className="account-profile-status" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
export function PlayerPage({ accountView = false }: { accountView?: boolean }) {
  const { tx, roundLabel, errText } = useI18n();
  const arena = useArena(),
    { teams, byId, matchTeams } = useTournament(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const me = arena.snapshot.me,
    access = accessFor(arena.snapshot.config, me),
    team = teams.find((t) => t.id === access.teamId),
    player = team?.roster?.find((p) => p.steamId === me?.steamId);
  const matches = Object.values(byId)
    .filter((m) => m.status === "upcoming" || isActiveRuntime(arena.snapshot.runtimes?.[m.id]))
    .flatMap((match) => {
      if (me?.role !== "player" || !me.steamId) return [];
      const runtime = arena.snapshot.runtimes?.[match.id];
      if (runtime?.teams && !isActiveRuntime(runtime)) return [];
      const lineup = matchTeams(match).find((t) =>
        t.roster?.some((p) => p.steamId === me.steamId),
      );
      const matchPlayer = lineup?.roster?.find((p) => p.steamId === me.steamId);
      return matchPlayer ? [{ match, player: matchPlayer }] : [];
    });
  async function ready(id: string, value: boolean) {
    setBusy(true);
    setError("");
    try {
      await arena.act({ action: "ready", matchId: id, ready: value });
    } catch (e) {
      setError(errText((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await arena.logout();
    } catch (e) {
      setError(e instanceof Error ? errText(e.message) : tx("Oturum kapatılamadı. Tekrar dene.", "Could not sign out. Try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="subpage player-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{tx("KİMLİĞİN STEAM. İSMİN SENİN.", "YOUR STEAM ID. YOUR NAME.")}</span>
          <h1>
            {accountView ? tx("Hesap ayarları", "Account settings") : tx("Oyuncu merkezi", "Player hub")}<span className="heading-dot">.</span>
          </h1>
          <p>{accountView ? tx("Steam hesabını, turnuvadaki yerini ve bu oturumdaki yetkilerini kontrol et.", "Check your Steam account, tournament spot, and permissions for this session.") : tx("Hesabını doğrula, kadronu bul ve maçına hazır ol.", "Verify your account, find your roster, and ready up for your match.")}</p>
        </div>
        <ShieldCheck size={38} strokeWidth={1} />
      </div>
      <RoleScope />
      {me?.role === "admin" ? <div className="player-admin-actions"><a className="button-primary" href="#admin">{tx("Yönetim paneline git", "Go to admin panel")}</a><button className="button-text" disabled={busy} onClick={() => void logout()}>{busy ? tx("Çıkış yapılıyor…", "Signing out…") : tx("Admin oturumunu kapat", "Sign out of admin session")}</button><p>{tx("Oyuncu olarak katılmak için admin oturumunu kapatıp kendi Steam hesabınla giriş yap.", "To participate as a player, sign out of admin and sign in with your Steam account.")}</p></div> : !me?.steamId ? (
        <div className="steam-login-card">
          <ShieldCheck size={48} strokeWidth={1} />
          <h2>{tx("Steam hesabınla giriş yap.", "Sign in with your Steam account.")}</h2>
          <p>
            {tx(
              "Steam şifren bu siteye gelmez. Steam üzerinden kimliğin doğrulanır; adminin kadroya eklediği SteamID64 ile eşleştirilirsin.",
              "Your Steam password never touches this site. Your identity is verified via Steam and matched to the SteamID64 registered by admins.",
            )}
          </p>
          {arena.online && arena.snapshot.steamConfigured ? (
            <a className="button-primary" href={steamLoginURL(location.pathname + location.hash)}>
              {tx("Steam ile doğrula", "Verify with Steam")} <ArrowUpRight size={17} />
            </a>
          ) : (
            <p className="setup-note">
              {tx(
                "Steam girişi için çevrimiçi yönetim kurulumu ve PUBLIC_ORIGIN ayarı gerekli. Yerel provada kimlik doğrulanmış sayılmaz.",
                "Online setup and PUBLIC_ORIGIN are required for Steam sign-in. Local rehearsal does not verify identities.",
              )}
            </p>
          )}
        </div>
      ) : (
        <>
          <SteamAccountCard key={me.steamId} rosterName={player?.name || matches[0]?.player.name} accountView={accountView} onLogout={() => void logout()} loggingOut={busy} />
          {!player ? (
            <div className="empty-state">
              <Users size={30} />
              <h2>{matches.length ? tx("Bu maçın kadrosunda yerin korunuyor.", "Your spot in this match lineup is preserved.") : tx("Kadroya eklenmen bekleniyor.", "Waiting to be added to a roster.")}</h2>
              <p>
                {matches.length
                  ? tx(
                      "Güncel takım kadrosunda değilsin; başlamış hazırlığın kayıtlı kadrosuyla kendi maçına devam edebilirsin. Yeni maçlar için yöneticiyle iletişime geç.",
                      "You are not on the current team roster, but you can continue this active match using its frozen lineup. Contact an admin for future matches.",
                    )
                  : tx(
                      "Doğrulanmış SteamID’ni turnuva yöneticisine ilet. Kimliğini elle başka bir oyuncuya bağlayamazsın.",
                      "Share your verified SteamID64 with the tournament admin. You cannot manually bind your identity to another player.",
                    )}
              </p>
            </div>
          ) : (
            <>
              <div className="player-team-card">
                <span className="eyebrow">
                  {team?.name} /{" "}
                  {team?.captainId === player.id ? tx("TAKIM KAPTANI", "TEAM CAPTAIN") : tx("OYUNCU", "PLAYER")}
                </span>
                <h2>{player.name}</h2>
                <p>
                  {tx(
                    "Bu ad MatchZy maç dosyasında da kullanılır. Oyun adın değişse bile istatistiklerin SteamID ile eşleşir.",
                    "This name is also used in the MatchZy match config. Even if your in-game name changes, stats always link by SteamID.",
                  )}
                </p>
              </div>
              {team && access.role === "captain" && (
                <CaptainProfile key={team.id} team={team} />
              )}
            </>
          )}
          {(player || matches.length > 0) && <>
              <h2 className="player-matches-title">{tx("Maç hazırlığı", "Match readiness")}</h2>
              {matches.map(({ match: m, player: matchPlayer }) => {
                const isReady = arena.snapshot.readies.some(
                    (r) => r.match_id === m.id && r.player_id === matchPlayer.id,
                  ),
                  veto = arena.snapshot.vetos.find((v) => v.matchId === m.id);
                return (
                  <div className="player-match" key={m.id}>
                    <div>
                      <span className="eyebrow">
                        {m.id} / {m.format}
                      </span>
                      <h3>{roundLabel(m.round)}</h3>
                      <span>{m.format}</span>
                    </div>
                    <a className="button-text" href={`#veto/${m.id}`}>
                      {tx("Lobiye git", "Go to lobby")} <ArrowUpRight size={15} />
                    </a>
                    <button
                      className={
                        isReady ? "ready-button is-ready" : "ready-button"
                      }
                      disabled={busy || m.status !== "upcoming" || !!veto || !m.a || !m.b}
                      onClick={() => void ready(m.id, !isReady)}
                    >
                      <Check size={15} />
                      {!m.a || !m.b
                        ? tx("Eşleşme bekleniyor", "Awaiting matchup")
                        : m.status !== "upcoming"
                          ? tx("Maç sürüyor", "Match in progress")
                        : veto
                          ? tx("Veto başladı", "Veto started")
                          : isReady
                            ? tx("Hazırım · Geri al", "Ready · Undo")
                            : tx("Hazırım", "Ready")}
                    </button>
                  </div>
                );
              })}
              {!matches.length && (
                <p className="setup-note">
                  {tx("Takımının bir sonraki eşleşmesi henüz belli değil.", "Your team's next matchup is not decided yet.")}
                </p>
              )}
          </>}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
