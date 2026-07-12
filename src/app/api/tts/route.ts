export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { VOICE_MAP, isSupportedLanguage } from '@/lib/languages';

function formatRate(rate: number): string {
  const pct = rate * 10;
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function formatVolume(volume: number): string {
  // UI allows 0–150; SSML relative volume is offset from 100
  const offset = Math.max(-100, Math.min(50, volume - 100));
  return `${offset >= 0 ? '+' : ''}${offset}%`;
}

async function synthesize(
  text: string,
  voiceName: string,
  rateStr: string,
  volStr: string,
): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const { audioStream } = tts.toStream(text, { rate: rateStr, volume: volStr });
      audioStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      audioStream.on('end', resolve);
      audioStream.on('error', reject);
    });

    return Buffer.concat(chunks);
  } finally {
    try {
      tts.close();
    } catch {
      /* ignore close errors */
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const text = String(payload.text ?? '').trim();
    const language = String(payload.language ?? 'zh-TW');
    const gender = (payload.gender === 'male' ? 'male' : 'female') as 'female' | 'male';
    const rate = Math.max(-5, Math.min(5, Number(payload.rate ?? 0)));
    const volume = Math.max(0, Math.min(150, Number(payload.volume ?? 100)));

    if (!text) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    if (text.length > 5000) {
      return NextResponse.json({ error: 'text too long' }, { status: 400 });
    }
    if (!isSupportedLanguage(language)) {
      return NextResponse.json(
        { error: `unsupported language: ${language}` },
        { status: 400 },
      );
    }

    const voices = VOICE_MAP[language];
    const voiceName = voices[gender] ?? voices.female;
    const rateStr = formatRate(rate);
    const volStr = formatVolume(volume);

    console.log(`[TTS] ${language} ${gender} ${voiceName} rate=${rateStr} vol=${volStr}`);

    const audioBuffer = await synthesize(text, voiceName, rateStr, volStr);

    if (audioBuffer.length < 128) {
      return NextResponse.json(
        { error: 'TTS produced empty audio (try translating text to the target language first)' },
        { status: 500 },
      );
    }

    console.log(`[TTS] OK ${audioBuffer.length} bytes`);
    // Copy into a plain Uint8Array so NextResponse accepts it as BodyInit
    const audioBytes = new Uint8Array(audioBuffer);
    return new NextResponse(audioBytes, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBytes.byteLength),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[TTS] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
