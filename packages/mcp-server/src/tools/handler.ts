import {
  createIntakeSession,
  appendTranscript,
  getNextIntakeTurn,
  getIntakeSessionResult,
  saveReviewedIntakeSession,
  saveSession,
  listExperiences,
  getExperience,
  renderForSurface,
  tailorToJD,
  exportObsidianNote,
  exportObsidianVaultNote,
  exportLatex,
  updateExperienceFieldPublic,
  deleteExperienceById,
  SecoError,
} from '@seco/core';
import type { ExperienceDraft, Surface, RoleType } from '@seco/core';
import { intakeUrl } from '../runtime.js';

export const INTAKE_APP_RESOURCE_URI = 'ui://seco/intake.html';

type ToolTextContent = { type: 'text'; text: string };
export type ToolResult = {
  content: ToolTextContent[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
};

function ok(data: unknown, meta?: Record<string, unknown>): ToolResult {
  const structuredContent = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : undefined;
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    ...(structuredContent ? { structuredContent } : {}),
    ...(meta ? { _meta: meta } : {}),
  };
}

function err(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function coreDetailCount(draft: ExperienceDraft | undefined): number {
  if (!draft) return 0;
  return ['title', 'organization', 'role', 'situation', 'task', 'action', 'result']
    .filter((field) => String(draft[field as keyof ExperienceDraft] ?? '').trim()).length;
}

function intakeAppMeta(): Record<string, unknown> {
  return { ui: { resourceUri: INTAKE_APP_RESOURCE_URI } };
}

function activeIntakeState(args: {
  sessionId: string;
  status: string;
  mode: string;
  lifecycle: string;
  draft: ExperienceDraft | undefined;
  nextQuestion?: string;
}): Record<string, unknown> {
  return {
    status: args.status,
    session_id: args.sessionId,
    mode: args.mode,
    intake_url: intakeUrl(args.sessionId),
    lifecycle: args.lifecycle,
    draft: args.draft,
    next_question: args.nextQuestion,
    ready_for_review: args.draft?.readyForReview ?? false,
    missing_fields: args.draft?.missingFields ?? [],
    captured_core_details: coreDetailCount(args.draft),
    app_resource_uri: INTAKE_APP_RESOURCE_URI,
  };
}

export async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'start_intake_session': {
        const mode = args['mode'] === 'voice' ? 'voice' : 'text';
        const session = createIntakeSession(mode);
        const url = intakeUrl(session.id);
        const turn = await getNextIntakeTurn(session.id);
        const data = activeIntakeState({
          sessionId: session.id,
          status: session.status,
          mode: session.mode,
          lifecycle: turn.lifecycle,
          draft: turn.draft,
          nextQuestion: turn.complete ? undefined : turn.text,
        });
        return ok({
          ...data,
          session_id: session.id,
          status: session.status,
          mode: session.mode,
          intake_url: url,
          next_step: mode === 'voice'
            ? `Microphone capture is not active in Claude Desktop. To use voice, tell the user to open ${url} and click Start speaking. If they prefer chat, ask next_question here and continue with continue_intake_session.`
            : 'Ask the next intake question in Claude chat, then call continue_intake_session with the user reply.',
          message: mode === 'voice'
            ? `Voice intake requires the localhost browser fallback: ${url}. Claude Desktop is not recording audio. Open that URL and click Start speaking, or continue by answering next_question as text in this chat.`
            : 'Session started. Ask the user the next intake question in Claude chat, then call continue_intake_session with their answer.',
        }, intakeAppMeta());
      }

      case 'continue_intake_session': {
        const sessionId = args['session_id'] as string;
        const text = typeof args['text'] === 'string' ? args['text'].trim() : '';
        if (!sessionId) return err('session_id is required');
        if (!text) return err('text is required');
        await appendTranscript(sessionId, text);
        const turn = await getNextIntakeTurn(sessionId);
        const result = await getIntakeSessionResult(sessionId);
        return ok(activeIntakeState({
          sessionId,
          status: result.session.status,
          mode: result.session.mode,
          lifecycle: turn.lifecycle,
          draft: turn.draft,
          nextQuestion: turn.complete ? undefined : turn.text,
        }), intakeAppMeta());
      }

      case 'save_reviewed_intake_session': {
        const sessionId = args['session_id'] as string;
        if (!sessionId) return err('session_id is required');
        const completed = await saveReviewedIntakeSession(sessionId, args['draft']);
        const result = await getIntakeSessionResult(sessionId);
        return ok({
          status: 'saved',
          session_id: sessionId,
          mode: result.session.mode,
          intake_url: intakeUrl(sessionId),
          experience_id: completed.experience.id,
          experience: completed.experience,
          summary: completed.summary,
          app_resource_uri: INTAKE_APP_RESOURCE_URI,
        }, intakeAppMeta());
      }

      case 'get_intake_session_result': {
        const sessionId = args['session_id'] as string;
        if (!sessionId) return err('session_id is required');
        const refreshDraft = args['refresh'] === true;
        const result = await getIntakeSessionResult(sessionId, { refreshDraft });
        const url = intakeUrl(sessionId);
        if (result.session.status === 'saved' && result.experience) {
          return ok({
            status: 'saved',
            session_id: sessionId,
            mode: result.session.mode,
            intake_url: url,
            experience_id: result.experience.id,
            experience: result.experience,
            summary: result.summary,
          });
        }
        return ok({
          status: result.session.status,
          session_id: sessionId,
          mode: result.session.mode,
          intake_url: url,
          draft: result.draft,
          lifecycle: result.lifecycle,
          missing_fields: result.draft?.missingFields ?? [],
        });
      }

      case 'save_experience': {
        const sessionId = args['session_id'] as string;
        if (!sessionId) return err('session_id is required');
        const experience = await saveSession(sessionId);
        return ok(experience);
      }

      case 'list_experiences': {
        const experiences = listExperiences({
          tag: args['tag'] as string | undefined,
          role_type: args['role_type'] as RoleType | undefined,
          keyword: args['keyword'] as string | undefined,
          limit: args['limit'] as number | undefined,
          offset: args['offset'] as number | undefined,
        });
        return ok(experiences);
      }

      case 'get_experience': {
        const id = args['id'] as string;
        if (!id) return err('id is required');
        const experience = getExperience(id);
        return ok(experience);
      }

      case 'render_for_surface': {
        const ids = args['experience_ids'] as string[];
        const surface = args['surface'] as Surface;
        const jd = args['job_description'] as string | undefined;
        if (!ids?.length) return err('experience_ids is required');
        if (!surface) return err('surface is required');
        const result = await renderForSurface(ids, surface, jd);
        return ok({ surface, output: result });
      }

      case 'tailor_to_jd': {
        const jd = args['job_description'] as string;
        if (!jd) return err('job_description is required');
        const { snapshot, selected } = await tailorToJD(jd, (status) =>
          process.stderr.write(`  ${status}\n`)
        );
        return ok({ snapshot_id: snapshot.id, selected_count: selected.length, gap_analysis: snapshot.gap_analysis });
      }

      case 'export_obsidian_note': {
        const ids = args['experience_ids'] as string[];
        if (!ids?.length) return err('experience_ids is required');
        const vaultRoot = typeof args['vault_root'] === 'string' ? args['vault_root'].trim() : '';
        if (vaultRoot) {
          const result = await exportObsidianVaultNote(ids, {
            vaultRoot,
            folder: typeof args['folder'] === 'string' ? args['folder'] : undefined,
            filename: typeof args['filename'] === 'string' ? args['filename'] : undefined,
            overwrite: args['overwrite'] === true,
          });
          return ok(result);
        }
        const note = await exportObsidianNote(ids);
        return ok({ surface: 'obsidian_note', output: note, canonical_store: 'sqlite' });
      }

      case 'export_latex': {
        const ids = args['experience_ids'] as string[];
        if (!ids?.length) return err('experience_ids is required');
        const latex = await exportLatex(ids);
        return ok({ latex });
      }

      case 'update_experience': {
        const id = args['id'] as string;
        const field = args['field'] as string;
        const value = args['value'];
        if (!id || !field) return err('id and field are required');
        const updated = await updateExperienceFieldPublic(id, field as keyof import('@seco/core').Experience, value);
        return ok(updated);
      }

      case 'delete_experience': {
        const id = args['id'] as string;
        if (!id) return err('id is required');
        await deleteExperienceById(id);
        return ok({ deleted: id });
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof SecoError) {
      return err(`${error.code}: ${error.detail}`);
    }
    return err(error instanceof Error ? error.message : String(error));
  }
}
