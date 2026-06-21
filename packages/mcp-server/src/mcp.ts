import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { getExperience, getSnapshot, listExperiences, listSnapshots } from '@seco/core';
import type { ApplicationSnapshot, Experience } from '@seco/core';
import { toolDefinitions } from './tools/definitions.js';
import { handleTool, INTAKE_APP_RESOURCE_URI, type ToolResult } from './tools/handler.js';

const roleTypeSchema = z.enum(['internship', 'full-time', 'project', 'leadership', 'research']);

const reviewedDraftSchema = z.object({
  title: z.string(),
  organization: z.string(),
  role: z.string(),
  role_type: roleTypeSchema,
  start_date: z.string(),
  end_date: z.string().nullable().optional(),
  situation: z.string(),
  task: z.string(),
  action: z.string(),
  result: z.string(),
  skills: z.array(z.string()),
  impact_metrics: z.array(z.string()),
  ats_keywords: z.array(z.string()),
  tags: z.array(z.string()),
  fieldConfidence: z.record(z.string(), z.enum(['low', 'medium', 'high'])).optional(),
  fieldNotes: z.record(z.string(), z.string()).optional(),
  overallConfidence: z.enum(['low', 'medium', 'high']).optional(),
  missingFields: z.array(z.string()).optional(),
  readyForReview: z.boolean().optional(),
  qualityScore: z.object({
    star: z.number(),
    metrics: z.number(),
    skills: z.number(),
    overall: z.number(),
  }).optional(),
});

function toolDefinition(name: string): { description: string } {
  const definition = toolDefinitions.find((tool) => tool.name === name);
  if (!definition) throw new Error(`Missing tool definition for ${name}`);
  return { description: definition.description };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return handleTool(name, args);
}

async function loadBundledMcpAppHtml(webUiDist: string): Promise<string> {
  const js = await readFile(join(webUiDist, 'assets/mcp-app.js'), 'utf8');
  const css = await readFile(join(webUiDist, 'assets/mcp-app.css'), 'utf8').catch(() => '');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<title>seco intake</title>',
    `<style>${css}</style>`,
    '</head>',
    '<body>',
    '<div id="seco-mcp-root"></div>',
    `<script>${js}</script>`,
    '</body>',
    '</html>',
  ].join('');
}

function experienceMarkdown(experience: Experience): string {
  return [
    `# ${experience.title}`,
    '',
    `- ID: ${experience.id}`,
    `- Organization: ${experience.organization}`,
    `- Role: ${experience.role}`,
    `- Type: ${experience.role_type}`,
    `- Dates: ${experience.start_date}${experience.end_date ? ` to ${experience.end_date}` : ' to present'}`,
    `- Version: ${experience.version}`,
    '',
    '## STAR',
    '',
    `Situation: ${experience.situation}`,
    '',
    `Task: ${experience.task}`,
    '',
    `Action: ${experience.action}`,
    '',
    `Result: ${experience.result}`,
    '',
    '## Signals',
    '',
    `Skills: ${experience.skills.join(', ') || 'None captured'}`,
    `Impact metrics: ${experience.impact_metrics.join(', ') || 'None captured'}`,
    `ATS keywords: ${experience.ats_keywords.join(', ') || 'None captured'}`,
    `Tags: ${experience.tags.join(', ') || 'None captured'}`,
  ].join('\n');
}

function experienceListMarkdown(experiences: Experience[]): string {
  if (experiences.length === 0) return '# Recent seco experiences\n\nNo experiences saved yet.';
  return [
    '# Recent seco experiences',
    '',
    ...experiences.map((experience) => [
      `## ${experience.title}`,
      '',
      `- Resource: @seco:experience://${experience.id}`,
      `- Organization: ${experience.organization}`,
      `- Role: ${experience.role}`,
      `- Skills: ${experience.skills.slice(0, 6).join(', ') || 'None captured'}`,
      `- Impact: ${experience.impact_metrics.slice(0, 3).join(', ') || 'None captured'}`,
    ].join('\n')),
  ].join('\n\n');
}

