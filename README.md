# Tarkov Task Reader

A lightweight, self-hosted reader for the Escape from Tarkov Fandom Wiki. Search locally, select a task, and fetch its current rendered wiki content through the backend. No accounts, database, build pipeline, or UI framework.

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

Open `http://YOUR_SERVER_IP:3008`. Stop with `docker compose down`. The container runs as the unprivileged Node user. The host mapping is `3008:3000`; change the first port in `compose.yaml` if needed. The application continues listening on port 3000 inside the container. No volumes or database are required. Docker was unavailable in the development environment, so the container build has not been executed there.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local HTTP listener (container uses 3000) |
| `INDEX_REFRESH_MS` | `86400000` | Refresh interval for the complete in-memory index |
| `REQUEST_TIMEOUT_MS` | `12000` | Per-attempt upstream timeout |

The index refreshes on the first request after expiry. Concurrent refreshes share one fetch; a failed refresh preserves the last successful result with a stale indicator and a 30-second retry cooldown. Restarting clears the in-memory cache. Task details are fetched anew for each selection and are not cached by this application. Fandom may cache its own rendering. Transient upstream failures retry up to twice.

## API and structure

- `GET /api/tasks`: `{tasks: [{pageid, title}], updatedAt, stale}`. Follows the full MediaWiki continuation object and deduplicates page IDs.
- `GET /api/tasks/:pageid`: sanitized sections, infobox metadata, source URL, revision, image names, and sanitized fallback article.
- `src/wiki.js`: fixed upstream, retries, pagination and index cache.
- `src/parser.js`: Cheerio DOM extraction and sanitize-html allowlist. Navigation, scripts, event handlers, unsafe URLs and inline styles are removed. Subheadings, lists, tables, images, captions and unknown sections survive.
- `public/`: plain browser code and responsive dark styling. Accessible keyboard search, internal known-task links, section anchors, URL history, abort plus generation guards, and retry states.

Images retain the wiki's thumbnail source where supplied, load lazily, and link to the wiki's image target for readable viewing. Media file-description links are included in each task's attribution. Images are loaded directly from their source; the backend is not an image or arbitrary-URL proxy.

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

Fandom availability, changes to wiki markup, and source-image hosting remain upstream dependencies. The parser is intentionally separated for future template adjustments. The cache is process-local and does not survive restarts. No task progress, authentication, persistent storage, deployment, or push is included.
