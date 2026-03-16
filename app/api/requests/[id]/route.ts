import { NextRequest, NextResponse } from 'next/server';
import { deleteRequest, setJellyfinAvailable } from '@/lib/db';

export const runtime = 'nodejs';

// DELETE /api/requests/:id — remove a single request (admin)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const deleted = deleteRequest(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/requests/:id]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// PATCH /api/requests/:id — update available_in_jellyfin flag (admin)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { available_in_jellyfin } = body as Record<string, unknown>;

    if (typeof available_in_jellyfin !== 'boolean') {
      return NextResponse.json({ error: 'Invalid available_in_jellyfin' }, { status: 400 });
    }

    const updated = setJellyfinAvailable(id, available_in_jellyfin);
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ available_in_jellyfin });
  } catch (err) {
    console.error('[PATCH /api/requests/:id]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
