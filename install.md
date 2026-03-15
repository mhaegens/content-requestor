# Requestr — Complete Installation Guide

This guide takes you from **zero** to a fully working Requestr instance at
`https://requests.haegens.be` — running inside a fresh Debian 12 LXC container
on your `pve-homelab` Proxmox node, exposed via the existing **homelab** Cloudflare
Tunnel you already use for Home Assistant and Jellyfin.

By the end you will have added one more service to your tunnel:

```
pve-homelab
  ├── cloudflared (systemd) ── homelab tunnel ──► Cloudflare ──► internet
  │     └── ingress rules:
  │           ha.haegens.be       → 192.168.0.184:8123   (existing)
  │           jellyfin.haegens.be → 192.168.0.X:8096     (existing)
  │           requests.haegens.be → 192.168.0.X:3000     ← new
  │
  └── CT 180 (requestr) — Debian 12, 1 vCPU, 1 GB RAM, 8 GB disk
        └── content-requestor container  (port 3000)
```

No new tunnel, no new token, no Docker cloudflared sidecar — just an extra
line in `/etc/cloudflared/config.yml`.

---

## What you need before you start

- Access to the Proxmox web UI (`https://<your-proxmox-ip>:8006`)
- SSH or shell access to `pve-homelab` (for editing the cloudflared config at the end)
- A free TMDB account: <https://www.themoviedb.org>
- A plain text file open on your computer to hold one token while you collect it

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

## Step 2 — Create the LXC container in Proxmox

Open the Proxmox web UI at `https://<your-proxmox-ip>:8006` and log in.

### 2a. Open the Create CT wizard

Click the blue **"Create CT"** button in the top-right corner of the page.

### 2b. General tab

| Field | Value |
|---|---|
| Node | `pve-homelab` |
| CT ID | `180` |
| Hostname | `requestr` |
| Unprivileged container | ✅ **checked** |
| Password | choose a root password and write it down |

Click **Next**.

### 2c. Template tab

| Field | Value |
|---|---|
| Storage | `local` |
| Template | `debian-12-standard_12.12-1_amd64.tar.zst` |

> This template is already downloaded on your node — it will appear in the
> dropdown immediately.

Click **Next**.

### 2d. Disks tab

| Field | Value |
|---|---|
| Storage | `local-lvm` |
| Disk size (GiB) | `8` |

Click **Next**.

### 2e. CPU tab

| Field | Value |
|---|---|
| Cores | `1` |

Click **Next**.

### 2f. Memory tab

| Field | Value |
|---|---|
| Memory (MiB) | `1024` |
| Swap (MiB) | `512` |

Click **Next**.

### 2g. Network tab

| Field | Value |
|---|---|
| Bridge | `vmbr0` |
| IPv4 | `DHCP` |
| IPv6 | leave blank / SLAAC |

Click **Next**.

### 2h. DNS tab

Leave everything at the defaults. Click **Next**.

### 2i. Confirm tab

Review the summary.

> **Important:** **Uncheck "Start after created"** — you must enable Docker
> features before the first boot or Docker will not work inside the container.

Click **Finish** and wait for the task to complete (the log pane will say
`TASK OK`).

### 2j. Enable Docker-required features (critical — do this before starting)

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

### 2k. Start the container and open a console

1. With CT 180 selected, click the **Start** button (green triangle, top of page).
2. Click **Console** to open a terminal window into the container.
3. Log in as `root` using the password you set in step 2b.

You are now inside the container. All remaining commands through Step 8 are
run here.

---

## Step 3 — Initial Debian 12 setup

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

## Step 4 — Install Docker Engine

Debian 12 does not include Docker. We add the official Docker apt repository
so we get the current, supported version.

**Copy and paste each block below in order.** Wait for each block to finish
before running the next one.

### 4a. Remove any old unofficial Docker packages

```bash
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
```

This is safe to run even if nothing is installed — errors are suppressed.

### 4b. Add Docker's official GPG signing key

```bash
install -m 0755 -d /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

chmod a+r /etc/apt/keyrings/docker.gpg
```

### 4c. Add the Docker stable repository

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### 4d. Install Docker Engine and the Compose plugin

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

### 4e. Enable and start Docker

```bash
# Start Docker automatically whenever the container boots
systemctl enable docker

# Start Docker right now
systemctl start docker
```

### 4f. Verify Docker is working

```bash
docker run --rm hello-world
```

You should see a message that says:

