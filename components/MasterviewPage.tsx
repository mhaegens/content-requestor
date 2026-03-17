'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Request } from '@/types';
import { useToast } from './ToastProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-HTTPS
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  }
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 22, height: 22 }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function JellyfinIcon({ filled }: { filled: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }} fill="none">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill={filled ? 'white' : 'currentColor'} stroke="none" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card generation helpers
// ---------------------------------------------------------------------------

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

async function generateCardImage(request: Request): Promise<Blob> {
  const W = 600, H = 340;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0d1117');
  grad.addColorStop(1, '#1a2035');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle border
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  const posterW = 190, posterH = 285, posterX = 24, posterY = 27;
  let textX = posterX + posterW + 28;

  // Poster
  if (request.poster_path) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = 'anonymous';
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = `/api/image-proxy?path=${request.poster_path}`;
      });
      ctx.save();
      roundedRect(ctx, posterX, posterY, posterW, posterH, 10);
      ctx.clip();
      ctx.drawImage(img, posterX, posterY, posterW, posterH);
      ctx.restore();
    } catch {
      // poster failed to load — draw placeholder
      ctx.fillStyle = '#1c2128';
      roundedRect(ctx, posterX, posterY, posterW, posterH, 10);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎬', posterX + posterW / 2, posterY + posterH / 2 + 18);
      ctx.textAlign = 'left';
    }
  } else {
    // No poster path — shift text to centre-ish
    textX = 36;
  }

  const textW = W - textX - 24;
  let y = 44;

  // "Now on Jellyfin" badge
  ctx.font = 'bold 11px Inter, system-ui, sans-serif';
  const badgeText = '▶  Now on Jellyfin';
  const badgeW = ctx.measureText(badgeText).width + 20;
  const badgeH = 24;
  ctx.fillStyle = '#3fb950';
  roundedRect(ctx, textX, y, badgeW, badgeH, 999);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(badgeText, textX + 10, y + 16);

  y += badgeH + 18;

  // Title
  ctx.fillStyle = '#e6edf3';
  const fontSize = request.title.length > 30 ? 22 : 26;
  ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
  const titleLines = wrapText(ctx, request.title, textW);
  for (const line of titleLines.slice(0, 3)) {
    ctx.fillText(line, textX, y);
    y += fontSize + 6;
  }

  y += 6;

  // Year + type
  ctx.fillStyle = 'rgba(230,237,243,0.5)';
  ctx.font = '14px Inter, system-ui, sans-serif';
  const typeLabel = request.media_type === 'tv' ? 'TV Series' : 'Movie';
  ctx.fillText(`${request.year}  ·  ${typeLabel}`, textX, y);

  // Divider line near bottom
  const dividerY = H - 72;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(textX, dividerY);
  ctx.lineTo(W - 24, dividerY);
  ctx.stroke();

  // "Requested by" label
  ctx.fillStyle = 'rgba(230,237,243,0.4)';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText('REQUESTED BY', textX, dividerY + 20);

  // Name
  ctx.fillStyle = '#a78bfa';
  ctx.font = 'bold 15px Inter, system-ui, sans-serif';
  ctx.fillText(request.requested_by || 'Anonymous', textX, dividerY + 40);

  // Branding (bottom-right)
  ctx.fillStyle = 'rgba(230,237,243,0.2)';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('via Requestr', W - 18, H - 14);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MasterviewPage() {
  const { toast } = useToast();

  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [cardRequest, setCardRequest] = useState<Request | null>(null);
  const [cardCopied, setCardCopied] = useState(false);
  const [cardGenerating, setCardGenerating] = useState(false);
  const cardCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/requests');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setRequests(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // Copy a single TMDB ID
  const handleCopyId = async (id: number, rowId: string) => {
    await copyText(String(id));
    setCopiedId(rowId);
    toast(`Copied ID ${id}`, 'info');
    setTimeout(() => setCopiedId(null), 1200);
  };

  // Copy all TMDB IDs
  const handleCopyAll = async () => {
    if (!requests.length) return;
    const ids = requests.map((r) => String(r.tmdb_id)).join('\n');
    await copyText(ids);
    toast(`Copied ${requests.length} TMDB ID${requests.length !== 1 ? 's' : ''}`, 'info');
  };

  // Toggle Jellyfin availability flag
  const handleToggleJellyfin = async (r: Request) => {
    setTogglingId(r.id);
    const newValue = !r.available_in_jellyfin;
    try {
      const res = await fetch(`/api/requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available_in_jellyfin: newValue }),
      });
      if (!res.ok) throw new Error('Update failed');
      const updated = { ...r, available_in_jellyfin: newValue };
      setRequests((prev) =>
        prev.map((item) => item.id === r.id ? updated : item),
      );
      toast(
        newValue ? `"${r.title}" marked as available in Jellyfin` : `"${r.title}" marked as pending`,
        newValue ? 'success' : 'info',
      );
      if (newValue) {
        setCardRequest(updated);
        setCardCopied(false);
        setShowCardModal(true);
      }
    } catch {
      toast('Failed to update Jellyfin status.', 'danger');
    } finally {
      setTogglingId(null);
    }
  };

  // Open card modal for an already-available request
  const handleOpenCard = (r: Request) => {
    setCardRequest(r);
    setCardCopied(false);
    setShowCardModal(true);
  };

  // Copy card image to clipboard
  const handleCopyCard = async () => {
    if (!cardRequest) return;
    setCardGenerating(true);
    try {
      const blob = await generateCardImage(cardRequest);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCardCopied(true);
      toast('Notification card copied!', 'success');
      if (cardCopiedTimer.current) clearTimeout(cardCopiedTimer.current);
      cardCopiedTimer.current = setTimeout(() => setCardCopied(false), 2500);
    } catch {
      toast('Failed to copy image. Try downloading instead.', 'danger');
    } finally {
      setCardGenerating(false);
    }
  };

  // Download card image
  const handleDownloadCard = async () => {
    if (!cardRequest) return;
    setCardGenerating(true);
    try {
      const blob = await generateCardImage(cardRequest);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jellyfin-${cardRequest.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Card downloaded!', 'success');
    } catch {
      toast('Failed to generate card.', 'danger');
    } finally {
      setCardGenerating(false);
    }
  };

  // Delete a single request
  const handleDelete = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/requests/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast(`Removed "${title}"`, 'danger');
    } catch {
      toast('Failed to delete request.', 'danger');
    }
  };

  // Clear all requests
  const handleClearAll = async () => {
    setShowConfirm(false);
    try {
      const res = await fetch('/api/requests', { method: 'DELETE' });
      if (!res.ok) throw new Error('Clear failed');
      setRequests([]);
      toast('All requests cleared.', 'danger');
    } catch {
      toast('Failed to clear requests.', 'danger');
    }
  };

  // Stats
  const movies = requests.filter((r) => r.media_type === 'movie').length;
  const shows = requests.filter((r) => r.media_type === 'tv').length;
  const inJellyfin = requests.filter((r) => r.available_in_jellyfin).length;

  return (
    <main className="main">
      <div className="container">
        {/* Banner */}
        <div className="master-banner">
          <div className="master-banner-icon">
            <ShieldIcon />
          </div>
          <div>
            <h2>Admin Panel</h2>
            <p style={{ color: 'var(--text-2)' }}>
              This page is not linked publicly. Use the TMDB IDs below to action requests in Jellyfin.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Total Requests</div>
            <div className="stat-value accent">{requests.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Movies</div>
            <div className="stat-value">{movies}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">TV Series</div>
            <div className="stat-value">{shows}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">In Jellyfin</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>{inJellyfin}</div>
          </div>
        </div>

        {/* Action bar */}
        <div className="action-bar">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>TMDB IDs</h2>
          <div className="action-bar-right">
            <button
              className="btn btn-outline btn-sm"
              onClick={handleCopyAll}
              disabled={!requests.length}
            >
              <CopyIcon />
              Copy All IDs
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setShowConfirm(true)}
              disabled={!requests.length}
            >
              <TrashIcon />
              Clear All
            </button>
          </div>
        </div>

        {/* Table */}
        {loading && (
          <div className="table-wrap" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>
            Loading…
          </div>
        )}

        {!loading && error && (
          <div className="empty-state">
            <h3>Something went wrong</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ width: 52, height: 52, opacity: 0.4 }}>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </div>
            <h3>No requests yet</h3>
            <p>Requests submitted from the search page will appear here.</p>
          </div>
        )}

        {!loading && !error && requests.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>TMDB ID</th>
                  <th>Requested By</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const posterSrc = r.poster_path
                    ? `https://image.tmdb.org/t/p/w92${r.poster_path}`
                    : null;

                  return (
                    <tr key={r.id}>
                      {/* Thumbnail */}
                      <td>
                        {posterSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="table-thumb"
                            src={posterSrc}
                            alt={r.title}
                            loading="lazy"
                          />
                        ) : (
                          <div className="table-thumb-ph">🎬</div>
                        )}
                      </td>

                      {/* Title */}
                      <td className="td-title">
                        {r.title}
                        <small>{r.year}</small>
                      </td>

                      {/* Type */}
                      <td>
                        <span className={`card-type-badge ${r.media_type}`} style={{ position: 'static' }}>
                          {r.media_type === 'tv' ? 'TV Series' : 'Movie'}
                        </span>
                      </td>

                      {/* Jellyfin Status */}
                      <td>
                        <span className={`jellyfin-status-badge${r.available_in_jellyfin ? ' available' : ''}`}>
                          {r.available_in_jellyfin ? 'In Jellyfin' : 'Pending'}
                        </span>
                      </td>

                      {/* TMDB ID */}
                      <td>
                        <span className="tmdb-id">{r.tmdb_id}</span>
                      </td>

                      {/* Requested By */}
                      <td style={{ color: 'var(--text-2)' }}>{r.requested_by}</td>

                      {/* Date */}
                      <td style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {fmtDate(r.requested_at)}
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="td-actions">
                          <button
                            className={`btn btn-sm${r.available_in_jellyfin ? ' btn-success' : ' btn-outline'}`}
                            onClick={() => handleToggleJellyfin(r)}
                            disabled={togglingId === r.id}
                            title={r.available_in_jellyfin ? 'Mark as pending' : 'Mark as available in Jellyfin'}
                          >
                            <JellyfinIcon filled={r.available_in_jellyfin} />
                            {r.available_in_jellyfin ? 'Available' : 'Mark Available'}
                          </button>
                          {r.available_in_jellyfin && (
                            <button
                              className="btn-icon-only"
                              onClick={() => handleOpenCard(r)}
                              title="Generate notification card"
                            >
                              <ShareIcon />
                            </button>
                          )}
                          <button
                            className={`btn btn-outline btn-sm${copiedId === r.id ? ' copy-flash' : ''}`}
                            onClick={() => handleCopyId(r.tmdb_id, r.id)}
                            title="Copy TMDB ID"
                          >
                            <CopyIcon />
                            Copy ID
                          </button>
                          <button
                            className="btn-icon-only"
                            onClick={() => handleDelete(r.id, r.title)}
                            title="Remove this request"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notification Card Modal */}
      <div
        className={`card-modal-overlay${showCardModal ? ' open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) setShowCardModal(false); }}
        role="dialog"
        aria-modal="true"
      >
        <div className="card-modal-box">
          <div className="card-modal-header">
            <span>Share Notification Card</span>
            <button className="btn-icon-only" onClick={() => setShowCardModal(false)} title="Close">
              <CloseIcon />
            </button>
          </div>

          {cardRequest && (
            <>
              {/* Card preview */}
              <div className="notif-card-preview">
                {cardRequest.poster_path && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="notif-card-poster"
                    src={`https://image.tmdb.org/t/p/w185${cardRequest.poster_path}`}
                    alt={cardRequest.title}
                  />
                )}
                <div className="notif-card-body">
                  <div className="notif-card-badge">▶ Now on Jellyfin</div>
                  <div className="notif-card-title">{cardRequest.title}</div>
                  <div className="notif-card-meta">
                    {cardRequest.year} · {cardRequest.media_type === 'tv' ? 'TV Series' : 'Movie'}
                  </div>
                  <div className="notif-card-divider" />
                  <div className="notif-card-requester-label">Requested by</div>
                  <div className="notif-card-requester">{cardRequest.requested_by || 'Anonymous'}</div>
                </div>
              </div>

              <p className="card-modal-hint">
                Click &ldquo;Copy Image&rdquo; then paste directly into WhatsApp, Telegram, Discord, or any messaging app.
              </p>

              <div className="card-modal-actions">
                <button
                  className={`btn btn-primary btn-sm${cardCopied ? ' btn-success' : ''}`}
                  onClick={handleCopyCard}
                  disabled={cardGenerating}
                >
                  <CopyIcon />
                  {cardCopied ? 'Copied!' : cardGenerating ? 'Generating…' : 'Copy Image'}
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleDownloadCard}
                  disabled={cardGenerating}
                >
                  <DownloadIcon />
                  Download
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirm clear-all dialog */}
      <div
        className={`confirm-overlay${showConfirm ? ' open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}
        role="dialog"
        aria-modal="true"
      >
        <div className="confirm-box">
          <h3>Clear all requests?</h3>
          <p>
            This will permanently delete all {requests.length} request
            {requests.length !== 1 ? 's' : ''}. This cannot be undone.
          </p>
          <div className="confirm-actions">
            <button className="btn btn-outline btn-sm" onClick={() => setShowConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleClearAll}>
              <TrashIcon />
              Delete All
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
