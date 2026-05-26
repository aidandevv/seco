export interface VADOptions {
  threshold: number;
  silenceMs: number;
}

export interface VADState {
  hasSpoken: boolean;
  silenceStart: number | null;
}

export const VAD_DEFAULTS: VADOptions = { threshold: 15, silenceMs: 1500 };

export function initialVADState(): VADState {
  return { hasSpoken: false, silenceStart: null };
}

export function tickVAD(
  state: VADState,
  amplitude: number,
  now: number,
  opts: VADOptions = VAD_DEFAULTS,
): { state: VADState; shouldStop: boolean } {
  if (amplitude > opts.threshold) {
    return { state: { hasSpoken: true, silenceStart: null }, shouldStop: false };
  }
  if (!state.hasSpoken) {
    return { state, shouldStop: false };
  }
  const silenceStart = state.silenceStart ?? now;
  const shouldStop = now - silenceStart >= opts.silenceMs;
  return { state: { ...state, silenceStart }, shouldStop };
}
