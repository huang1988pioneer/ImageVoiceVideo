from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
WORK_DIR = ROOT / ".runtime"
VENDOR_DIR = ROOT / ".vendor"
if VENDOR_DIR.exists():
    sys.path.insert(0, str(VENDOR_DIR))

VOICE_MAP = {
    "zh-TW": {
        "female": "zh-TW-HsiaoChenNeural",
        "male": "zh-TW-YunJheNeural",
        "translate": None,
    },
    "en-US": {
        "female": "en-US-JennyNeural",
        "male": "en-US-GuyNeural",
        "translate": "en",
    },
    "ja-JP": {
        "female": "ja-JP-NanamiNeural",
        "male": "ja-JP-KeitaNeural",
        "translate": "ja",
    },
    "yue-HK": {
        "female": "zh-HK-HiuMaanNeural",
        "male": "zh-HK-WanLungNeural",
        "translate": "yue",
    },
    "ko-KR": {
        "female": "ko-KR-SunHiNeural",
        "male": "ko-KR-InJoonNeural",
        "translate": "ko",
    },
}


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/tts":
            self.handle_tts()
            return
        if path == "/api/translate":
            self.handle_translate()
            return
        self.send_error(404)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def handle_translate(self):
        try:
            payload = self.read_json()
            lines = payload.get("lines", [])
            language = str(payload.get("language", "zh-TW"))
            source_language = str(payload.get("source_language", "zh-TW"))
        except Exception:
            self.send_error(400, "Invalid JSON")
            return

        if language not in VOICE_MAP:
            self.send_error(400, "Unsupported language")
            return
        if not isinstance(lines, list):
            self.send_error(400, "Lines must be a list")
            return
        if len(lines) > 120:
            self.send_error(400, "Too many subtitle lines")
            return

        target = VOICE_MAP[language]["translate"]
        try:
            translated = [self.translate_text(str(line), target) for line in lines]
            data = json.dumps({"lines": translated}, ensure_ascii=False).encode("utf-8")
        except Exception as exc:
            self.send_error(500, f"Translation failed: {exc}")
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_tts(self):
        if urlparse(self.path).path != "/api/tts":
            self.send_error(404)
            return

        try:
            payload = self.read_json()
            text = str(payload.get("text", "")).strip()
            language = str(payload.get("language", "zh-TW"))
            gender = str(payload.get("gender", "female"))
            rate = int(payload.get("rate", 0))
            volume = int(payload.get("volume", 100))
            skip_translate = bool(payload.get("skip_translate", False))
        except Exception:
            self.send_error(400, "Invalid JSON")
            return

        if not text:
            self.send_error(400, "Text is required")
            return
        if len(text) > 5000:
            self.send_error(400, "Text is too long")
            return

        rate = max(-5, min(5, rate))
        volume = max(0, min(100, volume))
        language = language if language in VOICE_MAP else "zh-TW"
        gender = gender if gender in ("female", "male") else "female"
        WORK_DIR.mkdir(exist_ok=True)
        temp_dir = WORK_DIR / uuid.uuid4().hex
        temp_dir.mkdir()

        try:
            data, mime_type = self.create_voice(text, language, gender, rate, volume, temp_dir, skip_translate)
        except subprocess.TimeoutExpired:
            self.send_error(504, "Voice generation timed out")
            return
        except Exception as exc:
            self.send_error(500, f"Voice generation failed: {exc}")
            return
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def create_voice(self, text, language, gender, rate, volume, temp_dir, skip_translate=False):
        try:
            return self.create_edge_voice(text, language, gender, rate, volume, temp_dir, skip_translate)
        except Exception as edge_error:
            try:
                return self.create_windows_voice(text, rate, volume, temp_dir)
            except Exception as windows_error:
                raise RuntimeError(
                    "Text-to-speech is unavailable. Upload a narration audio file instead. "
                    f"Edge TTS: {edge_error}; Windows TTS: {windows_error}"
                ) from windows_error

    def create_edge_voice(self, text, language, gender, rate, volume, temp_dir, skip_translate=False):
        import edge_tts

        mp3_path = temp_dir / "voice.mp3"
        rate_percent = max(-50, min(50, rate * 10))
        volume_percent = volume - 100
        voice_config = VOICE_MAP[language]
        voice_name = voice_config[gender]
        # 語音稿語言與軌道相同時跳過翻譯，直接使用原文
        spoken_text = text if skip_translate else self.translate_text(text, voice_config["translate"])
        print(f"[TTS] lang={language} gender={gender} voice={voice_name} skip_translate={skip_translate} rate={rate_percent:+d}%", flush=True)
        communicate = edge_tts.Communicate(
            spoken_text,
            voice_name,
            rate=f"{rate_percent:+d}%",
            volume=f"{volume_percent:+d}%",
        )
        communicate.save_sync(str(mp3_path))
        data = mp3_path.read_bytes()
        if len(data) < 128:
            raise RuntimeError("Edge TTS produced an empty audio file")
        print(f"[TTS] OK {len(data)} bytes", flush=True)
        return data, "audio/mpeg"

    def translate_text(self, text, target):
        if not target:
            return text

        url = (
            "https://translate.googleapis.com/translate_a/single"
            f"?client=gtx&sl=auto&tl={quote(target)}&dt=t&q={quote(text)}"
        )
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
            translated = "".join(part[0] for part in payload[0] if part and part[0])
            return translated.strip() or text
        except Exception:
            if target == "yue":
                return self.translate_text(text, "zh-TW")
            raise

    def create_windows_voice(self, text, rate, volume, temp_dir):
        wav_path = temp_dir / "voice.wav"
        text_path = temp_dir / "script.txt"
        text_path.write_text(text, encoding="utf-8")
        wav_literal = str(wav_path).replace("'", "''")
        text_literal = str(text_path).replace("'", "''")
        ps_script = f"""
$text = Get-Content -LiteralPath '{text_literal}' -Raw -Encoding UTF8
$voice = New-Object -ComObject SAPI.SpVoice
$stream = New-Object -ComObject SAPI.SpFileStream
$format = New-Object -ComObject SAPI.SpAudioFormat
$format.Type = 22
$stream.Format = $format
$stream.Open('{wav_literal}', 3, $false)
$voice.AudioOutputStream = $stream
$voice.Rate = {rate * 2}
$voice.Volume = {volume}
$voice.Speak($text) | Out-Null
$stream.Close()
"""
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
            text=True,
            check=True,
            capture_output=True,
            timeout=90,
        )
        data = wav_path.read_bytes()
        if len(data) < 128:
            raise RuntimeError("Windows voice engine produced an empty audio file")
        return data, "audio/wav"

    def translate_path(self, path):
        path = urlparse(path).path.lstrip("/")
        return str((ROOT / path).resolve())

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5180"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Image Voice Video running at http://127.0.0.1:{port}")
    server.serve_forever()
