import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: '圖片語音影片 – Image Voice Video',
  description: '將圖片加上多語言 AI 語音與字幕，一鍵生成可下載的影片。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        {children}
        {/* ysFixWebmDuration – sets window.ysFixWebmDuration (WebM Duration often 0 without it) */}
        {/* Hosted locally in /public to avoid CDN 404 issues. Must load before any recording. */}
        <Script
          src="/fix-webm-duration.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
