# Requestr — Complete Installation Guide

This guide takes you from **zero** to a fully working Requestr instance at
`https://requests.haegens.be` — running inside a fresh Debian 12 LXC container
on your `pve-homelab` Proxmox node, exposed to the internet via a Cloudflare Tunnel
with no open inbound ports.

By the end you will have:

```
pve-homelab
  └── CT 180 (requestr) — Debian 12, 1 vCPU, 1 GB RAM, 8 GB disk
        ├── content-requestor container  (port 3000, localhost-only)
        └── cloudflared container  ──────► https://requests.haegens.be
```

---

## What you need before you start

- Access to the Proxmox web UI (`https://<your-proxmox-ip>:8006`)
- A free TMDB account: <https://www.themoviedb.org>
- Your Cloudflare login for `haegens.be`: <https://one.dash.cloudflare.com>
- A plain text file (Notepad, TextEdit, anything) open on your computer
  to temporarily hold two tokens as you collect them

You do **not** need to SSH into anything yet. The first two steps are done
entirely in your web browser.

---

## Step 1 — Get your TMDB Read Access Token

TMDB (The Movie Database) is the free API that powers all movie/TV searches
in Requestr. You need a personal API token.

1. Go to <https://www.themoviedb.org> and log in, or create a free account.
2. Click your avatar (top-right) → **Settings**.
3. In the left sidebar, click **API**.
4. Under **"API Read Access Token (v4 auth)"**, click the copy icon next to the
   long string starting with `eyJ…`

   > The token is a JWT — a very long string that looks like:
   > `eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI...` (200+ characters)

5. Paste it into your temporary text file and label it:
   ```
   TMDB token: eyJhbGciOiJIUzI1NiJ9...
   ```

> **Security note:** This token is only ever stored in the `.env` file on your
> server. It is used server-side only and is **never** sent to browsers.

---

## Step 2 — Create the Cloudflare Tunnel

This creates a secure HTTPS tunnel so the app is reachable from the internet
without opening any ports on your router or firewall.

1. Log in to the Cloudflare Zero Trust dashboard:
   <https://one.dash.cloudflare.com>

2. In the left sidebar, click **Networks** → **Tunnels**.

3. Click **"Create a tunnel"**.

4. On the "Select your tunnel type" screen, choose **Cloudflared** → click **Next**.

5. Give the tunnel a name: `requestr` → click **Save tunnel**.

6. On the "Install and run a connector" page:
   - Click the **Docker** tab.
   - You will see a `docker run` command. Inside that command is a `--token` flag
     followed by a long string. Copy **only the token value** (everything after
     `--token `, up to but not including any trailing space or quote).
   - It looks like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - Paste it into your text file and label it:
     ```
     Cloudflare tunnel token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
     ```

7. Click **Next** (do not run the docker command shown — Docker is not installed yet).

8. On the "Route tunnel" / "Public Hostname" screen, add a hostname:
   - **Subdomain:** `requests`
   - **Domain:** `haegens.be`
   - **Type:** `HTTP`
   - **URL:** `localhost:3000`
   - Click **Save tunnel**.

> Your tunnel now exists in Cloudflare and will activate automatically once
> the cloudflared Docker container comes online in Step 9.

---

## Step 3 — Create the LXC container in Proxmox

Open the Proxmox web UI at `https://<your-proxmox-ip>:8006` and log in.

### 3a. Open the Create CT wizard

Click the blue **"Create CT"** button in the top-right corner of the page.

### 3b. General tab

| Field | Value |
|---|---|
| Node | `pve-homelab` |
| CT ID | `180` |
| Hostname | `requestr` |
| Unprivileged container | ✅ **checked** |
| Password | choose a root password and write it down |

Click **Next**.

### 3c. Template tab

| Field | Value |
|---|---|
| Storage | `local` |
| Template | `debian-12-standard_12.12-1_amd64.tar.zst` |

> This template is already downloaded on your node — it will appear in the
> dropdown immediately.

Click **Next**.

### 3d. Disks tab

| Field | Value |
|---|---|
| Storage | `local-lvm` |
| Disk size (GiB) | `8` |

Click **Next**.

### 3e. CPU tab

| Field | Value |
|---|---|
| Cores | `1` |

Click **Next**.

### 3f. Memory tab

