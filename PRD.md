# Product Requirements Document

## Content Requestor — Jellyfin Media Request Web App

**Version:** 1.0
**Date:** 2026-03-15
**Status:** Draft

---

## 1. Overview

A lightweight, self-hosted web application that allows a group of friends to search for movies and TV series (via TMDB) and submit requests for the admin to add to a Jellyfin media server. No authentication is required for end users. The admin view is available at an obscure URL path rather than exposed in the main navigation.

---

## 2. Goals

- Let friends browse and request media without needing Jellyfin access
- Identify who requested what via a persistent name selector
- Give the admin a simple, copy-friendly list of TMDB IDs to action
- Prevent duplicate requests and show what's already been asked for
- Look beautiful and modern on both desktop and mobile

---

## 3. Non-Goals

- No direct Jellyfin API integration (manual admin workflow)
- No user accounts or login system
- No notifications or status updates after requesting
- No per-user request limits or rate limiting

---

## 4. Pages & Routes

| Route | Name | Visibility |
|---|---|---|
| `/` | Search / Home | Public |
| `/wishlist` | Wish List | Public |
| `/masterview` | Admin Panel | Obscure URL |

The `/masterview` path is not linked from any public-facing page. Anyone who knows the URL can access it — no password prompt.

---

## 5. Feature Specifications

### 5.1 Name Selector

On first visit, users are prompted with a name modal: **"What's your name?"**

- Required before any request can be submitted
- Stored in `localStorage` and persisted across sessions
- Displayed in the header as an avatar (initials) + name chip
- Clicking the header avatar re-opens the modal to change the name
- Name is attached to every request for admin visibility
- If a user somehow bypasses the modal, requests fall back to `"Anonymous"`

### 5.2 Search Page (`/`)

**Input:**

- Single text field accepting a free-text title (e.g. `Breaking Bad`) or a TMDB numeric ID (e.g. `1396`)
- A type toggle: **All** | **Movies** | **TV Series** (default: All)
- Search triggers on Enter or clicking the Search button

**Results display (card grid):**

Each result card shows:
- Poster image (TMDB image, fallback placeholder if none)
- Title
- Year (release date for movies, first air date for TV series)
- Type badge: `Movie` or `TV Series`
- Short overview/summary (~3 lines max, truncated with ellipsis)
- TMDB rating (e.g. ★ 8.4)
- Request button — one of three states:
  - **"+ Request"** (primary CTA) — not yet in wish list
  - **"Already Requested"** (muted/disabled) — already in wish list
  - **"Requesting…"** (loading state) — in-flight

**Behavior:**

- Clicking "Request" immediately adds to the wish list (optimistic UI), button changes to "Already Requested"
- If the user searches while results exist, old results clear and new ones load
- Skeleton cards shown while results are loading
- "No results found" empty state with a friendly message
- Error state shown if the TMDB API fails

### 5.3 Wish List Page (`/wishlist`)

**Display:**

- Card grid (same card style as search results)
- Each card shows: poster, title, year, type badge, TMDB rating, requester name, date requested
- Sorted by most recently requested first
- Filter bar at top: **All** | **Movies** | **TV Series**
- Total count shown: "X items requested"

Users cannot remove their own requests from this page.

### 5.4 Admin Panel (`/masterview`)

**TMDB ID table:**

| Title | Type | TMDB ID | Requested By | Date |
|---|---|---|---|---|

- Each row has a **"Copy ID"** button (copies the numeric TMDB ID to clipboard)
- A **"Copy All IDs"** button at the top copies a newline-separated list of all TMDB IDs

**Management:**

- **"Clear All"** button — removes all items from the wish list (requires confirmation dialog: *"Are you sure? This will delete all X requests."*)
- **Individual delete** — trash icon per row to remove a single item
- Items are NOT automatically removed when actioned — admin clears manually after downloading the list

**Access:**

- The panel is not linked from any other page
- Navigating directly to `/masterview` grants access

---

