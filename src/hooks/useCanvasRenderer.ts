'use client';
import { useCallback } from 'react';

export interface SubtitleLine {
  text: string;
  startAt: number;   // seconds
  endAt: number;     // seconds
  language: string;
}

const FONT_SIZE   = 38;
const LINE_HEIGHT = FONT_SIZE * 1.5;
const MAX_CHARS   = 22;                // chars per wrapped line
const FONT_FAMILY = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';

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

export function useCanvasRenderer() {
  const drawFrame = useCallback((
    canvas: HTMLCanvasElement,
    image: HTMLImageElement | null,
    subtitleLines: SubtitleLine[],
    elapsed: number,   // seconds since recording started
    showAll = false,   // for preview: show all subtitles stacked
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    // ── Background ───────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    if (image) {
      // Cover-fit image
      const scale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
      const sw    = image.naturalWidth  * scale;
      const sh    = image.naturalHeight * scale;
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

    // Group by language (each language on own track)
    const groups = new Map<string, SubtitleLine[]>();
    for (const s of active) {
      if (!groups.has(s.language)) groups.set(s.language, []);
      groups.get(s.language)!.push(s);
    }

    const padding      = 24;
    const bottomMargin = 60;
    const trackHeight  = LINE_HEIGHT * 3 + padding * 2;
    let trackY         = H - bottomMargin;

    for (const [, subs] of [...groups.entries()].reverse()) {
      const text  = subs.map(s => s.text).join(' / ');
      ctx.font    = `bold ${FONT_SIZE}px ${FONT_FAMILY}`;
      const lines = wrapText(ctx, text, W - padding * 4);

      const boxH  = lines.length * LINE_HEIGHT + padding * 2;
      const boxY  = trackY - boxH;

      // Semi-transparent backdrop
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle   = '#000';
      roundRect(ctx, padding, boxY, W - padding * 2, boxH, 12);
      ctx.fill();
      ctx.restore();

      // Text
      ctx.fillStyle    = '#fff';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor  = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur   = 6;
      lines.forEach((l, i) => {
        ctx.fillText(l, W / 2, boxY + padding + i * LINE_HEIGHT);
      });
      ctx.shadowBlur = 0;

      trackY = boxY - 12;
    }
  }, []);

  return { drawFrame };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}
