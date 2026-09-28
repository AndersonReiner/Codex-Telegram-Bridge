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
  { key: 'AUDIO_ENABLED', group: 'telegram', label: 'Transcrição local', type: 'string', description: 'Use true para ativar áudio local após executar scripts/setup-audio.sh; false desativa. Sem API paga.', defaultValue: 'false', restartRequired: 'bridge' },
  { key: 'AUDIO_MODEL', group: 'telegram', label: 'Modelo de áudio local', type: 'string', description: 'tiny, base ou small. Prepare o modelo com scripts/setup-audio.sh antes de selecionar.', defaultValue: 'base', restartRequired: 'bridge' },
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
    AUDIO_ENABLED: String(config.audioEnabled ?? false),
    AUDIO_MODEL: config.audioModel || 'base',
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

export type SettingsDraft = Record<string, unknown>;
export type SettingsValidation = { valid: boolean; errors: Array<{ key: string; message: string }>; warnings: string[] };

const knownKeys = new Set(SETTINGS_CATALOG.map((setting) => setting.key));
const efforts = new Set(['low', 'medium', 'high', 'xhigh']);
function textValue(draft: SettingsDraft, key: string): string | undefined {
  const value = draft[key];
  return value === undefined || value === null ? undefined : String(value).trim();
}
function addJsonError(errors: SettingsValidation['errors'], draft: SettingsDraft, key: string, message: string): unknown {
  const value = draft[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') { errors.push({ key, message: 'Informe JSON como texto.' }); return undefined; }
  try { return JSON.parse(value); } catch { errors.push({ key, message: 'JSON inválido.' }); return undefined; }
}
function positiveInteger(errors: SettingsValidation['errors'], draft: SettingsDraft, key: string, allowZero = false): void {
  const value = textValue(draft, key);
  if (value === undefined || value === '') return;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed < 1)) errors.push({ key, message: allowZero ? 'Informe um inteiro maior ou igual a zero.' : 'Informe um inteiro positivo.' });
}

export function validateSettingsDraft(draft: SettingsDraft): SettingsValidation {
  const errors: SettingsValidation['errors'] = [];
  const warnings: string[] = [];
  for (const key of Object.keys(draft)) if (!knownKeys.has(key)) errors.push({ key, message: 'Parâmetro não reconhecido.' });

  const audioEnabled = textValue(draft, 'AUDIO_ENABLED');
  if (audioEnabled !== undefined && !['true', 'false'].includes(audioEnabled)) errors.push({ key: 'AUDIO_ENABLED', message: 'Use true ou false.' });
  const audioModel = textValue(draft, 'AUDIO_MODEL');
  if (audioModel !== undefined && !['tiny', 'base', 'small'].includes(audioModel)) errors.push({ key: 'AUDIO_MODEL', message: 'Use tiny, base ou small.' });

  const projects = addJsonError(errors, draft, 'PROJECTS_JSON', 'JSON inválido.');
  if (projects !== undefined) {
    if (!Array.isArray(projects) || projects.length === 0) errors.push({ key: 'PROJECTS_JSON', message: 'Informe ao menos um projeto.' });
    else {
      const ids = new Set<string>();
      for (const project of projects) {
        if (!project || typeof project !== 'object' || typeof project.id !== 'string' || typeof project.name !== 'string' || typeof project.cwd !== 'string') errors.push({ key: 'PROJECTS_JSON', message: 'Cada projeto precisa de id, name e cwd.' });
        else {
          if (!project.id.trim() || !project.name.trim() || !project.cwd.trim()) errors.push({ key: 'PROJECTS_JSON', message: 'Projeto não pode ter campos vazios.' });
          if (ids.has(project.id)) errors.push({ key: 'PROJECTS_JSON', message: `ID de projeto duplicado: ${project.id}.` });
          ids.add(project.id);
        }
      }
    }
  }
  const models = addJsonError(errors, draft, 'CODEX_MODELS_JSON', 'JSON inválido.');
  if (models !== undefined && (!Array.isArray(models) || models.some((model) => typeof model !== 'string' || !model.trim()))) errors.push({ key: 'CODEX_MODELS_JSON', message: 'Informe uma lista de nomes de modelos não vazios.' });
  const configuredEfforts = addJsonError(errors, draft, 'CODEX_REASONING_EFFORTS_JSON', 'JSON inválido.');
  if (configuredEfforts !== undefined && (!Array.isArray(configuredEfforts) || configuredEfforts.some((effort) => !efforts.has(String(effort))))) errors.push({ key: 'CODEX_REASONING_EFFORTS_JSON', message: 'Use apenas low, medium, high ou xhigh.' });

  positiveInteger(errors, draft, 'TELEGRAM_ALLOWED_USER_ID');
  const chatId = textValue(draft, 'TELEGRAM_ALLOWED_CHAT_ID');
  if (chatId && (!/^-?\d+$/.test(chatId) || !Number.isSafeInteger(Number(chatId)) || Number(chatId) === 0)) errors.push({ key: 'TELEGRAM_ALLOWED_CHAT_ID', message: 'Informe um ID inteiro não nulo; grupos podem ter ID negativo.' });
  positiveInteger(errors, draft, 'HTTP_PORT');
  if (Number(draft.HTTP_PORT) > 65535) errors.push({ key: 'HTTP_PORT', message: 'A porta deve estar entre 1 e 65535.' });
  positiveInteger(errors, draft, 'BRIDGE_RESTART_DELAY_MS', true);
  positiveInteger(errors, draft, 'BRIDGE_SHUTDOWN_TIMEOUT', true);
  const host = textValue(draft, 'HTTP_HOST');
  if (host === '') errors.push({ key: 'HTTP_HOST', message: 'Informe um endereço HTTP.' });
  if (textValue(draft, 'CODEX_COMMAND') === '') errors.push({ key: 'CODEX_COMMAND', message: 'Informe o executável do Codex.' });
  if (textValue(draft, 'DB_PATH') === '') errors.push({ key: 'DB_PATH', message: 'Informe o caminho do banco.' });
  if (textValue(draft, 'TELEGRAM_BOT_TOKEN') !== undefined && textValue(draft, 'TELEGRAM_BOT_TOKEN') === '') warnings.push('O token vazio remove a configuração do Telegram.');
  return { valid: errors.length === 0, errors, warnings };
}