| Field | Value |
|---|---|
| Memory (MiB) | `1024` |
| Swap (MiB) | `512` |

Click **Next**.

### 3g. Network tab

| Field | Value |
|---|---|
| Bridge | `vmbr0` |
| IPv4 | `DHCP` |
| IPv6 | leave blank / SLAAC |

Click **Next**.

### 3h. DNS tab

Leave everything at the defaults. Click **Next**.

### 3i. Confirm tab

Review the summary.

> **Important:** **Uncheck "Start after created"** — you must enable Docker
> features before the first boot or Docker will not work inside the container.

Click **Finish** and wait for the task to complete (the log pane will say
`TASK OK`).

### 3j. Enable Docker-required features (critical — do this before starting)

Docker requires two kernel features to be enabled on the LXC. These are the
same settings used in CT 140 (`arr`) and your other Docker containers.

1. In the left panel, click **CT 180 (requestr)**.
2. Click the **Options** tab.
3. Double-click the **Features** row.
4. In the popup, check both boxes:
   - ✅ **Nesting**
   - ✅ **keyctl**
5. Click **OK**.

Without these two options, Docker will fail to start inside the container
with a confusing permission error.

### 3k. Start the container and open a console

1. With CT 180 selected, click the **Start** button (green triangle, top of page).
2. Click **Console** to open a terminal window into the container.
3. Log in as `root` using the password you set in step 3b.

You are now inside the container. All remaining commands in this guide are
run here (or in an SSH session to this container — whichever you prefer).

---

## Step 4 — Initial Debian 12 setup

Run these commands one at a time, waiting for each to finish before continuing.

```bash
# Update the package list
apt update
```

```bash
# Upgrade all installed packages to the latest versions
apt upgrade -y
```

This may take a minute. You will see a lot of package names scroll by — that
is normal. Wait for the prompt (`root@requestr:~#`) to return.

```bash
# Install the tools needed for the rest of this guide
apt install -y curl git ca-certificates gnupg nano sudo
```

Confirm the hostname is correct:

```bash
hostname
```

Expected output:
```
requestr
```

---

## Step 5 — Install Docker Engine

Debian 12 does not include Docker. We add the official Docker apt repository
so we get the current, supported version.

**Copy and paste each block below in order.** Wait for each block to finish
before running the next one.

### 5a. Remove any old unofficial Docker packages

```bash
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
```

This is safe to run even if nothing is installed — errors are suppressed.

### 5b. Add Docker's official GPG signing key

```bash
install -m 0755 -d /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

chmod a+r /etc/apt/keyrings/docker.gpg
```

### 5c. Add the Docker stable repository

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### 5d. Install Docker Engine and the Compose plugin

```bash
apt-get update

apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
```

This downloads and installs Docker. It will take a minute or two.

### 5e. Enable and start Docker

```bash
# Start Docker automatically whenever the container boots
systemctl enable docker

# Start Docker right now
systemctl start docker
```

### 5f. Verify Docker is working

```bash
docker run --rm hello-world
```

You should see a message that says:

```
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

If you see this, Docker is installed and working. If you get a permission
error instead, go back and confirm that **Nesting** and **keyctl** are both
checked in the LXC Options → Features (step 3j), then reboot the container
and try again.

---

## Step 6 — Clone the repository

The app will live in `/opt` — the conventional location for self-hosted
software on Linux.

```bash
cd /opt
git clone https://github.com/mhaegens/content-requestor.git
```

Move into the project directory:

```bash
cd content-requestor
```

Every command from this point on assumes you are inside
`/opt/content-requestor`. If you open a new console session later and need
to return here:

```bash
cd /opt/content-requestor
```

---

## Step 7 — Create the environment file

The app reads two secret values from a `.env` file: your TMDB token (Step 1)
and your Cloudflare Tunnel token (Step 2). This file lives only on your server
and is never committed to git.

Copy the example file that ships with the repo:

```bash
cp .env.example .env
```

Open it for editing:

```bash
nano .env
```

The file currently looks like:

```env
TMDB_READ_TOKEN=YOUR_TMDB_READ_ACCESS_TOKEN_HERE
```

Replace its contents with your two tokens. When finished the file should look
exactly like this (with your real values instead of the placeholders):

```env
TMDB_READ_TOKEN=eyJhbGciOiJIUzI1NiJ9...your full TMDB token here...

