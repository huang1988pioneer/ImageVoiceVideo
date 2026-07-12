'use client';
import styles from './TrackSelector.module.css';
import type { Track } from '@/lib/scriptParser';
import { LANG_OPTIONS } from '@/lib/languages';

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
    onChange(tracks.map(t => (t.language === lang ? { ...t, gender } : t)));
  };

  return (
    <div className={styles.wrapper}>
      <p className={styles.label}>語音語言</p>
      <div className={styles.grid}>
        {LANG_OPTIONS.map(({ value, short, flag }) => {
          const track = tracks.find(t => t.language === value);
          const sel = !!track;
          return (
            <div
              key={value}
              className={`${styles.card} ${sel ? styles.active : ''}`}
            >
              <button
                id={`track-${value}`}
                type="button"
                className={styles.toggleBtn}
                onClick={() => toggle(value, short)}
              >
                <span className={styles.flag}>{flag}</span>
                <span className={styles.langLabel}>{short}</span>
                {sel && <span className={styles.check}>✓</span>}
              </button>
              {sel && track && (
                <div className={styles.genderRow}>
                  <button
                    type="button"
                    className={`${styles.genderBtn} ${
                      track.gender === 'female' ? styles.genderActive : ''
                    }`}
                    onClick={() => setGender(value, 'female')}
                  >
                    ♀
                  </button>
                  <button
                    type="button"
                    className={`${styles.genderBtn} ${
                      track.gender === 'male' ? styles.genderActive : ''
                    }`}
                    onClick={() => setGender(value, 'male')}
                  >
                    ♂
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
