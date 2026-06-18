import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { ExperienceDraft, HealthResponse, IntakeLifecycle } from '../lib/api';
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
  mode: 'voice' | 'text';
  initialAutoListen: boolean;
  health: HealthResponse;
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

const requiredFields: Array<keyof ExperienceDraft> = ['title', 'organization', 'role', 'start_date', 'situation', 'task', 'action', 'result'];

const fieldPrompts: Record<string, string> = {
  title: 'Title: what should we call this experience?',
  organization: 'Organization: where did this work happen?',
  role: 'Role: what were you responsible for?',
  start_date: 'Start date: when did this begin?',
  situation: 'Situation: what was the context before your work?',
  task: 'Task: what were you responsible for delivering?',
  action: 'Action: what specific work did you do?',
  result: 'Result: what changed because of your work?',
  impact_metrics: 'Impact: add a measurable result or concrete outcome.',
  skills: 'Skills: add the tools, methods, or skills used.',
};

function missingGuidance(field: string): string {
  return fieldPrompts[field] ?? `${field.replace('_', ' ')} needs detail.`;
}

function validateDraft(draft: ExperienceDraft): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  for (const field of requiredFields) {
    if (!String(draft[field] ?? '').trim()) errors[field] = 'Required before saving.';
  }
  if (draft.skills.length === 0 && draft.impact_metrics.length === 0) {
    errors.impact_metrics = 'Add at least one skill or impact detail.';
  }
  return errors;
}

