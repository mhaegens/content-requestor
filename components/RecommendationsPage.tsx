'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { mediaKey, type SearchResult, type MediaType, type Request } from '@/types';
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
  requestedIds: Set<string>;
  onRequest: (item: SearchResult) => void;
}

// Fetch only near the viewport. Cards are released again when the row is far
// offscreen; each horizontal page mounts at most six posters.
function DiscoveryRow({ fetchUrl, requestedIds, onRequest }: DiscoveryRowProps) {
  const container = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const [height, setHeight] = useState(420);
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loadedUrl, setLoadedUrl] = useState('');
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!container.current) return;
    if (!('IntersectionObserver' in window)) { setNearby(true); return; }
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), { rootMargin: '300px 0px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setItems([]); setLoadedUrl(''); setPage(0); setError(false);
  }, [fetchUrl]);

  useEffect(() => {
    if (!nearby || loadedUrl === fetchUrl) return;
    const controller = new AbortController();
    setError(false);
    fetch(fetchUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Discovery failed');
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(Array.isArray(data.results) ? data.results : []);
          setLoadedUrl(fetchUrl);
        }
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [nearby, loadedUrl, fetchUrl, retry]);

  useEffect(() => {
    if (!nearby || !container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) setHeight(entry.contentRect.height);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [nearby]);

  const visible = items.filter((item) => !requestedIds.has(mediaKey(item)) || item.availability === 'available');
  const pageCount = Math.max(1, Math.ceil(visible.length / 6));
  const currentPage = Math.min(page, pageCount - 1);
  const loading = loadedUrl !== fetchUrl;

  return (
    <div ref={container} style={!nearby ? { height } : undefined}>
      {nearby && (error ? (
        <div role="status">Could not load this row. <button className="btn btn-outline btn-sm" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>
      ) : (
        <>
          <div className="discovery-strip" key={`${fetchUrl}:${currentPage}`}>
            {loading ? Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)
              : visible.slice(currentPage * 6, currentPage * 6 + 6).map((item) => (
                <SearchCard key={mediaKey(item)} item={item} isRequested={requestedIds.has(mediaKey(item))} onRequest={onRequest} compact />
              ))}
            {!loading && !visible.length && <p>No new titles in this row.</p>}
          </div>
          {!loading && pageCount > 1 && (
            <div className="discovery-pagination">
              <button className="btn btn-outline btn-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
              <span>{currentPage + 1} / {pageCount}</span>
              <button className="btn btn-outline btn-sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>More titles</button>
            </div>
          )}
        </>
      ))}
    </div>
  );
}

interface PlatformRowsProps {
  providers: WatchProvider[];
  mediaType: MediaType;
  requestedIds: Set<string>;
  onRequest: (item: SearchResult) => void;
}

function PlatformRows({ providers, mediaType, requestedIds, onRequest }: PlatformRowsProps) {
  const [limit, setLimit] = useState(6);
  if (!providers.length) return null;
  return (
    <>
      <div className="discovery-platform-divider"><span>Streaming Platforms</span></div>
      {providers.slice(0, limit).map((provider) => (
        <div className="discovery-section" key={`${mediaType}:${provider.provider_id}`}>
          <div className="discovery-platform-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`} alt="" width={20} height={20} loading="lazy" decoding="async" />
            <span>{provider.provider_name}</span>
          </div>
          <DiscoveryRow fetchUrl={`/api/recommendations?tab=platform&mediaType=${mediaType}&providerId=${provider.provider_id}`} requestedIds={requestedIds} onRequest={onRequest} />
        </div>
      ))}
      {providers.length > limit && <button className="btn btn-outline" onClick={() => setLimit((value) => value + 6)}>Show more platforms</button>}
    </>
  );
}

// ---------------------------------------------------------------------------
// RecommendationsPage
// ---------------------------------------------------------------------------

export function RecommendationsPage() {
  const { toast } = useToast();
  const { openModal } = useNameModal();

  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [recentSeeds, setRecentSeeds] = useState<RecentSeed[]>([]);
  const [providers, setProviders] = useState<WatchProvider[]>([]);
  const pendingRef = useRef<Set<string>>(new Set());
  const [libraryVersion, setLibraryVersion] = useState(0);

  // Load requested IDs + derive recent seeds from wishlist
  useEffect(() => {
    fetch('/api/requests?summary=true')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.requests)) {
          const requests: Request[] = data.requests;
          setRequestedIds(new Set(requests.map(mediaKey)));
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

      if (pendingRef.current.has(mediaKey(item))) return;
      pendingRef.current.add(mediaKey(item));
      setRequestedIds((prev) => new Set(prev).add(mediaKey(item)));

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

        if (res.status === 409) {
          if (data.available) {
            setRequestedIds((prev) => { const next = new Set(prev); next.delete(mediaKey(item)); return next; });
            // Refresh affected rows to replace request buttons with availability.
            setLibraryVersion((version) => version + 1);
          }
          toast(data.available ? 'Already available in Jellyfin!' : 'Already in the wish list!', 'info');
          return;
        }
        if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
        toast(`"${item.title}" added to wish list!`, 'success');
      } catch {
        setRequestedIds((prev) => {
          const next = new Set(prev);
          next.delete(mediaKey(item));
          return next;
        });
        toast('Failed to add request. Please try again.', 'danger');
      } finally {
        pendingRef.current.delete(mediaKey(item));
      }
    },
    [openModal, toast],
  );

  return (
    <main className="main">
      <div className="container" key={libraryVersion}>
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
            onRequest={handleRequest}
          />
        </div>

        {/* Because You Liked — hidden when wishlist empty */}
        {recentSeeds.map((seed) => (
          <div key={mediaKey(seed)} className="discovery-section">
            <div className="discovery-row-header">
              <span className="discovery-row-title">Because You Liked</span>
              <span className="discovery-row-subtitle" style={{ color: 'var(--accent)' }}>
                &nbsp;{seed.title}
              </span>
              <span className="discovery-row-subtitle">
                &nbsp;·&nbsp;{seed.media_type === 'movie' ? 'movies' : 'TV shows'}
              </span>
            </div>
            <DiscoveryRow
              fetchUrl={`/api/recommendations?tab=because_liked&tmdbId=${seed.tmdb_id}&seedType=${seed.media_type}`}
              requestedIds={requestedIds}
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
