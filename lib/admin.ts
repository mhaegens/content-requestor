import { timingSafeEqual, createHash } from 'crypto';
import { NextResponse } from 'next/server';

export function requireAdmin(request: Request): NextResponse | null {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: 'Set ADMIN_API_KEY on the server to enable admin actions.' }, { status: 503 });
  }
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(expected), digest(supplied))) {
    return NextResponse.json({ error: 'Enter a valid admin key.' }, { status: 401 });
  }
  return null;
}
