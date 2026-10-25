import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import type { Request as MediaRequest } from '../types';

const directory = mkdtempSync(join(tmpdir(), 'requestr-test-'));
process.env.REQUESTR_DATA_DIR = directory;
process.env.ADMIN_API_KEY = 'test-admin';
process.env.TMDB_READ_TOKEN = 'test-tmdb';
let db: typeof import('../lib/db');
let library: typeof import('../lib/jellyfin');
let requests: typeof import('../app/api/requests/route');
let approval: typeof import('../app/api/requests/[id]/approve/route');
let fetcher: typeof fetch;
let generation = 0;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const apiRequest = (url: string, init: RequestInit = {}) => new NextRequest(`http://localhost${url}`, init);
const input = (id: number, type: 'movie' | 'tv' = 'movie') => ({
  tmdb_id: id, media_type: type, title: `Title ${id}`, year: '2026', poster_path: null,
  overview: '', vote_average: 7, requested_by: 'Tester',
});
const add = (id: number, type: 'movie' | 'tv' = 'movie') => db.addRequest(input(id, type))!;
const approve = (item: MediaRequest, key = 'test-admin') => approval.POST(apiRequest(`/api/requests/${item.id}/approve`, {
  method: 'POST', headers: { Authorization: `Bearer ${key}` },
}), { params: { id: item.id } });
function jellyfin() {
  process.env.JELLYFIN_URL = `http://jellyfin.test/${++generation}`;
  process.env.JELLYFIN_API_KEY = 'test-jellyfin';
}
function noJellyfin() { delete process.env.JELLYFIN_URL; delete process.env.JELLYFIN_API_KEY; }
function arr() {
  for (const name of ['RADARR', 'SONARR']) {
    process.env[`${name}_URL`] = `http://${name.toLowerCase()}.test/base`;
    process.env[`${name}_API_KEY`] = 'test-key';
    process.env[`${name}_QUALITY_PROFILE_ID`] = '4';
    process.env[`${name}_ROOT_FOLDER`] = name === 'RADARR' ? '/movies' : '/tv';
  }
}

before(async () => {
  // Exercise the actual migration from the original table and UNIQUE TMDB key.
  const legacy = new Database(join(directory, 'requests.db'));
  legacy.exec(`CREATE TABLE requests (
    id TEXT PRIMARY KEY, tmdb_id INTEGER NOT NULL UNIQUE, media_type TEXT NOT NULL,
    title TEXT NOT NULL, year TEXT, poster_path TEXT, overview TEXT, vote_average REAL,
    requested_by TEXT, requested_at TEXT);
    INSERT INTO requests VALUES ('legacy', 12, 'movie', 'Existing request', '2020', NULL, '', 7, 'Friend', '2020-01-01');`);
  legacy.close();
  db = await import('../lib/db');
  library = await import('../lib/jellyfin');
  requests = await import('../app/api/requests/route');
  approval = await import('../app/api/requests/[id]/approve/route');
  fetcher = global.fetch;
});
after(() => { global.fetch = fetcher; global._requestrDb?.close(); rmSync(directory, { recursive: true, force: true }); });

test('migration preserves old requests and defaults', () => {
  const old = db.getRequest('legacy')!;
  assert.equal(old.title, 'Existing request');
  assert.equal(old.delivery_status, 'pending');
  assert.equal(old.available_in_jellyfin, false);
});

test('movie and TV numeric IDs are separate; duplicate same-type requests are rejected', () => {
  assert.ok(add(12, 'tv'));
  assert.equal(db.addRequest(input(12)), null);
});

test('library matching is paged, case-insensitive, shared, and distinguishes movie/TV IDs', async () => {
  jellyfin();
  let calls = 0;
  global.fetch = async (url, init) => {
    calls++;
    assert.equal((init?.headers as Record<string, string>)['X-Emby-Token'], 'test-jellyfin');
    const offset = Number(new URL(String(url)).searchParams.get('StartIndex'));
    return json({ Items: offset === 0
      ? [{ Type: 'Movie', ProviderIds: { Tmdb: '42' } }]
      : [{ Type: 'Series', ProviderIds: { tmdb: '43' } }, { Type: 'Movie', IsVirtualItem: true, ProviderIds: { Tmdb: '44' } }], TotalRecordCount: 3 });
  };
  const [one, two] = await Promise.all([library.getJellyfinLibrary(), library.getJellyfinLibrary()]);
  assert.equal(one, two);
  assert.equal(calls, 2);
  assert.deepEqual([...one.keys].sort(), ['movie:42', 'tv:43']);
  assert.equal(await library.jellyfinAvailability(input(42)), 'available');
  assert.equal(await library.jellyfinAvailability(input(42, 'tv')), 'missing');
  assert.equal(calls, 2);
});

