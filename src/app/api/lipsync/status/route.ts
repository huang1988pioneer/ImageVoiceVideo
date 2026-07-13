export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createLipsyncProvider, getLipsyncAvailability } from '@/lib/lipsync';

/** GET /api/lipsync/status?jobId=... */
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
    return NextResponse.json({
      jobId,
      status: result.status,
      videoUrl: result.videoUrl ?? null,
      error: result.error ?? null,
      progress: result.progress ?? null,
      /** Proxy path avoids browser CORS when downloading the result */
      resultProxy:
        result.status === 'succeeded'
          ? `/api/lipsync/result?jobId=${encodeURIComponent(jobId)}`
          : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[lipsync] status error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
