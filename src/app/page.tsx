'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
import {
  resolveCanvasSize,
  orientationLabel,
  type OrientationMode,
} from '@/lib/videoSize';
import styles from './page.module.css';

const ORIENT_STORAGE_KEY = 'ivv-orientation-mode';

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [script, setScript] = useState('');
  const [scriptLang, setScriptLang] = useState('zh-TW');
  const [tracks, setTracks] = useState<Track[]>([
    { language: 'zh-TW', label: '繁中', gender: 'female' },
  ]);
  const [rate, setRate] = useState(0);
  const [volume, setVolume] = useState(100);
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [orientationMode, setOrientationMode] = useState<OrientationMode>('auto');
  const [filename, setFilename] = useState('');
  const [status, setStatus] = useState('就緒 — 上傳圖片並輸入語音稿');
  const [recording, setRecording] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultExt, setResultExt] = useState('mp4');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultUrlRef = useRef<string | null>(null);
  const imageCache = useCache();
  const { drawFrame } = useCanvasRenderer();
  const { record } = useVideoRecorder(setStatus);

  const canvasSize = useMemo(
    () => resolveCanvasSize(orientationMode, imageEl),
    [orientationMode, imageEl],
  );

  // Restore cache + orientation preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ORIENT_STORAGE_KEY) as OrientationMode | null;
      if (saved === 'auto' || saved === 'portrait' || saved === 'landscape') {
        setOrientationMode(saved);
      }
    } catch {
      /* ignore */
    }

    setScript(
      imageCache.loadScript() ||
        '水電大學籌備處\n正在招募優秀人才\n歡迎加入我們的團隊',
    );
    imageCache.loadImage('last').then(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      const img = new Image();
      img.src = url;
      img.onload = () => setImageEl(img);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply canvas resolution + redraw when size / content changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (canvas.width !== canvasSize.width || canvas.height !== canvasSize.height) {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
    }

    const lines = parseScriptLines(script);
    const subs = lines.map((l, i) => ({
      text: l.text,
      startAt: i,
      endAt: i + 1,
      language: scriptLang,
    }));
    drawFrame(canvas, imageEl, subs, 0, true);
  }, [imageEl, script, scriptLang, drawFrame, canvasSize]);

  const handleImage = useCallback(
    (blob: Blob, url: string) => {
      setImageUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      const img = new Image();
      img.src = url;
      img.onload = () => setImageEl(img);
      void imageCache.saveImage('last', blob);
    },
    [imageCache],
  );

  const handleScript = useCallback(
    (text: string) => {
      setScript(text);
      imageCache.saveScript(text);
    },
    [imageCache],
  );

  const handleOrientation = useCallback((mode: OrientationMode) => {
    setOrientationMode(mode);
    try {
      localStorage.setItem(ORIENT_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (recording) return;

    const scriptLines = parseScriptLines(script);
    if (scriptLines.length === 0) {
      setStatus('請輸入語音稿');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Ensure canvas matches chosen orientation before capture
    if (canvas.width !== canvasSize.width || canvas.height !== canvasSize.height) {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
    }

    // Drop previous result so we can generate again without refresh
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResultUrl(null);
    setRecording(true);
    setStatus('準備生成…');

    try {
      const result = await record({
        scriptLines,
        tracks,
        image: imageEl,
        canvas,
        format,
        rate,
        volume,
        scriptLanguage: scriptLang,
      });
      const url = URL.createObjectURL(result.blob);
      resultUrlRef.current = url;
      setResultUrl(url);
      setResultExt(result.ext);
      setStatus(
        `完成！${canvasSize.label} ${canvasSize.orientation === 'landscape' ? '橫式' : '直式'} · ${result.duration.toFixed(1)} 秒 — 可繼續生成`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`錯誤：${msg}`);
      console.error(err);
    } finally {
      setRecording(false);
    }
  }, [
    recording,
    script,
    tracks,
    imageEl,
    format,
    rate,
    volume,
    scriptLang,
    record,
    canvasSize,
  ]);

  const firstLine = parseScriptLines(script)[0]?.text ?? '';
  const lineCount = parseScriptLines(script).length;
  const trackCount = tracks.length;
  const orientText = orientationLabel(orientationMode, canvasSize.orientation);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <div className={styles.logoMark}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={styles.logoIcon}
              >
                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <div className={styles.logoText}>
              <span className={styles.logoTitle}>Image Voice Video</span>
              <span className={styles.logoSub}>圖片 · 語音 · 多語字幕影片</span>
            </div>
          </div>
          <div className={styles.headerBadge}>
            <span className={styles.headerBadgeDot} />
            <span>{recording ? '生成中' : '就緒'}</span>
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.leftPanel}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <p className="section-label">封面圖片</p>
              <span className={styles.step}>1</span>
            </div>
            <ImageDropzone
              onImage={handleImage}
              previewUrl={imageUrl}
              orientation={canvasSize.orientation}
            />
          </div>

          <div className={`${styles.card} ${styles.cardWide}`}>
            <div className={styles.cardHeader}>
              <p className="section-label">語音稿</p>
              <span className={styles.step}>2</span>
            </div>
            <ScriptEditor
              value={script}
              language={scriptLang}
              onChange={handleScript}
              onLanguageChange={setScriptLang}
            />
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <p className="section-label">語音語言</p>
              <span className={styles.step}>3</span>
            </div>
            <TrackSelector tracks={tracks} onChange={setTracks} />
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <p className="section-label">音訊與輸出</p>
              <span className={styles.step}>4</span>
            </div>
            <AudioSettings
              rate={rate}
              volume={volume}
              format={format}
              orientation={orientationMode}
              filename={filename}
              onRate={setRate}
              onVolume={setVolume}
              onFormat={setFormat}
              onOrientation={handleOrientation}
              onFilename={setFilename}
            />
          </div>
        </div>

        <div
          className={[
            styles.rightPanel,
            canvasSize.orientation === 'landscape' ? styles.rightPanelLandscape : '',
            resultUrl ? styles.rightPanelHasResult : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className={`${styles.card} ${styles.previewCard}`}>
            <div className={styles.cardHeader}>
              <p className="section-label">即時預覽</p>
              <span className={styles.step}>▶</span>
            </div>
            <div
              className={`${styles.previewFrame} ${
                canvasSize.orientation === 'landscape' ? styles.previewFrameLandscape : ''
              }`}
            >
              <div
                className={styles.previewFrameInner}
                data-orientation={canvasSize.orientation}
                style={{
                  // Match export canvas aspect so CSS never crops the preview
                  aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
                  width: `min(100%, calc(var(--preview-max-h) * ${canvasSize.width} / ${canvasSize.height}))`,
                }}
              >
                {canvasSize.orientation === 'portrait' &&
                  canvasSize.height / canvasSize.width > 1.4 && (
                  <div className={styles.previewNotch} aria-hidden />
                )}
                <canvas
                  ref={canvasRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  className={`preview-canvas ${styles.previewCanvas}`}
                  data-orientation={canvasSize.orientation}
                />
              </div>
              <div className={styles.previewMeta}>
                <span className={styles.previewMetaTag}>
                  {canvasSize.label} · {orientText}
                </span>
                <span className={styles.previewMetaTag}>
                  {canvasSize.width}×{canvasSize.height}
                </span>
                <span className={styles.previewMetaTag}>
                  {lineCount} 段 · {trackCount} 語
                </span>
              </div>
            </div>
          </div>

          <div className={styles.actionStack}>
            <div className={`status-bar ${recording ? 'recording' : ''}`}>
              {recording && <div className="status-dot" />}
              <span>{status}</span>
            </div>

            <button
              id="generate-btn"
              type="button"
              className={`generate-btn ${styles.desktopOnly}`}
              onClick={handleGenerate}
              disabled={recording}
            >
              {recording ? '生成中…' : '生成影片'}
            </button>
          </div>

          {resultUrl && (
            <div className={styles.resultSlot}>
              <VideoResult
                blobUrl={resultUrl}
                ext={resultExt}
                firstLine={firstLine}
                customFilename={filename}
                orientation={canvasSize.orientation}
                onClear={() => {
                  if (resultUrlRef.current) {
                    URL.revokeObjectURL(resultUrlRef.current);
                    resultUrlRef.current = null;
                  }
                  setResultUrl(null);
                  setStatus('就緒 — 可繼續生成');
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className={styles.mobileDock}>
        <div
          className={`${styles.mobileDockStatus} ${recording ? styles.recording : ''}`}
        >
          {status}
        </div>
        <button
          type="button"
          className={`generate-btn ${styles.mobileDockBtn}`}
          onClick={handleGenerate}
          disabled={recording}
        >
          {recording ? '生成中…' : '生成影片'}
        </button>
      </div>
    </main>
  );
}
