export type PlayerProfile = {
  id: string;
  name: string;
  steamId: string | null;
  useSteamName?: boolean;
};
export type Team = {
  id: string;
  name: string;
  tag: string;
  color: string;
  players: string[];
  seed: number;
  roster?: PlayerProfile[];
  captainId?: string;
  logo?: string | null;
};
export type Match = {
  id: string;
  a?: string;
  b?: string;
  sourceA?: string;
  sourceB?: string;
  score?: [number, number];
  status: "completed" | "live" | "upcoming";
  time: string;
  round: string;
  format: "BO1" | "BO3";
  map?: string;
  maps?: MapScore[];
  selectedMaps?: string[];
  resolution?: "forfeit";
  note?: string;
};
export type MapScore = {
  name: string;
  score: [number, number];
  status: "live" | "completed";
};

export const teams: Team[] = [
  {
    id: "nova",
    name: "NOVA",
    tag: "NV",
    color: "#c7b3ed",
    players: ["zenith", "vex", "lunar", "kairo", "soul"],
    seed: 1,
  },
  {
    id: "orbit",
    name: "ORBIT",
    tag: "OR",
    color: "#87a8cd",
    players: ["atlas", "neon", "pixel", "raven", "frost"],
    seed: 8,
  },
  {
    id: "parallax",
    name: "PARALLAX",
    tag: "PX",
    color: "#e3e8d6",
    players: ["hipotez", "nox", "spectre", "wisp", "recon"],
    seed: 4,
  },
  {
    id: "void",
    name: "VOID",
    tag: "VD",
    color: "#a797d2",
    players: ["echoes", "shade", "blitz", "zero", "onyx"],
    seed: 5,
  },
  {
    id: "apex",
    name: "APEX",
    tag: "AX",
    color: "#b4cba9",
    players: ["peak", "ace", "dash", "titan", "scope"],
    seed: 2,
  },
  {
    id: "flux",
    name: "FLUX",
    tag: "FX",
    color: "#d6b37c",
    players: ["flow", "spark", "drift", "shift", "volt"],
    seed: 7,
  },
  {
    id: "ember",
    name: "EMBER",
    tag: "EM",
    color: "#d9967e",
    players: ["ash", "flare", "cinder", "pyro", "smoke"],
    seed: 3,
  },
  {
    id: "echo",
    name: "ECHO",
    tag: "EC",
    color: "#8dbcb6",
    players: ["pulse", "sonar", "wave", "sonic", "reverb"],
    seed: 6,
  },
];
export const teamById = (id?: string) => teams.find((t) => t.id === id);

export const upperIds = [["U1", "U2", "U3", "U4"], ["U5", "U6"], ["U7"]];
export const lowerIds = [["L1", "L2"], ["L3", "L4"], ["L5"], ["L6"]];

function match(
  id: string,
  round: string,
  time: string,
  format: Match["format"],
  a?: string,
  b?: string,
): Match {
  return { id, round, time, format, a, b, status: "upcoming" };
}

// Ordered so every source is resolved before its destination.
export const matchDefinitions: Match[] = [
  match("U1", "Üst kol · Çeyrek final", "12:00", "BO1", "nova", "orbit"),
  match("U2", "Üst kol · Çeyrek final", "13:00", "BO1", "parallax", "void"),
  match("U3", "Üst kol · Çeyrek final", "14:00", "BO1", "apex", "flux"),
  match("U4", "Üst kol · Çeyrek final", "15:00", "BO1", "ember", "echo"),
  match("U5", "Üst kol · Yarı final", "16:00", "BO3"),
  match("U6", "Üst kol · Yarı final", "18:00", "BO3"),
  match("U7", "Üst kol · Final", "Gün 2", "BO3"),
  match("L1", "Alt kol · 1. tur", "Gün 2", "BO3"),
  match("L2", "Alt kol · 1. tur", "Gün 2", "BO3"),
  match("L3", "Alt kol · 2. tur", "Gün 2", "BO3"),
  match("L4", "Alt kol · 2. tur", "Gün 2", "BO3"),
  match("L5", "Alt kol · Yarı final", "Gün 3", "BO3"),
  match("L6", "Alt kol · Final", "Gün 3", "BO3"),
  match("GF", "Büyük final", "Gün 3", "BO3"),
  match("GF2", "Büyük final · Tekrar serisi", "Gün 3", "BO3"),
];
