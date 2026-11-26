import {
  matchDefinitions,
  upperIds,
  lowerIds,
  type Match,
  type MapScore,
  type Team,
} from "../data";
import { openingMatches } from "./opening";

export type Result = {
  status: "live" | "completed";
  score: [number, number];
  map?: string;
  maps?: MapScore[];
  resolution?: "forfeit";
  note?: string;
};
export type TournamentState = {
  version: 1;
  resetFinal: boolean;
  results: Record<string, Result>;
};
type Source = { id: string; outcome: "winner" | "loser" };
const winner = (id: string): Source => ({ id, outcome: "winner" });
const loser = (id: string): Source => ({ id, outcome: "loser" });
const feeds: Record<string, [Source, Source]> = {
  U5: [winner("U1"), winner("U2")],
  U6: [winner("U3"), winner("U4")],
  U7: [winner("U5"), winner("U6")],
  L1: [loser("U1"), loser("U2")],
  L2: [loser("U3"), loser("U4")],
  L3: [winner("L1"), loser("U6")],
  L4: [winner("L2"), loser("U5")],
  L5: [winner("L3"), winner("L4")],
  L6: [winner("L5"), loser("U7")],
  GF: [winner("U7"), winner("L6")],
  GF2: [winner("U7"), winner("L6")],
};
export const mapNames = [
  "Mirage",
  "Inferno",
  "Nuke",
  "Dust2",
  "Ancient",
  "Anubis",
  "Vertigo",
];
export const emptyState = (): TournamentState => ({
  version: 1,
  resetFinal: true,
  results: {},
});
export const demoState = (): TournamentState => ({
  ...emptyState(),
  results: {
    U1: { status: "completed", score: [13, 8], map: "Mirage" },
    U2: { status: "live", score: [9, 7], map: "Nuke" },
  },
});

function outcome(
  match: Match | undefined,
  type: Source["outcome"],
): string | undefined {
  if (!match || match.status !== "completed" || !match.score) return;
  const aWon = match.score[0] > match.score[1];
  return (type === "winner" ? aWon : !aWon) ? match.a : match.b;
}

export function project(state: TournamentState, teams?: Team[]) {
  const byId: Record<string, Match> = {};
  for (const definition of matchDefinitions) {
    const match = { ...definition };
    if (teams && /^U[1-4]$/.test(match.id)) {
      const [a, b] = openingMatches[Number(match.id.slice(1)) - 1].seeds;
      match.a = teams.find((t) => t.seed === a)?.id;
      match.b = teams.find((t) => t.seed === b)?.id;
      match.sourceA = `${a}. seri başı`;
      match.sourceB = `${b}. seri başı`;
    }
    const sources = feeds[match.id];
    if (sources) {
      [match.a, match.b] = sources.map((s) => outcome(byId[s.id], s.outcome));
      [match.sourceA, match.sourceB] = sources.map(
        (s) => `${s.id} ${s.outcome === "winner" ? "kazananı" : "kaybedeni"}`,
      );
    }
    if (
      match.id === "GF2" &&
      !(
        state.resetFinal &&
        byId.GF?.status === "completed" &&
        outcome(byId.GF, "winner") === byId.GF.b
      )
    )
      continue;
    const result = state.results[match.id];
    if (match.a && match.b && result) Object.assign(match, result);
    byId[match.id] = match;
  }
  const matches = matchDefinitions
    .map((m) => byId[m.id])
    .filter((m): m is Match => !!m);
  const finals = [byId.GF, byId.GF2].filter((m): m is Match => !!m);
  const champion = byId.GF2
    ? outcome(byId.GF2, "winner")
    : state.resetFinal &&
        byId.GF.status === "completed" &&
        outcome(byId.GF, "winner") === byId.GF.b
      ? undefined
      : outcome(byId.GF, "winner");
  const eliminated = new Set(
    matches
      .filter((m) => m.id.startsWith("L") && m.status === "completed")
      .map((m) => outcome(m, "loser")!),
  );
  if (champion) eliminated.add(outcome(finals.at(-1), "loser")!);
  return {
    matches,
    byId,
    champion,
    eliminated,
    upper: upperIds.map((ids) => ids.map((id) => byId[id])),
    lower: lowerIds.map((ids) => ids.map((id) => byId[id])),
    finals,
    featured:
      matches.find((m) => m.status === "live") ||
      (champion
        ? finals.at(-1)!
        : matches.find((m) => m.status === "upcoming" && m.a && m.b)) ||
      byId.GF,
  };
}

