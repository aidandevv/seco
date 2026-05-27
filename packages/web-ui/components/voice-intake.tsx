import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { ExperienceDraft, IntakeLifecycle } from '../lib/api';
import { tickVAD, initialVADState, VAD_DEFAULTS } from '../lib/vad';
import type { VADState } from '../lib/vad';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  sessionId: string;
  initialMessages: Message[];
  initialStatus: 'active' | 'saved';
  initialExperienceId: string | null;
  initialSummary: string;
  initialDraft: unknown;
  deepgramKey?: string;
  whisperAvailable: boolean;
}

function chime(ctx: AudioContext) {
  const t = ctx.currentTime;
  const notes: Array<[number, number, number]> = [[523, 0, 0.07], [659, 0.09, 0.1]];
  for (const [freq, offset, dur] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t + offset);
    gain.gain.linearRampToValueAtTime(0.12, t + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + dur);
    osc.start(t + offset);
    osc.stop(t + offset + dur + 0.05);
  }
}

type WsStatus = 'connecting' | 'connected' | 'error';
type DgStatus = 'off' | 'ready' | 'connecting' | 'active' | 'error';

function getRecorderOptions(): MediaRecorderOptions | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
  const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  return mimeType ? { mimeType } : undefined;
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
  missingFields: ['title', 'organization', 'role', 'start_date', 'situation', 'task', 'action', 'result'],
  readyForReview: false,
};

function coerceDraft(value: unknown): ExperienceDraft {
  if (!value || typeof value !== 'object') return emptyDraft;
  return { ...emptyDraft, ...(value as Partial<ExperienceDraft>) };
}

function arrayText(values: string[]): string {
  return values.join(', ');
}

