'use client';

import type { SearchResult, Request } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Inline SVG icons
function StarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={{ width: 10, height: 10, fill: '#fbbf24' }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ width: 14, height: 14, flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PosterPlaceholder() {
  return (
    <div className="poster-placeholder">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      <span>No poster</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchCardProps {
  item: SearchResult;
  isRequested: boolean;
  onRequest: (item: SearchResult) => void;
}

interface WishlistCardProps {
  item: Request;
}

// ---------------------------------------------------------------------------
// Search result card
// ---------------------------------------------------------------------------

export function SearchCard({ item, isRequested, onRequest }: SearchCardProps) {
  const posterSrc = item.poster_path
    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
    : null;

  return (
    <div className="card" data-id={item.tmdb_id}>
      <div className="card-poster">
        {posterSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterSrc}
            alt={item.title}
            loading="lazy"
            onError={(e) => {
              const el = e.currentTarget.parentElement;
              if (el) el.innerHTML = '<div class="poster-placeholder"><span>No poster</span></div>';
            }}
          />
        ) : (
          <PosterPlaceholder />
        )}
        <span className={`card-type-badge ${item.media_type}`}>
          {item.media_type === 'tv' ? 'TV Series' : 'Movie'}
        </span>
        <span className="card-rating">
          <StarIcon />
          {item.vote_average.toFixed(1)}
        </span>
      </div>
      <div className="card-body">
        <div className="card-title">{item.title}</div>
        <div className="card-year">{item.year}</div>
        <div className="card-overview">{item.overview}</div>
        <div className="card-action">
          {isRequested ? (
            <button className="btn btn-success btn-full" disabled>
              <CheckIcon />
              Already Requested
            </button>
          ) : (
            <button
              className="btn btn-primary btn-full"
              onClick={() => onRequest(item)}
            >
              + Request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wishlist card (read-only — shows requester meta)
// ---------------------------------------------------------------------------

export function WishlistCard({ item }: WishlistCardProps) {
  const posterSrc = item.poster_path
    ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
    : null;

  return (
    <div className="card" data-id={item.tmdb_id}>
      <div className="card-poster">
        {posterSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterSrc}
            alt={item.title}
            loading="lazy"
            onError={(e) => {
              const el = e.currentTarget.parentElement;
              if (el) el.innerHTML = '<div class="poster-placeholder"><span>No poster</span></div>';
            }}
          />
        ) : (
          <PosterPlaceholder />
        )}
        <span className={`card-type-badge ${item.media_type}`}>
          {item.media_type === 'tv' ? 'TV Series' : 'Movie'}
        </span>
        <span className="card-rating">
          <StarIcon />
          {item.vote_average.toFixed(1)}
        </span>
        {item.available_in_jellyfin && (
          <div className="jellyfin-available-overlay">
            <CheckIcon />
            Available in Jellyfin
          </div>
        )}
      </div>
      <div className="card-body">
        <div className="card-title">{item.title}</div>
        <div className="card-year">{item.year}</div>
        <div className="card-overview">{item.overview}</div>
        <div className="card-meta">
          <div className="meta-avatar">{getInitials(item.requested_by)}</div>
          <span className="meta-text">
            {item.requested_by} · {fmtDateShort(item.requested_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
