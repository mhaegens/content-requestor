/* ============================================================
   REQUESTR — Shared App Utilities
   ============================================================ */

// ── Storage Keys ─────────────────────────────────────────────
const KEYS = {
  theme:    'requestr_theme',
  name:     'requestr_name',
  wishlist: 'requestr_wishlist',
};

// ── Mock initial wishlist (simulates server state) ────────────
const SEED_WISHLIST = [
  {
    id: 95396, type: 'tv', title: 'Severance', year: '2022', rating: 8.7,
    overview: "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.",
    poster: 'https://image.tmdb.org/t/p/w500/ylOkk1z7MRr4f4bGcuAJvEoGEOH.jpg',
    requested_by: 'Alex', requested_at: '2026-03-13T15:45:00Z',
  },
  {
    id: 126308, type: 'tv', title: 'Shōgun', year: '2024', rating: 8.8,
    overview: "In feudal Japan, the arrival of a European ship threatens to upend a deadly power struggle among warlords.",
    poster: 'https://image.tmdb.org/t/p/w500/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg',
    requested_by: 'Sam', requested_at: '2026-03-12T09:15:00Z',
  },
  {
    id: 872585, type: 'movie', title: 'Oppenheimer', year: '2023', rating: 8.1,
    overview: "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
    poster: 'https://image.tmdb.org/t/p/w500/8Gxv8giaG8l4hGp9z9rEP7IHEca.jpg',
    requested_by: 'Jordan', requested_at: '2026-03-11T18:30:00Z',
  },
];

// ── Wishlist helpers ──────────────────────────────────────────
function getWishlist() {
  try {
    const raw = localStorage.getItem(KEYS.wishlist);
    if (raw) return JSON.parse(raw);
    // Seed on first load
    localStorage.setItem(KEYS.wishlist, JSON.stringify(SEED_WISHLIST));
    return [...SEED_WISHLIST];
  } catch { return []; }
}

function saveWishlist(list) {
  localStorage.setItem(KEYS.wishlist, JSON.stringify(list));
}

function isRequested(id) {
  return getWishlist().some(i => i.id === id);
}

function addToWishlist(item, requesterName) {
  const list = getWishlist();
  if (list.some(i => i.id === item.id)) return false;
  list.unshift({ ...item, requested_by: requesterName || 'Anonymous', requested_at: new Date().toISOString() });
  saveWishlist(list);
  return true;
}

function removeFromWishlist(id) {
  saveWishlist(getWishlist().filter(i => i.id !== id));
}

function clearWishlist() {
  saveWishlist([]);
}

// ── Name helpers ──────────────────────────────────────────────
function getName() { return localStorage.getItem(KEYS.name) || ''; }
function saveName(n) { localStorage.setItem(KEYS.name, n.trim()); }
function getInitials(name) {
  const parts = name.trim().split(' ').filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Theme ─────────────────────────────────────────────────────
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function getTheme() {
  return localStorage.getItem(KEYS.theme) || getSystemTheme();
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(KEYS.theme, theme);
}
function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  updateThemeIcon();
}
function updateThemeIcon() {
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  const dark = getTheme() === 'dark';
  btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
  btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = 'success', duration = 3000) {
  const area = document.getElementById('toastArea');
  if (!area) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  area.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

// ── Date formatting ───────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Clipboard ─────────────────────────────────────────────────
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    return true;
  }
}

