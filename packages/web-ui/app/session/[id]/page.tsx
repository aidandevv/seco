import { VoiceIntake } from '../../../components/voice-intake';

interface Props {
  params: Promise<{ id: string }>;
}

async function getSessionData(id: string) {
  try {
    const [sessionRes, configRes] = await Promise.all([
      fetch(`http://localhost:3001/sessions/${id}`, { cache: 'no-store' }),
      fetch('http://localhost:3001/config', { cache: 'no-store' }),
    ]);

    const session = sessionRes.ok
      ? (await sessionRes.json() as { messages?: Array<{ role: string; content: string }> })
      : null;
    const config = configRes.ok
      ? (await configRes.json() as { deepgramKey?: string; whisperAvailable?: boolean })
      : {};

    return { session, config };
  } catch {
    return { session: null, config: {} };
  }
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params;
  const { session, config } = await getSessionData(id);

  const initialMessages = (session?.messages ?? []) as Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;

  return (
    <VoiceIntake
      sessionId={id}
      initialMessages={initialMessages}
      deepgramKey={config.deepgramKey}
      whisperAvailable={config.whisperAvailable ?? false}
    />
  );
}
