export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel: allow up to 60s for TTS generation

import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const VOICE_MAP: Record<string, { female: string; male: string }> = {
  'zh-TW': { female: 'zh-TW-HsiaoChenNeural', male: 'zh-TW-YunJheNeural' },
  'en-US': { female: 'en-US-JennyNeural',      male: 'en-US-GuyNeural' },
  'ja-JP': { female: 'ja-JP-NanamiNeural',      male: 'ja-JP-KeitaNeural' },
  'yue-HK':{ female: 'zh-HK-HiuMaanNeural',    male: 'zh-HK-WanLungNeural' },
  'ko-KR': { female: 'ko-KR-SunHiNeural',       male: 'ko-KR-InJoonNeural' },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text     = String(body.text ?? '').trim();
    const language = String(body.language ?? 'zh-TW');
    const gender   = String(body.gender   ?? 'female') as 'female' | 'male';
    const rate     = Math.max(-5, Math.min(5, Number(body.rate ?? 0)));
    const volume   = Math.max(0, Math.min(100, Number(body.volume ?? 100)));

    if (!text)                          return NextResponse.json({ error: 'text required' }, { status: 400 });
    if (text.length > 5000)             return NextResponse.json({ error: 'text too long'  }, { status: 400 });
    if (!VOICE_MAP[language])           return NextResponse.json({ error: 'unsupported language' }, { status: 400 });

    const voiceName = VOICE_MAP[language][gender] ?? VOICE_MAP[language].female;
    const rateStr   = `${rate * 10 >= 0 ? '+' : ''}${rate * 10}%`;
    const volStr    = `${(volume - 100) >= 0 ? '+' : ''}${volume - 100}%`;

    console.log(`[TTS] ${language} ${gender} ${voiceName} rate=${rateStr}`);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, undefined);

    // Collect audio stream into buffer
    // msedge-tts toStream() returns { audioStream, metadataStream }
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const { audioStream } = tts.toStream(text, { rate: rateStr, volume: volStr });
      audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      audioStream.on('end', resolve);
      audioStream.on('error', reject);
    });

    const audioBuffer = Buffer.concat(chunks);
    if (audioBuffer.length < 128) {
      return NextResponse.json({ error: 'TTS produced empty audio' }, { status: 500 });
    }

    console.log(`[TTS] OK ${audioBuffer.length} bytes`);
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(audioBuffer.length) },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[TTS] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
