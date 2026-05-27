import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@seco/core', () => ({
  createIntakeSession: vi.fn().mockReturnValue({
    id: 'sess-1',
    messages: [],
    status: 'active',
    transcript: '',
    experience_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }),
  getIntakeSessionResult: vi.fn().mockResolvedValue({
    session: {
      id: 'sess-1',
      messages: [],
      status: 'active',
      transcript: '',
      experience_id: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    lifecycle: 'needs_details',
    draft: {
      title: 'Draft role',
      missingFields: ['result'],
      readyForReview: false,
    },
  }),
  saveSession: vi.fn().mockResolvedValue({ id: 'exp-1', title: 'Test Role' }),
  listExperiences: vi.fn().mockReturnValue([{ id: 'exp-1', title: 'Test Role' }]),
  getExperience: vi.fn().mockReturnValue({ id: 'exp-1', title: 'Test Role' }),
  renderForSurface: vi.fn().mockResolvedValue('• Built something great, saving 40% time'),
  tailorToJD: vi.fn().mockResolvedValue({
    snapshot: { id: 'snap-1', gap_analysis: { React: 0.9 } },
    selected: [{ id: 'exp-1' }],
  }),
  exportLatex: vi.fn().mockResolvedValue('\\item Built something great'),
  updateExperienceFieldPublic: vi.fn().mockResolvedValue({ id: 'exp-1', title: 'Updated' }),
  deleteExperienceById: vi.fn().mockResolvedValue(undefined),
  SecoError: class SecoError extends Error {
    code: string;
    detail: string;
    constructor(code: string, detail: string) {
      super(`${code}: ${detail}`);
      this.code = code;
      this.detail = detail;
      this.name = 'SecoError';
    }
  },
}));

import { handleTool } from './handler.js';
import { setRuntimeContext } from '../runtime.js';

beforeEach(() => {
  vi.clearAllMocks();
  setRuntimeContext({ apiPort: 3001, uiPort: 3000, uiUrl: 'http://localhost:3000' });
});

describe('handleTool', () => {
  it('start_intake_session returns session_id', async () => {
    const result = await handleTool('start_intake_session', { mode: 'text' });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as { session_id: string; intake_url: string; status: string };
    expect(data.session_id).toBe('sess-1');
    expect(data.status).toBe('active');
    expect(data.intake_url).toBe('http://localhost:3000/session/sess-1');
  });

  it('start_intake_session uses the dynamic runtime UI URL', async () => {
    setRuntimeContext({ apiPort: 3003, uiPort: 3002, uiUrl: 'http://localhost:3002' });
    const result = await handleTool('start_intake_session', { mode: 'voice' });
    const data = JSON.parse(result.content[0].text) as { intake_url: string };
    expect(data.intake_url).toBe('http://localhost:3002/session/sess-1');
  });

  it('get_intake_session_result requires session_id', async () => {
    const result = await handleTool('get_intake_session_result', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('session_id');
  });

  it('get_intake_session_result returns active draft progress', async () => {
    const result = await handleTool('get_intake_session_result', { session_id: 'sess-1' });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as {
      status: string;
      session_id: string;
      intake_url: string;
      lifecycle: string;
      missing_fields: string[];
    };
    expect(data.status).toBe('active');
    expect(data.session_id).toBe('sess-1');
    expect(data.intake_url).toBe('http://localhost:3000/session/sess-1');
    expect(data.lifecycle).toBe('needs_details');
    expect(data.missing_fields).toEqual(['result']);
  });

  it('get_intake_session_result returns saved experience', async () => {
    const core = await import('@seco/core');
    vi.mocked(core.getIntakeSessionResult).mockResolvedValueOnce({
      session: {
        id: 'sess-1',
        messages: [],
        status: 'saved',
        transcript: '',
        experience_id: 'exp-1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      lifecycle: 'saved',
      experience: { id: 'exp-1', title: 'Test Role' } as import('@seco/core').Experience,
      summary: 'Experience ID: exp-1',
    });
    const result = await handleTool('get_intake_session_result', { session_id: 'sess-1' });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as { status: string; experience_id: string; summary: string };
    expect(data.status).toBe('saved');
    expect(data.experience_id).toBe('exp-1');
    expect(data.summary).toContain('exp-1');
  });

  it('save_experience requires session_id', async () => {
    const result = await handleTool('save_experience', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('session_id');
  });

  it('save_experience calls saveSession and returns experience', async () => {
    const result = await handleTool('save_experience', { session_id: 'sess-1' });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as { id: string };
    expect(data.id).toBe('exp-1');
  });

  it('list_experiences returns array', async () => {
    const result = await handleTool('list_experiences', {});
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
  });

  it('render_for_surface requires experience_ids', async () => {
    const result = await handleTool('render_for_surface', { surface: 'resume_bullets' });
    expect(result.isError).toBe(true);
  });

  it('render_for_surface returns output', async () => {
    const result = await handleTool('render_for_surface', {
      experience_ids: ['exp-1'],
      surface: 'resume_bullets',
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as { output: string };
    expect(data.output).toContain('Built something great');
  });

  it('export_latex returns latex field', async () => {
    const result = await handleTool('export_latex', { experience_ids: ['exp-1'] });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as { latex: string };
    expect(data.latex).toContain('\\item');
  });

  it('delete_experience requires id', async () => {
    const result = await handleTool('delete_experience', {});
    expect(result.isError).toBe(true);
  });

  it('delete_experience returns deleted id', async () => {
    const result = await handleTool('delete_experience', { id: 'exp-1' });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text) as { deleted: string };
    expect(data.deleted).toBe('exp-1');
  });

  it('unknown tool returns isError', async () => {
    const result = await handleTool('nonexistent_tool', {});
    expect(result.isError).toBe(true);
  });
});
