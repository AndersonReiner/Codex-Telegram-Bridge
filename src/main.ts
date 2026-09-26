import { mkdirSync } from 'node:fs';
import { loadConfig, loadDotEnv } from './config.js';
import { Database } from './database.js';
import { CodexClient } from './codex-client.js';
import { TelegramClient, type TelegramUpdate } from './telegram.js';
import { startHttp } from './http.js';
import type { ApprovalDecision, CodexPreferences, PermissionLevel, ReasoningEffort } from './types.js';

loadDotEnv();
const config = loadConfig();
mkdirSync('data', { recursive: true });
const db = new Database(config.dbPath);
const recoveredTasks = db.markRunningTasksUnknown();
if (recoveredTasks > 0) console.warn(`[recovery] ${recoveredTasks} tarefa(s) ficaram indeterminadas; nenhuma foi reexecutada.`);

let telegram: TelegramClient | undefined;
const selectedProjectByChat = new Map<number, string>();
const preferencesByChat = new Map<number, CodexPreferences>();
const lastTaskByChat = new Map<number, number>();
const taskByThread = new Map<string, number>();
const projectSubmissionLocks = new Map<string, Promise<void>>();
function preferencesForChat(chatId: number): CodexPreferences { const cached = preferencesByChat.get(chatId); if (cached) return cached; const stored = db.getPreferences(chatId); preferencesByChat.set(chatId, stored); return stored; }
function savePreferences(chatId: number, preferences: CodexPreferences): void { preferencesByChat.set(chatId, preferences); db.savePreferences(chatId, preferences); }

function taskForThread(threadId: string | undefined): ReturnType<Database['getTask']> {
  if (!threadId) return undefined;
  const taskId = taskByThread.get(threadId);
  const fallback = db.activeTaskByThread(threadId);
  const resolvedId = taskId ?? fallback?.id;
  return resolvedId === undefined ? undefined : db.getTask(resolvedId);
}
async function notifyTask(taskId: number, text: string): Promise<void> {
  const task = db.getTask(taskId);
  if (task?.chatId === undefined || !telegram) return;
  try { await telegram.send(task.chatId, `[${task.projectId} · tarefa ${taskId}] ${text}`); }
  catch (error) { db.addEvent(taskId, 'notification_error', `Telegram indisponível: ${(error as Error).message}`); console.warn(`[telegram] notificação da tarefa ${taskId} não enviada: ${(error as Error).message}`); }
}
async function startTask(taskId: number): Promise<void> { const task = db.getTask(taskId); if (!task) return; const project = config.projects.find((item) => item.id === task.projectId); db.setTaskStatus(taskId, 'running'); taskByThread.set(task.threadId, taskId); await notifyTask(taskId, 'Execução iniciada.'); try { await codex.turn(task.threadId, task.text, task.chatId !== undefined ? preferencesForChat(task.chatId) : undefined, project?.cwd); } catch (error) { db.setTaskStatus(taskId, 'failed'); db.addEvent(taskId, 'error', (error as Error).message); await notifyTask(taskId, `Falha ao iniciar: ${(error as Error).message}`); } }
async function startNext(projectId: string): Promise<void> { const next = db.nextQueued(projectId); if (next) await startTask(next.id); }

const codex = new CodexClient(config.codexCommand, (event) => {
  const task = taskForThread(event.threadId); if (!task || !event.text) return;
  db.addEvent(task.id, event.type, event.text);
  if (event.type === 'status') { db.setTaskStatus(task.id, event.text.includes('interrompida') ? 'interrupted' : 'completed'); void notifyTask(task.id, event.text); void startNext(task.projectId); }
  else if (event.type === 'error') { db.setTaskStatus(task.id, 'failed'); void notifyTask(task.id, event.text); void startNext(task.projectId); }
  else void notifyTask(task.id, event.text);
});
function requestIdValue(id: number | string): number | string { return typeof id === 'number' ? id : (/^\d+$/.test(id) ? Number(id) : id); }

