// ─── Types ────────────────────────────────────────────────────────────────────

export type Gender = 'female' | 'male';

export interface ScriptLine {
  text: string;
  /** null = no 男/女 prefix; use track gender */
  gender: Gender | null;
}

export interface Track {
  language: string;
  label: string;
  gender: Gender;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse script text into lines.
 * Lines prefixed with "男：" → male; "女：" → female; otherwise gender is null
 * (caller should fall back to track gender). Blank lines are skipped.
 */
export function parseScriptLines(raw: string): ScriptLine[] {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const malePrefix = /^(男[：:])\s*/;
      const femalePrefix = /^(女[：:])\s*/;
      if (malePrefix.test(l)) {
        return { text: l.replace(malePrefix, ''), gender: 'male' as const };
      }
      if (femalePrefix.test(l)) {
        return { text: l.replace(femalePrefix, ''), gender: 'female' as const };
      }
      return { text: l, gender: null };
    });
}

/**
 * Sanitize a string for use as a filename.
 * Removes Windows-illegal characters and trims to 60 chars.
 */
export function safeFilename(raw: string, fallback = '影片'): string {
  return raw.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || fallback;
}

/** Append 嗨歌 tag for default hype song exports (idempotent). */
export function withHypeFilenameTag(raw: string, fallback = '影片'): string {
  const tag = '_嗨歌';
  const base = raw.trim() || fallback;
  if (base.includes('嗨歌')) return base;
  // Keep total under safeFilename's 60-char cap so the tag is not truncated
  const maxBase = Math.max(1, 60 - tag.length);
  return `${base.slice(0, maxBase)}${tag}`;
}
