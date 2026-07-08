'use client';
import { useCallback, useRef } from 'react';
import { fetchTTS, fetchTranslate, fetchConvert } from '@/lib/api';
import type { ScriptLine, Track } from '@/lib/scriptParser';
import type { SubtitleLine } from './useCanvasRenderer';
import { useCanvasRenderer } from './useCanvasRenderer';

// ysFixWebmDuration is loaded via <Script> in layout.tsx
declare const ysFixWebmDuration: (
  blob: Blob,
  duration: number,
  callback: (fixed: Blob) => void,
) => void;

export interface RecordingOptions {
  scriptLines: ScriptLine[];
  tracks: Track[];
  image: HTMLImageElement | null;
  canvas: HTMLCanvasElement;
  format: 'mp4' | 'webm';
  rate: number;
  volume: number;
  scriptLanguage: string;
}

export interface RecordingResult {
  blob: Blob;
  ext: string;
  duration: number;
}

export function useVideoRecorder(onStatus: (msg: string) => void) {
  const abortRef = useRef(false);
  const { drawFrame } = useCanvasRenderer();

  const record = useCallback(async (opts: RecordingOptions): Promise<RecordingResult> => {
    const { scriptLines, tracks, image, canvas, format, rate, volume, scriptLanguage } = opts;
    abortRef.current = false;

    // ── 1. Choose MIME type ──────────────────────────────────────
    function chooseMime(fmt: string): { mimeType: string; ext: string } {
      if (fmt === 'mp4') {
        const mp4Types = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
        const found = mp4Types.find(t => MediaRecorder.isTypeSupported(t));
        if (found) return { mimeType: found, ext: 'mp4' };
      }
      const webmTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const found = webmTypes.find(t => MediaRecorder.isTypeSupported(t));
      return { mimeType: found ?? 'video/webm', ext: 'webm' };
    }
    const { mimeType, ext } = chooseMime(format);
    let currentExt = ext;

    // ── 2. Build subtitle tracks ─────────────────────────────────
    onStatus('正在翻譯字幕…');
    const allSubtitleTracks: SubtitleLine[][] = [];
    for (const track of tracks) {
      if (track.language === scriptLanguage) {
        allSubtitleTracks.push(
          scriptLines.map((line, i) => ({
            text: line.text,
            startAt: 0, endAt: 0, // filled later
            language: track.language,
          })),
        );
      } else {
        const translated = await fetchTranslate(
          scriptLines.map(l => l.text),
          track.language,
          scriptLanguage,
        );
        allSubtitleTracks.push(
          translated.map(text => ({
            text,
            startAt: 0, endAt: 0,
            language: track.language,
          })),
        );
      }
    }

    // ── 3. Build audio (TTS for each line × each track) ──────────
    onStatus('正在生成語音…');
    const audioContext = new AudioContext();
    await audioContext.suspend();
    const destination = audioContext.createMediaStreamDestination();

    const segmentDurations: number[] = new Array(scriptLines.length).fill(0);
    const allSources: { source: AudioBufferSourceNode; startAt: number }[] = [];

    for (let i = 0; i < scriptLines.length; i++) {
      onStatus(`正在生成語音 ${i + 1}/${scriptLines.length}…`);
      const line   = scriptLines[i];
      let maxDur   = 0;

      for (const track of tracks) {
        const ab = await fetchTTS(line.text, track.language, line.gender, rate, volume);
        const audioBuf = await audioContext.decodeAudioData(ab.slice(0));
        maxDur = Math.max(maxDur, audioBuf.duration);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuf;
        source.connect(destination);
        allSources.push({ source, startAt: segmentDurations.reduce((a, b) => a + b, 0) });
      }
      segmentDurations[i] = maxDur + 0.2; // 0.2s gap
    }

    const totalDuration = segmentDurations.reduce((a, b) => a + b, 0);

    // Fill subtitle timing
    let cumTime = 0;
    for (let i = 0; i < scriptLines.length; i++) {
      for (const track of allSubtitleTracks) {
        track[i].startAt = cumTime;
        track[i].endAt   = cumTime + segmentDurations[i];
      }
      cumTime += segmentDurations[i];
    }
    const flatSubtitles = allSubtitleTracks.flat();

    // ── 4. Set up canvas stream + MediaRecorder ──────────────────
    const canvasStream = canvas.captureStream(30);
    const audioStream  = destination.stream;
    const mixedStream  = new MediaStream([
      ...canvasStream.getTracks(),
      ...audioStream.getTracks(),
    ]);

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(mixedStream, { mimeType });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    // ── 5. Record ─────────────────────────────────────────────────
    onStatus('正在錄製影片…');
    let audioStartTime = 0;

    await new Promise<void>((resolve, reject) => {
      recorder.onerror = e => reject(new Error('MediaRecorder error: ' + e));

      recorder.onstart = () => {
        audioContext.resume();
        audioStartTime = audioContext.currentTime;

        // Start all audio sources
        allSources.forEach(({ source, startAt }) => source.start(audioStartTime + startAt));

        // Worker-based 30fps canvas loop
        const workerCode = `
          let timer;
          self.onmessage = e => {
            if (e.data === 'start') timer = setInterval(() => self.postMessage('tick'), 33);
            if (e.data === 'stop')  { clearInterval(timer); self.close(); }
          };
        `;
        const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' })));

        worker.onmessage = () => {
          const elapsed = audioContext.currentTime - audioStartTime;
          const pct     = Math.min(100, Math.round(elapsed / totalDuration * 100));
          onStatus(`正在錄製影片 ${pct}%…`);
          drawFrame(canvas, image, flatSubtitles, elapsed);
        };
        worker.postMessage('start');

        // Stop after totalDuration + buffer
        setTimeout(() => {
          worker.postMessage('stop');
          // Draw final frame
          drawFrame(canvas, image, flatSubtitles, totalDuration - 0.01);
          recorder.stop();
        }, totalDuration * 1000 + 350);
      };

      recorder.onstop = () => resolve();
      recorder.start(1000); // 1-second clusters for external player compatibility
    });

    await audioContext.close();

    // ── 6. Fix WebM duration & optionally convert ─────────────────
    let blob = new Blob(chunks, { type: mimeType });

    if (currentExt === 'webm' && typeof ysFixWebmDuration !== 'undefined') {
      blob = await new Promise<Blob>(res =>
        ysFixWebmDuration(blob, totalDuration * 1000, res),
      );
    }

    if (format === 'mp4' && currentExt === 'webm') {
      onStatus('正在轉換為 MP4…');
      try {
        const mp4 = await fetchConvert(blob);
        if (mp4) { blob = mp4; currentExt = 'mp4'; }
        else onStatus('FFmpeg 未安裝，保留 WebM 格式。');
      } catch (e) {
        console.warn('MP4 conversion failed:', e);
      }
    }

    return { blob, ext: currentExt, duration: totalDuration };
  }, [drawFrame, onStatus]);

  const abort = useCallback(() => { abortRef.current = true; }, []);

  return { record, abort };
}