codex.onApproval((id, method, params) => {
  const requestId = String(id); const task = taskForThread((params as any)?.threadId as string | undefined);
  db.addApproval(requestId, task?.id, method, params);
  if (task) { db.setTaskStatus(task.id, 'waiting_user'); db.addEvent(task.id, 'approval', `Aguardando resposta: ${method}`); }
  const chatId = task?.chatId; if (chatId === undefined || !telegram) return;
  if (method === 'commandExecution/requestApproval' || method === 'item/commandExecution/requestApproval' || method === 'fileChange/requestApproval' || method === 'item/fileChange/requestApproval') { const command = typeof (params as any)?.command === 'string' ? `\nComando: ${(params as any).command}` : ''; void telegram.sendApproval(chatId, `Aprovação necessária na tarefa ${task?.id}.${command}`, requestId).catch((error) => console.warn(`[telegram] aprovação não enviada: ${(error as Error).message}`)); }
  else if (method === 'tool/requestUserInput' || method === 'item/tool/requestUserInput') { const questions = ((params as any)?.questions || []) as Array<{ id: string; question: string; options?: Array<{ label: string }> }>; const text = questions.map((q) => `${q.id}: ${q.question}${q.options?.length ? `\nOpções: ${q.options.map((o) => o.label).join(' | ')}` : ''}`).join('\n\n'); void telegram.send(chatId, `O Codex precisa de uma resposta na tarefa ${task?.id}.\n${text}\n\nResponda: /responder ${requestId} <resposta>`).catch((error) => console.warn(`[telegram] pergunta não enviada: ${(error as Error).message}`)); }
  else void telegram.send(chatId, `Solicitação não suportada (${method}). Use /cancelar ${task?.id ?? ''} se necessário.`).catch((error) => console.warn(`[telegram] aviso não enviado: ${(error as Error).message}`));
});

async function submitTask(text: string, projectId?: string, chatId?: number): Promise<{ taskId: number }> {
  const selectedId = projectId || (chatId !== undefined ? selectedProjectByChat.get(chatId) : undefined) || config.projects[0].id;
  const project = config.projects.find((item) => item.id === selectedId); if (!project) throw new Error('Projeto não encontrado.');
  const previous = projectSubmissionLocks.get(project.id) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  projectSubmissionLocks.set(project.id, current);
  await previous;
  try {
    const active = db.activeTask(project.id);
    const preferences = chatId !== undefined ? preferencesForChat(chatId) : undefined;
    const session = active
      ? { threadId: active.threadId, recoveredFromWriterConflict: false }
      : await codex.startOrResume(db.getSession(project.id)?.threadId, project.cwd, preferences?.model || config.codexModel);
    const threadId = session.threadId;
    db.saveSession(project.id, threadId);
    const taskId = db.createTask(project.id, threadId, text, chatId); if (chatId !== undefined) lastTaskByChat.set(chatId, taskId); db.addEvent(taskId, 'input', text);
    if (session.recoveredFromWriterConflict) {
      db.addEvent(taskId, 'status', 'Sessão anterior indisponível por conflito de escritor; uma nova sessão foi criada automaticamente.');
      await notifyTask(taskId, 'A sessão anterior estava bloqueada; uma nova sessão foi criada automaticamente.');
    }
    if (active) { await notifyTask(taskId, `Adicionada à fila atrás da tarefa ${active.id}.`); return { taskId }; }
    await startTask(taskId); return { taskId };
  } finally {
    release();
    if (projectSubmissionLocks.get(project.id) === current) projectSubmissionLocks.delete(project.id);
  }
}

async function handleApprovalCallback(update: TelegramUpdate, chatId: number): Promise<void> {
  const callback = update.callback_query!;
  if (callback.from.id !== config.allowedUserId || (config.allowedChatId !== undefined && chatId !== config.allowedChatId)) { await telegram!.answerCallback(callback.id, 'Acesso não autorizado.'); return; }
  const match = callback.data?.match(/^approval:(.+):(accept|decline)$/); if (!match) { await telegram!.answerCallback(callback.id, 'Ação inválida.'); return; }
  const [, approvalId, action] = match; const approval = db.getApproval(approvalId);
  if (!approval || approval.status !== 'pending') { await telegram!.answerCallback(callback.id, 'Aprovação já respondida ou expirada.'); return; }
  const decision = action as ApprovalDecision; if (!db.setApprovalStatus(approvalId, decision === 'accept' ? 'accepted' : 'declined')) { await telegram!.answerCallback(callback.id, 'Aprovação já respondida.'); return; }
  try { await codex.respond(requestIdValue(approvalId), { decision }); } catch (error) { db.restoreApproval(approvalId); await telegram!.answerCallback(callback.id, `Falha: ${(error as Error).message}`); return; }
  if (approval.taskId !== undefined) { db.setTaskStatus(approval.taskId, decision === 'accept' ? 'running' : 'failed'); db.addEvent(approval.taskId, 'approval', decision === 'accept' ? 'Aprovado pelo Telegram.' : 'Recusado pelo Telegram.'); }
  await telegram!.answerCallback(callback.id, decision === 'accept' ? 'Aprovado.' : 'Recusado.'); await telegram!.send(chatId, `Aprovação ${decision === 'accept' ? 'aceita' : 'recusada'} para a tarefa ${approval.taskId ?? '?'}.`);
}

