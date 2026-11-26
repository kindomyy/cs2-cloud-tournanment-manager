import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultArena, validateArena } from "../src/arena/model";

test("organizer contact remains optional for existing saved tournaments", () => {
  const config = validateArena(defaultArena());
  assert.equal(config.organizer, undefined);
});

test("organizer information survives configuration validation and export", () => {
  const config = defaultArena();
  config.organizer = { name: "  Turnuva sorumlusu  ", contact: "  okul@example.test / Discord: okul-turnuvasi  " };
  const saved = validateArena(JSON.parse(JSON.stringify(config)));
  assert.deepEqual(saved.organizer, {
    name: "Turnuva sorumlusu",
    contact: "okul@example.test / Discord: okul-turnuvasi",
  });
  saved.organizer = { name: "", contact: "" };
  assert.deepEqual(validateArena(saved).organizer, { name: "", contact: "" });
});

test("invalid or oversized organizer information is rejected", () => {
  for (const organizer of [
    null,
    "organizer",
    [],
    { name: 5, contact: "ok" },
    { name: "ok", contact: null },
    { name: "x".repeat(81), contact: "ok" },
    { name: "ok", contact: "x".repeat(241) },
    { name: "ok", contact: "line\nbreak" },
    { name: "hidden\u0000name", contact: "ok" },
  ]) {
    const config = { ...defaultArena(), organizer };
    assert.throws(() => validateArena(config), /Organizatör/);
  }
});
