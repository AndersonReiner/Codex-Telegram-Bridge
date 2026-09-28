# syntax=docker/dockerfile:1

ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION} AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:${NODE_VERSION} AS runtime

ARG CODEX_VERSION=0.158.0
ARG AUDIO_MODEL=base

ENV NODE_ENV=production \
    HOME=/home/node \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=8787 \
    DB_PATH=/app/data/bridge.sqlite \
    AUDIO_MODEL_CACHE_DIR=/opt/whisper-models \
    PATH=/app/.venv-audio/bin:$PATH

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @openai/codex@${CODEX_VERSION}

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web ./web
COPY --from=build /app/scripts/transcribe-audio.py ./scripts/transcribe-audio.py
COPY --from=build /app/scripts/audio-requirements.txt ./scripts/audio-requirements.txt

RUN python3 -m venv /app/.venv-audio \
    && /app/.venv-audio/bin/pip install --no-cache-dir --upgrade pip \
    && /app/.venv-audio/bin/pip install --no-cache-dir -r scripts/audio-requirements.txt \
    && mkdir -p /app/data /opt/whisper-models \
    && case "${AUDIO_MODEL}" in tiny|base|small) ;; *) echo "AUDIO_MODEL inválido: ${AUDIO_MODEL}" >&2; exit 1 ;; esac \
    && AUDIO_MODEL_CACHE_DIR=/opt/whisper-models /app/.venv-audio/bin/python scripts/transcribe-audio.py --model "${AUDIO_MODEL}" --prepare \
    && chown -R node:node /app /opt/whisper-models

RUN mkdir -p /home/node/.codex \
    && chown -R node:node /home/node/.codex

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node --input-type=module -e "const r=await fetch('http://127.0.0.1:'+(process.env.HTTP_PORT||8787)+'/health'); if (!r.ok) process.exit(1)" || exit 1

CMD ["node", "dist/src/main.js"]
