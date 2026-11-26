# Operations, DatHost Controls & Full Backups

This guide covers admin operations: D1 migrations, DatHost API setup, one-click match loading, round backup recovery, forfeits, replays, and full tournament backup/restore.

## 1. Apply SQL Migrations

If you already applied `0001`–`0003`, you only need `0004_operations.sql`:

1. Open [`migrations/0004_operations.sql`](../migrations/0004_operations.sql) and copy its full contents.
2. In the Cloudflare Dashboard, go to **Storage & databases → D1 SQL Database**.
3. Open the database bound as `DB` on your Pages/Worker project.
4. Go to the **Console** tab, paste the SQL, and click **Execute**.
5. Once **Success** appears, open `/#admin` → **System & Backup → Refresh status** and verify **SQL tables: Ready**.

For a fresh setup, run `0001`, `0002`, `0003`, and `0004` in order. None of the migrations delete existing records.

## 2. Connect DatHost API Access

DatHost's official API uses HTTP Basic Auth with your account email and password. Credentials stay strictly inside Cloudflare Secrets and are never sent to browsers, backups, or audit logs.

1. Go to Cloudflare → **Workers & Pages → your project → Settings → Variables and Secrets**.
2. Add a **Secret** named `DATHOST_EMAIL` with your DatHost login email.
3. Add a **Secret** named `DATHOST_PASSWORD` with your DatHost login password.
4. If the server is shared with you from another account, also add a **Secret** named `DATHOST_ACCOUNT_EMAIL` with the server owner's email.
5. Redeploy so the new secrets take effect.
6. In the site's **Admin → Tournament & API** tab, enter your 24-character **DatHost server ID** (from the end of your DatHost console URL) and **Server connection address (`host:port`)**, then click **Save changes**.
7. Open **System & Backup** and click **Test DatHost connection**. This reads server metadata only — it does not start a match.

> **Configured** and **Last connection test succeeded** are tracked separately. Re-test whenever you change the server ID or credentials. `DATHOST_SERVER_ID` is also supported as an environment variable and overrides the panel value when set.

If you see `Variables cannot be added to a Worker that only has static assets`, fix your Worker deploy command to `npm run deploy:worker` (see [Workers Guide](WORKERS.md)).

Official references: [DatHost API](https://dathost.net/api) · [Console endpoint](https://dathost.readme.io/reference/post_game_server_console) · [MatchZy match setup](https://shobhit-pathak.github.io/MatchZy/match_setup/).

### Organizer Contact & Minimal View

- **Organizer contact:** Fill in **Organizer / contact name** and **Organizer contact method** under **Admin → Tournament & API** and save. These appear publicly on the **Rules** page.
- **Minimal view:** Enable **Minimal view** under **Site appearance** and choose one **Active match on homepage** (or **No active match · Bracket only**). This highlights the chosen match and brackets without affecting game servers or results.

## 3. Match Settings & Opening Matchups

- Edit venue/server labels and player match notes under **Admin → Match management → `<match>` → Settings**, then save using the sticky save bar.
- Assign `U1`–`U4` opening round teams at the top of **Match management → Opening round matchups**. Selecting a team already in another slot swaps the two teams cleanly.

## 4. Load a Match onto the Server with One Click

1. Save rosters and complete the real map veto (rehearsal vetoes cannot be loaded onto a server).
2. Go to **Admin → Match management → `<match>` → Server**.
3. Click **Load match on server** and confirm. The match phase moves to **Awaiting server confirmation**, then **In-game warmup** once MatchZy sends `series_start`.
4. Players can use **Join server** or copy the `connect IP:port` command.
5. Both teams type `.ready` in game chat. After the knife round and side pick (`.stay` / `.switch`), the match goes live.

Private 1v1 rooms offer the same server controls inside the room page. The site generates a short-lived, single-use config URL for MatchZy so you never need to upload JSON files manually.

**Pause**, **Unpause**, and **End match on server** all require confirmation. Concurrent loads on the same server are blocked. If a network timeout leaves a server lock stuck after you manually ended the match in the DatHost console, clear it under **System & Backup → Stuck server lock → Mark server as idle**.

## 5. Lineup Refresh, Forfeits & Replays

- **Lineup refresh:** Roster edits apply to future matches without resetting the tournament. To apply an updated roster to a selected unloaded match, use **Recovery actions → Refresh match lineup** (clears ready/veto for that match only).
- **Forfeit:** Under **Forfeit result**, pick the winner and enter a reason. Recorded as `13–0` (BO1) or `2–0` (BO3) with no fabricated stats. End any active game on the server separately.
- **Replay with new match ID:** Confirms the server match is stopped, rotates the match ID (and affected downstream IDs), preserves historical stats, and optionally keeps the existing veto.

## 6. Round Backup Recovery

Enter the MatchZy backup round number under **Recovery actions → Server backup round** and click **Restore backup on server** (uses MatchZy's `css_restore`). The site hides stale round scores and waits for the next round total to equal `backup round_number + 1`.

If a backup was restored directly on the server without the webhook reaching the site, use **Sync site to backup state** to align the site's expected round without sending a command to the server.

## 7. Full Backup, Atomic Restore & Results

- **Download full backup:** Exports teams, schedule/settings, manual results, map records, vetoes, match lineups, and private 1v1 rooms. Passwords, webhook secrets, sessions, and Steam verifications are excluded.
- **Restore backup:** Select a JSON backup file to validate schemas and counts, confirm the server match is stopped, and click **Restore backup**. D1 updates atomically in a single batch and automatically stores a compressed pre-restore safety backup.
- **Results page:** Aggregates completed tournament matches only (excluding forfeits and private 1v1s) and clearly discloses incomplete damage coverage rather than inventing an MVP.
