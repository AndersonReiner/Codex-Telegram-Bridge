import type { Config } from './config.js';

export type SettingDefinition = {
  key: string;
  group: 'telegram' | 'projects' | 'codex' | 'server' | 'startup';
  label: string;
  type: 'secret' | 'number' | 'json' | 'string';
  description: string;
  defaultValue?: string;
  restartRequired: 'bridge' | 'supervisor' | 'launcher';
};

export const SETTINGS_CATALOG: SettingDefinition[] = [
  { key: 'TELEGRAM_BOT_TOKEN', group: 'telegram', label: 'Token do bot', type: 'secret', description: 'Credencial usada para acessar a Bot API.', restartRequired: 'bridge' },
  { key: 'TELEGRAM_ALLOWED_USER_ID', group: 'telegram', label: 'Usuário autorizado', type: 'number', description: 'ID numérico do usuário que pode controlar o bot.', restartRequired: 'bridge' },
  { key: 'TELEGRAM_ALLOWED_CHAT_ID', group: 'telegram', label: 'Chat autorizado', type: 'number', description: 'Restrição opcional para um chat específico.', restartRequired: 'bridge' },
  { key: 'PROJECTS_JSON', group: 'projects', label: 'Projetos', type: 'json', description: 'Lista de projetos com id, nome e diretório de trabalho.', restartRequired: 'bridge' },
  { key: 'CODEX_COMMAND', group: 'codex', label: 'Executável do Codex', type: 'string', description: 'Comando usado para iniciar o Codex App Server.', defaultValue: 'codex', restartRequired: 'bridge' },
  { key: 'CODEX_MODEL', group: 'codex', label: 'Modelo padrão', type: 'string', description: 'Modelo usado quando o chat não escolhe outro.', restartRequired: 'bridge' },
  { key: 'CODEX_MODELS_JSON', group: 'codex', label: 'Modelos disponíveis', type: 'json', description: 'Lista de modelos mostrados nas preferências do Telegram.', defaultValue: '[]', restartRequired: 'bridge' },
  { key: 'CODEX_REASONING_EFFORTS_JSON', group: 'codex', label: 'Níveis de raciocínio', type: 'json', description: 'Níveis permitidos nas preferências do Telegram.', defaultValue: '["low","medium","high"]', restartRequired: 'bridge' },
  { key: 'DB_PATH', group: 'server', label: 'Banco SQLite', type: 'string', description: 'Caminho do arquivo de persistência.', defaultValue: './data/bridge.sqlite', restartRequired: 'bridge' },
  { key: 'HTTP_HOST', group: 'server', label: 'Endereço HTTP', type: 'string', description: 'Endereço onde o painel local escuta.', defaultValue: '127.0.0.1', restartRequired: 'bridge' },
  { key: 'HTTP_PORT', group: 'server', label: 'Porta HTTP', type: 'number', description: 'Porta usada pelo painel e pela API local.', defaultValue: '8787', restartRequired: 'bridge' },
  { key: 'BRIDGE_RESTART_DELAY_MS', group: 'startup', label: 'Atraso do supervisor', type: 'number', description: 'Tempo de espera antes de reiniciar o processo filho.', defaultValue: '3000', restartRequired: 'supervisor' },
  { key: 'BRIDGE_LOG_FILE', group: 'startup', label: 'Arquivo de log', type: 'string', description: 'Arquivo usado pelo launcher start.sh.', defaultValue: './data/start.log', restartRequired: 'launcher' },
  { key: 'BRIDGE_LOCK_FILE', group: 'startup', label: 'Arquivo de lock', type: 'string', description: 'Arquivo que impede duas instâncias do launcher.', defaultValue: './data/bridge.lock', restartRequired: 'launcher' },
  { key: 'BRIDGE_SHUTDOWN_TIMEOUT', group: 'startup', label: 'Prazo de encerramento', type: 'number', description: 'Segundos aguardados pelo launcher antes de forçar o encerramento.', defaultValue: '30', restartRequired: 'launcher' },
];

function envValue(key: string, fallback?: string): string | undefined {
  return process.env[key] || fallback;
}

export function settingsSchema(): { settings: SettingDefinition[]; readOnly: true } {
  return { settings: SETTINGS_CATALOG, readOnly: true };
}

export function settingsSnapshot(config: Config): { settings: Array<SettingDefinition & { configured: boolean; value?: unknown }>; readOnly: true } {
  const values: Record<string, unknown> = {
    TELEGRAM_BOT_TOKEN: { configured: Boolean(config.telegramToken) },
    TELEGRAM_ALLOWED_USER_ID: config.allowedUserId,
    TELEGRAM_ALLOWED_CHAT_ID: config.allowedChatId,
    PROJECTS_JSON: config.projects,
    CODEX_COMMAND: config.codexCommand,
    CODEX_MODEL: config.codexModel,
    CODEX_MODELS_JSON: config.codexModels,
    CODEX_REASONING_EFFORTS_JSON: config.codexReasoningEfforts,
    DB_PATH: config.dbPath,
    HTTP_HOST: config.httpHost,
    HTTP_PORT: config.httpPort,
    BRIDGE_RESTART_DELAY_MS: envValue('BRIDGE_RESTART_DELAY_MS', '3000'),
    BRIDGE_LOG_FILE: envValue('BRIDGE_LOG_FILE', './data/start.log'),
    BRIDGE_LOCK_FILE: envValue('BRIDGE_LOCK_FILE', './data/bridge.lock'),
    BRIDGE_SHUTDOWN_TIMEOUT: envValue('BRIDGE_SHUTDOWN_TIMEOUT', '30'),
  };
  return {
    readOnly: true,
    settings: SETTINGS_CATALOG.map((definition) => ({
      ...definition,
      configured: definition.key === 'TELEGRAM_BOT_TOKEN' ? Boolean(config.telegramToken) : values[definition.key] !== undefined,
      value: values[definition.key],
    })),
  };
}