## 6. Data Model

```
Request {
  id:           string   // UUID
  tmdb_id:      integer
  media_type:   "movie" | "tv"
  title:        string
  year:         string   // 4-digit
  poster_path:  string   // TMDB relative path
  overview:     string
  vote_average: float
  requested_by: string   // defaults to "Anonymous"
  requested_at: datetime // ISO 8601
}
```

Stored in a local SQLite database (`data/requests.db`). The database file is created automatically on first run.

> **POC note:** The current proof-of-concept uses `localStorage` to simulate the database. The production implementation replaces this with server-side SQLite.

---

## 7. TMDB API Integration

- Uses the TMDB v3 REST API (free tier)
- Admin provides their own TMDB API key via environment variable: `TMDB_API_KEY`
- Free-text search uses `/search/multi` (returns both movies and TV)
- ID lookup uses `/movie/{id}` and `/tv/{id}`
- Images loaded from `https://image.tmdb.org/t/p/w500/{poster_path}`
- API key is server-side only — never exposed to the client

---

## 8. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR, API routes, and routing in one package |
| Styling | Tailwind CSS + shadcn/ui | Modern, accessible, composable components |
| Database | SQLite via `better-sqlite3` | Zero-config, file-based, perfect for small scale |
| API | TMDB v3 REST API | Free, well-documented, comprehensive |
| Runtime | Node.js 20+ | Standard, good SQLite support |
| Deployment | Docker (self-hosted) | See §9 |

---

## 9. Deployment

The app is self-hosted on a **Proxmox VE** home server and exposed via **Cloudflared** tunnel — no port forwarding required.

**Recommended stack:**

```
Proxmox VE
  └── LXC container or VM running Docker
        └── content-requestor (Docker container)
              └── Cloudflared tunnel → public HTTPS URL
```

**Why Docker:**
- Clean, reproducible environment inside an LXC/VM
- Easy to update: `docker pull && docker compose up -d`
- Persistent volume mount for the SQLite database file
- Pairs naturally with a Cloudflare tunnel container in the same `docker-compose.yml`

**Example `docker-compose.yml` (outline):**

```yaml
services:
  app:
    image: content-requestor:latest
    restart: unless-stopped
    environment:
      - TMDB_API_KEY=${TMDB_API_KEY}
    volumes:
      - ./data:/app/data
    ports:
      - "3000:3000"

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
```

---

## 10. Environment Variables

```env
TMDB_API_KEY=your_tmdb_api_key_here
```

No admin token is required — the admin panel lives at the fixed path `/masterview`.

---

## 11. UX & Visual Design

- **Theme:** Follows system preference by default (`prefers-color-scheme`), with a toggle in the header to override. Choice is persisted in `localStorage`.
- **Color palette:** Deep navy/charcoal backgrounds; accent color: Jellyfin purple `#7B2FBE`
- **Typography:** Inter (clean sans-serif)
- **Card hover effects:** Subtle scale + shadow lift
- **Responsive grid:** 1 col (mobile) → 2 col (tablet) → 4 col (desktop)
- **Loading states:** Skeleton cards while searching
- **Toast notifications:** e.g. "Added to wish list!" on successful request

---

## 12. Current POC

A static HTML/CSS/JS proof-of-concept lives in the `poc/` directory. It demonstrates:

- The full UI layout and visual design
- Name modal and `localStorage`-based name persistence
- Theme toggle (system default + manual override)
- Card grid, skeleton loading, and filter pills
- Wish list page and master view page
- Mock data to simulate a populated wish list

The POC uses `localStorage` for all data — no backend required. Production replaces this with Next.js API routes and SQLite.

---

## 13. Out of Scope / Future Considerations

- Email or push notifications when requests are fulfilled
- Per-user request history view
- Jellyfin API integration to auto-check what's already available
- Request status tracking (Pending / Downloading / Available)
- Admin ability to mark items as "fulfilled" rather than delete
- Rate limiting or per-user request caps
