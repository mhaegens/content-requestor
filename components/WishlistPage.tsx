'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Request } from '@/types';
import { WishlistCard } from './MediaCard';
import { SkeletonGrid } from './SkeletonCard';

type FilterType = 'all' | 'movie' | 'tv' | 'available';

export function WishlistPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/requests');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setRequests(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wish list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const filtered =
    filter === 'all' ? requests
    : filter === 'available' ? requests.filter((r) => r.available_in_jellyfin)
    : requests.filter((r) => r.media_type === filter);

  return (
    <main className="main">
      <div className="container">
        {/* Page header */}
        <div className="section-header" style={{ marginBottom: '1.5rem', paddingTop: '2rem' }}>
          <div className="section-title">
            <h2 style={{ fontSize: '1.5rem' }}>Wish List</h2>
            <span className="count-chip">{requests.length} items</span>
          </div>
        </div>

        {/* Filter bar */}
        <div className="filter-row" style={{ marginBottom: '1.75rem' }}>
          <span className="filter-label">Filter:</span>
          {(['all', 'movie', 'tv', 'available'] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`pill${filter === f ? ' active' : ''}${f === 'available' ? ' pill-jellyfin' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : f === 'tv' ? 'TV Series' : 'In Jellyfin'}
            </button>
          ))}
        </div>

        {loading && <SkeletonGrid count={8} />}

        {!loading && error && (
          <div className="empty-state">
            <div className="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ width: 52, height: 52, opacity: 0.4 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3>Something went wrong</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
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
            <h3>
              {filter === 'all'
                ? 'No requests yet'
                : filter === 'available'
                ? 'Nothing available in Jellyfin yet'
                : `No ${filter === 'movie' ? 'movie' : 'TV series'} requests yet`}
            </h3>
            <p>
              {filter === 'available'
                ? 'The admin will mark content as available once it has been added to Jellyfin.'
                : 'Head to the search page to add something!'}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="cards-grid">
            {filtered.map((item) => (
              <WishlistCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
