import { readFileSync } from 'node:fs';
import type { Project, ReasoningEffort } from './types.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

export type Config = {
  telegramToken?: string;
  allowedUserId?: number;
  allowedChatId?: number;
  projects: Project[];
  codexCommand: string;
  codexModel?: string;
  codexModels: string[];
  codexReasoningEfforts: ReasoningEffort[];
  dbPath: string;
  httpHost: string;
  httpPort: number;
};

export function loadConfig(): Config {
  const projects = JSON.parse(required('PROJECTS_JSON')) as Project[];
  if (!Array.isArray(projects) || projects.length === 0) throw new Error('PROJECTS_JSON deve conter ao menos um projeto');
  for (const project of projects) {
    if (!project.id || !project.name || !project.cwd) throw new Error('Cada projeto precisa de id, name e cwd');
  }
  const codexModel = process.env.CODEX_MODEL || undefined;
  const configuredModels = process.env.CODEX_MODELS_JSON ? JSON.parse(process.env.CODEX_MODELS_JSON) as unknown : [];
  if (!Array.isArray(configuredModels) || configuredModels.some((model) => typeof model !== 'string' || !model.trim())) throw new Error('CODEX_MODELS_JSON deve ser uma lista de nomes de modelos');
  const codexModels = [...new Set((configuredModels as string[]).map((model) => model.trim()).concat(codexModel ? [codexModel] : []))];
  const configuredEfforts = process.env.CODEX_REASONING_EFFORTS_JSON ? JSON.parse(process.env.CODEX_REASONING_EFFORTS_JSON) as unknown : ['low', 'medium', 'high'];
  if (!Array.isArray(configuredEfforts) || configuredEfforts.some((effort) => !['low', 'medium', 'high', 'xhigh'].includes(String(effort)))) throw new Error('CODEX_REASONING_EFFORTS_JSON contém níveis inválidos');
  return {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
    allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID ? Number(process.env.TELEGRAM_ALLOWED_USER_ID) : undefined,
    allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID ? Number(process.env.TELEGRAM_ALLOWED_CHAT_ID) : undefined,
    projects,
    codexCommand: process.env.CODEX_COMMAND || 'codex',
    codexModel,
    codexModels,
    codexReasoningEfforts: configuredEfforts as ReasoningEffort[],
    dbPath: process.env.DB_PATH || './data/bridge.sqlite',
    httpHost: process.env.HTTP_HOST || '127.0.0.1',
    httpPort: Number(process.env.HTTP_PORT || 8787),
  };
}

export function loadDotEnv(path = '.env'): void {
  try {
    const content = readFileSync(path, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
