import { NextRequest, NextResponse } from 'next/server';
import { searchTMDB } from '@/lib/tmdb';
import type { MediaType } from '@/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query = (searchParams.get('q') ?? '').trim();
  const rawType = searchParams.get('type') ?? 'all';

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter q' }, { status: 400 });
  }

  // Validate type
  const type: 'all' | MediaType =
    rawType === 'movie' || rawType === 'tv' ? rawType : 'all';

  try {
    const results = await searchTMDB(query, type);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('[/api/search]', err);
    return NextResponse.json(
      { error: 'Failed to fetch from TMDB. Please try again.' },
      { status: 502 },
    );
  }
}
