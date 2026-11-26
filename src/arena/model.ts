import {
  teams as defaults,
  matchDefinitions,
  type Team,
  type PlayerProfile,
} from "../data";
import {
  mapNames,
  emptyState,
  parseState,
  type TournamentState,
} from "../tournament/engine";
import { connectionAddress } from "./schedule";
export type ManagedTeam = Team & { roster: PlayerProfile[]; captainId: string };
export function balancedRosterSize(teams: Array<ManagedTeam | undefined>) {
  const size = teams[0]?.roster.length ?? 0;
  return teams.length === 2 && size >= 1 && size <= 5 && teams[1]?.roster.length === size ? size : 0;
}
export type ArenaConfig = {
  title: string;
  organizer?: { name: string; contact: string };
  presentation?: { minimal: boolean; activeMatchId: string | null };
  teams: ManagedTeam[];
  state: TournamentState;
  overrides: string[];
  schedule: Record<
    string,
    {
      startsAt: string;
      externalId: string;
      maps?: string[];
      a?: string;
      b?: string;
      durationMinutes?: number;
      location?: string;
      notes?: string;
      mode?: "unset" | "scheduled";
    }
  >;
  rehearsal: boolean;
  legacyBindings?: boolean;
  server?: { address: string; dathostServerId: string };
};
export type SteamProfile = { name: string; avatar: string | null };
export type SteamRegistration = {
  steam_id: string;
  verified_at: number;
  game_name: string | null;
  profile: SteamProfile | null;
  displayName?: string;
};
export type Session = { role: "admin" | "player"; steamId?: string; profile?: SteamProfile; displayName?: string } | null;
export type ArenaRecord = { revision: number; config: ArenaConfig };
export const BRAND = "Among Us!";
export const arenaTitle = (title: string) =>
  /^(kampüs arena|kampus arena)$/i.test(title.trim()) ? BRAND : title;
export const validMatchId = (id: string) =>
  /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2147483647;
