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

export async function fetchConvert(webmBlob: Blob): Promise<Blob | null> {
  const res = await fetch('/api/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'video/webm' },
    body: webmBlob,
  });
  if (res.status === 501) return null; // FFmpeg not installed
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.blob();
}
