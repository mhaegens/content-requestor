import { mediaKey, type SearchResult, type MediaType } from '@/types';
import { serviceJson, serviceUrl } from './integration-http';
import { getAllRequests, isMarkedAvailable } from './db';

interface LibrarySnapshot {
  keys: Set<string>;
  checkedAt: number;
  healthy: boolean;
  configured: boolean;
}
interface LibraryItem { Type?: string; ProviderIds?: Record<string, string>; IsVirtualItem?: boolean }

let snapshot: LibrarySnapshot | undefined;
let inFlight: Promise<LibrarySnapshot> | undefined;
let retryAt = 0;
let configuration = '';

export async function getJellyfinLibrary(): Promise<LibrarySnapshot> {
  const currentConfiguration = `${process.env.JELLYFIN_URL ?? ''}|${process.env.JELLYFIN_API_KEY ?? ''}`;
  if (currentConfiguration !== configuration) {
    snapshot = undefined; retryAt = 0; inFlight = undefined; configuration = currentConfiguration;
  }
  const configured = Boolean(process.env.JELLYFIN_URL || process.env.JELLYFIN_API_KEY);
  if (!configured) return { keys: new Set(), checkedAt: 0, healthy: true, configured: false };
  if (snapshot && Date.now() < retryAt) return snapshot;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const base = serviceUrl('JELLYFIN', process.env.JELLYFIN_URL);
      const key = process.env.JELLYFIN_API_KEY;
      if (!key) throw new Error('Missing API key');
      const keys = new Set<string>();
      let start = 0;
      // Page on the server; never ship the entire library to a mobile client.
      for (;;) {
        const params = new URLSearchParams({
          Recursive: 'true', IncludeItemTypes: 'Movie,Series', Fields: 'ProviderIds',
          IsVirtualItem: 'false', EnableImages: 'false', EnableUserData: 'false',
          StartIndex: String(start), Limit: '500',
        });
        const page = await serviceJson<{ Items: LibraryItem[]; TotalRecordCount: number }>(
          'Jellyfin', `${base}/Items?${params}`, { 'X-Emby-Token': key },
        );
        if (!Array.isArray(page.Items) || !Number.isFinite(page.TotalRecordCount)) throw new Error('Invalid library');
        for (const item of page.Items) {
          const id = Object.entries(item.ProviderIds ?? {}).find(([name]) => name.toLowerCase() === 'tmdb')?.[1];
          if (id && /^\d+$/.test(id) && !item.IsVirtualItem && (item.Type === 'Movie' || item.Type === 'Series')) {
            keys.add(`${item.Type === 'Movie' ? 'movie' : 'tv'}:${Number(id)}`);
          }
        }
        start += page.Items.length;
        if (start >= page.TotalRecordCount) break;
        if (!page.Items.length || start > 500000) throw new Error('Incomplete library');
      }
      snapshot = { keys, checkedAt: Date.now(), healthy: true, configured: true };
      retryAt = Date.now() + 60000;
    } catch {
      // Keep known positives during an outage; unknown titles cannot be requested.
      snapshot = { keys: snapshot?.keys ?? new Set(), checkedAt: snapshot?.checkedAt ?? 0, healthy: false, configured: true };
      retryAt = Date.now() + 15000;
    }
    return snapshot;
  })();
  try { return await inFlight; } finally { inFlight = undefined; }
}

export async function jellyfinAvailability(item: { media_type: MediaType; tmdb_id: number }) {
  if (isMarkedAvailable(item.tmdb_id, item.media_type)) return 'available' as const;
  const library = await getJellyfinLibrary();
  return library.keys.has(mediaKey(item)) ? 'available' as const : library.healthy ? 'missing' as const : 'unknown' as const;
}

export async function withAvailability(items: SearchResult[]): Promise<SearchResult[]> {
  const library = await getJellyfinLibrary();
  const markedAvailable = new Set(getAllRequests().filter((item) => item.available_in_jellyfin).map(mediaKey));
  return items.map((item) => ({
    ...item,
    availability: library.keys.has(mediaKey(item)) || markedAvailable.has(mediaKey(item)) ? 'available' : library.healthy ? 'missing' : 'unknown',
  }));
}
