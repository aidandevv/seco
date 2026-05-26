import { redirect } from 'next/navigation';

async function startSession(formData: FormData) {
  'use server';
  const mode = formData.get('mode') as 'voice' | 'text';
  const res = await fetch('http://localhost:3001/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to start session');
  const session = (await res.json()) as { id: string };
  redirect(`/session/${session.id}`);
}

async function getExperiences() {
  try {
    const res = await fetch('http://localhost:3001/sessions', { cache: 'no-store' });
    return [];
  } catch {
    return [];
  }
}

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '60px 24px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>seco</h1>
      <p style={{ color: '#888', marginBottom: 48 }}>
        a local professional identity engine — one intake session, every surface.
      </p>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16, color: '#aaa' }}>
          new session
        </h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <form action={startSession}>
            <input type="hidden" name="mode" value="text" />
            <button
              type="submit"
              style={{ background: '#1a1a1a', color: '#e8e8e8', border: '1px solid #333' }}
            >
              text intake
            </button>
          </form>
          <form action={startSession}>
            <input type="hidden" name="mode" value="voice" />
            <button
              type="submit"
              style={{ background: '#2a2a2a', color: '#e8e8e8', border: '1px solid #444' }}
            >
              voice intake
            </button>
          </form>
        </div>
        <p style={{ fontSize: 13, color: '#666', marginTop: 12 }}>
          voice intake requires a Deepgram API key (or OpenAI for Whisper fallback)
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: '#aaa' }}>
          use claude desktop to browse your experiences
        </h2>
        <p style={{ fontSize: 13, color: '#666' }}>
          &ldquo;list my experiences&rdquo; · &ldquo;render as resume bullets&rdquo; · &ldquo;tailor to this job description&rdquo;
        </p>
      </section>
    </main>
  );
}