test('availability annotates titles that were never requested and POST blocks them', async () => {
  const decorated = await library.withAvailability([input(42), input(42, 'tv')]);
  assert.equal(decorated[0].availability, 'available');
  assert.equal(decorated[1].availability, 'missing');
  const response = await requests.POST(apiRequest('/api/requests', { method: 'POST', body: JSON.stringify(input(42)) }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).available, true);
  assert.equal(db.isRequested(42, 'movie'), false);
});

test('library outage marks unknown titles and blocks requests without inserting rows', async () => {
  jellyfin();
  global.fetch = async () => { throw new Error('network failure with secret URL'); };
  assert.equal(await library.jellyfinAvailability(input(999)), 'unknown');
  const response = await requests.POST(apiRequest('/api/requests', { method: 'POST', body: JSON.stringify(input(999)) }));
  assert.equal(response.status, 503);
  assert.equal(db.isRequested(999, 'movie'), false);
});

test('manual availability still blocks requests with Jellyfin disabled', async () => {
  noJellyfin();
  db.setJellyfinAvailable('legacy', true);
  assert.equal(await library.jellyfinAvailability(input(12)), 'available');
  const decorated = await library.withAvailability([input(12)]);
  assert.equal(decorated[0].availability, 'available');
});

test('normal submission works without Jellyfin, summary omits large fields, duplicates return 409', async () => {
  noJellyfin();
  const request = apiRequest('/api/requests', { method: 'POST', body: JSON.stringify(input(70)) });
  assert.equal((await requests.POST(request)).status, 201);
  const duplicate = await requests.POST(apiRequest('/api/requests', { method: 'POST', body: JSON.stringify(input(70)) }));
  assert.equal(duplicate.status, 409);
  const summary = await (await requests.GET(apiRequest('/api/requests?summary=true'))).json();
  assert.equal('overview' in summary.requests[0], false);
});

test('unauthorized approval and deletion cannot mutate requests or call services', async () => {
  const item = add(101);
  global.fetch = async () => { throw new Error('Should not call a service'); };
  assert.equal((await approve(item, 'wrong-key')).status, 401);
  assert.equal((await requests.DELETE(apiRequest('/api/requests', { method: 'DELETE' }))).status, 401);
  assert.equal(db.getRequest(item.id)?.delivery_status, 'pending');
});

test('movie approval sends the exact TMDB ID, configured profile/root and immediate search; repeat approval is idempotent', async () => {
  noJellyfin(); arr();
  const item = add(102);
  const calls: string[] = [];
  global.fetch = async (url, init) => {
    const path = String(url); calls.push(path);
    assert.ok(path.startsWith('http://radarr.test/base/api/v3/'));
    assert.equal((init?.headers as Record<string, string>)['X-Api-Key'], 'test-key');
    if (path.includes('/lookup?')) return json([{ tmdbId: 102, title: 'Correct title' }]);
    if (init?.method === 'POST') {
      const payload = JSON.parse(String(init.body));
      assert.equal(payload.tmdbId, 102);
      assert.equal(payload.qualityProfileId, 4);
      assert.equal(payload.rootFolderPath, '/movies');
      assert.equal(payload.monitored, true);
      assert.equal(payload.addOptions.searchForMovie, true);
      return json({ id: 810 });
    }
    return json([]);
  };
  assert.equal((await approve(item)).status, 200);
  assert.equal(db.getRequest(item.id)?.delivery_status, 'sent');
  assert.equal(db.getRequest(item.id)?.available_in_jellyfin, false);
  assert.equal(db.getRequest(item.id)?.external_id, 810);
  const count = calls.length;
  assert.equal((await approve(item)).status, 200);
  assert.equal(calls.length, count);
});

