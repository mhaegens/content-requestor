/**
 * SQLite database layer using better-sqlite3.
 *
 * better-sqlite3 is synchronous and cannot run in the Next.js Edge Runtime.
 * All callers must use the Node.js runtime (the default for App Router routes).
 *
 * The singleton pattern via `global` prevents multiple open connections during
 * Next.js hot-module-reload in development.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Request } from '@/types';

type NewRequest = Pick<Request, 'tmdb_id' | 'media_type' | 'title' | 'year' | 'poster_path' | 'overview' | 'vote_average' | 'requested_by'>;

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------

const DB_DIR = process.env.REQUESTR_DATA_DIR ?? path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'requests.db');

// Ensure the data directory exists (created automatically on first run)
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

declare global {
  // eslint-disable-next-line no-var
  var _requestrDb: Database.Database | undefined;
}

const db: Database.Database =
  global._requestrDb ?? new Database(DB_PATH);

// Always cache to global — prevents multiple connections if the module is
// re-evaluated (Next.js HMR in dev) or a new worker is spun up in production,
// which would otherwise risk SQLITE_BUSY "database is locked" errors.
global._requestrDb = db;

// Performance & safety pragmas
db.pragma('busy_timeout = 10000');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

// Migrate the original table in a transaction so a movie and a TV series may
// share a numeric TMDB ID without colliding. Existing requests remain intact.
const schema = `
  CREATE TABLE requests (
    id TEXT PRIMARY KEY,
    tmdb_id INTEGER NOT NULL,
    media_type TEXT NOT NULL CHECK(media_type IN ('movie','tv')),
    title TEXT NOT NULL,
    year TEXT,
    poster_path TEXT,
    overview TEXT,
    vote_average REAL DEFAULT 0,
    requested_by TEXT NOT NULL DEFAULT 'Anonymous',
    requested_at TEXT NOT NULL,
    available_in_jellyfin INTEGER NOT NULL DEFAULT 0,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    delivery_error TEXT,
    external_id INTEGER,
    approved_at TEXT,
    delivery_started_at TEXT,
    UNIQUE(tmdb_id, media_type)
  );
`;

db.transaction(() => {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'requests'").get() as { sql: string } | undefined;
  if (!table) {
    db.exec(schema);
  } else {
    const columns = new Set((db.pragma('table_info(requests)') as { name: string }[]).map((column) => column.name));
    const additions: Record<string, string> = {
      available_in_jellyfin: 'INTEGER NOT NULL DEFAULT 0',
      delivery_status: "TEXT NOT NULL DEFAULT 'pending'",
      delivery_error: 'TEXT', external_id: 'INTEGER', approved_at: 'TEXT', delivery_started_at: 'TEXT',
    };
    for (const [name, definition] of Object.entries(additions)) {
      if (!columns.has(name)) db.exec(`ALTER TABLE requests ADD COLUMN ${name} ${definition}`);
    }
    if (/tmdb_id\s+INTEGER\s+NOT NULL\s+UNIQUE/i.test(table.sql)) {
      db.exec('ALTER TABLE requests RENAME TO requests_legacy');
      db.exec(schema);
      const fields = 'id, tmdb_id, media_type, title, year, poster_path, overview, vote_average, requested_by, requested_at, available_in_jellyfin, delivery_status, delivery_error, external_id, approved_at, delivery_started_at';
      db.exec(`INSERT INTO requests (${fields}) SELECT ${fields} FROM requests_legacy`);
      db.exec('DROP TABLE requests_legacy');
    }
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_requested_at ON requests(requested_at DESC)');
}).immediate();

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const stmts = {
  getAll: db.prepare<[], Request>(
    'SELECT * FROM requests ORDER BY requested_at DESC',
  ),
  getById: db.prepare<[string], Request>('SELECT * FROM requests WHERE id = ?'),
  findByTmdb: db.prepare<[number, string], { id: string }>(
    'SELECT id FROM requests WHERE tmdb_id = ? AND media_type = ?',
  ),
  insert: db.prepare(`
    INSERT INTO requests
      (id, tmdb_id, media_type, title, year, poster_path, overview, vote_average, requested_by, requested_at)
    VALUES
      (@id, @tmdb_id, @media_type, @title, @year, @poster_path, @overview, @vote_average, @requested_by, @requested_at)
  `),
  deleteOne: db.prepare<[string]>("DELETE FROM requests WHERE id = ? AND delivery_status != 'sending'"),
  deleteAll: db.prepare("DELETE FROM requests WHERE delivery_status != 'sending'"),
  setJellyfinFlag: db.prepare<[number, string]>(
    'UPDATE requests SET available_in_jellyfin = ? WHERE id = ?',
  ),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAllRequests(): Request[] {
  const rows = stmts.getAll.all();
  return rows.map((r) => ({ ...r, available_in_jellyfin: Boolean((r as unknown as { available_in_jellyfin: number }).available_in_jellyfin) }));
}

// Atomic check-then-insert in a single transaction. Prevents a race condition
// where two concurrent requests for the same TMDB ID both pass the duplicate
// check and then the second one throws a UNIQUE constraint violation (which
// would surface as a 500 instead of a clean 409).
const insertIfNew = db.transaction(
  (data: NewRequest): Request | null => {
    if (stmts.findByTmdb.get(data.tmdb_id, data.media_type)) return null; // duplicate
    const row: Request = {
      ...data,
      id: uuidv4(),
      requested_at: new Date().toISOString(),
      available_in_jellyfin: false,
      delivery_status: 'pending', delivery_error: null, external_id: null, approved_at: null, delivery_started_at: null,
    };
    stmts.insert.run(row);
    return row;
  },
);

export function addRequest(
  data: NewRequest,
): Request | null {
  try {
    return insertIfNew(data);
  } catch (err) {
    // If a UNIQUE constraint fires despite the transaction guard (e.g. a second
    // connection won the race), treat it as a duplicate rather than a hard error.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) return null;
    throw err;
  }
}

export function deleteRequest(id: string): boolean {
  return stmts.deleteOne.run(id).changes > 0;
}

export function clearAllRequests(): number {
  return stmts.deleteAll.run().changes;
}

export function isRequested(tmdbId: number, mediaType: 'movie' | 'tv'): boolean {
  return !!stmts.findByTmdb.get(tmdbId, mediaType);
}

export function isMarkedAvailable(tmdbId: number, mediaType: 'movie' | 'tv'): boolean {
  return Boolean(db.prepare('SELECT 1 FROM requests WHERE tmdb_id = ? AND media_type = ? AND available_in_jellyfin = 1').get(tmdbId, mediaType));
}

export function setJellyfinAvailable(id: string, available: boolean): boolean {
  return stmts.setJellyfinFlag.run(available ? 1 : 0, id).changes > 0;
}

const statsQuery = db.prepare<[string], {
  total: number;
  pending: number;
  movies: number;
  tv: number;
  in_jellyfin: number;
  new_count: number;
}>(`
  SELECT
    COUNT(*)                                                        AS total,
    SUM(CASE WHEN available_in_jellyfin = 0 THEN 1 ELSE 0 END)     AS pending,
    SUM(CASE WHEN media_type = 'movie'      THEN 1 ELSE 0 END)     AS movies,
    SUM(CASE WHEN media_type = 'tv'         THEN 1 ELSE 0 END)     AS tv,
    SUM(CASE WHEN available_in_jellyfin = 1 THEN 1 ELSE 0 END)     AS in_jellyfin,
    SUM(CASE WHEN requested_at >= ?         THEN 1 ELSE 0 END)     AS new_count
  FROM requests
`);

/** Returns aggregated stats. Pass an ISO 8601 timestamp as `since` to count recent requests. */
export function getRequestStats(since: string) {
  const row = statsQuery.get(since)!;
  return {
    total:       row.total       ?? 0,
    pending:     row.pending     ?? 0,
    movies:      row.movies      ?? 0,
    tv:          row.tv          ?? 0,
    in_jellyfin: row.in_jellyfin ?? 0,
    new_count:   row.new_count   ?? 0,
  };
}

export function getRequest(id: string): Request | null {
  const row = stmts.getById.get(id);
  return row ? { ...row, available_in_jellyfin: Boolean(row.available_in_jellyfin) } : null;
}

/** A persisted lease prevents double-clicks and concurrent server processes. */
export function claimDelivery(id: string): boolean {
  return db.prepare(`UPDATE requests SET delivery_status = 'sending', delivery_error = NULL, delivery_started_at = ?
    WHERE id = ? AND (delivery_status IN ('pending', 'failed') OR
      (delivery_status = 'sending' AND delivery_started_at < ?))`)
    .run(new Date().toISOString(), id, new Date(Date.now() - 120000).toISOString()).changes > 0;
}

export function finishDelivery(id: string, externalId: number): void {
  db.prepare(`UPDATE requests SET delivery_status = 'sent', delivery_error = NULL, external_id = ?, approved_at = ? WHERE id = ?`)
    .run(externalId, new Date().toISOString(), id);
}

export function failDelivery(id: string, message: string): void {
  db.prepare("UPDATE requests SET delivery_status = 'failed', delivery_error = ? WHERE id = ?").run(message, id);
}
