/**
 * Fix WebM Duration metadata written by MediaRecorder (often missing / 0).
 *
 * Important: fix-webm-duration.js attaches to `window.ysFixWebmDuration`.
 * Next.js client components are ES modules, so bare `ysFixWebmDuration`
 * is NOT in scope even when the global exists — always use window.
 */

declare global {
  interface Window {
    ysFixWebmDuration?: (
      blob: Blob,
      durationMs: number,
      callback: (fixed: Blob) => void,
    ) => void;
  }
}

export async function fixWebmDuration(blob: Blob, durationSec: number): Promise<Blob> {
  if (!blob.type.includes('webm') && !blob.type.includes('matroska')) {
    return blob;
  }

  const durationMs = Math.max(1, Math.round(durationSec * 1000));
  const fix = typeof window !== 'undefined' ? window.ysFixWebmDuration : undefined;

  if (typeof fix !== 'function') {
    console.warn('[webm] ysFixWebmDuration not loaded — duration metadata may show as 0');
    return blob;
  }

  try {
    return await new Promise<Blob>((resolve, reject) => {
      try {
        fix(blob, durationMs, fixed => {
          if (fixed && fixed.size > 0) resolve(fixed);
          else resolve(blob);
        });
      } catch (e) {
        reject(e);
      }
    });
  } catch (e) {
    console.warn('[webm] duration fix failed:', e);
    return blob;
  }
}
