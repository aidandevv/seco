import {
  startIntakeSession,
  saveSession,
  listExperiences,
  getExperience,
  renderForSurface,
  tailorToJD,
  exportLatex,
  updateExperienceFieldPublic,
  deleteExperienceById,
  SecoError,
} from '@seco/core';
import type { Surface, RoleType } from '@seco/core';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'start_intake_session': {
        const mode = (args['mode'] as 'voice' | 'text') ?? 'text';
        const session = await startIntakeSession(mode);
        return ok({
          session_id: session.id,
          message: `Session started. ${mode === 'voice' ? 'Open http://localhost:3000 for voice intake.' : 'Session ready for text intake.'}`,
          first_question: session.messages[0]?.content ?? '',
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
