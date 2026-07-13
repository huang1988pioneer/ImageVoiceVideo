/** BGM options + lyric-seeded procedural music + beat-sync helpers. */

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

/** Default hype — faster / higher pitch + lyric-seeded BGM */
export const HYPE_PRESET = {
  rate: 3,
  pitch: 2,
  volume: 115,
  bgm: {
    mode: 'builtin' as BgmMode,
    volume: 42,
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

// ─── PRNG / hash ─────────────────────────────────────────────────────────────

/** FNV-1a-ish 32-bit hash for lyric seeding */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — deterministic float [0,1) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(a: number, b: number): number {
  return (Math.imul(a ^ b, 2246822519) ^ Math.imul(b, 3266489917)) >>> 0;
}

// ─── Lyric → music profile ───────────────────────────────────────────────────

/** Scales as semitone offsets from root */
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
} as const;

const ROOTS_HZ = [
  98.0, // G2
  103.83, // G#2
  110.0, // A2
  116.54, // A#2
  123.47, // B2
  130.81, // C3
  138.59, // C#3
  146.83, // D3
];

const STYLE_NAMES = [
  '派對電音',
  '熱血鼓點',
  '夜店副歌',
  '洗腦節拍',
  '街頭喊麥',
  '元氣快歌',
  '搖滾加速',
  '合成器嗨曲',
];

export interface LyricMusicProfile {
  seed: number;
  bpm: number;
  energy: number;
  rootHz: number;
  scale: readonly number[];
  /** Scale-degree indices for bass / melody */
  progression: number[];
  styleName: string;
  swing: number;
  hatDensity: number;
  leadOn: boolean;
}

/**
 * Derive a music profile from lyric lines.
 * `salt` makes each generation different while still lyric-influenced.
 */
export function analyzeLyricsForMusic(
  lines: string[],
  salt = Math.floor(Math.random() * 0xffffffff),
): LyricMusicProfile {
  const text = lines.join('\n');
  const chars = text.replace(/\s/g, '').length;
  const lineCount = Math.max(1, lines.length);
  const avgLen = chars / lineCount;
  const excl = (text.match(/[!！?？]/g) || []).length;
  const emojiish = (text.match(/[哈嘿嗨哟喔耶GO]/gi) || []).length;

  const lyricHash = hashString(text || 'empty');
  const seed = mixSeed(lyricHash, salt >>> 0);
  const rnd = mulberry32(seed);

  // Energy from punctuation / short punchy lines / hype chars
  const energy = Math.min(
    1,
    0.35 +
      Math.min(0.35, excl * 0.06) +
      Math.min(0.2, emojiish * 0.04) +
      (avgLen < 12 ? 0.15 : 0) +
      (avgLen > 28 ? -0.08 : 0) +
      rnd() * 0.15,
  );

  // BPM: denser / punchier lyrics → faster
  const bpmBase = 108 + energy * 36 + (avgLen < 10 ? 8 : 0) - (avgLen > 24 ? 6 : 0);
  const bpm = Math.round(Math.min(148, Math.max(100, bpmBase + (rnd() - 0.5) * 12)));

  const scaleKeys = Object.keys(SCALES) as (keyof typeof SCALES)[];
  const scale = SCALES[scaleKeys[Math.floor(rnd() * scaleKeys.length)]];
  const rootHz = ROOTS_HZ[Math.floor(rnd() * ROOTS_HZ.length)];

  // 8-step progression of scale degrees
  const progression: number[] = [];
  for (let i = 0; i < 8; i++) {
    // Prefer root / fifth / third on strong beats
    if (i % 4 === 0) progression.push(0);
    else if (i % 4 === 2) progression.push(Math.min(4, scale.length - 1));
    else progression.push(Math.floor(rnd() * scale.length));
  }

  const styleName = STYLE_NAMES[Math.floor(rnd() * STYLE_NAMES.length)];
  const swing = rnd() * 0.12 * (1 - energy * 0.5);
  const hatDensity = 0.55 + energy * 0.4 + rnd() * 0.1;
  const leadOn = energy > 0.45 || rnd() > 0.4;

  return {
    seed,
    bpm,
    energy,
    rootHz,
    scale,
    progression,
    styleName,
    swing,
    hatDensity,
    leadOn,
  };
}

function midiToHz(rootHz: number, semitones: number): number {
  return rootHz * Math.pow(2, semitones / 12);
}

/**
 * Synthesize a stereo loop from a lyric music profile (kick/snare/hat/bass/lead).
 * Royalty-free procedural audio — no external files.
 */
export function createLyricSeededBgm(
  ctx: BaseAudioContext,
  profile: LyricMusicProfile,
  seconds = 8,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sr * seconds));
  const buffer = ctx.createBuffer(2, length, sr);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);

  const { bpm, energy, rootHz, scale, progression, swing, hatDensity, leadOn, seed } =
    profile;
  const beatSec = 60 / bpm;

  // Pre-roll a few lead note degrees
  const leadDegrees = progression.map((_, i) => progression[(i + 2) % progression.length]);

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const beatFloat = t / beatSec;
    const beatIndex = Math.floor(beatFloat);
    const beatPos = beatFloat - beatIndex;

    // light swing on off-beats
    const swungPos =
      beatIndex % 2 === 1 ? Math.min(1, beatPos + swing * Math.sin(beatPos * Math.PI)) : beatPos;

    const beatInBar = beatIndex % 4;
    const step = beatIndex % progression.length;
    const deg = progression[step] % scale.length;
    const semi = scale[deg];
    const bassHz = midiToHz(rootHz, semi);

    // ── Kick ──
    let kick = 0;
    const kickEvery = energy > 0.7 ? 1 : 1; // 4-on-the-floor
    if (beatIndex % kickEvery === 0 && swungPos < 0.2) {
      const env = Math.exp(-swungPos * (32 + energy * 12));
      const f = 140 * Math.exp(-swungPos * 26) + 40 + energy * 10;
      kick = Math.sin(2 * Math.PI * f * t) * env * (0.85 + energy * 0.15);
    }

    // ── Snare / clap on 2 & 4 ──
    let snare = 0;
    if ((beatInBar === 1 || beatInBar === 3) && swungPos < 0.14) {
      const env = Math.exp(-swungPos * (38 + energy * 10));
      const noise = pseudoNoise(i + seed) * 0.6;
      const tone = Math.sin(2 * Math.PI * (170 + energy * 40) * t) * 0.28;
      snare = (noise + tone) * env * (0.45 + energy * 0.2);
    }

    // ── Hi-hat ──
    let hat = 0;
    const subdiv = energy > 0.6 ? 4 : 2; // 16ths vs 8ths
    const subSec = beatSec / subdiv;
    const subPos = (t % subSec) / subSec;
    const subIndex = Math.floor(t / subSec);
    if (subPos < 0.09) {
      const open = energy > 0.55 && subIndex % (subdiv * 2) === subdiv;
      const env = Math.exp(-subPos * (open ? 28 : 95));
      const dens = ((subIndex * 17 + seed) >>> 0) % 100 < hatDensity * 100;
      if (dens || subIndex % 2 === 0) {
        hat =
          pseudoNoise(i + 997 + seed) *
          env *
          (open ? 0.2 : subIndex % 2 === 0 ? 0.18 : 0.11) *
          (0.85 + energy * 0.2);
      }
    }

    // ── Bass ──
    const bassEnv = 0.5 * Math.exp(-swungPos * (2.8 - energy)) + 0.1 + energy * 0.05;
    const bPhase = 2 * Math.PI * bassHz * t;
    const bass =
      (Math.sin(bPhase) +
        0.4 * Math.sin(bPhase * 2) +
        0.18 * Math.sin(bPhase * 3) +
        (energy > 0.6 ? 0.1 * Math.sin(bPhase * 4) : 0)) *
      bassEnv *
      (0.28 + energy * 0.08);

    // ── Chord pad (root + third + fifth-ish) ──
    let pad = 0;
    const padNotes = [0, scale[Math.min(2, scale.length - 1)], scale[Math.min(4, scale.length - 1)]];
    for (const s of padNotes) {
      const hz = midiToHz(rootHz, s + 12);
      pad += Math.sin(2 * Math.PI * hz * t) * 0.035 * (0.5 + 0.5 * Math.sin(t * 0.9 + s));
    }
    pad *= 0.55 + energy * 0.35;

    // ── Lead blip (melody “singing” hook) ──
    let lead = 0;
    if (leadOn && swungPos < 0.35) {
      const ld = leadDegrees[step] % scale.length;
      const leadSemi = scale[ld] + 12 + (energy > 0.65 ? 12 : 0);
      const lhz = midiToHz(rootHz, leadSemi);
      const lenv = Math.exp(-swungPos * (6 + energy * 4));
      const lp = 2 * Math.PI * lhz * t;
      lead =
        (Math.sin(lp) + 0.25 * Math.sin(lp * 2)) *
        lenv *
        (0.08 + energy * 0.1) *
        (beatInBar === 0 || beatInBar === 2 ? 1.2 : 0.7);
    }

    // ── Off-beat clap ghost ──
    let ghost = 0;
    if (energy > 0.5 && beatPos > 0.48 && beatPos < 0.58) {
      ghost = pseudoNoise(i + 42) * Math.exp(-(beatPos - 0.48) * 40) * 0.08 * energy;
    }

    let sample = kick + snare + hat + bass + pad + lead + ghost;
    sample = Math.tanh(sample * (1.05 + energy * 0.2));

    const width = 0.01 + energy * 0.01;
    L[i] = sample * 0.92 + pseudoNoise(i) * width;
    R[i] = sample * 0.92 + pseudoNoise(i + 31 + seed) * width;
  }

  return buffer;
}

