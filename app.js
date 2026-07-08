const imageInput = document.querySelector("#imageInput");
const audioInput = document.querySelector("#audioInput");
const scriptInput = document.querySelector("#scriptInput");
const scriptLang = document.querySelector("#scriptLang");
const rateInput = document.querySelector("#rateInput");
const volumeInput = document.querySelector("#volumeInput");
const formatSelect = document.querySelector("#formatSelect");
const filenameInput = document.querySelector("#filenameInput");
const filenameExt = document.querySelector("#filenameExt");
const generateBtn = document.querySelector("#generateBtn");
const downloadLink = document.querySelector("#downloadLink");
const resultVideo = document.querySelector("#resultVideo");
const statusText = document.querySelector("#status");
const dropzone = document.querySelector("#dropzone");
const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d");

// ── 暫存：IndexedDB（圖片 Blob）+ localStorage（語音稿）───────────────────
const CACHE_DB = "ivv-cache";
const CACHE_STORE = "data";

function openCacheDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(CACHE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheSet(key, value) {
  const db = await openCacheDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function cacheGet(key) {
  const db = await openCacheDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readonly");
    const req = tx.objectStore(CACHE_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function cacheDel(...keys) {
  const db = await openCacheDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    keys.forEach((k) => tx.objectStore(CACHE_STORE).delete(k));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// 自動儲存圖片
async function saveImageCache(blob, name) {
  try {
    await cacheSet("image-blob", blob);
    await cacheSet("image-name", name);
  } catch (_) { /* 如果儲存失敗不影響主要功能 */ }
}

// 自動儲存語音稿（防抖 500ms）
let scriptSaveTimer = null;
function scheduleScriptSave() {
  clearTimeout(scriptSaveTimer);
  scriptSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem("ivv-script", scriptInput.value);
    } catch (_) {}
  }, 500);
}

// ── 恢復列初始化 ──────────────────────────────────────────
const restoreBar = document.querySelector("#restoreBar");
const restoreMsg = document.querySelector("#restoreMsg");
const restoreImageBtn = document.querySelector("#restoreImageBtn");
const restoreScriptBtn = document.querySelector("#restoreScriptBtn");
const clearCacheBtn = document.querySelector("#clearCacheBtn");
const dismissRestoreBtn = document.querySelector("#dismissRestoreBtn");

async function initRestoreBar() {
  try {
    const [imageBlob, imageName, savedScript] = await Promise.all([
      cacheGet("image-blob"),
      cacheGet("image-name"),
      Promise.resolve(localStorage.getItem("ivv-script")),
    ]);

    const hasImage = !!imageBlob;
    const hasScript = !!savedScript;
    if (!hasImage && !hasScript) return;

    // 建構提示訊息
    const parts = [];
    if (hasImage) parts.push(`圖片「${imageName || "未命名"}」`);
    if (hasScript) parts.push("語音稿");
    restoreMsg.textContent = `上次暫存：${parts.join("、")}`;

    if (hasImage) {
      restoreImageBtn.classList.remove("hidden");
      restoreImageBtn.addEventListener("click", async () => {
        const blob = await cacheGet("image-blob");
        const name = (await cacheGet("image-name")) || "cached-image";
        if (blob) {
          const file = new File([blob], name, { type: blob.type });
          await loadImage(file);
        }
      });
    }

    if (hasScript) {
      restoreScriptBtn.classList.remove("hidden");
      restoreScriptBtn.addEventListener("click", () => {
        scriptInput.value = savedScript;
        updateGenerateState();
      });
    }

    clearCacheBtn.addEventListener("click", async () => {
      await cacheDel("image-blob", "image-name");
      localStorage.removeItem("ivv-script");
      restoreBar.classList.add("hidden");
    });

    dismissRestoreBtn.addEventListener("click", () => {
      restoreBar.classList.add("hidden");
    });

    restoreBar.classList.remove("hidden");
  } catch (_) { /* IndexedDB 不支援時靜默失敗 */ }
}

const isFilePage = window.location.protocol === "file:";

const languageLabels = {
  "zh-TW": "中",
  "en-US": "EN",
  "ja-JP": "日",
  "yue-HK": "粵",
  "ko-KR": "韓",
};

let sourceImage = null;
let sourceAudioFile = null;

function setStatus(message) {
  statusText.textContent = message;
}

function updateGenerateState() {
  generateBtn.disabled = !(sourceImage && scriptInput.value.trim());
}

function evenNumber(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function resizeCanvasToImage(image) {
  const ratio = image.width / image.height;
  const longSide = 1920;
  let width;
  let height;

  if (image.width >= image.height) {
    width = longSide;
    height = longSide / ratio;
  } else {
    height = longSide;
    width = longSide * ratio;
  }

  canvas.width = evenNumber(width);
  canvas.height = evenNumber(height);
  document.documentElement.style.setProperty("--stage-ratio", `${canvas.width} / ${canvas.height}`);
}

function getSelectedTracks() {
  const checks = [...document.querySelectorAll(".track-check:checked")];
  const tracks = checks.map((check) => {
    const selectEl = document.querySelector(`.track-gender[data-language="${check.value}"]`);
    const gender = selectEl ? selectEl.value : "male";
    return {
      language: check.value,
      gender,
      label: languageLabels[check.value] || check.value,
    };
  });

  if (tracks.length) return tracks;
  // 沒有勾選任何語言時，讀取中文軌道的性別設定作為預設
  const fallbackGender = document.querySelector('.track-gender[data-language="zh-TW"]')?.value || "male";
  return [{ language: "zh-TW", gender: fallbackGender, label: "中" }];
}

function parseScriptLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const raw = line.trim();
      const marker = raw.match(/[（(]\s*([男女])\s*[）)]/);
      const gender = marker ? (marker[1] === "男" ? "male" : "female") : null;
      const clean = raw.replace(/[（(]\s*[男女]\s*[）)]/, "").trim();
      return { text: clean, gender };
    })
    .filter((line) => line.text);
}

