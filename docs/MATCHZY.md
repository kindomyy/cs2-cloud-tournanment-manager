# MatchZy Webhook: Live Scores & Player Statistics

Data flow: **MatchZy on CS2 Server → HTTPS Webhook → Cloudflare Pages Functions / Workers → D1 SQLite → Live Scoreboard**.

For a full step-by-step DatHost server setup, see the [Live Server Guide](LIVE-SERVER.md). In the standard admin workflow, match bindings are created automatically when a real map veto finishes.

No DatHost REST API credentials are required just to receive live stats — MatchZy's built-in remote log webhook is sufficient.

## One-Time Cloudflare Setup

This requires a **GitHub-connected Pages project** (with `functions/`) or a **Cloudflare Worker** deployment. Static ZIP uploads do not deploy webhook endpoints.

1. Create a D1 database (e.g. `kampus-arena`).
2. Run [`migrations/0001_matchzy.sql`](../migrations/0001_matchzy.sql) (plus `0002`–`0004` for full admin/veto/operations support) in the D1 SQL Console.
3. Bind the D1 database as **`DB`** in your project's **Settings → Bindings**.
4. Add `MATCHZY_WEBHOOK_SECRET` (Secret, 24+ characters) under **Variables and Secrets** and redeploy.

### Legacy `MATCHZY_BINDINGS` (Optional)

If you are using manual webhook bindings without the admin veto flow, you can still set a plaintext `MATCHZY_BINDINGS` variable:

```json
{
  "27": {
    "matchId": "U2",
    "team1": "parallax",
    "team2": "void",
    "maps": ["Nuke"]
  },
  "28": {
    "matchId": "U5",
    "team1": "nova",
    "team2": "parallax",
    "maps": ["Mirage", "Inferno", "Nuke"]
  }
}
```

- Numeric keys (`27`, `28`) are MatchZy's `matchid` values (never reuse a finished match ID).
- `matchId` is the bracket match ID (`U1`–`U7`, `L1`–`L6`, `GF`, `GF2`).
- `team1` and `team2` must match the team IDs and order on the site.
- BO1 requires 1 map; BO3 requires 3 distinct maps in play order.

## MatchZy Server Configuration

Add to `game/csgo/cfg/MatchZy/config_override.cfg`:

```text
matchzy_remote_log_url "https://YOUR-SITE.pages.dev/api/webhooks/matchzy"
matchzy_remote_log_header_key "Authorization"
matchzy_remote_log_header_value "Bearer YOUR_WEBHOOK_SECRET"
```

Keep a single space after `Bearer `. Statistics are keyed by **SteamID64**, so duplicate player nicknames never collide.

## What Appears on the Site

- `round_end`: Updates cumulative per-map player stats and current round score.
- `map_result`: Finalizes the map. BO3 series scores are derived from completed map wins.
- **K / D / A:** Separate kills, deaths, and assists columns.
- **HS%:** Weighted across maps (`total headshot_kills / total kills × 100`), showing `0%` when kills are zero and `—` when no stats exist yet.
- Unplayed third maps in a `2–0` BO3 are explicitly labeled **Not played**.
- Visible browser tabs poll `/api/matches` roughly every 5 seconds and pause in hidden tabs. On connection loss, the last good snapshot is preserved with a stale-connection warning.

## Verifying the Endpoint

Open `https://YOUR-SITE.pages.dev/api/matches`:

- **`200`, `configured: true, matches: []`**: D1 and bindings are ready, waiting for the first MatchZy event.
- **`200` with matches**: Live MatchZy data is flowing.
- **`503`**: Check the `DB` binding, SQL schema, and environment variables.
- **Webhook `401`**: Check the `Authorization: Bearer ...` header and `MATCHZY_WEBHOOK_SECRET`.
- **Webhook `422`**: Numeric match ID, 0-based `map_number`, map list, or player roster does not match.

## Schema References

Payload handling is verified against [MatchZy `Events.cs`](https://github.com/shobhit-pathak/MatchZy/blob/21c278070f9ef4eddcb0baf8f860a8e007271af6/Events.cs), [`MatchData.cs`](https://github.com/shobhit-pathak/MatchZy/blob/21c278070f9ef4eddcb0baf8f860a8e007271af6/MatchData.cs), and [`RemoteLogConfig.cs`](https://github.com/shobhit-pathak/MatchZy/blob/21c278070f9ef4eddcb0baf8f860a8e007271af6/RemoteLogConfig.cs). Duplicate and out-of-order round events are idempotently ignored in SQLite.
