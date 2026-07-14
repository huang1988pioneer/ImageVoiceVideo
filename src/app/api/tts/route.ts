export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { VOICE_MAP, isSupportedLanguage } from '@/lib/languages';
import { prepareTtsText } from '@/lib/ttsText';

/** Per-utterance hard limit so serverless never hangs until platform kill */
const SYNTH_TIMEOUT_MS = 18_000;
const CONNECT_TIMEOUT_MS = 12_000;
const MAX_BATCH = 40;
/** Brief gap between lines on a reused socket — reduces Edge mid-batch stalls */
const INTER_LINE_GAP_MS = 60;

function formatRate(rate: number): string {
  const pct = rate * 10;
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function formatVolume(volume: number): string {
  const offset = Math.max(-100, Math.min(50, volume - 100));
  return `${offset >= 0 ? '+' : ''}${offset}%`;
}

/** UI pitch -5…+5 → relative Hz for Edge SSML prosody */
function formatPitch(pitch: number): string {
  const hz = Math.round(Math.max(-5, Math.min(5, pitch)) * 5);
  return `${hz >= 0 ? '+' : ''}${hz}Hz`;
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}逾時（${Math.round(ms / 1000)} 秒），遠端語音服務可能被封鎖或忙碌`));
    }, ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function collectStream(
  tts: MsEdgeTTS,
  text: string,
  rateStr: string,
  volStr: string,
  pitchStr: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let audioStream: any = null;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        audioStream?.destroy?.();
      } catch {
        /* ignore */
      }
      fn();
    };

    try {
      const result = tts.toStream(text, {
        rate: rateStr,
        volume: volStr,
        pitch: pitchStr,
      });
      audioStream = result.audioStream;
      audioStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      audioStream.on('end', () => settle(() => resolve(Buffer.concat(chunks))));
      audioStream.on('error', (err: Error) => settle(() => reject(err)));
    } catch (e) {
      settle(() => reject(e));
    }
  });
}

function safeClose(tts: MsEdgeTTS | null) {
  if (!tts) return;
  try {
    tts.close();
  } catch {
    /* ignore */
  }
}

async function synthesizeOnce(
  text: string,
  voiceName: string,
  rateStr: string,
  volStr: string,
  pitchStr: string,
): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await withTimeout(
      tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3),
      CONNECT_TIMEOUT_MS,
      'Edge TTS 連線',
    );
    return await withTimeout(
      collectStream(tts, text, rateStr, volStr, pitchStr),
      SYNTH_TIMEOUT_MS,
      'Edge TTS 合成',
    );
  } finally {
    safeClose(tts);
  }
}

/**
 * One WebSocket for many lines with the same voice.
 * If a mid-batch line stalls, close the socket, retry that line alone, then
 * continue the rest on a fresh connection (avoids hanging the whole batch on
 * short phrases like「不要怕」).
 */
async function synthesizeBatchSameVoice(
  texts: string[],
  voiceName: string,
  rateStr: string,
  volStr: string,
  pitchStr: string,
): Promise<Buffer[]> {
  const out: Buffer[] = new Array(texts.length);
  let tts: MsEdgeTTS | null = null;

  const open = async () => {
    safeClose(tts);
    tts = new MsEdgeTTS();
    await withTimeout(
      tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3),
      CONNECT_TIMEOUT_MS,
      'Edge TTS 連線',
    );
    return tts;
  };

  try {
    await open();
    for (let i = 0; i < texts.length; i++) {
      const label = `Edge TTS 合成 #${i + 1}/${texts.length}`;
      try {
        if (i > 0) await sleep(INTER_LINE_GAP_MS);
        const buf = await withTimeout(
          collectStream(tts!, texts[i], rateStr, volStr, pitchStr),
          SYNTH_TIMEOUT_MS,
          label,
        );
        if (!buf || buf.length < 128) {
          throw new Error(`${label} empty audio`);
        }
        out[i] = buf;
      } catch (lineErr) {
        console.warn(`[TTS batch] ${label} failed, isolated retry:`, lineErr);
        // Drop broken socket; synthesize this line alone; reopen for remainder
        safeClose(tts);
        tts = null;
        out[i] = await synthesizeWithRetry(texts[i], voiceName, rateStr, volStr, pitchStr);
        if (i < texts.length - 1) {
          await open();
        }
      }
    }
    return out;
  } finally {
    safeClose(tts);
  }
}

async function synthesizeWithRetry(
  text: string,
  voiceName: string,
  rateStr: string,
  volStr: string,
  pitchStr: string,
): Promise<Buffer> {
  try {
    return await synthesizeOnce(text, voiceName, rateStr, volStr, pitchStr);
  } catch (first) {
    console.warn('[TTS] first attempt failed, retrying once:', first);
    await sleep(200);
    return await synthesizeOnce(text, voiceName, rateStr, volStr, pitchStr);
  }
}

