'use client';
import { useRef } from 'react';
import styles from './ScriptEditor.module.css';
import { LANG_OPTIONS } from '@/lib/languages';

interface Props {
  value: string;
  language: string;
  onChange: (text: string) => void;
  onLanguageChange: (lang: string) => void;
}

export default function ScriptEditor({
  value,
  language,
  onChange,
  onLanguageChange,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <label className={styles.label} htmlFor="script-language">
          稿件語言
        </label>
        <select
          id="script-language"
          className={styles.select}
          value={language}
          onChange={e => onLanguageChange(e.target.value)}
        >
          {LANG_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        ref={textareaRef}
        id="script-textarea"
        className={styles.textarea}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={
          '每行為一個字幕段落\n\n男：男生台詞\n女：女生台詞\n旁白文字'
        }
        rows={6}
        spellCheck={false}
      />
      <p className={styles.hint}>
        每行一段字幕。「男：」開頭使用男聲，「女：」或無前綴使用軌道預設性別。
      </p>
    </div>
  );
}
