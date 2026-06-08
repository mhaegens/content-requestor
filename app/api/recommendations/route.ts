import { NextRequest, NextResponse } from 'next/server';
import {
  getTrending,
  getHighlyRated,
  getNewReleases,
  getRecommendationsFor,
  discoverByProvider,
  getBelgianProviders,
} from '@/lib/tmdb';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get('tab') ?? 'trending';
  const mediaType: 'movie' | 'tv' = searchParams.get('mediaType') === 'tv' ? 'tv' : 'movie';

  try {
    if (tab === 'providers') {
      const providers = await getBelgianProviders();
      return NextResponse.json({ providers });
    }

    if (tab === 'trending') {
      const results = await getTrending(mediaType);
      return NextResponse.json({ results });
    }

    if (tab === 'highly_rated') {
      const results = await getHighlyRated(mediaType);
      return NextResponse.json({ results });
    }

    if (tab === 'new_releases') {
      const results = await getNewReleases(mediaType);
      return NextResponse.json({ results });
    }

    if (tab === 'because_liked') {
      const tmdbId = parseInt(searchParams.get('tmdbId') ?? '0', 10);
      const seedType: 'movie' | 'tv' = searchParams.get('seedType') === 'tv' ? 'tv' : 'movie';
      if (!tmdbId) return NextResponse.json({ results: [] });
      const results = await getRecommendationsFor(seedType, tmdbId);
      return NextResponse.json({ results });
    }

    if (tab === 'platform') {
      const providerId = parseInt(searchParams.get('providerId') ?? '0', 10);
      if (!providerId) return NextResponse.json({ results: [] });
      const results = await discoverByProvider(mediaType, providerId);
      return NextResponse.json({ results });
    }

    return NextResponse.json({ results: [] });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch recommendations' }, { status: 500 });
  }
}
