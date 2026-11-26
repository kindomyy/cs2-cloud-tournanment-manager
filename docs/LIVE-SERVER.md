# Live CS2 Match Setup with DatHost & MatchZy

If your site is deployed on `workers.dev`, start with the [Workers Setup Guide](WORKERS.md).
For one-click server controls and recovery tools, see the [Operations Guide](OPERATIONS.md).

This guide assumes Metamod:Source and CounterStrikeSharp are already installed on your DatHost CS2 server.

## 1. Deploy the Site with Online Management

Deploy via GitHub-connected Cloudflare Pages (`npm run build`, output `dist`) or Workers (`npm run deploy:worker`). Static ZIP uploads do not include API endpoints.

Apply all 4 D1 migrations (`0001`–`0004`), bind `DB`, and set:

| Variable | Value |
| --- | --- |
| `PUBLIC_ORIGIN` | Exact HTTPS site origin (no trailing `/` or `/#admin`) |
| `ADMIN_PASSWORD` | Secret, at least 12 characters |
| `MATCHZY_WEBHOOK_SECRET` | Secret, at least 24 characters (shared with MatchZy) |

Verify that `/#admin` shows **ONLINE ADMIN**, `/api/arena` returns JSON with `"steamConfigured": true`, and `/api/matches` returns `{"configured":true,"matches":[]}`.

## 2. Install MatchZy on DatHost

1. Use DatHost's one-click MatchZy mod installer if available, or upload the compatible MatchZy-only release from [MatchZy Releases](https://github.com/shobhit-pathak/MatchZy/releases) into `game/csgo/`.
2. Restart the server and run in the DatHost console:

```text
meta list
css_plugins list
```

Verify CounterStrikeSharp and MatchZy both load without errors. Make sure your CounterStrikeSharp and .NET runtime versions meet the requirements in [MatchZy Installation Docs](https://shobhit-pathak.github.io/MatchZy/installation/).

## 3. Configure the Remote Log Webhook

Copy [`config/matchzy/config_override.cfg.example`](../config/matchzy/config_override.cfg.example) to **`game/csgo/cfg/MatchZy/config_override.cfg`** on your server (or append to your existing override file), replacing the placeholders:

```text
matchzy_remote_log_url "https://YOUR-SITE.pages.dev/api/webhooks/matchzy"
matchzy_remote_log_header_key "Authorization"
matchzy_remote_log_header_value "Bearer YOUR_WEBHOOK_SECRET"
matchzy_ready_mode 0
matchzy_time_to_start 0
```

The last two lines enable the in-game `.ready` flow and prevent forfeit timeouts while waiting for players. Restart the server and never commit your real secret to Git or share it in chat.

## 4. Prepare Rosters & Complete the Veto

1. In **Admin → Teams & Players**, save real team names, logos, SteamID64 rosters (up to 5 players), and captains.
2. Disable rehearsal mode under **Tournament & API** and reset any old rehearsal vetoes.
3. Have players sign in with Steam and click **Ready**. At 10/10 ready, the full-screen veto opens automatically.
   - For smaller rosters (1–5 equal players per team, all with SteamID64s) or to bypass readiness checks, admins can use **Force-start real veto**.
4. Once veto finishes, the page returns to the home view showing the match and its selected map.

## 5. Load the Match onto the Server

- **Recommended (DatHost API):** Configure `DATHOST_EMAIL`, `DATHOST_PASSWORD`, and your server ID as described in [Operations Guide](OPERATIONS.md#4-load-a-match-onto-the-server-with-one-click), then click **Load match on server**.
- **Manual console alternative:** Run in the DatHost console (e.g., for match `U1`):

```text
matchzy_loadmatch_url "https://YOUR-SITE.pages.dev/api/match-config?match=U1" "Authorization" "Bearer YOUR_WEBHOOK_SECRET"
```

> **Site Ready ≠ In-Game `.ready`:** After the match config loads on the server, all players must join the CS2 server and type `.ready` in game chat. The knife round winner selects sides with `.stay` or `.switch`.

## 6. Troubleshooting

| Symptom | Check |
| --- | --- |
| `Unknown command: matchzy_loadmatch_url` | MatchZy is not loaded; check `css_plugins list` and plugin logs. |
| Match config returns `401` | Verify the Bearer secret in your command matches Cloudflare's `MATCHZY_WEBHOOK_SECRET`. |
| Match config returns `422` | Ensure the real veto (not rehearsal) is completed and rosters are valid. |
| MatchZy ID range error | MatchZy requires IDs in `1–2147483647`. Click **Generate compatible ID** in Admin and save. |
| Match loads, but no live scores appear | Check `config_override.cfg` URL/Authorization header and Cloudflare Functions logs. |
| Webhook returns `422` | Ensure server SteamIDs and map order match the site's match config. |
| Veto finished, but no match config link | Rehearsal vetoes do not generate real configs; reset and run a real veto. |
