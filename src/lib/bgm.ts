/** BGM options + lightweight built-in pulse loop (no external assets). */

export type BgmMode = 'off' | 'builtin' | 'upload';

export interface BgmSettings {
  mode: BgmMode;
  /** 0–100 UI volume; mixed relatively quiet under TTS */
  volume: number;
  /** Auto-lower BGM while speech is active */
  duck: boolean;
}

export const DEFAULT_BGM: BgmSettings = {
  mode: 'off',
  volume: 35,
  duck: true,
};

/** Primary audio style: pure TTS vs default hype song feel */
export type AudioStyleMode = 'voice' | 'hype';

/** Pure voice — normal TTS, no BGM */
export const VOICE_PRESET = {
  rate: 0,
  pitch: 0,
  volume: 100,
  bgm: {
    mode: 'off' as BgmMode,
    volume: 35,
    duck: true,
  },
};

/** Default hype — faster / higher pitch + built-in pulse BGM */
export const HYPE_PRESET = {
  rate: 3,
  pitch: 2,
  volume: 115,
  bgm: {
    mode: 'builtin' as BgmMode,
    volume: 40,
    duck: true,
  },
};

export function presetForStyle(style: AudioStyleMode) {
  return style === 'hype' ? HYPE_PRESET : VOICE_PRESET;
}

/**
 * Map UI pitch (-5…+5) → Edge TTS relative Hz string.
 * Default library pitch is "+0Hz".
 */
export function formatPitch(pitch: number): string {
  const hz = Math.round(Math.max(-5, Math.min(5, pitch)) * 5);
  return `${hz >= 0 ? '+' : ''}${hz}Hz`;
}

/** Linear gain 0–1 from UI 0–100, capped so BGM never clips over TTS */
export function bgmGainFromUi(volume: number): number {
  const v = Math.max(0, Math.min(100, volume)) / 100;
  return v * 0.45;
}

/**
 * Synthesize a short stereo EDM-ish pulse loop (kick + hat + bass).
 * Royalty-free, no file download — used as the built-in "party" BGM.
 */
export function createBuiltinPulseBgm(
  ctx: BaseAudioContext,
  seconds = 4,
  bpm = 128,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sr * seconds));
  const buffer = ctx.createBuffer(2, length, sr);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);

  const beatSec = 60 / bpm;
  const samplesPerBeat = beatSec * sr;

  // Simple note table for a minor-ish bass riff (A2 root-ish)
  const bassHz = [110, 110, 130.81, 98, 110, 110, 146.83, 98];

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const beatPos = (i % samplesPerBeat) / samplesPerBeat;
    const beatIndex = Math.floor(i / samplesPerBeat);
    const eighth = Math.floor(t / (beatSec / 2));

    // ── Kick: every beat, short sine drop ──
    let kick = 0;
    if (beatPos < 0.18) {
      const env = Math.exp(-beatPos * 38);
      const f = 150 * Math.exp(-beatPos * 28) + 45;
      kick = Math.sin(2 * Math.PI * f * t) * env * 0.9;
    }

    // ── Snare/clap: beats 2 & 4 ──
    let snare = 0;
    const beatInBar = beatIndex % 4;
    if ((beatInBar === 1 || beatInBar === 3) && beatPos < 0.12) {
      const env = Math.exp(-beatPos * 42);
      const noise = pseudoNoise(i) * 0.55;
      const tone = Math.sin(2 * Math.PI * 180 * t) * 0.25;
      snare = (noise + tone) * env * 0.55;
    }

    // ── Closed hi-hat: 8th notes ──
    let hat = 0;
    const eighthPos = (t % (beatSec / 2)) / (beatSec / 2);
    if (eighthPos < 0.08) {
      const env = Math.exp(-eighthPos * 90);
      hat = pseudoNoise(i + 997) * env * (eighth % 2 === 0 ? 0.22 : 0.14);
    }

    // ── Bass: one note per beat ──
    const note = bassHz[beatIndex % bassHz.length];
    const bassEnv = 0.55 * Math.exp(-beatPos * 3.2) + 0.12;
    // soft square-ish via odd harmonics
    const phase = 2 * Math.PI * note * t;
    const bass =
      (Math.sin(phase) + 0.35 * Math.sin(phase * 2) + 0.15 * Math.sin(phase * 3)) *
      bassEnv *
      0.32;

    // ── Subtle riser pad (low) ──
    const pad = Math.sin(2 * Math.PI * 55 * t) * 0.04 * (0.5 + 0.5 * Math.sin(t * 1.7));

    let sample = kick + snare + hat + bass + pad;
    // soft clip
    sample = Math.tanh(sample * 1.15);

    // slight stereo width
    L[i] = sample * 0.92 + pseudoNoise(i) * 0.01;
    R[i] = sample * 0.92 + pseudoNoise(i + 31) * 0.01;
  }

  return buffer;
}

/** Deterministic cheap noise in [-1, 1] */
function pseudoNoise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * Schedule a looping buffer for `duration` seconds starting at `when`.
 * Returns created sources so caller can stop them if needed.
 */
export function scheduleLoopingBgm(
  ctx: AudioContext,
  buffer: AudioBuffer,
  gain: GainNode,
  when: number,
  duration: number,
): AudioBufferSourceNode[] {
  const sources: AudioBufferSourceNode[] = [];
  if (duration <= 0 || buffer.duration <= 0) return sources;

  let offset = 0;
  while (offset < duration - 0.0005) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    const playLen = Math.min(buffer.duration, duration - offset);
    src.start(when + offset, 0, playLen);
    sources.push(src);
    offset += buffer.duration;
  }
  return sources;
}

export interface DuckSegment {
  /** Speech start (seconds from mix start) */
  start: number;
  /** Speech end (seconds from mix start) — BGM ducks while active */
  end: number;
}

/**
 * Automate BGM gain: full between lines, ducked during speech.
 */
export function applyBgmDuckAutomation(
  gain: GainNode,
  when: number,
  baseGain: number,
  segments: DuckSegment[],
  duckRatio = 0.28,
  attack = 0.07,
  release = 0.18,
): void {
  const ducked = baseGain * duckRatio;
  const g = gain.gain;
  g.cancelScheduledValues(when);
  g.setValueAtTime(baseGain, when);

  for (const seg of segments) {
    if (seg.end <= seg.start) continue;
    const t0 = when + seg.start;
    const t1 = when + seg.end;

    // approach duck
    g.setValueAtTime(baseGain, Math.max(when, t0 - 0.01));
    g.linearRampToValueAtTime(ducked, t0 + attack);
    // hold
    g.setValueAtTime(ducked, Math.max(t0 + attack, t1 - 0.02));
    // restore
    g.linearRampToValueAtTime(baseGain, t1 + release);
  }
}
