export type MediaType = 'movie' | 'tv';
export type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed';
export type Availability = 'available' | 'missing' | 'unknown';

/** A row in the requests SQLite table */
export interface Request {
  id: string;           // UUID (internal PK)
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  requested_by: string;
  requested_at: string; // ISO 8601
  available_in_jellyfin: boolean;
  delivery_status: DeliveryStatus;
  delivery_error: string | null;
  external_id: number | null;
  approved_at: string | null;
  delivery_started_at: string | null;
}

/** Shape returned from the TMDB proxy endpoint */
export interface SearchResult {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  availability?: Availability;
}

export function mediaKey(item: { media_type: MediaType; tmdb_id: number }): string {
  return `${item.media_type}:${item.tmdb_id}`;
}
