import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getRequest, claimDelivery, finishDelivery, failDelivery } from '@/lib/db';
import { jellyfinAvailability } from '@/lib/jellyfin';
import { sendToServarr } from '@/lib/servarr';
import { IntegrationError } from '@/lib/integration-http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const item = getRequest(params.id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.delivery_status === 'sent') return NextResponse.json({ request: item });
  const availability = await jellyfinAvailability(item);
  if (item.available_in_jellyfin || availability === 'available') {
    return NextResponse.json({ request: { ...item, available_in_jellyfin: true } });
  }
  if (availability === 'unknown') {
    return NextResponse.json({ error: 'Jellyfin is unavailable. Retry when the library can be checked.' }, { status: 503 });
  }
  if (!claimDelivery(item.id)) {
    const latest = getRequest(item.id);
    return NextResponse.json({ request: latest, error: 'This request is already being sent. Refresh its status before retrying.' }, { status: 409 });
  }
  try {
    const externalId = await sendToServarr(item);
    finishDelivery(item.id, externalId);
    return NextResponse.json({ request: getRequest(item.id) });
  } catch (error) {
    const message = error instanceof IntegrationError ? error.message : 'Could not send this request. Check the integration settings and retry.';
    failDelivery(item.id, message);
    return NextResponse.json({ error: message, request: getRequest(item.id) }, { status: 502 });
  }
}
