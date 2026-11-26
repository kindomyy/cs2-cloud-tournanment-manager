import { useCallback, useEffect, useState } from "react";
import { useArena } from "../arena/ArenaContext";
import { operation } from "../arena/operationsApi";
import type { AuditEntry } from "../arena/operations";
import { langHeaders, useI18n } from "../i18n";

type Health = {
  database: boolean;
  missingTables: string[];
  steamConfigured: boolean;
  adminConfigured: boolean;
  webhookConfigured: boolean;
  dathostConfigured: boolean;
  serverId: string;
  origin: string;
  lastWebhook: { at: string; event: string; matchId: string } | null;
  lastDathostTest: { at: string; name: string; address: string; serverId?: string } | null;
  lastDathostAttempt?: { at: string; ok: boolean; serverId: string; error?: string } | null;
};
type Status = {
  health: Health;
  audit: AuditEntry[];
  jobs: { server_id: string; match_id: string; status: string }[];
  backups: { id: string; at: number }[];
};

export function OperationsPanel() {
  const arena = useArena(),
    { lang, tx, formatDateTime, phaseLabel, auditActionLabel, errText } = useI18n(),
    [data, setData] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [backup, setBackup] = useState<unknown>(null),
    [summary, setSummary] = useState<Record<string, number | string> | null>(
      null,
    ),
    [restore, setRestore] = useState(false),
    [stopped, setStopped] = useState(false),
    [released, setReleased] = useState(false);
  const refresh = useCallback(async () => {
    if (!arena.online || arena.snapshot.me?.role !== "admin") return;
    try {
      const r = await fetch("/api/operations", {
        cache: "no-store",
        headers: langHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      let v: Status & { error?: string };
      try {
        v = await r.json();
      } catch {
        throw new Error(
          tx("Kontrol paneli yanıtı okunamadı.", "Could not read operations response."),
        );
      }
      if (!r.ok)
        throw new Error(
          v.error || tx("Kontrol paneli alınamadı.", "Could not fetch operations status."),
        );
      setData(v);
    } catch (e) {
      setError(errText((e as Error).message));
    }
  }, [arena.online, arena.snapshot.me?.role, lang, tx, errText]);
  useEffect(() => {
    void refresh();
  }, [refresh, arena.snapshot.revision]);
  async function test() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await operation({ action: "test-server" });
      setNotice(
        tx(
          `DatHost erişimi doğrulandı: ${r.server.name}${r.server.address ? " · " + r.server.address : ""}`,
          `DatHost access verified: ${r.server.name}${r.server.address ? " · " + r.server.address : ""}`,
        ),
      );
      setData((current) => current ? {
        ...current,
        health: { ...current.health, lastDathostTest: r.server, lastDathostAttempt: r.server },
      } : current);
    } catch (e) {
      const message = errText((e as Error).message);
      setError(message);
      // Keep a previous success from appearing current if the follow-up status
      // request also fails after this failed test.
      setData((current) => current ? {
        ...current,
        health: {
          ...current.health,
          lastDathostAttempt: {
            at: new Date().toISOString(), ok: false,
            serverId: current.health.serverId, error: message,
          },
        },
      } : current);
    } finally {
      window.dispatchEvent(new Event("arena-operations-changed"));
      await refresh();
      setBusy(false);
    }
  }
  async function release() {
    setBusy(true);
    setError("");
    try {
      await operation({
        action: "release-server",
        confirm: true,
        serverStoppedConfirmed: released,
      });
      setReleased(false);
      setNotice(
        tx("Bekleyen sunucu kaydı temizlendi.", "Pending server lock cleared."),
      );
      await refresh();
    } catch (e) {
      setError(errText((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function read(file?: File) {
    setBackup(null);
    setSummary(null);
    setRestore(false);
    setStopped(false);
    setError("");
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 5500000)
        throw new Error(
          tx("Yedek dosyası 5,5 MB sınırını aşıyor.", "Backup file exceeds the 5.5 MB limit."),
        );
      const value = JSON.parse(await file.text());
      const result = await operation({
        action: "validate-backup",
        backup: value,
      });
      setBackup(value);
      setSummary(result.summary);
    } catch (e) {
      setError(errText((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    setError("");
    try {
      const result = await operation({
        action: "restore-backup",
        backup,
        revision: arena.snapshot.revision,
        confirm: true,
        serverStoppedConfirmed: stopped,
      });
      setNotice(
        tx(
          `Yedek geri yüklendi. Önceki durum ayrıca saklandı (${result.previousBackupId}).`,
          `Backup restored. Previous state was also saved (${result.previousBackupId}).`,
        ),
      );
      setBackup(null);
      setSummary(null);
      setRestore(false);
      await arena.refresh();
      await refresh();
    } catch (e) {
      setError(errText((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  if (arena.snapshot.me?.role !== "admin" && !(!arena.online && arena.previewAdmin)) return null;
  if (!arena.online)
    return (
      <p className="setup-note">
        {tx(
          "Bağlantı kontrolü ve tam yedekleme çevrimiçi yönetici oturumu gerektirir.",
          "Connection checks and full backups require an online admin session.",
        )}
      </p>
    );
  const jobStatuses: Record<string, string> = {
    active: tx("Aktif", "Active"),
    pending: tx("Onay bekleniyor", "Awaiting confirmation"),
    sending: tx("Komut gönderiliyor", "Sending command"),
    unknown: tx("Sonuç belirsiz", "Result uncertain"),
    ending: tx("Bitirme onayı bekleniyor", "Awaiting end confirmation"),
    idle: tx("Boş olarak kaydedildi", "Recorded as idle"),
    error: tx("İşlem başarısız", "Action failed"),
  };
  const summaryLabels: Record<string, string> = {
    teams: tx("Takım", "Teams"),
    maps: tx("Harita kaydı", "Map records"),
    vetos: tx("Veto", "Vetoes"),
    rooms: tx("1v1 odası", "1v1 rooms"),
    results: tx("Sonuç", "Results"),
    duels: tx("1v1 odası", "1v1 rooms"),
    runtimes: tx("Maç aşaması", "Match phases"),
    exportedAt: tx("Yedek zamanı", "Backup timestamp"),
  };
  return (
    <div className="operations-panel">
      <div className="admin-card-heading">
        <div>
          <span className="eyebrow">
            {tx("SİSTEM / CANLI KONTROL", "SYSTEM / LIVE CHECKS")}
          </span>
          <h2>{tx("Bağlantılar ve kayıtlar", "Connections and logs")}</h2>
        </div>
        <button
          className="button-text"
          disabled={busy}
          onClick={() => {
            setError("");
            void refresh();
          }}
        >
          {tx("Durumu yenile", "Refresh status")}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="save-notice" role="status">
          {notice}
        </p>
      )}
      {data && (
        <>
          <div className="admin-settings-grid">
            <div className="admin-settings-card">
              <h3>{tx("Kurulum durumu", "Setup status")}</h3>
              <dl>
                {(
                  [
                    ["db", tx("D1 veritabanı", "D1 database"), data.health.database, true],
                    ["tables", tx("SQL tabloları", "SQL tables"), !data.health.missingTables.length, true],
                    ["steam", tx("Steam dönüş adresi", "Steam return URL"), data.health.steamConfigured, false],
                    ["admin", "Admin Secret", data.health.adminConfigured, false],
                    ["webhook", "MatchZy webhook Secret", data.health.webhookConfigured, false],
                    ["dathost", tx("DatHost erişim ayarları", "DatHost access settings"), data.health.dathostConfigured, false],
                  ] as const
                ).map(([key, label, ok, isReadyType]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd className={ok ? "health-ok" : "health-missing"}>
                      {ok
                        ? isReadyType
                          ? tx("Hazır", "Ready")
                          : tx("Ayarlar girildi", "Configured")
                        : tx("Eksik", "Missing")}
                    </dd>
                  </div>
                ))}
              </dl>
              {!!data.health.missingTables.length && (
                <p className="form-error">
                  {tx(
                    `Eksik tablolar: ${data.health.missingTables.join(", ")}. SQL dosyalarını sırayla, özellikle 0004_operations.sql dosyasını uygula.`,
                    `Missing tables: ${data.health.missingTables.join(", ")}. Apply the SQL migrations in order, especially 0004_operations.sql.`,
                  )}
                </p>
              )}
              <p>
                {tx(
                  "Ayarın girilmiş olması bağlantının çalıştığını göstermez. Steam için oyuncu girişi, DatHost için bağlantı testi, MatchZy için gerçek maç olayı gerekir.",
                  "Having settings configured does not guarantee connectivity. Steam requires a player sign-in, DatHost requires a connection test, and MatchZy requires a live match event.",
                )}
              </p>
            </div>
            <div className="admin-settings-card">
              <h3>{tx("Gerçek sunucu erişimi", "Live server access")}</h3>
              <p className={data.health.lastDathostAttempt?.serverId === data.health.serverId && data.health.lastDathostAttempt?.ok ? "health-ok" : "health-missing"} aria-live="polite">
                {data.health.lastDathostAttempt?.serverId === data.health.serverId && data.health.lastDathostAttempt
                  ? data.health.lastDathostAttempt.ok
                    ? tx("Son bağlantı testi başarılı", "Last connection test succeeded")
                    : tx("Son bağlantı testi başarısız", "Last connection test failed")
                  : tx("Bağlantı henüz doğrulanmadı", "Connection not verified yet")}
              </p>
              <p>
                {tx(
                  "Bu düğme DatHost API’sinden sunucu bilgisini okur; oyun başlatmaz.",
                  "This button reads server details from the DatHost API; it does not start a game.",
                )}
              </p>
              {data.health.serverId && (
                <p>
                  {tx("Test edilen sunucu ID:", "Tested server ID:")}{" "}
                  {data.health.serverId}
                </p>
              )}
              <button
                className="button-primary"
                disabled={
                  busy ||
                  !data.health.dathostConfigured ||
                  !!data.health.missingTables.length
                }
                onClick={() => void test()}
              >
                {tx("DatHost bağlantısını test et", "Test DatHost connection")}
              </button>
              <p>
                {data.health.lastDathostTest && data.health.lastDathostTest.serverId === data.health.serverId
                  ? tx(
                      `Son başarılı test: ${formatDateTime(data.health.lastDathostTest.at)} · ${data.health.lastDathostTest.name} · ${data.health.lastDathostTest.address}`,
                      `Last successful test: ${formatDateTime(data.health.lastDathostTest.at)} · ${data.health.lastDathostTest.name} · ${data.health.lastDathostTest.address}`,
                    )
                  : tx(
                      "Bu sunucu için kayıtlı başarılı bir DatHost testi yok.",
                      "No successful DatHost test recorded for this server.",
                    )}
              </p>
              {data.health.lastDathostAttempt?.serverId === data.health.serverId && data.health.lastDathostAttempt && !data.health.lastDathostAttempt.ok && (
                <>
                  <p className="health-missing">
                    {formatDateTime(data.health.lastDathostAttempt.at)} ·{" "}
                    {errText(data.health.lastDathostAttempt.error || "")}
                  </p>
                  <p>
                    {tx(
                      "Bu sonuç sunucunun kapalı olduğunu kanıtlamaz; DatHost API erişimi doğrulanamadı.",
                      "This does not prove the server is down; DatHost API access could not be verified.",
                    )}
                  </p>
                </>
              )}
              <p>
                {tx(
                  "Test sonucu belirtilen ana aittir; sürekli bağlantı veya MatchZy kurulumu onayı değildir.",
                  "Test results reflect that moment only; they do not guarantee continuous connectivity or MatchZy setup.",
                )}
              </p>
              <p>
                {data.health.lastWebhook
                  ? tx(
                      `Son MatchZy olayı: ${data.health.lastWebhook.event} · ${data.health.lastWebhook.matchId || "—"} · ${formatDateTime(data.health.lastWebhook.at)}`,
                      `Last MatchZy event: ${data.health.lastWebhook.event} · ${data.health.lastWebhook.matchId || "—"} · ${formatDateTime(data.health.lastWebhook.at)}`,
                    )
                  : tx(
                      "Henüz doğrulanmış MatchZy olayı gelmedi.",
                      "No verified MatchZy event received yet.",
                    )}
              </p>
              {data.jobs.map((j) => (
                <p key={j.server_id}>
                  {tx("Sunucu kaydı:", "Server job:")} {j.match_id} ·{" "}
                  {jobStatuses[j.status] || j.status}
                </p>
              ))}
              {Object.values(arena.snapshot.runtimes || {})
                .filter((r) =>
                  [
                    "loading",
                    "warmup",
                    "live",
                    "paused",
                    "restoring",
                    "review",
                  ].includes(r.phase),
                )
                .map((r) => (
                  <p key={r.externalId}>
                    {tx("Maç aşaması:", "Match phase:")}{" "}
                    <strong>{r.matchId}</strong> · {phaseLabel(r.phase)}
                  </p>
                ))}
              {!!data.jobs.length && (
                <details>
                  <summary>{tx("Takılı kalan sunucu kaydı", "Stuck server lock")}</summary>
                  <p>
                    {tx(
                      "Yalnızca DatHost konsolundan maçı bitirdikten sonra kullan. Sitedeki komut kilidini kaldırır.",
                      "Use only after ending the match from the DatHost console. Clears the command lock on the site.",
                    )}
                  </p>
                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={released}
                      onChange={(e) => setReleased(e.target.checked)}
                    />
                    {tx(
                      "DatHost sunucusunda maçı bitirdim; sunucu boş.",
                      "I ended the match on the DatHost server; the server is idle.",
                    )}
                  </label>
                  <button
                    className="button-text"
                    disabled={busy || !released}
                    onClick={() => void release()}
                  >
                    {tx("Sunucuyu boş olarak işaretle", "Mark server as idle")}
                  </button>
                </details>
              )}
            </div>
          </div>
          <div className="admin-settings-card">
            <h3>{tx("Tam yedek ve geri yükleme", "Full backup and restore")}</h3>
            <p>
              {tx(
                "Takımlar, takvim, sonuçlar, maç kadroları, veto ve özel 1v1 odaları dahil edilir. Parolalar, oturumlar ve Steam doğrulamaları yedeklenmez.",
                "Includes teams, schedule, results, match lineups, vetoes, and custom 1v1 rooms. Passwords, sessions, and Steam verifications are not included.",
              )}
            </p>
            <a className="button-primary" href="/api/operations?view=backup">
              {tx("Tam yedeği indir", "Download full backup")}
            </a>
            <label className="backup-upload">
              {tx("Geri yüklemek için JSON yedeği seç", "Select JSON backup to restore")}
              <input
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  void read(file);
                }}
              />
            </label>
            {summary && (
              <div className="backup-review">
                <h4>{tx("Doğrulanan yedek", "Validated backup")}</h4>
                <dl>
                  {Object.entries(summary).map(([key, value]) => (
                    <div key={key}>
                      <dt>{summaryLabels[key] || key}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  className="button-text"
                  onClick={() => setRestore(true)}
                >
                  {tx("Geri yüklemeyi hazırla", "Prepare restore")}
                </button>
                {restore && (
                  <div className="change-confirm">
                    <p>
                      {tx(
                        "Mevcut kayıtlar bu yedekle değişecek. Önceki durum otomatik yedeklenir. Sunucudaki maçı önce durdur.",
                        "Current records will be replaced by this backup. The previous state is backed up automatically. Stop any active server match first.",
                      )}
                    </p>
                    <label className="settings-checkbox">
                      <input
                        type="checkbox"
                        checked={stopped}
                        onChange={(e) => setStopped(e.target.checked)}
                      />
                      {tx(
                        "Sunucudaki mevcut maçı durdurdum ve kayıtların değişmesini onaylıyorum.",
                        "I stopped the active server match and confirm replacing current records.",
                      )}
                    </label>
                    <button
                      className="button-primary"
                      disabled={busy || !stopped}
                      onClick={() => void apply()}
                    >
                      {tx("Yedeği geri yükle", "Restore backup")}
                    </button>
                    <button
                      className="button-text"
                      onClick={() => setRestore(false)}
                    >
                      {tx("Vazgeç", "Cancel")}
                    </button>
                  </div>
                )}
              </div>
            )}
            {!!data.backups.length && (
              <details>
                <summary>
                  {tx("Geri yükleme öncesi otomatik yedekler", "Automatic pre-restore backups")}
                </summary>
                {data.backups.map((b) => (
                  <p key={b.id}>
                    <a
                      href={`/api/operations?view=backup&id=${encodeURIComponent(b.id)}`}
                    >
                      {formatDateTime(b.at)} · {tx("İndir", "Download")}
                    </a>
                  </p>
                ))}
              </details>
            )}
          </div>
          <div className="admin-settings-card">
            <h3>{tx("Son 100 yönetim işlemi", "Last 100 admin actions")}</h3>
            {!data.audit.length && (
              <p>{tx("Henüz işlem kaydı yok.", "No audit log entries yet.")}</p>
            )}
            <ol className="audit-list">
              {data.audit.map((entry) => (
                <li key={entry.id}>
                  <time>{formatDateTime(entry.at)}</time>
                  <strong>
                    {auditActionLabel(entry.action)}
                    {entry.match_id ? ` · ${entry.match_id}` : ""}
                  </strong>
                  <small>{entry.actor}</small>
                  <details>
                    <summary>{tx("Ayrıntı", "Details")}</summary>
                    <pre>{JSON.stringify(entry.detail, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
