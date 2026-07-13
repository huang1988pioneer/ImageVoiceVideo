import { test, expect } from '@playwright/test';

test.describe('Image Voice Video — home', () => {
  test('loads UI and shows generate control', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Image Voice Video')).toBeVisible();
    await expect(page.locator('#generate-btn')).toBeVisible();
    await expect(page.locator('#generate-btn')).toHaveText(/生成影片/);
    await expect(page.locator('canvas.preview-canvas')).toBeVisible();
    await expect(page.locator('.status-bar')).toContainText(/就緒|語音稿/);
  });

  test('accepts script input and track UI', async ({ page }) => {
    await page.goto('/');

    const script = page.locator('textarea').first();
    await expect(script).toBeVisible();
    await script.fill('測試字幕一行\n第二行語音');
    await expect(script).toHaveValue(/測試字幕一行/);

    // Default track / language controls should render
    await expect(page.getByText(/語音|語言|繁中|繁體/i).first()).toBeVisible();
  });

  test('uploads cover image into dropzone', async ({ page }) => {
    await page.goto('/');

    // 1×1 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.locator('#image-dropzone input[type="file"]').setInputFiles({
      name: 'dot.png',
      mimeType: 'image/png',
      buffer: png,
    });

    await expect(page.locator('#image-dropzone img')).toBeVisible({ timeout: 5_000 });
  });

  test('generate starts and hits TTS API (mocked)', async ({ page }) => {
    // Minimal valid-ish MP3 silence substitute — decode may fail; mock batch TTS as base64
    const tinyMp3 = Buffer.alloc(256, 0xff).toString('base64');

    await page.route('**/api/tts', async route => {
      const body = route.request().postDataJSON() as { items?: unknown[] } | null;
      if (body?.items && Array.isArray(body.items)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            audios: body.items.map(() => tinyMp3),
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.from(tinyMp3, 'base64'),
      });
    });

    await page.route('**/api/translate', async route => {
      const body = route.request().postDataJSON() as { lines?: string[] } | null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lines: body?.lines ?? [] }),
      });
    });

    await page.route('**/api/convert', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ available: false }),
        });
        return;
      }
      await route.fulfill({ status: 501, body: 'no ffmpeg' });
    });

    await page.goto('/');

    const script = page.locator('textarea').first();
    await script.fill('短測試');

    await page.locator('#generate-btn').click();

    // Should leave idle status and enter generation pipeline
    await expect(page.locator('.status-bar')).not.toContainText('就緒', {
      timeout: 5_000,
    });
  });
});
