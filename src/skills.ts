import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type SkillInfo = { name: string; description: string };

type ResolvedSkill = SkillInfo & { path: string };

const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export class SkillCatalog {
  constructor(private readonly rootDir: string) {}

  list(): SkillInfo[] {
    if (!existsSync(this.rootDir)) return [];
    return readdirSync(this.rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.readSkill(entry.name))
      .filter((skill): skill is ResolvedSkill => skill !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(({ name, description }) => ({ name, description }));
  }

  resolve(names: string[]): ResolvedSkill[] {
    const available = new Map(this.listWithPaths().map((skill) => [skill.name, skill]));
    return names.map((name) => {
      const skill = available.get(name);
      if (!skill) {
        const suffix = available.size ? ` Disponíveis: ${[...available.keys()].join(', ')}.` : ' Nenhuma skill foi encontrada.';
        throw new Error(`Skill "${name}" não encontrada.${suffix}`);
      }
      return skill;
    });
  }

  buildPrompt(names: string[], command: string): string {
    const skills = this.resolve(names);
    if (!skills.length) return command;
    const instructions = skills.map((skill) => {
      const content = readFileSync(skill.path, 'utf8').trim();
      return `## ${skill.name}\n${content}`;
    }).join('\n\n');
    return [
      'Aplique as skills locais abaixo à tarefa do usuário. Siga as instruções delas durante toda a execução.',
      '',
      instructions,
      '',
      '## Tarefa do usuário',
      command,
    ].join('\n');
  }

  private listWithPaths(): ResolvedSkill[] {
    if (!existsSync(this.rootDir)) return [];
    return readdirSync(this.rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.readSkill(entry.name))
      .filter((skill): skill is ResolvedSkill => skill !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private readSkill(name: string): ResolvedSkill | undefined {
    if (!SKILL_NAME.test(name)) return undefined;
    const directory = join(this.rootDir, name);
    const path = join(directory, 'SKILL.md');
    if (!statSafe(directory)?.isDirectory() || !statSafe(path)?.isFile()) return undefined;
    let content: string;
    try { content = readFileSync(path, 'utf8'); } catch { return undefined; }
    return { name, description: descriptionFrom(content) || 'Skill local disponível para execução.', path };
  }
}

export function parseSkillInvocation(text: string): { skillNames: string[]; command: string } {
  const trimmed = text.trim();
  if (!trimmed.startsWith('@')) return { skillNames: [], command: trimmed };

  const skillNames: string[] = [];
  let remainder = trimmed;
  while (remainder.startsWith('@')) {
    const match = remainder.match(/^@([^\s]+)/);
    if (!match || !SKILL_NAME.test(match[1])) throw new Error('Invocação de skill inválida. Use @nome-da-skill comando.');
    skillNames.push(match[1]);
    remainder = remainder.slice(match[0].length).trimStart();
  }
  if (!remainder) throw new Error(`Informe o comando após ${skillNames.map((name) => `@${name}`).join(' ')}.`);
  return { skillNames, command: remainder };
}

export function formatSkillList(skills: SkillInfo[]): string {
  if (!skills.length) return 'Nenhuma skill disponível. Configure CODEX_SKILLS_DIR apontando para uma pasta que contenha subpastas com SKILL.md.';
  return [
    'Skills disponíveis:',
    '',
    ...skills.map((skill) => `@${skill.name} — ${skill.description}`),
    '',
    'Uso: @nome-da-skill comando',
    'Exemplo: @git-commit prepare um commit convencional para as alterações',
  ].join('\n');
}

function statSafe(path: string): ReturnType<typeof statSync> | undefined {
  try { return statSync(path); } catch { return undefined; }
}

function descriptionFrom(content: string): string | undefined {
  const frontmatter = content.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (frontmatter) return shorten(frontmatter);
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return shorten(heading);
  const paragraph = content.split(/\r?\n/).map((line) => line.trim()).find((line) => line && line !== '---' && !line.startsWith('#'));
  return paragraph ? shorten(paragraph) : undefined;
}

function shorten(value: string): string {
  return value.length > 180 ? `${value.slice(0, 177).trimEnd()}...` : value;
}