async function handleProjectCallback(update: TelegramUpdate, chatId: number): Promise<void> {
  const callback = update.callback_query!;
  if (callback.from.id !== config.allowedUserId || (config.allowedChatId !== undefined && chatId !== config.allowedChatId)) { await telegram!.answerCallback(callback.id, 'Acesso não autorizado.'); return; }
  const data = callback.data || '';
  if (data === 'projects:list') { await telegram!.answerCallback(callback.id, 'Escolha um projeto.'); await telegram!.sendProjectMenu(chatId, selectedProjectByChat.get(chatId)!); return; }
  const match = data.match(/^project:(.+)$/);
  if (!match) { await telegram!.answerCallback(callback.id, 'Ação inválida.'); return; }
  const project = config.projects.find((item) => item.id === match[1]);
  if (!project) { await telegram!.answerCallback(callback.id, 'Projeto não encontrado.'); return; }
  selectedProjectByChat.set(chatId, project.id);
  await telegram!.answerCallback(callback.id, `Projeto selecionado: ${project.name}`);
  const messageId = callback.message?.message_id;
  if (messageId !== undefined) await telegram!.editMessage(chatId, messageId, `✅ Projeto selecionado: ${project.name}\n\nDiretório: ${project.cwd}\n\nAs próximas tarefas serão enviadas para este projeto.`, { inline_keyboard: [[{ text: '🔁 Trocar projeto', callback_data: 'projects:list' }]] });
  else await telegram!.send(chatId, `Projeto selecionado: ${project.name}`);
}

async function handlePreferencesCallback(update: TelegramUpdate, chatId: number): Promise<void> {
  const callback = update.callback_query!;
  if (callback.from.id !== config.allowedUserId || (config.allowedChatId !== undefined && chatId !== config.allowedChatId)) { await telegram!.answerCallback(callback.id, 'Acesso não autorizado.'); return; }
  const preferences = preferencesForChat(chatId);
  const data = callback.data || '';
  const messageId = callback.message?.message_id;
  if (data === 'preferences:models') { await telegram!.answerCallback(callback.id, 'Escolha um modelo.'); await telegram!.sendModelMenu(chatId, preferences.model || config.codexModel); return; }
  if (data === 'preferences:efforts') { await telegram!.answerCallback(callback.id, 'Escolha o nível de raciocínio.'); await telegram!.sendEffortMenu(chatId, preferences.effort); return; }
  if (data === 'preferences:permissions') { await telegram!.answerCallback(callback.id, 'Escolha o nível de permissão.'); await telegram!.sendPermissionMenu(chatId, preferences.permissionLevel || 'workspace'); return; }
  if (data === 'preferences:menu') { await telegram!.answerCallback(callback.id, 'Preferências abertas.'); if (messageId !== undefined) await telegram!.editPreferencesMenu(chatId, messageId, preferences); else await telegram!.sendPreferencesMenu(chatId, preferences); return; }
  const modelMatch = data.match(/^preferences:model:(.+)$/);
  if (modelMatch) {
    const model = decodeURIComponent(modelMatch[1]);
    if (!config.codexModels.includes(model)) { await telegram!.answerCallback(callback.id, 'Modelo não disponível.'); return; }
    const next = { ...preferences, model }; savePreferences(chatId, next); await telegram!.answerCallback(callback.id, `Modelo selecionado: ${model}`); await telegram!.sendEffortMenu(chatId, next.effort, model); return;
  }
  const effortMatch = data.match(/^preferences:effort:(low|medium|high|xhigh)$/);
  if (effortMatch) {
    const effort = effortMatch[1] as ReasoningEffort;
    if (!config.codexReasoningEfforts.includes(effort)) { await telegram!.answerCallback(callback.id, 'Nível não disponível.'); return; }
    const next = { ...preferences, effort }; savePreferences(chatId, next); await telegram!.answerCallback(callback.id, `Nível selecionado: ${effort}`); if (messageId !== undefined) await telegram!.editPreferencesMenu(chatId, messageId, next); await telegram!.send(chatId, `✅ Preferências salvas\n\nModelo: ${next.model || config.codexModel || 'padrão do Codex'}\nNível de raciocínio: ${effort}\nNível de permissão: ${next.permissionLevel || 'workspace'}`); return;
  }
  const permissionMatch = data.match(/^preferences:permission:(safe|workspace|full)$/);
  if (permissionMatch) {
    const permissionLevel = permissionMatch[1] as PermissionLevel;
    const next = { ...preferences, permissionLevel }; savePreferences(chatId, next); await telegram!.answerCallback(callback.id, `Permissão selecionada: ${permissionLevel}`); if (messageId !== undefined) await telegram!.editPreferencesMenu(chatId, messageId, next); await telegram!.send(chatId, `✅ Nível de permissão salvo\n\nModelo: ${next.model || config.codexModel || 'padrão do Codex'}\nNível de raciocínio: ${next.effort || 'padrão do Codex'}\nNível de permissão: ${permissionLevel}`); return;
  }
  await telegram!.answerCallback(callback.id, 'Ação inválida.');
}

