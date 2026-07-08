// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScriptLine {
  text: string;
  gender: 'female' | 'male';
}

export interface Track {
  language: string;
  label: string;
  gender: 'female' | 'male';
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse script text into lines.
 * Lines prefixed with "男：" → male; "女：" or default → female.
 * Blank lines are skipped.
 */
export function parseScriptLines(raw: string): ScriptLine[] {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const malePrefix  = /^(男[：:])\s*/;
      const femalePrefix = /^(女[：:])\s*/;
      if (malePrefix.test(l))   return { text: l.replace(malePrefix, ''),   gender: 'male'   as const };
      if (femalePrefix.test(l)) return { text: l.replace(femalePrefix, ''), gender: 'female' as const };
      return { text: l, gender: 'female' as const };
    });
}

/**
 * Sanitize a string for use as a filename.
 * Removes Windows-illegal characters and trims to 60 chars.
 */
export function safeFilename(raw: string, fallback = '影片'): string {
  return raw.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || fallback;
}