CLOUDFLARE_TUNNEL_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your full tunnel token here...
```

**How to save and exit nano:**
1. Press `Ctrl + O` (the letter O, not zero) — this writes the file
2. Press `Enter` to confirm the filename
3. Press `Ctrl + X` — this exits nano

Verify the file was saved correctly:

```bash
cat .env
```

You should see your tokens printed back. If you see `YOUR_TMDB_...` placeholders
still there, the file was not saved — run `nano .env` again and repeat.

---

## Step 8 — Create the data directory

The app stores all requests in a SQLite database inside a `data/` folder.
This folder needs to exist before starting:

```bash
mkdir -p data
```

The database file itself (`data/requests.db`) is created automatically on
first startup — you do not need to create it.

---

## Step 9 — Build and start the app

```bash
docker compose up -d --build
```

**What this does:**

- `--build` — builds the Docker images from the Dockerfile in the repo
- `-d` — runs everything in the background (detached mode)

Two containers are started:
- `app` — the Next.js + SQLite application
- `cloudflared` — the Cloudflare Tunnel connector

**What happens during the build (it takes a few minutes):**

1. **Stage 1 (deps):** Installs Node.js dependencies and compiles the native
   SQLite C++ addon (`better-sqlite3`). This is the slow part.
2. **Stage 2 (builder):** Compiles the Next.js app into an optimised
   production bundle.
3. **Stage 3 (runner):** Creates a minimal final image containing only what's
   needed to run the app — no source code, no build tools.

> The **first build takes 3–6 minutes** depending on your internet speed and CPU.
> Every subsequent restart (without `--build`) takes under 5 seconds.

You will see a lot of output. It is done when you get your command prompt back.

---

## Step 10 — Verify everything is running

### Check container status

```bash
docker compose ps
```

Both services must show `running`:

```
NAME                                  STATUS
content-requestor-app-1               running
content-requestor-cloudflared-1       running
```

If either shows `exited`, skip to the Troubleshooting section.

### Check the app started correctly

```bash
docker compose logs app
```

Scroll to the bottom. Look for these lines:

```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
  ✓ Ready in Xs
```

The `✓ Ready` line confirms the app is up and accepting requests.

### Check the tunnel is connected

```bash
docker compose logs cloudflared
```

Look for a line containing:

```
Connection established
```

or

```
Registered tunnel connection
```

This means Cloudflare has an active connection to your container and is
routing traffic from `requests.haegens.be` to the app.

### Open the app in your browser

Navigate to: **<https://requests.haegens.be>**

You should see the Requestr search page. On the first visit you will be
prompted for your name.

---

## Step 11 — Using Requestr

| URL | Purpose | Who accesses it |
|---|---|---|
| `https://requests.haegens.be/` | Search for movies & TV shows | Everyone |
| `https://requests.haegens.be/wishlist` | See all pending requests | Everyone |
| `https://requests.haegens.be/masterview` | Admin panel | You only |

### First visit — name prompt

The first time someone opens the app they are asked: **"What's your name?"**
This name is saved in their browser and attached to every request they submit.
There are no accounts or passwords. They can change their name at any time by
clicking their avatar in the top-right corner of the page.

### Submitting a request

1. Type a movie or TV show title in the search box and press **Enter**.
2. Browse the results and click **"+ Request"** on the title you want.
3. The button immediately changes to **"Already Requested"** and the item
   appears on the `/wishlist` page.

### Admin panel (`/masterview`)

This page is intentionally not linked from anywhere — only people who know
the URL can access it.

- **Copy ID** button on each row — copies that item's TMDB numeric ID to clipboard.
- **Copy All IDs** button at the top — copies all pending TMDB IDs as a
  newline-separated list (paste directly into Jellyfin or your arr stack).
- **Trash icon** on each row — deletes that single request.
- **Clear All** button — deletes everything after a confirmation dialog.

Typical workflow: open `/masterview` → Copy All IDs → add media to Jellyfin →
click Clear All.

---

## Step 12 — Updating the app

When a new version is available:

```bash
cd /opt/content-requestor

# Pull the latest code from GitHub
git pull

# Rebuild images and restart containers
# The -d flag keeps everything running in the background
docker compose up -d --build
```

Your `data/` directory (containing the SQLite database) is mounted as a
Docker volume and is completely untouched by updates. No requests are lost.