type Gender = 'female' | 'male';

interface TtsItem {
  text: string;
  language: string;
  gender: Gender;
}

function parseItem(raw: unknown, fallbackLang: string, fallbackGender: Gender): TtsItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const text = String(o.text ?? '').trim();
  if (!text) return null;
  const language = String(o.language ?? fallbackLang);
  const gender: Gender = o.gender === 'male' ? 'male' : fallbackGender;
  return { text, language, gender };
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const rate = Math.max(-5, Math.min(5, Number(payload.rate ?? 0)));
    const volume = Math.max(0, Math.min(150, Number(payload.volume ?? 100)));
    const pitch = Math.max(-5, Math.min(5, Number(payload.pitch ?? 0)));
    const rateStr = formatRate(rate);
    const volStr = formatVolume(volume);
    const pitchStr = formatPitch(pitch);

    // ── Batch mode: { items: [{ text, language, gender }, ...] } ──
    if (Array.isArray(payload.items)) {
      if (payload.items.length === 0) {
        return NextResponse.json({ error: 'items required' }, { status: 400 });
      }
      if (payload.items.length > MAX_BATCH) {
        return NextResponse.json({ error: `too many items (max ${MAX_BATCH})` }, { status: 400 });
      }

      const items: TtsItem[] = [];
      for (const raw of payload.items) {
        const item = parseItem(raw, 'zh-TW', 'female');
        if (!item) {
          return NextResponse.json({ error: 'each item needs non-empty text' }, { status: 400 });
        }
        if (item.text.length > 5000) {
          return NextResponse.json({ error: 'text too long' }, { status: 400 });
        }
        if (!isSupportedLanguage(item.language)) {
          return NextResponse.json(
            { error: `unsupported language: ${item.language}` },
            { status: 400 },
          );
        }
        const spoken = prepareTtsText(item.text);
        if (!spoken) {
          return NextResponse.json({ error: 'each item needs non-empty text' }, { status: 400 });
        }
        items.push({ ...item, text: spoken });
      }

      // Group by voice so we open one WS per voice, not per line
      const groupKey = (it: TtsItem) => {
        const voices = VOICE_MAP[it.language];
        const voiceName = voices[it.gender] ?? voices.female;
        return voiceName;
      };

      const groups = new Map<string, { indices: number[]; texts: string[] }>();
      items.forEach((it, idx) => {
        const key = groupKey(it);
        let g = groups.get(key);
        if (!g) {
          g = { indices: [], texts: [] };
          groups.set(key, g);
        }
        g.indices.push(idx);
        g.texts.push(it.text);
      });

      const results: Buffer[] = new Array(items.length);
      for (const [voiceName, g] of groups) {
        console.log(`[TTS batch] voice=${voiceName} count=${g.texts.length}`);
        let buffers: Buffer[];
        try {
          buffers = await synthesizeBatchSameVoice(g.texts, voiceName, rateStr, volStr, pitchStr);
        } catch (first) {
          console.warn('[TTS batch] group failed, retry once:', first);
          buffers = await synthesizeBatchSameVoice(g.texts, voiceName, rateStr, volStr, pitchStr);
        }
        for (let i = 0; i < g.indices.length; i++) {
          const buf = buffers[i];
          if (!buf || buf.length < 128) {
            return NextResponse.json(
              {
                error:
                  'TTS produced empty audio (try translating text to the target language first)',
              },
              { status: 500 },
            );
          }
          results[g.indices[i]] = buf;
        }
      }

      const audios = results.map(b => b.toString('base64'));
      console.log(`[TTS batch] OK ${audios.length} clips`);
      return NextResponse.json({ audios });
    }

    // ── Single mode (backward compatible): raw audio/mpeg ──
    const rawText = String(payload.text ?? '').trim();
    const text = prepareTtsText(rawText);
    const language = String(payload.language ?? 'zh-TW');
    const gender: Gender = payload.gender === 'male' ? 'male' : 'female';

    if (!text) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    if (rawText.length > 5000) {
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

    console.log(
      `[TTS] ${language} ${gender} ${voiceName} rate=${rateStr} vol=${volStr} pitch=${pitchStr} text=${text.slice(0, 40)}`,
    );

    const audioBuffer = await synthesizeWithRetry(text, voiceName, rateStr, volStr, pitchStr);

    if (audioBuffer.length < 128) {
      return NextResponse.json(
        { error: 'TTS produced empty audio (try translating text to the target language first)' },
        { status: 500 },
      );
    }

    console.log(`[TTS] OK ${audioBuffer.length} bytes`);
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