```
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

If you see a permission error instead, go back and confirm that **Nesting** and
**keyctl** are both checked in CT 180 Options → Features (step 2j), then reboot
the container (`pct reboot 180` from the Proxmox shell) and try again.

---

## Step 5 — Clone the repository

The app will live in `/opt` — the conventional location for self-hosted software
on Linux.

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

## Step 6 — Create the environment file

The app needs one secret value: your TMDB token from Step 1. Copy the example
file that ships with the repo:

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

Replace the placeholder with your real token:

```env
TMDB_READ_TOKEN=eyJhbGciOiJIUzI1NiJ9...your full TMDB token here...
```

**How to save and exit nano:**
1. Press `Ctrl + O` (the letter O, not zero) — this writes the file
2. Press `Enter` to confirm the filename
3. Press `Ctrl + X` — this exits nano

Verify the file was saved correctly:

```bash
cat .env
```

You should see your token printed back. If you still see `YOUR_TMDB_...`,
run `nano .env` again and repeat.

> **Never commit `.env` to git.** It is already listed in `.gitignore`.

---

## Step 7 — Create the data directory

The app stores all requests in a SQLite database inside a `data/` folder.
This folder needs to exist before starting:

```bash
mkdir -p data
```

The database file (`data/requests.db`) is created automatically on first startup.

---

## Step 8 — Build and start the app

```bash
docker compose up -d --build
```

**What this does:**
- `--build` — builds the Docker image from the Dockerfile in the repo
- `-d` — runs everything in the background (detached mode)

**What happens during the build (it takes a few minutes):**

1. **Stage 1 (deps):** Installs Node.js dependencies and compiles the native
   SQLite C++ addon (`better-sqlite3`). This is the slow part.
2. **Stage 2 (builder):** Compiles the Next.js app into an optimised production bundle.
3. **Stage 3 (runner):** Creates a minimal final image with only what's needed
   to run the app — no source code, no build tools, no compiler.

> The **first build takes 3–6 minutes** depending on your internet speed and CPU.
> Every subsequent restart (without `--build`) takes under 5 seconds.

You will see a lot of output. It is done when you get your command prompt back.

Check the app started correctly:

```bash
docker compose logs app
```

Look for this near the bottom:

```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
  ✓ Ready in Xs
```

The `✓ Ready` line confirms the app is running and listening on port 3000.

---

## Step 9 — Find CT 180's IP address

The Cloudflare Tunnel config on `pve-homelab` needs to know the IP address of
this container. Find it now while you are already logged into the console:

```bash
ip addr show eth0 | grep 'inet '
```

Example output:
```
    inet 192.168.0.XXX/24 brd 192.168.0.255 scope global dynamic eth0
```

The value after `inet` and before the `/24` is the IP address —
for example `192.168.0.XXX`. **Write this down** — you need it in the next step.

> You can also find it in the Proxmox web UI: click CT 180 in the left panel →
> the **Summary** tab shows the IP address at the top.

---

## Step 10 — Add Requestr to the homelab Cloudflare Tunnel

These commands are run on **`pve-homelab`**, not inside CT 180.

Open a new terminal and SSH into your Proxmox host (or use the Proxmox web
shell: top menu → **Shell**):

```bash
ssh root@<your-proxmox-ip>
```

### 10a. Edit the tunnel config

```bash
nano /etc/cloudflared/config.yml
```

The file currently looks like this (abbreviated):

```yaml
tunnel: homelab
credentials-file: /root/.cloudflared/554a9a08-9ec8-4b2e-a4da-ae180790cec5.json

ingress:
  - hostname: ha.haegens.be
    service: http://192.168.0.184:8123
  - hostname: jellyfin.haegens.be
    service: http://192.168.0.XXX:8096
  - service: http_status:404
```

Add a new rule for Requestr **above the `http_status:404` line** — that line
must always stay last (it is the catch-all for unmatched requests).

Insert this block, replacing `192.168.0.XXX` with the IP you found in Step 9:

```yaml
  - hostname: requests.haegens.be
    service: http://192.168.0.XXX:3000
```

After editing, the ingress section should look like this:

```yaml
ingress:
  - hostname: ha.haegens.be
    service: http://192.168.0.184:8123
  - hostname: jellyfin.haegens.be
    service: http://192.168.0.XXX:8096
  - hostname: requests.haegens.be
    service: http://192.168.0.XXX:3000
  - service: http_status:404
```

Save and exit: `Ctrl + O`, Enter, `Ctrl + X`.

### 10b. Create the DNS CNAME record

This command tells Cloudflare to create a CNAME for `requests.haegens.be`
pointing to your tunnel endpoint — the same way `ha.haegens.be` and
`jellyfin.haegens.be` were set up:

```bash
cloudflared tunnel route dns homelab requests.haegens.be
```

Expected output:
```
Added CNAME requests.haegens.be which will route to this tunnel tunnelID=554a9a08-...
```

### 10c. Restart cloudflared

```bash
systemctl restart cloudflared
```

Confirm it is running and picked up the new config:

```bash
systemctl status cloudflared
```

The output should show `active (running)`. If it shows `failed`, the config
has a YAML syntax error — re-open the file and check indentation (YAML is
very sensitive to spaces).

For detailed logs:

```bash
journalctl -u cloudflared -n 30
```

---

## Step 11 — Verify everything is working

### Check the app is still running (inside CT 180)

```bash
docker compose -f /opt/content-requestor/docker-compose.yml ps
```

The `app` service should show `running`.

### Check the tunnel is routing (on pve-homelab)

```bash
journalctl -u cloudflared -n 10
```

Look for lines mentioning `requests.haegens.be` or a general
`Connection established` message with no errors.

### Open the app in your browser

Navigate to: **<https://requests.haegens.be>**

You should see the Requestr search page. On the first visit you will be
prompted to enter your name.

---

## Step 12 — Using Requestr

| URL | Purpose | Who accesses it |
|---|---|---|
| `https://requests.haegens.be/` | Search for movies & TV shows | Everyone |
| `https://requests.haegens.be/wishlist` | See all pending requests | Everyone |
| `https://requests.haegens.be/masterview` | Admin panel | You only |

