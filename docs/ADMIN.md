# Admin Panel, Steam Sign-In & Full-Screen Veto

For server controls, recovery actions, audit logs, and full backups, see the [Operations Guide](OPERATIONS.md) (requires `migrations/0004_operations.sql`).

If you are deploying to `workers.dev`, follow the [Workers Setup Guide](WORKERS.md). The Pages steps below apply to `pages.dev` projects.

## Quick Local Preview

Open `/#admin`. When no online backend is connected, click **Open local admin preview** to try rosters, SteamIDs, captains, match settings, scores, and the map veto screen. Use **Match management → Veto → Open rehearsal veto → Full-screen veto** to preview the full-screen veto stage.

Local preview is not a real login: it does not verify Steam accounts or sync to other devices. Rosters and settings are saved only in your browser. Real shared vetoes require the Cloudflare setup below.

## Cloudflare Pages Setup

In a GitHub-connected Pages project, set build command to `npm run build` and output directory to `dist`. The `functions/` directory is deployed automatically alongside it. Static ZIP uploads provide UI preview only.

1. Bind your D1 database with the variable name **`DB`**.
2. In the D1 SQL Console, run [`0001_matchzy.sql`](../migrations/0001_matchzy.sql), [`0002_management.sql`](../migrations/0002_management.sql), [`0003_private_duels.sql`](../migrations/0003_private_duels.sql), and [`0004_operations.sql`](../migrations/0004_operations.sql) in order. Existing data is preserved (`CREATE TABLE IF NOT EXISTS`).
3. Add the following settings under **Variables and Secrets**, then redeploy:

| Name | Type | Value |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Secret | Your admin password (at least 12 characters). Never commit to Git or share in chat. |
| `PUBLIC_ORIGIN` | Text | Exact HTTPS origin of your site, e.g. `https://YOUR-SITE.pages.dev` (no trailing `/` or `/#admin`). |
| `MATCHZY_WEBHOOK_SECRET` | Secret | Random shared secret (at least 24 characters) also used in MatchZy's `Authorization` header. |

Production and Preview environments can have separate settings. Sign in at `/#admin` — the top banner should read **ONLINE ADMIN** (if it says **LOCAL PREVIEW**, check your D1 binding and migrations).

Sessions are stored as hashed tokens in D1 with `HttpOnly`, `SameSite=Lax`, and `Secure` (over HTTPS) cookies. All write endpoints enforce origin and role checks. Five failed login attempts trigger a 10-minute cooldown. Revision checks prevent concurrent admins from overwriting each other.

## Teams, Rosters & Match Settings

- **Teams & Players:** Edit team name, short tag, color, seed, add/remove teams, manage up to 5 players with SteamID64, display name, and captain. The bracket is an 8-seed double-elimination tree.
- Admins can upload team logos; captains signed in with Steam can edit only their own team's name, short tag, and logo under **Player → Team identity**. PNG/JPEG/WebP images are resized to 256×256. Name and logo edits never reset results or vetoes.
- SteamID64 is a 17-digit string. Duplicate SteamIDs or seeds are rejected. Typing a SteamID does not verify identity — the player must sign in through Steam OpenID.
- **Match management:** Venue/server label, match notes, MatchZy match ID, BO1/BO3 scores, and per-map details.
- **Match management → Opening round matchups:** Directly assign teams to `U1`–`U4`. Picking a team already in another match swaps the two teams automatically. Click **Save changes** in the sticky save bar to apply. If matches already have activity, confirmation to reset tournament results/vetoes is requested.
- **Tournament & API:** Tournament title, organizer contact, minimal presentation mode, DatHost server ID/address, rehearsal toggle, full tournament reset, and connection overview.

Roster, SteamID, and captain edits apply to upcoming matches. Matches whose veto has started or finished keep their frozen lineup. To apply updated rosters to a selected unloaded match, use **Refresh match lineup**.

**System & Backup:** SQL/service readiness, live DatHost connection test, last webhook timestamp, audit log, full JSON export, and validated atomic restore.

## Steam Sign-In & Readiness

**Sign in with Steam** uses Steam OpenID — passwords never touch this site. The server verifies the assertion directly with Steam, checking identity, signed fields, return URL, and single-use state. No Steam Web API key is required; VAC status and game ownership are not checked.

If a verified Steam account is not yet on a roster, an admin can add them from **Teams & Players → Add player**. Rostered players click **Ready** on their match (valid for 30 minutes). Once all 5 verified players on both teams are ready, the map veto starts automatically and readiness locks.

## Map Veto

- **BO1:** A ban → B ban → A ban → B ban → A ban → B ban → remaining decider map.
- **BO3:** A ban → B ban → A pick → B pick → A ban → B ban → decider map. Play order: A pick, B pick, decider.
- Only the active captain can submit a move; spectators and other players follow live. Admin overrides are logged in the move history.
- Moves are two-step (select map → confirm) with optimistic concurrency control. Starting sides are decided by a knife round on the server.
- 3.5 seconds after veto completes, the page returns to the home view highlighting the match and its selected map.
- Admins can bypass readiness checks via **Force-start real veto** (requires equal rosters of 1–5 players with SteamID64s). Rehearsal vetoes never generate real MatchZy configs or webhook bindings.

## Steam Registrations & In-Game Names

Under **Admin → Steam registrations**, view SteamID64, Steam profile name, roster assignment, last verification time, last in-game name reported by MatchZy, and the next match's in-game name. Admins and players can refresh Steam profile names on demand.

In tournament MatchZy configs, the team's **Short tag** is prefixed to the player's name (e.g., tag `123` + player `abcd` → `123 | abcd`). Enabling **Use Steam name in-game** per player uses their latest valid Steam profile name when available, falling back to their roster name. Private 1v1 rooms use their own player names.

Once a real veto completes, load the match config on the server (either via DatHost one-click load or manually):

```text
matchzy_loadmatch_url "https://YOUR-SITE.pages.dev/api/match-config?match=U1" "Authorization" "Bearer YOUR_WEBHOOK_SECRET"
```

The config includes match ID, rosters, ordered maplist, and `skip_veto: true`. Secrets are never embedded in the downloadable JSON.

## Damage & Arena Rating 1.0

Only **this match's** `damage` and `rounds_played` values are aggregated (`ADR = damage / rounds_played`). Arena Rating 1.0 is an open community formula, not HLTV's proprietary rating:

```text
0.45 × (kills per round / 0.70)
+ 0.35 × (ADR / 80)
+ 0.20 × (survived rounds ratio / 0.32)
```

Clamped to `0.00–3.00`. When damage or round data is unavailable, ADR and rating display `—`.

Map image sources: [`public/maps/SOURCES.md`](../public/maps/SOURCES.md).
For live DatHost server setup, see [Live Server Guide](LIVE-SERVER.md).
For 2-player testing without 10 people, see [Private 1v1 Guide](1V1.md).
