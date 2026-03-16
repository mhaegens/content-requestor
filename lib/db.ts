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

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------

const DB_DIR = path.join(process.cwd(), 'data');
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
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id                    TEXT PRIMARY KEY,
    tmdb_id               INTEGER NOT NULL UNIQUE,
    media_type            TEXT    NOT NULL CHECK(media_type IN ('movie','tv')),
    title                 TEXT    NOT NULL,
    year                  TEXT,
    poster_path           TEXT,
    overview              TEXT,
    vote_average          REAL    DEFAULT 0,
    requested_by          TEXT    NOT NULL DEFAULT 'Anonymous',
    requested_at          TEXT    NOT NULL,
    available_in_jellyfin INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_requested_at ON requests(requested_at DESC);
`);

// Idempotent migration: add column to existing databases
try {
  db.exec(`ALTER TABLE requests ADD COLUMN available_in_jellyfin INTEGER NOT NULL DEFAULT 0`);
} catch {
  // Column already exists — safe to ignore
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const stmts = {
  getAll: db.prepare<[], Request>(
    'SELECT * FROM requests ORDER BY requested_at DESC',
  ),
  getById: db.prepare<[string], Request>('SELECT * FROM requests WHERE id = ?'),
  findByTmdb: db.prepare<[number], { id: string }>(
    'SELECT id FROM requests WHERE tmdb_id = ?',
  ),
  insert: db.prepare(`
    INSERT INTO requests
      (id, tmdb_id, media_type, title, year, poster_path, overview, vote_average, requested_by, requested_at)
    VALUES
      (@id, @tmdb_id, @media_type, @title, @year, @poster_path, @overview, @vote_average, @requested_by, @requested_at)
  `),
  deleteOne: db.prepare<[string]>('DELETE FROM requests WHERE id = ?'),
  deleteAll: db.prepare('DELETE FROM requests'),
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
  (data: Omit<Request, 'id' | 'requested_at' | 'available_in_jellyfin'>): Request | null => {
    if (stmts.findByTmdb.get(data.tmdb_id)) return null; // duplicate
    const row: Request = {
      ...data,
      id: uuidv4(),
      requested_at: new Date().toISOString(),
      available_in_jellyfin: false,
    };
    stmts.insert.run(row);
    return row;
  },
);

export function addRequest(
  data: Omit<Request, 'id' | 'requested_at' | 'available_in_jellyfin'>,
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

export function isRequested(tmdbId: number): boolean {
  return !!stmts.findByTmdb.get(tmdbId);
}

export function setJellyfinAvailable(id: string, available: boolean): boolean {
  return stmts.setJellyfinFlag.run(available ? 1 : 0, id).changes > 0;
}
