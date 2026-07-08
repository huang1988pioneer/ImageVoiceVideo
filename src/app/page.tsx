'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import ImageDropzone from '@/components/ImageDropzone';
import ScriptEditor from '@/components/ScriptEditor';
import TrackSelector from '@/components/TrackSelector';
import AudioSettings from '@/components/AudioSettings';
import VideoResult from '@/components/VideoResult';
import { useCache } from '@/hooks/useCache';
import { useVideoRecorder } from '@/hooks/useVideoRecorder';
import { useCanvasRenderer } from '@/hooks/useCanvasRenderer';
import { parseScriptLines } from '@/lib/scriptParser';
import type { Track } from '@/lib/scriptParser';
import styles from './page.module.css';

const CANVAS_W = 1080;
const CANVAS_H = 1920;

export default function Home() {
  // ── State ────────────────────────────────────────────────
  const [imageUrl,    setImageUrl]    = useState<string | null>(null);
  const [imageEl,     setImageEl]     = useState<HTMLImageElement | null>(null);
  const [script,      setScript]      = useState('');
  const [scriptLang,  setScriptLang]  = useState('zh-TW');
  const [tracks,      setTracks]      = useState<Track[]>([
    { language: 'zh-TW', label: '繁中', gender: 'female' },
  ]);
  const [rate,        setRate]        = useState(0);
  const [volume,      setVolume]      = useState(100);
  const [format,      setFormat]      = useState<'mp4'|'webm'>('mp4');
  const [filename,    setFilename]    = useState('');
  const [status,      setStatus]      = useState('就緒');
  const [recording,   setRecording]   = useState(false);
  const [resultUrl,   setResultUrl]   = useState<string | null>(null);
  const [resultExt,   setResultExt]   = useState('mp4');

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imageCache = useCache();
  const { drawFrame } = useCanvasRenderer();
  const { record }    = useVideoRecorder(setStatus);

  // ── Restore cache ────────────────────────────────────────
  useEffect(() => {
    setScript(imageCache.loadScript() || '水電大學籌備處\n正在招募優秀人才\n歡迎加入我們的團隊');
    imageCache.loadImage('last').then(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      const img = new Image();
      img.src = url;
      img.onload = () => setImageEl(img);
    });
  }, []); // eslint-disable-line

  // ── Draw preview on canvas when image/script changes ─────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lines = parseScriptLines(script);
    const subs  = lines.map((l, i) => ({
      text: l.text, startAt: i, endAt: i + 1, language: scriptLang,
    }));
    drawFrame(canvas, imageEl, subs, 0, true);
  }, [imageEl, script, scriptLang, drawFrame]);

  // ── Image upload ─────────────────────────────────────────
  const handleImage = useCallback((blob: Blob, url: string) => {
    setImageUrl(url);
    const img = new Image();
    img.src = url;
    img.onload = () => setImageEl(img);
    imageCache.saveImage('last', blob);
  }, [imageCache]);

  // ── Script change ─────────────────────────────────────────
  const handleScript = useCallback((text: string) => {
    setScript(text);
    imageCache.saveScript(text);
  }, [imageCache]);

  // ── Generate ─────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const scriptLines = parseScriptLines(script);
    if (scriptLines.length === 0) { setStatus('請輸入語音稿'); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setRecording(true);

    try {
      const result = await record({
        scriptLines, tracks, image: imageEl,
        canvas, format, rate, volume, scriptLanguage: scriptLang,
      });
      const url = URL.createObjectURL(result.blob);
      setResultUrl(url);
      setResultExt(result.ext);
      setStatus(`完成！共 ${result.duration.toFixed(1)} 秒`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`錯誤：${msg}`);
      console.error(err);
    } finally {
      setRecording(false);
    }
  }, [script, tracks, imageEl, format, rate, volume, scriptLang, record, resultUrl]);

  const firstLine = parseScriptLines(script)[0]?.text ?? '';

  return (
    <main className={styles.main}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={styles.logoIcon}>
            <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          <span>Image Voice Video</span>
        </div>
      </header>

      <div className={styles.layout}>
        {/* ── Left panel ── */}
        <div className={styles.leftPanel}>
          <div className={styles.card}>
            <p className="section-label">封面圖片</p>
            <ImageDropzone onImage={handleImage} previewUrl={imageUrl} />
          </div>

          <div className={styles.card}>
            <ScriptEditor
              value={script}
              language={scriptLang}
              onChange={handleScript}
              onLanguageChange={setScriptLang}
            />
          </div>

          <div className={styles.card}>
            <TrackSelector tracks={tracks} onChange={setTracks} />
          </div>

          <div className={styles.card}>
            <AudioSettings
              rate={rate} volume={volume} format={format} filename={filename}
              onRate={setRate} onVolume={setVolume} onFormat={setFormat} onFilename={setFilename}
            />
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className={styles.rightPanel}>
          {/* Canvas preview */}
          <div className={styles.card}>
            <p className="section-label">預覽</p>
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="preview-canvas"
            />
          </div>

          {/* Status + button */}
          <div className={`status-bar ${recording ? 'recording' : ''}`}>
            {recording && <div className="status-dot" />}
            <span>{status}</span>
          </div>

          <button
            id="generate-btn"
            className="generate-btn"
            onClick={handleGenerate}
            disabled={recording}
          >
            {recording ? '🎬 生成中…' : '🎬 生成影片'}
          </button>

          {/* Result */}
          {resultUrl && (
            <VideoResult
              blobUrl={resultUrl}
              ext={resultExt}
              firstLine={firstLine}
              customFilename={filename}
              onClear={() => {
                if (resultUrl) URL.revokeObjectURL(resultUrl);
                setResultUrl(null);
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