function lineAt(lines, activeIndex) {
  if (!lines.length) return "";
  const index = Math.max(0, Math.min(lines.length - 1, activeIndex));
  return lines[index];
}

function drawFrame(activeIndex = 0, subtitleTracks = []) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#111817";
  ctx.fillRect(0, 0, w, h);

  if (sourceImage) {
    ctx.drawImage(sourceImage, 0, 0, w, h);
  }

  const visibleCaptions = subtitleTracks
    .map((track) => ({ label: track.label, text: lineAt(track.lines, activeIndex) }))
    .filter((caption) => caption.text);

  if (!visibleCaptions.length) return;

  const gradient = ctx.createLinearGradient(0, h * 0.56, 0, h);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const fontScale = visibleCaptions.length > 2 ? 0.032 : 0.04;
  const fontSize = Math.max(24, Math.round(Math.min(w, h) * fontScale));
  const lineHeight = Math.round(fontSize * 1.25);
  const bottomPadding = Math.max(34, Math.round(h * 0.045));
  const rows = [];

  ctx.font = `700 ${fontSize}px 'Segoe UI', 'Microsoft JhengHei', sans-serif`;
  for (const caption of visibleCaptions) {
    rows.push(...wrapCaption(caption.text, w * 0.86, visibleCaptions.length > 2 ? 1 : 2));
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  rows.slice(-6).forEach((line, index, lines) => {
    const y = h - bottomPadding - (lines.length - 1 - index) * lineHeight;
    ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.2));
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeText(line, w / 2, y);
    ctx.fillStyle = "white";
    ctx.fillText(line, w / 2, y);
  });
}

function wrapCaption(text, maxWidth, maxLines) {
  const chars = text.replace(/\s+/g, " ").trim().split("");
  const lines = [];
  let line = "";

  for (const char of chars) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = char;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }

  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  URL.revokeObjectURL(url);

  sourceImage = image;
  resizeCanvasToImage(image);
  drawFrame(0, []);
  setStatus(`已載入圖片：${file.name}`);
  updateGenerateState();

  // 將圖片存入 IndexedDB
  saveImageCache(file, file.name);
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response;
}

