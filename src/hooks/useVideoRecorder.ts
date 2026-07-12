'use client';
import { useCallback, useRef } from 'react';
import { fetchTTS, fetchTranslate, fetchConvert } from '@/lib/api';
import type { ScriptLine, Track, Gender } from '@/lib/scriptParser';
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

function chooseMime(fmt: string): { mimeType: string; ext: string } {
  if (fmt === 'mp4') {
    const mp4Types = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
    const found = mp4Types.find(t => MediaRecorder.isTypeSupported(t));
    if (found) return { mimeType: found, ext: 'mp4' };
  }
  const webmTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const found = webmTypes.find(t => MediaRecorder.isTypeSupported(t));
  return { mimeType: found ?? 'video/webm', ext: 'webm' };
}

function resolveGender(line: ScriptLine, track: Track): Gender {
  return line.gender ?? track.gender;
}

export function useVideoRecorder(onStatus: (msg: string) => void) {
  const abortRef = useRef(false);
  const { drawFrame } = useCanvasRenderer();

  const record = useCallback(async (opts: RecordingOptions): Promise<RecordingResult> => {
    const {
      scriptLines, tracks, image, canvas,
      format, rate, volume, scriptLanguage,
    } = opts;
    abortRef.current = false;

    const { mimeType, ext } = chooseMime(format);
    let currentExt = ext;

    // ── 1. Build spoken text + subtitle tracks (translate once) ──
    onStatus('正在翻譯字幕…');
    const spokenByTrack: string[][] = [];
    const allSubtitleTracks: SubtitleLine[][] = [];

    for (const track of tracks) {
      let spoken: string[];
      if (track.language === scriptLanguage) {
        spoken = scriptLines.map(l => l.text);
      } else {
        spoken = await fetchTranslate(
          scriptLines.map(l => l.text),
          track.language,
          scriptLanguage,
        );
      }
      spokenByTrack.push(spoken);
      allSubtitleTracks.push(
        spoken.map(text => ({
          text,
          startAt: 0,
          endAt: 0,
          language: track.language,
        })),
      );
    }

    // ── 2. Build audio (TTS for each line × each track) ──────────
    onStatus('正在生成語音…');
    const audioContext = new AudioContext();
    // Object bag so TS control-flow analysis doesn't collapse these to `null`/`never`
    const resources: { worker: Worker | null; workerUrl: string | null } = {
      worker: null,
      workerUrl: null,
    };

    try {
      await audioContext.suspend();
      const destination = audioContext.createMediaStreamDestination();

      // Lower gain when multiple language tracks play together
      const gainValue = Math.min(0.85, 1 / Math.sqrt(Math.max(tracks.length, 1)));

      const segmentDurations: number[] = new Array(scriptLines.length).fill(0);
      const allSources: { source: AudioBufferSourceNode; startAt: number }[] = [];

      // Generate TTS track-by-track so we can pan multi-language audio
      const trackBuffers: AudioBuffer[][] = [];

      for (let t = 0; t < tracks.length; t++) {
        const track = tracks[t];
        const spoken = spokenByTrack[t];
        const buffers: AudioBuffer[] = [];

        for (let i = 0; i < scriptLines.length; i++) {
          if (abortRef.current) throw new Error('已取消');
          onStatus(`正在生成語音 ${track.label || track.language} ${i + 1}/${scriptLines.length}…`);

          const gender = resolveGender(scriptLines[i], track);
          const ab = await fetchTTS(spoken[i], track.language, gender, rate, volume);
          const audioBuf = await audioContext.decodeAudioData(ab.slice(0));
          buffers.push(audioBuf);
        }
        trackBuffers.push(buffers);
      }

      for (let i = 0; i < scriptLines.length; i++) {
        const maxDur = Math.max(...trackBuffers.map(bufs => bufs[i].duration), 0.4);
        segmentDurations[i] = maxDur + 0.2;
      }

      const segmentStarts = segmentDurations.reduce<number[]>((starts, dur, idx) => {
        starts.push(idx === 0 ? 0 : starts[idx - 1] + segmentDurations[idx - 1]);
        return starts;
      }, []);

      trackBuffers.forEach((buffers, trackIndex) => {
        buffers.forEach((buffer, lineIndex) => {
          const source = audioContext.createBufferSource();
          source.buffer = buffer;

          const gain = audioContext.createGain();
          gain.gain.value = gainValue;

          if (audioContext.createStereoPanner && tracks.length > 1) {
            const panner = audioContext.createStereoPanner();
            panner.pan.value =
              -0.85 + (1.7 * trackIndex) / Math.max(tracks.length - 1, 1);
            source.connect(gain).connect(panner).connect(destination);
          } else {
            source.connect(gain).connect(destination);
          }

          allSources.push({ source, startAt: segmentStarts[lineIndex] });
        });
      });

      const totalDuration = segmentDurations.reduce((a, b) => a + b, 0);

      // Fill subtitle timing
      let cumTime = 0;
      for (let i = 0; i < scriptLines.length; i++) {
        for (const trackSubs of allSubtitleTracks) {
          trackSubs[i].startAt = cumTime;
          trackSubs[i].endAt = cumTime + segmentDurations[i];
        }
        cumTime += segmentDurations[i];
      }
      const flatSubtitles = allSubtitleTracks.flat();

      // ── 3. Set up canvas stream + MediaRecorder ──────────────────
      const canvasStream = canvas.captureStream(30);
      const mixedStream = new MediaStream([
        ...canvasStream.getTracks(),
        ...destination.stream.getTracks(),
      ]);

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(mixedStream, { mimeType });
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      // ── 4. Record ─────────────────────────────────────────────────
      onStatus('正在錄製影片…');
      let audioStartTime = 0;

      await new Promise<void>((resolve, reject) => {
        recorder.onerror = () => reject(new Error('MediaRecorder error'));

        recorder.onstart = () => {
          void audioContext.resume();
          audioStartTime = audioContext.currentTime;

          allSources.forEach(({ source, startAt }) => {
            source.start(audioStartTime + startAt);
          });

          const workerCode = `
            let timer;
            self.onmessage = e => {
              if (e.data === 'start') timer = setInterval(() => self.postMessage('tick'), 33);
              if (e.data === 'stop')  { clearInterval(timer); self.close(); }
            };
          `;
          resources.workerUrl = URL.createObjectURL(
            new Blob([workerCode], { type: 'text/javascript' }),
          );
          resources.worker = new Worker(resources.workerUrl);

          resources.worker.onmessage = () => {
            const elapsed = audioContext.currentTime - audioStartTime;
            const pct = Math.min(100, Math.round((elapsed / totalDuration) * 100));
            onStatus(`正在錄製影片 ${pct}%…`);
            drawFrame(canvas, image, flatSubtitles, elapsed);
          };
          resources.worker.postMessage('start');

          setTimeout(() => {
            resources.worker?.postMessage('stop');
            drawFrame(canvas, image, flatSubtitles, Math.max(0, totalDuration - 0.01));
            recorder.stop();
          }, totalDuration * 1000 + 350);
        };

        recorder.onstop = () => resolve();
        recorder.start(1000);
      });

      // Stop canvas/audio tracks so the tab recording indicator clears
      mixedStream.getTracks().forEach(t => t.stop());
      canvasStream.getTracks().forEach(t => t.stop());

      // ── 5. Fix WebM duration & optionally convert ─────────────────
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
          if (mp4) {
            blob = mp4;
            currentExt = 'mp4';
          } else {
            onStatus('FFmpeg 未安裝，保留 WebM 格式。');
          }
        } catch (e) {
          console.warn('MP4 conversion failed:', e);
          onStatus('MP4 轉換失敗，保留 WebM 格式。');
        }
      }

      return { blob, ext: currentExt, duration: totalDuration };
    } finally {
      resources.worker?.terminate();
      if (resources.workerUrl) URL.revokeObjectURL(resources.workerUrl);
      try {
        await audioContext.close();
      } catch {
        /* already closed */
      }
    }
  }, [drawFrame, onStatus]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { record, abort };
}
