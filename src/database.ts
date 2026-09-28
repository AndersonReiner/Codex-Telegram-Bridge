import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CodexPreferences, ReasoningEffort, TaskStatus } from './types.js';

export class Database {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS updates (update_id INTEGER PRIMARY KEY, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS sessions (project_id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, thread_id TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at TEXT, skill_names TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, kind TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, task_id INTEGER, method TEXT NOT NULL, params TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, task_id INTEGER, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT);
      CREATE TABLE IF NOT EXISTS preferences (chat_id INTEGER PRIMARY KEY, model TEXT, effort TEXT, permission_level TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
    try { this.db.exec('ALTER TABLE tasks ADD COLUMN chat_id INTEGER'); } catch { /* banco já atualizado */ }
    try { this.db.exec("ALTER TABLE tasks ADD COLUMN skill_names TEXT NOT NULL DEFAULT '[]'"); } catch { /* banco já atualizado */ }
    try { this.db.exec('ALTER TABLE preferences ADD COLUMN permission_level TEXT'); } catch { /* banco já atualizado */ }
  }
  claimUpdate(id: number): boolean { return this.db.prepare('INSERT OR IGNORE INTO updates(update_id) VALUES (?)').run(id).changes === 1; }
  getSession(projectId: string): { threadId: string } | undefined { return this.db.prepare('SELECT thread_id as threadId FROM sessions WHERE project_id = ?').get(projectId) as { threadId: string } | undefined; }
  getPreferences(chatId: number): CodexPreferences { const row = this.db.prepare('SELECT model, effort, permission_level as permissionLevel FROM preferences WHERE chat_id = ?').get(chatId) as { model?: string; effort?: ReasoningEffort; permissionLevel?: CodexPreferences['permissionLevel'] } | undefined; return row ? { model: row.model || undefined, effort: row.effort, permissionLevel: row.permissionLevel } : {}; }
  savePreferences(chatId: number, preferences: CodexPreferences): void { this.db.prepare('INSERT INTO preferences(chat_id, model, effort, permission_level) VALUES (?, ?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET model=excluded.model, effort=excluded.effort, permission_level=excluded.permission_level, updated_at=CURRENT_TIMESTAMP').run(chatId, preferences.model ?? null, preferences.effort ?? null, preferences.permissionLevel ?? null); }
  sessions(projectId: string): unknown[] { return this.db.prepare('SELECT project_id as projectId, thread_id as threadId, updated_at as updatedAt FROM sessions WHERE project_id = ?').all(projectId) as unknown[]; }
  saveSession(projectId: string, threadId: string): void { this.db.prepare('INSERT INTO sessions(project_id, thread_id) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET thread_id=excluded.thread_id, updated_at=CURRENT_TIMESTAMP').run(projectId, threadId); }
  deleteSession(projectId: string): void { this.db.prepare('DELETE FROM sessions WHERE project_id = ?').run(projectId); }
  createTask(projectId: string, threadId: string, text: string, chatId?: number, skillNames: string[] = []): number { return Number(this.db.prepare('INSERT INTO tasks(project_id, thread_id, text, status, chat_id, skill_names) VALUES (?, ?, ?, ?, ?, ?) RETURNING id').get(projectId, threadId, text, 'queued', chatId ?? null, JSON.stringify(skillNames))?.id); }
  setTaskStatus(id: number, status: TaskStatus): void { this.db.prepare('UPDATE tasks SET status = ?, finished_at = CASE WHEN ? IN (\'completed\',\'failed\',\'interrupted\',\'unknown\') THEN CURRENT_TIMESTAMP ELSE finished_at END WHERE id = ?').run(status, status, id); }
  getTask(id: number): { id: number; projectId: string; threadId: string; text: string; status: TaskStatus; chatId?: number; skillNames: string[] } | undefined { const row = this.db.prepare('SELECT id, project_id as projectId, thread_id as threadId, text, status, chat_id as chatId, skill_names as skillNames FROM tasks WHERE id = ?').get(id) as any; return row ? { ...row, chatId: row.chatId ?? undefined, skillNames: parseSkillNames(row.skillNames) } : undefined; }
  activeTask(projectId: string): { id: number; threadId: string; status: TaskStatus; chatId?: number } | undefined { const row = this.db.prepare("SELECT id, thread_id as threadId, status, chat_id as chatId FROM tasks WHERE project_id = ? AND status IN ('queued', 'running', 'waiting_user') ORDER BY id ASC LIMIT 1").get(projectId) as any; return row ? { ...row, chatId: row.chatId ?? undefined } : undefined; }
  activeTaskByThread(threadId: string): ReturnType<Database['activeTask']> { const row = this.db.prepare("SELECT id, thread_id as threadId, status, chat_id as chatId FROM tasks WHERE thread_id = ? AND status IN ('queued', 'running', 'waiting_user') ORDER BY id DESC LIMIT 1").get(threadId) as any; return row ? { ...row, chatId: row.chatId ?? undefined } : undefined; }
  nextQueued(projectId: string): { id: number; threadId: string; status: TaskStatus; chatId?: number } | undefined { const row = this.db.prepare("SELECT id, thread_id as threadId, status, chat_id as chatId FROM tasks WHERE project_id = ? AND status = 'queued' ORDER BY id ASC LIMIT 1").get(projectId) as any; return row ? { ...row, chatId: row.chatId ?? undefined } : undefined; }
  tasks(projectId?: string): unknown[] { const rows = (projectId ? this.db.prepare('SELECT id, project_id as projectId, thread_id as threadId, text, status, chat_id as chatId, skill_names as skillNames, created_at as createdAt, finished_at as finishedAt FROM tasks WHERE project_id = ? ORDER BY id DESC LIMIT 50').all(projectId) : this.db.prepare('SELECT id, project_id as projectId, thread_id as threadId, text, status, chat_id as chatId, skill_names as skillNames, created_at as createdAt, finished_at as finishedAt FROM tasks ORDER BY id DESC LIMIT 50').all()) as any[]; return rows.map((row) => ({ ...row, chatId: row.chatId ?? undefined, skillNames: parseSkillNames(row.skillNames) })); }
  taskSummary(taskId: number): { task: unknown; events: unknown[]; approvals: unknown[] } | undefined {
    const task = this.getTask(taskId); if (!task) return undefined;
    const events = this.events(taskId);
    const approvals = this.db.prepare('SELECT id, method, status, created_at as createdAt FROM approvals WHERE task_id = ? ORDER BY created_at DESC').all(taskId) as unknown[];
    return { task, events: events as unknown[], approvals };
  }
  markRunningTasksUnknown(): number { return Number(this.db.prepare("UPDATE tasks SET status = 'unknown', finished_at = CURRENT_TIMESTAMP WHERE status IN ('queued', 'running', 'waiting_user')").run().changes); }
  addEvent(taskId: number | undefined, kind: string, text: string): void { this.db.prepare('INSERT INTO events(task_id, kind, text) VALUES (?, ?, ?)').run(taskId ?? null, kind, text); }
  enqueueNotification(chatId: number, text: string, taskId?: number): number { return Number(this.db.prepare('INSERT INTO notifications(chat_id, task_id, text) VALUES (?, ?, ?) RETURNING id').get(chatId, taskId ?? null, text)?.id); }
  pendingNotifications(chatId: number): Array<{ id: number; taskId?: number; text: string; attempts: number }> { const rows = this.db.prepare("SELECT id, task_id as taskId, text, attempts FROM notifications WHERE chat_id = ? AND status = 'pending' ORDER BY id ASC").all(chatId) as Array<{ id: number; taskId: number | null; text: string; attempts: number }>; return rows.map((row) => ({ ...row, taskId: row.taskId ?? undefined })); }
  markNotificationSent(id: number): void { this.db.prepare("UPDATE notifications SET status = 'sent', sent_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?").run(id); }
  markNotificationFailed(id: number, error: string): void { this.db.prepare("UPDATE notifications SET attempts = attempts + 1, last_error = ? WHERE id = ? AND status = 'pending'").run(error, id); }
  pendingNotificationCount(chatId?: number): number { return Number(chatId === undefined ? this.db.prepare("SELECT COUNT(*) as count FROM notifications WHERE status = 'pending'").get()?.count : this.db.prepare("SELECT COUNT(*) as count FROM notifications WHERE chat_id = ? AND status = 'pending'").get(chatId)?.count); }
  addApproval(id: string, taskId: number | undefined, method: string, params: unknown): void { this.db.prepare('INSERT OR REPLACE INTO approvals(id, task_id, method, params, status) VALUES (?, ?, ?, ?, \'pending\')').run(id, taskId ?? null, method, JSON.stringify(params)); }
  setApprovalStatus(id: string, status: 'accepted' | 'declined' | 'expired'): boolean { return this.db.prepare('UPDATE approvals SET status = ? WHERE id = ? AND status = \'pending\'').run(status, id).changes === 1; }
  restoreApproval(id: string): void { this.db.prepare("UPDATE approvals SET status = 'pending' WHERE id = ? AND status = 'accepted'").run(id); }
  getApproval(id: string): { id: string; taskId?: number; method: string; params: string; status: string } | undefined {
    const row = this.db.prepare('SELECT id, task_id as taskId, method, params, status FROM approvals WHERE id = ?').get(id) as { id: string; taskId: number | null; method: string; params: string; status: string } | undefined;
    return row ? { ...row, taskId: row.taskId ?? undefined } : undefined;
  }
  status(): unknown { return this.db.prepare('SELECT id, project_id as projectId, text, status, created_at as createdAt FROM tasks ORDER BY id DESC LIMIT 20').all(); }
  events(taskId?: number): unknown { return taskId === undefined ? this.db.prepare('SELECT id, task_id as taskId, kind, text, created_at as createdAt FROM events ORDER BY id DESC LIMIT 100').all() : this.db.prepare('SELECT id, task_id as taskId, kind, text, created_at as createdAt FROM events WHERE task_id = ? ORDER BY id ASC').all(taskId); }
  close(): void { this.db.close(); }
}

function parseSkillNames(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch { return []; }
}
