'use client';
import { useCallback } from 'react';

export interface SubtitleLine {
  text: string;
  startAt: number; // seconds
  endAt: number; // seconds
  language: string;
}

const FONT_FAMILY = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
/** Base design size (shortest side of portrait 1080×1920) */
const BASE_SHORT = 1080;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

export function useCanvasRenderer() {
  const drawFrame = useCallback((
    canvas: HTMLCanvasElement,
    image: HTMLImageElement | null,
    subtitleLines: SubtitleLine[],
    elapsed: number,
    showAll = false,
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    if (W <= 0 || H <= 0) return;

    // Scale UI elements so subtitles look right on both 16:9 and 9:16
    const shortSide = Math.min(W, H);
    const scale = shortSide / BASE_SHORT;
    const fontSize = Math.round(38 * scale);
    const lineHeight = fontSize * 1.5;
    const padding = Math.round(24 * scale);
    const bottomMargin = Math.round((H > W ? 60 : 48) * scale);
    const radius = Math.round(12 * scale);

    // ── Background ───────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    if (image && image.naturalWidth > 0) {
      // Cover-fit — works for portrait, landscape, and square images
      const imgScale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
      const sw = image.naturalWidth * imgScale;
      const sh = image.naturalHeight * imgScale;
      ctx.drawImage(image, (W - sw) / 2, (H - sh) / 2, sw, sh);
    } else {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, W, H);
    }

    // ── Active subtitles ─────────────────────────────────────────
    const active = showAll
      ? subtitleLines
      : subtitleLines.filter(s => elapsed >= s.startAt && elapsed < s.endAt);

    if (active.length === 0) return;

    const groups = new Map<string, SubtitleLine[]>();
    for (const s of active) {
      if (!groups.has(s.language)) groups.set(s.language, []);
      groups.get(s.language)!.push(s);
    }

    let trackY = H - bottomMargin;

    for (const [, subs] of [...groups.entries()].reverse()) {
      const text = subs.map(s => s.text).join(' / ');
      ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
      const maxTextWidth = W - padding * 4;
      const lines = wrapText(ctx, text, Math.max(40, maxTextWidth));

      const boxH = lines.length * lineHeight + padding * 2;
      const boxY = trackY - boxH;

      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = '#000';
      roundRect(ctx, padding, boxY, W - padding * 2, boxH, radius);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = Math.round(6 * scale);
      lines.forEach((l, i) => {
        ctx.fillText(l, W / 2, boxY + padding + i * lineHeight);
      });
      ctx.shadowBlur = 0;

      trackY = boxY - Math.round(12 * scale);
    }
  }, []);

  return { drawFrame };
}
