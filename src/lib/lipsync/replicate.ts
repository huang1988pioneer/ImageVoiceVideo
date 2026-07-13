import type {
  LipsyncProvider,
  LipsyncStartInput,
  LipsyncStartResult,
  LipsyncStatusResult,
  LipsyncJobStatus,
} from './types';

const REPLICATE_API = 'https://api.replicate.com/v1';

/** Default: image + audio talking-head (SadTalker) */
const DEFAULT_MODEL = 'cjwbw/sadtalker';

type ModelKind = 'sadtalker' | 'p-video-avatar' | 'generic';

function modelKind(model: string): ModelKind {
  const m = model.toLowerCase();
  if (m.includes('sadtalker')) return 'sadtalker';
  if (m.includes('p-video-avatar') || m.includes('video-avatar')) return 'p-video-avatar';
  return 'generic';
}

function authHeader(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'respond-async',
  };
}

function dataUri(mime: string, buf: Buffer): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** Prefer Files API for larger payloads; data URI for small clips. */
const DATA_URI_MAX = 3 * 1024 * 1024;

async function toReplicateUri(
  token: string,
  buf: Buffer,
  mime: string,
  filename: string,
): Promise<string> {
  if (buf.length <= DATA_URI_MAX) {
    return dataUri(mime, buf);
  }

  // Multipart file upload — returns a URL usable in prediction input
  const form = new FormData();
  const bytes = new Uint8Array(buf);
  form.append('content', new Blob([bytes], { type: mime }), filename);

  const res = await fetch(`${REPLICATE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!res.ok) {
    // Fallback to data URI if Files API unavailable
    console.warn('[lipsync] Replicate Files upload failed, falling back to data URI');
    return dataUri(mime, buf);
  }

  const data = (await res.json()) as {
    urls?: { get?: string };
    id?: string;
  };
  if (data.urls?.get) return data.urls.get;

  return dataUri(mime, buf);
}

function mapStatus(raw: string | undefined): LipsyncJobStatus {
  switch (raw) {
    case 'starting':
    case 'processing':
    case 'succeeded':
    case 'failed':
    case 'canceled':
      return raw;
    case 'cancelled':
      return 'canceled';
    default:
      return 'processing';
  }
}

function extractVideoUrl(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === 'string' && /^https?:\/\//i.test(output)) return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const u = extractVideoUrl(item);
      if (u) return u;
    }
  }
  if (typeof output === 'object' && output !== null) {
    const o = output as Record<string, unknown>;
    for (const key of ['video', 'output', 'url', 'mp4', 'result']) {
      const u = extractVideoUrl(o[key]);
      if (u) return u;
    }
  }
  return null;
}

function buildInput(
  model: string,
  imageUri: string,
  audioUri: string,
): Record<string, unknown> {
  const kind = modelKind(model);
  if (kind === 'sadtalker') {
    return {
      source_image: imageUri,
      driven_audio: audioUri,
      still_mode: true,
      use_enhancer: false,
      use_eyeblink: true,
      preprocess: 'full',
      size_of_image: 512,
      expression_scale: 1,
    };
  }
  if (kind === 'p-video-avatar') {
    return {
      image: imageUri,
      audio: audioUri,
      resolution: '720p',
      video_prompt: 'The person is talking naturally with clear lip sync.',
      disable_safety_filter: true,
    };
  }
  // Generic guess for image+audio models
  return {
    source_image: imageUri,
    driven_audio: audioUri,
    image: imageUri,
    audio: audioUri,
  };
}

export function createReplicateProvider(token: string, model?: string): LipsyncProvider {
  const modelSlug = (model || process.env.LIPSYNC_MODEL || DEFAULT_MODEL).trim();

  return {
    id: `replicate:${modelSlug}`,

    async start(input: LipsyncStartInput): Promise<LipsyncStartResult> {
      const mimeImage = input.mimeImage || 'image/png';
      const mimeAudio = input.mimeAudio || 'audio/wav';
      const imageUri = await toReplicateUri(token, input.image, mimeImage, 'face.png');
      const audioUri = await toReplicateUri(token, input.audio, mimeAudio, 'speech.wav');
      const body = {
        input: buildInput(modelSlug, imageUri, audioUri),
      };

      // Prefer model-scoped endpoint (no version pin)
      const url = `${REPLICATE_API}/models/${modelSlug}/predictions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        let msg = errText;
        try {
          const j = JSON.parse(errText) as { detail?: string; title?: string; error?: string };
          msg = j.detail || j.error || j.title || errText;
        } catch {
          /* keep raw */
        }
        throw new Error(`Replicate 建立對口任務失敗：${msg}`);
      }

      const data = (await res.json()) as { id?: string };
      if (!data.id) {
        throw new Error('Replicate 未回傳 job id');
      }
      return { jobId: data.id };
    },

    async status(jobId: string): Promise<LipsyncStatusResult> {
      const res = await fetch(`${REPLICATE_API}/predictions/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`查詢對口狀態失敗：${errText}`);
      }

      const data = (await res.json()) as {
        status?: string;
        output?: unknown;
        error?: string | null;
        logs?: string | null;
      };

      const status = mapStatus(data.status);
      if (status === 'succeeded') {
        const videoUrl = extractVideoUrl(data.output);
        if (!videoUrl) {
          return {
            status: 'failed',
            error: '對口完成但未取得影片網址',
          };
        }
        return { status: 'succeeded', videoUrl, error: null };
      }

      if (status === 'failed' || status === 'canceled') {
        return {
          status,
          error: data.error || data.logs || '對口生成失敗',
        };
      }

      return { status, videoUrl: null, error: null };
    },
  };
}

export { DEFAULT_MODEL as REPLICATE_DEFAULT_MODEL };
