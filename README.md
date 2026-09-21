# Tarkov Task Reader

A lightweight, self-hosted reader for the Escape from Tarkov Fandom Wiki. Search locally, select a task, and fetch its current rendered wiki content through the backend. No accounts, database, build pipeline, or UI framework. Index snapshots are saved locally for faster startup.

## Run locally

Requires Node.js 22.13+ (Node 24 recommended) and npm.

On Windows, double-click `run-local.bat`. It checks Node.js and npm, installs dependencies if missing, and starts the reader using your existing `.env` or the defaults. Open the URL printed in the window (normally http://localhost:3000). Keep the window open while using the reader; press Ctrl+C to stop it. Errors stay visible in the window.

Or start it manually:

```sh
npm ci
cp .env.example .env
npm start
```

On PowerShell, use `Copy-Item .env.example .env` for the optional configuration copy. Open http://localhost:3000. Stop with Ctrl+C.

## Ubuntu / Docker Compose

Install Docker Engine with the Compose plugin, then from this repository:

```sh
cp .env.example .env
docker compose up -d --build
docker compose logs -f
```

Open `http://YOUR_SERVER_IP:3008`. Stop with `docker compose down`. The container runs as the unprivileged Node user. The host mapping is `3008:3000`; change the first port in `compose.yaml` if needed. The application continues listening on port 3000 inside the container. Compose uses the index-cache volume to preserve task and item indexes across container restarts and rebuilds. Docker was unavailable in the development environment, so the container build has not been executed there.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local HTTP listener (container uses 3000) |
| `INDEX_REFRESH_MS` | `86400000` | Refresh interval for task and item indexes |
| `INDEX_CACHE_DIR` | `.cache` | Directory for persistent index snapshots; Compose uses `/app/.cache` |
| `REQUEST_TIMEOUT_MS` | `12000` | Per-attempt upstream timeout |

Task and item indexes are prepared concurrently before the HTTP server starts accepting requests. Fresh disk snapshots load without wiki requests; an initial installation builds both indexes first. Expired snapshots remain immediately usable while refreshing in the background. A background timer checks for expiry even with no visitors. Refreshes are coalesced and failed fetches retain the last successful result with a 30-second retry cooldown. Missing or corrupt snapshots rebuild automatically; write failures log a warning and leave the in-memory cache usable. Fixture mode skips cache loading and all wiki startup requests. Task and item detail articles are still fetched on selection.

## API and structure

- `GET /api/tasks`: `{tasks: [{pageid, title}], updatedAt, stale}`. Follows the full MediaWiki continuation object and deduplicates page IDs.
- `GET /api/tasks/:pageid`: sanitized sections, infobox metadata, source URL, revision, image names, and sanitized fallback article.
- `src/wiki.js`: fixed upstream, retries, pagination and index cache.
- `src/parser.js`: Cheerio DOM extraction and sanitize-html allowlist. Navigation, scripts, event handlers, unsafe URLs and inline styles are removed. Subheadings, lists, tables, images, captions and unknown sections survive.
- `public/`: plain browser code and responsive dark styling. Accessible keyboard search, internal known-task links, section anchors, URL history, abort plus generation guards, and retry states.

Images retain the wiki's thumbnail source where supplied and load lazily. Clicking an image opens a larger modal viewer with captions and previous/next controls for the task's unique images. Use the left/right arrow keys to browse and Escape or Close to return to the task. Full-size images load only as they are selected. Media file-description links are included in each task's attribution. Images are loaded directly from their source; the backend is not an image or arbitrary-URL proxy.

## Verification

```sh
npm test
npm run test:live
```

The deterministic tests use the supplied real Debut response, synthetic hostile and varied HTML, paginated responses, failed refreshes, retry behavior, and DOM tests with out-of-order detail responses. The live check needs outbound HTTPS access to Fandom.

Verified September 16, 2026: 893 unique category entries across two API requests; live Debut, Introduction, The Guide, and Gunsmith - MP-133 details. Introduction retains image/table content; Gunsmith retains its Build section and parts table; The Guide retains its additional Failure Dialogue section. The current index uses weapon names for some Gunsmith tasks rather than their former part numbers. No subcategory traversal was needed for these sampled tasks; exhaustive completeness against every wiki task is not claimed.

The attached Debut fixture decodes to roughly 59 KB of HTML; extraction removes the large quest navigation while retaining all six article sections. Browser verification covers live keyboard and mouse autocomplete, task rendering, browser back navigation, and the 390px mobile guide layout; deterministic DOM tests cover stale-response suppression and retry behavior.

### Explicit offline development fixture

```sh
npm run demo
```

This intentionally serves only the attached Debut response and clearly labels fixture mode. It never activates automatically after a live request fails. Stop any running server on port 3000 first. Fixture mode is for local development and its fixture is not copied into the production Docker image.

## Content attribution and rights

The wiki's live `action=query&meta=siteinfo&siprop=rightsinfo` response reports **CC BY-NC-SA**, linking to [Fandom's licensing policy](https://www.fandom.com/licensing). This wiki-specific declaration takes precedence over Fandom's general CC BY-SA default. The reader labels article text accordingly, credits Tarkov Wiki contributors, links the source article and contributor history, and identifies extraction/reformatting. Adapted article text remains under the source license, including its noncommercial and share-alike conditions unless the source specifies otherwise.

Images may have different rights; the text license is not assumed to cover them. Each task provides image file-description links for original attribution and rights information. See [Fandom's reuse guidance](https://support.fandom.com/hc/en-us/articles/360035075654-I-want-to-reuse-text-or-images-from-a-Fandom-wiki). This independent reader is not affiliated with Fandom or Battlestate Games. The supplied fixture retains its source content license.

## Limits

Fandom availability, changes to wiki markup, and source-image hosting remain upstream dependencies. The parser is intentionally separated for future template adjustments. Index caches persist on disk; article details are not cached. No task progress, authentication, persistent storage, deployment, or push is included.

## Item lookup

A second dropdown lists all article entries reachable through the wiki Inventory category, including nested item, medicine, provision, gear, weapon, ammunition and attachment categories. It also includes inventory overview guides from those categories. Type in the single item picker, then click a suggestion or use arrow keys and Enter to fetch its current article. It shares the task picker’s appearance, prefix ranking and Escape/blur behavior. Location sections appear first as “Where to find it,” preserving container lists, map subsections and images. Articles without location sections say so; the wiki does not guarantee spawns or provide location data for every item.

`GET /api/items` returns `{items: [{pageid, title}], updatedAt, stale}`. The recursive index follows pagination, deduplicates pages and categories, and uses the same cache refresh and stale fallback behavior as tasks. `GET /api/items/:pageid` returns sanitized article content. Item URLs use `?item=PAGE_ID` and support history and retries. Fixture mode explicitly disables items.

Verified September 20, 2026: 4,696 wiki inventory entries, with a cold index load of about 25 seconds. Live Graphics card and Salewa first aid kit articles contain Location sections. This reflects wiki categorization, not an independently verified complete game database.

## Main story chapters

The task dropdown combines Category:Quests and Category:Story chapters, marks story entries “Main story,” and excludes the Story chapters overview page. Both categories follow pagination and deduplicate by page ID. Story chapters use the existing task URLs, reader, images and internal links. Verified live: 903 total entries (893 quests plus 10 story chapters); Tour and Batya retain objectives, guides, tables and stage headings. The task index adds `story: true` for main story entries. All 15 deterministic tests pass. Indexes refresh automatically on expiry.

### Cache operations

The first uncached startup waits for the wiki index build before printing the listening URL. If an index cannot be built, the server still starts and retries in the background; that picker reports an error until data becomes available. Cached startups avoid that initial fetch. Snapshots use versioned JSON, retain story chapter labels, and are replaced atomically after successful builds. The default refresh interval is 24 hours. For Docker updates use `docker compose up -d --build`; the named cache volume is retained. Docker execution was not available for verification in this environment.
