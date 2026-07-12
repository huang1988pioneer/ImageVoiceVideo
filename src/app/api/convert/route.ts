export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveFfmpeg } from './which';

const execFileAsync = promisify(execFile);

/** GET /api/convert – probe whether FFmpeg is available */
export async function GET() {
  const ffmpegPath = await resolveFfmpeg();
  return NextResponse.json({ available: !!ffmpegPath, path: ffmpegPath ?? null });
}

export async function POST(req: NextRequest) {
  const ffmpegPath = await resolveFfmpeg();
  if (!ffmpegPath) {
    return NextResponse.json(
      { error: 'FFmpeg not found. Install FFmpeg or place it at .vendor/ffmpeg/' },
      { status: 501 },
    );
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: 'No data received' }, { status: 400 });
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'ivv-'));
  const inPath = join(tempDir, 'input.webm');
  const outPath = join(tempDir, 'output.mp4');

  try {
    await writeFile(inPath, buf);
    console.log(`[Convert] WebM ${buf.length.toLocaleString()} bytes → MP4 via ${ffmpegPath}`);

    await execFileAsync(
      ffmpegPath,
      [
        '-y',
        '-i', inPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-movflags', '+faststart',
        outPath,
      ],
      { timeout: 300_000 },
    );

    const mp4 = await readFile(outPath);
    console.log(`[Convert] OK ${mp4.length.toLocaleString()} bytes`);
    const body = new Uint8Array(mp4);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(body.byteLength),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Convert] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
