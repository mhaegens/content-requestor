# Requestr — content-requestor

Self-hosted media request app for Jellyfin.

Friends search for movies and TV shows via TMDB and submit requests. The admin gets a clean list of TMDB IDs to action — no Jellyfin API integration required, no user accounts needed.

---

## Features

- Search movies and TV series by title or TMDB ID
- Filter results by type (All / Movies / TV Series)
- One-click request with duplicate prevention
- Public wish list showing all pending requests and who asked
- Admin panel (`/masterview`) with copy-to-clipboard TMDB IDs and bulk management
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
| `CLOUDFLARE_TUNNEL_TOKEN` | No | Cloudflare Tunnel token. Remove from `docker-compose.yml` if using a different reverse proxy. |

---

## Pages

| Route | Who uses it | Description |
|---|---|---|
| `/` | Everyone | Search for movies & TV shows and submit requests |
| `/wishlist` | Everyone | See all pending requests |
| `/masterview` | Admin only | Copy TMDB IDs, delete individual or all requests |

The `/masterview` URL is not linked from any public page — share it only with yourself.

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