function confidenceLabel(draft: ExperienceDraft, field: string): string {
  return draft.fieldConfidence[field] ?? 'low';
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

function voiceStatus(health: HealthResponse): string {
  if (health.deepgramKeyAvailable) return 'Deepgram ready';
  if (health.whisperAvailable) return 'Whisper fallback ready';
  return 'Not configured';
}

export function VoiceIntake({
  sessionId,
  initialMessages,
  initialStatus,
  initialExperienceId,
  initialSummary,
  initialDraft,
  mode,
  initialAutoListen,
  health,
  deepgramKey,
  whisperAvailable,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [started, setStarted] = useState(initialStatus === 'saved');
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
  const [autoListen, setAutoListen] = useState(mode === 'voice' && initialAutoListen);
  const [voiceActivated, setVoiceActivated] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [wsRecoverable, setWsRecoverable] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Partial<Record<string, string>>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const deepgramWsRef = useRef<WebSocket | null>(null);
  const serverWsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef('');
  const pendingDeepgramChunksRef = useRef<Blob[]>([]);
  const recentAudioChunksRef = useRef<Array<{ blob: Blob; capturedAt: number }>>([]);
  const deepgramReconnectAttemptedRef = useRef(false);
  const usingWhisperFallbackRef = useRef(false);
  const whisperIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const whisperFlushPromiseRef = useRef<Promise<void> | null>(null);
  const deepgramFinalizeTimerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const recordingRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const vadStateRef = useRef<VADState>(initialVADState());
  const textInputRef = useRef<HTMLInputElement>(null);
  const reconnectAttemptedRef = useRef(false);

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

  useEffect(() => {
    if (started && mode === 'text') textInputRef.current?.focus();
  }, [started, mode]);

  // Server WebSocket
  useEffect(() => {
    if (!started || status === 'saved') return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    let closedByEffect = false;
    serverWsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      setWsRecoverable(false);
      reconnectAttemptedRef.current = false;
      if (messages.length === 0) {
        ws.send(JSON.stringify({ type: 'init', sessionId }));
      }
    };

    ws.onerror = () => setWsStatus('error');
    ws.onclose = () => {
      if (closedByEffect) return;
      setWsStatus('error');
      if (!reconnectAttemptedRef.current) {
        reconnectAttemptedRef.current = true;
        window.setTimeout(() => setConnectionAttempt((attempt) => attempt + 1), 800);
      } else {
        setWsRecoverable(true);
      }
    };

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
        if (mode === 'voice' && autoListen && (deepgramKey || whisperAvailable) && status !== 'review') {
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

    return () => {
      closedByEffect = true;
      ws.close();
    };
  }, [started, connectionAttempt, autoListen]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendUtterance = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    serverWsRef.current?.send(JSON.stringify({ type: 'utterance', sessionId, text }));
  }, [sessionId]);

  const rememberRecentAudioChunk = useCallback((blob: Blob) => {
    const capturedAt = Date.now();
    recentAudioChunksRef.current.push({ blob, capturedAt });
    recentAudioChunksRef.current = recentAudioChunksRef.current.filter(
      (chunk) => capturedAt - chunk.capturedAt <= 5000
    );
  }, []);

  const flushWhisperChunks = useCallback(async () => {
    if (whisperFlushPromiseRef.current) {
      await whisperFlushPromiseRef.current.catch(() => undefined);
    }
    if (chunksRef.current.length === 0) return;
    const chunks = chunksRef.current.splice(0);
    const type = mediaRecorderRef.current?.mimeType || chunks[0]?.type || 'audio/webm';
    const flushPromise = (async () => {
      const text = await api.transcribeAudio(new Blob(chunks, { type }));
      if (text) {
        transcriptRef.current += `${text} `;
        setLiveTranscript(transcriptRef.current);
      }
    })();
    whisperFlushPromiseRef.current = flushPromise;
    try {
      await flushPromise;
    } catch {
      // Whisper is a fallback path; keep the live session usable with text if a chunk fails.
    } finally {
      if (whisperFlushPromiseRef.current === flushPromise) {
        whisperFlushPromiseRef.current = null;
      }
    }
  }, []);

  const startWhisperFallback = useCallback((seedChunks: Blob[] = []): boolean => {
    if (!whisperAvailable) return false;
    usingWhisperFallbackRef.current = true;
    setDgStatus('off');
    setErrorMsg(null);
    chunksRef.current.push(...seedChunks.filter((chunk) => chunk.size > 0));
    if (!whisperIntervalRef.current) {
      whisperIntervalRef.current = setInterval(() => {
        void flushWhisperChunks();
      }, 5500);
    }
    return true;
  }, [flushWhisperChunks, whisperAvailable]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setVoiceActivated(true);
      mediaStreamRef.current = stream;
      const mr = new MediaRecorder(stream, getRecorderOptions());
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      pendingDeepgramChunksRef.current = [];
      recentAudioChunksRef.current = [];
      deepgramReconnectAttemptedRef.current = false;
      usingWhisperFallbackRef.current = false;
      if (whisperIntervalRef.current) {
        clearInterval(whisperIntervalRef.current);
        whisperIntervalRef.current = null;
      }
      transcriptRef.current = '';
      setLiveTranscript('');
      setVoicePhase('recording');
      setErrorMsg(null);

      if (deepgramKey) {
        const activeDeepgramKey = deepgramKey;
        setDgStatus('connecting');
        let finalTranscript = '';

        const detachDeepgramHandlers = (socket: WebSocket | null) => {
          if (!socket) return;
          socket.onopen = null;
          socket.onerror = null;
          socket.onclose = null;
          socket.onmessage = null;
        };

        const recoverDeepgram = () => {
          if (!recordingRef.current || usingWhisperFallbackRef.current) return;

          const replayChunks = recentAudioChunksRef.current.map((chunk) => chunk.blob);
          if (!deepgramReconnectAttemptedRef.current) {
            deepgramReconnectAttemptedRef.current = true;
            pendingDeepgramChunksRef.current = [...replayChunks, ...pendingDeepgramChunksRef.current];
            const failedSocket = deepgramWsRef.current;
            detachDeepgramHandlers(failedSocket);
            try { failedSocket?.close(); } catch {}
            setDgStatus('connecting');
            window.setTimeout(() => connectDeepgram(), 250);
            return;
          }

          const fallbackStarted = startWhisperFallback(replayChunks);
          const failedSocket = deepgramWsRef.current;
          detachDeepgramHandlers(failedSocket);
          try { failedSocket?.close(); } catch {}
          if (!fallbackStarted) {
            setDgStatus('error');
            setErrorMsg('Voice transcription paused. Continue with text input.');
          }
        };

        function connectDeepgram(): void {
          const dgWs = new WebSocket(
            'wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&interim_results=true',
            ['token', activeDeepgramKey]
          );
          deepgramWsRef.current = dgWs;
          dgWs.onopen = () => {
            setDgStatus('active');
            for (const chunk of pendingDeepgramChunksRef.current.splice(0)) {
              dgWs.send(chunk);
            }
          };
          dgWs.onerror = () => recoverDeepgram();
          dgWs.onclose = (event) => {
            if (recordingRef.current && event.code !== 1000) recoverDeepgram();
          };
          dgWs.onmessage = (e) => {
            const data = JSON.parse(e.data as string) as {
              type?: string;
              channel?: { alternatives?: Array<{ transcript: string }> };
              is_final?: boolean;
            };
            if (data.type === 'Error') {
              recoverDeepgram();
              return;
            }
            const t = data.channel?.alternatives?.[0]?.transcript ?? '';
            if (data.is_final && t) {
              finalTranscript += `${t} `;
              setLiveTranscript(finalTranscript);
            } else if (!data.is_final && t) {
              setLiveTranscript(finalTranscript + t);
            }
            transcriptRef.current = finalTranscript;
          };
        }

        connectDeepgram();

        mr.ondataavailable = (e) => {
          if (e.data.size === 0) return;
          rememberRecentAudioChunk(e.data);
          if (usingWhisperFallbackRef.current) {
            chunksRef.current.push(e.data);
            return;
          }
          const dgWs = deepgramWsRef.current;
          if (dgWs?.readyState === WebSocket.OPEN) {
            dgWs.send(e.data);
          } else if (dgWs?.readyState === WebSocket.CONNECTING) {
            pendingDeepgramChunksRef.current.push(e.data);
          }
        };
        mr.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          if (usingWhisperFallbackRef.current) {
            void flushWhisperChunks();
            return;
          }
          const dgWs = deepgramWsRef.current;
          if (dgWs?.readyState === WebSocket.OPEN) {
            dgWs.send(JSON.stringify({ type: 'Finalize' }));
            deepgramFinalizeTimerRef.current = window.setTimeout(() => {
              if (dgWs.readyState === WebSocket.OPEN) dgWs.close(1000);
            }, 1800);
          }
        };
        mr.start(100);
      } else if (whisperAvailable) {
        startWhisperFallback();
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        mr.start(5000);
        mr.onstop = () => {
          void flushWhisperChunks();
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
      setErrorMsg('Microphone permission denied or unavailable');
      setVoicePhase('idle');
    }
  }, [deepgramKey, whisperAvailable, getAudioCtx, flushWhisperChunks, rememberRecentAudioChunk, startWhisperFallback]);

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
    if (deepgramKey && !usingWhisperFallbackRef.current) setDgStatus('ready');
    setVoicePhase('processing');
    if (whisperIntervalRef.current) {
      clearInterval(whisperIntervalRef.current);
      whisperIntervalRef.current = null;
    }
    const submitDelayMs = usingWhisperFallbackRef.current ? 1200 : deepgramKey ? 2000 : 500;
    setTimeout(() => {
      void (async () => {
        if (usingWhisperFallbackRef.current && whisperFlushPromiseRef.current) {
          await whisperFlushPromiseRef.current.catch(() => undefined);
        }
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
        recentAudioChunksRef.current = [];
        usingWhisperFallbackRef.current = false;
      })();
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
    const errors = validateDraft(draft);
    setValidationErrors(errors);
    setSaveError(null);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const completed = await api.saveReviewedSession(sessionId, draft);
      setCompletionSummary(completed.summary);
      setCompletedExperienceId(completed.experience.id);
      setLifecycle('saved');
      setStatus('saved');
    } catch (e) {
      setStatus('review');
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = <K extends keyof ExperienceDraft>(field: K, value: ExperienceDraft[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[String(field)];
      return next;
    });
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

  const handleAutoListenToggle = async (enabled: boolean) => {
    setAutoListen(enabled);
    try {
      await api.updateSessionPreferences(sessionId, { auto_listen_enabled: enabled });
    } catch (e) {
      setAutoListen(!enabled);
      setErrorMsg(String(e));
    }
  };

  const discardSession = async () => {
    if (!window.confirm('Discard this intake session? The saved experience will not be created.')) return;
    try {
      await api.abandonSession(sessionId);
      window.location.assign('/');
    } catch (e) {
      setErrorMsg(String(e));
    }
  };

  if (!started) {
    const voiceReady = mode === 'voice' && (deepgramKey || whisperAvailable);
      const hasExistingSession = initialMessages.length > 0;
      return (
        <main style={{ maxWidth: 680, margin: '0 auto', padding: '56px 24px' }}>
        <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Guided intake</p>
        <h1 style={{ fontSize: 26, lineHeight: 1.2, margin: '0 0 12px' }}>
          {hasExistingSession ? 'Resume intake session' : mode === 'voice' ? 'Start a voice intake' : 'Start a text intake'}
        </h1>
        <p style={{ color: '#aaa', marginBottom: 24 }}>
          This local session captures one professional experience. Nothing is saved to memory until you review and confirm the structured fields.
        </p>
        <div style={{ border: '1px solid #2a2a2a', borderRadius: 8, padding: 16, background: '#111', marginBottom: 18 }}>
          <div style={{ color: '#ddd', marginBottom: 8 }}>What happens next</div>
          <div style={{ color: '#888', fontSize: 13, lineHeight: 1.7 }}>
            Capture the story, clarify missing details, review the draft, then save it locally. After saving, return to Claude and say you are done.
          </div>
        </div>
        {mode === 'voice' && !voiceReady && (
          <div style={{ border: '1px solid #5c3b1a', background: '#1a1308', color: '#d1a45f', borderRadius: 8, padding: 12, marginBottom: 18 }}>
            No voice transcription key is available. You can continue with text in this session.
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setStarted(true);
              if (mode === 'voice' && voiceReady && !hasExistingSession) {
                window.setTimeout(() => void startRecordingRef.current?.(), 200);
              }
            }}
            style={{ background: '#1a6b3a', color: '#e8e8e8', border: '1px solid #2d8f52' }}
          >
            {hasExistingSession ? 'Resume session' : mode === 'voice' && voiceReady ? 'Start speaking' : 'Start intake'}
          </button>
          <a href="/" style={{ color: '#777', fontSize: 13 }}>Back</a>
        </div>
        <p style={{ color: '#555', marginTop: 18, fontSize: 12 }}>
          API: {health.ok ? 'Ready' : 'Unavailable'} | Transcription: {voiceStatus(health)}
        </p>
      </main>
    );
  }

  if (status === 'review') {
    const inputStyle = (field: string) => ({
      background: '#111',
      color: '#eee',
      border: `1px solid ${validationErrors[field] ? '#8f3d3d' : '#333'}`,
      borderRadius: 6,
      padding: 8,
    });
    const textAreaStyle = (field: string) => ({
      background: '#111',
      color: '#eee',
      border: `1px solid ${validationErrors[field] ? '#8f3d3d' : '#333'}`,
      borderRadius: 6,
      padding: 10,
      resize: 'vertical' as const,
    });
    const FieldMeta = ({ field }: { field: string }) => (
      <span style={{ color: validationErrors[field] ? '#d77' : '#666', fontSize: 11 }}>
        {validationErrors[field] ?? draft.fieldNotes?.[field] ?? `${confidenceLabel(draft, field)} confidence`}
      </span>
    );
    return (
      <div style={{ maxWidth: 840, margin: '0 auto', padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 20, marginBottom: 6 }}>Review experience</p>
          <p style={{ color: '#888', margin: 0 }}>Confirm the captured memory before saving it locally. Required fields must be complete before saving.</p>
        </div>

        <section style={{ border: '1px solid #242424', borderRadius: 8, padding: 16, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Identity</h2>
            <span style={{ color: '#777', fontSize: 12 }}>{draft.qualityScore?.overall ?? 0}/100 quality</span>
          </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            {fieldLabel('title')} <FieldMeta field="title" />
            <input value={draft.title} onChange={(e) => updateDraft('title', e.target.value)} style={inputStyle('title')} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            {fieldLabel('organization')} <FieldMeta field="organization" />
            <input value={draft.organization} onChange={(e) => updateDraft('organization', e.target.value)} style={inputStyle('organization')} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            {fieldLabel('role')} <FieldMeta field="role" />
            <input value={draft.role} onChange={(e) => updateDraft('role', e.target.value)} style={inputStyle('role')} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            {fieldLabel('role_type')}
            <select value={draft.role_type} onChange={(e) => updateDraft('role_type', e.target.value as ExperienceDraft['role_type'])} style={inputStyle('role_type')}>
              <option value="project">project</option>
              <option value="full-time">full-time</option>
              <option value="internship">internship</option>
              <option value="leadership">leadership</option>
              <option value="research">research</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            {fieldLabel('start_date')} <FieldMeta field="start_date" />
            <input value={draft.start_date} onChange={(e) => updateDraft('start_date', e.target.value)} style={inputStyle('start_date')} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12 }}>
            {fieldLabel('end_date')}
            <input value={draft.end_date ?? ''} onChange={(e) => updateDraft('end_date', e.target.value.trim() || null)} style={inputStyle('end_date')} />
          </label>
        </div>
        </section>

        <section style={{ border: '1px solid #242424', borderRadius: 8, padding: 16, marginBottom: 18 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>STAR story</h2>
        {(['situation', 'task', 'action', 'result'] as const).map((field) => (
          <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12, marginTop: 14 }}>
            {fieldLabel(field)} <FieldMeta field={field} />
            <textarea value={draft[field]} onChange={(e) => updateDraft(field, e.target.value)} rows={field === 'action' ? 5 : 3} style={textAreaStyle(field)} />
          </label>
        ))}
        </section>

        <section style={{ border: '1px solid #242424', borderRadius: 8, padding: 16 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Value signals</h2>
        {(['skills', 'impact_metrics'] as const).map((field) => (
          <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12, marginTop: 14 }}>
            {fieldLabel(field)} <FieldMeta field={field} />
            <textarea value={arrayText(draft[field])} onChange={(e) => updateDraft(field, parseArrayText(e.target.value))} rows={2} style={textAreaStyle(field)} />
          </label>
        ))}
        </section>

        <section style={{ border: '1px solid #242424', borderRadius: 8, padding: 16, marginTop: 18 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Tags and keywords</h2>
        {(['ats_keywords', 'tags'] as const).map((field) => (
          <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6, color: '#aaa', fontSize: 12, marginTop: 14 }}>
            {fieldLabel(field)}
            <textarea value={arrayText(draft[field])} onChange={(e) => updateDraft(field, parseArrayText(e.target.value))} rows={2} style={textAreaStyle(field)} />
          </label>
        ))}
        </section>

        {saveError && (
          <div style={{ color: '#d77', background: '#1c0f0f', border: '1px solid #5c2222', borderRadius: 8, padding: 12, marginTop: 18 }}>
            {saveError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={() => setStatus('idle')} style={{ background: '#181818', color: '#ddd', border: '1px solid #333' }}>
            Back to chat
          </button>
          <button disabled={saving} onClick={() => void saveReviewed()} style={{ background: '#1a6b3a', color: '#e8e8e8', border: '1px solid #2d8f52' }}>
            {saving ? 'Saving...' : 'Save memory'}
          </button>
        </div>
      </div>
    );
  }

  if (status === 'saved') {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <p style={{ fontSize: 20, marginBottom: 8 }}>Experience saved</p>
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
        <a href="/" style={{ display: 'inline-block', marginTop: 24, color: '#aaa' }}>← Back</a>
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
  const step = lifecycle === 'ready_for_review' ? 'Review' : capturedCount >= 4 ? 'Clarify' : 'Capture';
  const voiceAvailable = mode === 'voice' && (deepgramKey || whisperAvailable);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>

      {/* Header */}
      <div style={{ padding: '14px 0 10px', borderBottom: '1px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: '#666' }}>Intake session</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/" style={{ fontSize: 13, color: '#666', textDecoration: 'none' }}>← Back</a>
            <button
              onClick={() => void discardSession()}
              style={{ background: '#181818', color: '#aaa', fontSize: 13, border: '1px solid #333' }}
            >
              Discard
            </button>
            <button
              onClick={handleReview}
              disabled={!draft.readyForReview || status === 'thinking'}
              style={{ background: '#1a6b3a', color: '#e8e8e8', fontSize: 13 }}
            >
              Review
            </button>
          </div>
        </div>

        {/* Status strip */}
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#555', flexWrap: 'wrap', rowGap: 4 }}>
          <span>
            {dot(userStateColor, recording || status === 'thinking')} {userState}
          </span>
          <span>Step: {step}</span>
          <span>{capturedCount}/7 core details captured</span>
          <span>{draft.overallConfidence} confidence</span>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#666', marginTop: 6 }}>
          {['Capture', 'Clarify', 'Review', 'Saved'].map((item) => (
            <span key={item} style={{ color: item === step ? '#ddd' : '#555' }}>
              {item}
            </span>
          ))}
        </div>
        {errorMsg && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#c0392b', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            ✕ {errorMsg}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden', flexWrap: 'wrap', alignContent: 'stretch' }}>
        <aside style={{ flex: '0 1 280px', minWidth: 240, borderRight: '1px solid #222', padding: '16px 16px 16px 0', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Captured draft</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ color: '#777', fontSize: 11, textTransform: 'uppercase' }}>Identity</div>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>Title</div>
              <div style={{ color: draft.title ? '#ddd' : '#555' }}>{draft.title || 'missing'}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>Organization</div>
              <div style={{ color: draft.organization ? '#ddd' : '#555' }}>{draft.organization || 'missing'}</div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>Role</div>
              <div style={{ color: draft.role ? '#ddd' : '#555' }}>{draft.role || 'missing'}</div>
            </div>
            <div style={{ color: '#777', fontSize: 11, textTransform: 'uppercase', marginTop: 6 }}>Story</div>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>STAR progress</div>
              <div style={{ color: '#ddd' }}>
                {['situation', 'task', 'action', 'result'].filter((field) => String(draft[field as keyof ExperienceDraft] ?? '').trim()).length}/4
              </div>
            </div>
            <div>
              <div style={{ color: '#777', fontSize: 11, textTransform: 'uppercase', margin: '6px 0' }}>Value</div>
              <div style={{ color: '#666', fontSize: 11 }}>Skills</div>
              <div style={{ color: draft.skills.length ? '#ddd' : '#555' }}>{draft.skills.length ? draft.skills.slice(0, 4).join(', ') : 'missing'}</div>
            </div>
            <div>
              <div style={{ color: '#777', fontSize: 11, textTransform: 'uppercase', margin: '6px 0' }}>Confidence</div>
              <div style={{ color: '#666', fontSize: 11 }}>Still needed</div>
              <div style={{ color: missingLabels.length ? '#c9a44d' : '#3db85a' }}>
                {draft.missingFields.length ? draft.missingFields.slice(0, 5).map(missingGuidance).join(' ') : 'Ready to review'}
              </div>
            </div>
            <div>
              <div style={{ color: '#666', fontSize: 11 }}>Quality</div>
              <div style={{ color: '#ddd' }}>
                STAR {draft.qualityScore?.star ?? 0} | Metrics {draft.qualityScore?.metrics ?? 0} | Skills {draft.qualityScore?.skills ?? 0}
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
        {wsRecoverable && (
          <div style={{ marginBottom: 8, color: '#d1a45f', fontSize: 12 }}>
            Connection paused. Your transcript is still local. <button onClick={() => setConnectionAttempt((attempt) => attempt + 1)} style={{ marginLeft: 8, padding: '4px 8px', background: '#2a2112', color: '#d1a45f', border: '1px solid #5c3b1a' }}>Reconnect</button>
          </div>
        )}

        {mode === 'voice' && !voiceAvailable && (
          <div style={{ marginBottom: 8, color: '#d1a45f', fontSize: 12 }}>
            Voice transcription is not configured. Text input is safe to use.
          </div>
        )}

        {voiceAvailable && (
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
              {voiceActivated && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#777', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={autoListen}
                    onChange={(event) => void handleAutoListenToggle(event.target.checked)}
                  />
                  auto-listen
                </label>
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
                    : <span style={{ color: '#444' }}>Listening…</span>
                )}
                {voicePhase === 'processing' && (
                  <span style={{ color: '#666' }}>{liveTranscript || 'Processing…'}</span>
                )}
                {voicePhase === 'sent' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {liveTranscript && <span style={{ color: '#ccc' }}>{liveTranscript}</span>}
                    <span style={{ color: '#4caf50', fontSize: 12 }}>Submitted</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={textInputRef}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
            placeholder={recording ? 'Transcribing - stop when done' : 'Type a reply...'}
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
            Send
          </button>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
