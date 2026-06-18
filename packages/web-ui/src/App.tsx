import { useEffect, useState } from 'react';
import { VoiceIntake } from '../components/voice-intake';
import { api } from '../lib/api';
import type { ConfigResponse, ExperienceDraft, HealthResponse, IntakeSessionResult, Session } from '../lib/api';
import { sessionIdFromPath } from './routes';

type SessionBootstrap =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      session: Session;
      config: ConfigResponse;
      health: HealthResponse;
      draft: ExperienceDraft | null;
      result: IntakeSessionResult | null;
    };

function Home(): JSX.Element {
  const [starting, setStarting] = useState<'voice' | 'text' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSession = async (mode: 'voice' | 'text'): Promise<void> => {
    setStarting(mode);
    setError(null);
    try {
      const session = await api.startSession(mode);
      window.location.assign(`/session/${encodeURIComponent(session.id)}`);
    } catch (e) {
      setStarting(null);
      setError(String(e));
    }
  };

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '60px 24px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>seco</h1>
      <p style={{ color: '#888', marginBottom: 48 }}>
        a local professional identity engine with guided review-before-save intake.
      </p>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16, color: '#aaa' }}>
          new session
        </h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            disabled={starting !== null}
            onClick={() => void startSession('text')}
            style={{ background: '#1a1a1a', color: '#e8e8e8', border: '1px solid #333' }}
          >
            {starting === 'text' ? 'starting...' : 'text intake'}
          </button>
          <button
            type="button"
            disabled={starting !== null}
            onClick={() => void startSession('voice')}
            style={{ background: '#2a2a2a', color: '#e8e8e8', border: '1px solid #444' }}
          >
            {starting === 'voice' ? 'starting...' : 'voice intake'}
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#666', marginTop: 12 }}>
          voice intake requires a Deepgram API key (or OpenAI for Whisper fallback)
        </p>
        {error && (
          <p style={{ fontSize: 12, color: '#c0392b', marginTop: 12, fontFamily: 'monospace' }}>
            {error}
          </p>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: '#aaa' }}>
          use your MCP chat to browse your experiences
        </h2>
        <p style={{ fontSize: 13, color: '#666' }}>
          "list my experiences" · "render as resume bullets" · "tailor to this job description"
        </p>
      </section>
    </main>
  );
}

function LoadingSession(): JSX.Element {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '60px 24px', color: '#888' }}>
      Loading intake session...
    </main>
  );
}

function ErrorSession({ message }: { message: string }): JSX.Element {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '60px 24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>session unavailable</h1>
      <p style={{ color: '#888' }}>{message}</p>
      <a href="/" style={{ color: '#aaa' }}>back</a>
    </main>
  );
}

function SessionPage({ sessionId }: { sessionId: string }): JSX.Element {
  const [bootstrap, setBootstrap] = useState<SessionBootstrap>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const [session, config, health] = await Promise.all([
          api.getSession(sessionId),
          api.getConfig(),
          api.getHealth(),
        ]);
        const saved = session.status === 'saved';
        const [draft, result] = saved
          ? [null, await api.getSessionResult(sessionId)]
          : [await api.getDraft(sessionId), null];
        if (!cancelled) setBootstrap({ status: 'ready', session, config, health, draft, result });
      } catch (e) {
        if (!cancelled) setBootstrap({ status: 'error', message: String(e) });
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [sessionId]);

  if (bootstrap.status === 'loading') return <LoadingSession />;
  if (bootstrap.status === 'error') return <ErrorSession message={bootstrap.message} />;

  const initialMessages = bootstrap.session.messages.filter((message) =>
    (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string'
  );

  return (
    <VoiceIntake
      sessionId={sessionId}
      initialMessages={initialMessages}
      initialStatus={bootstrap.session.status === 'saved' ? 'saved' : 'active'}
      initialExperienceId={bootstrap.session.experience_id}
      initialSummary={bootstrap.result?.summary ?? ''}
      initialDraft={bootstrap.draft}
      mode={bootstrap.session.mode}
      initialAutoListen={bootstrap.session.auto_listen_enabled}
      health={bootstrap.health}
      deepgramKey={bootstrap.config.deepgramKey}
      whisperAvailable={bootstrap.config.whisperAvailable}
    />
  );
}

export function App(): JSX.Element {
  const sessionId = sessionIdFromPath(window.location.pathname);
  if (sessionId) return <SessionPage sessionId={sessionId} />;
  return <Home />;
}
