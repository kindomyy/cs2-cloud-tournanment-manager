import { useEffect, useMemo, useState } from "react";
import { useArena } from "../arena/ArenaContext";
import { project } from "../tournament/engine";
import { langHeaders, useI18n } from "../i18n";

type Health = {
  dathostConfigured: boolean;
  lastDathostAttempt?: { at: string; ok: boolean } | null;
  lastWebhook?: { at: string } | null;
};

export function AdminReadiness() {
  const { snapshot, online } = useArena();
  const { tx, formatDateTime } = useI18n();
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);
  const [check, setCheck] = useState(0);
  useEffect(() => {
    const refresh = () => setCheck((value) => value + 1);
    window.addEventListener("arena-operations-changed", refresh);
    return () => window.removeEventListener("arena-operations-changed", refresh);
  }, []);
  useEffect(() => {
    if (!online || snapshot.me?.role !== "admin") return;
    const controller = new AbortController();
    setHealth(null);
    setFailed(false);
    void fetch("/api/operations", { cache: "no-store", headers: langHeaders(), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (!data.health) throw new Error();
        if (!controller.signal.aborted) setHealth(data.health);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [online, snapshot.me?.role, snapshot.revision, check]);
  const config = snapshot.config;
  const view = useMemo(
    () => project(snapshot.state, config.teams),
    [snapshot.state, config.teams],
  );
  const incomplete = config.teams.filter((t) => t.roster.length !== 5 ||
    t.roster.some((p) => !p.steamId) || !t.roster.some((p) => p.id === t.captainId));
  const unnamed = config.teams.filter((t) => /^yeni\s+takım(?:\s+\d+)?$/i.test(t.name.toLocaleLowerCase("tr")));
  const attempt = health?.lastDathostAttempt;
  const active = view.matches.some((m) => m.status !== "completed" &&
    ["live", "paused", "restoring"].includes(snapshot.runtimes?.[m.id]?.phase || ""));
  return (
    <section className="admin-readiness" aria-label={tx("Turnuva hazırlık durumu", "Tournament readiness")}>
      <h2>{view.champion ? tx("Turnuva tamamlandı", "Tournament completed") : active || view.matches.some((m) => m.status !== "upcoming") ? tx("Turnuva sürüyor", "Tournament in progress") : tx("Turnuva hazırlanıyor", "Tournament in preparation")}</h2>
      <dl>
        <div><dt>{tx("Otomatik veto için eksik kadrolar", "Incomplete rosters for auto-veto")}</dt><dd>{tx(`${incomplete.length}/${config.teams.length} takım · ${config.teams.reduce((n, t) => n + t.roster.length, 0)} kayıtlı oyuncu`, `${incomplete.length}/${config.teams.length} teams · ${config.teams.reduce((n, t) => n + t.roster.length, 0)} registered players`)}</dd></div>
        <div><dt>{tx("Takım yerleşimi", "Team placement")}</dt><dd>{tx(`${config.teams.length}/8 takım`, `${config.teams.length}/8 teams`)}{unnamed.length ? tx(` · ${unnamed.length} takımın adı belirlenmedi`, ` · ${unnamed.length} unnamed teams`) : ""}</dd></div>
        <div><dt>{tx("DatHost bağlantı testi", "DatHost connection test")}</dt><dd>{!online ? tx("Yerel prova; bağlantı doğrulanmaz", "Local preview; connection not verified") : failed ? tx("Durum alınamadı; Sistem & Yedek bölümünden kontrol et", "Could not fetch status; check in System & Backup") : !health ? tx("Test kaydı kontrol ediliyor", "Checking test log") : !health.dathostConfigured ? tx("Erişim ayarları eksik", "Access credentials missing") : !attempt ? tx("Beklenen bağlantı testi · Ayarlar girildi", "Connection test pending · Credentials configured") : `${attempt.ok ? tx("Son test başarılı", "Last test succeeded") : tx("Son test başarısız", "Last test failed")} · ${formatDateTime(attempt.at)}`}</dd></div>
        <div><dt>{tx("Doğrulanmış MatchZy olayı", "Verified MatchZy event")}</dt><dd>{health?.lastWebhook ? formatDateTime(health.lastWebhook.at) : failed ? tx("Durum doğrulanamadı", "Status could not be verified") : !online || health ? tx("Henüz alınmadı", "Not received yet") : tx("Olay kaydı kontrol ediliyor", "Checking event log")}</dd></div>
      </dl>
      <p>{tx("Kadro için Takımlar & Oyuncular; maç ayarları için Maç yönetimi; bağlantı testi için Sistem & Yedek bölümünü kullan. Testin başarılı olması, maçın sunucuda başladığı anlamına gelmez.", "Use Teams & Players for rosters, Match Management for match settings, and System & Backup for connection tests. A passing test does not mean the match has started on the server.")}</p>
    </section>
  );
}