/**
 * Backward-compatible fixed pulse (used if profile missing).
 */
export function createBuiltinPulseBgm(
  ctx: BaseAudioContext,
  seconds = 4,
  bpm = 128,
): AudioBuffer {
  const profile: LyricMusicProfile = {
    seed: 0x12345678,
    bpm,
    energy: 0.7,
    rootHz: 110,
    scale: SCALES.minor,
    progression: [0, 0, 3, 4, 0, 0, 5, 4],
    styleName: '派對電音',
    swing: 0.02,
    hatDensity: 0.85,
    leadOn: true,
  };
  return createLyricSeededBgm(ctx, profile, seconds);
}

/** Deterministic cheap noise in [-1, 1] */
function pseudoNoise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

// ─── Beat-sync timeline (vocals follow BGM) ───────────────────────────────────

export interface BeatSyncedTimeline {
  segmentStarts: number[];
  segmentDurations: number[];
  speechDurations: number[];
  totalDuration: number;
  beatSec: number;
}

/**
 * Snap each lyric line to the beat grid so vocals feel timed to the BGM.
 * Segment length is quantized to whole beats (≥ speech length + short rest).
 */
export function buildBeatSyncedTimeline(
  speechDurations: number[],
  bpm: number,
): BeatSyncedTimeline {
  const beatSec = 60 / Math.max(60, Math.min(200, bpm));
  const segmentStarts: number[] = [];
  const segmentDurations: number[] = [];
  let t = 0;

  for (let i = 0; i < speechDurations.length; i++) {
    // Start on a beat boundary
    t = Math.ceil(t / beatSec - 1e-9) * beatSec;
    if (i === 0) t = 0;
    segmentStarts.push(t);

    const speech = Math.max(0.25, speechDurations[i]);
    // Need enough beats to cover speech + ~½ beat breath
    const beatsNeeded = Math.max(2, Math.ceil((speech + beatSec * 0.35) / beatSec));
    const segDur = beatsNeeded * beatSec;
    segmentDurations.push(segDur);
    t += segDur;
  }

  // Tail one extra bar of BGM after last line
  const tail = beatSec * 4;
  const totalDuration = Math.max(1, t + tail);

  return {
    segmentStarts,
    segmentDurations,
    speechDurations: speechDurations.map(d => Math.max(0.25, d)),
    totalDuration,
    beatSec,
  };
}

/**
 * Melodic detune in cents for “singing” each line along the scale.
 * Clamped so Edge TTS / buffer pitch stays natural-ish.
 */
export function lineMelodyDetuneCents(lineIndex: number, profile: LyricMusicProfile): number {
  const deg = profile.progression[lineIndex % profile.progression.length] % profile.scale.length;
  const semi = profile.scale[deg];
  // Map scale degree into a gentle contour around 0…+500 cents, with drops
  const wave = (lineIndex % 4 === 3 ? -1 : 1) * Math.min(semi, 7) * 50;
  const accent = lineIndex % 2 === 0 ? 40 : 0;
  return Math.max(-300, Math.min(500, wave + accent + profile.energy * 30));
}

/**
 * Schedule a looping buffer for `duration` seconds starting at `when`.
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

    g.setValueAtTime(baseGain, Math.max(when, t0 - 0.01));
    g.linearRampToValueAtTime(ducked, t0 + attack);
    g.setValueAtTime(ducked, Math.max(t0 + attack, t1 - 0.02));
    g.linearRampToValueAtTime(baseGain, t1 + release);
  }
}