---

## Step 13 — Backup

Your entire dataset is a single file: `data/requests.db`. Back it up before
updates or at any time:

```bash
# Simple file copy — safe to run while the app is running
cp -r /opt/content-requestor/data/ \
      /opt/content-requestor/data.backup-$(date +%Y%m%d)/
```

For a guaranteed-consistent backup using SQLite's built-in backup command:

```bash
sqlite3 /opt/content-requestor/data/requests.db \
  ".backup /opt/content-requestor/data/requests.backup.db"
```

---

## Security overview

| Concern | How it's handled |
|---|---|
| TMDB API token | Stored only in `.env` on the host — **never** sent to the browser |
| Public exposure | Cloudflare Tunnel provides HTTPS — **no open inbound ports** on your router |
| LAN exposure | Docker binds to `127.0.0.1:3000` only — not reachable from other LAN devices |
| Container privileges | Non-root user (uid 1001), all Linux capabilities dropped, read-only root filesystem |
| Admin panel (`/masterview`) | Obscure URL — not linked from any public page |
| XSS / injection | React escaping + Content-Security-Policy headers block external scripts |

> **Optional extra:** Add a Cloudflare Access policy (free tier) on the
> `/masterview` path so only your email address can reach it even if someone
> guesses the URL. This is configured in the Cloudflare Zero Trust dashboard
> under Access → Applications.

---

## Troubleshooting

| Symptom | What to check / fix |
|---|---|
| Docker fails to start inside the LXC | CT 180 → Options → Features — confirm **Nesting** ✅ and **keyctl** ✅ are both checked; reboot the LXC and try again |
| `docker: command not found` | Re-run all commands in Step 5 from the beginning |
| Build fails: `no space left on device` | Run `df -h` — if `/` is full, expand the disk in Proxmox (CT 180 → Resources → Disk size → Resize) |
| App container exits immediately | Run `docker compose logs app` — the error message will be there |
| `TMDB_READ_TOKEN is not set` error | Run `cat /opt/content-requestor/.env` — confirm the file exists and the token is present |
| TMDB search returns no results | The token is wrong or expired — re-copy it from <https://www.themoviedb.org/settings/api> |
| Tunnel shows `exited` | Run `docker compose logs cloudflared` — if you see `Invalid token`, re-paste `CLOUDFLARE_TUNNEL_TOKEN` in `.env` and run `docker compose restart cloudflared` |
| `requests.haegens.be` shows a Cloudflare error page | Check <https://one.dash.cloudflare.com> → Networks → Tunnels — the `requestr` tunnel should show **Healthy** |
| `permission denied` on `data/` | Run `chown -R 1001:1001 /opt/content-requestor/data/` |
| Port 3000 conflict | Edit `docker-compose.yml`: change `127.0.0.1:3000:3000` to `127.0.0.1:3001:3000`; update the tunnel public hostname URL to `localhost:3001`; run `docker compose up -d` |

---

## Appendix A — Running without Cloudflare Tunnel

If you already run Nginx Proxy Manager, Traefik, or Caddy in CT 150
(`reverse-proxy`), you can use your existing setup instead of cloudflared:

1. Remove (or comment out) the `cloudflared:` service block from
   `docker-compose.yml`.
2. Remove `CLOUDFLARE_TUNNEL_TOKEN` from `.env`.
3. Change the port binding in `docker-compose.yml` from
   `127.0.0.1:3000:3000` to `0.0.0.0:3000:3000` so your reverse proxy
   container can reach it across the Docker bridge.
4. Point your proxy at `<CT-180-IP>:3000`.

Find CT 180's IP address with:

```bash
ip addr show eth0 | grep 'inet '
```

Example Nginx config snippet:

```nginx
server {
    listen 443 ssl;
    server_name requests.haegens.be;

    # ... your SSL certificate config ...

    location / {
        proxy_pass         http://<CT-180-IP>:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Appendix B — Local development (no Docker)

To run the app on your laptop for development:

```bash
# Requires Node.js 20 or newer — check with: node --version
npm install
cp .env.example .env.local
# Edit .env.local and add your TMDB_READ_TOKEN
npm run dev
```

Open <http://localhost:3000> in your browser. Changes to source files reload
automatically. The Cloudflare Tunnel is not used in local development.