function snapshotMarkdown(snapshot: ApplicationSnapshot): string {
  return [
    `# ${snapshot.role_title} at ${snapshot.company}`,
    '',
    `- ID: ${snapshot.id}`,
    `- Created: ${snapshot.created_at}`,
    `- Experiences: ${snapshot.experience_ids.map((id) => `@seco:experience://${id}`).join(', ') || 'None'}`,
    '',
    '## Parsed Job Description',
    '',
    `Required skills: ${snapshot.jd_parsed.required_skills.join(', ') || 'None captured'}`,
    `Preferred skills: ${snapshot.jd_parsed.preferred_skills.join(', ') || 'None captured'}`,
    `Keywords: ${snapshot.jd_parsed.keywords.join(', ') || 'None captured'}`,
    `Confidence: ${snapshot.jd_parsed.confidence}`,
    '',
    '## Gap Analysis',
    '',
    Object.entries(snapshot.gap_analysis).map(([skill, score]) => `- ${skill}: ${score}`).join('\n') || 'No gaps computed.',
    '',
    '## Rendered Outputs',
    '',
    Object.entries(snapshot.rendered_outputs).map(([surface, output]) => `### ${surface}\n\n${output}`).join('\n\n') || 'No outputs rendered.',
  ].join('\n');
}

function snapshotListMarkdown(snapshots: ApplicationSnapshot[]): string {
  if (snapshots.length === 0) return '# Recent seco snapshots\n\nNo application snapshots saved yet.';
  return [
    '# Recent seco snapshots',
    '',
    ...snapshots.map((snapshot) => [
      `## ${snapshot.role_title} at ${snapshot.company}`,
      '',
      `- Resource: @seco:snapshot://${snapshot.id}`,
      `- Created: ${snapshot.created_at}`,
      `- Experiences: ${snapshot.experience_ids.length}`,
    ].join('\n')),
  ].join('\n\n');
}

function promptMessage(text: string): { messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }> } {
  return { messages: [{ role: 'user', content: { type: 'text', text } }] };
}

