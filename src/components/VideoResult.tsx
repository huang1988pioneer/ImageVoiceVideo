'use client';
import styles from './VideoResult.module.css';
import { safeFilename, withHypeFilenameTag } from '@/lib/scriptParser';
import type { Orientation } from '@/lib/videoSize';
import type { AudioStyleMode } from '@/lib/bgm';

interface Props {
  blobUrl: string | null;
  ext: string;
  firstLine: string;
  customFilename: string;
  orientation?: Orientation;
  /** When hype (voice+BGM), download name is tagged with 語音BGM */
  audioStyle?: AudioStyleMode;
  onClear: () => void;
}

export default function VideoResult({
  blobUrl,
  ext,
  firstLine,
  customFilename,
  orientation = 'portrait',
  audioStyle = 'voice',
  onClear,
}: Props) {
  if (!blobUrl) return null;

  let rawName = customFilename.trim() || firstLine || '影片';
  if (audioStyle === 'hype') {
    rawName = withHypeFilenameTag(rawName);
  }
  const filename = `${safeFilename(rawName)}.${ext}`;
  const orientClass =
    orientation === 'landscape' ? styles.landscape : styles.portrait;

  return (
    <div className={`${styles.wrapper} ${orientClass}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          影片已生成
          <span className={styles.badge}>
            {orientation === 'landscape' ? '16:9 橫式' : '9:16 直式'}
          </span>
        </h3>
        <button className={styles.clearBtn} onClick={onClear} title="清除" type="button">
          ✕
        </button>
      </div>
      <div className={styles.videoWrap}>
        <video
          id="result-video"
          src={blobUrl}
          controls
          className={styles.video}
          playsInline
          preload="metadata"
        />
      </div>
      <a
        id="download-link"
        href={blobUrl}
        download={filename}
        className={styles.downloadBtn}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={styles.downloadIcon}
        >
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12M8 12l4 4 4-4" />
        </svg>
        下載 {filename}
      </a>
    </div>
  );
}
