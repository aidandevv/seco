import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { getExperience } from '../experience/crud.js';
import type { Experience } from '../experience/types.js';
import { SecoError } from '../errors.js';
import { renderForSurface } from '../render/index.js';

export interface ObsidianVaultExportOptions {
  vaultRoot: string;
  folder?: string;
  filename?: string;
  overwrite?: boolean;
}

export interface ObsidianVaultExport {
  surface: 'obsidian_note';
  output: string;
  path: string;
  relative_path: string;
  overwritten: boolean;
  canonical_store: 'sqlite';
  source_experience_ids: string[];
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith(`~${sep}`)) return resolve(homedir(), path.slice(2));
  return path;
}

function assertInsideVault(vaultRoot: string, targetPath: string): void {
  const rel = relative(vaultRoot, targetPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new SecoError('INVALID_OBSIDIAN_PATH', 'Obsidian export path must stay inside vault_root');
  }
}

function normalizeVaultRoot(vaultRoot: string): string {
  const expanded = expandHome(vaultRoot.trim());
  if (!expanded) {
    throw new SecoError('INVALID_OBSIDIAN_VAULT', 'vault_root is required');
  }
  return resolve(expanded);
}

function normalizeFolder(folder: string | undefined): string {
  if (!folder?.trim()) return 'seco/experiences';
  const normalized = folder.trim();
  if (isAbsolute(normalized)) {
    throw new SecoError('INVALID_OBSIDIAN_PATH', 'folder must be relative to vault_root');
  }
  return normalized;
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function defaultFilename(experiences: Experience[], ids: string[]): string {
  const first = experiences[0];
  const title = slugPart([first.title, first.organization].filter(Boolean).join(' ')) || 'seco-experience';
  const digest = createHash('sha256').update([...ids].sort().join('|')).digest('hex').slice(0, 8);
  return `${title}-${digest}.md`;
}

function normalizeFilename(filename: string | undefined, experiences: Experience[], ids: string[]): string {
  const candidate = filename?.trim() ? filename.trim() : defaultFilename(experiences, ids);
  const leaf = basename(candidate);
  if (leaf !== candidate || leaf === '.' || leaf === '..') {
    throw new SecoError('INVALID_OBSIDIAN_PATH', 'filename must be a Markdown file name, not a path');
  }
  return extname(leaf).toLowerCase() === '.md' ? leaf : `${leaf}.md`;
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as { code?: unknown }).code === code;
}

export async function exportObsidianNoteToVault(
  experienceIds: string[],
  options: ObsidianVaultExportOptions
): Promise<ObsidianVaultExport> {
  if (experienceIds.length === 0) {
    throw new SecoError('NO_EXPERIENCES', 'At least one experience_id is required');
  }

  const vaultRoot = normalizeVaultRoot(options.vaultRoot);
  const folder = normalizeFolder(options.folder);
  const experiences = experienceIds.map((id) => getExperience(id));
  const filename = normalizeFilename(options.filename, experiences, experienceIds);
  const output = await renderForSurface(experienceIds, 'obsidian_note');
  const targetDir = resolve(vaultRoot, folder);
  const targetPath = resolve(targetDir, filename);

  assertInsideVault(vaultRoot, targetDir);
  assertInsideVault(vaultRoot, targetPath);

  await mkdir(targetDir, { recursive: true });
  try {
    await writeFile(targetPath, output, {
      encoding: 'utf8',
      flag: options.overwrite === true ? 'w' : 'wx',
    });
  } catch (error) {
    if (isNodeErrorWithCode(error, 'EEXIST')) {
      throw new SecoError(
        'OBSIDIAN_NOTE_EXISTS',
        'Obsidian note already exists. Pass overwrite=true to replace it.'
      );
    }
    throw error;
  }

  return {
    surface: 'obsidian_note',
    output,
    path: targetPath,
    relative_path: relative(vaultRoot, targetPath),
    overwritten: options.overwrite === true,
    canonical_store: 'sqlite',
    source_experience_ids: experienceIds,
  };
}