function parseArrayText(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function VoiceIntake({
  sessionId,
  initialMessages,
  initialStatus,
  initialExperienceId,
  initialSummary,
  initialDraft,
  deepgramKey,
  whisperAvailable,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<'idle' | 'thinking' | 'review' | 'saved'>(initialStatus === 'saved' ? 'saved' : 'idle');
  const [textInput, setTextInput] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [dgStatus, setDgStatus] = useState<DgStatus>(deepgramKey ? 'ready' : 'off');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [voicePhase, setVoicePhase] = useState<'idle' | 'recording' | 'processing' | 'sent'>('idle');
  const [completionSummary, setCompletionSummary] = useState(initialSummary);
  const [completedExperienceId, setCompletedExperienceId] = useState(initialExperienceId ?? '');
  const [draft, setDraft] = useState<ExperienceDraft>(() => coerceDraft(initialDraft));
  const [lifecycle, setLifecycle] = useState<IntakeLifecycle>(initialStatus === 'saved' ? 'saved' : coerceDraft(initialDraft).readyForReview ? 'ready_for_review' : 'collecting');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const deepgramWsRef = useRef<WebSocket | null>(null);
  const serverWsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef('');
  const pendingDeepgramChunksRef = useRef<Blob[]>([]);
  const deepgramFinalizeTimerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const recordingRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const vadStateRef = useRef<VADState>(initialVADState());

  // Keep recordingRef in sync so WS closure can check current value
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  const getAudioCtx = useCallback((): AudioContext | null => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume();
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentQuestion]);

  // Server WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    serverWsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      if (messages.length === 0) {
        ws.send(JSON.stringify({ type: 'init', sessionId }));
      }
    };

    ws.onerror = () => setWsStatus('error');

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as {
        type: string;
        text?: string;
        status?: string;
        message?: string;
        draft?: ExperienceDraft;
        lifecycle?: IntakeLifecycle;
        experienceId?: string;
      };

      if (msg.type === 'question') {
        setErrorMsg(null);
        setCurrentQuestion((prev) => prev + (msg.text ?? ''));
      } else if (msg.type === 'question_complete') {
        setMessages((prev) => [...prev, { role: 'assistant', content: msg.text ?? '' }]);
        setCurrentQuestion('');
        // After AI finishes: chime + auto-start mic
        if ((deepgramKey || whisperAvailable) && status !== 'review') {
          setTimeout(() => {
            if (recordingRef.current) return;
            const ctx = audioCtxRef.current;
            if (ctx) { try { chime(ctx); } catch {} }
            void startRecordingRef.current?.();
          }, 350);
        }
      } else if (msg.type === 'draft_update') {
        if (msg.draft) setDraft(msg.draft);
        if (msg.lifecycle) setLifecycle(msg.lifecycle);
      } else if (msg.type === 'status') {
        setStatus(msg.status === 'thinking' ? 'thinking' : msg.status === 'saved' ? 'saved' : msg.status === 'ready_for_review' ? 'review' : 'idle');
      } else if (msg.type === 'error') {
        setStatus('idle');
        setErrorMsg(msg.message ?? 'unknown error');
      } else if (msg.type === 'review_ready') {
        setErrorMsg(null);
        setCurrentQuestion('');
        if (msg.draft) setDraft(msg.draft);
        setLifecycle('ready_for_review');
        setStatus('review');
      }
    };

    return () => ws.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendUtterance = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    serverWsRef.current?.send(JSON.stringify({ type: 'utterance', sessionId, text }));
  }, [sessionId]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mr = new MediaRecorder(stream, getRecorderOptions());
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      pendingDeepgramChunksRef.current = [];
      transcriptRef.current = '';
      setLiveTranscript('');
      setVoicePhase('recording');
      setErrorMsg(null);

      if (deepgramKey) {
        setDgStatus('connecting');
        const dgWs = new WebSocket(
          `wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&interim_results=true`,
          ['token', deepgramKey]
        );
        deepgramWsRef.current = dgWs;
        dgWs.onopen = () => {
          setDgStatus('active');
          for (const chunk of pendingDeepgramChunksRef.current.splice(0)) {
            dgWs.send(chunk);
          }
        };
        dgWs.onerror = () => {
          setDgStatus('error');
          setErrorMsg('Deepgram connection failed');
        };
        dgWs.onclose = (event) => {
          if (recordingRef.current && event.code !== 1000) {
            setDgStatus('error');
            setErrorMsg(`Deepgram closed unexpectedly (${event.code})`);
          }
        };
        let finalTranscript = '';
        dgWs.onmessage = (e) => {
          const data = JSON.parse(e.data as string) as {
            type?: string;
            channel?: { alternatives?: Array<{ transcript: string }> };
            is_final?: boolean;
            message?: string;
          };
          if (data.type === 'Error') {
            setDgStatus('error');
            setErrorMsg(data.message ?? 'Deepgram transcription error');
            return;
          }
          const t = data.channel?.alternatives?.[0]?.transcript ?? '';
          if (data.is_final && t) {
            finalTranscript += t + ' ';
            setLiveTranscript(finalTranscript);
          } else if (!data.is_final && t) {
            setLiveTranscript(finalTranscript + t);
          }
          transcriptRef.current = finalTranscript;
        };
        mr.ondataavailable = (e) => {
          if (e.data.size === 0) return;
          if (dgWs.readyState === WebSocket.OPEN) {
            dgWs.send(e.data);
          } else if (dgWs.readyState === WebSocket.CONNECTING) {
            pendingDeepgramChunksRef.current.push(e.data);
          }
        };
        mr.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          if (dgWs.readyState === WebSocket.OPEN) {
            dgWs.send(JSON.stringify({ type: 'Finalize' }));
            deepgramFinalizeTimerRef.current = window.setTimeout(() => {
              if (dgWs.readyState === WebSocket.OPEN) dgWs.close(1000);
            }, 1800);
          }
        };
        mr.start(100);
      } else if (whisperAvailable) {
        let chunkInterval: ReturnType<typeof setInterval>;
        mr.ondataavailable = (e) => chunksRef.current.push(e.data);
        mr.start(5000);
        chunkInterval = setInterval(async () => {
          if (chunksRef.current.length === 0) return;
          const chunks = chunksRef.current.splice(0);
          const blob = new Blob(chunks, { type: mr.mimeType || chunks[0]?.type || 'audio/webm' });
          try {
            const text = await api.transcribeAudio(blob);
            if (text) {
              transcriptRef.current += text + ' ';
              setLiveTranscript(transcriptRef.current);
            }
          } catch {}
        }, 5500);
        mr.onstop = () => {
          clearInterval(chunkInterval);
          stream.getTracks().forEach((track) => track.stop());
        };
      } else {
        mr.onstop = () => stream.getTracks().forEach((track) => track.stop());
        mr.start();
      }

      setRecording(true);
      recordingRef.current = true;

      // VAD: auto-stop on speech pause
      const ctx = getAudioCtx();
      if (ctx) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
        vadStateRef.current = initialVADState();
        const data = new Uint8Array(analyser.frequencyBinCount);

        const loop = () => {
          analyser.getByteFrequencyData(data);
          const amplitude = data.reduce((s, v) => s + v, 0) / data.length;
          const { state, shouldStop } = tickVAD(vadStateRef.current, amplitude, performance.now(), VAD_DEFAULTS);
          vadStateRef.current = state;
          if (shouldStop) {
            stopRecordingRef.current?.();
            return;
          }
          vadRafRef.current = requestAnimationFrame(loop);
        };
        vadRafRef.current = requestAnimationFrame(loop);
      }
    } catch {
      // mic permission denied or unavailable
      setErrorMsg('Microphone permission denied or unavailable');
      setVoicePhase('idle');
    }
  }, [deepgramKey, whisperAvailable, getAudioCtx]);

  useEffect(() => { startRecordingRef.current = startRecording; }, [startRecording]);

  const stopRecording = useCallback(() => {
    recordingRef.current = false;
    if (vadRafRef.current !== null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    analyserRef.current = null;
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.requestData(); } catch {}
      mediaRecorder.stop();
    } else {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    }
    if (deepgramKey) setDgStatus('ready');
    setVoicePhase('processing');
    const submitDelayMs = deepgramKey ? 2000 : 500;
    setTimeout(() => {
      const text = transcriptRef.current.trim();
      if (deepgramFinalizeTimerRef.current !== null) {
        window.clearTimeout(deepgramFinalizeTimerRef.current);
        deepgramFinalizeTimerRef.current = null;
      }
      if (deepgramWsRef.current?.readyState === WebSocket.OPEN) {
        deepgramWsRef.current.close(1000);
      }
      if (text) {
        sendUtterance(text);
        setVoicePhase('sent');
        setTimeout(() => { setVoicePhase('idle'); setLiveTranscript(''); }, 2000);
      } else {
        setVoicePhase('idle');
        setLiveTranscript('');
      }
      transcriptRef.current = '';
      pendingDeepgramChunksRef.current = [];
    }, submitDelayMs);
    setRecording(false);
  }, [deepgramKey, sendUtterance]);
  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  const sendText = () => {
    if (!textInput.trim()) return;
    sendUtterance(textInput.trim());
    setTextInput('');
  };

  const handleReview = () => {
    if (!draft.readyForReview) return;
    setLifecycle('ready_for_review');
    setStatus('review');
  };

  const saveReviewed = async () => {
    setStatus('thinking');
    try {
      const completed = await api.saveReviewedSession(sessionId, draft);
      setCompletionSummary(completed.summary);
      setCompletedExperienceId(completed.experience.id);
      setLifecycle('saved');
      setStatus('saved');
    } catch (e) {
      setStatus('review');
      alert(String(e));
    }
  };

  const updateDraft = <K extends keyof ExperienceDraft>(field: K, value: ExperienceDraft[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  // Init AudioContext on first explicit user click so chimes work later
  const handleMicClick = () => {
    getAudioCtx();
    if (recording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  if (status === 'review') {
    return (
      <div style={{ maxWidth: 840, margin: '0 auto', padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 20, marginBottom: 6 }}>review experience</p>
          <p style={{ color: '#888', margin: 0 }}>Confirm the captured memory before saving it locally.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            title
            <input value={draft.title} onChange={(e) => updateDraft('title', e.target.value)} style={{ background: '#111', color: '#eee', border: '1px solid #333', borderRadius: 6, padding: 8 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            organization
            <input value={draft.organization} onChange={(e) => updateDraft('organization', e.target.value)} style={{ background: '#111', color: '#eee', border: '1px solid #333', borderRadius: 6, padding: 8 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            role
            <input value={draft.role} onChange={(e) => updateDraft('role', e.target.value)} style={{ background: '#111', color: '#eee', border: '1px solid #333', borderRadius: 6, padding: 8 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            role type
            <select value={draft.role_type} onChange={(e) => updateDraft('role_type', e.target.value as ExperienceDraft['role_type'])} style={{ background: '#111', color: '#eee', border: '1px solid #333', borderRadius: 6, padding: 8 }}>
              <option value="project">project</option>
              <option value="full-time">full-time</option>
              <option value="internship">internship</option>
              <option value="leadership">leadership</option>
              <option value="research">research</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            start date
            <input value={draft.start_date} onChange={(e) => updateDraft('start_date', e.target.value)} style={{ background: '#111', color: '#eee', border: '1px solid #333', borderRadius: 6, padding: 8 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            end date
            <input value={draft.end_date ?? ''} onChange={(e) => updateDraft('end_date', e.target.value.trim() || null)} style={{ background: '#111', color: '#eee', border: '1px solid #333', borderRadius: 6, padding: 8 }} />
          </label>
        </div>

        {(['situation', 'task', 'action', 'result'] as const).map((field) => (
          <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12, marginTop: 14 }}>
            {field}
            <textarea value={draft[field]} onChange={(e) => updateDraft(field, e.target.value)} rows={field === 'action' ? 5 : 3} style={{ background: '#111', color: '#eee', border: '1px solid #333', borderRadius: 6, padding: 10, resize: 'vertical' }} />
          </label>
        ))}

        {(['skills', 'impact_metrics', 'ats_keywords', 'tags'] as const).map((field) => (
          <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12, marginTop: 14 }}>
            {field.replace('_', ' ')}
            <textarea value={arrayText(draft[field])} onChange={(e) => updateDraft(field, parseArrayText(e.target.value))} rows={2} style={{ background: '#111', color: '#eee', border: '1px solid #333', borderRadius: 6, padding: 10, resize: 'vertical' }} />
          </label>
        ))}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={() => setStatus('idle')} style={{ background: '#181818', color: '#ddd', border: '1px solid #333' }}>
            back to chat
          </button>
          <button onClick={() => void saveReviewed()} style={{ background: '#1a6b3a', color: '#e8e8e8', border: '1px solid #2d8f52' }}>
            save memory
          </button>
        </div>
      </div>
    );
  }

  if (status === 'saved') {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <p style={{ fontSize: 20, marginBottom: 8 }}>experience saved</p>
        {completedExperienceId && (
          <p style={{ color: '#888', fontFamily: 'monospace', fontSize: 13, marginBottom: 20 }}>
            {completedExperienceId}
          </p>
        )}
        {completionSummary && (
          <div style={{
            textAlign: 'left',
            maxWidth: 620,
            margin: '24px auto',
            padding: 16,
            background: '#111',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
            color: '#ddd',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}>
            {completionSummary}
          </div>
        )}
        <p style={{ color: '#888' }}>Memory saved. Tell Claude you are done so it can fetch this experience and use it in chat.</p>
        <a href="/" style={{ display: 'inline-block', marginTop: 24, color: '#aaa' }}>← back</a>
      </div>
    );
  }

  // Status dot
  const dot = (color: string, pulse = false) => (
    <span style={{
      display: 'inline-block',
      width: 6, height: 6,
      borderRadius: '50%',
      background: color,
      marginRight: 5,
      verticalAlign: 'middle',
      boxShadow: pulse ? `0 0 0 2px ${color}40` : 'none',
    }} />
  );

  const userState = recording
    ? 'Listening'
    : voicePhase === 'processing'
      ? 'Transcribing'
      : status === 'thinking'
        ? 'Thinking'
        : lifecycle === 'ready_for_review'
          ? 'Ready to review'
          : lifecycle === 'needs_details'
            ? 'Needs details'
            : wsStatus === 'connected'
              ? 'Ready'
              : 'Connecting';
  const userStateColor = recording ? '#e84040' : status === 'thinking' ? '#e8a840' : lifecycle === 'ready_for_review' ? '#3db85a' : wsStatus === 'error' || dgStatus === 'error' ? '#e84040' : '#3db85a';
  const missingLabels = draft.missingFields.map((field) => field.replace('_', ' '));
  const capturedCount = ['title', 'organization', 'role', 'situation', 'task', 'action', 'result']
    .filter((field) => String(draft[field as keyof ExperienceDraft] ?? '').trim()).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>

      {/* Header */}
      <div style={{ padding: '14px 0 10px', borderBottom: '1px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: '#666' }}>intake session</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/" style={{ fontSize: 13, color: '#666', textDecoration: 'none' }}>← back</a>
            <button
              onClick={handleReview}
              disabled={!draft.readyForReview || status === 'thinking'}
              style={{ background: '#1a6b3a', color: '#e8e8e8', fontSize: 13 }}
            >
              review
            </button>
          </div>
        </div>

        {/* Status strip */}
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#555', flexWrap: 'wrap', rowGap: 4 }}>
          <span>
            {dot(userStateColor, recording || status === 'thinking')} {userState}
          </span>
          <span>{capturedCount}/7 core details captured</span>
          <span>{draft.overallConfidence} confidence</span>
        </div>
        {errorMsg && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#c0392b', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            ✕ {errorMsg}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden', flexWrap: 'wrap', alignContent: 'stretch' }}>
        <aside style={{ flex: '0 1 280px', minWidth: 240, borderRight: '1px solid #222', padding: '16px 16px 16px 0', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>captured draft</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>title</div>
              <div style={{ color: draft.title ? '#ddd' : '#555' }}>{draft.title || 'missing'}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>organization</div>
              <div style={{ color: draft.organization ? '#ddd' : '#555' }}>{draft.organization || 'missing'}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>role</div>
              <div style={{ color: draft.role ? '#ddd' : '#555' }}>{draft.role || 'missing'}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>STAR progress</div>
              <div style={{ color: '#ddd' }}>
                {['situation', 'task', 'action', 'result'].filter((field) => String(draft[field as keyof ExperienceDraft] ?? '').trim()).length}/4
              </div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>skills</div>
              <div style={{ color: draft.skills.length ? '#ddd' : '#555' }}>{draft.skills.length ? draft.skills.slice(0, 4).join(', ') : 'missing'}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>still needed</div>
              <div style={{ color: missingLabels.length ? '#c9a44d' : '#3db85a' }}>
                {missingLabels.length ? missingLabels.slice(0, 5).join(', ') : 'ready to review'}
              </div>
            </div>
          </div>
        </aside>

        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 520px', minWidth: 0, minHeight: 0 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 8,
            background: m.role === 'assistant' ? '#1a1a1a' : '#111',
            borderLeft: `3px solid ${m.role === 'assistant' ? '#333' : '#444'}`,
          }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 4, textTransform: 'uppercase' }}>
              {m.role === 'assistant' ? 'seco' : 'you'}
            </div>
            <div style={{ lineHeight: 1.5 }}>{m.content}</div>
          </div>
        ))}

        {currentQuestion && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#1a1a1a', borderLeft: '3px solid #333' }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 4, textTransform: 'uppercase' }}>seco</div>
            <div style={{ lineHeight: 1.5 }}>{currentQuestion}<span style={{ opacity: 0.4 }}>▊</span></div>
          </div>
        )}

        {status === 'thinking' && !currentQuestion && (
          <div style={{ color: '#555', fontSize: 13, padding: '8px 0' }}>thinking…</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{ padding: '10px 0 20px', borderTop: '1px solid #222' }}>
        {(deepgramKey || whisperAvailable) && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: voicePhase !== 'idle' ? 8 : 0 }}>
              <button
                onClick={handleMicClick}
                disabled={status === 'thinking'}
                style={{
                  background: recording ? '#4a0f0f' : '#181818',
                  color: recording ? '#ff6b6b' : '#e8e8e8',
                  border: `1px solid ${recording ? '#aa3333' : '#2a2a2a'}`,
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 13,
                  cursor: status === 'thinking' ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {recording
                  ? <><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#e84040' }} /> stop</>
                  : <><span style={{ fontSize: 14 }}>🎙</span> speak</>
                }
              </button>
              {voicePhase === 'processing' && (
                <span style={{ fontSize: 12, color: '#888' }}>sending…</span>
              )}
              {voicePhase === 'sent' && (
                <span style={{ fontSize: 13, color: '#3db85a', fontWeight: 600 }}>✓ sent</span>
              )}
            </div>
            {voicePhase !== 'idle' && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 6,
                background: voicePhase === 'sent' ? '#0a1f0e' : '#141414',
                border: `1px solid ${voicePhase === 'sent' ? '#1a5c2a' : voicePhase === 'recording' ? '#2a2a2a' : '#3a3a3a'}`,
                fontSize: 13,
                minHeight: 36,
                display: 'flex',
                alignItems: 'center',
              }}>
                {voicePhase === 'recording' && (
                  liveTranscript
                    ? <span style={{ color: '#ccc' }}>{liveTranscript}<span style={{ opacity: 0.4 }}>▊</span></span>
                    : <span style={{ color: '#444' }}>listening…</span>
                )}
                {voicePhase === 'processing' && (
                  <span style={{ color: '#666' }}>{liveTranscript || 'processing…'}</span>
                )}
                {voicePhase === 'sent' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {liveTranscript && <span style={{ color: '#ccc' }}>{liveTranscript}</span>}
                    <span style={{ color: '#4caf50', fontSize: 12 }}>✓ submitted</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
            placeholder={recording ? 'transcribing — stop when done' : 'or type…'}
            disabled={status === 'thinking'}
            style={{
              flex: 1,
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: 6,
              padding: '8px 12px',
              color: '#e8e8e8',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button
            onClick={sendText}
            disabled={!textInput.trim() || status === 'thinking'}
            style={{ background: '#1e3a5f', color: '#e8e8e8', borderRadius: 6 }}
          >
            send
          </button>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
