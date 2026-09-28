import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, resolve, sep } from 'node:path';
import type { Config } from './config.js';
import type { Database } from './database.js';
import { openApiDocument } from './openapi.js';
import { settingsSchema, settingsSnapshot, validateSettingsDraft } from './settings.js';

const require = createRequire(import.meta.url);
const swaggerUiDirectory = (require('swagger-ui-dist') as { getAbsoluteFSPath: () => string }).getAbsoluteFSPath();

export type CommandHandler = (text: string, projectId?: string) => Promise<{ taskId: number }>;

export function startHttp(config: Config, db: Database, onCommand?: CommandHandler): ReturnType<typeof createServer> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url || '/', `http://${config.httpHost}`).pathname;
    if (request.method === 'GET' && pathname === '/') { serveStatic('index.html', response); return; }
    if (request.method === 'GET' && pathname === '/hello-world') { serveStatic('hello-world.html', response); return; }
    if (request.method === 'GET' && pathname === '/app.js') { serveStatic('app.js', response); return; }
    if (request.method === 'GET' && pathname === '/styles.css') { serveStatic('styles.css', response); return; }
    if (request.method === 'GET' && pathname === '/configuracoes') { serveStatic('configuracoes.html', response); return; }
    if (request.method === 'GET' && pathname === '/configuracoes.js') { serveStatic('configuracoes.js', response); return; }
    if (request.method === 'GET' && pathname === '/configuracoes.css') { serveStatic('configuracoes.css', response); return; }
    if (request.method === 'GET' && (pathname === '/docs' || pathname === '/docs/')) { serveSwaggerUi(response); return; }
    if (request.method === 'GET' && pathname === '/openapi.json') { sendJson(response, openApiDocument); return; }
    if (request.method === 'GET' && pathname.startsWith('/docs/')) { serveSwaggerAsset(pathname.slice('/docs/'.length), response); return; }
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    if (request.method === 'GET' && request.url === '/health') { response.end(JSON.stringify({ status: 'ok' })); return; }
    if (request.method === 'GET' && request.url === '/status') { response.end(JSON.stringify({ status: 'ok', tasks: db.status() })); return; }
    if (request.method === 'GET' && pathname === '/events') {
      const taskId = new URL(request.url || '/', `http://${config.httpHost}`).searchParams.get('taskId');
      const parsedTaskId = taskId && /^\d+$/.test(taskId) ? Number(taskId) : undefined;
      response.end(JSON.stringify({ events: db.events(parsedTaskId) })); return;
    }
    if (request.method === 'GET' && pathname === '/projects') { response.end(JSON.stringify({ projects: config.projects })); return; }
    if (request.method === 'GET' && pathname === '/api/settings/schema') { response.end(JSON.stringify(settingsSchema())); return; }
    if (request.method === 'GET' && pathname === '/api/settings') { response.end(JSON.stringify(settingsSnapshot(config))); return; }
    if (request.method === 'POST' && pathname === '/api/settings/validate') { void handleSettingsValidation(request, response); return; }
    if (request.method === 'POST' && pathname === '/commands') { void handleCommand(request, response, onCommand); return; }
    response.statusCode = 404; response.end(JSON.stringify({ error: 'not_found' }));
  });
  server.listen(config.httpPort, config.httpHost);
  return server;
}

function serveSwaggerUi(response: import('node:http').ServerResponse): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.setHeader('cache-control', 'no-cache');
  response.end(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Codex Telegram Bridge API</title>
    <link rel="stylesheet" href="/docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout'
      });
    </script>
  </body>
</html>`);
}

function serveSwaggerAsset(name: string, response: import('node:http').ServerResponse): void {
  if (!name || name.includes('/') || name.includes('\\')) { response.statusCode = 404; response.end('Not found'); return; }
  const root = resolve(swaggerUiDirectory);
  const path = resolve(root, name);
  if (!path.startsWith(`${root}${sep}`) || !existsSync(path) || !statSync(path).isFile()) { response.statusCode = 404; response.end('Not found'); return; }
  response.setHeader('cache-control', 'public, max-age=3600');
  response.setHeader('content-type', swaggerContentType(path));
  createReadStream(path).pipe(response);
}

function sendJson(response: import('node:http').ServerResponse, value: unknown): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(value));
}

async function handleSettingsValidation(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse): Promise<void> {
  try {
    const draft = await readBody(request);
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('O rascunho deve ser um objeto JSON.');
    const validation = validateSettingsDraft(draft as Record<string, unknown>);
    response.statusCode = validation.valid ? 200 : 422;
    response.end(JSON.stringify(validation));
  } catch (error) {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: (error as Error).message }));
  }
}

async function handleCommand(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse, onCommand?: CommandHandler): Promise<void> {
  if (!onCommand) { response.statusCode = 503; response.end(JSON.stringify({ error: 'command_handler_unavailable' })); return; }
  try {
    const body = await readBody(request) as { text?: string; projectId?: string };
    if (!body.text?.trim()) { response.statusCode = 400; response.end(JSON.stringify({ error: 'text_required' })); return; }
    const result = await onCommand(body.text.trim(), body.projectId);
    response.statusCode = 202; response.end(JSON.stringify({ accepted: true, ...result }));
  } catch (error) {
    response.statusCode = 400; response.end(JSON.stringify({ error: (error as Error).message }));
  }
}

function readBody(request: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let content = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { content += chunk; if (content.length > 100_000) reject(new Error('Corpo da requisição muito grande')); });
    request.on('end', () => { try { resolve(JSON.parse(content || '{}')); } catch { reject(new Error('JSON inválido')); } });
    request.on('error', reject);
  });
}

function serveStatic(name: string, response: import('node:http').ServerResponse): void {
  const directory = ['configuracoes.js', 'configuracoes.css'].includes(name) ? 'dist/settings' : 'web';
  const path = join(process.cwd(), directory, name);
  if (!existsSync(path)) { response.statusCode = 404; response.end('Not found'); return; }
  const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  response.setHeader('content-type', types[extname(path)] || 'application/octet-stream');
  response.setHeader('cache-control', 'no-cache');
  createReadStream(path).pipe(response);
}

function swaggerContentType(path: string): string {
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
  };
  return types[extname(path)] || 'application/octet-stream';
}
