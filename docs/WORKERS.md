# Deploying on Cloudflare Workers (`workers.dev`)

This project runs on both Cloudflare Pages Functions and **Cloudflare Workers (Static Assets)**. [`server/worker.ts`](../server/worker.ts) wires all Steam, admin, veto, operations, and MatchZy API endpoints into a single Worker, and [`wrangler.worker.jsonc`](../wrangler.worker.jsonc) bundles static assets (`dist/`) alongside the API.

## 1. Configure `wrangler.worker.jsonc` & Build Settings

Update `"name"` and `"PUBLIC_ORIGIN"` in [`wrangler.worker.jsonc`](../wrangler.worker.jsonc) to match your own Worker name and URL (without any trailing `/` or `/#admin`).

In Cloudflare Dashboard → **Workers & Pages → your Worker → Settings → Build** (connected to GitHub `main`):

| Field | Value |
| --- | --- |
| **Build command** | `npm run build` |
| **Deploy command** | `npm run deploy:worker` |
| **Root directory** | Repository root (blank) |

The deploy command must use `wrangler.worker.jsonc`; deploying only `dist/` will serve static HTML without any `/api/*` routes.

Bind your D1 database under **Bindings → Add binding → D1 Database** with the variable name **`DB`**.

## 2. Apply SQL Migrations

Open your D1 database in Cloudflare **Storage & databases → D1 SQL Database → Console** and run these 4 files in order:

1. [`0001_matchzy.sql`](../migrations/0001_matchzy.sql)
2. [`0002_management.sql`](../migrations/0002_management.sql)
3. [`0003_private_duels.sql`](../migrations/0003_private_duels.sql)
4. [`0004_operations.sql`](../migrations/0004_operations.sql)

All migrations use `CREATE TABLE IF NOT EXISTS` and preserve existing records.

## 3. Add Worker Variables & Secrets

Under **Worker → Settings → Variables and Secrets**:

| Name | Type | Value |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | Text | Your exact `https://YOUR-WORKER.workers.dev` (or custom domain) URL |
| `ADMIN_PASSWORD` | Secret | Your admin password (at least 12 characters) |
| `MATCHZY_WEBHOOK_SECRET` | Secret | Random shared secret (at least 24 characters) |

For one-click DatHost controls from the admin panel, also add `DATHOST_EMAIL` and `DATHOST_PASSWORD` as Secrets (see [Operations Guide](OPERATIONS.md)). Redeploy after saving.

## 4. Verify Steam & API Endpoints

Open `https://YOUR-WORKER.workers.dev/api/arena`:
- **JSON with `"steamConfigured": true`:** D1 schema and `PUBLIC_ORIGIN` are ready.
- **`503` / D1 error:** Check the `DB` binding and SQL migrations.
- **HTML page:** Deploy command is still uploading static assets only; fix Step 1.

Sign in at `/#admin` with your `ADMIN_PASSWORD`, save rosters/captains, and test **Sign in with Steam** at `/#oyuncu`.

## 5. Connect MatchZy on Your CS2 Server

Add to `game/csgo/cfg/MatchZy/config_override.cfg`:

```text
matchzy_remote_log_url "https://YOUR-WORKER.workers.dev/api/webhooks/matchzy"
matchzy_remote_log_header_key "Authorization"
matchzy_remote_log_header_value "Bearer YOUR_WEBHOOK_SECRET"
matchzy_ready_mode 0
matchzy_time_to_start 0
```

Restart the server and confirm MatchZy loads via `css_plugins list`. After a match's veto finishes, load it via the admin panel's **Load match on server** button or manually in the console:

```text
matchzy_loadmatch_url "https://YOUR-WORKER.workers.dev/api/match-config?match=U1" "Authorization" "Bearer YOUR_WEBHOOK_SECRET"
```

## Local Worker Verification

```bash
npm ci
npm run build
npm run build:worker
npx wrangler d1 migrations apply DB --local --config wrangler.worker.jsonc
npm run dev:worker
```

Create a git-ignored `.dev.vars` file with `PUBLIC_ORIGIN="http://localhost:8787"`, `ADMIN_PASSWORD`, and `MATCHZY_WEBHOOK_SECRET` to test admin sign-in locally against local D1.
