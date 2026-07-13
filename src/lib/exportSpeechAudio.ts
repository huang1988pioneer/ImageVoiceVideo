/**
 * Export a timeline of AudioBuffers into a mono/stereo WAV Blob
 * via OfflineAudioContext (browser-only).
 */

export interface SpeechSegment {
  buffer: AudioBuffer;
  /** Start time in the rendered timeline (seconds) */
  startAt: number;
}

/**
 * Schedule speech segments into an OfflineAudioContext and encode WAV.
 * Does not include BGM — lipsync models only need the voice track.
 *
 * Renders mono 16 kHz by default to keep upload size small for serverless limits.
 */
export async function exportSpeechToWav(
  segments: SpeechSegment[],
  totalDurationSec: number,
  options?: { sampleRate?: number; mono?: boolean },
): Promise<Blob> {
  if (segments.length === 0) {
    throw new Error('沒有可匯出的語音段落');
  }

  const sampleRate = options?.sampleRate ?? 16_000;
  const channels = options?.mono === false ? Math.min(2, segments[0].buffer.numberOfChannels) : 1;
  const duration = Math.max(0.1, totalDurationSec);
  const frameCount = Math.ceil(duration * sampleRate);

  const offline = new OfflineAudioContext(channels, frameCount, sampleRate);

  for (const seg of segments) {
    const source = offline.createBufferSource();
    source.buffer = seg.buffer;
    source.connect(offline.destination);
    source.start(Math.max(0, seg.startAt));
  }

  const rendered = await offline.startRendering();
  return audioBufferToWavBlob(rendered);
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
