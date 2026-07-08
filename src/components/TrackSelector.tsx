'use client';
import styles from './TrackSelector.module.css';
import type { Track } from '@/lib/scriptParser';

const AVAILABLE_LANGS = [
  { value: 'zh-TW', label: '繁中', flag: '🇹🇼' },
  { value: 'zh-CN', label: '簡中', flag: '🇨🇳' },
  { value: 'en-US', label: 'EN',   flag: '🇺🇸' },
  { value: 'ja-JP', label: 'JA',   flag: '🇯🇵' },
  { value: 'ko-KR', label: 'KR',   flag: '🇰🇷' },
  { value: 'yue-HK',label: '粵',   flag: '🇭🇰' },
];

interface Props {
  tracks: Track[];
  onChange: (tracks: Track[]) => void;
}

export default function TrackSelector({ tracks, onChange }: Props) {
  const isSelected = (lang: string) => tracks.some(t => t.language === lang);

  const toggle = (lang: string, label: string) => {
    if (isSelected(lang)) {
      if (tracks.length <= 1) return; // keep at least one
      onChange(tracks.filter(t => t.language !== lang));
    } else {
      onChange([...tracks, { language: lang, label, gender: 'female' }]);
    }
  };

  const setGender = (lang: string, gender: 'female' | 'male') => {
    onChange(tracks.map(t => t.language === lang ? { ...t, gender } : t));
  };

  return (
    <div className={styles.wrapper}>
      <p className={styles.label}>語音語言</p>
      <div className={styles.grid}>
        {AVAILABLE_LANGS.map(({ value, label, flag }) => {
          const track = tracks.find(t => t.language === value);
          const sel   = !!track;
          return (
            <div key={value} className={`${styles.card} ${sel ? styles.active : ''}`}>
              <button
                id={`track-${value}`}
                className={styles.toggleBtn}
                onClick={() => toggle(value, label)}
              >
                <span className={styles.flag}>{flag}</span>
                <span className={styles.langLabel}>{label}</span>
                {sel && <span className={styles.check}>✓</span>}
              </button>
              {sel && (
                <div className={styles.genderRow}>
                  <button
                    className={`${styles.genderBtn} ${track.gender === 'female' ? styles.genderActive : ''}`}
                    onClick={() => setGender(value, 'female')}
                  >♀</button>
                  <button
                    className={`${styles.genderBtn} ${track.gender === 'male' ? styles.genderActive : ''}`}
                    onClick={() => setGender(value, 'male')}
                  >♂</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
