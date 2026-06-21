import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ExperienceDraft } from '../lib/api';
import './mcp-app.css';

type IntakeStatus = 'active' | 'saved' | 'abandoned';
type IntakeLifecycle = 'collecting' | 'needs_details' | 'ready_for_review' | 'saved';
type AppInstance = NonNullable<ReturnType<typeof useApp>['app']>;

interface IntakeAppState {
  status: IntakeStatus;
  session_id: string;
  mode: 'voice' | 'text';
  intake_url: string;
  lifecycle: IntakeLifecycle;
  draft?: ExperienceDraft;
  next_question?: string;
  ready_for_review: boolean;
  missing_fields: string[];
  captured_core_details: number;
  experience_id?: string;
  summary?: string;
}

const emptyDraft: ExperienceDraft = {
  title: '',
  organization: '',
  role: '',
  role_type: 'project',
  start_date: '',
  end_date: null,
  situation: '',
  task: '',
  action: '',
  result: '',
  skills: [],
  impact_metrics: [],
  ats_keywords: [],
  tags: [],
  fieldConfidence: {},
  overallConfidence: 'low',
  missingFields: [],
  readyForReview: false,
};

const requiredFields: Array<keyof ExperienceDraft> = [
  'title',
  'organization',
  'role',
  'start_date',
  'situation',
  'task',
  'action',
  'result',
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseResultPayload(result: Pick<CallToolResult, 'content' | 'structuredContent'>): unknown {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content.find((item) => item.type === 'text')?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isIntakeState(value: unknown): value is IntakeAppState {
  const record = asRecord(value);
  return typeof record['session_id'] === 'string'
    && typeof record['status'] === 'string'
    && typeof record['mode'] === 'string'
    && typeof record['intake_url'] === 'string';
}

function resultToState(result: CallToolResult): IntakeAppState | null {
  if (result.isError) return null;
  const payload = parseResultPayload(result);
  return isIntakeState(payload) ? payload : null;
}

function coerceDraft(draft: ExperienceDraft | undefined): ExperienceDraft {
  return { ...emptyDraft, ...(draft ?? {}) };
}

function arrayText(values: string[]): string {
  return values.join(', ');
}

function parseArrayText(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    title: 'Title',
    organization: 'Organization',
    role: 'Role',
    role_type: 'Role type',
    start_date: 'Start date',
    end_date: 'End date',
    situation: 'Situation',
    task: 'Task',
    action: 'Action',
    result: 'Result',
    skills: 'Skills',
    impact_metrics: 'Impact metrics',
    ats_keywords: 'ATS keywords',
    tags: 'Tags',
  };
  return labels[field] ?? field.replace(/_/g, ' ');
}

function missingSummary(fields: string[]): string {
  if (fields.length === 0) return 'Ready to review';
  return fields.slice(0, 4).map(fieldLabel).join(', ');
}

function validateDraft(draft: ExperienceDraft): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  for (const field of requiredFields) {
    if (!String(draft[field] ?? '').trim()) errors[String(field)] = 'Required';
  }
  if (draft.skills.length === 0 && draft.impact_metrics.length === 0) {
    errors.impact_metrics = 'Add at least one skill or impact detail';
  }
  return errors;
}

function stateLabel(state: IntakeAppState): string {
  if (state.status === 'saved') return 'Saved';
  if (state.lifecycle === 'ready_for_review') return 'Ready to review';
  if (state.lifecycle === 'needs_details') return 'Needs details';
  return 'Collecting';
}

