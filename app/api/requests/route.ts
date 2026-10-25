import { NextRequest, NextResponse } from 'next/server';
import { getAllRequests, addRequest, clearAllRequests } from '@/lib/db';
import type { MediaType } from '@/types';
import { mediaKey } from '@/types';
import { getJellyfinLibrary, jellyfinAvailability } from '@/lib/jellyfin';
import { requireAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

// GET /api/requests — return all requests, newest first
export async function GET(req: NextRequest) {
  try {
    const library = await getJellyfinLibrary();
    const requests = getAllRequests().map((item) => ({
      ...item, available_in_jellyfin: item.available_in_jellyfin || library.keys.has(mediaKey(item)),
    }));
    const result = req.nextUrl.searchParams.get('summary') === 'true'
      ? requests.map(({ tmdb_id, media_type, title, available_in_jellyfin }) => ({ tmdb_id, media_type, title, available_in_jellyfin }))
      : requests;
    return NextResponse.json({ requests: result });
  } catch (err) {
    console.error('[GET /api/requests]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// POST /api/requests — submit a new request
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate required fields
    const { tmdb_id, media_type, title, year, poster_path, overview, vote_average, requested_by } =
      body as Record<string, unknown>;

    if (typeof tmdb_id !== 'number' || !Number.isSafeInteger(tmdb_id) || tmdb_id < 1) {
      return NextResponse.json({ error: 'Invalid tmdb_id' }, { status: 400 });
    }
    if (media_type !== 'movie' && media_type !== 'tv') {
      return NextResponse.json({ error: 'Invalid media_type' }, { status: 400 });
    }
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
    }

    const availability = await jellyfinAvailability({ tmdb_id, media_type });
    if (availability === 'available') {
      return NextResponse.json({ error: 'Already available in Jellyfin', available: true }, { status: 409 });
    }
    if (availability === 'unknown') {
      return NextResponse.json({ error: 'Jellyfin is unavailable. Please try again shortly.' }, { status: 503 });
    }

    const sanitisedBy =
      typeof requested_by === 'string' && requested_by.trim()
        ? requested_by.trim().slice(0, 64) // max 64 chars
        : 'Anonymous';

    const result = addRequest({
      tmdb_id: Number(tmdb_id),
      media_type: media_type as MediaType,
      title: String(title).slice(0, 255),
      year: typeof year === 'string' ? year.slice(0, 4) : '',
      poster_path: typeof poster_path === 'string' ? poster_path : null,
      overview: typeof overview === 'string' ? overview.slice(0, 1000) : '',
      vote_average: typeof vote_average === 'number' ? vote_average : 0,
      requested_by: sanitisedBy,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Already requested', duplicate: true },
        { status: 409 },
      );
    }

    return NextResponse.json({ request: result }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/requests]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// DELETE /api/requests — clear all requests (admin)
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const count = clearAllRequests();
    return NextResponse.json({ deleted: count });
  } catch (err) {
    console.error('[DELETE /api/requests]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
