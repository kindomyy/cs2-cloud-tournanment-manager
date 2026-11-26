import { useMemo, useState, useEffect } from "react";
import {
  Save,
  Shield,
  Users,
  Swords,
  Radio,
  Plus,
  Trash2,
  ArrowUpRight,
  LogOut,
  Check,
  RotateCcw,
  Download,
  ContactRound,
  ArrowRightLeft,
} from "lucide-react";
import { useArena, ApiError } from "../arena/ArenaContext";
import { useTournament } from "../tournament/TournamentContext";
import { project, emptyState } from "../tournament/engine";
import {
  newMatchId,
  displayName,
  validMatchId,
  validateArena,
  type ArenaConfig,
  type ManagedTeam,
  type SteamRegistration,
} from "../arena/model";
import { ScoreEditor } from "./TestPage";
import { vetoDone, vetoMaps } from "../arena/veto";
import { MatchSettingsEditor } from "../components/MatchSettingsEditor";
import { MatchChecklist } from "../components/MatchChecklist";
import { AdminReadiness } from "../components/AdminReadiness";
import { MatchStage } from "../components/MatchStage";
import { MatchOperations } from "../components/MatchOperations";
import { OperationsPanel } from "../components/OperationsPanel";
import { TeamLogoEditor } from "../components/TeamLogoEditor";
import { OpeningMatchesEditor } from "../components/OpeningMatchesEditor";
import { SteamAccountsPanel } from "../components/SteamAccountsPanel";
import { RosterAccountPicker } from "../components/RosterAccountPicker";
import { assignOpeningTeam } from "../tournament/opening";
import { downloadBlob } from "../arena/download";
import { useI18n } from "../i18n";

