import { describe, expect, it } from 'vitest';
import { hasCompletionMarker, stripCompletionMarker } from './questions.js';

describe('completion markers', () => {
  it('detects high-confidence completion markers', () => {
    expect(hasCompletionMarker('Great, I have enough now. [COMPLETE]')).toBe(true);
  });

  it('strips completion markers before display', () => {
    expect(stripCompletionMarker('Great, I have enough now. [COMPLETE]')).toBe('Great, I have enough now.');
  });
});
