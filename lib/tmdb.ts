/**
 * TMDB API helpers — server-side only.
 *
 * The Read Access Token is loaded from the TMDB_READ_TOKEN environment
 * variable and used as a Bearer token.  It is NEVER sent to the browser.
 *
 * Docs: https://developer.themoviedb.org/reference/intro/getting-started
 */

import type { SearchResult, MediaType } from '@/types';

const BASE = 'https://api.themoviedb.org/3';

function headers(): HeadersInit {
  const token = process.env.TMDB_READ_TOKEN;
  if (!token) throw new Error('TMDB_READ_TOKEN environment variable is not set');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Normalise raw TMDB objects
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseMovie(item: any): SearchResult {
  return {
    tmdb_id: item.id,
    media_type: 'movie',
    title: item.title || item.original_title || 'Unknown',
    year: (item.release_date as string | undefined)?.slice(0, 4) ?? '',
    poster_path: item.poster_path ?? null,
    overview: item.overview ?? '',
    vote_average: item.vote_average ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseTV(item: any): SearchResult {
  return {
    tmdb_id: item.id,
    media_type: 'tv',
    title: item.name || item.original_name || 'Unknown',
    year: (item.first_air_date as string | undefined)?.slice(0, 4) ?? '',
    poster_path: item.poster_path ?? null,
    overview: item.overview ?? '',
    vote_average: item.vote_average ?? 0,
  };
}

// ---------------------------------------------------------------------------
// ID lookup
// ---------------------------------------------------------------------------

async function fetchById(
  id: number,
  type: 'all' | MediaType,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  if (type === 'all' || type === 'movie') {
    const res = await fetch(`${BASE}/movie/${id}`, { headers: headers() });
    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (!data.status_code) results.push(normaliseMovie(data));
    }
  }

  if (type === 'all' || type === 'tv') {
    const res = await fetch(`${BASE}/tv/${id}`, { headers: headers() });
    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (!data.status_code) results.push(normaliseTV(data));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Text search
// ---------------------------------------------------------------------------

async function fetchByText(
  query: string,
  type: 'all' | MediaType,
): Promise<SearchResult[]> {
  const q = encodeURIComponent(query);

  if (type === 'all') {
    const res = await fetch(
      `${BASE}/search/multi?query=${q}&include_adult=false&page=1`,
      { headers: headers() },
    );
    if (!res.ok) throw new Error(`TMDB API error ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    return (data.results ?? [])
      .filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (i: any) => i.media_type === 'movie' || i.media_type === 'tv',
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((i: any) =>
        i.media_type === 'movie' ? normaliseMovie(i) : normaliseTV(i),
      )
      .slice(0, 20);
  }

  const endpoint =
    type === 'movie'
      ? `${BASE}/search/movie?query=${q}&include_adult=false&page=1`
      : `${BASE}/search/tv?query=${q}&include_adult=false&page=1`;

  const res = await fetch(endpoint, { headers: headers() });
  if (!res.ok) throw new Error(`TMDB API error ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  return (data.results ?? [])
    .map(type === 'movie' ? normaliseMovie : normaliseTV)
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchTMDB(
  query: string,
  type: 'all' | MediaType = 'all',
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Numeric input → direct ID lookup
  if (/^\d+$/.test(trimmed)) {
    return fetchById(parseInt(trimmed, 10), type);
  }

  return fetchByText(trimmed, type);
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

export async function getTrending(
  mediaType: 'movie' | 'tv',
  timeWindow: 'week' | 'day' = 'week',
): Promise<SearchResult[]> {
  const res = await fetch(
    `${BASE}/trending/${mediaType}/${timeWindow}?language=en-US&region=BE`,
    { headers: headers(), next: { revalidate: 3600 } },
  );
  if (!res.ok) throw new Error(`TMDB trending error ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const normalise = mediaType === 'movie' ? normaliseMovie : normaliseTV;
  return (data.results ?? []).slice(0, 20).map(normalise);
}

export async function getHighlyRated(
  mediaType: 'movie' | 'tv',
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    sort_by: 'popularity.desc',
    'vote_average.gte': '7.5',
    'vote_count.gte': '500',
    language: 'en-US',
    include_adult: 'false',
    region: 'BE',
  });
  const res = await fetch(`${BASE}/discover/${mediaType}?${params}`, {
    headers: headers(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDB highly rated error ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const normalise = mediaType === 'movie' ? normaliseMovie : normaliseTV;
  return (data.results ?? []).slice(0, 20).map(normalise);
}

export async function getNewReleases(
  mediaType: 'movie' | 'tv',
): Promise<SearchResult[]> {
  const endpoint =
    mediaType === 'movie'
      ? `${BASE}/movie/now_playing?language=en-US&region=BE`
      : `${BASE}/tv/on_the_air?language=en-US`;
  const res = await fetch(endpoint, {
    headers: headers(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDB new releases error ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const normalise = mediaType === 'movie' ? normaliseMovie : normaliseTV;
  return (data.results ?? []).slice(0, 20).map(normalise);
}

export async function getRecommendationsFor(
  mediaType: 'movie' | 'tv',
  tmdbId: number,
): Promise<SearchResult[]> {
  const res = await fetch(
    `${BASE}/${mediaType}/${tmdbId}/recommendations?language=en-US`,
    { headers: headers(), next: { revalidate: 3600 } },
  );
  if (!res.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const normalise = mediaType === 'movie' ? normaliseMovie : normaliseTV;
  return (data.results ?? []).slice(0, 20).map(normalise);
}

export async function discoverByProvider(
  mediaType: 'movie' | 'tv',
  providerId: number,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    sort_by: 'popularity.desc',
    watch_region: 'BE',
    with_watch_providers: String(providerId),
    with_watch_monetization_types: 'flatrate',
    language: 'en-US',
    include_adult: 'false',
  });
  const res = await fetch(`${BASE}/discover/${mediaType}?${params}`, {
    headers: headers(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDB discover error ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const normalise = mediaType === 'movie' ? normaliseMovie : normaliseTV;
  return (data.results ?? []).slice(0, 20).map(normalise);
}

export async function getBelgianProviders(): Promise<WatchProvider[]> {
  // TODO: TV mode could use /watch/providers/tv for a more accurate provider list
  const res = await fetch(
    `${BASE}/watch/providers/movie?language=en-US&watch_region=BE`,
    { headers: headers(), next: { revalidate: 86400 } },
  );
  if (!res.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.results ?? [])
    .sort((a: any, b: any) => a.display_priority - b.display_priority)
    .map((p: any) => ({
      provider_id: p.provider_id,
      provider_name: p.provider_name,
      logo_path: p.logo_path,
      display_priority: p.display_priority,
    }));
}

/** Sonarr uses TVDB IDs; resolve TMDB shows explicitly instead of guessing by title. */
export async function getTvdbId(tmdbId: number): Promise<number> {
  const { serviceJson, IntegrationError } = await import('./integration-http');
  const result = await serviceJson<{ tvdb_id?: number }>('TMDB', `${BASE}/tv/${tmdbId}/external_ids`, headers());
  if (!result.tvdb_id || !Number.isSafeInteger(result.tvdb_id)) {
    throw new IntegrationError('This TV show has no TVDB ID in TMDB and cannot be sent to Sonarr.');
  }
  return result.tvdb_id;
}
