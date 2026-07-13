export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createLipsyncProvider, getLipsyncAvailability } from '@/lib/lipsync';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

/** POST /api/lipsync/start — multipart: image + audio */
export async function POST(req: NextRequest) {
  const avail = getLipsyncAvailability();
  if (!avail.available) {
    return NextResponse.json(
      {
        error: avail.reason || '對口型服務未設定',
        hint: '請在伺服器設定 REPLICATE_API_TOKEN，並確認 LIPSYNC_PROVIDER 未關閉',
      },
      { status: 501 },
    );
  }

  const provider = createLipsyncProvider();
  if (!provider) {
    return NextResponse.json({ error: '無法建立對口服務' }, { status: 501 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '請以 multipart/form-data 上傳 image 與 audio' }, { status: 400 });
  }

  const imagePart = form.get('image');
  const audioPart = form.get('audio');

  if (!(imagePart instanceof Blob) || imagePart.size === 0) {
    return NextResponse.json({ error: '缺少 image 檔案' }, { status: 400 });
  }
  if (!(audioPart instanceof Blob) || audioPart.size === 0) {
    return NextResponse.json({ error: '缺少 audio 檔案' }, { status: 400 });
  }
  if (imagePart.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: '圖片超過 8MB 上限' }, { status: 400 });
  }
  if (audioPart.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: '音訊超過 20MB 上限' }, { status: 400 });
  }

  const mimeImage = imagePart.type || 'image/png';
  const mimeAudio = audioPart.type || 'audio/wav';
  if (!mimeImage.startsWith('image/')) {
    return NextResponse.json({ error: 'image 必須為圖片格式' }, { status: 400 });
  }
  if (!mimeAudio.startsWith('audio/') && mimeAudio !== 'video/mp4') {
    return NextResponse.json({ error: 'audio 必須為音訊格式' }, { status: 400 });
  }

  try {
    const imageBuf = Buffer.from(await imagePart.arrayBuffer());
    const audioBuf = Buffer.from(await audioPart.arrayBuffer());

    console.log(
      `[lipsync] start provider=${provider.id} image=${imageBuf.length} audio=${audioBuf.length}`,
    );

    const { jobId } = await provider.start({
      image: imageBuf,
      audio: audioBuf,
      mimeImage,
      mimeAudio,
    });

    return NextResponse.json({ jobId, provider: provider.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[lipsync] start error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
