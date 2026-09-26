import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleAgentMessage } from '../src/codex-client.js';

test('exibe somente mensagens narrativas do agente', () => {
  assert.equal(visibleAgentMessage({ method: 'item/agentMessage/delta', params: { delta: 'Configurando a rede...' } })?.text, 'Configurando a rede...');
  assert.equal(visibleAgentMessage({ method: 'item/plan/delta', params: { delta: 'Etapa 1' } })?.text, 'Etapa 1');
  assert.equal(visibleAgentMessage({ method: 'item/commandExecution/outputDelta', params: { delta: 'mkdir -p src' } }), undefined);
  assert.equal(visibleAgentMessage({ method: 'item/completed', params: { item: { type: 'commandExecution', text: 'ls -la' } } }), undefined);
  assert.equal(visibleAgentMessage({ method: 'reasoning/summaryTextDelta', params: { delta: 'raciocínio interno' } }), undefined);
});
