'use client';
import { useCallback, useRef } from 'react';
import { fetchTTSBatch, fetchTranslate, fetchConvert } from '@/lib/api';
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

type CanvasCaptureTrack = MediaStreamTrack & { requestFrame?: () => void };

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

function stopTracks(stream: MediaStream | null | undefined, kinds?: Array<'audio' | 'video'>) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    if (kinds && !kinds.includes(track.kind as 'audio' | 'video')) continue;
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * Obtain a live canvas capture stream.
 * Reuses a previous stream if its video track is still live; otherwise creates a new one.
 * Stopping canvas tracks between runs can break re-capture in some browsers — we prefer reuse.
 */
function acquireCanvasStream(
  canvas: HTMLCanvasElement,
  existing: MediaStream | null,
): MediaStream {
  if (existing) {
    const live = existing.getVideoTracks().some(t => t.readyState === 'live');
    if (live) return existing;
    stopTracks(existing);
  }
  return canvas.captureStream(30);
}

function requestCanvasFrame(stream: MediaStream) {
  const track = stream.getVideoTracks()[0] as CanvasCaptureTrack | undefined;
  if (track?.requestFrame) {
    try {
      track.requestFrame();
    } catch {
      /* ignore */
    }
  }
}

export function useVideoRecorder(onStatus: (msg: string) => void) {
  const abortRef = useRef(false);
  const busyRef = useRef(false);
  /** Persist canvas capture stream across runs so we can generate repeatedly without refresh */
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const { drawFrame } = useCanvasRenderer();

  const record = useCallback(async (opts: RecordingOptions): Promise<RecordingResult> => {
    if (busyRef.current) {
      throw new Error('正在生成中，請稍候');
    }
    busyRef.current = true;
    abortRef.current = false;

    const {
      scriptLines, tracks, image, canvas,
      format, rate, volume, scriptLanguage,
    } = opts;

    const { mimeType, ext } = chooseMime(format);
    let currentExt = ext;

    let audioContext: AudioContext | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    let mixedStream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    const resources: { worker: Worker | null; workerUrl: string | null; timer: ReturnType<typeof setTimeout> | null } = {
      worker: null,
      workerUrl: null,
      timer: null,
    };

    try {
      // ── 0. Unlock AudioContext immediately to preserve user gesture ──
      audioContext = new AudioContext();
      // On some browsers, AudioContext must be resumed immediately after user interaction
      await audioContext.resume();
      await audioContext.suspend();

      // ── 1. Build spoken text + subtitle tracks ─────────────────
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

      // ── 2. Build audio (TTS) — batch per track (one WS per voice on server) ──
      onStatus('正在生成語音…');
      destination = audioContext.createMediaStreamDestination();

      const gainValue = Math.min(0.85, 1 / Math.sqrt(Math.max(tracks.length, 1)));
      const segmentDurations: number[] = new Array(scriptLines.length).fill(0);
      const allSources: { source: AudioBufferSourceNode; startAt: number }[] = [];
      const trackBuffers: AudioBuffer[][] = [];

      for (let t = 0; t < tracks.length; t++) {
        const track = tracks[t];
        const spoken = spokenByTrack[t];
        if (abortRef.current) throw new Error('已取消');

        onStatus(`正在生成語音 ${track.label || track.language}…`);

        const items = spoken.map((text, i) => ({
          text,
          language: track.language,
          gender: resolveGender(scriptLines[i], track),
        }));

        const abs = await fetchTTSBatch(items, rate, volume, (done, total) => {
          onStatus(`正在生成語音 ${track.label || track.language} ${done}/${total}…`);
        });

        const buffers: AudioBuffer[] = [];
        for (const ab of abs) {
          // slice so the buffer can be decoded even if the original is detached
          const audioBuf = await audioContext.decodeAudioData(ab.slice(0));
          buffers.push(audioBuf);
        }
        trackBuffers.push(buffers);
      }

      for (let i = 0; i < scriptLines.length; i++) {
        const maxDur = Math.max(...trackBuffers.map(bufs => bufs[i].duration), 0.4);
        segmentDurations[i] = maxDur + 0.2;
      }

      const segmentStarts = segmentDurations.reduce<number[]>((starts, _dur, idx) => {
        starts.push(idx === 0 ? 0 : starts[idx - 1] + segmentDurations[idx - 1]);
        return starts;
      }, []);

      trackBuffers.forEach((buffers, trackIndex) => {
        buffers.forEach((buffer, lineIndex) => {
          const source = audioContext!.createBufferSource();
          source.buffer = buffer;

          const gain = audioContext!.createGain();
          gain.gain.value = gainValue;

          if (tracks.length > 1 && typeof audioContext!.createStereoPanner === 'function') {
            const panner = audioContext!.createStereoPanner();
            panner.pan.value =
              -0.85 + (1.7 * trackIndex) / Math.max(tracks.length - 1, 1);
            source.connect(gain).connect(panner).connect(destination!);
          } else {
            source.connect(gain).connect(destination!);
          }

          allSources.push({ source, startAt: segmentStarts[lineIndex] });
        });
      });

      const totalDuration = segmentDurations.reduce((a, b) => a + b, 0);

      let cumTime = 0;
      for (let i = 0; i < scriptLines.length; i++) {
        for (const trackSubs of allSubtitleTracks) {
          trackSubs[i].startAt = cumTime;
          trackSubs[i].endAt = cumTime + segmentDurations[i];
        }
        cumTime += segmentDurations[i];
      }
      const flatSubtitles = allSubtitleTracks.flat();

      // ── 3. Canvas stream + MediaRecorder ────────────────────────
      // Draw a fresh frame before capture so the first encoded frame is valid
      drawFrame(canvas, image, flatSubtitles, 0);

      const canvasStream = acquireCanvasStream(canvas, canvasStreamRef.current);
      canvasStreamRef.current = canvasStream;
      requestCanvasFrame(canvasStream);

      const videoTracks = canvasStream.getVideoTracks().filter(t => t.readyState === 'live');
      if (videoTracks.length === 0) {
        // Last resort: force a brand-new capture stream
        stopTracks(canvasStreamRef.current);
        canvasStreamRef.current = canvas.captureStream(30);
        requestCanvasFrame(canvasStreamRef.current);
      }

      const liveCanvas = canvasStreamRef.current!;
      const liveVideo = liveCanvas.getVideoTracks().filter(t => t.readyState === 'live');
      if (liveVideo.length === 0) {
        throw new Error('無法擷取畫面，請重新整理後再試');
      }

      mixedStream = new MediaStream([
        ...liveVideo,
        ...destination.stream.getAudioTracks(),
      ]);

      const chunks: Blob[] = [];
      try {
        recorder = new MediaRecorder(mixedStream, { mimeType });
      } catch {
        // Fallback if codec combination is rejected mid-session
        recorder = new MediaRecorder(mixedStream);
        currentExt = 'webm';
      }

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      onStatus('正在錄製影片…');
      let audioStartTime = 0;
      const ctx = audioContext;
      const rec = recorder;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (err?: Error) => {
          if (settled) return;
          settled = true;
          if (resources.timer) {
            clearTimeout(resources.timer);
            resources.timer = null;
          }
          if (err) reject(err);
          else resolve();
        };

        // Hard timeout: start + duration + buffer, never hang forever
        const hardMs = Math.ceil(totalDuration * 1000) + 20_000;
        resources.timer = setTimeout(() => {
          try {
            if (rec.state === 'recording' || rec.state === 'paused') {
              try { rec.requestData(); } catch { /* ignore */ }
              rec.stop();
            }
          } catch {
            /* ignore */
          }
          // Give onstop a moment; if still stuck, fail
          setTimeout(() => {
            finish(new Error('錄製逾時，請再試一次（可改用 WebM 或減少句數）'));
          }, 1500);
        }, hardMs);

        rec.onerror = () => finish(new Error('MediaRecorder 發生錯誤'));

        rec.onstop = () => finish();

        rec.onstart = () => {
          void ctx.resume().then(() => {
            audioStartTime = ctx.currentTime;

            for (const { source, startAt } of allSources) {
              try {
                source.start(audioStartTime + startAt);
              } catch (e) {
                console.warn('source.start failed', e);
              }
            }

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
              const elapsed = ctx.currentTime - audioStartTime;
              const pct = Math.min(100, Math.round((elapsed / totalDuration) * 100));
              onStatus(`正在錄製影片 ${pct}%…`);
              drawFrame(canvas, image, flatSubtitles, elapsed);
              requestCanvasFrame(liveCanvas);
            };
            resources.worker.postMessage('start');

            setTimeout(() => {
              try {
                resources.worker?.postMessage('stop');
              } catch {
                /* ignore */
              }
              drawFrame(canvas, image, flatSubtitles, Math.max(0, totalDuration - 0.01));
              requestCanvasFrame(liveCanvas);
              // Let the last frame flush into the encoder
              setTimeout(() => {
                try {
                  if (rec.state === 'recording' || rec.state === 'paused') {
                    try { rec.requestData(); } catch { /* ignore */ }
                    rec.stop();
                  } else if (!settled) {
                    finish();
                  }
                } catch (e) {
                  finish(e instanceof Error ? e : new Error(String(e)));
                }
              }, 120);
            }, totalDuration * 1000 + 400);
          }).catch(err => {
            finish(err instanceof Error ? err : new Error(String(err)));
          });
        };

        try {
          // timeslice helps some browsers flush data reliably across multiple runs
          rec.start(250);
        } catch (e) {
          finish(e instanceof Error ? e : new Error(String(e)));
        }

        // If onstart never fires (broken stream), fail fast
        setTimeout(() => {
          if (!settled && rec.state === 'inactive') {
            finish(new Error('無法開始錄製，請再試一次'));
          }
        }, 4000);
      });

      // Brief pause so final cluster is delivered
      await sleep(50);

      // ── 4. Stop only AUDIO tracks from this run ────────────────
      // Keep canvas video track LIVE so the next generation can reuse captureStream.
      stopTracks(destination.stream, ['audio']);
      // Also stop any audio that was added onto mixedStream (same tracks)
      if (mixedStream) {
        for (const t of mixedStream.getAudioTracks()) {
          try { t.stop(); } catch { /* ignore */ }
        }
      }

      // ── 5. Fix WebM duration & optionally convert ──────────────
      if (chunks.length === 0) {
        throw new Error('錄製結果為空，請再試一次');
      }

      let blob = new Blob(chunks, { type: rec.mimeType || mimeType });

      if ((currentExt === 'webm' || blob.type.includes('webm')) && typeof ysFixWebmDuration !== 'undefined') {
        blob = await new Promise<Blob>(res => {
          try {
            ysFixWebmDuration(blob, totalDuration * 1000, res);
          } catch {
            res(blob);
          }
        });
      }

      if (format === 'mp4' && (currentExt === 'webm' || blob.type.includes('webm'))) {
        onStatus('正在轉換為 MP4…');
        try {
          const mp4 = await fetchConvert(blob);
          if (mp4) {
            blob = mp4;
            currentExt = 'mp4';
          } else {
            // Typical on Vercel: no FFmpeg binary — WebM still plays in Chrome/Edge/Firefox
            onStatus('遠端無 FFmpeg，已輸出 WebM（瀏覽器可直接播放下載）');
            currentExt = 'webm';
          }
        } catch (e) {
          console.warn('MP4 conversion failed:', e);
          onStatus('MP4 轉換失敗，保留 WebM 格式。');
          currentExt = 'webm';
        }
      }

      return { blob, ext: currentExt, duration: totalDuration };
    } finally {
      // Always release one-shot resources so the next run can start cleanly
      if (resources.timer) clearTimeout(resources.timer);
      try {
        resources.worker?.terminate();
      } catch {
        /* ignore */
      }
      if (resources.workerUrl) URL.revokeObjectURL(resources.workerUrl);

      // If canvas track died, clear ref so next run recreates it
      const cs = canvasStreamRef.current;
      if (cs && !cs.getVideoTracks().some(t => t.readyState === 'live')) {
        stopTracks(cs);
        canvasStreamRef.current = null;
      }

      if (audioContext) {
        try {
          await audioContext.close();
        } catch {
          /* already closed */
        }
      }

      busyRef.current = false;
    }
  }, [drawFrame, onStatus]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { record, abort };
}
