export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { getLipsyncAvailability } from '@/lib/lipsync';

/** GET /api/lipsync — whether lipsync is configured on the server */
export async function GET() {
  const avail = getLipsyncAvailability();
  return NextResponse.json({
    available: avail.available,
    provider: avail.provider,
    model: avail.model,
    reason: avail.reason ?? null,
  });
}
