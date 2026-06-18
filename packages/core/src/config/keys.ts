import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as readline from 'node:readline';

export interface SecoConfig {
  anthropicApiKey: string;
  deepgramApiKey?: string;
  openaiApiKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export function getSecoDir(): string {
  return process.env['SECO_DIR'] ?? join(homedir(), '.seco');
}
const ENV_PATH = (): string => join(getSecoDir(), '.env');

function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

export function loadConfig(): SecoConfig {
  const envPath = ENV_PATH();
  const env: Record<string, string> = existsSync(envPath)
    ? parseEnvFile(readFileSync(envPath, 'utf8'))
    : {};

  return {
    anthropicApiKey: env['ANTHROPIC_API_KEY'] ?? process.env['ANTHROPIC_API_KEY'] ?? '',
    deepgramApiKey: env['DEEPGRAM_API_KEY'] ?? process.env['DEEPGRAM_API_KEY'],
    openaiApiKey: env['OPENAI_API_KEY'] ?? process.env['OPENAI_API_KEY'],
    supabaseUrl: env['SUPABASE_URL'] ?? process.env['SUPABASE_URL'],
    supabaseAnonKey: env['SUPABASE_ANON_KEY'] ?? process.env['SUPABASE_ANON_KEY'],
  };
}

export function validateConfig(config: SecoConfig): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!config.anthropicApiKey) missing.push('ANTHROPIC_API_KEY');
  return { valid: missing.length === 0, missing };
}

export async function runFirstTimeSetup(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  process.stderr.write('\n  welcome to seco.\n\n');
  process.stderr.write(
    "  Looks like this is your first time. Let's get your API keys set up.\n"
  );
  process.stderr.write(
    '  Keys are stored locally at ~/.seco/.env — never uploaded anywhere.\n\n'
  );

  const anthropicKey = await ask('  Anthropic API key (required): ');
  const deepgramKey = await ask('  Deepgram API key (optional — real-time voice): ');
  const openaiKey = await ask('  OpenAI API key (optional — Whisper fallback): ');

  rl.close();

  const secoDir = getSecoDir();
  mkdirSync(secoDir, { recursive: true });

  let content = `ANTHROPIC_API_KEY=${anthropicKey.trim()}\n`;
  if (deepgramKey.trim()) content += `DEEPGRAM_API_KEY=${deepgramKey.trim()}\n`;
  if (openaiKey.trim()) content += `OPENAI_API_KEY=${openaiKey.trim()}\n`;

  writeFileSync(ENV_PATH(), content, { mode: 0o600 });
}