export function validateResult(match: Match, result: Result): void {
  if (
    result?.resolution !== undefined &&
    (result.resolution !== "forfeit" ||
      result.status !== "completed" ||
      result.maps !== undefined ||
      !result.score ||
      Math.max(...result.score) !== (match.format === "BO1" ? 13 : 2) ||
      Math.min(...result.score) !== 0)
  )
    throw new Error(
      "Hükmen sonuç BO1 13–0 veya BO3 2–0 olarak işaretlenmeli; harita istatistiği uydurulmaz.",
    );
  if (
    result?.note !== undefined &&
    (typeof result.note !== "string" || result.note.length > 300)
  )
    throw new Error("Sonuç notu en fazla 300 karakter olabilir.");
  if (!match.a || !match.b)
    throw new Error(
      "Bu maçın iki takımı henüz belli değil. Önce önceki maçları tamamla.",
    );
  if (
    !result ||
    !["live", "completed"].includes(result.status) ||
    !Array.isArray(result.score) ||
    result.score.length !== 2 ||
    result.score.some((s) => !Number.isInteger(s) || s < 0 || s > 100)
  )
    throw new Error("Skorlar 0–100 arasında tam sayı olmalı.");
  const [high, low] = [...result.score].sort((a, b) => b - a);
  if (match.format === "BO3") {
    if (
      high > 2 ||
      (result.status === "completed" ? high !== 2 || low >= 2 : high >= 2)
    )
      throw new Error(
        "BO3 serisi 2–0 veya 2–1 biter. Canlı seride henüz iki harita kazanılmış olamaz.",
      );
    if (result.map)
      throw new Error(
        "BO3 skoru kazanılan harita sayısını gösterir; tek harita seçilmez.",
      );
  } else {
    // Standard MR12 with MR3 overtime: 13–0…11, 16–12…14, 19–15…17, etc.
    const terminal =
      (high === 13 && low <= 11) ||
      (high >= 16 &&
        (high - 16) % 3 === 0 &&
        low >= high - 4 &&
        low <= high - 2);
    if (result.status === "completed" && !terminal)
      throw new Error(
        "BO1 sonucu geçerli bir MR12 skoru olmalı (ör. 13–8, 16–14 veya 19–17).",
      );
    const liveValid =
      high <= 12 || (low >= 12 && high < 16 + 3 * Math.floor((low - 12) / 3));
    if (result.status === "live" && !liveValid)
      throw new Error(
        "Bu raunt skoru canlı bir MR12 maçına uygun değil. Maç bittiyse “Tamamlandı” seç.",
      );
    if (result.map && !mapNames.includes(result.map))
      throw new Error("Listeden bir harita seç.");
  }
  if (result.maps !== undefined) validateMaps(match, result);
}

