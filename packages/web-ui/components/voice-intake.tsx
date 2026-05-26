'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { tickVAD, initialVADState, VAD_DEFAULTS } from '../lib/vad';
import type { VADState } from '../lib/vad';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  sessionId: string;
  initialMessages: Message[];
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
type DgStatus = 'off' | 'ready' | 'active' | 'error';

export function VoiceIntake({ sessionId, initialMessages, deepgramKey, whisperAvailable }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<'idle' | 'thinking' | 'saved'>('idle');
  const [textInput, setTextInput] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [dgStatus, setDgStatus] = useState<DgStatus>(deepgramKey ? 'ready' : 'off');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const deepgramWsRef = useRef<WebSocket | null>(null);
  const serverWsRef = useRef<WebSocket | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef('');
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
    const ws = new WebSocket('ws://localhost:3001/ws');
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
      };

      if (msg.type === 'question') {
        setErrorMsg(null);
        setCurrentQuestion((prev) => prev + (msg.text ?? ''));
      } else if (msg.type === 'question_complete') {
        setMessages((prev) => [...prev, { role: 'assistant', content: msg.text ?? '' }]);
        setCurrentQuestion('');
        // After AI finishes: chime + auto-start mic
        if (deepgramKey || whisperAvailable) {
          setTimeout(() => {
            if (recordingRef.current) return;
            const ctx = audioCtxRef.current;
            if (ctx) { try { chime(ctx); } catch {} }
            void startRecordingRef.current?.();
          }, 350);
        }
      } else if (msg.type === 'status') {
        setStatus(msg.status === 'thinking' ? 'thinking' : 'idle');
      } else if (msg.type === 'error') {
        setStatus('idle');
        setErrorMsg(msg.message ?? 'unknown error');
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
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      transcriptRef.current = '';

      if (deepgramKey) {
        setDgStatus('active');
        const dgWs = new WebSocket(
          `wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&interim_results=true`,
          ['token', deepgramKey]
        );
        deepgramWsRef.current = dgWs;
        dgWs.onerror = () => setDgStatus('error');
        let finalTranscript = '';
        dgWs.onmessage = (e) => {
          const data = JSON.parse(e.data as string) as {
            channel?: { alternatives?: Array<{ transcript: string }> };
            is_final?: boolean;
          };
          const t = data.channel?.alternatives?.[0]?.transcript ?? '';
          if (data.is_final && t) finalTranscript += t + ' ';
          transcriptRef.current = finalTranscript;
        };
        mr.ondataavailable = (e) => {
          if (e.data.size > 0 && dgWs.readyState === WebSocket.OPEN) dgWs.send(e.data);
        };
        mr.start(100);
      } else if (whisperAvailable) {
        let chunkInterval: ReturnType<typeof setInterval>;
        mr.ondataavailable = (e) => chunksRef.current.push(e.data);
        mr.start(5000);
        chunkInterval = setInterval(async () => {
          if (chunksRef.current.length === 0) return;
          const blob = new Blob(chunksRef.current.splice(0), { type: 'audio/webm' });
          try {
            const text = await api.transcribeAudio(blob);
            if (text) transcriptRef.current += text + ' ';
          } catch {}
        }, 5500);
        mr.onstop = () => clearInterval(chunkInterval);
      } else {
        mr.start();
      }

      setRecording(true);

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
    }
  }, [deepgramKey, whisperAvailable, getAudioCtx]);

  useEffect(() => { startRecordingRef.current = startRecording; }, [startRecording]);

  const stopRecording = useCallback(() => {
    if (vadRafRef.current !== null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current?.stop();
    deepgramWsRef.current?.close();
    if (deepgramKey) setDgStatus('ready');
    setTimeout(() => {
      const text = transcriptRef.current.trim();
      if (text) sendUtterance(text);
      transcriptRef.current = '';
    }, 500);
    setRecording(false);
  }, [deepgramKey, sendUtterance]);
  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  const sendText = () => {
    if (!textInput.trim()) return;
    sendUtterance(textInput.trim());
    setTextInput('');
  };

  const handleSave = async () => {
    setStatus('thinking');
    try {
      await api.saveSession(sessionId);
      setStatus('saved');
    } catch (e) {
      setStatus('idle');
      alert(String(e));
    }
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

  if (status === 'saved') {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <p style={{ fontSize: 20, marginBottom: 8 }}>experience saved</p>
        <p style={{ color: '#888' }}>Return to Claude Desktop to browse and render your experiences.</p>
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

  const wsDotColor = wsStatus === 'connected' ? '#3db85a' : wsStatus === 'error' ? '#e84040' : '#666';
  const dgDotColor = dgStatus === 'active' ? '#e84040' : dgStatus === 'error' ? '#e84040' : dgStatus === 'ready' ? '#3db85a' : '#444';
  const dgLabel = dgStatus === 'active' ? 'listening' : dgStatus === 'error' ? 'error' : dgStatus === 'ready' ? 'ready' : '—';

  const turnDotColor = recording ? '#e84040' : status === 'thinking' ? '#e8a840' : wsStatus === 'connected' ? '#3db85a' : '#444';
  const turnLabel = recording ? 'listening' : status === 'thinking' ? 'thinking…' : wsStatus === 'connected' ? 'connected' : 'connecting…';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 640, margin: '0 auto', padding: '0 24px' }}>

      {/* Header */}
      <div style={{ padding: '14px 0 10px', borderBottom: '1px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: '#666' }}>intake session</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/" style={{ fontSize: 13, color: '#666', textDecoration: 'none' }}>← back</a>
            <button
              onClick={() => void handleSave()}
              disabled={messages.length < 4 || status === 'thinking'}
              style={{ background: '#1a6b3a', color: '#e8e8e8', fontSize: 13 }}
            >
              save
            </button>
          </div>
        </div>

        {/* Status strip */}
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#555', flexWrap: 'wrap', rowGap: 4 }}>
          <span title={`server ws: ${wsStatus}`}>
            {dot(wsDotColor)} claude {wsStatus}
          </span>
          {deepgramKey && (
            <span title={`deepgram: ${dgStatus}`}>
              {dot(dgDotColor, dgStatus === 'active')} deepgram {dgLabel}
            </span>
          )}
          <span>
            {dot(turnDotColor, recording || status === 'thinking')} {turnLabel}
          </span>
        </div>
        {errorMsg && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#c0392b', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            ✕ {errorMsg}
          </div>
        )}
      </div>

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
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
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
            {recording && (
              <span style={{ fontSize: 11, color: '#666' }}>
                {deepgramKey ? 'transcribing…' : 'recording…'}
              </span>
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
  );
}