async function createVoice(text, track, gender) {
  const sourceLang = scriptLang?.value || "zh-TW";
  const skipTranslate = sourceLang === track.language;
  const response = await postJson("/api/tts", {
    text,
    language: track.language,
    gender: gender || track.gender,
    rate: Number(rateInput.value),
    volume: Number(volumeInput.value),
    skip_translate: skipTranslate,
  });
  return response.arrayBuffer();
}

async function translateLines(lines, track) {
  const sourceLang = scriptLang?.value || "zh-TW";
  // 語音稿語言與軌道語言相同，跳過翻譯
  if (sourceLang === track.language) return lines;
  const response = await postJson("/api/translate", {
    lines,
    language: track.language,
    source_language: sourceLang,
  });
  const payload = await response.json();
  return payload.lines || lines;
}

async function buildSubtitleTracks(scriptLines, tracks) {
  const lines = scriptLines.map((line) => line.text);
  const translated = await Promise.all(
    tracks.map(async (track) => ({
      ...track,
      lines: await translateLines(lines, track),
    })),
  );
  return translated;
}

async function buildAudio(audioContext, scriptLines, tracks) {
  const destination = audioContext.createMediaStreamDestination();

  if (sourceAudioFile) {
    const audioData = await sourceAudioFile.arrayBuffer();
    const buffer = await audioContext.decodeAudioData(audioData.slice(0));
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    const duration = Math.max(buffer.duration, 1);
    return {
      destination,
      sources: [{ source, startAt: 0 }],
      segmentDurations: scriptLines.map(() => duration / scriptLines.length),
      duration,
    };
  }

  if (isFilePage) {
    throw new Error("直接開啟 HTML 時無法文字轉語音，請用 http://127.0.0.1:5180/ 開啟。");
  }

  const trackBuffers = [];
  for (const track of tracks) {
    const buffers = [];
    for (const line of scriptLines) {
      const audioData = await createVoice(line.text, track, line.gender);
      buffers.push(await audioContext.decodeAudioData(audioData.slice(0)));
    }
    trackBuffers.push(buffers);
  }

  const segmentDurations = scriptLines.map((_, lineIndex) =>
    Math.max(...trackBuffers.map((buffers) => buffers[lineIndex].duration), 0.4),
  );
  const segmentStarts = segmentDurations.reduce((starts, duration, index) => {
    starts.push(index === 0 ? 0 : starts[index - 1] + segmentDurations[index - 1]);
    return starts;
  }, []);

  const gainValue = Math.min(0.85, 1 / Math.sqrt(trackBuffers.length));
  const sources = [];
  trackBuffers.forEach((buffers, trackIndex) => {
    buffers.forEach((buffer, lineIndex) => {
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = buffer;
      gain.gain.value = gainValue;

      if (audioContext.createStereoPanner) {
        const panner = audioContext.createStereoPanner();
        panner.pan.value = trackBuffers.length === 1 ? 0 : -0.85 + (1.7 * trackIndex) / (trackBuffers.length - 1);
        source.connect(gain).connect(panner).connect(destination);
      } else {
        source.connect(gain).connect(destination);
      }

      sources.push({ source, startAt: segmentStarts[lineIndex] });
    });
  });

  return {
    destination,
    sources,
    segmentDurations,
    duration: Math.max(1, segmentDurations.reduce((total, duration) => total + duration, 0)),
  };
}

function activeLineIndex(elapsed, segmentDurations) {
  let cursor = 0;
  for (let index = 0; index < segmentDurations.length; index += 1) {
    cursor += segmentDurations[index];
    if (elapsed < cursor) return index;
  }
  return Math.max(0, segmentDurations.length - 1);
}

function chooseMimeType(format) {
  if (format === "mp4") {
    const mp4Types = [
      "video/mp4;codecs=avc1,mp4a.40.2",
      "video/mp4",
    ];
    const supportedMp4 = mp4Types.find((type) => MediaRecorder.isTypeSupported(type));
    if (supportedMp4) return { mimeType: supportedMp4, ext: "mp4" };
  }

  const webmTypes = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const supportedWebm = webmTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  return { mimeType: supportedWebm, ext: "webm" };
}

