import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../render/stream.js', () => ({
  streamRender: vi.fn().mockResolvedValue('---\ntitle: Test Role\n---\n# Test Role'),
}));

const testDir = join(tmpdir(), `seco-obsidian-vault-test-${Date.now()}`);
process.env['SECO_DIR'] = join(testDir, 'seco');

import { createExperience } from '../experience/crud.js';
import { closeDb } from '../db/client.js';
import { SecoError } from '../errors.js';
import { exportObsidianNoteToVault } from './vault.js';

const sample = {
  title: 'Platform Launch',
  organization: 'Acme Corp',
  role: 'Lead Engineer',
  role_type: 'project' as const,
  start_date: '2024-01-01',
  end_date: null,
  raw_transcript: 'I launched the platform.',
  situation: 'The team needed a launch.',
  task: 'I owned the technical launch.',
  action: 'I coordinated the release and wrote the migration plan.',
  result: 'Launch completed with no rollback.',
  skills: ['TypeScript', 'Release Management'],
  impact_metrics: ['No rollback'],
  ats_keywords: ['platform', 'launch'],
  tags: ['engineering'],
};

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

describe('exportObsidianNoteToVault', () => {
  it('writes rendered Markdown into a vault-relative folder', async () => {
    const experience = createExperience(sample);
    const vaultRoot = join(testDir, 'Career Vault');
    const result = await exportObsidianNoteToVault([experience.id], {
      vaultRoot,
      folder: 'Career/Experiences',
      filename: 'platform-launch',
    });

    expect(result.canonical_store).toBe('sqlite');
    expect(result.relative_path).toBe('Career/Experiences/platform-launch.md');
    expect(result.source_experience_ids).toEqual([experience.id]);
    expect(existsSync(result.path)).toBe(true);
    expect(readFileSync(result.path, 'utf8')).toContain('# Test Role');
  });

  it('rejects folder traversal outside the vault', async () => {
    const experience = createExperience(sample);
    await expect(exportObsidianNoteToVault([experience.id], {
      vaultRoot: join(testDir, 'vault'),
      folder: '../outside',
    })).rejects.toThrow(SecoError);
  });

  it('requires explicit overwrite for an existing note', async () => {
    const experience = createExperience(sample);
    const vaultRoot = join(testDir, 'vault');
    const options = { vaultRoot, filename: 'same-note.md' };
    await exportObsidianNoteToVault([experience.id], options);

    await expect(exportObsidianNoteToVault([experience.id], options))
      .rejects.toThrow('OBSIDIAN_NOTE_EXISTS');
  });
});
