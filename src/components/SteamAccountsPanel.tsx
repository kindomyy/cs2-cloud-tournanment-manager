import { useMemo, useState } from "react";
import { ArrowUpRight, Pencil, RefreshCw } from "lucide-react";
import { matchPlayerName, type ManagedTeam, type SteamRegistration } from "../arena/model";
import { useSteamRegistrations } from "../arena/useSteamRegistrations";
import { langHeaders, useI18n } from "../i18n";

export function SteamAccountsPanel({ teams, onOpenTeam }: {
  teams: ManagedTeam[];
  onOpenTeam: (teamId: string) => void;
}) {
  const { lang, locale, tx, errText } = useI18n();
  const verifiedDate = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Istanbul",
      }),
    [locale],
  );
  const { accounts, setAccounts, loading, error: loadError, reload } = useSteamRegistrations();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function updateAccount(steamId: string, data: Record<string, unknown>) {
    const response = await fetch("/api/arena", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...langHeaders() },
      body: JSON.stringify({ ...data, steamId }),
      signal: AbortSignal.timeout(10000),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(tx("Sunucu yanıtı okunamadı.", "Could not read server response."));
    }
    if (!response.ok)
      throw new Error(
        result.error || tx("Steam kaydı güncellenemedi.", "Could not update Steam registration."),
      );
    return result;
  }

  function patchAccount(steamId: string, data: Partial<SteamRegistration>) {
    setAccounts((previous) => previous?.map((account) =>
      account.steam_id === steamId ? { ...account, ...data } : account,
    ) ?? null);
  }

  async function refreshAccount(steamId: string) {
    setRefreshing(steamId);
    setError("");
    setNotice("");
    try {
      const data = await updateAccount(steamId, { action: "refresh-steam-account" });
      patchAccount(steamId, { profile: data.profile });
      setNotice(data.refreshed
        ? tx(
            `Steam profil adı güncellendi · ${data.profile.name}`,
            `Steam profile name updated · ${data.profile.name}`,
          )
        : tx(
            "Bu hesap yakın zamanda sorgulandı. Bir dakika sonra tekrar deneyebilirsin.",
            "This account was refreshed recently. You can try again in a minute.",
          ));
    } catch (err) {
      setError(
        err instanceof Error
          ? errText(err.message)
          : tx("Steam profil adı yenilenemedi.", "Could not refresh Steam profile name."),
      );
    } finally {
      setRefreshing(null);
    }
  }

  async function saveName(steamId: string, name: string | null) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await updateAccount(steamId, { action: "set-steam-display-name", displayName: name });
      patchAccount(steamId, { displayName: data.displayName || undefined });
      setEditing(null);
      setNotice(
        data.displayName
          ? tx(
              `Site adı kaydedildi · ${data.displayName}`,
              `Site name saved · ${data.displayName}`,
            )
          : tx(
              "Site adı Steam profiline döndürüldü.",
              "Site name reverted to Steam profile.",
            ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? errText(err.message)
          : tx("Site adı kaydedilemedi.", "Could not save site name."),
      );
    } finally {
      setSaving(false);
    }
  }

  const assignments = new Map(teams.flatMap((team) => team.roster.flatMap((player) =>
    player.steamId ? [[player.steamId, { team, player }] as const] : [],
  )));
  const registrations = new Map(accounts?.map((account) => [account.steam_id, account]));
  const ids = [...new Set([...registrations.keys(), ...assignments.keys()])];
  const search = query.trim().toLocaleLowerCase(lang);
  const visible = ids.flatMap((id) => {
    const account = registrations.get(id);
    const assignment = assignments.get(id);
    const nextName = assignment && matchPlayerName(assignment.player, assignment.team.tag, account?.profile?.name);
    const fields = [id, account?.displayName, account?.profile?.name, account?.game_name, assignment?.player.name, assignment?.team.name, nextName];
    return id === editing?.id || fields.some((field) => field?.toLocaleLowerCase(lang).includes(search))
      ? [{ id, account, assignment, nextName }]
      : [];
  });

  return (
    <section className="admin-settings-card steam-registry" aria-labelledby="steam-registry-title">
      <div className="admin-card-heading">
        <h2 id="steam-registry-title">{tx("Steam kayıtları", "Steam registrations")}</h2>
        <button type="button" className="button-text" disabled={loading || refreshing !== null || saving} onClick={reload}>
          <RefreshCw size={15} /> {tx("Listeyi yeniden yükle", "Reload list")}
        </button>
      </div>
      <label className="field-label steam-registry-search">
        {tx("Steam kayıtlarında ara", "Search Steam registrations")}
        <input type="search" placeholder={tx("SteamID64, oyuncu adı veya takım", "SteamID64, player name, or team")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {notice && <p className="save-notice" role="status">{notice}</p>}
      {(error || loadError) && <p className="form-error" role="alert">{errText(error || loadError)}</p>}
      {loading && <p role="status">{tx("Steam kayıtları yükleniyor…", "Loading Steam registrations…")}</p>}
      {accounts && (visible.length ? (
        <div className="steam-registry-table" role="region" aria-label={tx("Steam hesap tablosu", "Steam accounts table")} tabIndex={0}>
          <table aria-label={tx("Steam hesapları", "Steam accounts")}>
            <thead>
              <tr>
                <th>{tx("Site ve Steam adı", "Site and Steam name")}</th>
                <th>{tx("Kadro", "Roster")}</th>
                <th>{tx("Son oyun içi ad", "Last in-game name")}</th>
                <th>{tx("Yeni maçta oyun içi ad", "Next match in-game name")}</th>
                <th>{tx("İşlemler", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ id, account, assignment, nextName }) => (
                <tr key={id}>
                  <td>
                    <strong>{account?.displayName || account?.profile?.name || tx("Profil adı alınmadı", "Profile name unavailable")}</strong>
                    {account?.displayName && <small>{tx("Steam adı", "Steam name")} · {account.profile?.name || tx("Profil adı alınmadı", "Profile name unavailable")}</small>}
                    <a href={`https://steamcommunity.com/profiles/${id}`} target="_blank" rel="noreferrer">
                      {id} <ArrowUpRight size={12} aria-hidden="true" />
                    </a>
                    <small>
                      {account
                        ? tx(
                            `Son doğrulama · ${verifiedDate.format(account.verified_at)}`,
                            `Last verified · ${verifiedDate.format(account.verified_at)}`,
                          )
                        : tx("Doğrulama bekliyor", "Awaiting verification")}
                    </small>
                    {editing?.id === id && (
                      <form className="steam-name-form" onSubmit={(event) => {
                        event.preventDefault();
                        void saveName(id, editing.name);
                      }}>
                        <label className="field-label">
                          {tx("Sitede görünen ad", "Site display name")}
                          <input autoFocus required maxLength={40} value={editing.name} onChange={(event) => setEditing({ id, name: event.target.value })} />
                        </label>
                        <small>{tx("Hesap menüsünde görünür. Kadro adını takım ekranından düzenleyebilirsin.", "Shown in the account menu. Roster names can be edited on the team screen.")}</small>
                        <button className="button-primary" disabled={saving || !editing.name.trim()}>{tx("Adı kaydet", "Save name")}</button>
                        {account?.displayName && <button type="button" className="button-text" disabled={saving} onClick={() => void saveName(id, null)}>{tx("Steam adına dön", "Revert to Steam name")}</button>}
                        <button type="button" className="button-text" disabled={saving} onClick={() => setEditing(null)}>{tx("Vazgeç", "Cancel")}</button>
                      </form>
                    )}
                  </td>
                  <td>{assignment ? (
                    <>
                      <strong>{assignment.player.name}</strong>
                      <button type="button" className="button-text" onClick={() => onOpenTeam(assignment.team.id)}>{assignment.team.name} <ArrowUpRight size={12} /></button>
                    </>
                  ) : tx("Kadroda değil", "Unassigned")}</td>
                  <td>{account?.game_name || "—"}</td>
                  <td>{nextName || "—"}</td>
                  <td>{account && (
                    <div className="steam-registry-actions">
                      <button type="button" className="button-text" disabled={loading || saving} onClick={() => {
                        setNotice("");
                        setError("");
                        setEditing({ id, name: account.displayName || account.profile?.name?.slice(0, 40) || "" });
                      }}>
                        <Pencil size={14} /> {tx("Site adını düzenle", "Edit site name")}
                      </button>
                      <button type="button" className="button-text" disabled={loading || refreshing !== null || saving} onClick={() => void refreshAccount(id)}>
                        <RefreshCw size={14} />{refreshing === id ? tx("Yenileniyor…", "Refreshing…") : tx("Profil adını yenile", "Refresh profile name")}
                      </button>
                    </div>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>{ids.length ? tx("Aramana uyan Steam kaydı yok.", "No Steam registrations match your search.") : tx("Henüz doğrulanmış veya kadroya atanmış Steam hesabı yok.", "No verified or roster-assigned Steam accounts yet.")}</p>)}
    </section>
  );
}
