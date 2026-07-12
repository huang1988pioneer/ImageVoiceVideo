'use client';
import styles from './AudioSettings.module.css';
import type { OrientationMode } from '@/lib/videoSize';

interface Props {
  rate: number;
  volume: number;
  format: 'mp4' | 'webm';
  orientation: OrientationMode;
  filename: string;
  onRate: (v: number) => void;
  onVolume: (v: number) => void;
  onFormat: (v: 'mp4' | 'webm') => void;
  onOrientation: (v: OrientationMode) => void;
  onFilename: (v: string) => void;
}

const ORIENT_OPTIONS: { value: OrientationMode; label: string; hint: string }[] = [
  { value: 'auto', label: '自動', hint: '依圖片' },
  { value: 'portrait', label: '直式', hint: '9:16' },
  { value: 'landscape', label: '橫式', hint: '16:9' },
];

export default function AudioSettings({
  rate,
  volume,
  format,
  orientation,
  filename,
  onRate,
  onVolume,
  onFormat,
  onOrientation,
  onFilename,
}: Props) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <label className={styles.label} htmlFor="rate-slider">
          語速 <span className={styles.val}>{rate > 0 ? `+${rate}` : rate}</span>
        </label>
        <input
          id="rate-slider"
          type="range"
          min={-5}
          max={5}
          step={1}
          value={rate}
          onChange={e => onRate(Number(e.target.value))}
          className={styles.slider}
        />
      </div>

      <div className={styles.row}>
        <label className={styles.label} htmlFor="volume-slider">
          音量 <span className={styles.val}>{volume}%</span>
        </label>
        <input
          id="volume-slider"
          type="range"
          min={0}
          max={150}
          step={5}
          value={volume}
          onChange={e => onVolume(Number(e.target.value))}
          className={styles.slider}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>畫面方向</span>
        <div className={styles.formatGroup} role="group" aria-label="畫面方向">
          {ORIENT_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              id={`orient-${o.value}`}
              className={`${styles.formatBtn} ${styles.orientBtn} ${
                orientation === o.value ? styles.active : ''
              }`}
              onClick={() => onOrientation(o.value)}
              title={o.hint}
            >
              <span className={styles.orientIcon} data-orient={o.value} aria-hidden />
              <span>
                {o.label}
                <small className={styles.orientHint}>{o.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>格式</span>
        <div className={styles.formatGroup}>
          {(['mp4', 'webm'] as const).map(f => (
            <button
              key={f}
              type="button"
              id={`format-${f}`}
              className={`${styles.formatBtn} ${format === f ? styles.active : ''}`}
              onClick={() => onFormat(f)}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.filenameRow}>
        <label className={styles.label} htmlFor="filename-input">
          輸出檔名
        </label>
        <div className={styles.filenameInput}>
          <input
            id="filename-input"
            type="text"
            placeholder="預設使用第一行文字"
            value={filename}
            onChange={e => onFilename(e.target.value)}
            className={styles.input}
          />
          <span className={styles.ext}>.{format}</span>
        </div>
      </div>
    </div>
  );
}