async function handleTelegram(update: TelegramUpdate): Promise<void> {
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id; if (chatId === undefined || !telegram) return;
  if (update.callback_query) {
    if (update.callback_query.data?.startsWith('approval:')) await handleApprovalCallback(update, chatId);
    else if (update.callback_query.data?.startsWith('preferences:')) await handlePreferencesCallback(update, chatId);
    else await handleProjectCallback(update, chatId);
    return;
  }
  const message = update.message!; const text = message.text?.trim(); if (!text || !db.claimUpdate(update.update_id)) return;
  if (message.from?.id !== config.allowedUserId || (config.allowedChatId !== undefined && chatId !== config.allowedChatId)) { await telegram.send(chatId, 'Acesso não autorizado.'); return; }
  if (!selectedProjectByChat.has(chatId)) selectedProjectByChat.set(chatId, config.projects[0].id); const selectedId = selectedProjectByChat.get(chatId)!;
  if (text === '/start') { await telegram.send(chatId, 'Codex Telegram Bridge conectado. Use o menu abaixo para selecionar projetos e acompanhar tarefas.'); await telegram.sendMainMenu(chatId); return; }
  if (text === '/projetos' || text === 'Projetos') { await telegram.sendProjectMenu(chatId, selectedId); return; }
  if (text === '/preferencias' || text === 'Preferências') { await telegram.sendPreferencesMenu(chatId, preferencesForChat(chatId)); return; }
  if (text === '/permissoes' || text === 'Permissões') { await telegram.sendPermissionMenu(chatId, preferencesForChat(chatId).permissionLevel || 'workspace'); return; }
  if (text.startsWith('/usar ')) { const id = text.slice(6).trim(); if (!config.projects.some((p) => p.id === id)) { await telegram.send(chatId, 'Projeto não encontrado.'); return; } selectedProjectByChat.set(chatId, id); await telegram.send(chatId, `Projeto selecionado: ${id}`); return; }
  if (text === '/nova') { db.deleteSession(selectedId); await telegram.send(chatId, `Sessão do projeto ${selectedId} removida. A próxima tarefa iniciará uma nova sessão.`); return; }
  if (text === '/status' || text === 'Status') { await telegram.send(chatId, JSON.stringify(db.tasks(selectedId), null, 2)); return; }
  if (text === '/fila') { const tasks = (db.tasks(selectedId) as any[]).filter((task) => ['queued', 'waiting_user', 'unknown'].includes(task.status)); await telegram.send(chatId, tasks.length ? JSON.stringify(tasks, null, 2) : 'Fila vazia.'); return; }
  if (text === '/sessoes') { await telegram.send(chatId, JSON.stringify(db.sessions(selectedId), null, 2)); return; }
  if (text.startsWith('/retomar ')) { const id = Number(text.slice(9)); const task = Number.isInteger(id) ? db.getTask(id) : undefined; if (!task || task.projectId !== selectedId) { await telegram.send(chatId, 'Tarefa não encontrada neste projeto.'); return; } db.saveSession(selectedId, task.threadId); lastTaskByChat.set(chatId, task.id); await telegram.send(chatId, `Sessão da tarefa ${task.id} selecionada. Estado: ${task.status}.`); return; }
  if (text === 'Resumo' || text.startsWith('/resumo')) { const match = text.match(/^\/resumo(?:\s+(\d+))?$/); const id = match?.[1] ? Number(match[1]) : lastTaskByChat.get(chatId); const summary = id ? db.taskSummary(id) : undefined; if (!summary) { await telegram.send(chatId, 'Nenhuma tarefa para resumir.'); return; } const task = summary.task as any; const events = (summary.events as any[]).filter((event) => ['input', 'text', 'status', 'error', 'approval'].includes(event.kind)).slice(-10); await telegram.send(chatId, `TAREFA ${task.id}\nPROJETO: ${task.projectId}\nESTADO: ${task.status}\n\nOBJETIVO\n${task.text}\n\nEVENTOS\n${events.map((event) => `• ${event.text}`).join('\n') || 'Nenhum evento.'}`); return; }
  if (text.startsWith('/cancelar ')) { const id = Number(text.slice(10)); const task = Number.isInteger(id) ? db.getTask(id) : undefined; if (!task || !['running', 'waiting_user'].includes(task.status)) { await telegram.send(chatId, 'Tarefa não encontrada ou não está executando.'); return; } try { await codex.interrupt(task.threadId); db.setTaskStatus(task.id, 'interrupted'); await telegram.send(chatId, `Interrupção solicitada para a tarefa ${task.id}.`); } catch (error) { await telegram.send(chatId, `Falha ao interromper: ${(error as Error).message}`); } return; }
  if (text.startsWith('/responder ')) { const parts = text.slice(11).trim().split(/\s+/); const id = parts.shift(); const answer = parts.join(' '); const approval = id ? db.getApproval(id) : undefined; if (!approval || approval.status !== 'pending' || !['tool/requestUserInput', 'item/tool/requestUserInput'].includes(approval.method) || !answer) { await telegram.send(chatId, 'Resposta inválida. Use /responder <id> <resposta>.'); return; } const params = JSON.parse(approval.params) as any; const questionId = params.questions?.[0]?.id; if (!questionId || !db.setApprovalStatus(approval.id, 'accepted')) { await telegram.send(chatId, 'Essa pergunta já foi respondida.'); return; } try { await codex.respond(requestIdValue(approval.id), { answers: { [questionId]: { answers: [answer] } } }); if (approval.taskId) db.setTaskStatus(approval.taskId, 'running'); await telegram.send(chatId, 'Resposta encaminhada ao Codex.'); } catch (error) { await telegram.send(chatId, `Falha ao responder: ${(error as Error).message}`); } return; }
  if (text === '/ajuda' || text === 'Ajuda') { await telegram.send(chatId, '/start — conectar e abrir menu\n/projetos — escolher projeto pelos botões\n/usar <id> — compatibilidade por texto\n/nova — iniciar nova sessão\n/preferencias — escolher modelo e raciocínio\n/permissoes — escolher nível de permissão\n/status — ver tarefas e estados\n/fila — ver fila do projeto\n/sessoes — listar sessões\n/retomar <taskId> — retomar sessão\n/resumo [taskId] — resumir tarefa\n/responder <id> <resposta> — responder ao Codex\n/cancelar <taskId> — interromper tarefa\nEnvie texto livre para controlar o Codex.'); return; }
  try { await submitTask(text, selectedId, chatId); } catch (error) { await telegram.send(chatId, `Não foi possível iniciar: ${(error as Error).message}`); }
}

if (config.telegramToken && config.allowedUserId !== undefined) { telegram = new TelegramClient(config, handleTelegram); await telegram.setCommands().catch((error) => console.warn(`[telegram] não foi possível registrar comandos: ${(error as Error).message}`)); }
const http = startHttp(config, db, (text, projectId) => submitTask(text, projectId));
const controller = new AbortController(); process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
console.log(`Codex Telegram Bridge ativo em http://${config.httpHost}:${config.httpPort}${telegram ? ' (Telegram controlador habilitado)' : ' (Telegram não configurado)'}`);
try {
  if (telegram) await telegram.poll(controller.signal); else await new Promise<void>((resolve) => controller.signal.addEventListener('abort', () => resolve(), { once: true }));
} finally {
  http.close();
  codex.close();
  db.close();
}
