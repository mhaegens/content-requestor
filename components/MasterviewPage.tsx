'use client';

import { useState, useEffect, useCallback } from 'react';
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
      setRequests((prev) =>
        prev.map((item) => item.id === r.id ? { ...item, available_in_jellyfin: newValue } : item),
      );
      toast(
        newValue ? `"${r.title}" marked as available in Jellyfin` : `"${r.title}" marked as pending`,
        newValue ? 'success' : 'info',
      );
    } catch {
      toast('Failed to update Jellyfin status.', 'danger');
    } finally {
      setTogglingId(null);
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
