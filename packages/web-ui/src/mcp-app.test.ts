import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(join(process.cwd(), 'src/mcp-app.tsx'), 'utf8');
const appCss = readFileSync(join(process.cwd(), 'src/mcp-app.css'), 'utf8');

describe('MCP App intake surface', () => {
  it('keeps Claude chat as the text intake surface', () => {
    expect(appSource).not.toContain('Type a reply');
    expect(appSource).not.toContain('sendText');
    expect(appSource).not.toContain("name: 'continue_intake_session'");
    expect(appSource).toContain('next_question');
  });

  it('uses host style tokens and includes fullscreen review affordances', () => {
    expect(appCss).toContain('var(--color-background-primary');
    expect(appCss).toContain('var(--color-text-primary');
    expect(appSource).toContain("requestDisplayMode({ mode: 'fullscreen' })");
    expect(appSource).toContain('save_reviewed_intake_session');
  });
});
