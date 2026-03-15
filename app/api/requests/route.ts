import { NextRequest, NextResponse } from 'next/server';
import { getAllRequests, addRequest, clearAllRequests } from '@/lib/db';
import type { MediaType } from '@/types';

export const runtime = 'nodejs';

// GET /api/requests — return all requests, newest first
export async function GET() {
  try {
    const requests = getAllRequests();
    return NextResponse.json({ requests });
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

    if (!tmdb_id || typeof tmdb_id !== 'number') {
      return NextResponse.json({ error: 'Invalid tmdb_id' }, { status: 400 });
    }
    if (media_type !== 'movie' && media_type !== 'tv') {
      return NextResponse.json({ error: 'Invalid media_type' }, { status: 400 });
    }
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
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
export async function DELETE() {
  try {
    const count = clearAllRequests();
    return NextResponse.json({ deleted: count });
  } catch (err) {
    console.error('[DELETE /api/requests]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
