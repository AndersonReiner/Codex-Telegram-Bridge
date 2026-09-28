"""Local CPU transcription. stdout is reserved for the JSON result."""
import argparse
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--model", choices=["tiny", "base", "small"], default="base")
parser.add_argument("--prepare", action="store_true")
parser.add_argument("file", nargs="?")
args = parser.parse_args()

from faster_whisper import WhisperModel

cache = os.environ.get("AUDIO_MODEL_CACHE_DIR") or str(Path(__file__).resolve().parent.parent / "data" / "whisper-models")
model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=2,
                     download_root=cache, local_files_only=not args.prepare)
if args.prepare:
    print(json.dumps({"ready": True, "model": args.model}))
else:
    if not args.file:
        parser.error("Informe o arquivo de áudio")
    # Limit decoded samples too: do not trust Telegram's duration metadata.
    import av
    import numpy as np
    # Decode incrementally with a hard sample limit, including forged durations.
    chunks = []
    sample_count = 0
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    with av.open(args.file) as container:
        for frame in container.decode(audio=0):
            for converted in resampler.resample(frame):
                samples = converted.to_ndarray().flatten()
                sample_count += len(samples)
                if sample_count > 120 * 16000:
                    raise ValueError("Áudio excede 120 segundos")
                chunks.append(samples)
        for converted in resampler.resample(None):
            samples = converted.to_ndarray().flatten()
            sample_count += len(samples)
            if sample_count > 120 * 16000:
                raise ValueError("Áudio excede 120 segundos")
            chunks.append(samples)
    if not chunks:
        raise ValueError("Áudio vazio")
    audio = np.concatenate(chunks).astype(np.float32) / 32768.0
    segments, info = model.transcribe(audio, language="pt", beam_size=3,
                                      vad_filter=True, condition_on_previous_text=False)
    text = " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.6).strip()
    print(json.dumps({"text": text[:12000]}, ensure_ascii=False))
