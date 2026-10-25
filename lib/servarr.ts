import type { Request as MediaRequest } from '@/types';
import { serviceJson, serviceUrl, IntegrationError } from './integration-http';
import { getTvdbId } from './tmdb';

interface ArrItem {
  id?: number;
  tmdbId?: number;
  tvdbId?: number;
  title?: string;
  seasons?: { seasonNumber: number; monitored: boolean }[];
  [key: string]: unknown;
}

export async function sendToServarr(item: MediaRequest): Promise<number> {
  const movie = item.media_type === 'movie';
  const name = movie ? 'RADARR' : 'SONARR';
  const base = serviceUrl(name, process.env[`${name}_URL`]);
  const apiKey = process.env[`${name}_API_KEY`];
  const qualityProfileId = Number(process.env[`${name}_QUALITY_PROFILE_ID`]);
  const rootFolderPath = process.env[`${name}_ROOT_FOLDER`];
  if (!apiKey || !Number.isSafeInteger(qualityProfileId) || qualityProfileId < 1 || !rootFolderPath?.startsWith('/')) {
    throw new IntegrationError(`Configure ${name}_API_KEY, ${name}_QUALITY_PROFILE_ID and ${name}_ROOT_FOLDER on the server.`);
  }
  const headers = { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' };
  const call = <T,>(path: string, init?: RequestInit) => serviceJson<T>(name, `${base}/api/v3/${path}`, headers, init);
  const externalId = movie ? item.tmdb_id : await getTvdbId(item.tmdb_id);
  const field = movie ? 'tmdbId' : 'tvdbId';
  const resource = movie ? 'movie' : 'series';
  const findExisting = async () => {
    const existing = await call<ArrItem[]>(`${resource}?${field}=${externalId}`);
    return existing.find((entry) => entry[field] === externalId);
  };
  const search = async (id: number) => {
    await call('command', { method: 'POST', body: JSON.stringify(movie
      ? { name: 'MoviesSearch', movieIds: [id] }
      : { name: 'SeriesSearch', seriesId: id }) });
  };
  const existing = await findExisting();
  if (existing?.id) {
    // Retry after a timeout reuses the existing entry, including unmonitored titles.
    await call(`${resource}/${existing.id}`, { method: 'PUT', body: JSON.stringify({
      ...existing, monitored: true,
      ...(!movie ? { seasons: existing.seasons?.map((season) => ({ ...season, monitored: season.seasonNumber > 0 })) } : {}),
    }) });
    await search(existing.id);
    return existing.id;
  }
  const lookup = await call<ArrItem[]>(`${resource}/lookup?term=${movie ? 'tmdb' : 'tvdb'}:${externalId}`);
  const match = lookup.find((entry) => entry[field] === externalId);
  if (!match) throw new IntegrationError(`${name} could not find this title by its ${movie ? 'TMDB' : 'TVDB'} ID.`);
  const payload = {
    ...match, id: undefined, qualityProfileId, rootFolderPath, monitored: true,
    ...(movie ? { minimumAvailability: 'released', addOptions: { searchForMovie: true } } : {
      seasonFolder: true,
      seasons: match.seasons?.map((season) => ({ ...season, monitored: season.seasonNumber > 0 })),
      addOptions: { monitor: 'all', searchForMissingEpisodes: true },
    }),
  };
  try {
    const added = await call<ArrItem>(resource, { method: 'POST', body: JSON.stringify(payload) });
    if (!added.id) throw new IntegrationError(`${name} did not return an item ID.`);
    return added.id;
  } catch (error) {
    // A second instance, or a timed-out POST, may have created the item already.
    const found = await findExisting();
    if (!found?.id) throw error;
    await search(found.id);
    return found.id;
  }
}
