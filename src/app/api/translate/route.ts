export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body    = await req.json();
    const lines   = body.lines as string[];
    const target  = String(body.language ?? 'en-US');
    const source  = String(body.source_language ?? 'auto');

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'lines required' }, { status: 400 });
    }

    const translated: string[] = [];
    for (const line of lines) {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(line)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`Google Translate returned ${res.status}`);
      const data = await res.json();
      const text = (data[0] as [string, unknown][]).map(seg => seg[0]).join('');
      translated.push(text);
    }

    return NextResponse.json({ lines: translated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Translate] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
