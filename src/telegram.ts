import type { Config } from './config.js';
import type { CodexPreferences, PermissionLevel, ReasoningEffort } from './types.js';

type TelegramUpdate = { update_id: number; message?: { chat: { id: number }; from?: { id: number }; text?: string }; callback_query?: { id: string; data?: string; from: { id: number }; message?: { chat: { id: number }; message_id: number } } };
type ReplyMarkup = { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>>; keyboard?: string[][]; resize_keyboard?: boolean; one_time_keyboard?: boolean };
export class TelegramClient {
  private offset = 0;
  constructor(private readonly config: Config, private readonly onUpdate: (update: TelegramUpdate) => Promise<void>) {}
  async send(chatId: number, text: string, replyMarkup?: ReplyMarkup): Promise<void> {
    for (let index = 0; index < text.length || index === 0; index += 3900) {
      await this.call('sendMessage', { chat_id: chatId, text: text.slice(index, index + 3900), ...(index === 0 && replyMarkup ? { reply_markup: replyMarkup } : {}) });
    }
  }
  async sendProjectMenu(chatId: number, selectedId: string): Promise<void> {
    const rows = this.config.projects.map((project) => [{ text: `${project.id === selectedId ? '✅ ' : ''}${project.name}`, callback_data: `project:${project.id}` }]);
    await this.send(chatId, 'Selecione o projeto que receberá as próximas tarefas:', { inline_keyboard: rows });
  }
  async sendMainMenu(chatId: number): Promise<void> {
    await this.send(chatId, 'Menu principal:', { keyboard: [['Projetos', 'Preferências'], ['Status', 'Resumo'], ['Ajuda']], resize_keyboard: true });
  }
  async sendPreferencesMenu(chatId: number, preferences: CodexPreferences): Promise<void> {
    await this.send(chatId, this.preferencesText(preferences), { inline_keyboard: [[{ text: '🤖 Escolher modelo', callback_data: 'preferences:models' }], [{ text: '🧠 Nível de raciocínio', callback_data: 'preferences:efforts' }], [{ text: '🔐 Nível de permissão', callback_data: 'preferences:permissions' }]] });
  }
  async sendModelMenu(chatId: number, selectedModel?: string): Promise<void> {
    const rows = this.config.codexModels.map((model) => [{ text: model === selectedModel ? `✅ ${model}` : model, callback_data: `preferences:model:${encodeURIComponent(model)}` }]);
    await this.send(chatId, this.config.codexModels.length ? 'Escolha o modelo para as próximas tarefas:' : 'Nenhum modelo foi configurado. Defina CODEX_MODELS_JSON no ambiente.', this.config.codexModels.length ? { inline_keyboard: rows.concat([[{ text: '⬅️ Voltar', callback_data: 'preferences:menu' }]]) } : { inline_keyboard: [[{ text: '⬅️ Voltar', callback_data: 'preferences:menu' }]] });
  }
  async sendEffortMenu(chatId: number, selectedEffort?: ReasoningEffort, selectedModel?: string): Promise<void> {
    const labels: Record<ReasoningEffort, string> = { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto' };
    const rows = this.config.codexReasoningEfforts.map((effort) => [{ text: effort === selectedEffort ? `✅ ${labels[effort]}` : labels[effort], callback_data: `preferences:effort:${effort}` }]);
    await this.send(chatId, `${selectedModel ? `Modelo selecionado: ${selectedModel}\n\n` : ''}Agora escolha o nível de raciocínio para as próximas tarefas:`, { inline_keyboard: rows.concat([[{ text: '⬅️ Voltar', callback_data: 'preferences:menu' }]]) });
  }
  async editPreferencesMenu(chatId: number, messageId: number, preferences: CodexPreferences): Promise<void> {
    await this.editMessage(chatId, messageId, this.preferencesText(preferences), { inline_keyboard: [[{ text: '🤖 Escolher modelo', callback_data: 'preferences:models' }], [{ text: '🧠 Nível de raciocínio', callback_data: 'preferences:efforts' }], [{ text: '🔐 Nível de permissão', callback_data: 'preferences:permissions' }]] });
  }
  async sendPermissionMenu(chatId: number, selected?: PermissionLevel): Promise<void> {
    const labels: Record<PermissionLevel, string> = { safe: 'Seguro: leitura e aprovações', workspace: 'Projeto: escrita no projeto e aprovações', full: 'Total: acesso amplo' };
    const rows = (Object.keys(labels) as PermissionLevel[]).map((level) => [{ text: level === selected ? `✅ ${labels[level]}` : labels[level], callback_data: `preferences:permission:${level}` }]);
    await this.send(chatId, 'Escolha o nível de permissão para as próximas tarefas:\n\nSeguro reduz alterações. Projeto permite trabalhar no diretório selecionado. Total deve ser usado somente quando você aceitar acesso amplo.', { inline_keyboard: rows.concat([[{ text: '⬅️ Voltar', callback_data: 'preferences:menu' }]]) });
  }
  async editMessage(chatId: number, messageId: number, text: string, replyMarkup?: ReplyMarkup): Promise<void> {
    await this.call('editMessageText', { chat_id: chatId, message_id: messageId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
  }
  async sendApproval(chatId: number, text: string, approvalId: string): Promise<void> {
    await this.call('sendMessage', { chat_id: chatId, text, reply_markup: { inline_keyboard: [[{ text: '✅ Aceitar', callback_data: `approval:${approvalId}:accept` }, { text: '❌ Recusar', callback_data: `approval:${approvalId}:decline` }]] } });
  }
  async answerCallback(callbackId: string, text: string): Promise<void> { await this.call('answerCallbackQuery', { callback_query_id: callbackId, text, show_alert: false }); }
  async setCommands(): Promise<void> { await this.call('setMyCommands', { commands: [
    { command: 'start', description: 'Conectar e abrir o menu principal' },
    { command: 'ajuda', description: 'Mostrar todos os comandos' },
    { command: 'projetos', description: 'Listar e selecionar projetos' },
    { command: 'usar', description: 'Selecionar projeto por identificador' },
    { command: 'nova', description: 'Iniciar uma nova sessão' },
    { command: 'preferencias', description: 'Escolher modelo e raciocínio' },
    { command: 'permissoes', description: 'Escolher nível de permissão' },
    { command: 'status', description: 'Ver tarefas e estados' },
    { command: 'fila', description: 'Ver fila do projeto' },
    { command: 'resumo', description: 'Ver resumo da última tarefa' },
    { command: 'sessoes', description: 'Listar sessões' },
    { command: 'retomar', description: 'Retomar uma tarefa ou sessão' },
    { command: 'responder', description: 'Responder pergunta do Codex' },
    { command: 'cancelar', description: 'Interromper tarefa' },
  ] }); }
  async poll(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const updates = await this.call('getUpdates', { offset: this.offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }) as TelegramUpdate[];
        for (const update of updates) { this.offset = update.update_id + 1; await this.onUpdate(update); }
      } catch (error) { if (!signal.aborted) await new Promise((resolve) => setTimeout(resolve, 2000)); }
    }
  }
  private async call(method: string, body: unknown): Promise<any> {
    if (!this.config.telegramToken) throw new Error('Telegram não configurado');
    const response = await fetch(`https://api.telegram.org/bot${this.config.telegramToken}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json() as { ok: boolean; result?: unknown; description?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram ${method} falhou`);
    return payload.result;
  }
  private preferencesText(preferences: CodexPreferences): string {
    const model = preferences.model || this.config.codexModel || 'padrão do Codex';
    const effort = preferences.effort ? ({ low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'muito alto' } as Record<ReasoningEffort, string>)[preferences.effort] : 'padrão do Codex';
    const permission = ({ safe: 'seguro', workspace: 'projeto', full: 'total' } as Record<PermissionLevel, string>)[preferences.permissionLevel || 'workspace'];
    return `⚙️ Preferências do Codex\n\nModelo: ${model}\nNível de raciocínio: ${effort}\nNível de permissão: ${permission}\n\nEssas opções serão aplicadas às próximas tarefas.`;
  }
}
export type { ReplyMarkup, TelegramUpdate };
