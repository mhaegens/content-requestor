/**
 * GET /api/homepage
 *
 * Returns aggregated request stats for use with the gethomepage `customapi` widget.
 * https://gethomepage.dev/widgets/services/customapi/
 *
 * Example response:
 * {
 *   "total":       15,
 *   "pending":     12,
 *   "movies":       8,
 *   "tv":           7,
 *   "in_jellyfin":  3,
 *   "new_count":    2,
 *   "has_new":   true
 * }
 *
 * `has_new` is true when at least one request was submitted in the last 8 hours.
 *
 * ── gethomepage services.yaml snippet ────────────────────────────────────────
 *
 * - Requestr:
 *     href: http://requestr:3000
 *     widget:
 *       type: customapi
 *       url: http://requestr:3000/api/homepage
 *       refreshInterval: 300000   # 5 minutes
 *       mappings:
 *         - field: pending
 *           label: Pending
 *           format: number
 *         - field: movies
 *           label: Movies
 *           format: number
 *         - field: tv
 *           label: TV Shows
 *           format: number
 *         - field: has_new
 *           label: "New (8h)"
 *           remap:
 *             "true": "Yes"
 *             "false": "No"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import { getRequestStats } from '@/lib/db';

export const runtime = 'nodejs';

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export async function GET() {
  try {
    const since = new Date(Date.now() - EIGHT_HOURS_MS).toISOString();
    const stats = getRequestStats(since);

    return NextResponse.json({
      total:       stats.total,
      pending:     stats.pending,
      movies:      stats.movies,
      tv:          stats.tv,
      in_jellyfin: stats.in_jellyfin,
      new_count:   stats.new_count,
      has_new:     stats.new_count > 0,
    });
  } catch (err) {
    console.error('[GET /api/homepage]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
