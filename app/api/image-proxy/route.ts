import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path');
  if (!path || !path.startsWith('/')) {
    return new NextResponse('Invalid path', { status: 400 });
  }

  const url = `https://image.tmdb.org/t/p/w500${path}`;
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return new NextResponse('Image not found', { status: 404 });
    }
    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new NextResponse('Failed to fetch image', { status: 502 });
  }
}
