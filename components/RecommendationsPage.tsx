'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SearchResult } from '@/types';
import type { WatchProvider } from '@/lib/tmdb';
import { SearchCard } from './MediaCard';
import { SkeletonGrid } from './SkeletonCard';
import { useToast } from './ToastProvider';
import { useNameModal, getStoredName } from './NameModal';

export function RecommendationsPage() {
  const { toast } = useToast();
  const { openModal } = useNameModal();

  const [tab, setTab] = useState<'trending' | 'platform'>('trending');
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [providers, setProviders] = useState<WatchProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestedIds, setRequestedIds] = useState<Set<number>>(new Set());
  const pendingRef = useRef<Set<number>>(new Set());
  const initialProviderSet = useRef(false);

  useEffect(() => {
    fetch('/api/requests')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.requests)) {
          setRequestedIds(new Set(data.requests.map((r: { tmdb_id: number }) => r.tmdb_id)));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/recommendations?tab=providers')
      .then((r) => r.json())
      .then((data) => {
        const provs: WatchProvider[] = data.providers ?? [];
        setProviders(provs);
        if (!initialProviderSet.current && provs.length) {
          setSelectedProvider(provs[0].provider_id);
          initialProviderSet.current = true;
        }
      })
      .catch(() => {});
  }, []);

  const fetchResults = useCallback(async () => {
    if (tab === 'platform' && selectedProvider === null) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab, mediaType });
      if (tab === 'platform' && selectedProvider !== null) {
        params.set('providerId', String(selectedProvider));
      }
      const res = await fetch(`/api/recommendations?${params}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [tab, mediaType, selectedProvider]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleRequest = useCallback(
    async (item: SearchResult) => {
      const name = getStoredName();
      if (!name) {
        openModal();
        return;
      }

      if (pendingRef.current.has(item.tmdb_id)) return;
      pendingRef.current.add(item.tmdb_id);
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

        let data: Record<string, unknown> = {};
        try {
          data = await res.json();
        } catch {
          throw new Error(`HTTP ${res.status}`);
        }

        if (res.status === 409) {
          toast('Already in the wish list!', 'info');
          return;
        }
        if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
        toast(`"${item.title}" added to wish list!`, 'success');
      } catch {
        setRequestedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.tmdb_id);
          return next;
        });
        toast('Failed to add request. Please try again.', 'danger');
      } finally {
        pendingRef.current.delete(item.tmdb_id);
      }
    },
    [openModal, toast],
  );

  const activeProvider = providers.find((p) => p.provider_id === selectedProvider);

  return (
    <main className="main">
      <div className="container">
        <section className="hero">
          <div className="hero-eyebrow">Belgium</div>
          <h1>Trending &amp; Streaming</h1>
          <p className="hero-sub">
            Popular movies and shows on Belgian streaming platforms right now.
          </p>
        </section>

        {/* Tab switcher */}
        <div className="filter-row" style={{ marginBottom: '1.25rem' }}>
          <button
            className={`pill${tab === 'trending' ? ' active' : ''}`}
            onClick={() => setTab('trending')}
          >
            Trending
          </button>
          <button
            className={`pill${tab === 'platform' ? ' active' : ''}`}
            onClick={() => setTab('platform')}
          >
            By Platform
          </button>
        </div>

        {/* Platform selector */}
        {tab === 'platform' && (
          <div className="provider-grid">
            {providers.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>Loading platforms…</p>
            ) : (
              providers.map((p) => (
                <button
                  key={p.provider_id}
                  className={`provider-btn${selectedProvider === p.provider_id ? ' active' : ''}`}
                  onClick={() => setSelectedProvider(p.provider_id)}
                  title={p.provider_name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                    alt={p.provider_name}
                    width={28}
                    height={28}
                  />
                  <span>{p.provider_name}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Media type filter */}
        <div className="filter-row" style={{ marginBottom: '1.5rem' }}>
          <span className="filter-label">Type:</span>
          <button
            className={`pill${mediaType === 'movie' ? ' active' : ''}`}
            onClick={() => setMediaType('movie')}
          >
            Movies
          </button>
          <button
            className={`pill${mediaType === 'tv' ? ' active' : ''}`}
            onClick={() => setMediaType('tv')}
          >
            TV Shows
          </button>
        </div>

        {/* Section header */}
        <div className="section-header">
          <div className="section-title">
            <h2>
              {tab === 'trending'
                ? `Trending ${mediaType === 'movie' ? 'Movies' : 'TV Shows'} in Belgium`
                : `${activeProvider?.provider_name ?? ''} — ${mediaType === 'movie' ? 'Movies' : 'TV Shows'}`}
            </h2>
            {!loading && <span className="count-chip">{results.length}</span>}
          </div>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>Powered by TMDB</span>
        </div>

        {/* Results */}
        {loading ? (
          <SkeletonGrid count={12} />
        ) : results.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                style={{ width: 52, height: 52, opacity: 0.4 }}
              >
                <rect x="2" y="7" width="20" height="15" rx="2" />
                <polyline points="17 2 12 7 7 2" />
              </svg>
            </div>
            <h3>Nothing found</h3>
            <p>Try switching the type or platform.</p>
          </div>
        ) : (
          <div className="cards-grid">
            {results.map((item) => (
              <SearchCard
                key={item.tmdb_id}
                item={item}
                isRequested={requestedIds.has(item.tmdb_id)}
                onRequest={handleRequest}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
