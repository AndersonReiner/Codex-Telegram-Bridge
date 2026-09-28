#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
model="${1:-base}"
case "$model" in tiny|base|small) ;; *) echo 'Use tiny, base ou small.' >&2; exit 1 ;; esac
python3 -m venv .venv-audio
.venv-audio/bin/python -m pip install -r scripts/audio-requirements.txt
.venv-audio/bin/python scripts/transcribe-audio.py --model "$model" --prepare