export function createSecoMcpServer(webUiDist: string): McpServer {
  const server = new McpServer(
    { name: 'seco', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  registerAppResource(
    server,
    'seco intake',
    INTAKE_APP_RESOURCE_URI,
    {
      description: 'Native Claude intake status and review UI for seco.',
      _meta: {
        ui: {
          prefersBorder: false,
          csp: {
            connectDomains: [],
            resourceDomains: [],
            baseUriDomains: [],
          },
        },
      },
    },
    async () => {
      const html = await loadBundledMcpAppHtml(webUiDist);
      return {
        contents: [{
          uri: INTAKE_APP_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: {
                connectDomains: [],
                resourceDomains: [],
                baseUriDomains: [],
              },
            },
          },
        }],
      };
    }
  );

  server.registerResource(
    'recent_experiences',
    'experiences://recent',
    {
      title: 'Recent seco experiences',
      description: 'Markdown list of recently saved seco experiences for Claude Code @-mentions.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'text/markdown',
        text: experienceListMarkdown(listExperiences({ limit: 10 })),
      }],
    })
  );

  server.registerResource(
    'experience',
    new ResourceTemplate('experience://{id}', {
      list: async () => ({
        resources: listExperiences({ limit: 25 }).map((experience) => ({
          uri: `experience://${experience.id}`,
          name: experience.title,
          title: `${experience.title} (${experience.organization})`,
          description: `${experience.role} - ${experience.skills.slice(0, 4).join(', ')}`,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    {
      title: 'seco experience',
      description: 'A saved seco experience as STAR/context markdown.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const id = Array.isArray(variables['id']) ? variables['id'][0] : variables['id'];
      const experience = getExperience(id ?? uri.hostname);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/markdown',
          text: experienceMarkdown(experience),
        }],
      };
    }
  );

  server.registerResource(
    'recent_snapshots',
    'snapshots://recent',
    {
      title: 'Recent seco application snapshots',
      description: 'Markdown list of recent JD tailoring snapshots for Claude Code @-mentions.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'text/markdown',
        text: snapshotListMarkdown(listSnapshots(10)),
      }],
    })
  );

  server.registerResource(
    'snapshot',
    new ResourceTemplate('snapshot://{id}', {
      list: async () => ({
        resources: listSnapshots(25).map((snapshot) => ({
          uri: `snapshot://${snapshot.id}`,
          name: `${snapshot.role_title} at ${snapshot.company}`,
          title: `${snapshot.role_title} at ${snapshot.company}`,
          description: `${snapshot.experience_ids.length} selected experiences`,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    {
      title: 'seco application snapshot',
      description: 'A saved JD tailoring snapshot as markdown.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const id = Array.isArray(variables['id']) ? variables['id'][0] : variables['id'];
      const snapshot = getSnapshot(id ?? uri.hostname);
      if (!snapshot) throw new Error(`Snapshot not found: ${id ?? uri.hostname}`);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/markdown',
          text: snapshotMarkdown(snapshot),
        }],
      };
    }
  );

  server.registerPrompt(
    'capture_experience',
    {
      title: 'Capture seco experience',
      description: 'Claude Code workflow for capturing one reviewed professional experience.',
      argsSchema: {
        mode: z.enum(['text', 'voice']).optional(),
        focus: z.string().optional(),
      },
    },
    ({ mode, focus }) => promptMessage([
      'Capture one professional experience into seco.',
      '',
      `Mode: ${mode ?? 'text'}`,
      focus ? `Focus: ${focus}` : 'Focus: ask the user which experience they want to capture.',
      '',
      'Workflow:',
      '1. Call mcp__seco__start_intake_session with the requested mode.',
      '2. Ask the returned next_question directly in Claude Code chat.',
      '3. After each user answer, call mcp__seco__continue_intake_session with session_id and text.',
      '4. When ready_for_review is true, show a concise markdown draft and ask for confirmation or edits.',
      '5. If the user edits fields, apply those edits to the draft object.',
      '6. Call mcp__seco__save_reviewed_intake_session only after explicit user confirmation.',
      '7. Summarize the saved experience_id and useful next actions.',
      '',
      'Do not require the browser unless the user specifically wants voice fallback.',
    ].join('\n'))
  );

  server.registerPrompt(
    'review_draft',
    {
      title: 'Review seco intake draft',
      description: 'Claude Code workflow for reviewing an active seco intake session before saving.',
      argsSchema: {
        session_id: z.string(),
      },
    },
    ({ session_id: sessionId }) => promptMessage([
      `Review seco intake session ${sessionId}.`,
      '',
      'Workflow:',
      '1. Call mcp__seco__get_intake_session_result with refresh=true.',
      '2. Present the draft as compact markdown grouped by Identity, STAR, and Value signals.',
      '3. Ask the user for edits or explicit confirmation to save.',
      '4. Call mcp__seco__save_reviewed_intake_session only after confirmation.',
    ].join('\n'))
  );

  server.registerPrompt(
    'capture_voice_experience',
    {
      title: 'Capture seco voice experience',
      description: 'Claude Code workflow for capturing one professional experience with the localhost voice fallback.',
      argsSchema: {
        focus: z.string().optional(),
      },
    },
    ({ focus }) => promptMessage([
      'Capture one professional experience into seco using voice.',
      '',
      focus ? `Focus: ${focus}` : 'Focus: ask the user which experience they want to capture.',
      '',
      'Workflow:',
      '1. Call mcp__seco__start_intake_session with mode="voice".',
      '2. Give the user the returned intake_url and explain that microphone capture happens only in the localhost browser after they click Start speaking or speak.',
      '3. Do not ask the intake questions in Claude Code unless the user chooses text fallback.',
      '4. After the user saves in the browser, call mcp__seco__get_intake_session_result with refresh=true.',
      '5. Summarize the saved experience_id and useful next actions.',
      '',
      'If voice transcription is not configured, tell the user they can continue with text in the same browser session or use /mcp__seco__capture_experience for terminal-native text intake.',
    ].join('\n'))
  );

  server.registerPrompt(
    'render_resume',
    {
      title: 'Render seco resume bullets',
      description: 'Claude Code workflow for rendering selected seco experiences as resume bullets.',
      argsSchema: {
        experience_ids: z.string().optional(),
        job_description: z.string().optional(),
      },
    },
    ({ experience_ids: experienceIds, job_description: jobDescription }) => promptMessage([
      'Render seco experiences as resume bullets.',
      '',
      experienceIds
        ? `Use these experience IDs: ${experienceIds}`
        : 'If experience IDs are not clear, call mcp__seco__list_experiences or inspect @seco:experiences://recent.',
      jobDescription ? 'Tailor to the supplied job description.' : 'Ask for a job description only if tailoring is needed.',
      '',
      'Call mcp__seco__render_for_surface with surface="resume_bullets". Return paste-ready bullets and mention the source experience IDs.',
    ].join('\n'))
  );

  server.registerPrompt(
    'render_obsidian_note',
    {
      title: 'Render seco Obsidian note',
      description: 'Claude Code workflow for rendering selected seco experiences as an Obsidian vault-ready Markdown note.',
      argsSchema: {
        experience_ids: z.string().optional(),
        vault_root: z.string().optional(),
        folder: z.string().optional(),
        filename: z.string().optional(),
        overwrite: z.string().optional(),
        vault_context: z.string().optional(),
      },
    },
    ({ experience_ids: experienceIds, vault_root: vaultRoot, folder, filename, overwrite, vault_context: vaultContext }) => promptMessage([
      'Render seco experiences as an Obsidian vault note.',
      '',
      experienceIds
        ? `Use these experience IDs: ${experienceIds}`
        : 'If experience IDs are not clear, call mcp__seco__list_experiences or inspect @seco:experiences://recent.',
      vaultRoot
        ? `Write the note with mcp__seco__export_obsidian_note using vault_root="${vaultRoot}"${folder ? `, folder="${folder}"` : ''}${filename ? `, filename="${filename}"` : ''}${overwrite ? `, overwrite=${overwrite}` : ''}.`
        : 'If the user supplies a local vault path, call mcp__seco__export_obsidian_note with vault_root; otherwise return paste-ready Markdown.',
      vaultContext
        ? `Vault context: ${vaultContext}`
        : 'Ask for vault folder/tag/link conventions only if the user has specific Obsidian preferences.',
      '',
      'When no vault write is requested, call mcp__seco__render_for_surface with surface="obsidian_note". Mention the source experience IDs and whether SQLite remains the canonical store.',
    ].join('\n'))
  );

  server.registerPrompt(
    'tailor_to_jd',
    {
      title: 'Tailor seco profile to a JD',
      description: 'Claude Code workflow for selecting experiences and rendering outputs for a job description.',
      argsSchema: {
        job_description: z.string().optional(),
      },
    },
    ({ job_description: jobDescription }) => promptMessage([
      'Tailor seco experiences to a job description.',
      '',
      jobDescription
        ? 'Use the job description supplied in this prompt.'
        : 'Ask the user to paste the job description if it is not already in the conversation.',
      '',
      'Workflow:',
      '1. Call mcp__seco__tailor_to_jd with the full JD.',
      '2. Summarize selected_count, snapshot_id, and gap_analysis.',
      '3. Tell the user they can reference @seco:snapshot://<snapshot_id> later in Claude Code.',
    ].join('\n'))
  );

  registerAppTool(
    server,
    'start_intake_session',
    {
      title: 'Start intake session',
      description: toolDefinition('start_intake_session').description,
      inputSchema: { mode: z.enum(['voice', 'text']).optional() },
      annotations: { destructiveHint: false, readOnlyHint: false },
      _meta: { ui: { resourceUri: INTAKE_APP_RESOURCE_URI } },
    },
    async (args) => callTool('start_intake_session', args)
  );

  registerAppTool(
    server,
    'continue_intake_session',
    {
      title: 'Continue intake session',
      description: toolDefinition('continue_intake_session').description,
      inputSchema: { session_id: z.string(), text: z.string() },
      annotations: { destructiveHint: false, readOnlyHint: false },
      _meta: { ui: { resourceUri: INTAKE_APP_RESOURCE_URI } },
    },
    async (args) => callTool('continue_intake_session', args)
  );

  registerAppTool(
    server,
    'save_reviewed_intake_session',
    {
      title: 'Save reviewed intake session',
      description: toolDefinition('save_reviewed_intake_session').description,
      inputSchema: { session_id: z.string(), draft: reviewedDraftSchema },
      annotations: { destructiveHint: false, readOnlyHint: false },
      _meta: {
        ui: {
          resourceUri: INTAKE_APP_RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async (args) => callTool('save_reviewed_intake_session', args)
  );

  server.registerTool(
    'get_intake_session_result',
    {
      title: 'Get intake session result',
      description: toolDefinition('get_intake_session_result').description,
      inputSchema: { session_id: z.string(), refresh: z.boolean().optional() },
      annotations: { destructiveHint: false, readOnlyHint: true },
    },
    async (args) => callTool('get_intake_session_result', args)
  );

  server.registerTool(
    'save_experience',
    {
      title: 'Save experience',
      description: toolDefinition('save_experience').description,
      inputSchema: { session_id: z.string() },
      annotations: { destructiveHint: false, readOnlyHint: false },
    },
    async (args) => callTool('save_experience', args)
  );

  server.registerTool(
    'list_experiences',
    {
      title: 'List experiences',
      description: toolDefinition('list_experiences').description,
      inputSchema: {
        tag: z.string().optional(),
        role_type: roleTypeSchema.optional(),
        keyword: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      },
      annotations: { destructiveHint: false, readOnlyHint: true },
    },
    async (args) => callTool('list_experiences', args)
  );

  server.registerTool(
    'get_experience',
    {
      title: 'Get experience',
      description: toolDefinition('get_experience').description,
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: false, readOnlyHint: true },
    },
    async (args) => callTool('get_experience', args)
  );

  server.registerTool(
    'render_for_surface',
    {
      title: 'Render for surface',
      description: toolDefinition('render_for_surface').description,
      inputSchema: {
        experience_ids: z.array(z.string()),
        surface: z.enum([
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
        ]),
        job_description: z.string().optional(),
      },
      annotations: { destructiveHint: false, readOnlyHint: true },
    },
    async (args) => callTool('render_for_surface', args)
  );

  server.registerTool(
    'tailor_to_jd',
    {
      title: 'Tailor to job description',
      description: toolDefinition('tailor_to_jd').description,
      inputSchema: { job_description: z.string() },
      annotations: { destructiveHint: false, readOnlyHint: true },
    },
    async (args) => callTool('tailor_to_jd', args)
  );

  server.registerTool(
    'export_obsidian_note',
    {
      title: 'Export Obsidian note',
      description: toolDefinition('export_obsidian_note').description,
      inputSchema: { experience_ids: z.array(z.string()) },
      annotations: { destructiveHint: false, readOnlyHint: true },
    },
    async (args) => callTool('export_obsidian_note', args)
  );

  server.registerTool(
    'export_latex',
    {
      title: 'Export LaTeX',
      description: toolDefinition('export_latex').description,
      inputSchema: { experience_ids: z.array(z.string()) },
      annotations: { destructiveHint: false, readOnlyHint: true },
    },
    async (args) => callTool('export_latex', args)
  );

  server.registerTool(
    'update_experience',
    {
      title: 'Update experience',
      description: toolDefinition('update_experience').description,
      inputSchema: {
        id: z.string(),
        field: z.enum([
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
        ]),
        value: z.unknown(),
      },
      annotations: { destructiveHint: false, readOnlyHint: false },
    },
    async (args) => callTool('update_experience', args)
  );

  server.registerTool(
    'delete_experience',
    {
      title: 'Delete experience',
      description: toolDefinition('delete_experience').description,
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true, readOnlyHint: false },
    },
    async (args) => callTool('delete_experience', args)
  );

  return server;
}
