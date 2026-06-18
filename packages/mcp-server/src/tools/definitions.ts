const surfaces = [
  'resume_bullets',
  'linkedin_summary',
  'linkedin_post',
  'github_readme',
  'obsidian_note',
  'latex_bullets',
  'cover_letter_paragraph',
  'bio_short',
  'bio_medium',
  'bio_full',
] as const;

const editableExperienceFields = [
  'title',
  'organization',
  'role',
  'role_type',
  'start_date',
  'end_date',
  'raw_transcript',
  'situation',
  'task',
  'action',
  'result',
  'skills',
  'impact_metrics',
  'ats_keywords',
  'tags',
] as const;

const intakeAppMeta = {
  ui: { resourceUri: 'ui://seco/intake.html' },
} as const;

const reviewedDraftSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    organization: { type: 'string' },
    role: { type: 'string' },
    role_type: {
      type: 'string',
      enum: ['internship', 'full-time', 'project', 'leadership', 'research'],
    },
    start_date: { type: 'string' },
    end_date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    situation: { type: 'string' },
    task: { type: 'string' },
    action: { type: 'string' },
    result: { type: 'string' },
    skills: { type: 'array', items: { type: 'string' } },
    impact_metrics: { type: 'array', items: { type: 'string' } },
    ats_keywords: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'title',
    'organization',
    'role',
    'role_type',
    'start_date',
    'situation',
    'task',
    'action',
    'result',
    'skills',
    'impact_metrics',
    'ats_keywords',
    'tags',
  ],
} as const;

export const toolDefinitions = [
  {
    name: 'start_intake_session',
    description:
      'Begin a guided experience intake session when the user wants to add or capture an experience. Renders the inline seco intake MCP App where supported. For text sessions, ask the intake questions in Claude chat and call continue_intake_session with each user answer. For voice sessions, Claude Desktop is not recording audio; tell the user to open the returned intake_url localhost browser fallback and click Start speaking, or continue by answering next_question as text in chat.',
    _meta: intakeAppMeta,
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['voice', 'text'],
          description: 'Optional. Defaults to text when omitted.',
        },
      },
    },
  },
  {
    name: 'continue_intake_session',
    description:
      'Continue an active guided intake session with the user reply from Claude chat. Returns updated draft progress and the next question, or marks the session ready for review.',
    _meta: intakeAppMeta,
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['session_id', 'text'],
    },
  },
  {
    name: 'save_reviewed_intake_session',
    description:
      'Save a reviewed intake draft from the MCP App review UI. Prefer this over save_experience because it preserves review-before-save behavior.',
    _meta: {
      ui: { resourceUri: 'ui://seco/intake.html', visibility: ['app'] },
    },
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        draft: reviewedDraftSchema,
      },
      required: ['session_id', 'draft'],
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
    description: 'Legacy/manual path: commit the current intake session to the database without the browser review flow. Prefer save_reviewed_intake_session or get_intake_session_result for guided sessions.',
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
      'Generate optimized copy for a target surface (resume_bullets, linkedin_summary, linkedin_post, github_readme, obsidian_note, latex_bullets, cover_letter_paragraph, bio_short, bio_medium, bio_full). Optionally paste a job description to tailor the output.',
    inputSchema: {
      type: 'object',
      properties: {
        experience_ids: { type: 'array', items: { type: 'string' } },
        surface: { type: 'string', enum: surfaces },
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
    name: 'export_obsidian_note',
    description: 'Export one or more experiences as an Obsidian vault-ready Markdown note with frontmatter, tags, backlinks, STAR evidence, and reusable copy angles.',
    inputSchema: {
      type: 'object',
      properties: {
        experience_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['experience_ids'],
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
        field: { type: 'string', enum: editableExperienceFields },
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
