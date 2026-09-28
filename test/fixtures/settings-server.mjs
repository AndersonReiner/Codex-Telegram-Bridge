import { Database } from '../../dist/src/database.js';
import { startHttp } from '../../dist/src/http.js';

const db = new Database(':memory:');
const server = startHttp({
  telegramToken: 'fixture-secret-must-never-reach-browser', allowedUserId: 123456789,
  allowedChatId: -1001234567890,
  projects: [{ id: 'bridge', name: 'Codex Telegram Bridge', cwd: '/workspace/bridge' }],
  codexCommand: 'codex', codexModel: 'modelo-demo', codexModels: ['modelo-demo', 'modelo-rapido'],
  codexReasoningEfforts: ['low', 'medium', 'high'], dbPath: './data/bridge.sqlite',
  httpHost: '127.0.0.1', httpPort: 8791,
}, db);
function stop() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
