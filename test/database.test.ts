import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../src/database.js';

test('claimUpdate é idempotente e tarefas são persistidas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-telegram-'));
  const db = new Database(join(dir, 'bridge.sqlite'));
  assert.equal(db.claimUpdate(10), true); assert.equal(db.claimUpdate(10), false);
  const id = db.createTask('demo', 'thread-1', 'teste', undefined, ['git-commit']); db.setTaskStatus(id, 'completed');
  assert.deepEqual(db.getTask(id)?.skillNames, ['git-commit']);
  assert.equal((db.status() as any[])[0].status, 'completed');
  db.addApproval('7', id, 'commandExecution/requestApproval', { command: 'npm test' });
  assert.equal(db.getApproval('7')?.taskId, id);
  assert.equal(db.setApprovalStatus('7', 'accepted'), true);
  assert.equal(db.setApprovalStatus('7', 'declined'), false);
  const notificationId = db.enqueueNotification(123, '[20%] Atualização', id);
  assert.equal(db.pendingNotificationCount(123), 1);
  assert.equal(db.pendingNotifications(123)[0].text, '[20%] Atualização');
  db.markNotificationFailed(notificationId, 'timeout');
  assert.equal(db.pendingNotifications(123)[0].attempts, 1);
  db.markNotificationSent(notificationId);
  assert.equal(db.pendingNotificationCount(123), 0);
  db.close(); rmSync(dir, { recursive: true, force: true });
});
