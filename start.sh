#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${PROJECT_DIR}/data"
LOG_FILE="${BRIDGE_LOG_FILE:-${LOG_DIR}/start.log}"
LOCK_FILE="${BRIDGE_LOCK_FILE:-${LOG_DIR}/bridge.lock}"
LOG_PARENT="$(dirname -- "${LOG_FILE}")"
SHUTDOWN_TIMEOUT="${BRIDGE_SHUTDOWN_TIMEOUT:-30}"
APP_PID=""
STOPPING=0

mkdir -p "${LOG_DIR}" "${LOG_PARENT}"
touch "${LOG_FILE}"
exec 9>"${LOCK_FILE}"

log() {
  local message="$*"
  printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "${message}" | tee -a "${LOG_FILE}"
}

if ! command -v flock >/dev/null 2>&1; then
  log "ERRO: o utilitário flock não foi encontrado; não é seguro iniciar o serviço sem proteção contra instâncias duplicadas."
  exit 1
fi

if ! flock -n 9; then
  log "ERRO: outra instância do Codex Telegram Bridge já está em execução (lock: ${LOCK_FILE})."
  exit 1
fi

shutdown() {
  local signal="$1"
  local exit_code="$2"
  local elapsed=0

  if (( STOPPING == 1 )); then
    return
  fi
  STOPPING=1
  trap - INT TERM HUP

  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    log "Sinal ${signal} recebido; encerrando a aplicação (PID ${APP_PID})."
    kill "-${signal}" "${APP_PID}" 2>/dev/null || true

    while kill -0 "${APP_PID}" 2>/dev/null && (( elapsed < SHUTDOWN_TIMEOUT )); do
      sleep 1
      ((elapsed += 1))
    done

    if kill -0 "${APP_PID}" 2>/dev/null; then
      log "A aplicação não encerrou em ${SHUTDOWN_TIMEOUT}s; enviando SIGKILL."
      kill -KILL "${APP_PID}" 2>/dev/null || true
    fi

    wait "${APP_PID}" 2>/dev/null || true
  fi

  APP_PID=""
  log "Aplicação finalizada."
  exit "${exit_code}"
}

trap 'shutdown INT 130' INT
trap 'shutdown TERM 143' TERM
trap 'shutdown HUP 129' HUP

if [[ ! "${SHUTDOWN_TIMEOUT}" =~ ^[0-9]+$ ]]; then
  log "ERRO: BRIDGE_SHUTDOWN_TIMEOUT deve ser um número inteiro em segundos."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  log "ERRO: Node.js não foi encontrado no PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  log "ERRO: npm não foi encontrado no PATH."
  exit 1
fi

cd "${PROJECT_DIR}"

log "Iniciando Codex Telegram Bridge."
log "Diretório do projeto: ${PROJECT_DIR}"
log "Arquivo de log: ${LOG_FILE}"

if [[ ! -f "${PROJECT_DIR}/.env" ]]; then
  log "AVISO: .env não encontrado; serão usadas apenas as variáveis do ambiente."
fi

log "Compilando a aplicação."
if ! npm run build 2>&1 | tee -a "${LOG_FILE}"; then
  log "ERRO: a compilação falhou."
  exit 1
fi

log "Compilação concluída; iniciando o serviço. Pressione Ctrl+C para encerrar."
node "${PROJECT_DIR}/dist/src/main.js" > >(tee -a "${LOG_FILE}") 2>&1 &
APP_PID=$!
log "Aplicação iniciada com PID ${APP_PID}."

if wait "${APP_PID}"; then
  APP_STATUS=0
else
  APP_STATUS=$?
fi
APP_PID=""

if (( APP_STATUS == 0 )); then
  log "Aplicação encerrada normalmente."
else
  log "Aplicação encerrada com código ${APP_STATUS}."
fi

exit "${APP_STATUS}"