async function generateVideo() {
  const text = scriptInput.value.trim();
  const scriptLines = parseScriptLines(text);
  const tracks = getSelectedTracks();
  if (!sourceImage || !scriptLines.length) return;

  generateBtn.disabled = true;
  downloadLink.classList.add("hidden");
  resultVideo.classList.add("hidden");

  // 判斷是否真的需要翻譯（有任何音軌語言與語音稿語言不同）
  const sourceLang = scriptLang?.value || "zh-TW";
  const needsTranslation = !sourceAudioFile && tracks.some((t) => t.language !== sourceLang);
  if (sourceAudioFile) {
    setStatus("正在建立多語字幕...");
  } else if (needsTranslation) {
    setStatus("正在翻譯並產生多語語音...");
  } else {
    setStatus("正在產生語音...");
  }

  try {
    const subtitleTracks = await buildSubtitleTracks(scriptLines, tracks);
    const audioContext = new AudioContext();
    // 必須 await，確保 AudioContext 時鐘在 TTS 生成期間真正暫停
    // 若不 await，currentTime 在 buildAudio 的數秒等待中繼續增加，
    // 導致 audioStartTime 偏移，WebM 音視訊時間戳相差數秒
    await audioContext.suspend();
    const { destination, sources, segmentDurations, duration } = await buildAudio(audioContext, scriptLines, tracks);

    const canvasStream = canvas.captureStream(30);
    const mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);

    const format = formatSelect?.value || "mp4";
    const { mimeType, ext } = chooseMimeType(format);

    const chunks = [];
    const recorder = new MediaRecorder(mixedStream, {
      mimeType,
      videoBitsPerSecond: 4500000,
      audioBitsPerSecond: 160000,
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };

    const done = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    let audioStartTime = 0;

    function doDraw() {
      const elapsed = audioContext.currentTime - audioStartTime;
      const progress = Math.min(1, elapsed / duration);
      const lineIndex = activeLineIndex(elapsed, segmentDurations);
      drawFrame(lineIndex, subtitleTracks);
      setStatus(`正在錄製影片 ${Math.round(progress * 100)}%｜字幕 ${lineIndex + 1}/${scriptLines.length}｜語言 ${tracks.length}`);
      return progress;
    }

    drawFrame(0, subtitleTracks);
    await audioContext.resume();
    
    // 使用 Web Worker 作為渲染計時器，確保即使分頁在背景，仍能維持 30fps 渲染畫面，避免字幕延遲或掉幀
    const workerBlob = new Blob([`
      let timer;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          timer = setInterval(() => self.postMessage('tick'), 33);
        } else if (e.data === 'stop') {
          clearInterval(timer);
        }
      };
    `], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerUrl);

    // 監聽錄影實際開始事件，避免編碼器啟動延遲（Startup Delay）導致開頭幾秒的影音被丟棄
    recorder.onstart = () => {
      // 記錄音訊開始的 audioContext 時間點，再排程所有音源
      audioStartTime = audioContext.currentTime;
      sources.forEach(({ source, startAt }) => source.start(audioStartTime + startAt));

      worker.onmessage = () => {
        // 持續繪製直到 recorder.stop()，確保 captureStream 有完整影格
        // 不提前停止——否則 canvas 停止繪製，video track 就在此刻截斷
        doDraw();
      };
      worker.postMessage('start');

      // 基於實際錄製開始的時間，設定結束定時器
      setTimeout(() => {
        worker.postMessage('stop');
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        drawFrame(scriptLines.length - 1, subtitleTracks);
        recorder.stop();
      }, duration * 1000 + 350);
    };
    
    // 使用 1000ms timeslice 讓 WebM 每秒產生一個 Cluster 邊界（SeekHead/Cue）
    // 外部播放器（PotPlayer、VLC 等）需要 Cluster 邊界才能正確定位與播放
    // Chrome MediaRecorder 的 timeslice chunk 時間戳為連續絕對值，不影響 A/V 同步
    recorder.start(1000);


    await done;
    await audioContext.close();

    let blob = new Blob(chunks, { type: mimeType });
    if (ext === "webm" && window.ysFixWebmDuration) {
      blob = await new Promise((resolve) => ysFixWebmDuration(blob, duration * 1000, resolve));
    }

    // 若使用者選擇 MP4 但瀏覽器不支援 H.264 MediaRecorder 而產出 WebM，
    // 自動透過伺服器 FFmpeg 轉成 MP4（需安裝 FFmpeg）
    if (format === "mp4" && ext === "webm" && !isFilePage) {
      setStatus("正在轉換為 MP4…");
      try {
        const res = await fetch("/api/convert", {
          method: "POST",
          headers: { "Content-Type": "video/webm", "Content-Length": blob.size },
          body: blob,
        });
        if (res.ok) {
          blob = await res.blob();
          ext = "mp4";
        } else if (res.status === 501) {
          setStatus("提示：伺服器未安裝 FFmpeg，保留 WebM 格式。請至 https://ffmpeg.org/download.html 下載並加入 PATH。");
        } else {
          const msg = await res.text().catch(() => res.statusText);
          setStatus(`轉檔失敗，保留 WebM 格式（${msg}）。`);
        }
      } catch (e) {
        // 網路錯誤或 fetch 失敗，保留 WebM
      }
    }

    const url = URL.createObjectURL(blob);
    const customName = filenameInput?.value.trim() || "";
    const rawTitle = customName || scriptLines[0]?.text || "有聲圖片影片";
    const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 60) || "有聲圖片影片";
    downloadLink.download = `${safeTitle}.${ext}`;
    downloadLink.href = url;
    downloadLink.classList.remove("hidden");
    resultVideo.src = url;
    resultVideo.classList.remove("hidden");
    setStatus(`完成，已建立 ${tracks.length} 種語言、${tracks.length} 組語音與多重字幕。`);
  } catch (error) {
    console.error(error);
    setStatus(`生成失敗：${error.message || "請確認內容後再試一次。"}`);
  } finally {
    updateGenerateState();
  }
}

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) loadImage(file);
});

