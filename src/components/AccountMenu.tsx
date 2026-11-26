import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, LogOut, Settings, ShieldCheck, UserRound, X } from "lucide-react";
import { useArena } from "../arena/ArenaContext";
import { accessFor } from "../arena/permissions";
import { steamLoginURL } from "../arena/schedule";
import { useI18n } from "../i18n";
import "../account.css";

/** An unavailable Steam image stays an honest account icon. */
export function AccountAvatar({ src, name, admin = false }: { src?: string | null; name: string; admin?: boolean }) {
  const { tx } = useI18n();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className={`account-avatar${admin ? " is-admin" : ""}`}>
      {src && !failed && !admin
        ? <img src={src} alt={tx(`${name} Steam profil fotoğrafı`, `${name} Steam profile avatar`)} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : admin ? <ShieldCheck size={20} aria-hidden="true" /> : <UserRound size={20} aria-hidden="true" />}
    </span>
  );
}

export function AccountMenu() {
  const { tx, errText } = useI18n();
  const arena = useArena();
  const me = arena.snapshot.me;
  const admin = me?.role === "admin";
  const mayManage = admin || (!arena.online && arena.previewAdmin);
  const access = accessFor(arena.snapshot.config, me);
  const ownPlayer = me?.role === "player"
    ? [...arena.snapshot.config.teams, ...Object.values(arena.snapshot.runtimes || {}).flatMap((r) => r.teams || [])]
      .flatMap((team) => team.roster).find((player) => player.steamId === me.steamId)
    : undefined;
  const name = admin ? tx("Site admini", "Site admin") : me?.role === "player"
    ? me.displayName || me.profile?.name || ownPlayer?.name || `${tx("Steam kullanıcısı", "Steam user")} ${me.steamId || ""}`.trim()
    : tx("Misafir", "Guest");
  const role = admin ? tx("Yönetici oturumu", "Admin session") : access.role === "captain" ? tx("Takım kaptanı", "Team captain")
    : me?.role === "player" ? tx("Steam ile bağlı", "Connected via Steam") : tx("Giriş yapılmadı", "Not signed in");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const navigate = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("hashchange", navigate);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("hashchange", navigate);
    };
  }, [open]);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await arena.logout();
      close(true);
    } catch (e) {
      setError(e instanceof Error ? errText(e.message) : tx("Oturum kapatılamadı. Tekrar dene.", "Could not sign out. Try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-menu" ref={container} onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close();
    }}>
      <button
        type="button" className={`account-trigger${open ? " is-open" : ""}`} ref={trigger}
        aria-label={tx(`Hesap menüsünü ${open ? "kapat" : "aç"}: ${name}`, `${open ? "Close" : "Open"} account menu: ${name}`)}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={() => { setError(""); setOpen((current) => !current); }}
      >
        <AccountAvatar src={me?.role === "player" ? me.profile?.avatar : null} name={name} admin={admin} />
        <span className="account-trigger-name">{name}</span>
        <ChevronDown className="account-chevron" size={14} aria-hidden="true" />
      </button>
      {open && <div className="account-popover" id={panelId} ref={panel} role="dialog" aria-label={tx("Hesap menüsü", "Account menu")}>
        <div className="account-popover-heading">
          <div><strong>{name}</strong><span>{role}</span></div>
          <button type="button" className="account-close" onClick={() => close(true)} aria-label={tx("Hesap menüsünü kapat", "Close account menu")}><X size={18} /></button>
        </div>
        <a className="account-menu-item" href="#hesap" onClick={() => close()}><Settings size={17} />{tx("Hesap ayarları", "Account settings")}<ArrowUpRight size={15} /></a>
        {me?.role === "player" && <a className="account-menu-item" href="#oyuncu" onClick={() => close()}><UserRound size={17} />{tx("Oyuncu merkezi", "Player hub")}<ArrowUpRight size={15} /></a>}
        {mayManage && <a className="account-menu-item" href="#admin" onClick={() => close()}><ShieldCheck size={17} />{tx("Yönetim paneli", "Admin panel")}<ArrowUpRight size={15} /></a>}
        {!me && (arena.online && arena.snapshot.steamConfigured
          ? <a className="account-menu-item account-menu-login" href={steamLoginURL(location.pathname + location.hash)}><UserRound size={17} />{tx("Steam ile giriş yap", "Sign in with Steam")}<ArrowUpRight size={15} /></a>
          : <p className="account-menu-note">{tx("Steam girişi şu anda kullanılamıyor.", "Steam sign-in is currently unavailable.")}</p>)}
        {(me || arena.previewAdmin) && <button type="button" className="account-menu-item account-menu-logout" disabled={busy} onClick={() => void logout()}><LogOut size={17} />{busy ? tx("Çıkış yapılıyor…", "Signing out…") : me ? tx("Çıkış yap", "Sign out") : tx("Yerel provadan çık", "Exit local rehearsal")}</button>}
        {error && <p className="account-menu-error" role="alert">{error}</p>}
      </div>}
    </div>
  );
}
