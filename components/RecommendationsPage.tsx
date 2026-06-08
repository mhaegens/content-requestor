'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SearchResult, MediaType, Request } from '@/types';
import type { WatchProvider } from '@/lib/tmdb';
import { SearchCard } from './MediaCard';
import { SkeletonCard } from './SkeletonCard';
import { useToast } from './ToastProvider';
import { useNameModal, getStoredName } from './NameModal';

// ---------------------------------------------------------------------------
// Seed type for "Because You Liked" rows
// ---------------------------------------------------------------------------

interface RecentSeed {
  tmdb_id: number;
  title: string;
  media_type: MediaType;
}

// ---------------------------------------------------------------------------
// DiscoveryRow — self-contained row with its own fetch/filter/render
// ---------------------------------------------------------------------------

interface DiscoveryRowProps {
  fetchUrl: string;
  requestedIds: Set<number>;
  mediaType: MediaType;
  onRequest: (item: SearchResult) => void;
}

function DiscoveryRow({ fetchUrl, requestedIds, mediaType, onRequest }: DiscoveryRowProps) {
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setItems(data.results ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [fetchUrl]);

  const visible = items.filter((i) => !requestedIds.has(i.tmdb_id));

  if (!loading && visible.length === 0) return null;

  return (
    <div className="discovery-strip">
      {loading
        ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
        : visible.map((item) => (
            <SearchCard
              key={item.tmdb_id}
              item={item}
              isRequested={requestedIds.has(item.tmdb_id)}
              onRequest={onRequest}
            />
          ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlatformRows — renders provider rows and conditionally shows divider
// ---------------------------------------------------------------------------

interface PlatformRowsProps {
  providers: WatchProvider[];
  mediaType: MediaType;
  requestedIds: Set<number>;
  onRequest: (item: SearchResult) => void;
}

function PlatformRows({ providers, mediaType, requestedIds, onRequest }: PlatformRowsProps) {
  // Track which provider rows have visible results to conditionally show divider
  const [visibleProviders, setVisibleProviders] = useState<Set<number>>(new Set());

  const handleRowVisible = useCallback((providerId: number, hasItems: boolean) => {
    setVisibleProviders((prev) => {
      const next = new Set(prev);
      if (hasItems) next.add(providerId);
      else next.delete(providerId);
      return next;
    });
  }, []);

  if (providers.length === 0) return null;

  return (
    <>
      {visibleProviders.size > 0 && (
        <div className="discovery-platform-divider">
          <span>Streaming Platforms</span>
        </div>
      )}
      {providers.map((p) => (
        <PlatformRow
          key={p.provider_id}
          provider={p}
          mediaType={mediaType}
          requestedIds={requestedIds}
          onRequest={onRequest}
          onVisibilityChange={handleRowVisible}
        />
      ))}
    </>
  );
}

interface PlatformRowProps {
  provider: WatchProvider;
  mediaType: MediaType;
  requestedIds: Set<number>;
  onRequest: (item: SearchResult) => void;
  onVisibilityChange: (providerId: number, hasItems: boolean) => void;
}

function PlatformRow({ provider, mediaType, requestedIds, onRequest, onVisibilityChange }: PlatformRowProps) {
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const onVisibilityChangeRef = useRef(onVisibilityChange);
  onVisibilityChangeRef.current = onVisibilityChange;

  const fetchUrl = `/api/recommendations?tab=platform&mediaType=${mediaType}&providerId=${provider.provider_id}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setItems(data.results ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [fetchUrl]);

  const visible = items.filter((i) => !requestedIds.has(i.tmdb_id));

  useEffect(() => {
    if (!loading) onVisibilityChangeRef.current(provider.provider_id, visible.length > 0);
  }, [loading, visible.length, provider.provider_id]);

  if (!loading && visible.length === 0) return null;

  return (
    <div className="discovery-section">
      <div className="discovery-platform-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
          alt={provider.provider_name}
          width={20}
          height={20}
        />
        <span>{provider.provider_name}</span>
      </div>
      <div className="discovery-strip">
        {loading
          ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
          : visible.map((item) => (
              <SearchCard
                key={item.tmdb_id}
                item={item}
                isRequested={requestedIds.has(item.tmdb_id)}
                onRequest={onRequest}
              />
            ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecommendationsPage
// ---------------------------------------------------------------------------

export function RecommendationsPage() {
  const { toast } = useToast();
  const { openModal } = useNameModal();

  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [requestedIds, setRequestedIds] = useState<Set<number>>(new Set());
  const [recentSeeds, setRecentSeeds] = useState<RecentSeed[]>([]);
  const [providers, setProviders] = useState<WatchProvider[]>([]);
  const pendingRef = useRef<Set<number>>(new Set());

  // Load requested IDs + derive recent seeds from wishlist
  useEffect(() => {
    fetch('/api/requests')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.requests)) {
          const requests: Request[] = data.requests;
          setRequestedIds(new Set(requests.map((r) => r.tmdb_id)));
          setRecentSeeds(
            requests.slice(0, 3).map((r) => ({
              tmdb_id: r.tmdb_id,
              title: r.title,
              media_type: r.media_type,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  // Load all Belgian providers once
  useEffect(() => {
    fetch('/api/recommendations?tab=providers')
      .then((r) => r.json())
      .then((data) => setProviders(data.providers ?? []))
      .catch(() => {});
  }, []);

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
        try { data = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }

        if (res.status === 409) { toast('Already in the wish list!', 'info'); return; }
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

  return (
    <main className="main">
      <div className="container">
        <section className="hero">
          <div className="hero-eyebrow">Belgium</div>
          <h1>Discover</h1>
          <p className="hero-sub">What to watch next.</p>
        </section>

        {/* Global media type toggle */}
        <div className="filter-row" style={{ marginBottom: '1.75rem' }}>
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

        {/* Trending */}
        <div className="discovery-section">
          <div className="discovery-row-header">
            <span className="discovery-row-title">Trending This Week</span>
            <span className="discovery-row-subtitle">· in Belgium</span>
          </div>
          <DiscoveryRow
            fetchUrl={`/api/recommendations?tab=trending&mediaType=${mediaType}`}
            requestedIds={requestedIds}
            mediaType={mediaType}
            onRequest={handleRequest}
          />
        </div>

        {/* Highly Rated */}
        <div className="discovery-section">
          <div className="discovery-row-header">
            <span className="discovery-row-title">Highly Rated</span>
            <span className="discovery-row-subtitle">· ★ 7.5+ · popular now</span>
          </div>
          <DiscoveryRow
            fetchUrl={`/api/recommendations?tab=highly_rated&mediaType=${mediaType}`}
            requestedIds={requestedIds}
            mediaType={mediaType}
            onRequest={handleRequest}
          />
        </div>

        {/* New Releases */}
        <div className="discovery-section">
          <div className="discovery-row-header">
            <span className="discovery-row-title">New Releases</span>
            <span className="discovery-row-subtitle">
              {mediaType === 'movie' ? '· in cinemas now' : '· currently airing'}
            </span>
          </div>
          <DiscoveryRow
            fetchUrl={`/api/recommendations?tab=new_releases&mediaType=${mediaType}`}
            requestedIds={requestedIds}
            mediaType={mediaType}
            onRequest={handleRequest}
          />
        </div>

        {/* Because You Liked — hidden when wishlist empty */}
        {recentSeeds.map((seed) => (
          <div key={seed.tmdb_id} className="discovery-section">
            <div className="discovery-row-header">
              <span className="discovery-row-title">Because You Liked</span>
              <span className="discovery-row-subtitle" style={{ color: 'var(--accent)' }}>
                &nbsp;{seed.title}
              </span>
            </div>
            <DiscoveryRow
              fetchUrl={`/api/recommendations?tab=because_liked&tmdbId=${seed.tmdb_id}&seedType=${seed.media_type}`}
              requestedIds={requestedIds}
              mediaType={mediaType}
              onRequest={handleRequest}
            />
          </div>
        ))}

        {/* Per-provider rows with conditional divider */}
        <PlatformRows
          providers={providers}
          mediaType={mediaType}
          requestedIds={requestedIds}
          onRequest={handleRequest}
        />
      </div>
    </main>
  );
}
