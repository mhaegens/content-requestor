# Requestr — content-requestor

Self-hosted media request app for Jellyfin.

Friends search for movies and TV shows via TMDB and submit requests. The admin approves requests to send movies to Radarr and TV shows to Sonarr. Optional Jellyfin library checks mark existing titles as available, including content added outside Requestr. No user accounts are needed.

---

## Features

- Search movies and TV series by title or TMDB ID
- Filter results by type (All / Movies / TV Series)
- One-click request with duplicate prevention
- Public wish list showing all pending requests and who asked
- Admin panel (`/masterview`) with protected approval, retry, copy-to-clipboard IDs and bulk management
- Approved movies go to Radarr; approved shows go to Sonarr, with an immediate search
- Existing Jellyfin titles are marked “In Jellyfin” and cannot be requested
- Mobile discovery loads nearby rows, uses smaller posters and mounts at most six cards per row
- Dark / light theme toggle (follows system preference, persisted)
- No accounts or passwords — name stored in browser `localStorage`
- Docker-ready with optional Cloudflare Tunnel for zero port-forwarding exposure

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | SQLite via `better-sqlite3` |
| Styling | Tailwind CSS |
| Media data | TMDB v3 REST API |
| Deployment | Docker + Docker Compose |
| Tunnel (optional) | Cloudflare Tunnel |

---

## Quick start

> For full details see [install.md](./install.md).

**1. Get a TMDB Read Access Token**
Sign in at <https://www.themoviedb.org>, go to **Settings → API**, and copy the **API Read Access Token (v4 auth)**.

**2. Clone and configure**

```bash
git clone https://github.com/mhaegens/content-requestor.git
cd content-requestor
cp .env.example .env
# Edit .env and set TMDB_READ_TOKEN=<your token>
```

**3. Start**

```bash
mkdir -p data
docker compose up -d --build
```

The app will be available at `http://localhost:3000`.
First build takes 2–4 minutes; subsequent restarts are instant.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `TMDB_READ_TOKEN` | Yes | TMDB API Read Access Token (v4 auth). Server-side only — never sent to the browser. |
| `ADMIN_API_KEY` | For admin actions | Secret used to authorize approvals and management. |
| `JELLYFIN_*`, `RADARR_*`, `SONARR_*` | No | Optional integrations; see configuration below and `.env.example`. |

---

## Pages

| Route | Who uses it | Description |
|---|---|---|
| `/` | Everyone | Search for movies & TV shows and submit requests |
| `/wishlist` | Everyone | See all pending requests |
| `/masterview` | Admin only | Copy TMDB IDs, delete individual or all requests |

Admin actions require `ADMIN_API_KEY`. Enter this key on `/masterview`; it is stored only for the browser session. Public search and requests do not require it. Set this key when upgrading: admin mutations are disabled until it is configured.

---

## Development (without Docker)

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local
# Edit .env.local and set TMDB_READ_TOKEN=<your token>
npm run dev
# Open http://localhost:3000
```

---

## Further reading

- [install.md](./install.md) — full deployment guide, security overview, troubleshooting, backup
- [PRD.md](./PRD.md) — product requirements and feature specifications

## Approval and library automation

1. Set `ADMIN_API_KEY` to a long random secret in your server environment.
2. Set `JELLYFIN_URL` and `JELLYFIN_API_KEY` (Dashboard → API Keys) to enable library checks.
3. Set `RADARR_URL`, `RADARR_API_KEY`, `RADARR_QUALITY_PROFILE_ID`, and `RADARR_ROOT_FOLDER` for movies.
4. Set the matching `SONARR_*` values for TV shows (Sonarr v4, using its v3 API).
5. Rebuild/restart the app. On Coolify, add these as runtime environment variables. The Compose file forwards all integration settings.
6. Open `/masterview`, enter your admin key, and choose **Approve**. Failed transfers show an error and a **Retry** button.

Use service addresses reachable **from the Requestr container**, such as `http://radarr:7878` and `http://sonarr:8989` on a shared Docker network, or a reachable LAN address. `localhost` inside the container means Requestr itself. URLs may include a reverse-proxy base path; do not append `/api/v3`.

API keys are in Radarr/Sonarr **Settings → General → Security**. Get profile IDs from `GET /api/v3/qualityprofile` and root folders from `GET /api/v3/rootfolder`, using the `X-Api-Key` header. The configured root path must match a root folder in that service (e.g. `/movies` or `/tv`). Do not use Requestr’s filesystem path. Each integration is optional; you can configure only Radarr or only Sonarr. Missing configuration produces a visible retryable failure, never a successful approval.

Approval adds and monitors the title and starts a search through your existing indexers/download clients. Existing entries are reused, monitored and searched; retries cannot create duplicate library entries. TV shows are resolved from TMDB to TVDB before being sent to Sonarr; all regular seasons are requested, excluding specials. Approval means **Sent to Radarr/Sonarr**, not **In Jellyfin**. Jellyfin availability is checked independently after import; no extra download client is configured by this app.

Jellyfin’s library is read in pages on the server, shared between simultaneous checks, and refreshed at most once per minute. Only availability for the displayed results is sent to the browser. Matching uses **media type + TMDB ID**; ensure Jellyfin metadata has TMDB provider IDs. A series entry counts as available even if only some episodes are present; season/episode requests are not supported. Titles without TMDB metadata cannot be matched reliably. Existing manual availability flags remain supported.

When Jellyfin is configured but unreachable, known available titles stay marked; other titles show **Library unavailable**, and new submissions/approvals wait until the library can be checked. The app retries the connection after 15 seconds. If Jellyfin is not configured, requests work normally with manual availability flags. Successful checks can be up to one minute behind library changes.

Admin routes require a Bearer token matching `ADMIN_API_KEY`; credentials and upstream response bodies are never returned to clients. Public request submission remains available without an account. Database upgrades preserve existing requests and allow movie/TV titles with the same numeric TMDB ID.

### Validation

```bash
npm ci
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Tests use fake service responses and an isolated database; they do not contact your media servers or start real downloads.

### Keeping credentials private

Keep real keys/passwords in your server environment or an ignored `.env` file. Commit only `.env.example`, which contains placeholders. `.env*`, private key/certificate files, databases and browser test output are ignored; environment files are also excluded from Docker build context. Integration credentials are read only by server modules and are not included in public Next.js configuration.

The **Secret scan** GitHub workflow scans full Git history on pushes and pull requests using Gitleaks, with redacted output. Four exact findings from an old installation guide are allowlisted because they are explicitly truncated examples, not real tokens. No file or directory containing application source is broadly exempted. Enable branch protection with **Secret scan / secrets** as a required check if you want to enforce it before merging. A scan detects many credential formats but cannot guarantee detection of every arbitrary password; if a real credential is ever committed, revoke it even after removing it from the file.
