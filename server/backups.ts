import { loadArena, rows, type Env, type Statement } from "./store";
import { validateArena, type ArenaConfig } from "../src/arena/model";
import { emptyState } from "../src/tournament/engine";
import { moveVeto, type VetoState } from "../src/arena/veto";
import { phaseLabels, type MatchRuntime } from "../src/arena/operations";
import { parseLiveFeed } from "../src/tournament/useLiveFeed";
import { teams } from "../src/data";
import type { MapSnapshot } from "./matchzy";
import type { Duel } from "../src/arena/duel";
import { audit } from "./opsStore";
type RawMap = {
  external_id: string;
  map_number: number;
  round_count: number;
  completed: number;
  finalized: number;
  snapshot: string;
};
export type ArenaBackup = {
  format: "among-us-backup";
  version: 1;
  exportedAt: string;
  config: ArenaConfig;
  maps: RawMap[];
  vetos: VetoState[];
  runtimes: MatchRuntime[];
  duels: Duel[];
};
const matchId = (id: unknown) =>
  typeof id === "string" &&
  /^(?:U[1-7]|L[1-6]|GF2?|duel-[a-f0-9-]{36})$/.test(id);
const number = (v: unknown, max = 100000) =>
  Number.isInteger(v) && Number(v) >= 0 && Number(v) <= max;
