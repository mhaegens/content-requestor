'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SearchResult } from '@/types';
import { SearchCard } from './MediaCard';
import { SkeletonGrid } from './SkeletonCard';
import { useToast } from './ToastProvider';
import { useNameModal, getStoredName } from './NameModal';

type FilterType = 'all' | 'movie' | 'tv';

export function SearchPage() {
  const { toast } = useToast();
  const { openModal } = useNameModal();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [requestedIds, setRequestedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load already-requested TMDB IDs on mount
  useEffect(() => {
    fetch('/api/requests')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.requests)) {
          setRequestedIds(new Set(data.requests.map((r: { tmdb_id: number }) => r.tmdb_id)));
        }
      })
      .catch(() => {/* non-critical */});
  }, []);

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${filter}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [query, filter]);

  const handleRequest = useCallback(
    async (item: SearchResult) => {
      const name = getStoredName();
      if (!name) {
        openModal();
        return;
      }

      // Optimistic update
      setRequestedIds((prev) => new Set(prev).add(item.tmdb_id));

      try {
        const res = await fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tmdb_id: item.tmdb_id,
            media_type: item.media_type,
            title: item.title,
            year: item.year,
            poster_path: item.poster_path,
            overview: item.overview,
            vote_average: item.vote_average,
            requested_by: name,
          }),
        });

        const data = await res.json();

        if (res.status === 409) {
          toast('Already in the wish list!', 'info');
          return;
        }
        if (!res.ok) throw new Error(data.error ?? 'Request failed');

        toast(`"${item.title}" added to wish list!`, 'success');
      } catch {
        // Roll back optimistic update
        setRequestedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.tmdb_id);
          return next;
        });
        toast('Failed to add request. Please try again.', 'danger');
      }
    },
    [openModal, toast],
  );

  // Filter results by current type filter
  const filtered =
    filter === 'all' ? results : results.filter((r) => r.media_type === filter);

  return (
    <main className="main">
      <div className="container">
        {/* Hero search */}
        <section className="hero">
          <div className="hero-eyebrow">🎬 Jellyfin Content Requests</div>
          <h1>Find something to watch</h1>
          <p className="hero-sub">
            Search for movies or TV series and request them to be added to Jellyfin.
          </p>

          <div className="search-bar">
            <div className="search-wrap">
              <span className="search-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </span>
              <input
                ref={inputRef}
                className="search-input"
                type="text"
                placeholder="Title or TMDB ID… e.g. Breaking Bad or 1396"
                autoComplete="off"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              />
            </div>
            <button className="search-btn" onClick={doSearch}>
              Search
            </button>
          </div>

          {/* Type filter */}
          <div className="filter-row" style={{ justifyContent: 'center' }}>
            <span className="filter-label">Type:</span>
            {(['all', 'movie', 'tv'] as FilterType[]).map((f) => (
              <button
                key={f}
                className={`pill${filter === f ? ' active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : 'TV Series'}
              </button>
            ))}
          </div>
        </section>

        {/* Results */}
        {searched ? (
          <section>
            <div className="section-header">
              <div className="section-title">
                <h2>Results</h2>
                {!loading && (
                  <span className="count-chip">{filtered.length}</span>
                )}
              </div>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>
                Powered by TMDB
              </span>
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
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                </div>
                <h3>No results found</h3>
                <p>Try a different title or TMDB ID.</p>
              </div>
            )}

            {!loading && !error && filtered.length > 0 && (
              <div className="cards-grid">
                {filtered.map((item) => (
                  <SearchCard
                    key={item.tmdb_id}
                    item={item}
                    isRequested={requestedIds.has(item.tmdb_id)}
                    onRequest={handleRequest}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          /* Idle / initial state */
          <div className="empty-state" style={{ padding: '4rem 2rem 5rem' }}>
            <div className="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25} style={{ width: 64, height: 64, opacity: 0.25 }}>
                <rect x="2" y="2" width="20" height="20" rx="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="2" y1="7" x2="7" y2="7" />
                <line x1="2" y1="17" x2="7" y2="17" />
                <line x1="17" y1="17" x2="22" y2="17" />
                <line x1="17" y1="7" x2="22" y2="7" />
              </svg>
            </div>
            <h3>Start searching above</h3>
            <p>Type a title or paste a TMDB ID to find movies and TV series.</p>
          </div>
        )}
      </div>
    </main>
  );
}
