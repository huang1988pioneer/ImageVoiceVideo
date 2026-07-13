// ─── API helpers (all routes are /api/*) ─────────────────────────────────────

function abortableTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

async function readError(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({ error: res.statusText }));
  return (err as { error?: string }).error ?? res.statusText;
}

export async function fetchTTS(
  text: string,
  language: string,
  gender: 'female' | 'male',
  rate: number,
  volume: number,
  pitch = 0,
): Promise<ArrayBuffer> {
  const { signal, clear } = abortableTimeout(35_000);
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language, gender, rate, volume, pitch }),
      signal,
    });
    if (!res.ok) {
      throw new Error(await readError(res));
    }
    return res.arrayBuffer();
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('語音生成逾時（遠端 Edge TTS 可能無法連線），請稍後再試');
    }
    throw e;
  } finally {
    clear();
  }
}

export interface TtsBatchItem {
  text: string;
  language: string;
  gender: 'female' | 'male';
}

/** Batch TTS: one server request, one WS per voice — much more reliable on Vercel */
export async function fetchTTSBatch(
  items: TtsBatchItem[],
  rate: number,
  volume: number,
  onProgress?: (done: number, total: number) => void,
  pitch = 0,
): Promise<ArrayBuffer[]> {
  if (items.length === 0) return [];

  // Chunk to stay under serverless time budget (each chunk reuses WS per voice)
  const CHUNK = 12;
  const all: ArrayBuffer[] = [];

  for (let offset = 0; offset < items.length; offset += CHUNK) {
    const slice = items.slice(offset, offset + CHUNK);
    // Allow ~22s per line + connect overhead, capped
    const timeoutMs = Math.min(55_000, 15_000 + slice.length * 8_000);
    const { signal, clear } = abortableTimeout(timeoutMs);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: slice, rate, volume, pitch }),
        signal,
      });
      if (!res.ok) {
        throw new Error(await readError(res));
      }
      const data = (await res.json()) as { audios?: string[] };
      if (!Array.isArray(data.audios) || data.audios.length !== slice.length) {
        throw new Error('語音批次回應格式錯誤');
      }
      for (const b64 of data.audios) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        all.push(bytes.buffer);
      }
      onProgress?.(all.length, items.length);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        throw new Error('語音生成逾時（遠端 Edge TTS 可能無法連線），請稍後再試或減少句數');
      }
      throw e;
    } finally {
      clear();
    }
  }

  return all;
}

export async function fetchTranslate(
  lines: string[],
  language: string,
  sourceLanguage = 'auto',
): Promise<string[]> {
  const { signal, clear } = abortableTimeout(45_000);
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, language, source_language: sourceLanguage }),
      signal,
    });
    if (!res.ok) {
      throw new Error(await readError(res));
    }
    const data = await res.json();
    return data.lines as string[];
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('翻譯逾時，請稍後再試');
    }
    throw e;
  } finally {
    clear();
  }
}

// ─── Lipsync (talking head) ──────────────────────────────────────────────────

export interface LipsyncAvailability {
  available: boolean;
  provider: string | null;
  model: string | null;
  reason: string | null;
}

export async function fetchLipsyncAvailable(): Promise<LipsyncAvailability> {
  const { signal, clear } = abortableTimeout(8_000);
  try {
    const res = await fetch('/api/lipsync', { method: 'GET', signal });
    if (!res.ok) {
      return {
        available: false,
        provider: null,
        model: null,
        reason: await readError(res),
      };
    }
    const data = (await res.json()) as LipsyncAvailability;
    return {
      available: !!data.available,
      provider: data.provider ?? null,
      model: data.model ?? null,
      reason: data.reason ?? null,
    };
  } catch {
    return {
      available: false,
      provider: null,
      model: null,
      reason: '無法連線對口服務',
    };
  } finally {
    clear();
  }
}

export async function startLipsyncJob(
  imageBlob: Blob,
  audioBlob: Blob,
): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append('image', imageBlob, 'face.png');
  form.append('audio', audioBlob, 'speech.wav');

  // Upload can be large; allow up to 90s for start
  const { signal, clear } = abortableTimeout(90_000);
  try {
    const res = await fetch('/api/lipsync/start', {
      method: 'POST',
      body: form,
      signal,
    });
    if (!res.ok) {
      throw new Error(await readError(res));
    }
    const data = (await res.json()) as { jobId?: string };
    if (!data.jobId) {
      throw new Error('對口任務未回傳 jobId');
    }
    return { jobId: data.jobId };
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('上傳對口素材逾時，請縮短語音或壓縮圖片後再試');
    }
    throw e;
  } finally {
    clear();
  }
}

export interface LipsyncPollResult {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  videoUrl: string | null;
  resultProxy: string | null;
  error: string | null;
}