### First visit — name prompt

The first time someone opens the app they are asked: **"What's your name?"**
This name is saved in their browser and attached to every request they submit.
No accounts, no passwords. They can change their name at any time by clicking
their avatar in the top-right corner.

### Submitting a request

1. Type a movie or TV show title in the search box and press **Enter**.
2. Browse the results and click **"+ Request"** on the title you want.
3. The button immediately changes to **"Already Requested"** and the item
   appears on the `/wishlist` page.

### Admin panel (`/masterview`)

This page is intentionally not linked from anywhere — only people who know
the URL can reach it.

- **Copy ID** — copies that item's TMDB numeric ID to clipboard.
- **Copy All IDs** — copies all pending TMDB IDs as a newline-separated list
  (paste directly into Jellyfin or your arr stack).
- **Trash icon** — deletes a single request.
- **Clear All** — deletes everything (requires a confirmation click).

Typical workflow: open `/masterview` → Copy All IDs → add to Jellyfin → Clear All.

---

## Step 13 — Updating the app

When a new version is available, run this inside CT 180:

```bash
cd /opt/content-requestor
git pull
docker compose up -d --build
```

Your `data/` directory (containing the SQLite database) is mounted as a Docker
volume and is never touched by updates. No requests are ever lost.

---

## Step 14 — Backup

Your entire dataset is a single file: `data/requests.db`.

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
| TMDB API token | Stored only in `.env` on CT 180 — **never** sent to browsers |
| Public exposure | Cloudflare Tunnel — **no open inbound ports** on your router |
| LAN exposure | Port 3000 is reachable on the internal LAN (required for the tunnel); not accessible from the internet without going through Cloudflare |
| Container privileges | Non-root user (uid 1001), all Linux capabilities dropped, read-only root filesystem |
| Admin panel (`/masterview`) | Obscure URL — not linked from any public page |
| XSS / injection | React escaping + Content-Security-Policy headers block external scripts |

> **Optional extra:** Add a Cloudflare Access policy (free tier) on the
> `/masterview` path so only your email address can reach it. Configure this
> in the Cloudflare Zero Trust dashboard under **Access → Applications**.

---

## Troubleshooting

| Symptom | What to check / fix |
|---|---|
| Docker fails to start inside the LXC | CT 180 → Options → Features — confirm **Nesting** ✅ and **keyctl** ✅ are both checked; reboot with `pct reboot 180` on the Proxmox shell |
| `docker: command not found` | Re-run all commands in Step 4 from the beginning |
| Build fails: `no space left on device` | Run `df -h` inside CT 180 — if `/` is full, expand in Proxmox: CT 180 → Resources → Disk → Resize |
| App container exits immediately | Run `docker compose logs app` inside CT 180 — the error will be there |
| `TMDB_READ_TOKEN is not set` error | Run `cat /opt/content-requestor/.env` — confirm the token is present |
| TMDB search returns no results | Token is wrong or expired — re-copy from <https://www.themoviedb.org/settings/api> |
| `requests.haegens.be` shows a Cloudflare error | Check `systemctl status cloudflared` on `pve-homelab`; check the ingress rule is present and the IP is correct |
| cloudflared fails to restart | Check for YAML syntax errors in `/etc/cloudflared/config.yml` — indentation must use spaces, not tabs |
| DNS not resolving | Re-run `cloudflared tunnel route dns homelab requests.haegens.be` on `pve-homelab` |
| Page loads but shows connection error | The IP in the cloudflared config may be wrong — re-check Step 9 and update `/etc/cloudflared/config.yml` |
| `permission denied` on `data/` | Run `chown -R 1001:1001 /opt/content-requestor/data/` inside CT 180 |

---

## Appendix — Local development (no Docker)

To run the app on your laptop for development:

```bash
# Requires Node.js 20 or newer — check with: node --version
npm install
cp .env.example .env.local
# Edit .env.local and add your TMDB_READ_TOKEN
npm run dev
```

Open <http://localhost:3000> in your browser. File changes reload automatically.
The Cloudflare Tunnel is not used in local development.