// ── Inline SVG Icons ──────────────────────────────────────────
const ICONS = {
  search:  `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  list:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  film:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`,
  star:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  sun:     `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  check:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  copy:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  trash:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  user:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  shield:  `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  download:`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  poster_ph: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
};

// ── Poster Error Handler ──────────────────────────────────────
function handlePosterError(img) {
  img.parentElement.innerHTML = `<div class="poster-placeholder">${ICONS.poster_ph}<span>No poster</span></div>`;
}

// ── Header Builder ────────────────────────────────────────────
function buildHeader(activePage) {
  const name = getName();
  const initials = name ? getInitials(name) : '?';
  const displayName = name || 'Set your name';

  return `
    <header class="header">
      <div class="container">
        <div class="header-inner">
          <a href="index.html" class="logo">
            <div class="logo-mark">R</div>
            Requestr
          </a>
          <nav class="nav">
            <a href="index.html" class="nav-link ${activePage === 'search' ? 'active' : ''}">
              ${ICONS.search}
              <span class="nav-label">Search</span>
            </a>
            <a href="wishlist.html" class="nav-link ${activePage === 'wishlist' ? 'active' : ''}">
              ${ICONS.list}
              <span class="nav-label">Wish List</span>
            </a>
          </nav>
          <div class="header-right">
            <button class="name-btn" id="openNameModal" title="Change your name">
              <div class="name-avatar" id="headerAvatar">${initials}</div>
              <span id="headerName">${displayName}</span>
            </button>
            <button class="icon-btn" id="themeBtn" onclick="toggleTheme()" title="Toggle theme"></button>
          </div>
        </div>
      </div>
    </header>
    <div class="toast-area" id="toastArea"></div>
  `;
}

// ── Name Modal Builder ────────────────────────────────────────
function buildNameModal(required = false) {
  return `
    <div class="modal-overlay ${!required ? '' : 'open'}" id="nameModal">
      <div class="modal">
        <div class="modal-emoji">👋</div>
        <h2>What's your name?</h2>
        <p>So your friends know who requested what. You can always change it later.</p>
        <input class="modal-input" id="nameInput" type="text"
               placeholder="e.g. Alex, Sam, Jordan…" maxlength="32"
               value="${getName()}" />
        <div class="modal-actions">
          ${!required ? `<button class="btn btn-outline" onclick="closeNameModal()">Cancel</button>` : ''}
          <button class="btn btn-primary" onclick="submitName()">
            ${ICONS.check} Let's go
          </button>
        </div>
      </div>
    </div>
  `;
}

function openNameModal() {
  document.getElementById('nameModal').classList.add('open');
  setTimeout(() => document.getElementById('nameInput')?.focus(), 50);
}
function closeNameModal() {
  document.getElementById('nameModal').classList.remove('open');
}
function submitName() {
  const val = document.getElementById('nameInput')?.value?.trim();
  if (!val) { document.getElementById('nameInput')?.focus(); return; }
  saveName(val);
  closeNameModal();
  // Update header
  document.getElementById('headerName').textContent = val;
  document.getElementById('headerAvatar').textContent = getInitials(val);
  toast(`Name set to "${val}"`, 'info');
}

// ── Init (called by each page) ────────────────────────────────
function initApp(activePage) {
  // Apply theme immediately
  applyTheme(getTheme());
  // Render header
  document.getElementById('app-header').innerHTML = buildHeader(activePage);
  updateThemeIcon();
  // Name modal
  document.getElementById('app-modal').innerHTML = buildNameModal(!getName());
  if (!getName()) openNameModal();
  document.getElementById('openNameModal')?.addEventListener('click', openNameModal);
  // Name input enter key
  document.getElementById('nameInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); });
  // Listen for system theme changes (only if no override stored)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem(KEYS.theme)) applyTheme(e.matches ? 'dark' : 'light');
  });
}

// ── Card Builder ──────────────────────────────────────────────
function buildCard(item, opts = {}) {
  const requested = isRequested(item.id);
  const { showMeta = false } = opts;

  const posterHtml = item.poster
    ? `<img src="${item.poster}" alt="${item.title}" loading="lazy" onerror="handlePosterError(this)">`
    : `<div class="poster-placeholder">${ICONS.poster_ph}<span>No poster</span></div>`;

  const metaHtml = showMeta && item.requested_by ? `
    <div class="card-meta">
      <div class="meta-avatar">${getInitials(item.requested_by)}</div>
      <span class="meta-text">${item.requested_by} · ${fmtDateShort(item.requested_at)}</span>
    </div>` : '';

  const btnHtml = requested
    ? `<button class="btn btn-success btn-full" disabled>
         ${ICONS.check} Already Requested
       </button>`
    : `<button class="btn btn-primary btn-full" onclick="handleRequest(${item.id})">
         + Request
       </button>`;

  return `
    <div class="card" data-id="${item.id}">
      <div class="card-poster">
        ${posterHtml}
        <span class="card-type-badge ${item.type}">${item.type === 'tv' ? 'TV Series' : 'Movie'}</span>
        <span class="card-rating">${ICONS.star} ${item.rating?.toFixed(1) ?? '—'}</span>
      </div>
      <div class="card-body">
        <div class="card-title">${item.title}</div>
        <div class="card-year">${item.year}</div>
        <div class="card-overview">${item.overview}</div>
        ${metaHtml}
        <div class="card-action">${btnHtml}</div>
      </div>
    </div>
  `;
}

// ── Skeleton Cards ────────────────────────────────────────────
function buildSkeletons(n = 8) {
  return Array.from({ length: n }, () => `
    <div class="skeleton-card">
      <div class="skeleton-poster shimmer"></div>
      <div class="skeleton-body">
        <div class="skeleton-line shimmer" style="width:80%"></div>
        <div class="skeleton-line shimmer" style="width:40%"></div>
        <div class="skeleton-line shimmer" style="width:95%;margin-top:.25rem"></div>
        <div class="skeleton-line shimmer" style="width:90%"></div>
        <div class="skeleton-line shimmer" style="width:70%"></div>
        <div class="skeleton-btn shimmer"></div>
      </div>
    </div>
  `).join('');
}