export async function fetchLipsyncStatus(jobId: string): Promise<LipsyncPollResult> {
  const { signal, clear } = abortableTimeout(20_000);
  try {
    const res = await fetch(
      `/api/lipsync/status?jobId=${encodeURIComponent(jobId)}`,
      { method: 'GET', signal },
    );
    if (!res.ok) {
      throw new Error(await readError(res));
    }
    const data = (await res.json()) as {
      status?: LipsyncPollResult['status'];
      videoUrl?: string | null;
      resultProxy?: string | null;
      error?: string | null;
    };
    return {
      status: data.status ?? 'processing',
      videoUrl: data.videoUrl ?? null,
      resultProxy: data.resultProxy ?? null,
      error: data.error ?? null,
    };
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error('查詢對口狀態逾時');
    }
    throw e;
  } finally {
    clear();
  }
}

/**
 * Poll until lipsync finishes. Returns a blob URL for the talking-head video.
 * Caller must revoke the object URL when done.
 */
export async function pollLipsyncUntilDone(
  jobId: string,
  onStatus?: (msg: string) => void,
  options?: { intervalMs?: number; maxWaitMs?: number },
): Promise<{ blob: Blob; objectUrl: string }> {
  const intervalMs = options?.intervalMs ?? 2_500;
  const maxWaitMs = options?.maxWaitMs ?? 8 * 60_000;
  const started = Date.now();
  let ticks = 0;

  while (Date.now() - started < maxWaitMs) {
    ticks += 1;
    const elapsedSec = Math.round((Date.now() - started) / 1000);
    onStatus?.(`正在生成對口動畫… ${elapsedSec}s（第 ${ticks} 次查詢）`);

    const result = await fetchLipsyncStatus(jobId);

    if (result.status === 'succeeded') {
      onStatus?.('正在下載對口影片…');
      // Prefer same-origin proxy to avoid CORS
      const fetchUrl =
        result.resultProxy ||
        `/api/lipsync/result?jobId=${encodeURIComponent(jobId)}`;
      const { signal, clear } = abortableTimeout(120_000);
      try {
        const res = await fetch(fetchUrl, { signal });
        if (!res.ok) {
          // Fallback to direct URL if proxy fails and we have videoUrl
          if (result.videoUrl) {
            const direct = await fetch(result.videoUrl, { signal });
            if (!direct.ok) {
              throw new Error(await readError(res));
            }
            const blob = await direct.blob();
            const objectUrl = URL.createObjectURL(blob);
            return { blob, objectUrl };
          }
          throw new Error(await readError(res));
        }
        const blob = await res.blob();
        if (blob.size < 1024) {
          throw new Error('對口影片檔案過小，請再試一次');
        }
        const objectUrl = URL.createObjectURL(blob);
        return { blob, objectUrl };
      } finally {
        clear();
      }
    }

    if (result.status === 'failed' || result.status === 'canceled') {
      throw new Error(result.error || '對口生成失敗');
    }

    await new Promise<void>(r => setTimeout(r, intervalMs));
  }

  throw new Error('對口生成逾時（超過 8 分鐘），請縮短語音稿後再試');
}

// Cache FFmpeg availability to avoid repeated probes per session
let ffmpegAvailable: boolean | null = null;

async function checkFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  const { signal, clear } = abortableTimeout(8_000);
  try {
    const res = await fetch('/api/convert', { method: 'GET', signal });
    if (!res.ok) {
      ffmpegAvailable = false;
      return false;
    }
    const data = await res.json();
    ffmpegAvailable = !!data.available;
  } catch {
    ffmpegAvailable = false;
  } finally {
    clear();
  }
  return ffmpegAvailable;
}

// Vercel serverless body limit ≈ 4.5 MB. Skip upload if blob is larger.
const VERCEL_BODY_LIMIT = 4 * 1024 * 1024; // 4 MB

export async function fetchConvert(webmBlob: Blob): Promise<Blob | null> {
  // 1. Pre-check: is FFmpeg available on the server? (fast, no body)
  const hasFfmpeg = await checkFfmpegAvailable();
  if (!hasFfmpeg) {
    console.warn('[convert] FFmpeg not available on server — keeping WebM');
    return null;
  }

  // 2. Size guard: don't upload blobs larger than Vercel's body limit
  if (webmBlob.size > VERCEL_BODY_LIMIT) {
    console.warn(
      `[convert] Blob too large (${(webmBlob.size / 1024 / 1024).toFixed(1)} MB), skipping server conversion`,
    );
    return null;
  }

  // 3. Upload — remote convert can take longer than local; allow up to 90s
  const { signal, clear } = abortableTimeout(90_000);

  try {
    const res = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'video/webm' },
      body: webmBlob,
      signal,
    });
    if (res.status === 501) return null; // FFmpeg not installed
    if (!res.ok) {
      throw new Error(await readError(res));
    }
    return res.blob();
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      console.warn('[convert] Request timed out after 90s, skipping conversion');
      return null;
    }
    // Conversion is optional — never fail the whole video pipeline
    console.warn('[convert] failed, keeping WebM:', e);
    return null;
  } finally {
    clear();
  }
}