audioInput.addEventListener("change", () => {
  sourceAudioFile = audioInput.files?.[0] || null;
  if (sourceAudioFile) {
    setStatus(`已載入旁白音檔：${sourceAudioFile.name}`);
  }
  updateGenerateState();
});

scriptInput.addEventListener("input", () => {
  updateGenerateState();
  scheduleScriptSave();
});
generateBtn.addEventListener("click", generateVideo);

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("active");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("active");
  });
}

dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files?.[0];
  if (file?.type.startsWith("image/")) loadImage(file);
});

// 語音稿語言變更時，自動勾選對應的語音音軌（取消舊的自動勾選）
let autoCheckedLang = "zh-TW"; // 記錄上次由腳本自動勾選的語言

function syncTrackToScriptLang() {
  const newLang = scriptLang?.value || "zh-TW";
  if (newLang === autoCheckedLang) return;

  // 取消舊的自動勾選（只有在沒有手動添加其他語言時才取消）
  const oldCheck = document.querySelector(`.track-check[value="${autoCheckedLang}"]`);
  if (oldCheck) oldCheck.checked = false;

  // 勾選新語言對應的音軌
  const newCheck = document.querySelector(`.track-check[value="${newLang}"]`);
  if (newCheck) newCheck.checked = true;

  autoCheckedLang = newLang;
  updateGenerateState();
}

scriptLang?.addEventListener("change", syncTrackToScriptLang);

if (isFilePage) {
  setStatus("目前是直接開啟 HTML。可上傳旁白音檔生成影片；文字轉語音需用 http://127.0.0.1:5180/ 開啟。");
} else {
  setStatus("請先上傳圖片並輸入語音稿。可勾選多語音軌與多重字幕。");
}

drawFrame(0, []);
initRestoreBar();

// 檢查瀏覽器是否支援 MP4 錄製，若不支援則調整選單
const mp4Supported = MediaRecorder.isTypeSupported("video/mp4");
if (!mp4Supported) {
  const mp4Option = document.querySelector('#formatSelect option[value="mp4"]');
  if (mp4Option) {
    mp4Option.textContent = "MP4（您的瀏覽器不支援）";
    mp4Option.disabled = true;
    formatSelect.value = "webm";
  }
}

