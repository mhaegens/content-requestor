import { NextRequest, NextResponse } from 'next/server';
import { deleteRequest } from '@/lib/db';

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
