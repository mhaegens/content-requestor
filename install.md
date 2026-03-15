# Requestr — Installation Guide

Self-hosted media request app for Jellyfin.
Stack: Next.js 14 · SQLite · Docker · Cloudflare Tunnel

---

## Security overview

Before you start, understand how this app is secured:

| Concern | How it's handled |
|---|---|
| TMDB API key | Stored only in `.env` on the host; **never** sent to the browser |
| Public exposure | Cloudflare Tunnel provides HTTPS with no open inbound ports |
| LAN exposure | Docker binds to `127.0.0.1:3000` only, not `0.0.0.0` |
| Container privileges | Non-root user, all Linux capabilities dropped, read-only rootfs |
| Admin panel (`/masterview`) | Obscure URL — no password, but also not linked from any public page |
| XSS / injection | React escaping + Content-Security-Policy headers restrict all external scripts |

> **Recommendation:** For extra admin panel security, place Cloudflare Access (free tier) in front of the `/masterview` route.
> This app is designed to add **zero attack surface** to the rest of your homelab — no open ports, no root processes, no writable filesystem outside the data volume.

---

## Prerequisites

- A Linux host (LXC container, VM, or bare metal) with:
  - Docker Engine ≥ 24
  - Docker Compose ≥ 2
- A Cloudflare account with a domain (for Cloudflare Tunnel)
- Your TMDB Read Access Token (see step 1)

---

## Step 1 — Get your TMDB Read Access Token

1. Sign in (or create a free account) at <https://www.themoviedb.org>
2. Go to **Settings → API**: <https://www.themoviedb.org/settings/api>
3. Copy the value labelled **"API Read Access Token (v4 auth)"**
   It is a long JWT string beginning with `eyJ…`

> **Security note:** This token is placed only in the `.env` file on your server.
> It is loaded server-side at runtime and is **never** bundled into the JavaScript
> sent to browsers.

---

## Step 2 — Get your Cloudflare Tunnel token

1. Log in to the Cloudflare dashboard: <https://one.dash.cloudflare.com>
2. Go to **Networks → Tunnels → Create a tunnel**
3. Choose **Cloudflared**, give it a name (e.g. `requestr`)
4. In the connector setup page, select **Docker** — Cloudflare will show you
   a `docker run` command containing `--token <TUNNEL_TOKEN>`.
   Copy the token value.
5. Add a Public Hostname in the tunnel config:
   - **Subdomain:** `requests` (or whatever you prefer)
   - **Domain:** your Cloudflare-managed domain
   - **Service:** `http://app:3000` *(uses the Docker Compose service name)*

> If you already run a reverse proxy (Nginx Proxy Manager, Traefik, Caddy),
> remove the `cloudflared` service from `docker-compose.yml` and proxy
> `localhost:3000` through your existing setup instead.

---

## Step 3 — Deploy the app

### 3a. Clone the repository

```bash
git clone https://github.com/mhaegens/content-requestor.git
cd content-requestor
```

### 3b. Create the environment file

```bash
cp .env.example .env
```

Open `.env` in your editor and fill in the values:

```env
# Paste your TMDB Read Access Token from Step 1
TMDB_READ_TOKEN=eyJhbGciOiJIUzI1NiJ9...YOUR_TOKEN_HERE...

# Paste your Cloudflare Tunnel token from Step 2
# (Remove this line if you are not using Cloudflare Tunnel)
CLOUDFLARE_TUNNEL_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...YOUR_TUNNEL_TOKEN_HERE...
```

> **Never commit `.env` to git.** It is already listed in `.gitignore`.

### 3c. Create the data directory

```bash
mkdir -p data
```

The SQLite database (`data/requests.db`) is created automatically on first run.

### 3d. Build and start

```bash
docker compose up -d --build
```

The build compiles the native SQLite addon and the Next.js app.
First build takes 2–4 minutes; subsequent restarts are instant.

### 3e. Verify it's running

```bash
docker compose ps          # both services should be "running"
docker compose logs app    # look for "Ready on http://0.0.0.0:3000"
```

Open your Cloudflare Tunnel URL in a browser. You should see the Requestr search page.

---

## Step 4 — Usage

| URL | Who uses it |
|---|---|
| `/` | Everyone — search for movies & TV shows |
| `/wishlist` | Everyone — see all pending requests |
| `/masterview` | Admin only — copy TMDB IDs, delete requests |

- The `/masterview` URL is **not linked** from any public page.
  Share it only with yourself.
- Users enter their name on first visit (stored in browser `localStorage` only).
  No accounts, no passwords.

---

## Updating

```bash
cd content-requestor
git pull
docker compose up -d --build
```

The `data/` volume is preserved across updates — no requests are lost.

---

## Backup

Back up only the `data/` directory:

```bash
cp -r data/ data.backup-$(date +%Y%m%d)/
# or
sqlite3 data/requests.db ".backup data/requests.backup.db"
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| App won't start | Check `docker compose logs app` for missing env vars |
| "TMDB_READ_TOKEN is not set" error | Ensure `.env` file exists and has `TMDB_READ_TOKEN=...` |
| TMDB search returns no results | Verify the token is correct and not expired |
| Cloudflare Tunnel not connecting | Check `docker compose logs cloudflared`; re-paste the tunnel token |
| Database errors | Ensure `./data` is writable by uid 1001: `sudo chown -R 1001:1001 data/` |
| Port 3000 already in use | The port is bound to `127.0.0.1` only and accessed by cloudflared — if another service uses 3000, change the left side of the port mapping to e.g. `127.0.0.1:3001:3000` and update the tunnel service URL accordingly |

---

## Running without Cloudflare Tunnel

If you use a different reverse proxy on the same host, remove the `cloudflared`
service from `docker-compose.yml` and configure your proxy to forward to
`localhost:3000`.

Example Nginx config snippet:

```nginx
server {
    listen 443 ssl;
    server_name requests.yourdomain.com;

    # ... your SSL cert config ...

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> Keep the bind address `127.0.0.1:3000` in `docker-compose.yml` — do **not**
> change it to `0.0.0.0:3000`, as that would expose the app directly to your LAN.

---

## Development (local, no Docker)

```bash
# Requires Node.js 20+
npm install
cp .env.example .env.local
# Edit .env.local and add your TMDB_READ_TOKEN
npm run dev
# Open http://localhost:3000
```
