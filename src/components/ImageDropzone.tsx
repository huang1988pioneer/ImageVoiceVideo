'use client';
import { useCallback, useRef, useState } from 'react';
import styles from './ImageDropzone.module.css';

interface Props {
  onImage: (blob: Blob, url: string) => void;
  previewUrl: string | null;
}

export default function ImageDropzone({ onImage, previewUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    onImage(file, url);
  }, [onImage]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div
      id="image-dropzone"
      className={`${styles.zone} ${dragging ? styles.dragging : ''} ${previewUrl ? styles.hasImage : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.hidden}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {previewUrl ? (
        <img src={previewUrl} alt="預覽" className={styles.preview} />
      ) : (
        <div className={styles.placeholder}>
          <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className={styles.hint}>拖放圖片至此</p>
          <p className={styles.sub}>或點擊選擇檔案</p>
        </div>
      )}
      {previewUrl && (
        <div className={styles.overlay}>
          <span>點擊更換圖片</span>
        </div>
      )}
    </div>
  );
}
