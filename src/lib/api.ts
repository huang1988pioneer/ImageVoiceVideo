// ─── API helpers (all routes are /api/*) ─────────────────────────────────────

export async function fetchTTS(
  text: string,
  language: string,
  gender: 'female' | 'male',
  rate: number,
  volume: number,
): Promise<ArrayBuffer> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language, gender, rate, volume }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.arrayBuffer();
}

export async function fetchTranslate(
  lines: string[],
  language: string,
  sourceLanguage = 'auto',
): Promise<string[]> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines, language, source_language: sourceLanguage }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  const data = await res.json();
  return data.lines as string[];
}

// Cache FFmpeg availability to avoid repeated probes per session
let ffmpegAvailable: boolean | null = null;

async function checkFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    const res = await fetch('/api/convert', { method: 'GET' });
    if (!res.ok) { ffmpegAvailable = false; return false; }
    const data = await res.json();
    ffmpegAvailable = !!data.available;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

// Vercel serverless body limit ≈ 4.5 MB. Skip upload if blob is larger.
const VERCEL_BODY_LIMIT = 4 * 1024 * 1024; // 4 MB

export async function fetchConvert(webmBlob: Blob): Promise<Blob | null> {
  // 1. Pre-check: is FFmpeg available on the server? (fast, no body)
  const hasFfmpeg = await checkFfmpegAvailable();
  if (!hasFfmpeg) return null;

  // 2. Size guard: don't upload blobs larger than Vercel's body limit
  if (webmBlob.size > VERCEL_BODY_LIMIT) {
    console.warn(`[convert] Blob too large (${(webmBlob.size / 1024 / 1024).toFixed(1)} MB), skipping server conversion`);
    return null;
  }

  // 3. Upload with a 30-second abort timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'video/webm' },
      body: webmBlob,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 501) return null; // FFmpeg not installed
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? res.statusText);
    }
    return res.blob();
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === 'AbortError') {
      console.warn('[convert] Request timed out after 30s, skipping conversion');
      return null;
    }
    throw e;
  }
}
