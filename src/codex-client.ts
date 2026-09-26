import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { BridgeEvent, CodexPreferences } from './types.js';

type Pending = { resolve: (value: any) => void; reject: (reason: Error) => void };
type ApprovalHandler = (requestId: number | string, method: string, params: unknown) => void;

export type SessionStartResult = { threadId: string; recoveredFromWriterConflict: boolean };

export function isThreadWriterConflict(error: unknown): boolean {
  return /thread-store conflict|active writer/i.test(error instanceof Error ? error.message : String(error));
}

export class CodexClient {
  private process?: ChildProcess;
  private sequence = 0;
  private readonly pending = new Map<number, Pending>();
  private approvalHandler?: ApprovalHandler;
  private readonly agentBuffers = new Map<string, string>();
  constructor(private readonly command: string, private readonly onEvent: (event: BridgeEvent) => void) {}
  onApproval(handler: ApprovalHandler): void { this.approvalHandler = handler; }
  async connect(): Promise<void> {
    if (this.process) return;
    const process = spawn(this.command, ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.process = process;
    process.once('error', (error) => this.handleProcessExit(process, `não foi possível iniciar o processo: ${error.message}`));
    process.once('exit', (code, signal) => this.handleProcessExit(process, `processo encerrado (código ${code ?? 'nulo'}, sinal ${signal ?? 'nenhum'})`));
    if (!process.stdout || !process.stdin) throw new Error('Não foi possível abrir o transporte stdio do Codex');
    const lines = createInterface({ input: process.stdout });
    lines.on('line', (line) => this.handle(JSON.parse(line)));
    await this.request('initialize', { clientInfo: { name: 'codex-telegram-bridge', title: 'Codex Telegram Bridge', version: '0.1.0' } });
    this.send({ method: 'initialized', params: {} });
  }
  async startOrResume(threadId: string | undefined, cwd: string, model?: string): Promise<SessionStartResult> {
    await this.connect();
    if (!threadId) {
      const result = await this.request('thread/start', { cwd, ...(model ? { model } : {}), serviceName: 'codex-telegram-bridge' });
      return { threadId: result.thread.id as string, recoveredFromWriterConflict: false };
    }

    try {
      const result = await this.request('thread/resume', { threadId });
      return { threadId: result.thread.id as string, recoveredFromWriterConflict: false };
    } catch (error) {
      if (!isThreadWriterConflict(error)) throw error;
      // Um escritor órfão ou outra sessão pode manter a thread bloqueada. A
      // sessão antiga continua preservada no histórico; apenas criamos uma
      // conversa nova para não bloquear a próxima tarefa.
      this.onEvent({ type: 'status', text: `Sessão ${threadId} indisponível por conflito de escritor; iniciando uma nova sessão.` });
      const result = await this.request('thread/start', { cwd, ...(model ? { model } : {}), serviceName: 'codex-telegram-bridge' });
      return { threadId: result.thread.id as string, recoveredFromWriterConflict: true };
    }
  }
  async turn(threadId: string, text: string, preferences?: CodexPreferences, cwd?: string): Promise<void> {
    await this.connect();
    const permission = preferences?.permissionLevel || 'workspace';
    const approvalPolicy = permission === 'safe' ? 'untrusted' : permission === 'full' ? 'never' : 'on-request';
    const sandboxPolicy = permission === 'safe'
      ? { type: 'readOnly', networkAccess: false }
      : permission === 'full'
        ? { type: 'dangerFullAccess' }
        : { type: 'workspaceWrite', writableRoots: cwd ? [cwd] : [], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false };
    await this.request('turn/start', { threadId, input: [{ type: 'text', text }], approvalPolicy, sandboxPolicy, ...(preferences?.model ? { model: preferences.model } : {}), ...(preferences?.effort ? { effort: preferences.effort } : {}) });
  }
  async respond(requestId: number | string, decision: unknown): Promise<void> { this.send({ id: requestId, result: decision }); }
  async interrupt(threadId: string, turnId?: string): Promise<void> { await this.request('turn/interrupt', { threadId, ...(turnId ? { turnId } : {}) }); }
  private request(method: string, params: unknown): Promise<any> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.send({ method, id, params }); });
  }
  private send(message: unknown): void {
    const process = this.process;
    if (!process?.stdin?.writable) throw new Error('Codex App Server não está conectado');
    process.stdin.write(`${JSON.stringify(message)}\n`);
  }
  private handleProcessExit(process: ChildProcess, reason: string): void {
    if (this.process !== process) return;
    this.process = undefined;
    this.agentBuffers.clear();
    const error = new Error(`Codex App Server ${reason}`);
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.onEvent({ type: 'error', text: error.message });
  }
  private handle(message: any): void {
    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)!; this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'Erro do Codex')); else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method && this.approvalHandler) { this.approvalHandler(message.id, message.method, message.params); return; }
    const threadId = message.params?.threadId as string | undefined;
    if (message.method === 'turn/completed') { this.onEvent({ type: 'status', text: 'Execução concluída.', threadId }); return; }
    if (message.method === 'turn/failed') { this.onEvent({ type: 'error', text: 'Execução falhou.', threadId }); return; }
    if (message.method === 'turn/interrupted') { this.onEvent({ type: 'status', text: 'Execução interrompida.', threadId }); return; }
    const visible = visibleAgentMessage(message);
    if (visible) {
      const itemId = visible.itemId || 'active-agent-message';
      if (message.method === 'item/agentMessage/delta' || message.method === 'item/plan/delta') {
        this.agentBuffers.set(itemId, `${this.agentBuffers.get(itemId) || ''}${visible.text}`);
        return;
      }
      const text = visible.itemId && this.agentBuffers.has(itemId) ? this.agentBuffers.get(itemId)! : visible.text;
      this.agentBuffers.delete(itemId);
      this.onEvent({ type: 'text', text, threadId });
    }
  }
}

/** Exibe texto narrativo/plano do agente; comandos, stdout e raciocínio ficam internos. */
export function visibleAgentMessage(message: any): { text: string; itemId?: string } | undefined {
  if (message.method === 'item/agentMessage/delta' || message.method === 'item/plan/delta') {
    const text = message.params?.delta;
    return typeof text === 'string' && text.trim() ? { text, itemId: message.params?.itemId } : undefined;
  }
  if (message.method === 'item/completed' && ['agentMessage', 'plan'].includes(message.params?.item?.type)) {
    const item = message.params.item;
    return typeof item.text === 'string' && item.text.trim() ? { text: item.text, itemId: item.id } : undefined;
  }
  return undefined;
}
