import { execFile, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Config } from './config.js';
import type { TelegramClient, TelegramAudio, TelegramUpdate } from './telegram.js';

type Draft = { id: string; text: string; projectId: string; expires: number; editing: boolean };

/** One local transcription at a time; drafts never execute without confirmation. */
export class AudioController {
  private busy = false;
  private closed = false;
  private child?: ChildProcess;
  private drafts = new Map<number, Draft>();
  private expiry = setInterval(() => {
    for (const [chat, draft] of this.drafts) if (draft.expires < Date.now() && !draft.editing) this.drafts.delete(chat);
  }, 60_000).unref();
  constructor(private config: Config, private bot: TelegramClient,
    private submit: (text: string, projectId: string, chatId: number) => Promise<unknown>) {}

  close(): void { this.closed = true; clearInterval(this.expiry); this.drafts.clear(); this.child?.kill('SIGKILL'); }

  async receive(chatId: number, audio: TelegramAudio, projectId: string): Promise<void> {
    if (this.closed) return;
    if (!this.config.audioEnabled) { await this.bot.send(chatId, 'Áudio local desativado. Execute bash scripts/setup-audio.sh e configure AUDIO_ENABLED=true no .env; reinicie o bridge.'); return; }
    if (this.busy) { await this.bot.send(chatId, 'Já existe um áudio em transcrição. Aguarde e envie novamente.'); return; }
    if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > 120 || (audio.file_size ?? 0) > 10 * 1024 * 1024) {
      await this.bot.send(chatId, 'Envie um áudio de até 2 minutos e 10 MB.'); return;
    }
    this.busy = true;
    this.drafts.delete(chatId);
    // Do not block Telegram polling while the CPU is transcribing.
    void this.transcribe(chatId, audio, projectId).catch(() => {
      console.warn('[audio] Não foi possível entregar o resultado no Telegram; envie o áudio novamente.');
    }).finally(() => { this.busy = false; });
  }

  private async transcribe(chatId: number, audio: TelegramAudio, projectId: string): Promise<void> {
    let directory: string | undefined;
    try {
      await this.bot.send(chatId, '🎙️ Transcrevendo localmente… Nenhuma tarefa será iniciada sem sua confirmação.');
      const bytes = await this.bot.downloadAudio(audio.file_id, 10 * 1024 * 1024);
      if (this.closed) return;
      directory = await mkdtemp(join(tmpdir(), 'bridge-audio-'));
      const file = join(directory, 'recording');
      await writeFile(file, bytes, { mode: 0o600 });
      if (this.closed) return;
      const output = await new Promise<string>((resolveOutput, reject) => {
        this.child = execFile(resolve('.venv-audio/bin/python'), [resolve('scripts/transcribe-audio.py'), '--model', this.config.audioModel || 'base', file],
          { timeout: 180_000, killSignal: 'SIGKILL', maxBuffer: 256 * 1024,
            env: { ...process.env, HF_HUB_OFFLINE: '1' } },
          (error, stdout) => { this.child = undefined; if (error) reject(error); else resolveOutput(stdout); });
      });
      const result = JSON.parse(output) as { text?: unknown };
      if (typeof result.text !== 'string' || !result.text.trim()) { await this.bot.send(chatId, 'Não identifiquei fala. Envie outro áudio mais nítido ou escreva a mensagem.'); return; }
      const draft: Draft = { id: randomUUID(), text: result.text.trim(), projectId, expires: Date.now() + 600_000, editing: false };
      this.drafts.set(chatId, draft);
      await this.review(chatId, draft);
    } catch {
      if (this.closed) return;
      this.drafts.delete(chatId);
      await this.bot.send(chatId, 'Não consegui transcrever o áudio. Confira a instalação local (bash scripts/setup-audio.sh), o formato e o limite de 2 minutos. O processamento tem prazo de 3 minutos. Você também pode enviar texto.');
    } finally { if (directory) await rm(directory, { recursive: true, force: true }); }
  }

  private async review(chatId: number, draft: Draft): Promise<void> {
    await this.bot.send(chatId, `Transcrição para o projeto ${draft.projectId}:\n\n${draft.text}`);
    await this.bot.send(chatId, 'Confira o texto antes de enviar ao Codex. Esta revisão expira em 10 minutos.', {
      inline_keyboard: [[{ text: 'Enviar ao Codex', callback_data: `audio:send:${draft.id}` }],
        [{ text: 'Corrigir', callback_data: `audio:edit:${draft.id}` }, { text: 'Cancelar', callback_data: `audio:cancel:${draft.id}` }]],
    });
  }

  async correct(chatId: number, text: string): Promise<boolean> {
    const draft = this.drafts.get(chatId);
    if (!draft?.editing) return false;
    if (draft.expires < Date.now()) { this.drafts.delete(chatId); await this.bot.send(chatId, 'Revisão expirada. Envie o áudio novamente.'); return true; }
    if (text === '/cancelar') { this.drafts.delete(chatId); await this.bot.send(chatId, 'Transcrição cancelada.'); return true; }
    if (text.startsWith('/')) return false;
    draft.id = randomUUID(); draft.text = text; draft.editing = false; draft.expires = Date.now() + 600_000;
    await this.review(chatId, draft);
    return true;
  }

  async callback(update: TelegramUpdate, chatId: number): Promise<void> {
    const callback = update.callback_query!;
    const match = callback.data?.match(/^audio:(send|edit|cancel):([\da-f-]+)$/);
    const draft = this.drafts.get(chatId);
    if (!match || !draft || draft.id !== match[2] || draft.expires < Date.now()) {
      await this.bot.answerCallback(callback.id, 'Transcrição expirada ou já respondida.'); return;
    }
    const action = match[1];
    if (action === 'edit') {
      draft.editing = true;
      await this.bot.answerCallback(callback.id, 'Envie o texto corrigido.');
      await this.bot.send(chatId, 'Escreva a mensagem corrigida completa. Vou mostrá-la novamente para confirmação. Use /cancelar para descartar.'); return;
    }
    if (action === 'send' && draft.editing) { await this.bot.answerCallback(callback.id, 'Envie primeiro o texto corrigido.'); return; }
    // Consume before any asynchronous submission: repeated clicks cannot create two tasks.
    this.drafts.delete(chatId);
    await this.bot.answerCallback(callback.id, action === 'send' ? 'Envio confirmado.' : 'Cancelado.').catch(() => {});
    if (action === 'cancel') { await this.bot.send(chatId, 'Transcrição cancelada.'); return; }
    try { await this.submit(draft.text, draft.projectId, chatId); }
    catch { await this.bot.send(chatId, 'Falha ao encaminhar a transcrição. Consulte /status antes de reenviar para evitar duplicação.'); }
  }
}
