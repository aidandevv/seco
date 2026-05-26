import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testDir = join(tmpdir(), `seco-keys-test-${Date.now()}`);
process.env['SECO_DIR'] = testDir;

import { loadConfig, validateConfig } from './keys.js';

describe('loadConfig', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('reads ANTHROPIC_API_KEY from $SECO_DIR/.env', () => {
    writeFileSync(join(testDir, '.env'), 'ANTHROPIC_API_KEY=sk-ant-test\n');
    const config = loadConfig();
    expect(config.anthropicApiKey).toBe('sk-ant-test');
  });

  it('reads optional keys from file', () => {
    writeFileSync(
      join(testDir, '.env'),
      'ANTHROPIC_API_KEY=sk-ant-x\nDEEPGRAM_API_KEY=dg-key\nOPENAI_API_KEY=openai-key\n'
    );
    const config = loadConfig();
    expect(config.deepgramApiKey).toBe('dg-key');
    expect(config.openaiApiKey).toBe('openai-key');
  });

  it('returns empty string when no env file exists', () => {
    // Temporarily clear any env var
    const orig = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    const config = loadConfig();
    expect(config.anthropicApiKey).toBe('');
    if (orig !== undefined) process.env['ANTHROPIC_API_KEY'] = orig;
  });
});

describe('validateConfig', () => {
  it('returns valid when anthropicApiKey is present', () => {
    const result = validateConfig({ anthropicApiKey: 'sk-ant-x' });
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('returns invalid with ANTHROPIC_API_KEY in missing when key is empty', () => {
    const result = validateConfig({ anthropicApiKey: '' });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('ANTHROPIC_API_KEY');
  });
});