test('TV approval maps TMDB to TVDB and monitors regular seasons, excluding specials', async () => {
  arr(); const item = add(103, 'tv');
  global.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('external_ids')) return json({ tvdb_id: 555 });
    if (path.includes('/lookup?')) {
      assert.ok(path.endsWith('term=tvdb:555'));
      return json([{ tvdbId: 555, seasons: [{ seasonNumber: 0 }, { seasonNumber: 1 }] }]);
    }
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      assert.equal(body.tvdbId, 555);
      assert.equal(body.addOptions.searchForMissingEpisodes, true);
      assert.deepEqual(body.seasons.map((s: { monitored: boolean }) => s.monitored), [false, true]);
      return json({ id: 811 });
    }
    return json([]);
  };
  assert.equal((await approve(item)).status, 200);
});

test('missing TVDB mapping is a visible retryable failure, never a fuzzy title match', async () => {
  const item = add(104, 'tv');
  global.fetch = async () => json({ tvdb_id: null });
  assert.equal((await approve(item)).status, 502);
  assert.equal(db.getRequest(item.id)?.delivery_status, 'failed');
  assert.match(db.getRequest(item.id)?.delivery_error ?? '', /TVDB/);
});

test('upstream failure is safe to display and retry reuses an existing item without a duplicate POST', async () => {
  const item = add(105); let phase = 'failure'; let posts = 0;
  global.fetch = async (url, init) => {
    const path = String(url);
    if (phase === 'failure') return json({ secret: 'do-not-expose-api-key' }, 401);
    if (path.includes('movie?')) return json([{ tmdbId: 105, id: 815, monitored: false }]);
    if (init?.method === 'PUT') {
      assert.equal(JSON.parse(String(init.body)).monitored, true); return json({ id: 815 });
    }
    if (path.endsWith('/command')) { assert.equal(JSON.parse(String(init?.body)).name, 'MoviesSearch'); return json({ id: 1 }); }
    if (init?.method === 'POST') posts++;
    throw new Error('Unexpected request');
  };
  const failure = await approve(item);
  assert.equal(failure.status, 502);
  assert.doesNotMatch(JSON.stringify(await failure.json()), /do-not-expose-api-key/);
  phase = 'retry';
  assert.equal((await approve(item)).status, 200);
  assert.equal(posts, 0);
});

test('concurrent approvals claim a persisted lease; active requests cannot be deleted', async () => {
  const item = add(106);
  assert.equal(db.claimDelivery(item.id), true);
  assert.equal(db.claimDelivery(item.id), false);
  assert.equal(db.deleteRequest(item.id), false);
  assert.equal((await approve(item)).status, 409);
  db.failDelivery(item.id, 'Test failure');
  assert.equal(db.claimDelivery(item.id), true);
  db.failDelivery(item.id, 'Test finished');
});

test('missing integration configuration cannot be reported as approved', async () => {
  const item = add(107); delete process.env.RADARR_API_KEY;
  assert.equal((await approve(item)).status, 502);
  assert.equal(db.getRequest(item.id)?.delivery_status, 'failed');
  assert.match(db.getRequest(item.id)?.delivery_error ?? '', /RADARR_API_KEY/);
});

test('already-available approval returns library status and never sends to Radarr', async () => {
  jellyfin(); arr(); const item = add(108);
  global.fetch = async (url) => {
    assert.ok(String(url).includes('/Items?'));
    return json({ Items: [{ Type: 'Movie', ProviderIds: { Tmdb: '108' } }], TotalRecordCount: 1 });
  };
  const response = await approve(item);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).request.available_in_jellyfin, true);
  assert.equal(db.getRequest(item.id)?.delivery_status, 'pending');
});

test('an approval waits when the configured Jellyfin library cannot be checked', async () => {
  jellyfin(); const item = add(109);
  global.fetch = async (url) => { assert.ok(String(url).includes('/Items?')); throw new Error('Offline'); };
  assert.equal((await approve(item)).status, 503);
  assert.equal(db.getRequest(item.id)?.delivery_status, 'pending');
});

test('a failed or timed-out create is reconciled before retrying, without a duplicate add', async () => {
  noJellyfin(); arr(); const item = add(110); let added = false; let adds = 0;
  global.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('movie?')) return json(added ? [{ tmdbId: 110, id: 888 }] : []);
    if (path.includes('/lookup?')) return json([{ tmdbId: 110 }]);
    if (path.endsWith('/command')) return json({ id: 1 });
    if (init?.method === 'POST') { adds++; added = true; return json({ error: 'Timed out after adding' }, 504); }
    throw new Error('Unexpected request');
  };
  assert.equal((await approve(item)).status, 200);
  assert.equal(db.getRequest(item.id)?.external_id, 888);
  assert.equal(adds, 1);
});
