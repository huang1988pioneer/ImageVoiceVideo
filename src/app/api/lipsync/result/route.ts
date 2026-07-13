export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createLipsyncProvider, getLipsyncAvailability } from '@/lib/lipsync';

/**
 * GET /api/lipsync/result?jobId=...
 * Proxy the finished talking-head video so the browser avoids CORS.
 */
export async function GET(req: NextRequest) {
  const avail = getLipsyncAvailability();
  if (!avail.available) {
    return NextResponse.json(
      { error: avail.reason || '對口型服務未設定' },
      { status: 501 },
    );
  }

  const jobId = req.nextUrl.searchParams.get('jobId')?.trim();
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }

  const provider = createLipsyncProvider();
  if (!provider) {
    return NextResponse.json({ error: '無法建立對口服務' }, { status: 501 });
  }

  try {
    const result = await provider.status(jobId);
    if (result.status !== 'succeeded' || !result.videoUrl) {
      return NextResponse.json(
        { error: result.error || `任務尚未完成（${result.status}）` },
        { status: 409 },
      );
    }

    const upstream = await fetch(result.videoUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `下載對口影片失敗（HTTP ${upstream.status}）` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get('content-type') || 'video/mp4';
    const buf = Buffer.from(await upstream.arrayBuffer());
    const body = new Uint8Array(buf);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[lipsync] result error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
