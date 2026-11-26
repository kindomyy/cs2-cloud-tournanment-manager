import { expect, test } from "@playwright/test";
import { defaultArena } from "../src/arena/model.ts";
import { moveVeto } from "../src/arena/veto.ts";

const roomId = "duel-12345678-1234-4234-8234-123456789abc";
const players = [
  { name: "Alpha", steamId: "76561198000000111" },
  { name: "Bravo", steamId: "76561198000000222" },
];

for (const privateRoom of [false, true]) {
  test(`${privateRoom ? "private 1v1" : "tournament"} veto shows the other player's move within the next short poll`, async ({ page }) => {
    const config = defaultArena();
    const teamA = config.teams.find((team) => team.id === "nova");
    const teamB = config.teams.find((team) => team.id === "orbit");
    teamA.roster.find((p) => p.id === teamA.captainId).steamId = players[0].steamId;
    teamB.roster.find((p) => p.id === teamB.captainId).steamId = players[1].steamId;
    const me = { role: "player", steamId: players[1].steamId };
    let veto = {
      matchId: privateRoom ? roomId : "U1",
      a: privateRoom ? "duel-a" : teamA.id,
      b: privateRoom ? "duel-b" : teamB.id,
      format: "BO1", revision: 0, actions: [], rehearsal: false, forced: true,
      rosterKey: "test",
    };
    await page.route("**/api/matches", (route) => route.fulfill({ json: { configured: true, matches: [] } }));
    await page.route("**/api/arena", (route) => route.fulfill({ json: {
      revision: 1, config, state: config.state, me, steamConfigured: true,
      readies: [], vetos: privateRoom ? [] : [veto], verified: [], runtimes: {},
    } }));
    await page.route("**/api/duels?*", (route) => route.fulfill({ json: {
      me, steamConfigured: true, rooms: [{
        id: roomId, externalId: "123456", players, revision: veto.revision,
        ready: {}, veto, closed: false, createdAt: Date.now(), live: null,
      }],
    } }));
    await page.goto(privateRoom ? `/#1v1/${roomId}` : "/#veto/U1");
    const nextMap = page.getByRole("button", { name: "Inferno", exact: true });
    await expect(page.getByRole("heading", { name: `${privateRoom ? players[0].name : teamA.name} eliyor.` })).toBeVisible();
    await expect(nextMap).toBeDisabled();
    const endpoint = privateRoom ? "/api/duels" : "/api/arena";
    await page.waitForResponse((response) => new URL(response.url()).pathname === endpoint);
    veto = moveVeto(veto, "Mirage", players[0].steamId);
    await expect(nextMap).toBeEnabled({ timeout: 3000 });
    await expect(page.getByRole("button", { name: "Mirage · elendi" })).toBeDisabled();
  });
}