function IntakeInlineCard({
  state,
  error,
  onReview,
  onOpenVoice,
}: {
  state: IntakeAppState;
  error: string | null;
  onReview: () => void;
  onOpenVoice: () => void;
}): JSX.Element {
  const draft = coerceDraft(state.draft);
  const showVoiceFallback = state.mode === 'voice' && state.status !== 'saved';

  return (
    <section className="seco-card" aria-label="seco intake status">
      <div className="seco-card__header">
        <div>
          <h1 className="seco-title">seco intake</h1>
          <div className="seco-muted seco-caption">{stateLabel(state)}</div>
        </div>
        <span className="seco-pill">{state.mode}</span>
      </div>

      <div className="seco-grid" aria-label="intake progress">
        <div className="seco-metric">
          <div className="seco-metric__value">{state.captured_core_details}/7</div>
          <div className="seco-muted seco-caption">core details</div>
        </div>
        <div className="seco-metric">
          <div className="seco-metric__value">{draft.overallConfidence}</div>
          <div className="seco-muted seco-caption">confidence</div>
        </div>
        <div className="seco-metric">
          <div className="seco-metric__value">{draft.qualityScore?.overall ?? 0}</div>
          <div className="seco-muted seco-caption">quality</div>
        </div>
        <div className="seco-metric">
          <div className="seco-metric__value">{state.missing_fields.length}</div>
          <div className="seco-muted seco-caption">missing</div>
        </div>
      </div>

      {state.status === 'saved' ? (
        <p className="seco-muted">Memory saved and ready in Claude.</p>
      ) : (
        <p className="seco-muted">Still needed: {missingSummary(state.missing_fields)}</p>
      )}

      {state.next_question && state.status !== 'saved' && (
        <p className="seco-caption seco-muted">Next question: {state.next_question}</p>
      )}

      {error && <div className="seco-alert">{error}</div>}

      {state.status !== 'saved' && (
        <div className="seco-actions">
          {showVoiceFallback && (
            <button className="seco-button" type="button" onClick={onOpenVoice}>
              Open voice fallback
            </button>
          )}
          <button
            className="seco-button seco-button--primary"
            type="button"
            disabled={!state.ready_for_review}
            onClick={onReview}
          >
            Review
          </button>
        </div>
      )}
    </section>
  );
}

function ReviewField({
  field,
  draft,
  errors,
  updateDraft,
  rows,
}: {
  field: keyof ExperienceDraft;
  draft: ExperienceDraft;
  errors: Partial<Record<string, string>>;
  updateDraft: <K extends keyof ExperienceDraft>(field: K, value: ExperienceDraft[K]) => void;
  rows?: number;
}): JSX.Element {
  const error = errors[String(field)];
  const value = draft[field];
  if (Array.isArray(value)) {
    return (
      <div className="seco-field">
        <span className="seco-field__label">{fieldLabel(String(field))}</span>
        <textarea
          value={arrayText(value)}
          rows={rows ?? 2}
          onChange={(event) => updateDraft(field, parseArrayText(event.target.value) as ExperienceDraft[typeof field])}
        />
        {error && <span className="seco-error">{error}</span>}
      </div>
    );
  }

  if (field === 'role_type') {
    return (
      <div className="seco-field">
        <label htmlFor="role_type">{fieldLabel(String(field))}</label>
        <select
          id="role_type"
          value={draft.role_type}
          onChange={(event) => updateDraft('role_type', event.target.value as ExperienceDraft['role_type'])}
        >
          <option value="project">project</option>
          <option value="full-time">full-time</option>
          <option value="internship">internship</option>
          <option value="leadership">leadership</option>
          <option value="research">research</option>
        </select>
      </div>
    );
  }

  const textValue = typeof value === 'string' ? value : '';
  const inputId = String(field);
  const multiline = rows !== undefined;
  return (
    <div className="seco-field">
      <label htmlFor={inputId}>{fieldLabel(inputId)}</label>
      {multiline ? (
        <textarea
          id={inputId}
          value={textValue}
          rows={rows}
          onChange={(event) => updateDraft(field, event.target.value as ExperienceDraft[typeof field])}
        />
      ) : (
        <input
          id={inputId}
          value={field === 'end_date' ? draft.end_date ?? '' : textValue}
          onChange={(event) => {
            const next = field === 'end_date' && !event.target.value.trim()
              ? null
              : event.target.value;
            updateDraft(field, next as ExperienceDraft[typeof field]);
          }}
        />
      )}
      {error && <span className="seco-error">{error}</span>}
    </div>
  );
}

