export const toolDefinitions = [
  {
    name: 'start_intake_session',
    description:
      'Begin a new experience intake session. Use voice mode if the user wants to speak; text mode if they want to type.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['voice', 'text'] },
      },
      required: ['mode'],
    },
  },
  {
    name: 'save_experience',
    description: 'Commit the current intake session to the database. Returns the created experience record.',
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
