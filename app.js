const imageInput = document.querySelector("#imageInput");
const audioInput = document.querySelector("#audioInput");
const scriptInput = document.querySelector("#scriptInput");
const rateInput = document.querySelector("#rateInput");
const volumeInput = document.querySelector("#volumeInput");
const generateBtn = document.querySelector("#generateBtn");
const downloadLink = document.querySelector("#downloadLink");
const resultVideo = document.querySelector("#resultVideo");
const statusText = document.querySelector("#status");
const dropzone = document.querySelector("#dropzone");
const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d");

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
    const gender = document.querySelector(`.track-gender[data-language="${check.value}"]`)?.value || "female";
    return {
      language: check.value,
      gender,
      label: languageLabels[check.value] || check.value,
    };
  });

  return tracks.length ? tracks : [{ language: "zh-TW", gender: "female", label: "中" }];
}

function parseScriptLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const raw = line.trim();
      const marker = raw.match(/[（(]\s*([男女])\s*[）)]/);
      const gender = marker ? (marker[1] === "男" ? "male" : "female") : null;
      const text = raw.replace(/[（(]\s*[男女]\s*[）)]/, "").trim();
      return { text, gender };
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
  const response = await postJson("/api/tts", {
    text,
    language: track.language,
    gender: gender || track.gender,
    rate: Number(rateInput.value),
    volume: Number(volumeInput.value),
  });
  return response.arrayBuffer();
}

async function translateLines(lines, track) {
  if (track.language === "zh-TW") return lines;
  const response = await postJson("/api/translate", {
    lines,
    language: track.language,
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

  const trackBuffers = await Promise.all(
    tracks.map(async (track) =>
      Promise.all(
        scriptLines.map(async (line) => {
          const audioData = await createVoice(line.text, track, line.gender);
          return audioContext.decodeAudioData(audioData.slice(0));
        }),
      ),
    ),
  );

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

function chooseMimeType() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function generateVideo() {
  const text = scriptInput.value.trim();
  const scriptLines = parseScriptLines(text);
  const tracks = getSelectedTracks();
  if (!sourceImage || !scriptLines.length) return;

  generateBtn.disabled = true;
  downloadLink.classList.add("hidden");
  resultVideo.classList.add("hidden");
  setStatus(sourceAudioFile ? "正在建立多語字幕..." : "正在翻譯並產生多語語音...");

  try {
    const subtitleTracks = await buildSubtitleTracks(scriptLines, tracks);
    const audioContext = new AudioContext();
    const { destination, sources, segmentDurations, duration } = await buildAudio(audioContext, scriptLines, tracks);

    const canvasStream = canvas.captureStream(30);
    const mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);

    const chunks = [];
    const recorder = new MediaRecorder(mixedStream, {
      mimeType: chooseMimeType(),
      videoBitsPerSecond: 4500000,
      audioBitsPerSecond: 160000,
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };

    const done = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    const startTime = performance.now();
    let animationFrame = 0;

    function animate(now) {
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(1, elapsed / duration);
      const lineIndex = activeLineIndex(elapsed, segmentDurations);
      drawFrame(lineIndex, subtitleTracks);
      setStatus(`正在錄製影片 ${Math.round(progress * 100)}%｜字幕 ${lineIndex + 1}/${scriptLines.length}｜語言 ${tracks.length}`);
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    }

    drawFrame(0, subtitleTracks);
    recorder.start(250);
    sources.forEach(({ source, startAt }) => source.start(audioContext.currentTime + startAt));
    animationFrame = requestAnimationFrame(animate);
    setTimeout(() => {
      cancelAnimationFrame(animationFrame);
      drawFrame(scriptLines.length - 1, subtitleTracks);
      recorder.stop();
    }, duration * 1000 + 350);

    await done;
    await audioContext.close();

    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
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

scriptInput.addEventListener("input", updateGenerateState);
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

if (isFilePage) {
  setStatus("目前是直接開啟 HTML。可上傳旁白音檔生成影片；文字轉語音需用 http://127.0.0.1:5180/ 開啟。");
} else {
  setStatus("請先上傳圖片並輸入語音稿。可勾選多語音軌與多重字幕。");
}

drawFrame(0, []);
