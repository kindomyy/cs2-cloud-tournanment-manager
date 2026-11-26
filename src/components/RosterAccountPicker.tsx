import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Plus, X } from "lucide-react";
import { useSteamRegistrations } from "../arena/useSteamRegistrations";
import type { ManagedTeam, SteamRegistration } from "../arena/model";
import { useI18n } from "../i18n";

export function RosterAccountPicker({ teams, team, replaceId, onSelect, onManual, onClose }: {
  teams: ManagedTeam[];
  team: ManagedTeam;
  replaceId?: string;
  onSelect: (account: SteamRegistration) => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const { lang, tx, errText } = useI18n();
  const { accounts, loading, error, reload } = useSteamRegistrations();
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    searchInput.current?.focus();
    return () => element?.close();
  }, []);

  const assignments = new Map(teams.flatMap((item) => item.roster.flatMap((player) =>
    player.steamId ? [[player.steamId, { team: item, player }] as const] : [],
  )));
  const replaced = team.roster.find((player) => player.id === replaceId);
  const search = query.trim().toLocaleLowerCase(lang);
  const filtered = accounts?.flatMap((account) => {
    const assignment = assignments.get(account.steam_id);
    const fields = [
      account.displayName, account.profile?.name, account.game_name, account.steam_id,
      assignment?.player.name, assignment?.team.name,
    ];
    return fields.some((field) => field?.toLocaleLowerCase(lang).includes(search))
      ? [{ account, assignment }]
      : [];
  });

  return (
    <dialog
      className="detail-dialog roster-picker"
      ref={dialog}
      aria-labelledby="roster-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="admin-card-heading">
        <div>
          <h2 id="roster-picker-title">
            {replaced
              ? tx("Oyuncuyu değiştir", "Replace player")
              : tx("Kadroya oyuncu ekle", "Add player to roster")}
          </h2>
          <p>
            {team.name}
            {replaced && tx(` · ${replaced.name} yerine`, ` · replacing ${replaced.name}`)}
          </p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={tx("Oyuncu seçiciyi kapat", "Close player picker")}><X size={20} /></button>
      </div>
      <label className="field-label">
        {tx("Kayıtlı oyuncularda ara", "Search registered players")}
        <input ref={searchInput} type="search" placeholder={tx("Oyuncu, Steam adı veya takım", "Player, Steam name, or team")} value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {loading && <p role="status">{tx("Steam kayıtları yükleniyor…", "Loading Steam registrations…")}</p>}
      {error && <p role="alert" className="form-error">{errText(error)} <button type="button" className="button-text" onClick={reload}>{tx("Tekrar dene", "Try again")}</button></p>}
      {!loading && !error && (filtered?.length ? (
        <ul className="roster-picker-list" aria-label={tx("Kayıtlı oyuncular", "Registered players")}>
          {filtered.map(({ account, assignment }) => {
            const currentTeam = assignment?.team.id === team.id;
            const name = account.displayName || account.profile?.name || assignment?.player.name || tx(`Steam oyuncusu ${account.steam_id.slice(-6)}`, `Steam player ${account.steam_id.slice(-6)}`);
            const action = assignment
              ? tx(`${assignment.team.name} takımından taşı`, `Move from ${assignment.team.name}`)
              : replaced
                ? tx("Yerine al", "Replace with")
                : tx("Kadroya ekle", "Add to roster");
            return (
              <li key={account.steam_id}>
                <div>
                  <strong>{name}</strong>
                  {account.displayName && account.profile?.name && <small>{tx("Steam adı", "Steam name")} · {account.profile.name}</small>}
                  <small>{account.steam_id} · {assignment?.team.name || tx("Kadroda değil", "Unassigned")}</small>
                </div>
                {currentTeam ? <span className="roster-picker-assigned">{tx("Bu kadroda", "On this roster")}</span> : (
                  <button type="button" className="button-text" onClick={() => onSelect(account)} aria-label={`${name} · ${action}`}>
                    {assignment || replaced ? <ArrowRightLeft size={15} /> : <Plus size={15} />} {action}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p>{accounts?.length ? tx("Aramana uyan oyuncu yok.", "No players match your search.") : tx("Henüz kayıtlı Steam oyuncusu yok.", "No registered Steam players yet.")}</p>)}
      <div className="roster-picker-footer">
        <p>{tx("Steam ile giriş yapan oyuncular bu listede görünür.", "Players who sign in with Steam appear in this list.")}</p>
        <button type="button" className="button-text" onClick={onManual}>{tx("SteamID64’ü elle gir", "Enter SteamID64 manually")}</button>
      </div>
    </dialog>
  );
}
