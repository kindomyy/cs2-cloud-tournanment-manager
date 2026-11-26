# User Roles & Access Boundaries

Permissions are never trusted from browser-supplied roles, team IDs, or player IDs. The server derives all access strictly from the `HttpOnly` session cookie and saved D1 rosters. Hiding buttons in the UI is never the sole security boundary.

| Role | Allowed Actions | Boundaries |
| --- | --- | --- |
| **Visitor** | View matches, results, teams, rules, and live veto progress | Cannot mark ready or edit teams, rosters, vetoes, scores, or server controls. Server join addresses and admin logs are hidden. |
| **Player** | Toggle own ready status on assigned matches; access own private 1v1 rooms | Cannot mark ready for other players. Cannot edit rosters, captains, or seeds. |
| **Captain** | All Player permissions; edit own team's name, short tag, and logo; submit real veto moves on own turn | Cannot edit other teams, add/remove players, or change SteamIDs/captains. Rehearsal vetoes are admin-only. |
| **Site Admin** | Manage rosters, captains, matchups, settings, scores, veto overrides, server controls, backups, and 1v1 rooms | Admin login is separate from Steam verification and never forges player readiness (explicit bypass confirmation is required). |

Signing in with Steam alone does not grant player or captain rights — the verified SteamID64 must match a saved roster entry. Active and completed matches use their frozen lineup and captain snapshot.

If a player slot's SteamID64 is replaced, the new account does not inherit the previous account's verification, readiness, or captain permissions. A replaced player can finish an already-frozen active match, but once that match completes, former participation grants no further server access.

## Data Exposure to Browsers

- Admins receive the full management snapshot required for operations.
- Non-admin users never receive other players' SteamID64 lists or global Steam registration records — only their own SteamID64.
- DatHost server IDs and recovery details are admin-only. Server join addresses are shown only to rostered players/admins (or room participants/admins for private 1v1s).
- Admin rehearsal vetoes are never exposed to visitors or players, and captains cannot operate rehearsal vetoes.
- SteamIDs inside public completed/live tournament match stats are part of public match scoreboards; private 1v1 stats and global verified accounts are never leaked there.

Match config downloads and server controls require either an admin session or the configured webhook secret. All write endpoints enforce same-origin checks.
