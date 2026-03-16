export type MediaType = 'movie' | 'tv';

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
}
