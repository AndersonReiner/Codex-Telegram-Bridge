import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const logPath = join(root, 'data', 'supervisor.log');
const restartDelayMs = Number(process.env.BRIDGE_RESTART_DELAY_MS || 3000);
let stopping = false;
let child;

mkdirSync(join(root, 'data'), { recursive: true });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  appendFileSync(logPath, line);
  process.stdout.write(line);
}

function launch() {
  if (stopping) return;
  log('iniciando dist/src/main.js');
  child = spawn(process.execPath, [join(root, 'dist', 'src', 'main.js')], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  child.once('error', (error) => log(`falha ao iniciar filho: ${error.message}`));
  child.once('exit', (code, signal) => {
    child = undefined;
    log(`filho encerrado code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    if (!stopping) {
      log(`reinício automático em ${restartDelayMs}ms`);
      setTimeout(launch, restartDelayMs);
    }
  });
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  log(`supervisor recebendo ${signal}`);
  if (child) child.kill(signal);
  else process.exit(0);
}

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
process.on('uncaughtException', (error) => log(`erro do supervisor: ${error.stack || error.message}`));
process.on('unhandledRejection', (error) => log(`rejeição no supervisor: ${error instanceof Error ? error.stack || error.message : String(error)}`));

log('supervisor ativo');
launch();