export function newMatchId(excluded: string[] = []) {
  let id: string;
  do {
    id = String(crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff);
  } while (!validMatchId(id) || excluded.includes(id));
  return id;
}
export function freshSchedule(
  previous: ArenaConfig["schedule"] = {},
  excluded: string[] = [],
) {
  const used = [
    ...excluded,
    ...Object.values(previous).map((s) => s.externalId),
  ];
  return Object.fromEntries(
    matchDefinitions.map((m) => {
      const externalId = newMatchId(used);
      used.push(externalId);
      return [
        m.id,
        {
          ...previous[m.id],
          startsAt: "",
          mode: "unset" as const,
          externalId,
          maps: [],
          a: undefined,
          b: undefined,
        },
      ];
    }),
  );
}
export const defaultArena = (): ArenaConfig => ({
  title: BRAND,
  rehearsal: false,
  teams: defaults.map((t) => ({
    ...t,
    captainId: `${t.id}-1`,
    roster: t.players.map((name, i) => ({
      id: `${t.id}-${i + 1}`,
      name,
      steamId: null,
    })),
  })),
  state: emptyState(),
  overrides: [],
  schedule: freshSchedule(),
});
export function displayName(name: unknown) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 40 ||
    /["\\;\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(name)
  )
    throw new Error(
      "Görünen isim 1–40 karakter olmalı; tırnak, ters eğik çizgi, noktalı virgül veya kontrol karakteri içeremez.",
    );
  return name.trim();
}
export function matchPlayerName(player: PlayerProfile, tag: string, steamName?: string | null) {
  let name = player.name;
  if (player.useSteamName && steamName) {
    try {
      name = displayName(steamName);
    } catch {
      // Public Steam names may contain characters the match file cannot use.
    }
  }
  const prefix = `${tag} | `;
  return tag && !name.startsWith(prefix) ? prefix + name : name;
}
export function teamLogo(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > 88000 ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw new Error("Logo PNG, JPEG veya WebP olmalı ve 64 KB’ı aşmamalı.");
  const [header, encoded] = value.split(",");
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error("Logo dosyası okunamadı.");
  }
  const valid = header.includes("/png")
    ? binary.startsWith("\x89PNG\r\n\x1a\n")
    : header.includes("/jpeg")
      ? binary.startsWith("\xff\xd8\xff")
      : binary.startsWith("RIFF") && binary.slice(8, 12) === "WEBP";
  if (!valid || binary.length > 65536)
    throw new Error("Logo dosyası geçersiz veya 64 KB’tan büyük.");
  return value;
}
export function validateArena(input: unknown): ArenaConfig {
  const v = input as ArenaConfig;
  if (
    !v ||
    !Array.isArray(v.teams) ||
    v.teams.length > 8 ||
    typeof v.rehearsal !== "boolean"
  )
    throw new Error("Turnuva en fazla 8 takım içerir.");
  const teamIds = new Set(),
    playerIds = new Set(),
    steamIds = new Set(),
    seeds = new Set();
  const teams = v.teams.map((t) => {
    if (
      !t ||
      !/^[a-z0-9-]{1,40}$/.test(t.id) ||
      teamIds.has(t.id) ||
      !Number.isInteger(t.seed) ||
      t.seed < 1 ||
      t.seed > 8 ||
      seeds.has(t.seed) ||
      !/^#[0-9a-f]{6}$/i.test(t.color) ||
      !Array.isArray(t.roster) ||
      t.roster.length > 5
    )
      throw new Error("Takım kimliği, seri başı veya kadro geçersiz.");
    teamIds.add(t.id);
    seeds.add(t.seed);
    const roster = t.roster.map((p) => {
      if (
        !p ||
        !/^[a-z0-9-]{1,60}$/.test(p.id) ||
        playerIds.has(p.id) ||
        (p.steamId !== null &&
          (!/^7656119\d{10}$/.test(p.steamId) || steamIds.has(p.steamId)))
      )
        throw new Error("Oyuncu kimliği veya SteamID64 geçersiz/tekrarlı.");
      playerIds.add(p.id);
      if (p.steamId) steamIds.add(p.steamId);
      if (p.useSteamName !== undefined && typeof p.useSteamName !== "boolean")
        throw new Error("Oyun içi ad kaynağı geçersiz.");
      return {
        id: p.id,
        name: displayName(p.name),
        steamId: p.steamId,
        ...(p.useSteamName ? { useSteamName: true } : {}),
      };
    });
    if (roster.length && !roster.some((p) => p.id === t.captainId))
      throw new Error("Kaptan kadrodan seçilmeli.");
    return {
      id: t.id,
      name: displayName(t.name),
      tag: displayName(t.tag).slice(0, 5),
      color: t.color,
      seed: t.seed,
      logo: teamLogo(t.logo),
      roster,
      captainId: roster.length ? t.captainId : "",
      players: roster.map((p) => p.name),
    };
  });
  const external = new Set<string>();
  const schedule = Object.fromEntries(
    matchDefinitions.map((m) => {
      const s = v.schedule?.[m.id];
      if (
        !s ||
        !/^\d{1,15}$/.test(s.externalId) ||
        external.has(s.externalId)
      )
        throw new Error("MatchZy maç kimliği geçersiz/tekrarlı.");
      if (
        (s.location !== undefined &&
          (typeof s.location !== "string" || s.location.length > 100)) ||
        (s.notes !== undefined &&
          (typeof s.notes !== "string" || s.notes.length > 500))
      )
        throw new Error(
          "Yer en fazla 100, maç notu en fazla 500 karakter olmalı.",
        );
      external.add(s.externalId);
      if (
        s.maps &&
        (!Array.isArray(s.maps) ||
          (s.maps.length !== 0 &&
            s.maps.length !== (m.format === "BO1" ? 1 : 3)) ||
          s.maps.some((name) => !mapNames.includes(name)) ||
          new Set(s.maps).size !== s.maps.length)
      )
        throw new Error("Maç harita listesi geçersiz.");
      return [
        m.id,
        {
          startsAt: "",
          mode: "unset" as const,
          externalId: s.externalId,
          maps: s.maps || [],
          location: s.location || "",
          notes: s.notes || "",
          ...(s.a && teams.some((t) => t.id === s.a) ? { a: s.a } : {}),
          ...(s.b && teams.some((t) => t.id === s.b) ? { b: s.b } : {}),
        },
      ];
    }),
  );
  if (
    !Array.isArray(v.overrides) ||
    v.overrides.some((id) => !matchDefinitions.some((m) => m.id === id))
  )
    throw new Error("Manuel maç ayarı geçersiz.");
  return {
    title: arenaTitle(displayName(v.title)),
    ...(v.organizer === undefined
      ? {}
      : { organizer: validateOrganizer(v.organizer) }),
    ...(v.presentation === undefined
      ? {}
      : { presentation: validatePresentation(v.presentation) }),
    teams,
    schedule,
    rehearsal: v.rehearsal,
    legacyBindings: v.legacyBindings !== false,
    state: parseState(v.state, teams),
    overrides: [...new Set(v.overrides)],
    server: {
      address: connectionAddress(v.server?.address),
      dathostServerId: validateServerId(v.server?.dathostServerId),
    },
  };
}
function validatePresentation(value: unknown): NonNullable<ArenaConfig["presentation"]> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Site görünümü ayarı geçersiz.");
  const presentation = value as Record<string, unknown>;
  if (
    typeof presentation.minimal !== "boolean" ||
    (presentation.activeMatchId !== null &&
      (typeof presentation.activeMatchId !== "string" ||
        !matchDefinitions.some((match) => match.id === presentation.activeMatchId)))
  )
    throw new Error("Site görünümü açık/kapalı olmalı; aktif maç için bir turnuva maçı veya aktif maç yok seçilmeli.");
  return {
    minimal: presentation.minimal,
    activeMatchId: presentation.activeMatchId as string | null,
  };
}
function validateOrganizer(value: unknown): NonNullable<ArenaConfig["organizer"]> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Organizatör iletişim bilgisi geçersiz.");
  const organizer = value as Record<string, unknown>;
  const clean = (text: unknown, limit: number) => {
    if (
      typeof text !== "string" ||
      text.trim().length > limit ||
      /[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(text)
    )
      throw new Error(
        "Organizatör adı en fazla 80, iletişim bilgisi en fazla 240 karakter olmalı; kontrol karakteri içeremez.",
      );
    return text.trim();
  };
  return {
    name: clean(organizer.name, 80),
    contact: clean(organizer.contact, 240),
  };
}
function validateServerId(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/.test(value))
    throw new Error(
      "DatHost sunucu kimliği 24 karakterlik sunucu ID’si olmalı.",
    );
  return value;
}
export const rosterSignature = (config: ArenaConfig) =>
  JSON.stringify(
    config.teams
      .map((t) => ({
        id: t.id,
        seed: t.seed,
        captainId: t.captainId,
        roster: t.roster.map((p) => ({ id: p.id, steamId: p.steamId })),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
