'use client';
import styles from './AudioSettings.module.css';
import type { OrientationMode } from '@/lib/videoSize';
import type { AudioStyleMode, BgmSettings } from '@/lib/bgm';
import { HYPE_PRESET, VOICE_PRESET } from '@/lib/bgm';

interface Props {
  audioStyle: AudioStyleMode;
  rate: number;
  pitch: number;
  volume: number;
  format: 'mp4' | 'webm';
  orientation: OrientationMode;
  filename: string;
  bgm: BgmSettings;
  /** Talking-head lip-sync */
  lipSync: boolean;
  lipSyncAvailable: boolean;
  lipSyncHint?: string | null;
  onAudioStyle: (style: AudioStyleMode) => void;
  onRate: (v: number) => void;
  onPitch: (v: number) => void;
  onVolume: (v: number) => void;
  onFormat: (v: 'mp4' | 'webm') => void;
  onOrientation: (v: OrientationMode) => void;
  onFilename: (v: string) => void;
  onBgmChange: (partial: Partial<BgmSettings>) => void;
  onLipSync: (v: boolean) => void;
}

const ORIENT_OPTIONS: { value: OrientationMode; label: string; hint: string }[] = [
  { value: 'auto', label: '自動', hint: '依圖片' },
  { value: 'portrait', label: '直式', hint: '9:16' },
  { value: 'landscape', label: '橫式', hint: '16:9' },
];

const STYLE_OPTIONS: {
  value: AudioStyleMode;
  label: string;
  icon: string;
  hint: string;
}[] = [
  {
    value: 'voice',
    label: '純語音',
    icon: '🎙',
    hint: '正常語速 · 無 BGM',
  },
  {
    value: 'hype',
    label: '語音+背景音樂',
    icon: '♪',
    hint: '旁白 + 歌詞生成 BGM',
  },
];

/** Visual mode: still image vs talking-head lip-sync */
const VISUAL_OPTIONS: {
  value: 'static' | 'lipsync';
  label: string;
  icon: string;
  hint: string;
}[] = [
  {
    value: 'static',
    label: '靜態圖片',
    icon: '🖼',
    hint: '原圖固定 · 僅字幕變化',
  },
  {
    value: 'lipsync',
    label: '對口型',
    icon: '🗣',
    hint: '嘴巴跟語音同步',
  },
];