function veto(value: VetoState) {
  if (
    !value ||
    !matchId(value.matchId) ||
    !["BO1", "BO3"].includes(value.format) ||
    typeof value.rehearsal !== "boolean" ||
    !number(value.revision) ||
    typeof value.rosterKey !== "string" ||
    value.rosterKey.length > 30000 ||
    !Array.isArray(value.actions) ||
    value.actions.length > 7 ||
    typeof value.a !== "string" ||
    typeof value.b !== "string" ||
    value.a === value.b
  )
    throw new Error("Yedekte veto verisi geçersiz.");
  let expected = { ...value, actions: [], revision: 0 } as VetoState;
  for (const action of value.actions.filter((a) => a.kind !== "decider")) {
    if (
      typeof action.actor !== "string" ||
      !/^(?:admin|7656119\d{10})$/.test(action.actor)
    )
      throw new Error("Veto oyuncusu geçersiz.");
    expected = moveVeto(expected, action.map, action.actor);
  }
  if (JSON.stringify(expected.actions) !== JSON.stringify(value.actions))
    throw new Error("Veto sırası veya kalan harita geçersiz.");
  return value;
}
export async function exportBackup(env: Env): Promise<ArenaBackup> {
  const { config } = await loadArena(env);
  const maps = await rows<RawMap>(
    env,
    "SELECT external_id,map_number,round_count,completed,finalized,snapshot FROM matchzy_maps",
  );
  const vetos = (
    await rows<{ state: string }>(env, "SELECT state FROM match_veto")
  ).map((r) => JSON.parse(r.state));
  const runtimes = (
    await rows<{ state: string }>(env, "SELECT state FROM match_runtime")
  ).map((r) => JSON.parse(r.state));
  const duels = (
    await rows<{ state: string }>(env, "SELECT state FROM private_duels")
  ).map((r) => JSON.parse(r.state));
  return {
    format: "among-us-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    config: validateArena(config),
    maps,
    vetos,
    runtimes,
    duels,
  };
}
export function validateBackup(input: unknown): ArenaBackup {
  const b = input as ArenaBackup;
  if (
    !b ||
    b.format !== "among-us-backup" ||
    b.version !== 1 ||
    !Number.isFinite(Date.parse(b.exportedAt)) ||
    !Array.isArray(b.maps) ||
    b.maps.length > 3000 ||
    !Array.isArray(b.vetos) ||
    b.vetos.length > 15 ||
    !Array.isArray(b.runtimes) ||
    b.runtimes.length > 1500 ||
    !Array.isArray(b.duels) ||
    b.duels.length > 1000
  )
    throw new Error(
      "Bu dosya geçerli bir tam turnuva yedeği değil. Yönetim taslağı veya kişisel deneme dosyası kullanılamaz.",
    );
  const config = validateArena(b.config),
    seenMaps = new Set(),
    seenVetos = new Set(),
    seenRuntime = new Set(),
    seenDuels = new Set(),
    duelExternal = new Set();
  for (const row of b.maps) {
    if (
      !row ||
      !/^\d{1,15}$/.test(row.external_id) ||
      !number(row.map_number, 2) ||
      !number(row.round_count, 200) ||
      ![0, 1].includes(row.completed) ||
      ![0, 1].includes(row.finalized) ||
      typeof row.snapshot !== "string" ||
      row.snapshot.length > 64000 ||
      seenMaps.has(`${row.external_id}:${row.map_number}`)
    )
      throw new Error("Yedekte harita kaydı geçersiz/tekrarlı.");
    seenMaps.add(`${row.external_id}:${row.map_number}`);
    const s = JSON.parse(row.snapshot) as MapSnapshot;
    if (
      !s ||
      s.externalId !== row.external_id ||
      !matchId(s.matchId) ||
      s.number !== row.map_number ||
      typeof s.a !== "string" ||
      typeof s.b !== "string" ||
      s.a.length > 40 ||
      s.b.length > 40 ||
      typeof s.finalized !== "boolean" ||
      Number(s.finalized) !== row.finalized ||
      !s.map ||
      s.map.score[0] + s.map.score[1] !== row.round_count ||
      Number(s.map.status === "completed") !== row.completed
    )
      throw new Error("Harita metadatası yedekle uyuşmuyor.");
    parseLiveFeed(
      {
        configured: true,
        matches: [
          {
            id: "U1",
            a: s.a,
            b: s.b,
            status: s.map.status,
            score: s.map.score,
            map: s.map.name,
            maps: [s.map],
            players: s.players,
            updatedAt: s.updatedAt,
          },
        ],
      },
      [
        { ...teams[0], id: s.a },
        { ...teams[1], id: s.b },
      ],
    );
  }
  for (const v of b.vetos) {
    veto(v);
    if (
      v.matchId.startsWith("duel-") ||
      seenVetos.has(v.matchId) ||
      !config.teams.some((t) => t.id === v.a) ||
      !config.teams.some((t) => t.id === v.b)
    )
      throw new Error("Turnuva vetosu geçersiz.");
    seenVetos.add(v.matchId);
  }
  for (const r of b.runtimes) {
    if (
      !r ||
      !matchId(r.matchId) ||
      !/^\d{1,15}$/.test(r.externalId) ||
      !Object.hasOwn(phaseLabels, r.phase) ||
      seenRuntime.has(r.externalId) ||
      (r.lastEventAt && !Number.isFinite(Date.parse(r.lastEventAt))) ||
      (r.barrierAt !== undefined &&
        (typeof r.barrierAt !== "string" ||
          !Number.isFinite(Date.parse(r.barrierAt)))) ||
      (r.lastBackupKey !== undefined &&
        (typeof r.lastBackupKey !== "string" ||
          r.lastBackupKey.length > 250)) ||
      (r.lastEvent !== undefined &&
        (typeof r.lastEvent !== "string" || r.lastEvent.length > 80)) ||
      (r.restorePending !== undefined &&
        typeof r.restorePending !== "boolean") ||
      (r.strictRounds !== undefined && typeof r.strictRounds !== "boolean") ||
      (r.teams !== undefined && !Array.isArray(r.teams)) ||
      (r.mapNumber !== undefined && !number(r.mapNumber, 2)) ||
      (r.restoreRound !== undefined && !number(r.restoreRound, 200))
    )
      throw new Error("Maç aşaması yedekte geçersiz.");
    seenRuntime.add(r.externalId);
    if (r.teams) {
      if (r.teams.length !== 2)
        throw new Error("Kilitli kadro iki takım içermeli.");
      r.teams = validateArena({
        ...config,
        teams: r.teams,
        state: emptyState(),
      }).teams as typeof r.teams;
    }
  }
  for (const d of b.duels) {
    if (
      !d ||
      !/^duel-[a-f0-9-]{36}$/.test(d.id) ||
      !/^\d{1,15}$/.test(d.externalId) ||
      seenDuels.has(d.id) ||
      duelExternal.has(d.externalId) ||
      !number(d.revision) ||
      typeof d.closed !== "boolean" ||
      !Array.isArray(d.players) ||
      d.players.length !== 2 ||
      d.players[0].steamId === d.players[1].steamId ||
      !number(d.createdAt, Number.MAX_SAFE_INTEGER)
    )
      throw new Error("1v1 yedeği geçersiz.");
    for (const p of d.players)
      if (
        !/^7656119\d{10}$/.test(p.steamId) ||
        typeof p.name !== "string" ||
        !p.name.trim() ||
        p.name.length > 40 ||
        /[";\\\x00-\x1f]/.test(p.name)
      )
        throw new Error("1v1 oyuncusu geçersiz.");
    if (d.veto) {
      veto(d.veto);
      if (
        d.veto.matchId !== d.id ||
        d.veto.a !== "duel-a" ||
        d.veto.b !== "duel-b" ||
        d.veto.format !== "BO1"
      )
        throw new Error("1v1 vetosu odayla uyuşmuyor.");
    }
    if (
      Object.values(config.schedule).some((s) => s.externalId === d.externalId)
    )
      throw new Error("1v1 ve turnuva maç kimlikleri çakışıyor.");
    d.ready = {};
    seenDuels.add(d.id);
    duelExternal.add(d.externalId);
  }
  return {
    format: "among-us-backup",
    version: 1,
    exportedAt: b.exportedAt,
    config,
    maps: b.maps,
    vetos: b.vetos,
    runtimes: b.runtimes,
    duels: b.duels,
  };
}
export function backupSummary(b: ArenaBackup) {
  return {
    exportedAt: b.exportedAt,
    teams: b.config.teams.length,
    results: Object.keys(b.config.state.results).length,
    maps: b.maps.length,
    vetos: b.vetos.length,
    rooms: b.duels.length,
  };
}
function inserts(
  env: Env,
  table: string,
  columns: string[],
  data: Record<string, unknown>[],
) {
  const statements: Statement[] = [];
  let group: Record<string, unknown>[] = [],
    size = 0;
  const flush = () => {
    if (group.length)
      statements.push(
        env
          .DB!.prepare(
            `INSERT INTO ${table}(${columns.join(",")}) SELECT ${columns.map((c) => `json_extract(value,'$.${c}')`).join(",")} FROM json_each(?)`,
          )
          .bind(JSON.stringify(group)),
      );
    group = [];
    size = 0;
  };
  const encoder = new TextEncoder();
  for (const item of data) {
    const length = encoder.encode(JSON.stringify(item)).byteLength + 2;
    if (size + length > 850000) flush();
    group.push(item);
    size += length;
  }
  flush();
  return statements;
}
export async function restoreBackup(
  env: Env,
  backup: ArenaBackup,
  revision: number,
) {
  if (!env.DB?.batch)
    throw new Error("Geri yükleme atomik D1 batch desteği gerektirir.");
  const previous = await exportBackup(env),
    record = await loadArena(env);
  if (record.revision !== revision) throw new Error("CONFLICT");
  const encoded = new TextEncoder().encode(JSON.stringify(previous));
  const compressed = new Uint8Array(
    await new Response(
      new Blob([encoded]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  if (compressed.byteLength > 1500000)
    throw new Error(
      "Otomatik güvenlik yedeği çok büyük. Önce mevcut yedeği indir ve eski test odalarını düzenle.",
    );
  const backupId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO arena_backups(id,at,payload) VALUES(?,?,?)")
    .bind(backupId, Date.now(), compressed.buffer)
    .run();
  const statements: Statement[] = [
    env.DB.prepare(
      "INSERT INTO arena_restore_guard(id) SELECT CASE WHEN EXISTS(SELECT 1 FROM arena_config WHERE id=1 AND revision=?) THEN 1 ELSE 0 END",
    ).bind(revision),
    env.DB.prepare(
      "UPDATE arena_config SET config=?,revision=revision+1 WHERE id=1",
    ).bind(JSON.stringify(backup.config)),
  ];
  for (const table of [
    "matchzy_maps",
    "match_veto",
    "match_ready",
    "match_runtime",
    "private_duels",
    "server_tickets",
  ])
    statements.push(env.DB.prepare(`DELETE FROM ${table}`));
  statements.push(
    ...inserts(
      env,
      "matchzy_maps",
      [
        "external_id",
        "map_number",
        "round_count",
        "completed",
        "finalized",
        "snapshot",
      ],
      backup.maps,
    ),
  );
  statements.push(
    ...inserts(
      env,
      "match_veto",
      ["match_id", "revision", "state"],
      backup.vetos.map((v) => ({
        match_id: v.matchId,
        revision: v.revision,
        state: JSON.stringify(v),
      })),
    ),
  );
  statements.push(
    ...inserts(
      env,
      "match_runtime",
      ["external_id", "match_id", "state", "updated_at"],
      backup.runtimes.map((r) => ({
        external_id: r.externalId,
        match_id: r.matchId,
        state: JSON.stringify(r),
        updated_at: Date.now(),
      })),
    ),
  );
  statements.push(
    ...inserts(
      env,
      "private_duels",
      ["id", "external_id", "revision", "state", "updated_at"],
      backup.duels.map((d) => ({
        id: d.id,
        external_id: d.externalId,
        revision: d.revision,
        state: JSON.stringify(d),
        updated_at: Date.now(),
      })),
    ),
  );
  statements.push(
    env.DB.prepare("DELETE FROM arena_restore_guard"),
    env.DB.prepare("DELETE FROM arena_meta WHERE key='webhook'"),
    env.DB.prepare("UPDATE server_jobs SET status='idle',expires=0"),
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    await env.DB.prepare("DELETE FROM arena_backups WHERE id=?")
      .bind(backupId)
      .run()
      .catch(() => {});
    if (
      error instanceof Error &&
      /CHECK constraint|UNIQUE constraint.*arena_restore_guard/i.test(
        error.message,
      )
    )
      throw new Error("CONFLICT");
    throw error;
  }
  await env.DB.prepare(
    "DELETE FROM arena_backups WHERE id NOT IN (SELECT id FROM arena_backups ORDER BY at DESC LIMIT 10)",
  )
    .run()
    .catch(() => {});
  await audit(env, { role: "admin" }, "backup-restored", "", {
    previousBackupId: backupId,
    ...backupSummary(backup),
  });
  return backupId;
}
export async function archivedBackup(env: Env, id: string) {
  const result = await rows<{ payload: number[] | ArrayBuffer }>(
    env,
    "SELECT payload FROM arena_backups WHERE id=?",
    id,
  );
  if (!result.length) throw new Error("Yedek bulunamadı.");
  const bytes = new Uint8Array(result[0].payload);
  return JSON.parse(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).text(),
  );
}
