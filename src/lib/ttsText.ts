/**
 * Prepare script lines for Microsoft Edge SSML / TTS.
 * Subtitles keep the original text; only the spoken payload should use this.
 */

/** Escape characters that break SSML XML injection */
export function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normalize text so Edge TTS is less likely to stall or misread:
 * - collapse whitespace
 * - strip western thousands separators in numbers (6,806 → 6806)
 * - ensure terminal punctuation so prosody finishes the last syllables
 *   (e.g. avoid cutting「降臨了」between 降 and 臨)
 */
export function prepareTtsText(raw: string): string {
  let text = String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!text) return text;

  // 6,806 / 12,000 → digits without commas (TTS often pauses or glitches on them)
  text = text.replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '');

  // Without a terminal mark Edge often trails off or clips the final syllable.
  const hasTerminal = /[。！？!?…\.]$/.test(text);
  if (!hasTerminal) {
    text = `${text}。`;
  }

  return escapeSsml(text);
}