export default function AudioSettings({
  audioStyle,
  rate,
  pitch,
  volume,
  format,
  orientation,
  filename,
  bgm,
  lipSync,
  lipSyncAvailable,
  lipSyncHint,
  onAudioStyle,
  onRate,
  onPitch,
  onVolume,
  onFormat,
  onOrientation,
  onFilename,
  onBgmChange,
  onLipSync,
}: Props) {
  const isHype = audioStyle === 'hype';

  return (
    <div className={styles.wrapper}>
      <div className={styles.styleSection}>
        <span className={styles.styleLabel}>聲音風格</span>
        <div className={styles.styleGroup} role="radiogroup" aria-label="聲音風格">
          {STYLE_OPTIONS.map(opt => {
            const active = audioStyle === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                id={`audio-style-${opt.value}`}
                role="radio"
                aria-checked={active}
                className={`${styles.styleBtn} ${active ? styles.styleActive : ''} ${
                  opt.value === 'hype' ? styles.styleHype : styles.styleVoice
                }`}
                onClick={() => onAudioStyle(opt.value)}
                title={opt.hint}
              >
                <span className={styles.styleIcon} aria-hidden>
                  {opt.icon}
                </span>
                <span className={styles.styleText}>
                  <span className={styles.styleName}>{opt.label}</span>
                  <small className={styles.styleHint}>{opt.hint}</small>
                </span>
              </button>
            );
          })}
        </div>
        <p className={styles.presetHint}>
          {isHype
            ? '語音旁白加上依歌詞隨機生成的背景音樂；旁白會對拍並帶輕微旋律音高變化。每次生成曲風／BPM 會不同。'
            : `純語音：${VOICE_PRESET.volume}% 音量、無背景音樂。可微調語速／音高。`}
        </p>
      </div>

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
        <label className={styles.label} htmlFor="pitch-slider">
          音高 <span className={styles.val}>{pitch > 0 ? `+${pitch}` : pitch}</span>
        </label>
        <input
          id="pitch-slider"
          type="range"
          min={-5}
          max={5}
          step={1}
          value={pitch}
          onChange={e => onPitch(Number(e.target.value))}
          className={styles.slider}
        />
      </div>

      <div className={styles.row}>
        <label className={styles.label} htmlFor="volume-slider">
          語音音量 <span className={styles.val}>{volume}%</span>
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

      {isHype && (
        <>
          <div className={styles.divider} role="separator" />

          <div className={styles.row}>
            <label className={styles.label} htmlFor="bgm-volume-slider">
              BGM 音量 <span className={styles.val}>{bgm.volume}%</span>
            </label>
            <input
              id="bgm-volume-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={bgm.volume}
              onChange={e => onBgmChange({ volume: Number(e.target.value) })}
              className={styles.slider}
            />
          </div>

          <label className={styles.checkRow} htmlFor="bgm-duck">
            <input
              id="bgm-duck"
              type="checkbox"
              checked={bgm.duck}
              onChange={e => onBgmChange({ duck: e.target.checked })}
            />
            <span>
              旁白時自動壓低 BGM
              <small className={styles.checkHint}>（duck，聽感更乾淨）</small>
            </span>
          </label>
        </>
      )}

      <div className={styles.divider} role="separator" />

      <div className={styles.styleSection}>
        <span className={styles.styleLabel}>畫面模式</span>
        <div className={styles.styleGroup} role="radiogroup" aria-label="畫面模式">
          {VISUAL_OPTIONS.map(opt => {
            const isLipsync = opt.value === 'lipsync';
            const disabled = isLipsync && !lipSyncAvailable;
            const active =
              opt.value === 'static' ? !lipSync : lipSync && lipSyncAvailable;
            return (
              <button
                key={opt.value}
                type="button"
                id={`visual-mode-${opt.value}`}
                role="radio"
                aria-checked={active}
                aria-disabled={disabled}
                disabled={disabled}
                className={`${styles.styleBtn} ${
                  active ? styles.styleActive : ''
                } ${
                  opt.value === 'static' ? styles.styleVoice : styles.styleLipsync
                } ${disabled ? styles.styleDisabled : ''}`}
                onClick={() => {
                  if (disabled) return;
                  onLipSync(opt.value === 'lipsync');
                }}
                title={
                  disabled
                    ? lipSyncHint || '未設定 REPLICATE_API_TOKEN'
                    : opt.hint
                }
              >
                <span className={styles.styleIcon} aria-hidden>
                  {opt.icon}
                </span>
                <span className={styles.styleText}>
                  <span className={styles.styleName}>{opt.label}</span>
                  <small className={styles.styleHint}>{opt.hint}</small>
                </span>
              </button>
            );
          })}
        </div>
        <p className={styles.presetHint}>
          {lipSync && lipSyncAvailable
            ? '對口型：人臉嘴巴跟主音軌同步。請用清晰正面人臉；生成較慢，需外部 API。'
            : lipSyncAvailable
              ? '靜態圖片：畫面維持原圖，只有語音與字幕會變化。可隨時切換為對口型。'
              : `靜態圖片（預設）。對口型目前不可用：${lipSyncHint || '未設定 REPLICATE_API_TOKEN'}`}
        </p>
      </div>

      <div className={styles.divider} role="separator" />

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
          {isHype && <span className={styles.val}> · 會標註語音BGM</span>}
        </label>
        <div className={styles.filenameInput}>
          <input
            id="filename-input"
            type="text"
            placeholder={
              isHype ? '預設：第一行_語音BGM' : '預設使用第一行文字'
            }
            value={filename}
            onChange={e => onFilename(e.target.value)}
            className={styles.input}
          />
          <span className={styles.ext}>
            {isHype && !filename.includes('語音BGM') && !filename.includes('嗨歌')
              ? '_語音BGM'
              : ''}.{format}
          </span>
        </div>
      </div>
    </div>
  );
}