export function validateMaps(match: Match, result: Result) {
  if (
    !Array.isArray(result.maps) ||
    !result.maps.length ||
    result.maps.length > (match.format === "BO1" ? 1 : 3)
  )
    throw new Error("Harita sayısı maç formatına uygun değil.");
  const wins = [0, 0];
  const seen = new Set<string>();
  for (const [index, map] of result.maps.entries()) {
    if (!map || !mapNames.includes(map.name) || seen.has(map.name))
      throw new Error("Haritalar listeden seçilmeli ve tekrarlanmamalı.");
    seen.add(map.name);
    if (Math.max(...wins) === 2)
      throw new Error("Seri bittikten sonra ek harita oynanamaz.");
    validateResult(
      { ...match, format: "BO1" },
      { status: map.status, score: map.score, map: map.name },
    );
    if (
      map.status === "live" &&
      (index !== result.maps.length - 1 || result.status === "completed")
    )
      throw new Error(
        "Yalnızca son harita canlı olabilir; tamamlanan seride canlı harita olamaz.",
      );
    if (map.status === "completed") wins[map.score[0] > map.score[1] ? 0 : 1]++;
  }
  if (match.format === "BO1") {
    const map = result.maps[0];
    if (
      map.status !== result.status ||
      map.score.some((s, i) => s !== result.score[i]) ||
      (result.map && result.map !== map.name)
    )
      throw new Error("BO1 sonucu harita skoruyla aynı olmalı.");
  } else if (wins.some((s, i) => s !== result.score[i]))
    throw new Error("Seri skoru biten haritaların sonucuyla aynı olmalı.");
}

export type Transition = { state: TournamentState; invalidated: string[] };
export function updateResult(
  state: TournamentState,
  id: string,
  result?: Result,
  teams?: Team[],
): Transition {
  const before = project(state, teams);
  const match = before.byId[id];
  if (!match) throw new Error("Maç bulunamadı.");
  if (result) validateResult(match, result);
  const next = structuredClone(state);
  if (result) next.results[id] = structuredClone(result);
  else delete next.results[id];
  return reconcile(before, next, id, teams);
}

function reconcile(
  before: ReturnType<typeof project>,
  next: TournamentState,
  edited?: string,
  teams?: Team[],
): Transition {
  const invalidated: string[] = [];
  // Re-project after every invalidation so no result can follow the wrong participants.
  for (const definition of matchDefinitions) {
    const id = definition.id;
    if (id === edited || !next.results[id]) continue;
    const old = before.byId[id];
    const current = project(next, teams).byId[id];
    if (!old || !current || old.a !== current.a || old.b !== current.b) {
      delete next.results[id];
      invalidated.push(id);
    }
  }
  return { state: next, invalidated };
}

export function changeFinalRule(
  state: TournamentState,
  resetFinal: boolean,
  teams?: Team[],
): Transition {
  return reconcile(
    project(state, teams),
    { ...structuredClone(state), resetFinal },
    undefined,
    teams,
  );
}

export function parseState(input: unknown, teams?: Team[]): TournamentState {
  if (!input || typeof input !== "object")
    throw new Error("Geçersiz turnuva dosyası.");
  const raw = input as Record<string, unknown>;
  if (
    raw.version !== 1 ||
    typeof raw.resetFinal !== "boolean" ||
    !raw.results ||
    typeof raw.results !== "object" ||
    Array.isArray(raw.results)
  )
    throw new Error("Turnuva dosyası bu sürümle uyumlu değil.");
  const next: TournamentState = { ...emptyState(), resetFinal: raw.resetFinal };
  const results = raw.results as Record<string, unknown>;
  if (
    Object.keys(results).some(
      (id) => !matchDefinitions.some((m) => m.id === id),
    )
  )
    throw new Error("Dosyada bilinmeyen bir maç var.");
  for (const definition of matchDefinitions) {
    if (!(definition.id in results)) continue;
    const value = results[definition.id] as Result;
    const match = project(next, teams).byId[definition.id];
    if (!match) throw new Error("Dosyada geçersiz final sonucu var.");
    validateResult(match, value);
    next.results[definition.id] = {
      status: value.status,
      score: [...value.score],
      ...(value.map ? { map: value.map } : {}),
      ...(value.maps ? { maps: structuredClone(value.maps) } : {}),
      ...(value.resolution ? { resolution: value.resolution } : {}),
      ...(value.note ? { note: value.note } : {}),
    };
  }
  return next;
}