function ReviewScreen({
  app,
  state,
  onCancel,
  onSaved,
}: {
  app: AppInstance | null;
  state: IntakeAppState;
  onCancel: () => void;
  onSaved: (state: IntakeAppState) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<ExperienceDraft>(() => coerceDraft(state.draft));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateDraft = <K extends keyof ExperienceDraft>(field: K, value: ExperienceDraft[K]): void => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => {
      const next = { ...previous };
      delete next[String(field)];
      return next;
    });
  };

  const save = async (): Promise<void> => {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    setSaveError(null);
    if (Object.keys(nextErrors).length > 0) return;
    if (!app) {
      setSaveError('Claude is still connecting to the review UI. Try again in a moment.');
      return;
    }

    setSaving(true);
    try {
      const result = await app.callServerTool({
        name: 'save_reviewed_intake_session',
        arguments: { session_id: state.session_id, draft },
      });
      if (result.isError) {
        setSaveError('Could not save yet. Your reviewed draft is still here.');
        return;
      }
      const nextState = resultToState(result);
      if (!nextState) {
        setSaveError('Saved response was incomplete. Your draft is still here.');
        return;
      }
      if (nextState.summary) {
        await app.updateModelContext({
          content: [{ type: 'text', text: nextState.summary }],
        });
      }
      onSaved(nextState);
      await app.requestDisplayMode({ mode: 'inline' }).catch(() => undefined);
    } catch {
      setSaveError('Could not reach seco. Your reviewed draft is still here.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="seco-review">
      <div className="seco-review__header">
        <div>
          <h1 className="seco-title">Review experience</h1>
          <p className="seco-muted">Confirm the structured memory before saving it locally.</p>
        </div>
        <div className="seco-actions">
          <button className="seco-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="seco-button seco-button--primary" type="button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving' : 'Save memory'}
          </button>
        </div>
      </div>

      <section className="seco-section">
        <h2>Identity</h2>
        <div className="seco-form-grid">
          {(['title', 'organization', 'role', 'role_type', 'start_date', 'end_date'] as const).map((field) => (
            <ReviewField key={field} field={field} draft={draft} errors={errors} updateDraft={updateDraft} />
          ))}
        </div>
      </section>

      <section className="seco-section">
        <h2>STAR story</h2>
        <div className="seco-form-grid">
          <ReviewField field="situation" draft={draft} errors={errors} updateDraft={updateDraft} rows={3} />
          <ReviewField field="task" draft={draft} errors={errors} updateDraft={updateDraft} rows={3} />
          <ReviewField field="action" draft={draft} errors={errors} updateDraft={updateDraft} rows={5} />
          <ReviewField field="result" draft={draft} errors={errors} updateDraft={updateDraft} rows={3} />
        </div>
      </section>

      <section className="seco-section">
        <h2>Value signals</h2>
        <div className="seco-form-grid">
          <ReviewField field="skills" draft={draft} errors={errors} updateDraft={updateDraft} />
          <ReviewField field="impact_metrics" draft={draft} errors={errors} updateDraft={updateDraft} />
          <ReviewField field="ats_keywords" draft={draft} errors={errors} updateDraft={updateDraft} />
          <ReviewField field="tags" draft={draft} errors={errors} updateDraft={updateDraft} />
        </div>
      </section>

      {saveError && <div className="seco-alert">{saveError}</div>}
    </main>
  );
}

function SecoMcpApp(): JSX.Element {
  const [state, setState] = useState<IntakeAppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const { app, isConnected, error: connectionError } = useApp({
    appInfo: { name: 'seco intake', version: '1.0.0' },
    capabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
    onAppCreated: (createdApp) => {
      createdApp.ontoolresult = (result) => {
        const nextState = resultToState(result);
        if (nextState) {
          setState(nextState);
          setError(null);
          if (nextState.status === 'saved') setReviewing(false);
        } else if (result.isError) {
          setError('seco could not update this intake. Your local data was not deleted.');
        }
      };
      createdApp.onhostcontextchanged = () => undefined;
    },
  });

  const startupText = useMemo(() => {
    if (connectionError) return 'Could not connect this intake card to Claude.';
    if (!isConnected) return 'Connecting intake card...';
    return 'Waiting for intake session data.';
  }, [connectionError, isConnected]);

  const openReview = async (): Promise<void> => {
    if (!app || !state?.ready_for_review) return;
    setReviewing(true);
    await app.requestDisplayMode({ mode: 'fullscreen' }).catch(() => undefined);
  };

  const closeReview = async (): Promise<void> => {
    setReviewing(false);
    await app?.requestDisplayMode({ mode: 'inline' }).catch(() => undefined);
  };

  const openVoiceFallback = async (): Promise<void> => {
    if (!app || !state) return;
    try {
      const result = await app.openLink({ url: state.intake_url });
      if (result.isError) setError(`Open this local fallback URL: ${state.intake_url}`);
    } catch {
      setError(`Open this local fallback URL: ${state.intake_url}`);
    }
  };

  if (reviewing && state) {
    return (
      <ReviewScreen
        app={app}
        state={state}
        onCancel={() => void closeReview()}
        onSaved={(nextState) => setState(nextState)}
      />
    );
  }

  return (
    <main className="seco-app">
      {state ? (
        <IntakeInlineCard
          state={state}
          error={error}
          onReview={() => void openReview()}
          onOpenVoice={() => void openVoiceFallback()}
        />
      ) : (
        <section className="seco-card">
          <h1 className="seco-title">seco intake</h1>
          <p className="seco-muted">{startupText}</p>
        </section>
      )}
    </main>
  );
}

const root = document.getElementById('seco-mcp-root');
if (root) {
  createRoot(root).render(<SecoMcpApp />);
}
