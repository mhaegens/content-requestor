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