export function AdminPage() {
  const arena = useArena(),
    { setMode } = useTournament(),
    { tx, roundLabel, errText } = useI18n();
  const [password, setPassword] = useState(""),
    [tab, setTab] = useState("teams"),
    [matchTab, setMatchTab] = useState("schedule"),
    [draft, setDraft] = useState<ArenaConfig>(() =>
      structuredClone(arena.snapshot.config),
    ),
    [baseRevision, setBaseRevision] = useState(arena.snapshot.revision),
    [dirty, setDirty] = useState(false),
    [teamId, setTeamId] = useState(arena.snapshot.config.teams[0]?.id || ""),
    [matchId, setMatchId] = useState("U1"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [rosterPicker, setRosterPicker] = useState<{ replaceId?: string } | null>(null),
    [manualPlayerId, setManualPlayerId] = useState<string | null>(null),
    [confirm, setConfirm] = useState<{
      message: string;
      data: Record<string, unknown>;
    } | null>(null);
  const authorized =
    arena.snapshot.me?.role === "admin" ||
    (!arena.online && arena.previewAdmin);
  useEffect(() => {
    if (!dirty) {
      setDraft(structuredClone(arena.snapshot.config));
      setBaseRevision(arena.snapshot.revision);
    }
  }, [arena.snapshot.revision, arena.snapshot.config, dirty]);
  useEffect(() => {
    if (authorized) setMode("server");
  }, [authorized, setMode]);
  const team = draft.teams.find((t) => t.id === teamId) || draft.teams[0],
    view = useMemo(
      () => project(arena.snapshot.state, arena.snapshot.config.teams),
      [arena.snapshot.state, arena.snapshot.config.teams],
    ),
    match = view.byId[matchId] || view.matches[0],
    veto = arena.snapshot.vetos.find((v) => v.matchId === matchId);
  const activeMatchOptions = view.matches.filter((item) =>
    item.a && item.b && item.status !== "completed" &&
    !["cancelled", "completed"].includes(arena.snapshot.runtimes?.[item.id]?.phase || ""),
  );
  const activeMatchId = draft.presentation?.activeMatchId || "";
  const activeMatchAvailable = activeMatchOptions.some((item) => item.id === activeMatchId);
  function edit(change: (next: ArenaConfig) => void) {
    const next = structuredClone(draft);
    change(next);
    setDraft(next);
    setDirty(true);
    setNotice("");
  }
  function editTeam(change: (next: ManagedTeam) => void) {
    if (team)
      edit((next) => {
        const t = next.teams.find((t) => t.id === team.id)!;
        change(t);
        t.players = t.roster.map((p) => p.name);
      });
  }
  function addManualPlayer() {
    if (!team || team.roster.length >= 5) return;
    const id = crypto.randomUUID();
    editTeam((t) => {
      t.roster.push({ id, name: tx("Yeni oyuncu", "New player"), steamId: null });
      if (!t.captainId) t.captainId = id;
    });
    setManualPlayerId(id);
  }
  function selectRosterAccount(account: SteamRegistration) {
    if (!team || !rosterPicker) return;
    const { replaceId } = rosterPicker;
    if (replaceId ? !team.roster.some((p) => p.id === replaceId) : team.roster.length >= 5) return;
    if (team.roster.some((p) => p.steamId === account.steam_id)) return;
    edit((next) => {
      const target = next.teams.find((t) => t.id === team.id)!;
      const source = next.teams.find((t) => t.roster.some((p) => p.steamId === account.steam_id));
      const existing = source?.roster.find((p) => p.steamId === account.steam_id);
      let name = account.displayName || account.profile?.name;
      try {
        name = displayName(name);
      } catch {
        name = tx(`Oyuncu ${account.steam_id.slice(-6)}`, `Player ${account.steam_id.slice(-6)}`);
      }
      const player = existing || { id: crypto.randomUUID(), name, steamId: account.steam_id };
      if (source && existing) {
        source.roster = source.roster.filter((p) => p.id !== existing.id);
        source.players = source.roster.map((p) => p.name);
        if (source.captainId === existing.id) source.captainId = source.roster[0]?.id || "";
      }
      if (replaceId) target.roster = target.roster.map((p) => p.id === replaceId ? player : p);
      else target.roster.push(player);
      target.players = target.roster.map((p) => p.name);
      if (!target.captainId || target.captainId === replaceId) target.captainId = player.id;
    });
    setRosterPicker(null);
  }
  async function action(data: Record<string, unknown>) {
    if (dirty && data.action !== "config") {
      setError(tx("Önce taslak değişikliklerini kaydet.", "Save draft changes first."));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (data.action === "config")
        data = { ...data, config: validateArena(data.config) };
      await arena.act(data);
      setConfirm(null);
      setDirty(false);
      setNotice(
        tx(
          "Kaydedildi. Tüm ekranlar güncellendi.",
          "Saved. All views updated.",
        ),
      );
    } catch (e) {
      setError(errText((e as Error).message));
      if (e instanceof ApiError && (e.data.requiresReset || e.data.invalidated))
        setConfirm({
          message: errText(e.message),
          data: {
            ...data,
            ...(e.data.requiresReset
              ? { resetTournament: true }
              : { confirm: true }),
          },
        });
    } finally {
      setBusy(false);
    }
  }
  function save() {
    void action({ action: "config", config: draft, revision: baseRevision });
  }
  function exportDraft() {
    downloadBlob(JSON.stringify(draft, null, 2), "kampus-arena-yonetim.json");
  }
  if (!authorized)
    return (
      <section className="subpage admin-login">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              {tx("TURNUVANIN KONTROL NOKTASI", "TOURNAMENT CONTROL POINT")}
            </span>
            <h1>
              {tx("Yönetim", "Admin")}<span className="heading-dot">.</span>
            </h1>
            <p>
              {tx(
                "Takımlar, kadrolar, maçlar ve harita vetoları.",
                "Teams, rosters, matches, and map vetoes.",
              )}
            </p>
          </div>
          <Shield size={38} strokeWidth={1} />
        </div>
        {arena.online ? (
          <form
            className="admin-login-card"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await arena.login(password);
                setPassword("");
              } catch (e) {
                setError(errText((e as Error).message));
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>{tx("Yönetici girişi", "Admin sign-in")}</h2>
            <label className="field-label">
              {tx("Yönetici parolası", "Admin password")}
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={busy} className="button-primary">
              {tx("Giriş yap", "Sign in")} <ArrowUpRight size={16} />
            </button>
          </form>
        ) : (
          <div className="admin-login-card">
            <h2>{tx("Yönetim ekranını prova et.", "Try the admin panel.")}</h2>
            <p>
              {tx(
                "Çevrimiçi yönetim henüz bağlı değil. Tarayıcıdaki prova ile kadroları, takvimi ve veto ekranını deneyebilirsin. Gerçek Steam girişi veya ortak kayıt yapılmaz.",
                "Online management is not connected yet. You can try rosters, schedule, and the veto screen in browser preview mode. No real Steam sign-in or shared saves are performed.",
              )}
            </p>
            <button className="button-primary" onClick={arena.openPreview}>
              {tx("Yerel yönetim provasını aç", "Open local admin preview")}{" "}
              <ArrowUpRight size={16} />
            </button>
            <a
              href="https://github.com/kindomyy/cs2-tournanmentmanager/blob/main/docs/ADMIN.md"
              className="button-text"
              target="_blank"
              rel="noreferrer"
            >
              {tx("Çevrimiçi kurulum rehberi", "Online setup guide")}{" "}
              <ArrowUpRight size={14} />
            </a>
          </div>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </section>
    );
  return (
    <section className="subpage admin-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {arena.online
              ? tx("ÇEVRİMİÇİ YÖNETİM", "ONLINE ADMIN")
              : tx(
                  "YEREL PROVA · GERÇEK STEAM DOĞRULAMASI DEĞİL",
                  "LOCAL PREVIEW · NOT REAL STEAM VERIFICATION",
                )}
          </span>
          <h1>
            {tx("Kontrol sende", "You’re in control")}<span className="heading-dot">.</span>
          </h1>
          <p>
            {tx(
              "Takımları hazırla. Eşleşmeleri ve maçları yönet.",
              "Prepare teams. Manage matchups and matches.",
            )}
          </p>
        </div>
        <button className="button-text" onClick={() => void arena.logout()}>
          <LogOut size={15} /> {tx("Çıkış", "Sign out")}
        </button>
      </div>
      <AdminReadiness />
      <div className="admin-toolbar">
        <div className="admin-tabs">
          {[
            {
              id: "teams",
              label: tx("Takımlar & Oyuncular", "Teams & Players"),
              icon: <Users size={15} />,
            },
            {
              id: "steam",
              label: tx("Steam kayıtları", "Steam registrations"),
              icon: <ContactRound size={15} />,
            },
            {
              id: "matches",
              label: tx("Maç yönetimi", "Match management"),
              icon: <Swords size={15} />,
            },
            {
              id: "operations",
              label: tx("Sistem & Yedek", "System & Backup"),
              icon: <Shield size={15} />,
            },
            {
              id: "settings",
              label: tx("Turnuva & API", "Tournament & API"),
              icon: <Radio size={15} />,
            },
          ].map((t) => (
            <button
              className={tab === t.id ? "active" : ""}
              key={t.id}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <span className="save-state">
          {dirty
            ? tx("Kaydedilmemiş değişiklikler", "Unsaved changes")
            : tx("Tüm değişiklikler kaydedildi", "All changes saved")}
        </span>
      </div>
      {dirty && (
        <div className="draft-indicator">
          {tx("Kaydedilmemiş değişiklikler var.", "There are unsaved changes.")}
          {baseRevision !== arena.snapshot.revision &&
            tx(
              " Sunucuda da bir değişiklik var; kaydetmeden önce taslağı yeniden yükle.",
              " Another change occurred on the server; reload the draft before saving.",
            )}
          <button
            onClick={() => {
              setDraft(structuredClone(arena.snapshot.config));
              setBaseRevision(arena.snapshot.revision);
              setDirty(false);
            }}
          >
            {tx("Kaydı yeniden yükle", "Reload saved state")}
          </button>
        </div>
      )}
      {notice && (
        <p className="save-notice" role="status">
          <Check size={15} />
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {confirm && (
        <div className="change-confirm" role="alert">
          <h2>{tx("Bu işlem için onay gerekli", "Confirmation required")}</h2>
          <p>{confirm.message}</p>
          <button
            className="button-primary"
            disabled={busy}
            onClick={() => void action(confirm.data)}
          >
            {tx("Onayla ve uygula", "Confirm and apply")} <Check size={14} />
          </button>
          <button className="button-text" onClick={() => setConfirm(null)}>
            {tx("Vazgeç", "Cancel")}
          </button>
        </div>
      )}
      {tab === "steam" && (arena.snapshot.me?.role === "admin" ? (
        <SteamAccountsPanel teams={arena.snapshot.config.teams} onOpenTeam={(id) => {
          setTeamId(id);
          setTab("teams");
        }} />
      ) : (
        <p>
          {tx(
            "Steam kayıtları çevrimiçi yönetimde görünür.",
            "Steam registrations are available in online admin mode.",
          )}
        </p>
      ))}
      {tab === "teams" && (
        <div className="admin-workspace">
          <aside className="admin-team-list">
            <h2>
              {tx("Takımlar", "Teams")} <span>{draft.teams.length}/8</span>
            </h2>
            {[...draft.teams]
              .sort((a, b) => a.seed - b.seed)
              .map((t) => (
                <button
                  className={team?.id === t.id ? "active" : ""}
                  key={t.id}
                  onClick={() => setTeamId(t.id)}
                >
                  <span style={{ color: t.color }}>#{t.seed}</span>
                  <strong>{t.name}</strong>
                  <small>{t.roster.length}/5</small>
                </button>
              ))}
            <button
              disabled={draft.teams.length === 8}
              className="add-team"
              onClick={() => {
                const id = "team-" + crypto.randomUUID().slice(0, 8),
                  seed = Array.from({ length: 8 }, (_, i) => i + 1).find(
                    (n) => !draft.teams.some((t) => t.seed === n),
                  )!;
                edit((next) =>
                  next.teams.push({
                    id,
                    name: "YENİ TAKIM",
                    tag: "YENİ",
                    seed,
                    color: "#c5aa8f",
                    players: [],
                    roster: [],
                    captainId: "",
                  }),
                );
                setTeamId(id);
              }}
            >
              <Plus size={15} /> {tx("Takım ekle", "Add team")}
            </button>
          </aside>
          <div className="admin-team-editor">
            {team ? (
              <>
                <div className="admin-card-heading">
                  <div>
                    <span className="eyebrow">{tx("TAKIM", "TEAM")} / {team.id}</span>
                    <h2>{team.name}</h2>
                  </div>
                  <button
                    className="button-text danger-text"
                    onClick={() =>
                      edit((next) => {
                        next.teams = next.teams.filter((t) => t.id !== team.id);
                      })
                    }
                  >
                    <Trash2 size={14} /> {tx("Takımı sil", "Delete team")}
                  </button>
                </div>
                <TeamLogoEditor
                  key={team.id}
                  logo={team.logo}
                  onChange={(logo) =>
                    editTeam((t) => {
                      t.logo = logo;
                    })
                  }
                />
                <div className="admin-fields">
                  <label>
                    {tx("Takım adı", "Team name")}
                    <input
                      value={team.name}
                      onChange={(e) =>
                        editTeam((t) => {
                          t.name = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    {tx("Kısa ad", "Short tag")}
                    <input
                      maxLength={5}
                      value={team.tag}
                      onChange={(e) =>
                        editTeam((t) => {
                          t.tag = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    {tx("Seri başı", "Seed")}
                    <select
                      value={team.seed}
                      onChange={(e) =>
                        edit((next) => {
                          next.teams = assignOpeningTeam(
                            next.teams,
                            team.id,
                            Number(e.target.value),
                          );
                        })
                      }
                    >
                      {Array.from({ length: 8 }, (_, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tx("Takım rengi", "Team color")}
                    <input
                      type="color"
                      value={team.color}
                      onChange={(e) =>
                        editTeam((t) => {
                          t.color = e.target.value;
                        })
                      }
                    />
                  </label>
                </div>
                <div className="roster-editor-heading">
                  <h3>{tx("Oyuncular", "Players")}</h3>
                  <span>
                    {tx(
                      "Kısa takım adı oyun içi adın başına eklenir. Steam adı alınamadığında kadro adı kullanılır.",
                      "The short team tag is prefixed to the in-game name. Roster name is used if the Steam name is unavailable.",
                    )}
                  </span>
                </div>
                <div className="admin-player-rows">
                  {team.roster.map((p, i) => {
                    const steam = arena.snapshot.verified.find(
                      (v) => v.steam_id === p.steamId,
                    );
                    return (
                      <div className="admin-player-row" key={p.id}>
                        <span className="admin-player-index">0{i + 1}</span>
                        <div className="roster-name-fields">
                          <label>
                            {tx("Kadroda görünen ad", "Roster display name")}
                            <input
                              aria-label={tx(`${i + 1}. oyuncu görünen isim`, `Player ${i + 1} display name`)}
                              value={p.name}
                              onChange={(e) => editTeam((t) => {
                                t.roster[i].name = e.target.value;
                              })}
                            />
                          </label>
                          <label className="steam-name-option">
                            <input
                              type="checkbox"
                              aria-label={tx(`${i + 1}. oyuncu oyun içinde Steam adını kullan`, `Player ${i + 1} use Steam name in-game`)}
                              checked={p.useSteamName === true}
                              onChange={(e) => editTeam((t) => {
                                t.roster[i].useSteamName = e.target.checked;
                              })}
                            />
                            {tx("Oyun içinde Steam adını kullan", "Use Steam name in-game")}
                          </label>
                        </div>
                        <div className="roster-steam-fields">
                          <div className={steam ? "steam-proof verified" : "steam-proof"}>
                            <Shield size={14} />
                            <span>
                              {steam
                                ? tx("Steam doğrulandı", "Steam verified")
                                : p.steamId
                                  ? tx("Doğrulanmadı", "Not verified")
                                  : tx("Steam hesabı seçilmedi", "No Steam account selected")}
                            </span>
                            {steam?.game_name && (
                              <small title={steam.game_name}>
                                {tx("Son oyun içi ad:", "Last in-game name:")} {steam.game_name}
                              </small>
                            )}
                          </div>
                          {(!arena.online || manualPlayerId === p.id) && (
                            <label>
                              SteamID64
                              <input
                                aria-label={tx(`${i + 1}. oyuncu SteamID64`, `Player ${i + 1} SteamID64`)}
                                placeholder="7656119…"
                                inputMode="numeric"
                                value={p.steamId || ""}
                                onChange={(e) => editTeam((t) => {
                                  t.roster[i].steamId = e.target.value.trim() || null;
                                })}
                              />
                            </label>
                          )}
                        </div>
                        <div className="roster-row-actions">
                          {arena.online && (
                            <button
                              type="button"
                              className="button-text"
                              aria-label={tx(`${p.name} · Oyuncuyu değiştir`, `${p.name} · Replace player`)}
                              onClick={() => setRosterPicker({ replaceId: p.id })}
                            >
                              <ArrowRightLeft size={15} />{" "}
                              {p.steamId
                                ? tx("Değiştir", "Replace")
                                : tx("Oyuncu seç", "Select player")}
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={tx(`${i + 1}. oyuncuyu kaldır`, `Remove player ${i + 1}`)}
                            className="button-text danger-text"
                            onClick={() => editTeam((t) => {
                              t.roster = t.roster.filter((r) => r.id !== p.id);
                              if (t.captainId === p.id) t.captainId = t.roster[0]?.id || "";
                            })}
                          >
                            <Trash2 size={15} /> {tx("Kadrodan çıkar", "Remove from roster")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="roster-editor-bottom">
                  <button
                    className={arena.online ? "button-primary" : "button-text"}
                    disabled={team.roster.length >= 5}
                    onClick={() => arena.online ? setRosterPicker({}) : addManualPlayer()}
                  >
                    <Plus size={15} /> {tx("Oyuncu ekle", "Add player")}
                  </button>
                  <label>
                    {tx("Kaptan", "Captain")}
                    <select
                      aria-label={tx("Kaptan", "Captain")}
                      value={team.captainId}
                      onChange={(e) =>
                        editTeam((t) => {
                          t.captainId = e.target.value;
                        })
                      }
                    >
                      {!team.roster.length && (
                        <option value="">{tx("Önce oyuncu ekle", "Add a player first")}</option>
                      )}
                      {team.roster.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="admin-help">
                  {tx(
                    "Kadro ve kaptan düzenlemesi gelecek maçlara uygulanır. Takım ekleme/silme ve seri başı değişikliği turnuvayı sıfırlama onayı ister.",
                    "Roster and captain edits apply to upcoming matches. Adding/removing teams or changing seeds requires confirmation to reset the tournament.",
                  )}
                </p>
              </>
            ) : (
              <div className="empty-state">{tx("İlk takımını ekle.", "Add your first team.")}</div>
            )}
          </div>
        </div>
      )}
      {tab === "matches" && (
        <OpeningMatchesEditor
          teams={draft.teams}
          disabled={busy}
          onChange={(teams) =>
            edit((next) => {
              next.teams = teams;
            })
          }
          hasActivity={
            !!(
              Object.keys(arena.snapshot.state.results).length ||
              arena.snapshot.vetos.length ||
              arena.snapshot.readies.length ||
              Object.keys(arena.snapshot.runtimes || {}).length
            )
          }
          changed={arena.snapshot.config.teams.some(
            (t) =>
              draft.teams.find((next) => next.id === t.id)?.seed !== t.seed,
          )}
        />
      )}
      {tab === "matches" && (
        <div className="admin-workspace matches-admin">
          <aside className="admin-team-list">
            <h2>{tx("Maç seç", "Select match")}</h2>
            {view.matches.map((m) => (
              <button
                className={match.id === m.id ? "active" : ""}
                key={m.id}
                onClick={() => setMatchId(m.id)}
              >
                <span>{m.id}</span>
                <strong>{roundLabel(m.round)}</strong>
                <small>{m.status === "completed" ? tx("Bitti", "Done") : m.format}</small>
              </button>
            ))}
          </aside>
          <div className="admin-match-editor">
            <MatchChecklist match={match} dirty={dirty} />
            <div className="match-workflow-tabs" role="tablist" aria-label={tx("Seçili maç işlemleri", "Selected match actions")} onKeyDown={(event) => {
              const ids = ["schedule", "veto", "score", "server"];
              const index = ids.indexOf(matchTab);
              const next = event.key === "ArrowRight" ? (index + 1) % ids.length : event.key === "ArrowLeft" ? (index + ids.length - 1) % ids.length : event.key === "Home" ? 0 : event.key === "End" ? ids.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault();
              setMatchTab(ids[next]);
              document.getElementById(`match-tab-${ids[next]}`)?.focus();
            }}>
              {[
                ["schedule", tx("Ayarlar", "Settings")],
                ["veto", tx("Veto", "Veto")],
                ["score", tx("Skor", "Score")],
                ["server", tx("Sunucu", "Server")],
              ].map(([id, label]) => (
                <button key={id} id={`match-tab-${id}`} role="tab" tabIndex={matchTab === id ? 0 : -1} aria-selected={matchTab === id} aria-controls={`match-panel-${id}`} onClick={() => setMatchTab(id)}>{label}</button>
              ))}
            </div>
            <div role="tabpanel" id="match-panel-veto" aria-labelledby="match-tab-veto" hidden={matchTab !== "veto"}>
            <div className="admin-match-tools">
              <a className="button-primary" href={`#veto/${match.id}`}>
                {tx("Tam sayfa veto", "Full-screen veto")} <ArrowUpRight size={15} />
              </a>
              <button
                className="button-text"
                disabled={
                  busy ||
                  !arena.snapshot.config.rehearsal ||
                  match.status !== "upcoming" ||
                  !match.a ||
                  !match.b
                }
                onClick={async () => {
                  await action({ action: "rehearse", matchId: match.id });
                }}
              >
                {tx("Prova vetosunu aç", "Open rehearsal veto")}
              </button>
              <button
                className="button-primary"
                disabled={
                  busy ||
                  dirty ||
                  !arena.online ||
                  !!veto ||
                  match.status !== "upcoming" ||
                  !match.a ||
                  !match.b
                }
                onClick={() =>
                  setConfirm({
                    message: tx(
                      "Hazır kontrolünü atlayarak gerçek vetoyu başlat. İki takımda eşit sayıda, 1–5 oyuncu olmalı ve her oyuncunun SteamID64 kaydı olmalı. Veto tamamlanınca maçı sunucuya yükleyebilirsin.",
                      "Skip ready checks and start a real veto. Both teams must have an equal number of 1–5 players, each with a SteamID64. Once veto finishes, you can load the match on the server.",
                    ),
                    data: {
                      action: "force-veto",
                      matchId: match.id,
                      confirm: true,
                    },
                  })
                }
              >
                {tx("Gerçek vetoyu zorla başlat", "Force-start real veto")}
              </button>
              <button
                className="button-text danger-text"
                onClick={() =>
                  setConfirm({
                    message: tx(
                      "Bu maçın vetosu ve hazır durumları temizlenecek.",
                      "This match’s veto and ready statuses will be cleared.",
                    ),
                    data: { action: "reset-veto", matchId: match.id },
                  })
                }
              >
                {tx("Vetoyu sıfırla", "Reset veto")}
              </button>
            </div>
            {veto && (
              <p className="admin-help">
                {vetoDone(veto)
                  ? tx(
                      `Veto tamamlandı: ${vetoMaps(veto).join(" / ")}`,
                      `Veto completed: ${vetoMaps(veto).join(" / ")}`,
                    )
                  : tx(
                      `Veto sürüyor · ${veto.actions.length}/7`,
                      `Veto in progress · ${veto.actions.length}/7`,
                    )}
                {veto.rehearsal ? tx(" · PROVA", " · REHEARSAL") : ""}
              </p>
            )}
            </div>
            <div role="tabpanel" id="match-panel-schedule" aria-labelledby="match-tab-schedule" hidden={matchTab !== "schedule"}>
            <div className="admin-match-settings admin-fields">
              <MatchSettingsEditor
                value={draft.schedule[match.id]}
                onChange={(value) =>
                  edit((next) => {
                    next.schedule[match.id] = value;
                  })
                }
              />
              <label>
                {tx("MatchZy maç ID", "MatchZy match ID")}
                <input
                  inputMode="numeric"
                  value={draft.schedule[match.id].externalId}
                  onChange={(e) =>
                    edit((next) => {
                      next.schedule[match.id].externalId = e.target.value;
                    })
                  }
                />
              </label>
            </div>
            {!validMatchId(draft.schedule[match.id].externalId) && (
              <p className="form-error">
                {tx(
                  "Bu eski maç ID’si güncel MatchZy sınırını aşıyor.",
                  "This legacy match ID exceeds the current MatchZy limit.",
                )}
                <button
                  className="button-text"
                  disabled={match.status !== "upcoming"}
                  onClick={() =>
                    edit((next) => {
                      next.schedule[match.id].externalId = newMatchId(
                        Object.values(next.schedule).map((s) => s.externalId),
                      );
                    })
                  }
                >
                  {tx("Uyumlu ID oluştur", "Generate compatible ID")}
                </button>
              </p>
            )}
            <p className="admin-help">
              {tx(
                "Maç ayarları sabit kaydet çubuğuyla yayınlanır. Canlı maç ve kadro işlemleri kaydedilmiş veriyi kullanır.",
                "Match settings are published with the sticky save bar. Live match and roster operations use saved data.",
              )}
            </p>
            </div>
            <div role="tabpanel" id="match-panel-score" aria-labelledby="match-tab-score" hidden={matchTab !== "score"}>
            <ScoreEditor
              key={`${match.id}:${JSON.stringify(arena.snapshot.state.results[match.id] || null)}`}
              match={match}
              stateOverride={arena.snapshot.state}
              onChange={(transition) =>
                void action({
                  action: "result",
                  matchId: match.id,
                  revision: arena.snapshot.revision,
                  result: transition.state.results[match.id] || null,
                })
              }
            />
            <div className="admin-match-tools">
              <button
                className="button-text"
                onClick={() =>
                  void action({
                    action: "follow-api",
                    matchId: match.id,
                    revision: arena.snapshot.revision,
                  })
                }
              >
                {tx("Manuel sonucu kaldır, API’ye dön", "Clear manual result, follow API")} <RotateCcw size={14} />
              </button>
              {arena.online && veto && vetoDone(veto) && !veto.rehearsal && (
                <a
                  className="button-text"
                  href={`/api/match-config?match=${match.id}`}
                >
                  <Download size={14} /> {tx("MatchZy maç dosyası", "MatchZy match config")}
                </a>
              )}
            </div>
            </div>
            <div role="tabpanel" id="match-panel-server" aria-labelledby="match-tab-server" hidden={matchTab !== "server"}>
            <MatchStage match={match} />
            <MatchOperations key={match.id} match={match} disabled={dirty} />
            </div>
          </div>
        </div>
      )}
      {tab === "operations" && <OperationsPanel />}
      {tab === "settings" && (
        <div className="admin-settings-grid">
          <div className="admin-settings-card">
            <h2>{tx("Site görünümü", "Site appearance")}</h2>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={draft.presentation?.minimal || false}
                onChange={(e) => edit((next) => {
                  next.presentation = {
                    minimal: e.target.checked,
                    activeMatchId: next.presentation?.activeMatchId || null,
                  };
                })}
              />
              {tx("Minimal görünüm", "Minimal view")}
            </label>
            <p>
              {tx(
                "Minimal görünümde turnuva ağacı ve seçtiğin aktif maç öne çıkar. Aktif maç seçmezsen yalnızca braketler gösterilir.",
                "Minimal view highlights the tournament bracket and your selected active match. If no active match is selected, only the bracket is shown.",
              )}
            </p>
            <label>
              {tx("Ana sayfadaki aktif maç", "Active match on homepage")}
              <select
                value={activeMatchId}
                onChange={(e) => edit((next) => {
                  next.presentation = {
                    minimal: next.presentation?.minimal || false,
                    activeMatchId: e.target.value || null,
                  };
                })}
              >
                {activeMatchId && !activeMatchAvailable && (
                  <option value={activeMatchId} disabled>
                    {activeMatchId} · {tx("Artık gösterilemiyor", "No longer available")}
                  </option>
                )}
                <option value="">
                  {tx("Aktif maç yok · Yalnızca braketler", "No active match · Bracket only")}
                </option>
                {activeMatchOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} · {arena.snapshot.config.teams.find((t) => t.id === item.a)?.name} — {arena.snapshot.config.teams.find((t) => t.id === item.b)?.name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {tx(
                "Aynı anda yalnızca bir maç seçilebilir. Bu ayar oyunu başlatmaz ve maç sonucunu değiştirmez. Takımları belli olmayan veya tamamlanan maçlar ana sayfada aktif gösterilmez.",
                "Only one match can be selected at a time. This setting does not start the game or alter match results. Matches without assigned teams or completed matches are not shown as active.",
              )}
            </p>
            {activeMatchId && !activeMatchAvailable && (
              <p>
                {tx(
                  "Önceki aktif maç artık gösterilemiyor. Yeni bir maç seçebilir veya aktif maç seçimini temizleyebilirsin.",
                  "The previous active match can no longer be displayed. You can choose a new match or clear the active match selection.",
                )}
              </p>
            )}
          </div>
          <div className="admin-settings-card">
            <h2>{tx("Turnuva ayarları", "Tournament settings")}</h2>
            <label className="field-label">
              {tx("Turnuva adı", "Tournament title")}
              <input
                value={draft.title}
                onChange={(e) =>
                  edit((next) => {
                    next.title = e.target.value;
                  })
                }
              />
            </label>
            <label>
              {tx("Organizatör / yetkili adı", "Organizer / contact name")}
              <input
                maxLength={80}
                value={draft.organizer?.name || ""}
                onChange={(e) => edit((next) => {
                  next.organizer = { name: e.target.value, contact: next.organizer?.contact || "" };
                })}
              />
            </label>
            <label>
              {tx("Organizatöre ulaşma yolu", "Organizer contact method")}
              <input
                maxLength={240}
                placeholder={tx(
                  "Örn. okulda başvurulacak kişi, e-posta veya Discord iletişimi",
                  "e.g. campus contact, email, or Discord handle",
                )}
                value={draft.organizer?.contact || ""}
                onChange={(e) => edit((next) => {
                  next.organizer = { name: next.organizer?.name || "", contact: e.target.value };
                })}
              />
            </label>
            <p>
              {tx(
                "Bu bilgiler kurallar sayfasında herkese gösterilir. Turnuva soruları ve itirazlar için gerçek bir iletişim yolu belirt.",
                "This information is shown publicly on the rules page. Provide a real contact method for tournament questions and disputes.",
              )}
            </p>
            <label>
              {tx("Sunucu bağlantı adresi (IP:port)", "Server connection address (IP:port)")}
              <input
                placeholder={tx(
                  "Örn. sunucu.dathost.net:27015",
                  "e.g. server.dathost.net:27015",
                )}
                value={draft.server?.address || ""}
                onChange={(e) =>
                  edit((next) => {
                    next.server = {
                      address: e.target.value,
                      dathostServerId: next.server?.dathostServerId || "",
                    };
                  })
                }
              />
            </label>
            <label>
              {tx("DatHost sunucu ID", "DatHost server ID")}
              <input
                placeholder={tx("24 karakterlik sunucu kimliği", "24-character server ID")}
                value={draft.server?.dathostServerId || ""}
                onChange={(e) =>
                  edit((next) => {
                    next.server = {
                      address: next.server?.address || "",
                      dathostServerId: e.target.value,
                    };
                  })
                }
              />
            </label>
            <p>
              {tx(
                "DatHost e-posta ve parolanı buraya yazma. Cloudflare Secrets bölümünde DATHOST_EMAIL ve DATHOST_PASSWORD olarak kaydet. Sistem & Yedek sekmesinden gerçek API bağlantısını test edebilirsin.",
                "Do not enter your DatHost email or password here. Save them as DATHOST_EMAIL and DATHOST_PASSWORD in Cloudflare Secrets. You can test the live API connection from the System & Backup tab.",
              )}
            </p>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={draft.rehearsal}
                onChange={(e) =>
                  edit((next) => {
                    next.rehearsal = e.target.checked;
                  })
                }
              />{" "}
              {tx("Admin prova işlemleri açık", "Admin rehearsal tools enabled")}
            </label>
            <p>
              {tx(
                "Prova vetosu Steam doğrulaması yapılmış gibi gösterilmez ve gerçek sunucu maç dosyası üretmez.",
                "Rehearsal vetoes do not mimic Steam verification and do not produce real server match configs.",
              )}
            </p>
            <button className="button-text" onClick={exportDraft}>
              <Download size={15} /> {tx("Yönetim taslağını indir", "Download admin draft")}
            </button>
            <button
              className="button-text danger-text"
              onClick={() =>
                setConfirm({
                  message: tx(
                    "Tüm sonuçlar, hazır durumları ve vetolar sıfırlanır. Takımlar, oyuncular ve takvim korunur. Eski webhook maç kimlikleri yenilenir.",
                    "All results, ready statuses, and vetoes will be reset. Teams, players, and schedule are preserved. Old webhook match IDs will be rotated.",
                  ),
                  data: {
                    action: "config",
                    config: { ...draft, state: emptyState() },
                    revision: baseRevision,
                    resetTournament: true,
                  },
                })
              }
            >
              {tx("Turnuvayı sıfırla", "Reset tournament")} <RotateCcw size={15} />
            </button>
          </div>
          <div className="admin-settings-card">
            <h2>{tx("Bağlantı kontrolü", "Connection overview")}</h2>
            <dl>
              <div>
                <dt>{tx("Yönetim veritabanı", "Admin database")}</dt>
                <dd>{arena.online ? tx("Bağlı", "Connected") : tx("Yerel prova", "Local preview")}</dd>
              </div>
              <div>
                <dt>Steam OpenID</dt>
                <dd>
                  {arena.online && arena.snapshot.steamConfigured
                    ? tx("Yapılandırıldı", "Configured")
                    : tx("Kurulum bekleniyor", "Awaiting setup")}
                </dd>
              </div>
              <div>
                <dt>{tx("Doğrulanan hesap", "Verified accounts")}</dt>
                <dd>{arena.snapshot.verified.length}</dd>
              </div>
              <div>
                <dt>{tx("Aktif veto", "Active vetoes")}</dt>
                <dd>
                  {arena.snapshot.vetos.filter((v) => !vetoDone(v)).length}
                </dd>
              </div>
            </dl>
            <p>
              {tx(
                "MatchZy maç dosyası, sitedeki isimleri SteamID64 anahtarlarıyla sunucuya verir. MatchZy bu isimleri oyunda zorlar. Canlı maç sırasında ad değiştirirsen yeniden maç yapılandırması yüklenene kadar oyun adı farklı kalabilir.",
                "The MatchZy config sends site player names keyed by SteamID64 to the server. MatchZy enforces these names in-game. If you edit a name during a live match, the in-game name may stay unchanged until the match config is reloaded.",
              )}
            </p>
            <a
              className="button-text"
              href="https://github.com/kindomyy/cs2-tournanmentmanager/blob/main/docs/ADMIN.md"
              target="_blank"
              rel="noreferrer"
            >
              {tx("Admin ve Steam kurulum rehberi", "Admin and Steam setup guide")} <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      )}
      {tab === "teams" && team && rosterPicker && (
        <RosterAccountPicker
          teams={draft.teams}
          team={team}
          replaceId={rosterPicker.replaceId}
          onSelect={selectRosterAccount}
          onManual={() => {
            if (rosterPicker.replaceId) setManualPlayerId(rosterPicker.replaceId);
            else addManualPlayer();
            setRosterPicker(null);
          }}
          onClose={() => setRosterPicker(null)}
        />
      )}
      <div className={`admin-save-bar${dirty ? " is-dirty" : ""}`}>
        <span aria-live="polite">
          {dirty
            ? tx("Değişikliklerin henüz yayınlanmadı.", "Your changes are not published yet.")
            : tx("Kayıt güncel.", "Saved state is up to date.")}
        </span>
        <button className="button-primary" disabled={busy || !dirty} onClick={save}>
          <Save size={15} /> {busy ? tx("Kaydediliyor…", "Saving…") : tx("Değişiklikleri kaydet", "Save changes")}
        </button>
      </div>
    </section>
  );
}
