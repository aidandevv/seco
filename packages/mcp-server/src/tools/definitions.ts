export const toolDefinitions = [
  {
    name: 'start_intake_session',
    description:
      'Begin a guided experience intake session when the user wants to add or capture an experience. Return the direct intake_url to the user, ask them to complete review/save in the browser, then call get_intake_session_result after they say they are done.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['voice', 'text'] },
      },
      required: ['mode'],
    },
  },
  {
    name: 'get_intake_session_result',
    description:
      'Poll a guided intake session after the user opens the intake_url. If active, returns draft progress and missing fields. If saved, returns the full experience and summary so you can use it immediately in the current chat task.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        refresh: {
          type: 'boolean',
          description: 'When true, recompute the draft from the transcript. Default false avoids extra LLM calls while polling.',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'save_experience',
    description: 'Legacy/manual path: commit the current intake session to the database without the browser review flow. Prefer get_intake_session_result for guided UI sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'list_experiences',
    description: 'Browse experience entries. Optionally filter by tag, role type, or keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string' },
        role_type: {
          type: 'string',
          enum: ['internship', 'full-time', 'project', 'leadership', 'research'],
        },
        keyword: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'get_experience',
    description: 'Retrieve a single experience entry with all fields.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'render_for_surface',
    description:
      'Generate optimized copy for a target surface (resume_bullets, linkedin_summary, linkedin_post, github_readme, latex_bullets, cover_letter_paragraph, bio_short, bio_medium, bio_full). Optionally paste a job description to tailor the output.',
    inputSchema: {
      type: 'object',
      properties: {
        experience_ids: { type: 'array', items: { type: 'string' } },
        surface: { type: 'string' },
        job_description: { type: 'string' },
      },
      required: ['experience_ids', 'surface'],
    },
  },
  {
    name: 'tailor_to_jd',
    description:
      'Run the full tailoring pipeline against a job description. Selects the best-matching experiences and re-renders key surfaces with JD-specific language.',
    inputSchema: {
      type: 'object',
      properties: {
        job_description: { type: 'string' },
      },
      required: ['job_description'],
    },
  },
  {
    name: 'export_latex',
    description: 'Export one or more experiences as LaTeX \\item bullet blocks for Overleaf.',
    inputSchema: {
      type: 'object',
      properties: {
        experience_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['experience_ids'],
    },
  },
  {
    name: 'update_experience',
    description: 'Update a specific field on an experience entry. Auto-increments the version.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        field: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['id', 'field', 'value'],
    },
  },
  {
    name: 'delete_experience',
    description: 'Delete an experience entry. Always confirm with the user before calling this.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
] as const;
