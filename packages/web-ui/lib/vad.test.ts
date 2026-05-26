import { describe, it, expect } from 'vitest';
import { tickVAD, initialVADState } from './vad';

const OPTS = { threshold: 15, silenceMs: 1500 };

describe('tickVAD', () => {
  it('does not stop before user has spoken', () => {
    let { state } = tickVAD(initialVADState(), 0, 0, OPTS);
    const result = tickVAD(state, 0, 5000, OPTS);
    expect(result.shouldStop).toBe(false);
  });

  it('marks hasSpoken when amplitude exceeds threshold', () => {
    const result = tickVAD(initialVADState(), 20, 0, OPTS);
    expect(result.state.hasSpoken).toBe(true);
    expect(result.shouldStop).toBe(false);
  });

  it('does not stop during silence shorter than silenceMs', () => {
    let state = initialVADState();
    ({ state } = tickVAD(state, 50, 0, OPTS));
    ({ state } = tickVAD(state, 0, 100, OPTS));
    const result = tickVAD(state, 0, 1100, OPTS);
    expect(result.shouldStop).toBe(false);
  });

  it('triggers stop after silenceMs of silence post-speech', () => {
    let state = initialVADState();
    ({ state } = tickVAD(state, 50, 0, OPTS));
    ({ state } = tickVAD(state, 0, 0, OPTS));
    const result = tickVAD(state, 0, 1500, OPTS);
    expect(result.shouldStop).toBe(true);
  });

  it('resets silence timer when speech resumes mid-silence', () => {
    let state = initialVADState();
    ({ state } = tickVAD(state, 50, 0, OPTS));
    ({ state } = tickVAD(state, 0, 0, OPTS));
    ({ state } = tickVAD(state, 0, 1000, OPTS));
    ({ state } = tickVAD(state, 50, 1000, OPTS)); // speech resumes
    expect(state.silenceStart).toBe(null);
    const result = tickVAD(state, 0, 1700, OPTS); // only 700ms of new silence
    expect(result.shouldStop).toBe(false);
  });
});
