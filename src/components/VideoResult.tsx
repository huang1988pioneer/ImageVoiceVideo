'use client';
import styles from './VideoResult.module.css';
import { safeFilename } from '@/lib/scriptParser';

interface Props {
  blobUrl: string | null;
  ext: string;
  firstLine: string;
  customFilename: string;
  onClear: () => void;
}

export default function VideoResult({ blobUrl, ext, firstLine, customFilename, onClear }: Props) {
  if (!blobUrl) return null;

  const rawName  = customFilename.trim() || firstLine || '影片';
  const filename = `${safeFilename(rawName)}.${ext}`;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h3 className={styles.title}>影片已生成</h3>
        <button className={styles.clearBtn} onClick={onClear} title="清除">✕</button>
      </div>
      <video
        id="result-video"
        src={blobUrl}
        controls
        className={styles.video}
        playsInline
      />
      <a
        id="download-link"
        href={blobUrl}
        download={filename}
        className={styles.downloadBtn}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={styles.downloadIcon}>
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12M8 12l4 4 4-4" />
        </svg>
        下載 {filename}
      </a>
    </div>
  );
}
