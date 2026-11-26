# Static Online Preview (Cloudflare Pages Direct Upload)

You can preview the frontend UI and local bracket simulator on Cloudflare Pages without setting up a database or backend.

> **Important:** This static ZIP is for **UI preview and browser-local trial only**. For real Steam login, shared map vetoes, and live MatchZy scores, deploy via GitHub-connected Pages Functions ([MatchZy Guide](MATCHZY.md)) or Workers ([Workers Guide](WORKERS.md)).

## Upload the Ready-Made Package

1. Generate `artifacts/kampus-arena-test.zip` locally (see below).
2. Open **Workers & Pages** in the [Cloudflare Dashboard](https://dash.cloudflare.com/).
3. Choose **Create → Pages → Direct Upload (Upload assets / Drag and drop)**. Do not select the Worker flow.
4. Name the project (e.g. `kampus-arena-test`), upload the ZIP, and click **Deploy site** (no build command needed).
5. Open the resulting `https://...pages.dev` URL. Append `/#dene` for the bracket simulator or `/#admin` for the local admin rehearsal.

`index.html` is at the root of the archive. Future updates can be uploaded to the same project under **Create deployment / Upload assets**.

## Quick Trial Walkthrough

1. Open `/#dene`, select match `U2`, set status to **Completed** with score **13 : 7**, and save.
2. Verify `U5` updates to `NOVA–PARALLAX` and `L1` updates to `ORBIT–VOID` on both the simulator and homepage bracket.
3. Enter a live `1 : 0` map score on `U5`, then change `U2` to `7 : 13` to test downstream invalidation confirmation.
4. Reload the page to confirm browser persistence, or export/import via **Download JSON backup**.
5. Opening matches use BO1 round scores; later rounds use BO3 map scores (`2 : 0` or `2 : 1`). With the second grand final enabled, a lower-bracket win in `GF` unlocks `GF2`.

## Limitations of Static Preview

- Data is stored only in `localStorage` of the current browser and origin — no cross-device sync.
- Clearing browser storage deletes trial data unless exported as JSON.
- No Steam OpenID sign-in, shared veto, or live MatchZy server integration.

## Rebuilding the Static ZIP

```bash
npm ci
npm test
npm run test:e2e
npm run package:test
```

Outputs `artifacts/kampus-arena-test.zip` (excludes source code, `node_modules`, and personal browser data).
