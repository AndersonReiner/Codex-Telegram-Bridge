import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillCatalog, formatSkillList, parseSkillInvocation } from '../src/skills.js';

test('skills são descobertas, descritas e carregadas a partir de SKILL.md', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-telegram-skills-'));
  mkdirSync(join(root, 'git-commit'));
  mkdirSync(join(root, 'sem-skill'));
  writeFileSync(join(root, 'git-commit', 'SKILL.md'), '# Versionamento\n\nUse Conventional Commits.');
  const catalog = new SkillCatalog(root);
  assert.deepEqual(catalog.list(), [{ name: 'git-commit', description: 'Versionamento' }]);
  assert.match(formatSkillList(catalog.list()), /@git-commit/);
  assert.match(catalog.buildPrompt(['git-commit'], 'prepare o commit'), /Use Conventional Commits/);
  rmSync(root, { recursive: true, force: true });
});

test('invocação aceita uma ou mais skills apenas no início do comando', () => {
  assert.deepEqual(parseSkillInvocation('@git-commit @swagger-doc documente a API'), { skillNames: ['git-commit', 'swagger-doc'], command: 'documente a API' });
  assert.deepEqual(parseSkillInvocation('texto comum @git-commit'), { skillNames: [], command: 'texto comum @git-commit' });
  assert.throws(() => parseSkillInvocation('@git-commit'), /Informe o comando/);
  assert.throws(() => parseSkillInvocation('@skill/inválida faça'), /invocação.*inválida/i);
});

test('skill desconhecida informa o catálogo disponível', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-telegram-skills-'));
  mkdirSync(join(root, 'git-commit'));
  writeFileSync(join(root, 'git-commit', 'SKILL.md'), '# Versionamento');
  assert.throws(() => new SkillCatalog(root).resolve(['inexistente']), /Disponíveis: git-commit/);
  rmSync(root, { recursive: true, force: true });
});
